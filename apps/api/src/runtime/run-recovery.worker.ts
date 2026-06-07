import { RUN_STATUS, TOOL_INVOCATION_STATUS } from '@agent-frame/shared'
import type { RunStore } from './stores/run-store.js'
import type { ToolInvocationRecoveryWorker } from './tool-invocation-recovery.worker.js'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// RunRecoveryWorker — Run 级故障恢复
//
// 扫描 stale 的 queued/running Run：
// - 若有关联 stale ToolInvocation → 委托 ToolInvocationRecoveryWorker
// - 若 Run 无 Tool 悬挂且无活跃进程 → 标记 failed(RUN_RECOVERY_STALE)
//
// 目标 SLO：进程重启后 2 分钟内所有 stale Run 进入终态。
// ============================================================

export type RunRecoveryWorkerOptions = {
  enabled?: boolean
  pollIntervalMs?: number
  staleAfterMs?: number
  batchSize?: number
  runOnStart?: boolean
  resumeRun?: (runId: string) => Promise<boolean>
}

export class RunRecoveryWorker {
  private timer: ReturnType<typeof setInterval> | undefined
  private running = false
  private readonly pollIntervalMs: number
  private readonly staleAfterMs: number
  private readonly batchSize: number
  private readonly enabled: boolean
  private readonly runOnStart: boolean
  private readonly resumeRun?: (runId: string) => Promise<boolean>

  constructor(
    private readonly runStore: RunStore,
    private readonly toolRecoveryWorker: ToolInvocationRecoveryWorker,
    options: RunRecoveryWorkerOptions = {},
  ) {
    this.enabled = options.enabled ?? true
    this.pollIntervalMs = options.pollIntervalMs ?? 30000
    this.staleAfterMs = options.staleAfterMs ?? 120000
    this.batchSize = options.batchSize ?? 20
    this.runOnStart = options.runOnStart ?? true
    this.resumeRun = options.resumeRun
  }

  start(): void {
    if (!this.enabled || this.timer) return
    if (this.runOnStart) {
      this.recoverStaleRuns().catch((err) => {
        logger.error('[RunRecoveryWorker] startup recovery failed', {
          errorCode: err instanceof Error ? err.message : 'RUN_RECOVERY_FAILED',
        })
      })
    }
    this.timer = setInterval(() => {
      this.recoverStaleRuns().catch((err) => {
        logger.error('[RunRecoveryWorker] periodic recovery failed', {
          errorCode: err instanceof Error ? err.message : 'RUN_RECOVERY_FAILED',
        })
      })
    }, this.pollIntervalMs)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  async recoverStaleRuns(): Promise<number> {
    if (this.running) return 0
    this.running = true
    try {
      const staleBefore = new Date(Date.now() - this.staleAfterMs).toISOString()
      const staleRuns = await this.runStore.listStaleRuns({
        staleBefore,
        statuses: [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING],
        limit: this.batchSize,
      })

      let recovered = 0
      for (const run of staleRuns) {
        const ok = await this.recoverOne(run.id)
        if (ok) recovered += 1
      }
      return recovered
    } finally {
      this.running = false
    }
  }

  async recoverOne(runId: string): Promise<boolean> {
    const run = await this.runStore.getRun(runId)
    if (!run) return false
    if (run.status !== RUN_STATUS.QUEUED && run.status !== RUN_STATUS.RUNNING) return false

    const invocations = await this.runStore.listToolInvocations(runId)
    const activeInvocation = invocations.find(
      (item) =>
        item.status === TOOL_INVOCATION_STATUS.RUNNING ||
        item.status === TOOL_INVOCATION_STATUS.WAITING_REPAIR,
    )

    if (activeInvocation) {
      await this.toolRecoveryWorker.recoverOne(activeInvocation)
      const refreshed = await this.runStore.getToolInvocation(activeInvocation.id)
      if (
        refreshed &&
        refreshed.status === TOOL_INVOCATION_STATUS.SUCCEEDED
      ) {
        await this.tryResumeOrFail(runId, 'Run recovered via tool replay and resumed.')
        return true
      }
      if (
        refreshed &&
        (refreshed.status === TOOL_INVOCATION_STATUS.FAILED ||
          refreshed.status === TOOL_INVOCATION_STATUS.TIMED_OUT)
      ) {
        await this.runStore.updateRunStatus(runId, RUN_STATUS.FAILED, {
          error: {
            code: 'RUN_RECOVERY_TOOL_TERMINAL',
            message: `Run recovered via tool replay; tool ended with status ${refreshed.status}.`,
          },
        })
        return true
      }
      return true
    }

    return this.tryResumeOrFail(runId, 'Run had no active ToolInvocation and was resumed from persisted input.')
  }

  private async tryResumeOrFail(runId: string, message: string): Promise<boolean> {
    if (this.resumeRun) {
      const resumed = await this.resumeRun(runId)
      if (resumed) {
        logger.warn('[RunRecoveryWorker] Resumed stale run', { runId, message })
        return true
      }
    }

    await this.runStore.updateRunStatus(runId, RUN_STATUS.FAILED, {
      error: {
        code: 'RUN_RECOVERY_STALE',
        message: 'Run became stale after process restart and no resume callback accepted it.',
      },
    })
    logger.warn('[RunRecoveryWorker] Marked stale run as failed', { runId })
    return true
  }
}

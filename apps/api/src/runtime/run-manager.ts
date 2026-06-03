import type { Run, AgentInput, AgentOutput } from '@agent-frame/shared'
import { EVENT_TYPES, RUN_STATUS } from '@agent-frame/shared'
import type { RunStore } from './stores/run-store.js'
import { RunEventEmitter } from './event-emitter.js'
import { cancellationManager } from './cancellation.js'
import { generateRunId, generateTraceId, now } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'
import { AppError } from '../shared/errors/app-error.js'
import { env } from '../shared/config/env.js'
import { runScheduler } from './scheduler.js'

// ============================================================
// RunContext — 单次 Run 的执行上下文
// ============================================================
export type RunContext = {
  runId: string
  traceId: string
  userId?: string
  signal: AbortSignal
  depth: number        // 当前 A2A 调用深度
  callCount: number    // 当前 Run 总 A2A 调用次数
  totalCostUsd: number // 当前 Run 累计估算成本（USD），用于 costBudget 检查
}

// ============================================================
// RunManager — Run 生命周期核心管理器
// ============================================================

export type CreateRunOptions = {
  input: unknown
  agentId?: string
  userId?: string
  projectId?: string
  sessionId?: string
}

export type AgentExecutor = {
  agentId: string
  execute(input: AgentInput, context: RunContext): Promise<AgentOutput>
}

export class RunManager {
  private activeContexts = new Map<string, RunContext>()
  private emitter: RunEventEmitter

  constructor(
    private store: RunStore,
    private executor?: AgentExecutor,
  ) {
    this.emitter = new RunEventEmitter(store)
  }

  setExecutor(executor: AgentExecutor) {
    this.executor = executor
  }

  async createRun(options: CreateRunOptions): Promise<Run> {
    const runId = generateRunId()
    const traceId = generateTraceId()

    // 队列满了时快速失败（Scheduler 会在 maxQueueSize 超出时 reject）
    const run = await this.store.createRun({
      id: runId,
      traceId,
      userId: options.userId,
      projectId: options.projectId,
      agentId: options.agentId,
      sessionId: options.sessionId,
      input: options.input,
    })

    const signal = cancellationManager.create(runId)
    const context: RunContext = { runId, traceId, userId: options.userId, signal, depth: 0, callCount: 0, totalCostUsd: 0 }
    this.activeContexts.set(runId, context)

    logger.info('[RunManager] Run created', { runId, traceId, agentId: options.agentId })

    // 发出 run.started 事件
    await this.emitter.emit({ type: EVENT_TYPES.RUN_STARTED, runId, agentId: options.agentId, timestamp: now() })

    // 通过 Scheduler 执行（优先级队列 + 并发控制）
    runScheduler
      .schedule(() => this.executeRun(run, context, options), {
        id: runId,
        priority: 5,
        waitTimeoutMs: env.RUN_TIMEOUT_MS,
      })
      .catch((err) => {
        logger.error('[RunManager] Scheduler rejected run', {
          runId,
          traceId,
          errorCode: err instanceof Error ? err.message : 'SCHEDULER_ERROR',
        })
        // 调度器超时 → 直接标记 Run 失败
        this.store.updateRunStatus(runId, RUN_STATUS.FAILED).catch(() => {})
      })

    return run
  }

  private async executeRun(run: Run, context: RunContext, options: CreateRunOptions): Promise<void> {
    const { runId, traceId } = context

    await this.store.updateRunStatus(runId, RUN_STATUS.RUNNING)

    // 超时控制
    const timeout = setTimeout(() => {
      cancellationManager.cancel(runId, 'timeout')
    }, env.RUN_TIMEOUT_MS)

    try {
      if (!this.executor) {
        throw new AppError('INTERNAL_ERROR', 'No agent executor configured')
      }

      const agentInput: AgentInput = {
        runId,
        traceId,
        userId: options.userId,
        projectId: options.projectId,
        sessionId: options.sessionId,
        payload: options.input,
        signal: context.signal,
      }

      const result = await this.executor.execute(agentInput, context)

      await this.store.updateRunStatus(runId, RUN_STATUS.COMPLETED, { output: result.output })
      await this.emitter.emit({ type: EVENT_TYPES.RUN_COMPLETED, runId, agentId: this.executor.agentId, timestamp: now() })

      logger.info('[RunManager] Run completed', { runId, traceId })
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'

      if (isAbort) {
        await this.store.updateRunStatus(runId, RUN_STATUS.CANCELLED)
        await this.emitter.emit({ type: EVENT_TYPES.RUN_CANCELLED, runId, reason: 'cancelled by user', timestamp: now() })
        logger.info('[RunManager] Run cancelled', { runId, traceId })
      } else {
        const appErr = err instanceof AppError ? err : new AppError('INTERNAL_ERROR', String(err))
        await this.store.updateRunStatus(runId, RUN_STATUS.FAILED, {
          error: { code: appErr.code, message: appErr.message },
        })
        await this.emitter.emit({
          type: EVENT_TYPES.RUN_FAILED,
          runId,
          reason: appErr.message,
          errorCode: appErr.code,
          timestamp: now(),
        })
        logger.error('[RunManager] Run failed', { runId, traceId, errorCode: appErr.code })
      }
    } finally {
      clearTimeout(timeout)
      this.activeContexts.delete(runId)
      cancellationManager.cleanup(runId)
    }
  }

  async cancelRun(runId: string): Promise<boolean> {
    const cancelled = cancellationManager.cancel(runId, 'user_cancel')
    if (!cancelled) return false
    logger.info('[RunManager] Run cancellation requested', { runId })
    return true
  }

  getContext(runId: string): RunContext | undefined {
    return this.activeContexts.get(runId)
  }

  async getRun(runId: string): Promise<Run | null> {
    return this.store.getRun(runId)
  }

  async listEvents(runId: string) {
    return this.store.listEvents(runId)
  }

  getEmitter(): RunEventEmitter {
    return this.emitter
  }
}

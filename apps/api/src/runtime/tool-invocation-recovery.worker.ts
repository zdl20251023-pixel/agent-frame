import {
  TOOL_INVOCATION_PHASE,
  TOOL_INVOCATION_STATUS,
  type ToolInvocation,
} from '@agent-frame/shared'
import type { ArtifactStore, CreateArtifactInput } from '../artifacts/artifact-store.js'
import type { RunStore } from './stores/run-store.js'
import { generateVersionId, now } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// ToolInvocationRecoveryWorker — Tool 执行恢复器
//
// 设计原则：
// - ToolInvocation 是状态源；AgentEvent 只是前端投影。
// - artifact_write 阶段必须可幂等补偿，避免 Artifact 写入中断后永久 running。
// - 暂不能安全重放的阶段标记 timed_out，避免状态悬挂。
// ============================================================

type ArtifactCreateRecoveryPayload = {
  kind: 'create_artifact_with_version'
  artifactInput: Omit<CreateArtifactInput, 'id'>
  content: unknown
  context: {
    runId: string
    stepId?: string
    agentId?: string
    idempotencyKey?: string
  }
}

type ArtifactPatchRecoveryPayload = {
  kind: 'create_artifact_version'
  artifactId: string
  baseVersionId: string
  content: unknown
  context: {
    runId: string
    stepId?: string
    agentId?: string
  }
  diffSummary?: string
}

type RecoveryPayload = ArtifactCreateRecoveryPayload | ArtifactPatchRecoveryPayload

export type ToolInvocationRecoveryWorkerOptions = {
  enabled?: boolean
  pollIntervalMs?: number
  staleAfterMs?: number
  batchSize?: number
  runOnStart?: boolean
}

export class ToolInvocationRecoveryWorker {
  private timer: ReturnType<typeof setInterval> | undefined
  private running = false
  private readonly pollIntervalMs: number
  private readonly staleAfterMs: number
  private readonly batchSize: number
  private readonly enabled: boolean
  private readonly runOnStart: boolean

  constructor(
    private readonly runStore: RunStore,
    private readonly artifactStore: ArtifactStore,
    options: ToolInvocationRecoveryWorkerOptions = {},
  ) {
    this.enabled = options.enabled ?? true
    this.pollIntervalMs = options.pollIntervalMs ?? 30000
    this.staleAfterMs = options.staleAfterMs ?? 120000
    this.batchSize = options.batchSize ?? 20
    this.runOnStart = options.runOnStart ?? true
  }

  start(): void {
    if (!this.enabled || this.timer) return
    if (this.runOnStart) {
      this.recoverStaleInvocations().catch((err) => {
        logger.error('[ToolInvocationRecoveryWorker] startup recovery failed', {
          errorCode: err instanceof Error ? err.message : 'RECOVERY_FAILED',
        })
      })
    }
    this.timer = setInterval(() => {
      this.recoverStaleInvocations().catch((err) => {
        logger.error('[ToolInvocationRecoveryWorker] periodic recovery failed', {
          errorCode: err instanceof Error ? err.message : 'RECOVERY_FAILED',
        })
      })
    }, this.pollIntervalMs)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  async recoverStaleInvocations(): Promise<number> {
    if (this.running) return 0
    this.running = true
    try {
      const staleBefore = new Date(Date.now() - this.staleAfterMs).toISOString()
      const invocations = await this.runStore.listRecoverableToolInvocations({
        staleBefore,
        limit: this.batchSize,
      })

      let recovered = 0
      for (const invocation of invocations) {
        const ok = await this.recoverOne(invocation)
        if (ok) recovered += 1
      }
      return recovered
    } finally {
      this.running = false
    }
  }

  async recoverOne(invocation: ToolInvocation): Promise<boolean> {
    if (invocation.phase === TOOL_INVOCATION_PHASE.ARTIFACT_WRITE) {
      return this.recoverArtifactWrite(invocation)
    }

    await this.runStore.updateToolInvocation(invocation.id, {
      status: TOOL_INVOCATION_STATUS.TIMED_OUT,
      errorCode: 'TOOL_INVOCATION_STALE',
      errorMessage: `Tool invocation became stale at phase "${invocation.phase}" and cannot be safely replayed yet.`,
      finishedAt: now(),
    })
    return true
  }

  private async recoverArtifactWrite(invocation: ToolInvocation): Promise<boolean> {
    if (invocation.outputRef) {
      const artifact = await this.artifactStore.getArtifact(invocation.outputRef)
      if (artifact) {
        await this.runStore.updateToolInvocation(invocation.id, {
          status: TOOL_INVOCATION_STATUS.SUCCEEDED,
          phase: TOOL_INVOCATION_PHASE.COMPLETED,
          finishedAt: now(),
        })
        return true
      }
    }

    const payload = parseRecoveryPayload(invocation.recoveryPayload)
    if (!payload) {
      await this.runStore.updateToolInvocation(invocation.id, {
        status: TOOL_INVOCATION_STATUS.FAILED,
        errorCode: 'RECOVERY_PAYLOAD_MISSING',
        errorMessage: 'Cannot recover artifact_write without recoveryPayload.',
        finishedAt: now(),
      })
      return true
    }

    const artifactId = payload.kind === 'create_artifact_with_version'
      ? await this.recoverCreateArtifact(payload)
      : await this.recoverCreateVersion(payload)

    await this.runStore.updateToolInvocation(invocation.id, {
      status: TOOL_INVOCATION_STATUS.SUCCEEDED,
      phase: TOOL_INVOCATION_PHASE.COMPLETED,
      outputRef: artifactId,
      finishedAt: now(),
    })
    return true
  }

  private async recoverCreateArtifact(payload: ArtifactCreateRecoveryPayload): Promise<string> {
    const { artifact } = await this.artifactStore.createArtifactWithVersion(
      payload.artifactInput,
      payload.content,
      payload.context,
    )
    return artifact.id
  }

  private async recoverCreateVersion(payload: ArtifactPatchRecoveryPayload): Promise<string> {
    const versions = await this.artifactStore.listVersions(payload.artifactId)
    const existing = versions.find((version) =>
      version.createdByStepId === payload.context.stepId &&
      version.parentVersionId === payload.baseVersionId
    )
    if (existing) {
      await this.artifactStore.setCurrentVersion(payload.artifactId, existing.id)
      return payload.artifactId
    }

    const nextVersion = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1
    const version = await this.artifactStore.createVersion({
      id: generateVersionId(),
      artifactId: payload.artifactId,
      version: nextVersion,
      content: payload.content,
      createdByRunId: payload.context.runId,
      createdByStepId: payload.context.stepId,
      createdByAgentId: payload.context.agentId,
      parentVersionId: payload.baseVersionId,
      diffSummary: payload.diffSummary,
    })
    await this.artifactStore.setCurrentVersion(payload.artifactId, version.id)
    return payload.artifactId
  }
}

function parseRecoveryPayload(value: unknown): RecoveryPayload | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as { kind?: unknown }
  if (raw.kind === 'create_artifact_with_version' || raw.kind === 'create_artifact_version') {
    return value as RecoveryPayload
  }
  return undefined
}

import { createHash } from 'node:crypto'
import type { ToolInvocation } from '@agent-frame/shared'
import {
  TOOL_INVOCATION_PHASE,
  TOOL_INVOCATION_STATUS,
} from '@agent-frame/shared'
import type { RunStore } from './stores/run-store.js'
import type { ArtifactStore } from '../artifacts/artifact-store.js'
import { toolReplayRegistry } from './tool-replay.registry.js'
import { logger } from '../shared/observability/logger.js'
import { generateVersionId, now } from '../shared/utils/id.js'

// ============================================================
// ToolInvocationRecoveryWorker — Tool 执行恢复器（全 phase 策略）
//
// phase 恢复策略：
// - pre_parse_autofix / schema_validate / simulate_hand → 幂等重放 Tool
// - inner_repair → 标记 waiting_repair，交给 RepairWorker
// - artifact_write → 幂等补写 Artifact
// - waiting_repair → 不处理，交给 NlToHandRepairWorker
// - 其他不可安全重放 → timed_out
// ============================================================

type ArtifactCreateRecoveryPayload = {
  kind: 'create_artifact_with_version'
  artifactInput: Record<string, unknown>
  content: unknown
  context: Record<string, unknown>
}

type ArtifactPatchRecoveryPayload = {
  kind: 'create_artifact_version'
  artifactId: string
  baseVersionId: string
  content: unknown
  context: Record<string, unknown>
  diffSummary?: string
}

type ToolReplayRecoveryPayload = {
  kind: 'replay_tool'
  toolName: string
  toolInput: unknown
  innerRepairMode?: 'disabled' | 'inner_repair'
}

type RecoveryPayload =
  | ArtifactCreateRecoveryPayload
  | ArtifactPatchRecoveryPayload
  | ToolReplayRecoveryPayload

/** 可确定性重放的 Tool phase */
const REPLAYABLE_PHASES = new Set<string>([
  TOOL_INVOCATION_PHASE.PRE_PARSE_AUTOFIX,
  TOOL_INVOCATION_PHASE.SCHEMA_VALIDATE,
  TOOL_INVOCATION_PHASE.SIMULATE_HAND,
  TOOL_INVOCATION_PHASE.CREATED,
])

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
    if (invocation.status === TOOL_INVOCATION_STATUS.WAITING_REPAIR) {
      return false
    }

    if (invocation.phase === TOOL_INVOCATION_PHASE.INNER_REPAIR) {
      await this.runStore.updateToolInvocation(invocation.id, {
        status: TOOL_INVOCATION_STATUS.WAITING_REPAIR,
        heartbeatAt: now(),
      })
      return true
    }

    if (invocation.phase === TOOL_INVOCATION_PHASE.ARTIFACT_WRITE) {
      return this.recoverArtifactWrite(invocation)
    }

    if (REPLAYABLE_PHASES.has(invocation.phase)) {
      return this.recoverToolReplay(invocation)
    }

    await this.runStore.updateToolInvocation(invocation.id, {
      status: TOOL_INVOCATION_STATUS.TIMED_OUT,
      errorCode: 'TOOL_INVOCATION_STALE',
      errorMessage: `Tool invocation became stale at phase "${invocation.phase}" and cannot be safely replayed.`,
      finishedAt: now(),
    })
    return true
  }

  private async recoverToolReplay(invocation: ToolInvocation): Promise<boolean> {
    const payload = parseRecoveryPayload(invocation.recoveryPayload)
    if (!payload || payload.kind !== 'replay_tool') {
      const step = await this.runStore.getStep(invocation.stepId)
      const rawInput = step?.input && typeof step.input === 'object'
        ? (step.input as { rawInput?: unknown }).rawInput
        : undefined
      if (!rawInput) {
        await this.markTimedOut(invocation, 'TOOL_INVOCATION_STALE')
        return true
      }
      const inputHash = hashUnknown(rawInput)
      if (inputHash !== invocation.inputHash) {
        await this.markTimedOut(invocation, 'INPUT_HASH_MISMATCH')
        return true
      }
      const replayed = await toolReplayRegistry.replay(invocation.toolName, rawInput, {
        innerRepairMode: 'disabled',
      })
      if (!replayed.ok) {
        await this.runStore.updateToolInvocation(invocation.id, {
          status: TOOL_INVOCATION_STATUS.FAILED,
          phase: TOOL_INVOCATION_PHASE.COMPLETED,
          errorCode: replayed.errorCode ?? 'TOOL_REPLAY_FAILED',
          errorMessage: replayed.errorMessage,
          finishedAt: now(),
          retryCount: invocation.retryCount + 1,
        })
        return true
      }
      await this.runStore.updateToolInvocation(invocation.id, {
        status: TOOL_INVOCATION_STATUS.SUCCEEDED,
        phase: TOOL_INVOCATION_PHASE.COMPLETED,
        finishedAt: now(),
        retryCount: invocation.retryCount + 1,
      })
      return true
    }

    const inputHash = hashUnknown(payload.toolInput)
    if (inputHash !== invocation.inputHash) {
      await this.markTimedOut(invocation, 'INPUT_HASH_MISMATCH')
      return true
    }

    const replayed = await toolReplayRegistry.replay(
      payload.toolName,
      payload.toolInput,
      { innerRepairMode: payload.innerRepairMode ?? 'disabled' },
    )
    if (!replayed.ok) {
      await this.runStore.updateToolInvocation(invocation.id, {
        status: TOOL_INVOCATION_STATUS.FAILED,
        phase: TOOL_INVOCATION_PHASE.COMPLETED,
        errorCode: replayed.errorCode ?? 'TOOL_REPLAY_FAILED',
        errorMessage: replayed.errorMessage,
        finishedAt: now(),
        retryCount: invocation.retryCount + 1,
      })
      return true
    }

    await this.runStore.updateToolInvocation(invocation.id, {
      status: TOOL_INVOCATION_STATUS.SUCCEEDED,
      phase: TOOL_INVOCATION_PHASE.COMPLETED,
      finishedAt: now(),
      retryCount: invocation.retryCount + 1,
    })
    return true
  }

  private async markTimedOut(invocation: ToolInvocation, errorCode: string): Promise<void> {
    await this.runStore.updateToolInvocation(invocation.id, {
      status: TOOL_INVOCATION_STATUS.TIMED_OUT,
      errorCode,
      errorMessage: `Cannot recover tool invocation at phase "${invocation.phase}".`,
      finishedAt: now(),
    })
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
    if (!payload || payload.kind === 'replay_tool') {
      await this.runStore.updateToolInvocation(invocation.id, {
        status: TOOL_INVOCATION_STATUS.FAILED,
        errorCode: 'RECOVERY_PAYLOAD_MISSING',
        errorMessage: 'Cannot recover artifact_write without recoveryPayload.',
        finishedAt: now(),
      })
      return true
    }

    const artifactId = payload.kind === 'create_artifact_with_version'
      ? await this.recoverCreateArtifact(payload as ArtifactCreateRecoveryPayload)
      : await this.recoverCreateVersion(payload as ArtifactPatchRecoveryPayload)

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
      payload.artifactInput as Parameters<ArtifactStore['createArtifactWithVersion']>[0],
      payload.content,
      payload.context as Parameters<ArtifactStore['createArtifactWithVersion']>[2],
    )
    return artifact.id
  }

  private async recoverCreateVersion(payload: ArtifactPatchRecoveryPayload): Promise<string> {
    const versions = await this.artifactStore.listVersions(payload.artifactId)
    const context = payload.context as { stepId?: string }
    const existing = versions.find(
      (version) =>
        version.createdByStepId === context.stepId &&
        version.parentVersionId === payload.baseVersionId,
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
      createdByRunId: String(payload.context.runId ?? ''),
      createdByStepId: context.stepId,
      createdByAgentId: String(payload.context.agentId ?? ''),
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
  if (
    raw.kind === 'create_artifact_with_version' ||
    raw.kind === 'create_artifact_version' ||
    raw.kind === 'replay_tool'
  ) {
    return value as RecoveryPayload
  }
  return undefined
}

function hashUnknown(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex')
}

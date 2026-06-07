import {
  EVENT_TYPES,
  TOOL_INVOCATION_PHASE,
  TOOL_INVOCATION_STATUS,
  type ArtifactVersion,
} from '@agent-frame/shared'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import { artifactVersionCreatedEvent } from '../../artifacts/artifact-events.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import { agentTaskStore, type AgentTask } from '../../queues/agent-task.store.js'
import { generateVersionId, now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'
import { pokerPromptProvider } from './poker-prompt-provider.js'
import { createNlToHandTool } from './tool_nl_to_hand.js'
import { SessionsRepository } from '../sessions/sessions.repository.js'
import {
  NL_TO_HAND_INNER_REPAIR_AGENT_ID,
  NL_TO_HAND_INNER_REPAIR_TASK_TYPE,
} from './nl-to-hand-async.constants.js'
import { NL_TO_HAND_AGENT_ID } from '../../ai/agents/agent-ids.js'
import { emitSessionEvent } from '../sessions/session-event-emitter.js'

// ============================================================
// NlToHandRepairWorker — 自然语言转牌谱内层修复异步 Worker
//
// 同步 Run 只负责 baseline 校验和 draft 写入；耗时、易超时的内层
// LLM 修复由本 Worker 消费 agent_tasks 后台完成。
// ============================================================

type NlToHandRepairTaskInput = {
  type: typeof NL_TO_HAND_INNER_REPAIR_TASK_TYPE
  runId: string
  sessionId?: string
  userMessage: string
  toolInput: unknown
  draftArtifactId: string
  draftVersionId: string
  toolInvocationId: string
}

export type NlToHandRepairWorkerOptions = {
  enabled?: boolean
  pollIntervalMs?: number
  batchSize?: number
}

export class NlToHandRepairWorker {
  private timer: ReturnType<typeof setInterval> | undefined
  private running = false
  private readonly emitter: RunEventEmitter

  constructor(
    private readonly runStore: RunStore,
    private readonly artifactStore: ArtifactStore,
    private readonly sessionsRepository: SessionsRepository,
    private readonly options: NlToHandRepairWorkerOptions = {},
  ) {
    this.emitter = new RunEventEmitter(runStore)
  }

  start(): void {
    if (this.options.enabled === false || this.timer) return
    const interval = this.options.pollIntervalMs ?? 3000
    this.timer = setInterval(() => {
      this.processNextBatch().catch((err) => {
        logger.error('[NlToHandRepairWorker] batch failed', {
          errorCode: err instanceof Error ? err.message : 'NL_TO_HAND_REPAIR_WORKER_FAILED',
        })
      })
    }, interval)
    logger.info('[NlToHandRepairWorker] Worker started', { pollIntervalMs: interval })
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  async processNextBatch(): Promise<number> {
    if (this.running) return 0
    this.running = true
    try {
      const tasks = await agentTaskStore.claimNextPending(this.options.batchSize ?? 1, {
        toAgentId: NL_TO_HAND_INNER_REPAIR_AGENT_ID,
      })
      await Promise.all(tasks.map((task) => this.processTask(task)))
      return tasks.length
    } finally {
      this.running = false
    }
  }

  private async processTask(task: AgentTask): Promise<void> {
    const input = parseTaskInput(task.input)
    if (!input) {
      await agentTaskStore.markFailed(task.id, {
        code: 'INVALID_REPAIR_TASK_INPUT',
        message: 'Invalid nl_to_hand repair task input.',
      })
      return
    }

    try {
      if (input.sessionId) {
        await emitSessionEvent(input.sessionId, {
          type: EVENT_TYPES.AGENT_TASK_STARTED,
          runId: input.runId,
          sessionId: input.sessionId,
          taskId: task.id,
          toAgentId: task.toAgentId,
          retryCount: task.retryCount,
          timestamp: now(),
        })
      }

      await this.runStore.updateToolInvocation(input.toolInvocationId, {
        status: TOOL_INVOCATION_STATUS.RUNNING,
        phase: TOOL_INVOCATION_PHASE.INNER_REPAIR,
        heartbeatAt: now(),
      })

      const sdkTool = createNlToHandTool({
        promptProvider: pokerPromptProvider,
        messages: [],
        innerRepairMode: 'inner_repair',
        includeFinalHandJson: true,
      }) as unknown as { execute: (input: unknown) => Promise<unknown> }

      const toolOutput = await sdkTool.execute(input.toolInput)
      const outputText = typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput)
      const repairedGameHand = parseFinalHandJson(outputText)
      if (!outputText.startsWith('合法') || !repairedGameHand) {
        await this.runStore.updateToolInvocation(input.toolInvocationId, {
          status: TOOL_INVOCATION_STATUS.FAILED,
          phase: TOOL_INVOCATION_PHASE.INNER_REPAIR,
          errorCode: 'INNER_REPAIR_FAILED',
          errorMessage: outputText.slice(0, 1000),
          finishedAt: now(),
        })
        await agentTaskStore.markFailed(task.id, {
          code: 'INNER_REPAIR_FAILED',
          message: outputText.slice(0, 1000),
        })
        if (input.sessionId) {
          await emitSessionEvent(input.sessionId, {
            type: EVENT_TYPES.AGENT_TASK_FAILED,
            runId: input.runId,
            sessionId: input.sessionId,
            taskId: task.id,
            toAgentId: task.toAgentId,
            error: { code: 'INNER_REPAIR_FAILED', message: outputText.slice(0, 1000) },
            retryCount: task.retryCount,
            timestamp: now(),
          })
        }
        return
      }

      const version = await this.appendRepairedVersion(input, repairedGameHand, outputText)
      await this.runStore.updateToolInvocation(input.toolInvocationId, {
        status: TOOL_INVOCATION_STATUS.SUCCEEDED,
        phase: TOOL_INVOCATION_PHASE.COMPLETED,
        outputRef: input.draftArtifactId,
        finishedAt: now(),
      })
      await agentTaskStore.markCompleted(task.id, {
        artifactId: input.draftArtifactId,
        versionId: version.id,
      })

      await this.emitter.emit(artifactVersionCreatedEvent({
        runId: input.runId,
        artifactId: input.draftArtifactId,
        versionId: version.id,
        version: version.version,
      }))

      if (input.sessionId) {
        await this.sessionsRepository.updateActiveHandHistory(input.sessionId, {
          artifactId: input.draftArtifactId,
          versionId: version.id,
          status: 'valid',
          updatedByRunId: input.runId,
        })
        await emitSessionEvent(input.sessionId, {
          type: EVENT_TYPES.AGENT_TASK_COMPLETED,
          runId: input.runId,
          sessionId: input.sessionId,
          taskId: task.id,
          toAgentId: task.toAgentId,
          outputPreview: `已生成 v${version.version}`,
          timestamp: now(),
        })
        await emitSessionEvent(input.sessionId, {
          type: EVENT_TYPES.ARTIFACT_REPAIR_COMPLETED,
          runId: input.runId,
          sessionId: input.sessionId,
          artifactId: input.draftArtifactId,
          versionId: version.id,
          version: version.version,
          success: true,
          diffSummary: '后台内层修复生成合法牌谱',
          timestamp: now(),
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.runStore.updateToolInvocation(input.toolInvocationId, {
        status: TOOL_INVOCATION_STATUS.FAILED,
        phase: TOOL_INVOCATION_PHASE.INNER_REPAIR,
        errorCode: 'INNER_REPAIR_EXCEPTION',
        errorMessage: message,
        finishedAt: now(),
      })
      await agentTaskStore.markFailed(task.id, {
        code: 'INNER_REPAIR_EXCEPTION',
        message,
      }, true)
      if (input?.sessionId) {
        await emitSessionEvent(input.sessionId, {
          type: EVENT_TYPES.AGENT_TASK_FAILED,
          runId: input.runId,
          sessionId: input.sessionId,
          taskId: task.id,
          toAgentId: task.toAgentId,
          error: { code: 'INNER_REPAIR_EXCEPTION', message },
          retryCount: task.retryCount + 1,
          timestamp: now(),
        })
      }
    }
  }

  private async appendRepairedVersion(
    input: NlToHandRepairTaskInput,
    repairedGameHand: unknown,
    toolOutputText: string,
  ): Promise<ArtifactVersion> {
    const versions = await this.artifactStore.listVersions(input.draftArtifactId)
    const existing = versions.find((version) =>
      version.parentVersionId === input.draftVersionId &&
      version.createdByAgentId === NL_TO_HAND_AGENT_ID
    )
    if (existing) {
      await this.artifactStore.setCurrentVersion(input.draftArtifactId, existing.id)
      return existing
    }

    const baseVersion = await this.artifactStore.getVersion(input.draftVersionId)
    const baseContent = baseVersion?.content && typeof baseVersion.content === 'object'
      ? baseVersion.content as Record<string, unknown>
      : {}
    const nextVersion = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1
    const version = await this.artifactStore.createVersion({
      id: generateVersionId(),
      artifactId: input.draftArtifactId,
      version: nextVersion,
      content: {
        ...baseContent,
        gameHand: repairedGameHand,
        validation: { ok: true, code: 'OK', message: '后台内层修复成功' },
        handHistoryState: {
          ...(typeof baseContent.handHistoryState === 'object' ? baseContent.handHistoryState : {}),
          status: 'valid',
          asyncRepair: true,
          baseVersionId: input.draftVersionId,
        },
        toolResultText: toolOutputText,
        repairedBy: {
          taskType: NL_TO_HAND_INNER_REPAIR_TASK_TYPE,
          agentId: NL_TO_HAND_AGENT_ID,
          repairedAt: now(),
        },
      },
      createdByRunId: input.runId,
      createdByAgentId: NL_TO_HAND_AGENT_ID,
      parentVersionId: input.draftVersionId,
      diffSummary: '后台内层修复生成合法牌谱',
    })
    await this.artifactStore.setCurrentVersion(input.draftArtifactId, version.id)
    return version
  }
}

function parseTaskInput(input: unknown): NlToHandRepairTaskInput | undefined {
  if (!input || typeof input !== 'object') return undefined
  const raw = input as Partial<NlToHandRepairTaskInput>
  if (
    raw.type !== NL_TO_HAND_INNER_REPAIR_TASK_TYPE ||
    typeof raw.runId !== 'string' ||
    typeof raw.userMessage !== 'string' ||
    typeof raw.draftArtifactId !== 'string' ||
    typeof raw.draftVersionId !== 'string' ||
    typeof raw.toolInvocationId !== 'string'
  ) {
    return undefined
  }
  return raw as NlToHandRepairTaskInput
}

function parseFinalHandJson(outputText: string): unknown | undefined {
  const match = outputText.match(/\[最终牌谱JSON\]\s*([^\n]+)/)
  if (!match?.[1]) return undefined
  try {
    return JSON.parse(match[1])
  } catch {
    return undefined
  }
}

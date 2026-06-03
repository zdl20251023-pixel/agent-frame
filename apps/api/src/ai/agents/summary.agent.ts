import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import { EVENT_TYPES, STEP_TYPES, ARTIFACT_TYPES, MODEL_STREAM_EVENT_TYPES } from '@agent-frame/shared'
import type { ModelClient } from '../model-client/model-client.js'
import type { RunContext } from '../../runtime/run-manager.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import { StepManager } from '../../runtime/step-manager.js'
import { artifactCreatedEvent, artifactVersionCreatedEvent } from '../../artifacts/artifact-events.js'
import { SUMMARY_AGENT_ID } from './agent-ids.js'
import { SUMMARY_SYSTEM, summaryPrompt } from '../prompts/index.js'
import { now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'


// ============================================================
// SummaryAgent — 专业 Agent：内容总结 + 写入 Artifact
// ============================================================

export { SUMMARY_AGENT_ID }

export class SummaryAgent {
  readonly agentId = SUMMARY_AGENT_ID
  private stepManager: StepManager

  constructor(
    private modelClient: ModelClient,
    private store: RunStore,
    private artifactStore: ArtifactStore,
  ) {
    this.stepManager = new StepManager(store)
  }

  async execute(
    input: AgentInput<{ content: string; maxLength?: number }>,
    context: RunContext,
  ): Promise<AgentOutput<{ summary: string; artifactId?: string }>> {
    const { runId, stepId, traceId, payload } = input
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)

    log.info('[SummaryAgent] Starting summary', { contentLength: payload.content.length })

    // ─── 创建 model_call Step ────────────────────────────────
    const modelStep = await this.stepManager.startStep({
      runId,
      type: STEP_TYPES.MODEL_CALL,
      agentId: this.agentId,
      input: { model: 'fast.chat', purpose: 'summary' },
    })

    let fullText = ''

    try {
      for await (const event of this.modelClient.stream({
        model: 'fast.chat',
        system: SUMMARY_SYSTEM,
        prompt: summaryPrompt(payload.content),
        maxTokens: 512,
        metadata: { runId, agentId: this.agentId, traceId, stepId: modelStep.id },
      })) {
        if (event.type === MODEL_STREAM_EVENT_TYPES.TEXT_DELTA) {
          fullText += event.delta
          await emitter.emit({
            type: EVENT_TYPES.MESSAGE_DELTA,
            runId,
            agentId: this.agentId,
            delta: event.delta,
            timestamp: now(),
          })
          if (input.signal?.aborted) break
        }
      }

      await this.stepManager.completeStep(modelStep.id, { summaryLength: fullText.length })
    } catch (err) {
      await this.stepManager.failStep(modelStep.id, err)
      log.error('[SummaryAgent] Model call failed', { errorCode: 'MODEL_CALL_FAILED' })
    }

    log.info('[SummaryAgent] Summary completed', { summaryLength: fullText.length })

    // ─── 写入 Artifact（事务提交后推送事件）──────────────────
    let artifactId: string | undefined
    try {
      const { artifact, version } = await this.artifactStore.createArtifactWithVersion(
        {
          runId,
          type: ARTIFACT_TYPES.SUMMARY,
          title: `摘要 - ${new Date().toLocaleString('zh-CN')}`,
          metadata: {
            agentId: this.agentId,
            sourceLength: payload.content.length,
            summaryLength: fullText.length,
          },
        },
        { summary: fullText, generatedAt: now() },
        { runId, stepId: modelStep.id, agentId: this.agentId },
      )

      artifactId = artifact.id

      // 事务提交成功后再 emit 事件
      await emitter.emit(artifactCreatedEvent({
        runId,
        artifactId: artifact.id,
        artifactType: ARTIFACT_TYPES.SUMMARY,
        title: artifact.title,
      }))
      await emitter.emit(artifactVersionCreatedEvent({
        runId,
        artifactId: artifact.id,
        versionId: version.id,
        version: version.version,
      }))

      log.info('[SummaryAgent] Artifact created', { artifactId: artifact.id })
    } catch (err) {
      // Artifact 保存失败不影响主流程，但记录错误
      log.error('[SummaryAgent] Failed to save artifact', { errorCode: 'ARTIFACT_SAVE_FAILED' })
    }

    return {
      output: { summary: fullText, artifactId },
    }
  }
}

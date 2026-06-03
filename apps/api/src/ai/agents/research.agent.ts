import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import { EVENT_TYPES, STEP_TYPES, MODEL_STREAM_EVENT_TYPES, ARTIFACT_TYPES } from '@agent-frame/shared'
import type { ModelClient } from '../model-client/model-client.js'
import type { RunContext } from '../../runtime/run-manager.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import { StepManager } from '../../runtime/step-manager.js'
import { artifactCreatedEvent, artifactVersionCreatedEvent } from '../../artifacts/artifact-events.js'
import { RESEARCH_AGENT_ID } from './agent-ids.js'
import { RESEARCH_SYSTEM, researchPrompt } from '../prompts/index.js'
import { now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// ResearchAgent — 专业 Agent：信息检索 / 资料研究
// MVP 阶段通过模型能力模拟研究分析
// 研究完成后写入 Artifact（type: research_report）
// ============================================================

export { RESEARCH_AGENT_ID }

export class ResearchAgent {
  readonly agentId = RESEARCH_AGENT_ID
  private stepManager: StepManager

  constructor(
    private modelClient: ModelClient,
    private store: RunStore,
    private artifactStore: ArtifactStore,
  ) {
    this.stepManager = new StepManager(store)
  }

  async execute(input: AgentInput<{ query: string }>, context: RunContext): Promise<AgentOutput<{ findings: string; artifactId?: string }>> {
    const { runId, stepId, traceId, payload } = input
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)

    log.info('[ResearchAgent] Starting research', { query: payload.query })

    // ─── 创建 model_call Step ────────────────────────────────
    const modelStep = await this.stepManager.startStep({
      runId,
      type: STEP_TYPES.MODEL_CALL,
      agentId: this.agentId,
      input: { model: 'creative.medium', purpose: 'research' },
    })

    let fullText = ''

    try {
      // 流式输出，发出 message.delta 事件
      for await (const event of this.modelClient.stream({
        model: 'creative.medium',
        system: RESEARCH_SYSTEM,
        prompt: researchPrompt(payload.query),
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
          // 检查取消信号
          if (input.signal?.aborted) break
        }
      }

      await this.stepManager.completeStep(modelStep.id, { textLength: fullText.length })
    } catch (err) {
      await this.stepManager.failStep(modelStep.id, err)
      log.error('[ResearchAgent] Model call failed', { errorCode: 'MODEL_CALL_FAILED' })
    }

    log.info('[ResearchAgent] Research completed', { textLength: fullText.length })

    // ─── 写入 Artifact（research_report）────────────────────
    let artifactId: string | undefined
    try {
      const { artifact, version } = await this.artifactStore.createArtifactWithVersion(
        {
          runId,
          type: ARTIFACT_TYPES.RESEARCH_REPORT,
          title: `研究报告：${payload.query.slice(0, 50)}`,
          metadata: {
            agentId: this.agentId,
            query: payload.query,
            textLength: fullText.length,
          },
        },
        { content: fullText, generatedAt: now() },
        { runId, stepId: modelStep.id, agentId: this.agentId },
      )

      artifactId = artifact.id

      // 事务提交成功后再 emit 事件
      await emitter.emit(artifactCreatedEvent({
        runId,
        artifactId: artifact.id,
        artifactType: ARTIFACT_TYPES.RESEARCH_REPORT,
        title: artifact.title,
      }))
      await emitter.emit(artifactVersionCreatedEvent({
        runId,
        artifactId: artifact.id,
        versionId: version.id,
        version: version.version,
      }))

      log.info('[ResearchAgent] Artifact created', { artifactId: artifact.id })
    } catch (err) {
      // Artifact 保存失败不影响主流程，但记录错误
      log.error('[ResearchAgent] Failed to save artifact', { errorCode: 'ARTIFACT_SAVE_FAILED' })
    }

    return {
      output: { findings: fullText, artifactId },
      usage: undefined,
    }
  }
}

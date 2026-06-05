import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import { EVENT_TYPES, STEP_TYPES, MODEL_STREAM_EVENT_TYPES, ARTIFACT_TYPES } from '@agent-frame/shared'
import type { ModelClient } from '../../ai/model-client/model-client.js'
import type { RunContext } from '../../runtime/run-manager.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import { StepManager } from '../../runtime/step-manager.js'
import { artifactCreatedEvent, artifactVersionCreatedEvent } from '../../artifacts/artifact-events.js'
import { now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'
import { REVIEW_AGENT_ID } from './agent-ids.js'
import { REVIEW_SYSTEM, reviewPrompt } from './prompts.js'
import type { WritingOutput } from './writing.agent.js'

// ============================================================
// ReviewAgent — 创意写作第三阶段：初稿润色修订
//
// 接受 WritingAgent 的初稿，进行整体语言和结构优化
// 输出成品写入 Artifact（type: creative_work）
// ============================================================

export { REVIEW_AGENT_ID }

export type ReviewPayload = {
  draft: WritingOutput
  style: string
  requirements?: string  // 可选的额外修订要求（如"加强开头"）
}

export type ReviewOutput = {
  title: string
  finalWork: string
  wordCount: number
  draftArtifactId?: string
  artifactId?: string
}

export class ReviewAgent {
  readonly agentId = REVIEW_AGENT_ID
  private stepManager: StepManager

  constructor(
    private modelClient: ModelClient,
    private store: RunStore,
    private artifactStore: ArtifactStore,
  ) {
    this.stepManager = new StepManager(store)
  }

  async execute(
    input: AgentInput<ReviewPayload>,
    _context: RunContext,
  ): Promise<AgentOutput<ReviewOutput>> {
    const { runId, traceId, payload } = input
    const { draft, style, requirements } = payload
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)

    log.info('[ReviewAgent] Starting review', {
      title: draft.title,
      draftWordCount: draft.wordCount,
    })

    const modelStep = await this.stepManager.startStep({
      runId,
      type: STEP_TYPES.MODEL_CALL,
      agentId: this.agentId,
      input: { model: 'creative.medium', purpose: 'review_and_polish' },
    })

    let finalWork = ''

    try {
      for await (const event of this.modelClient.stream({
        model: 'creative.medium',
        system: REVIEW_SYSTEM,
        prompt: reviewPrompt({ draft: draft.draft, style, requirements }),
        metadata: { runId, agentId: this.agentId, traceId, stepId: modelStep.id },
      })) {
        if (event.type === MODEL_STREAM_EVENT_TYPES.TEXT_DELTA) {
          finalWork += event.delta
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
      await this.stepManager.completeStep(modelStep.id, { finalWordCount: finalWork.length })
    } catch (err) {
      await this.stepManager.failStep(modelStep.id, err)
      log.error('[ReviewAgent] Review model call failed', { errorCode: 'MODEL_CALL_FAILED' })
      // 降级：直接使用初稿
      finalWork = draft.draft
    }

    // ── 写入 Artifact（type: creative_work）──────────────────
    let artifactId: string | undefined
    try {
      const { artifact, version } = await this.artifactStore.createArtifactWithVersion(
        {
          runId,
          type: ARTIFACT_TYPES.CREATIVE_WORK,
          title: draft.title,
          metadata: {
            agentId: this.agentId,
            draftArtifactId: draft.artifactId,
            style,
            requirements: requirements ?? null,
          },
        },
        {
          title: draft.title,
          finalWork,
          wordCount: finalWork.length,
          draftSections: draft.sections.length,
          generatedAt: now(),
        },
        { runId, agentId: this.agentId, stepId: modelStep.id },
      )

      artifactId = artifact.id
      await emitter.emit(artifactCreatedEvent({ runId, artifactId: artifact.id, artifactType: ARTIFACT_TYPES.CREATIVE_WORK, title: artifact.title }))
      await emitter.emit(artifactVersionCreatedEvent({ runId, artifactId: artifact.id, versionId: version.id, version: version.version }))
      log.info('[ReviewAgent] Final work artifact created', { artifactId, wordCount: finalWork.length })
    } catch {
      log.error('[ReviewAgent] Failed to save creative_work artifact', { errorCode: 'ARTIFACT_SAVE_FAILED' })
    }

    return {
      output: {
        title: draft.title,
        finalWork,
        wordCount: finalWork.length,
        draftArtifactId: draft.artifactId,
        artifactId,
      },
    }
  }
}

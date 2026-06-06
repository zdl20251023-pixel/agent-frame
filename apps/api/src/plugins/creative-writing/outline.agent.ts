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
import { OUTLINE_AGENT_ID } from './agent-ids.js'
import { OUTLINE_SYSTEM, outlinePrompt } from './prompts.js'

// ============================================================
// OutlineAgent — 创意写作第一阶段：生成内容大纲
//
// 接受主题、风格、目标字数，输出结构化大纲（JSON）
// 大纲写入 Artifact（type: outline），供 WritingAgent 展开
// ============================================================

export { OUTLINE_AGENT_ID }

export type OutlinePayload = {
  topic: string
  style: string
  targetWords?: number
}

export type OutlineSection = {
  id: string
  title: string
  keyPoints: string[]
  targetWords: number
}

export type OutlineOutput = {
  title: string
  subtitle?: string
  sections: OutlineSection[]
  rawOutline: string
  artifactId?: string
}

export class OutlineAgent {
  readonly agentId = OUTLINE_AGENT_ID
  private stepManager: StepManager

  constructor(
    private modelClient: ModelClient,
    private store: RunStore,
    private artifactStore: ArtifactStore,
  ) {
    this.stepManager = new StepManager(store)
  }

  async execute(
    input: AgentInput<OutlinePayload>,
    context: RunContext,
  ): Promise<AgentOutput<OutlineOutput>> {
    const { runId, traceId, payload } = input
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)

    log.info('[OutlineAgent] Generating outline', { topic: payload.topic, style: payload.style })

    const modelStep = await this.stepManager.startStep({
      runId,
      type: STEP_TYPES.MODEL_CALL,
      agentId: this.agentId,
      input: { model: 'fast.chat', purpose: 'outline_generation' },
    })

    let rawOutline = ''

    try {
      for await (const event of this.modelClient.stream({
        model: 'fast.chat',
        system: OUTLINE_SYSTEM,
        prompt: outlinePrompt({
          topic: payload.topic,
          style: payload.style,
          targetWords: payload.targetWords ?? 1500,
        }),
        signal: context.signal,
        metadata: { runId, agentId: this.agentId, traceId, stepId: modelStep.id },
      })) {
        if (event.type === MODEL_STREAM_EVENT_TYPES.TEXT_DELTA) {
          rawOutline += event.delta
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
      await this.stepManager.completeStep(modelStep.id, { outlineLength: rawOutline.length })
    } catch (err) {
      await this.stepManager.failStep(modelStep.id, err)
      log.error('[OutlineAgent] Model call failed', { errorCode: 'MODEL_CALL_FAILED' })
    }

    // ── 解析 JSON 大纲 ──────────────────────────────────────
    let parsedOutline: { title: string; subtitle?: string; sections: OutlineSection[] } = {
      title: payload.topic,
      sections: [],
    }
    try {
      const jsonMatch = rawOutline.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsedOutline = JSON.parse(jsonMatch[0])
      }
    } catch {
      log.warn('[OutlineAgent] Failed to parse outline JSON, using raw text', {})
      parsedOutline = {
        title: payload.topic,
        sections: [{ id: 'section-1', title: '正文', keyPoints: [rawOutline.slice(0, 200)], targetWords: payload.targetWords ?? 1500 }],
      }
    }

    // ── 写入 Artifact（type: outline）────────────────────────
    let artifactId: string | undefined
    try {
      const { artifact, version } = await this.artifactStore.createArtifactWithVersion(
        {
          runId,
          type: ARTIFACT_TYPES.OUTLINE,
          title: `大纲：${parsedOutline.title}`,
          metadata: { agentId: this.agentId, topic: payload.topic, style: payload.style },
        },
        {
          outline: parsedOutline,
          rawOutline,
          generatedAt: now(),
        },
        { runId, stepId: modelStep.id, agentId: this.agentId },
      )

      artifactId = artifact.id
      await emitter.emit(artifactCreatedEvent({ runId, artifactId: artifact.id, artifactType: ARTIFACT_TYPES.OUTLINE, title: artifact.title }))
      await emitter.emit(artifactVersionCreatedEvent({ runId, artifactId: artifact.id, versionId: version.id, version: version.version }))
      log.info('[OutlineAgent] Artifact created', { artifactId })
    } catch {
      log.error('[OutlineAgent] Failed to save outline artifact', { errorCode: 'ARTIFACT_SAVE_FAILED' })
    }

    return {
      output: {
        title: parsedOutline.title,
        subtitle: parsedOutline.subtitle,
        sections: parsedOutline.sections,
        rawOutline,
        artifactId,
      },
    }
  }
}

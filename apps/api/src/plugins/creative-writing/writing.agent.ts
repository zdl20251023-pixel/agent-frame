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
import { WRITING_AGENT_ID } from './agent-ids.js'
import { WRITING_SYSTEM, writingPrompt } from './prompts.js'
import type { OutlineOutput, OutlineSection } from './outline.agent.js'

// ============================================================
// WritingAgent — 创意写作第二阶段：按大纲展开正文
//
// 接受 OutlineAgent 输出的大纲，逐节展开正文
// 所有章节拼接后写入 Artifact（type: draft）
// ============================================================

export { WRITING_AGENT_ID }

export type WritingPayload = {
  outline: OutlineOutput
  style: string
}

export type WritingOutput = {
  title: string
  draft: string
  sections: Array<{ id: string; title: string; content: string }>
  wordCount: number
  artifactId?: string
}

export class WritingAgent {
  readonly agentId = WRITING_AGENT_ID
  private stepManager: StepManager

  constructor(
    private modelClient: ModelClient,
    private store: RunStore,
    private artifactStore: ArtifactStore,
  ) {
    this.stepManager = new StepManager(store)
  }

  async execute(
    input: AgentInput<WritingPayload>,
    _context: RunContext,
  ): Promise<AgentOutput<WritingOutput>> {
    const { runId, traceId, payload } = input
    const { outline, style } = payload
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)

    log.info('[WritingAgent] Starting writing', {
      title: outline.title,
      sections: outline.sections.length,
    })

    const writtenSections: Array<{ id: string; title: string; content: string }> = []

    // ── 逐节展开正文 ────────────────────────────────────────
    for (const section of outline.sections) {
      if (input.signal?.aborted) break

      const stepResult = await this.stepManager.startStep({
        runId,
        type: STEP_TYPES.MODEL_CALL,
        agentId: this.agentId,
        input: { model: 'creative.medium', purpose: 'section_writing', sectionId: section.id },
      })

      let sectionContent = ''

      try {
        for await (const event of this.modelClient.stream({
          model: 'creative.medium',
          system: WRITING_SYSTEM,
          prompt: writingPrompt({
            outline: outline.rawOutline,
            sectionId: section.id,
            sectionTitle: section.title,
            keyPoints: section.keyPoints,
            style,
          }),
          metadata: { runId, agentId: this.agentId, traceId, stepId: stepResult.id },
        })) {
          if (event.type === MODEL_STREAM_EVENT_TYPES.TEXT_DELTA) {
            sectionContent += event.delta
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
        await this.stepManager.completeStep(stepResult.id, { sectionId: section.id, words: sectionContent.length })
      } catch (err) {
        await this.stepManager.failStep(stepResult.id, err)
        log.error('[WritingAgent] Section writing failed', { sectionId: section.id, errorCode: 'MODEL_CALL_FAILED' })
        sectionContent = `[章节 ${section.title} 生成失败]`
      }

      writtenSections.push({ id: section.id, title: section.title, content: sectionContent })
      log.info('[WritingAgent] Section completed', { sectionId: section.id, chars: sectionContent.length })
    }

    // ── 拼接完整初稿 ─────────────────────────────────────────
    const fullDraft = writtenSections
      .map((s) => `## ${s.title}\n\n${s.content}`)
      .join('\n\n')

    const wordCount = fullDraft.length

    // ── 写入 Artifact（type: draft）──────────────────────────
    let artifactId: string | undefined
    try {
      const { artifact, version } = await this.artifactStore.createArtifactWithVersion(
        {
          runId,
          type: ARTIFACT_TYPES.DRAFT,
          title: `初稿：${outline.title}`,
          metadata: { agentId: this.agentId, outlineArtifactId: outline.artifactId, style },
        },
        {
          title: outline.title,
          sections: writtenSections,
          fullDraft,
          wordCount,
          generatedAt: now(),
        },
        { runId, agentId: this.agentId },
      )

      artifactId = artifact.id
      await emitter.emit(artifactCreatedEvent({ runId, artifactId: artifact.id, artifactType: ARTIFACT_TYPES.DRAFT, title: artifact.title }))
      await emitter.emit(artifactVersionCreatedEvent({ runId, artifactId: artifact.id, versionId: version.id, version: version.version }))
      log.info('[WritingAgent] Draft artifact created', { artifactId, wordCount })
    } catch {
      log.error('[WritingAgent] Failed to save draft artifact', { errorCode: 'ARTIFACT_SAVE_FAILED' })
    }

    return {
      output: {
        title: outline.title,
        draft: fullDraft,
        sections: writtenSections,
        wordCount,
        artifactId,
      },
    }
  }
}

// ── 辅助：从 OutlineSection 提取到展开需要的参数 ──────────────
export function sectionFromOutline(section: OutlineSection) {
  return section
}

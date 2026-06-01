import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import type { ModelClient } from '../model-client/model-client.js'
import type { RunContext } from '../../runtime/run-manager.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import { artifactCreatedEvent, artifactVersionCreatedEvent } from '../../artifacts/artifact-events.js'
import { now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'
import { AppError } from '../../shared/errors/app-error.js'

// ============================================================
// SummaryAgent — 专业 Agent：内容总结 + 写入 Artifact
// ============================================================

export const SUMMARY_AGENT_ID = 'summary-agent'

export class SummaryAgent {
  readonly agentId = SUMMARY_AGENT_ID

  constructor(
    private modelClient: ModelClient,
    private store: RunStore,
    private artifactStore: ArtifactStore,
  ) {}

  async execute(
    input: AgentInput<{ content: string; maxLength?: number }>,
    context: RunContext,
  ): Promise<AgentOutput<{ summary: string; artifactId?: string }>> {
    const { runId, traceId, payload } = input
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)

    log.info('[SummaryAgent] Starting summary', { contentLength: payload.content.length })

    const maxLength = payload.maxLength ?? 300
    const system = `你是一个专业的内容总结专家。
请将用户提供的内容总结为简洁、准确的摘要。
要求：
- 总结字数不超过 ${maxLength} 字
- 保留最核心的关键信息
- 使用清晰的中文表达`

    const prompt = `请总结以下内容：\n\n${payload.content}`

    let fullText = ''

    for await (const event of this.modelClient.stream({
      model: 'fast.chat',
      system,
      prompt,
      maxTokens: 512,
      metadata: { runId, agentId: this.agentId, traceId },
    })) {
      if (event.type === 'text.delta') {
        fullText += event.delta
        await emitter.emit({
          type: 'message.delta',
          runId,
          agentId: this.agentId,
          delta: event.delta,
          timestamp: now(),
        })
        if (input.signal?.aborted) break
      }
    }

    log.info('[SummaryAgent] Summary completed', { summaryLength: fullText.length })

    // ─── 写入 Artifact（事务提交后推送事件）──────────────────
    let artifactId: string | undefined
    try {
      const { artifact, version } = await this.artifactStore.createArtifactWithVersion(
        {
          runId,
          type: 'summary',
          title: `摘要 - ${new Date().toLocaleString('zh-CN')}`,
          metadata: {
            agentId: this.agentId,
            sourceLength: payload.content.length,
            summaryLength: fullText.length,
          },
        },
        { summary: fullText, generatedAt: now() },
        { runId, agentId: this.agentId },
      )

      artifactId = artifact.id

      // 事务提交成功后再 emit 事件
      await emitter.emit(artifactCreatedEvent({
        runId,
        artifactId: artifact.id,
        artifactType: 'summary',
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
      log.error('[SummaryAgent] Failed to save artifact', {
        errorCode: 'ARTIFACT_SAVE_FAILED',
      })
    }

    return {
      output: { summary: fullText, artifactId },
    }
  }
}

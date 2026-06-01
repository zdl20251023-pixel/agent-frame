import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import type { ModelClient } from '../model-client/model-client.js'
import type { RunContext } from '../../runtime/run-manager.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import { now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// SummaryAgent — 专业 Agent：内容总结
// ============================================================

export const SUMMARY_AGENT_ID = 'summary-agent'

export class SummaryAgent {
  readonly agentId = SUMMARY_AGENT_ID

  constructor(
    private modelClient: ModelClient,
    private store: RunStore,
  ) {}

  async execute(
    input: AgentInput<{ content: string; maxLength?: number }>,
    context: RunContext,
  ): Promise<AgentOutput<{ summary: string }>> {
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

    return {
      output: { summary: fullText },
    }
  }
}

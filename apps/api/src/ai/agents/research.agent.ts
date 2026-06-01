import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import type { ModelClient } from '../model-client/model-client.js'
import type { RunContext } from '../../runtime/run-manager.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import { now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// ResearchAgent — 专业 Agent：信息检索 / 资料研究
// MVP 阶段通过模型能力模拟研究分析
// ============================================================

export const RESEARCH_AGENT_ID = 'research-agent'

export class ResearchAgent {
  readonly agentId = RESEARCH_AGENT_ID

  constructor(
    private modelClient: ModelClient,
    private store: RunStore,
  ) {}

  async execute(input: AgentInput<{ query: string }>, context: RunContext): Promise<AgentOutput<{ findings: string }>> {
    const { runId, traceId, payload } = input
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)

    log.info('[ResearchAgent] Starting research', { query: payload.query })

    const system = `你是一个专业的研究分析师。
你的任务是根据用户的查询问题，提供详尽、准确、有条理的研究分析报告。
输出格式：清晰分段，包含关键发现和具体信息。`

    const prompt = `请研究以下问题并提供详细分析：\n\n${payload.query}`

    let fullText = ''

    // 流式输出，发出 message.delta 事件
    for await (const event of this.modelClient.stream({
      model: 'creative.medium',
      system,
      prompt,
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
        // 检查取消信号
        if (input.signal?.aborted) break
      }
    }

    log.info('[ResearchAgent] Research completed', { textLength: fullText.length })

    return {
      output: { findings: fullText },
      usage: undefined,
    }
  }
}

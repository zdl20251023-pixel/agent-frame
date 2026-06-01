import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import type { ModelClient } from '../model-client/model-client.js'
import type { RunContext } from '../../runtime/run-manager.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { A2AClient } from '../../a2a/a2a-client.js'
import { RESEARCH_AGENT_ID } from './research.agent.js'
import { SUMMARY_AGENT_ID } from './summary.agent.js'
import { now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// SupervisorAgent — 调度 Agent
// 负责分析任务、决定是否调用专业 Agent、汇总最终结果
// 禁止直接 import 专业 Agent 并调用，必须走 A2AClient
// ============================================================

export const SUPERVISOR_AGENT_ID = 'supervisor-agent'

type SupervisorPayload = {
  message: string
  sessionId?: string
}

export class SupervisorAgent {
  readonly agentId = SUPERVISOR_AGENT_ID

  constructor(
    private modelClient: ModelClient,
    private a2aClient: A2AClient,
    private store: RunStore,
  ) {}

  async execute(
    input: AgentInput<SupervisorPayload>,
    context: RunContext,
  ): Promise<AgentOutput<{ answer: string }>> {
    const { runId, traceId, payload } = input
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)

    log.info('[SupervisorAgent] Analyzing task', { message: payload.message })

    // ─── Step 1：分析任务，决定调用策略 ─────────────────────
    const planResult = await this.modelClient.generate({
      model: 'fast.chat',
      system: `你是一个任务调度专家。
分析用户请求，决定是否需要调用专业 Agent，以 JSON 格式回答：
{
  "needsResearch": true/false,     // 是否需要研究分析
  "needsSummary": true/false,      // 研究后是否需要总结
  "researchQuery": "...",          // 如果需要研究，具体查询内容
  "directAnswer": "..."            // 如果不需要专业Agent，直接回答
}`,
      prompt: `用户请求：${payload.message}`,
      metadata: { runId, agentId: this.agentId, traceId },
    })

    let plan: { needsResearch: boolean; needsSummary: boolean; researchQuery?: string; directAnswer?: string }
    try {
      // 从生成文本中提取 JSON
      const jsonMatch = planResult.text.match(/\{[\s\S]*\}/)
      plan = jsonMatch ? JSON.parse(jsonMatch[0]) : { needsResearch: true, needsSummary: false }
    } catch {
      plan = { needsResearch: true, needsSummary: false, researchQuery: payload.message }
    }

    log.info('[SupervisorAgent] Plan decided', { needsResearch: plan.needsResearch })

    // ─── Step 2：如果不需要专业 Agent，直接回答 ─────────────
    if (!plan.needsResearch && plan.directAnswer) {
      // 发出 message.delta（模拟流式）
      for (const char of plan.directAnswer) {
        await emitter.emit({
          type: 'message.delta',
          runId,
          agentId: this.agentId,
          delta: char,
          timestamp: now(),
        })
      }
      return { output: { answer: plan.directAnswer } }
    }

    // ─── Step 3：调用 ResearchAgent ──────────────────────────
    let researchFindings = ''
    if (plan.needsResearch) {
      const researchResponse = await this.a2aClient.callSync(
        {
          runId,
          traceId,
          fromAgentId: SUPERVISOR_AGENT_ID,
          toAgentId: RESEARCH_AGENT_ID,
          mode: 'sync',
          input: { query: plan.researchQuery ?? payload.message },
          timeoutMs: 60000,
        },
        context,
      )
      if (researchResponse.status === 'completed' && researchResponse.output) {
        researchFindings = (researchResponse.output as { findings: string }).findings ?? ''
      }
    }

    // ─── Step 4：可选调用 SummaryAgent ───────────────────────
    let finalContent = researchFindings
    if (plan.needsSummary && researchFindings) {
      const summaryResponse = await this.a2aClient.callSync(
        {
          runId,
          traceId,
          fromAgentId: SUPERVISOR_AGENT_ID,
          toAgentId: SUMMARY_AGENT_ID,
          mode: 'sync',
          input: { content: researchFindings },
          timeoutMs: 30000,
        },
        context,
      )
      if (summaryResponse.status === 'completed' && summaryResponse.output) {
        finalContent = (summaryResponse.output as { summary: string }).summary ?? finalContent
      }
    }

    // ─── Step 5：生成最终回答 ────────────────────────────────
    let answer = ''
    for await (const event of this.modelClient.stream({
      model: 'fast.chat',
      system: '你是一个智能助手，请根据研究结果给用户一个友好、清晰的最终回答。',
      prompt: `用户问题：${payload.message}\n\n研究结果：\n${finalContent}\n\n请给出最终回答：`,
      metadata: { runId, agentId: this.agentId, traceId },
    })) {
      if (event.type === 'text.delta') {
        answer += event.delta
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

    log.info('[SupervisorAgent] Task completed', { answerLength: answer.length })
    return { output: { answer } }
  }
}

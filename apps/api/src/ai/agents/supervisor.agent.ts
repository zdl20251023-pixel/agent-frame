import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import { EVENT_TYPES, STEP_TYPES, MODEL_STREAM_EVENT_TYPES, A2A_STATUSES, A2A_CALL_MODES } from '@agent-frame/shared'
import type { ModelClient } from '../model-client/model-client.js'
import type { RunContext } from '../../runtime/run-manager.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { A2AClient } from '../../a2a/a2a-client.js'
import { StepManager } from '../../runtime/step-manager.js'
import {
  SUPERVISOR_AGENT_ID,
  RESEARCH_AGENT_ID,
  SUMMARY_AGENT_ID,
} from './agent-ids.js'
import {
  SUPERVISOR_PLAN_SYSTEM,
  SUPERVISOR_ANSWER_SYSTEM,
  supervisorPlanPrompt,
  supervisorAnswerPrompt,
} from '../prompts/index.js'
import { now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// SupervisorAgent — 调度 Agent
// 负责分析任务、决定是否调用专业 Agent、汇总最终结果
// 禁止直接 import 专业 Agent 并调用，必须走 A2AClient
// ============================================================

export { SUPERVISOR_AGENT_ID }

type SupervisorPayload = {
  message: string
  sessionId?: string
}

export class SupervisorAgent {
  readonly agentId = SUPERVISOR_AGENT_ID
  private stepManager: StepManager

  constructor(
    private modelClient: ModelClient,
    private a2aClient: A2AClient,
    private store: RunStore,
  ) {
    this.stepManager = new StepManager(store)
  }

  async execute(
    input: AgentInput<SupervisorPayload>,
    context: RunContext,
  ): Promise<AgentOutput<{ answer: string }>> {
    const { runId, traceId, payload } = input
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)

    log.info('[SupervisorAgent] Analyzing task', { message: payload.message })

    // ─── Step 1：创建 model_call Step，分析任务决定调用策略 ──
    const planStep = await this.stepManager.startStep({
      runId,
      type: STEP_TYPES.MODEL_CALL,
      agentId: this.agentId,
      input: { model: 'fast.chat', purpose: 'task_planning' },
    })

    let plan: { needsResearch: boolean; needsSummary: boolean; researchQuery?: string; directAnswer?: string }
    try {
      const planResult = await this.modelClient.generate({
        model: 'fast.chat',
        system: SUPERVISOR_PLAN_SYSTEM,
        prompt: supervisorPlanPrompt(payload.message),
        metadata: { runId, agentId: this.agentId, traceId, stepId: planStep.id },
      })

      try {
        const jsonMatch = planResult.text.match(/\{[\s\S]*\}/)
        plan = jsonMatch ? JSON.parse(jsonMatch[0]) : { needsResearch: true, needsSummary: false }
      } catch {
        plan = { needsResearch: true, needsSummary: false, researchQuery: payload.message }
      }

      await this.stepManager.completeStep(planStep.id, { plan })
    } catch (err) {
      await this.stepManager.failStep(planStep.id, err)
      plan = { needsResearch: true, needsSummary: false, researchQuery: payload.message }
    }

    log.info('[SupervisorAgent] Plan decided', { needsResearch: plan.needsResearch })

    // ─── Step 2：如果不需要专业 Agent，直接回答 ─────────────
    if (!plan.needsResearch && plan.directAnswer) {
      for (const char of plan.directAnswer) {
        await emitter.emit({
          type: EVENT_TYPES.MESSAGE_DELTA,
          runId,
          agentId: this.agentId,
          delta: char,
          timestamp: now(),
        })
      }
      log.info('[SupervisorAgent] Task completed (direct answer)', { answerLength: plan.directAnswer.length })
      logger.info(`[UserMessage] 最终返回给用户的回答: ${plan.directAnswer}`)
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
          mode: A2A_CALL_MODES.SYNC,
          input: { query: plan.researchQuery ?? payload.message },
          timeoutMs: 60000,
        },
        context,
      )
      if (researchResponse.status === A2A_STATUSES.COMPLETED && researchResponse.output) {
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
          mode: A2A_CALL_MODES.SYNC,
          input: { content: researchFindings },
          timeoutMs: 30000,
        },
        context,
      )
      if (summaryResponse.status === A2A_STATUSES.COMPLETED && summaryResponse.output) {
        finalContent = (summaryResponse.output as { summary: string }).summary ?? finalContent
      }
    }

    // ─── Step 5：创建 model_call Step，生成最终回答 ──────────
    const answerStep = await this.stepManager.startStep({
      runId,
      type: STEP_TYPES.MODEL_CALL,
      agentId: this.agentId,
      input: { model: 'fast.chat', purpose: 'final_answer' },
    })

    let answer = ''
    try {
      for await (const event of this.modelClient.stream({
        model: 'fast.chat',
        system: SUPERVISOR_ANSWER_SYSTEM,
        prompt: supervisorAnswerPrompt(payload.message, finalContent),
        metadata: { runId, agentId: this.agentId, traceId, stepId: answerStep.id },
      })) {
        if (event.type === MODEL_STREAM_EVENT_TYPES.TEXT_DELTA) {
          answer += event.delta
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
      await this.stepManager.completeStep(answerStep.id, { answerLength: answer.length })
    } catch (err) {
      await this.stepManager.failStep(answerStep.id, err)
    }

    log.info('[SupervisorAgent] Task completed', { answerLength: answer.length })
    logger.info(`[UserMessage] 最终返回给用户的回答: ${answer}`)
    return { output: { answer } }
  }
}

import type { A2ARequest, A2AResponse, AgentEvent } from '@agent-frame/shared'
import { EVENT_TYPES, STEP_TYPES, A2A_CALL_MODES, STEP_STATUS, A2A_STATUSES } from '@agent-frame/shared'
import type { RunStore } from '../runtime/stores/run-store.js'
import type { RunContext } from '../runtime/run-manager.js'
import { RunEventEmitter } from '../runtime/event-emitter.js'
import { StepManager } from '../runtime/step-manager.js'
import { A2APolicy } from './a2a-policy.js'
import { A2ARouter } from './a2a-router.js'
import { logger } from '../shared/observability/logger.js'
import { AppError } from '../shared/errors/app-error.js'
import { now } from '../shared/utils/id.js'

// ============================================================
// A2AClient — Agent 调用 Agent 的唯一入口
// MVP 只实现 callSync，startAsync/stream 返回 NOT_IMPLEMENTED
// ============================================================

export class A2AClient {
  private emitter: RunEventEmitter
  private stepManager: StepManager

  constructor(
    private store: RunStore,
    private policy: A2APolicy,
    private router: A2ARouter,
  ) {
    this.emitter = new RunEventEmitter(store)
    this.stepManager = new StepManager(store)
  }

  async callSync(request: A2ARequest, context: RunContext): Promise<A2AResponse & { mode: 'sync' }> {
    const { runId, traceId } = request
    const log = logger.child({ runId, traceId, fromAgentId: request.fromAgentId, toAgentId: request.toAgentId })
    const startMs = Date.now()

    // ─── 1. Policy 检查（在 try 内，失败也能返回 failed 状态）──
    try {
      this.policy.assertCanCall(request, context)
    } catch (err: unknown) {
      const latencyMs = Date.now() - startMs
      const appErr = err instanceof AppError ? err : new AppError('AGENT_CALL_DENIED', String(err))
      log.warn('[A2AClient] callSync denied by policy', { errorCode: appErr.code })
      return {
        mode: A2A_CALL_MODES.SYNC,
        status: A2A_STATUSES.FAILED,
        error: { code: appErr.code, message: appErr.message },
        latencyMs,
      }
    }

    // ─── 2. 更新调用计数 ─────────────────────────────────────
    context.callCount++
    context.depth++

    // ─── 3. 创建 Step 记录 ───────────────────────────────────
    const step = await this.stepManager.startStep({
      runId,
      parentStepId: request.parentStepId,
      type: STEP_TYPES.AGENT_CALL,
      fromAgentId: request.fromAgentId,
      toAgentId: request.toAgentId,
      input: request.input,
    })
    const stepId = step.id

    // ─── 4. 发出 agent.call.started ──────────────────────────
    await this.emitter.emit({
      type: EVENT_TYPES.AGENT_CALL_STARTED,
      runId,
      traceId,
      stepId,
      parentStepId: request.parentStepId,
      fromAgentId: request.fromAgentId,
      toAgentId: request.toAgentId,
      inputPreview: this.safePreview(request.input),
      timestamp: now(),
    })

    log.info('[A2AClient] callSync started')

    try {
      // ─── 5. 路由到目标 Agent ────────────────────────────────
      const adapter = this.router.resolve(request.toAgentId)

      // ─── 6. 超时控制 ─────────────────────────────────────────
      const timeoutMs = request.timeoutMs ?? 30000
      const timeoutSignal = AbortSignal.timeout(timeoutMs)
      const signal = AbortSignal.any([context.signal, timeoutSignal])

      // ─── 7. 执行目标 Agent ───────────────────────────────────
      const result = await adapter.execute(
        {
          runId,
          stepId,
          traceId,
          userId: context.userId,
          payload: request.input,
          signal,
        },
        { ...context, depth: context.depth },
      )

      const latencyMs = Date.now() - startMs

      // ─── 8. 更新 Step、发出 completed 事件 ──────────────────
      await this.stepManager.completeStep(stepId, result.output)
      await this.emitter.emit({
        type: EVENT_TYPES.AGENT_CALL_COMPLETED,
        runId,
        traceId,
        stepId,
        fromAgentId: request.fromAgentId,
        toAgentId: request.toAgentId,
        outputPreview: this.safePreview(result.output),
        latencyMs,
        timestamp: now(),
      })

      log.info('[A2AClient] callSync completed', { latencyMs })
      context.depth--

      return {
        mode: A2A_CALL_MODES.SYNC,
        status: A2A_STATUSES.COMPLETED,
        output: result.output,
        latencyMs,
        usage: result.usage ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          estimatedCostUsd: result.usage.estimatedCostUsd,
        } : undefined,
      }
    } catch (err: unknown) {
      const latencyMs = Date.now() - startMs
      const appErr = err instanceof AppError ? err : new AppError('AGENT_CALL_FAILED', String(err))

      await this.stepManager.failStep(stepId, { code: appErr.code, message: appErr.message })
      await this.emitter.emit({
        type: EVENT_TYPES.AGENT_CALL_FAILED,
        runId,
        traceId,
        stepId,
        fromAgentId: request.fromAgentId,
        toAgentId: request.toAgentId,
        error: { code: appErr.code, message: appErr.message },
        timestamp: now(),
      })

      log.error('[A2AClient] callSync failed', { latencyMs, errorCode: appErr.code })
      context.depth--

      return {
        mode: A2A_CALL_MODES.SYNC,
        status: A2A_STATUSES.FAILED,
        error: { code: appErr.code, message: appErr.message },
        latencyMs,
      }
    }
  }

  async startAsync(_request: A2ARequest): Promise<never> {
    throw new AppError('A2A_ASYNC_NOT_IMPLEMENTED', 'Async A2A is reserved for future versions.', {
      statusCode: 501,
    })
  }

  async *stream(_request: A2ARequest): AsyncIterable<AgentEvent> {
    throw new AppError('A2A_ASYNC_NOT_IMPLEMENTED', 'Stream A2A is reserved for future versions.', {
      statusCode: 501,
    })
  }

  private safePreview(value: unknown): string | undefined {
    try {
      const str = JSON.stringify(value)
      return str.length > 200 ? str.slice(0, 200) + '...' : str
    } catch {
      return '[unserializable]'
    }
  }
}

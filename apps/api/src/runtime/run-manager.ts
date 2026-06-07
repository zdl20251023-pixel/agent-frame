import type { Run, AgentInput, AgentOutput, ConversationContext } from '@agent-frame/shared'
import { EVENT_TYPES, RUN_STATUS } from '@agent-frame/shared'
import type { RunStore } from './stores/run-store.js'
import { RunEventEmitter } from './event-emitter.js'
import { cancellationManager } from './cancellation.js'
import { generateRunId, generateTraceId, now } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'
import { AppError } from '../shared/errors/app-error.js'
import { env } from '../shared/config/env.js'
import { runScheduler } from './scheduler.js'
import type { SessionSummaryService } from '../features/sessions/session-summary.service.js'
import { extractUserMessage, buildAssistantText } from '../features/sessions/conversation-context.utils.js'

// ============================================================
// RunContext — 单次 Run 的执行上下文
// ============================================================
export type RunContext = {
  runId: string
  traceId: string
  /** 本次 Run 实际希望执行的入口 Agent；为空时由执行器路由选择默认 Agent。 */
  agentId?: string
  userId?: string
  sessionId?: string
  signal: AbortSignal
  depth: number        // 当前 A2A 调用深度
  callCount: number    // 当前 Run 总 A2A 调用次数
  totalCostUsd: number // 当前 Run 累计估算成本（USD），用于 costBudget 检查
}

// ============================================================
// RunManager — Run 生命周期核心管理器
// ============================================================

export type CreateRunOptions = {
  input: unknown
  agentId?: string
  userId?: string
  projectId?: string
  sessionId?: string
  conversationContext?: ConversationContext
  idempotencyKey?: string
}

export type AgentExecutor = {
  agentId: string
  execute(input: AgentInput, context: RunContext): Promise<AgentOutput>
}

export class RunManager {
  private activeContexts = new Map<string, RunContext>()
  private emitter: RunEventEmitter

  constructor(
    private store: RunStore,
    private executor?: AgentExecutor,
    private sessionSummaryService?: SessionSummaryService,
  ) {
    this.emitter = new RunEventEmitter(store)
  }

  setExecutor(executor: AgentExecutor) {
    this.executor = executor
  }

  async createRun(options: CreateRunOptions): Promise<Run> {
    const runId = generateRunId()
    const traceId = generateTraceId()

    // 队列满了时快速失败（Scheduler 会在 maxQueueSize 超出时 reject）
    const run = await this.store.createRun({
      id: runId,
      traceId,
      userId: options.userId,
      projectId: options.projectId,
      agentId: options.agentId,
      sessionId: options.sessionId,
      input: options.input,
      idempotencyKey: options.idempotencyKey,
    })

    const signal = cancellationManager.create(runId)
    const context: RunContext = {
      runId,
      traceId,
      agentId: options.agentId,
      userId: options.userId,
      sessionId: options.sessionId,
      signal,
      depth: 0,
      callCount: 0,
      totalCostUsd: 0,
    }
    this.activeContexts.set(runId, context)

    logger.info('[RunManager] Run created', { runId, traceId, agentId: options.agentId })

    // 发出 run.started 事件
    await this.emitter.emit({ type: EVENT_TYPES.RUN_STARTED, runId, agentId: options.agentId, timestamp: now() })

    this.enqueueRun(run, context, options)

    return run
  }

  /**
   * 从持久化 Run 记录恢复执行。
   *
   * 生产环境进程重启后，RunRecoveryWorker 会把 stale 的 queued/running Run
   * 重新交给 RunManager。这里复用原 runId/traceId/input，避免创建重复 Run；
   * ToolInvocation 与 Artifact 写入依赖幂等键兜底，保证重复恢复不会重复产物。
   */
  async resumeRun(run: Run): Promise<boolean> {
    if (run.status !== RUN_STATUS.QUEUED && run.status !== RUN_STATUS.RUNNING) return false
    if (this.activeContexts.has(run.id)) return false

    const signal = cancellationManager.create(run.id)
    const context: RunContext = {
      runId: run.id,
      traceId: run.traceId,
      agentId: run.agentId,
      userId: run.userId,
      sessionId: run.sessionId,
      signal,
      depth: 0,
      callCount: 0,
      totalCostUsd: 0,
    }
    this.activeContexts.set(run.id, context)

    this.enqueueRun(run, context, {
      input: run.input,
      agentId: run.agentId,
      userId: run.userId,
      projectId: run.projectId,
      sessionId: run.sessionId,
      idempotencyKey: run.idempotencyKey,
    })
    logger.warn('[RunManager] Stale run resumed', { runId: run.id, traceId: run.traceId })
    return true
  }

  private enqueueRun(run: Run, context: RunContext, options: CreateRunOptions): void {
    runScheduler
      .schedule(() => this.executeRun(run, context, options), {
        id: run.id,
        priority: 5,
        waitTimeoutMs: env.RUN_TIMEOUT_MS,
      })
      .catch((err) => {
        logger.error('[RunManager] Scheduler rejected run', {
          runId: run.id,
          traceId: run.traceId,
          errorCode: err instanceof Error ? err.message : 'SCHEDULER_ERROR',
        })
        this.store.updateRunStatus(run.id, RUN_STATUS.FAILED, {
          error: {
            code: 'RUN_TIMEOUT',
            message: err instanceof Error ? err.message : 'Scheduler rejected run',
          },
        }).catch(() => {})
      })
  }

  private async executeRun(run: Run, context: RunContext, options: CreateRunOptions): Promise<void> {
    const { runId, traceId } = context

    await this.store.updateRunStatus(runId, RUN_STATUS.RUNNING)

    // 超时控制
    const timeout = setTimeout(() => {
      cancellationManager.cancel(runId, 'timeout')
    }, env.RUN_TIMEOUT_MS)

    try {
      if (!this.executor) {
        throw new AppError('INTERNAL_ERROR', 'No agent executor configured')
      }

      const agentInput: AgentInput = {
        runId,
        traceId,
        userId: options.userId,
        projectId: options.projectId,
        sessionId: options.sessionId,
        conversationContext: options.conversationContext,
        payload: options.input,
        signal: context.signal,
      }

      const result = await this.executor.execute(agentInput, context)

      await this.store.updateRunStatus(runId, RUN_STATUS.COMPLETED, { output: result.output })
      await this.emitter.emit({ type: EVENT_TYPES.RUN_COMPLETED, runId, agentId: options.agentId ?? this.executor.agentId, timestamp: now() })

      this.scheduleSessionSummaryUpdate(options, result.output)

      logger.info('[RunManager] Run completed', { runId, traceId })
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'

      if (isAbort) {
        await this.store.updateRunStatus(runId, RUN_STATUS.CANCELLED)
        await this.emitter.emit({ type: EVENT_TYPES.RUN_CANCELLED, runId, reason: 'cancelled by user', timestamp: now() })
        logger.info('[RunManager] Run cancelled', { runId, traceId })
      } else {
        const appErr = err instanceof AppError ? err : new AppError('INTERNAL_ERROR', String(err))
        await this.store.updateRunStatus(runId, RUN_STATUS.FAILED, {
          error: { code: appErr.code, message: appErr.message },
        })
        await this.emitter.emit({
          type: EVENT_TYPES.RUN_FAILED,
          runId,
          reason: appErr.message,
          errorCode: appErr.code,
          timestamp: now(),
        })
        logger.error('[RunManager] Run failed', { runId, traceId, errorCode: appErr.code })
      }
    } finally {
      clearTimeout(timeout)
      this.activeContexts.delete(runId)
      cancellationManager.cleanup(runId)
    }
  }

  async cancelRun(runId: string): Promise<boolean> {
    const cancelled = cancellationManager.cancel(runId, 'user_cancel')
    if (!cancelled) return false
    logger.info('[RunManager] Run cancellation requested', { runId })
    return true
  }

  getContext(runId: string): RunContext | undefined {
    return this.activeContexts.get(runId)
  }

  async getRun(runId: string): Promise<Run | null> {
    return this.store.getRun(runId)
  }

  async listEvents(runId: string) {
    return this.store.listEvents(runId)
  }

  getEmitter(): RunEventEmitter {
    return this.emitter
  }

  /**
   * Run 成功后异步更新会话滚动摘要。
   */
  private scheduleSessionSummaryUpdate(options: CreateRunOptions, output: unknown): void {
    if (!this.sessionSummaryService || !options.sessionId || !options.userId) return

    const userMessage = extractUserMessage(options.input)
    let assistantText = ''
    if (output && typeof output === 'object' && output !== null && 'answer' in output) {
      assistantText = String((output as { answer?: unknown }).answer ?? '')
    }
    if (!assistantText && output) {
      assistantText = buildAssistantText([], output)
    }
    if (!userMessage && !assistantText) return

    this.sessionSummaryService.scheduleUpdate({
      sessionId: options.sessionId,
      userId: options.userId,
      userMessage,
      assistantText,
    })
  }
}

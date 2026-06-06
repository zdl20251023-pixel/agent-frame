import type { A2ARouter } from '../a2a/a2a-router.js'
import type { RunStore } from '../runtime/stores/run-store.js'
import type { RunContext } from '../runtime/run-manager.js'
import { agentTaskStore, type AgentTask } from './agent-task.store.js'
import { RunEventEmitter } from '../runtime/event-emitter.js'
import { logger } from '../shared/observability/logger.js'
import { buildA2ACompletedEvent, buildA2AFailedEvent, buildA2AStartedEvent } from '../a2a/a2a-events.js'
import { NL_TO_HAND_INNER_REPAIR_AGENT_ID } from '../features/agent-tools/nl-to-hand-async.constants.js'

// ============================================================
// queues/agent-task.worker.ts — 异步 Agent 任务消费者
//
// 设计依据：FRAMEWORK_DESIGN §40.10 队列与 Worker 的后续实现边界
//
// MVP 阶段使用轮询（setInterval）模拟 Queue Consumer
// 后续可替换为 BullMQ / Redis Stream 真正的队列消费者
//
// 职责：
// - 定期轮询 agent_tasks 表，获取 queued 状态的任务
// - 执行目标 Agent（通过 A2ARouter）
// - 更新任务状态（running → completed/failed）
// - 发出 agent.call.started / completed / failed 事件
// ============================================================

export type WorkerOptions = {
  pollIntervalMs?: number  // 轮询间隔，默认 2000ms
  batchSize?: number       // 每次处理的任务数，默认 2
  enabled?: boolean        // 是否启用，默认 true
}

export class AgentTaskWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private isRunning = false
  private emitter: RunEventEmitter

  constructor(
    private readonly store: RunStore,
    private readonly router: A2ARouter,
    private readonly options: WorkerOptions = {},
  ) {
    this.emitter = new RunEventEmitter(store)
  }

  /** 启动 Worker 轮询 */
  start(): void {
    if (this.options.enabled === false) {
      logger.info('[AgentTaskWorker] Worker disabled (WORKER_ENABLED=false)')
      return
    }
    const interval = this.options.pollIntervalMs ?? 2000
    this.timer = setInterval(() => this.processNextBatch(), interval)
    logger.info('[AgentTaskWorker] Worker started', { pollIntervalMs: interval })
  }

  /** 停止 Worker */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    logger.info('[AgentTaskWorker] Worker stopped')
  }

  /** 处理下一批任务（可手动调用，便于测试）*/
  async processNextBatch(): Promise<number> {
    if (this.isRunning) return 0
    this.isRunning = true

    try {
      const batchSize = this.options.batchSize ?? 2
      const tasks = await agentTaskStore.claimNextPending(batchSize, {
        excludeToAgentIds: [NL_TO_HAND_INNER_REPAIR_AGENT_ID],
      })
      if (tasks.length === 0) return 0

      logger.debug('[AgentTaskWorker] Processing batch', { count: tasks.length })

      // 并行处理（小批量）
      await Promise.all(tasks.map((task) => this.processTask(task)))
      return tasks.length
    } catch {
      logger.error('[AgentTaskWorker] Batch processing error', { errorCode: 'WORKER_ERROR' })
      return 0
    } finally {
      this.isRunning = false
    }
  }

  private async processTask(task: AgentTask): Promise<void> {
    const log = logger.child({
      taskId: task.id,
      parentRunId: task.parentRunId,
      childRunId: task.childRunId,
      toAgentId: task.toAgentId,
    })

    log.info('[AgentTaskWorker] Processing task')

    const startMs = Date.now()

    // 发出 agent.call.started 事件
    await this.emitter.emit(
      buildA2AStartedEvent({
        runId: task.parentRunId,
        traceId: task.childRunId,
        stepId: task.id,
        fromAgentId: task.fromAgentId,
        toAgentId: task.toAgentId,
      }),
    )

    try {
      // 解析目标 Agent（通过 A2ARouter）
      const adapter = this.router.resolve(task.toAgentId)

      // 构造执行上下文
      const context: RunContext = {
        runId: task.parentRunId,
        traceId: task.childRunId,
        signal: new AbortController().signal,
        depth: 1,
        callCount: 1,
        totalCostUsd: 0,
      }

      // 执行 Agent
      const result = await adapter.execute(
        {
          runId: task.childRunId,
          traceId: task.childRunId,
          payload: task.input,
          signal: context.signal,
        },
        context,
      )

      // 标记完成
      await agentTaskStore.markCompleted(task.id, result.output)

      // 发出 completed 事件
      await this.emitter.emit(
        buildA2ACompletedEvent({
          runId: task.parentRunId,
          traceId: task.childRunId,
          stepId: task.id,
          fromAgentId: task.fromAgentId,
          toAgentId: task.toAgentId,
          latencyMs: Date.now() - startMs,
        }),
      )

      log.info('[AgentTaskWorker] Task completed')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const error = { code: 'WORKER_TASK_FAILED', message }

      // 判断是否应该重试（只有系统错误才重试，权限错误不重试）
      const canRetry = !(err instanceof Error && (
        message.includes('not allowed') ||
        message.includes('DENIED') ||
        message.includes('not found')
      ))

      await agentTaskStore.markFailed(task.id, error, canRetry)

      // 发出 failed 事件
      await this.emitter.emit(
        buildA2AFailedEvent({
          runId: task.parentRunId,
          traceId: task.childRunId,
          stepId: task.id,
          fromAgentId: task.fromAgentId,
          toAgentId: task.toAgentId,
          error,
        }),
      )

      log.error('[AgentTaskWorker] Task failed', { errorCode: 'WORKER_TASK_FAILED', error: message })
    }
  }
}

import { logger } from '../shared/observability/logger.js'

// ============================================================
// runtime/scheduler.ts — Run 并发控制 + 优先级队列
//
// 设计依据：PERFECTION_PLAN §6.3
//
// 职责：
// - 限制同时执行的 Run 数量（maxConcurrent）
// - 提供优先级队列（priority 越小越先执行）
// - 支持等待超时（enqueue 时可设置 waitTimeoutMs）
// - 指标统计（可复用 shared/observability/metrics.ts）
//
// 设计决策：
// - Scheduler 是独立模块，RunManager 调用 scheduler.schedule() 而不是直接执行
// - 分离"调度决策"和"执行逻辑"，保持 RunManager 简洁
// - 当前实现使用内存优先级队列（已满足 MVP 规模需求）
//   后续若需分布式调度，可替换为 Redis ZSET 优先级队列
// ============================================================

export type SchedulerPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type ScheduledTask<T> = {
  id: string
  priority: SchedulerPriority
  enqueuedAt: number
  waitTimeoutMs: number
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export type SchedulerConfig = {
  /** 最大并发执行数，默认 10 */
  maxConcurrent?: number
  /** 队列容量上限，默认 100（超出时 schedule() 直接拒绝）*/
  maxQueueSize?: number
  /** 默认入队等待超时（ms），默认 60000 */
  defaultWaitTimeoutMs?: number
}

export type SchedulerStats = {
  running: number
  queued: number
  completed: number
  rejected: number
  timedOut: number
}

/**
 * Scheduler — 并发控制 + 优先级队列
 *
 * 使用方式：
 *   const scheduler = new Scheduler({ maxConcurrent: 5 })
 *   const result = await scheduler.schedule(() => runAgent(), { priority: 1 })
 */
export class Scheduler {
  private readonly maxConcurrent: number
  private readonly maxQueueSize: number
  private readonly defaultWaitTimeoutMs: number

  private runningCount = 0
  private queue: ScheduledTask<unknown>[] = []

  private stats: SchedulerStats = {
    running: 0,
    queued: 0,
    completed: 0,
    rejected: 0,
    timedOut: 0,
  }

  constructor(config: SchedulerConfig = {}) {
    this.maxConcurrent = config.maxConcurrent ?? 10
    this.maxQueueSize = config.maxQueueSize ?? 100
    this.defaultWaitTimeoutMs = config.defaultWaitTimeoutMs ?? 60000
  }

  /**
   * schedule() — 提交一个任务到调度器
   *
   * 如果当前并发数 < maxConcurrent，立即执行
   * 否则加入优先级队列，等待空位
   *
   * 若队列已满，直接 reject（SCHEDULER_QUEUE_FULL）
   * 若等待超时，直接 reject（SCHEDULER_TIMEOUT）
   *
   * @param execute 要执行的异步函数
   * @param options 优先级（1=最高）、任务 ID、等待超时
   */
  schedule<T>(
    execute: () => Promise<T>,
    options: {
      id?: string
      priority?: SchedulerPriority
      waitTimeoutMs?: number
    } = {},
  ): Promise<T> {
    const { id = crypto.randomUUID(), priority = 5, waitTimeoutMs = this.defaultWaitTimeoutMs } = options

    return new Promise<T>((resolve, reject) => {
      // 队列满了直接拒绝
      if (this.queue.length >= this.maxQueueSize) {
        this.stats.rejected++
        logger.warn('[Scheduler] Queue full, rejecting task', {
          taskId: id,
          queueSize: this.queue.length,
          maxQueueSize: this.maxQueueSize,
          errorCode: 'SCHEDULER_QUEUE_FULL',
        })
        reject(new Error(`Scheduler queue full (max ${this.maxQueueSize})`))
        return
      }

      const task: ScheduledTask<T> = {
        id,
        priority,
        enqueuedAt: Date.now(),
        waitTimeoutMs,
        execute,
        resolve: resolve as (v: T) => void,
        reject,
      }

      if (this.runningCount < this.maxConcurrent) {
        // 立即执行
        this.executeTask(task as ScheduledTask<unknown>)
      } else {
        // 加入队列
        this.enqueue(task as ScheduledTask<unknown>)

        // 设置等待超时
        const timer = setTimeout(() => {
          const idx = this.queue.findIndex((t) => t.id === id)
          if (idx !== -1) {
            this.queue.splice(idx, 1)
            this.stats.timedOut++
            this.stats.queued--
            logger.warn('[Scheduler] Task timed out in queue', {
              taskId: id,
              waitMs: Date.now() - task.enqueuedAt,
              errorCode: 'SCHEDULER_TIMEOUT',
            })
            reject(new Error(`Task timed out waiting in scheduler queue (${waitTimeoutMs}ms)`))
          }
        }, waitTimeoutMs)

        // 覆盖 reject 以确保超时 timer 被清理
        const originalReject = task.reject
        task.reject = (reason) => {
          clearTimeout(timer)
          originalReject(reason)
        }
        const originalResolve = task.resolve
        task.resolve = (value) => {
          clearTimeout(timer)
          originalResolve(value)
        }
      }
    })
  }

  /** 加入优先级队列（按 priority 升序，同优先级按 enqueuedAt 升序）*/
  private enqueue(task: ScheduledTask<unknown>): void {
    let insertIdx = this.queue.length
    for (let i = 0; i < this.queue.length; i++) {
      const existing = this.queue[i]
      if (
        task.priority < existing.priority ||
        (task.priority === existing.priority && task.enqueuedAt < existing.enqueuedAt)
      ) {
        insertIdx = i
        break
      }
    }
    this.queue.splice(insertIdx, 0, task)
    this.stats.queued++
    logger.debug('[Scheduler] Task enqueued', {
      taskId: task.id,
      priority: task.priority,
      queueDepth: this.queue.length,
    })
  }

  private async executeTask(task: ScheduledTask<unknown>): Promise<void> {
    this.runningCount++
    this.stats.running = this.runningCount

    const waitMs = Date.now() - task.enqueuedAt
    logger.debug('[Scheduler] Task executing', { taskId: task.id, waitMs, running: this.runningCount })

    try {
      const result = await task.execute()
      task.resolve(result)
      this.stats.completed++
    } catch (err) {
      task.reject(err)
    } finally {
      this.runningCount--
      this.stats.running = this.runningCount
      this.processNext()
    }
  }

  private processNext(): void {
    if (this.queue.length === 0 || this.runningCount >= this.maxConcurrent) return

    const next = this.queue.shift()!
    this.stats.queued--
    this.executeTask(next)
  }

  /** 获取当前调度器状态 */
  getStats(): SchedulerStats {
    return { ...this.stats, queued: this.queue.length, running: this.runningCount }
  }

  /** 获取当前队列中任务 ID 列表（调试用）*/
  getQueuedTaskIds(): string[] {
    return this.queue.map((t) => t.id)
  }
}

/** 全局 RunScheduler 单例（供 RunManager 使用）*/
export const runScheduler = new Scheduler({
  maxConcurrent: Number(process.env.MAX_CONCURRENT_RUNS ?? 10),
  maxQueueSize: 100,
  defaultWaitTimeoutMs: 60000,
})

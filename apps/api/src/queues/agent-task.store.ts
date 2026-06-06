import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { agentTasks } from '../shared/db/schema.js'
import { getDb } from '../shared/db/client.js'
import { mysqlNow } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'
import { AGENT_TASK_STATUSES } from '@agent-frame/shared'

// ============================================================
// queues/agent-task.store.ts — AgentTask MySQL 存储
//
// 设计依据：FRAMEWORK_DESIGN §40.11 异步 A2A MySQL 状态表
//
// 职责：
// - 创建异步任务记录（queued 状态）
// - 更新任务状态（running/completed/failed/cancelled）
// - 查询待执行任务（供 Worker 轮询）
// - 查询任务详情（供 GET /agent-tasks/:taskId）
// ============================================================

export type AgentTask = {
  id: string
  parentRunId: string
  childRunId: string
  fromAgentId: string
  toAgentId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  input: unknown
  output?: unknown
  error?: { code: string; message: string }
  idempotencyKey?: string
  retryCount: number
  maxRetries: number
  priority: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  updatedAt: string
}

export type CreateAgentTaskInput = {
  id: string
  parentRunId: string
  childRunId: string
  fromAgentId: string
  toAgentId: string
  input: unknown
  idempotencyKey?: string
  maxRetries?: number
  priority?: number
}

export class AgentTaskStore {
  private get db() {
    return getDb()
  }

  async create(task: CreateAgentTaskInput): Promise<AgentTask> {
    if (task.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(task.idempotencyKey)
      if (existing) return existing
    }

    const now = mysqlNow()
    await this.db.insert(agentTasks).values({
      id: task.id,
      parentRunId: task.parentRunId,
      childRunId: task.childRunId,
      fromAgentId: task.fromAgentId,
      toAgentId: task.toAgentId,
      status: AGENT_TASK_STATUSES.QUEUED,
      input: task.input as Record<string, unknown>,
      idempotencyKey: task.idempotencyKey ?? null,
      retryCount: 0,
      maxRetries: task.maxRetries ?? 3,
      priority: task.priority ?? 5,
      createdAt: now,
      updatedAt: now,
    })
    const created = await this.findById(task.id)
    if (!created) throw new Error(`AgentTask not found after create: ${task.id}`)
    return created
  }

  async findById(id: string): Promise<AgentTask | null> {
    const rows = await this.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, id))
      .limit(1)
    if (rows.length === 0) return null
    return this.mapRow(rows[0])
  }

  async findByParentRunId(parentRunId: string): Promise<AgentTask[]> {
    const rows = await this.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.parentRunId, parentRunId))
    return rows.map(this.mapRow)
  }

  async findByChildRunId(childRunId: string): Promise<AgentTask | null> {
    const rows = await this.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.childRunId, childRunId))
      .limit(1)
    if (rows.length === 0) return null
    return this.mapRow(rows[0])
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<AgentTask | null> {
    const rows = await this.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.idempotencyKey, idempotencyKey))
      .limit(1)
    if (rows.length === 0) return null
    return this.mapRow(rows[0])
  }

  /** 获取待执行任务（供 Worker 轮询，按优先级升序）*/
  async claimNextPending(
    workerLimit = 1,
    options: { toAgentId?: string; excludeToAgentIds?: string[] } = {},
  ): Promise<AgentTask[]> {
    const filters = [eq(agentTasks.status, AGENT_TASK_STATUSES.QUEUED)]
    if (options.toAgentId) filters.push(eq(agentTasks.toAgentId, options.toAgentId))
    if (options.excludeToAgentIds?.length) {
      filters.push(notInArray(agentTasks.toAgentId, options.excludeToAgentIds))
    }

    const rows = await this.db
      .select()
      .from(agentTasks)
      .where(and(...filters))
      .limit(workerLimit)
    if (rows.length === 0) return []

    // 原子标记为 running
    const ids = rows.map((r) => r.id)
    await this.db
      .update(agentTasks)
      .set({ status: AGENT_TASK_STATUSES.RUNNING, startedAt: mysqlNow(), updatedAt: mysqlNow() })
      .where(inArray(agentTasks.id, ids))

    return rows.map(this.mapRow).map((t) => ({ ...t, status: AGENT_TASK_STATUSES.RUNNING as AgentTask['status'] }))
  }

  async markRunning(id: string): Promise<void> {
    await this.db
      .update(agentTasks)
      .set({ status: AGENT_TASK_STATUSES.RUNNING, startedAt: mysqlNow(), updatedAt: mysqlNow() })
      .where(eq(agentTasks.id, id))
  }

  async markCompleted(id: string, output: unknown): Promise<void> {
    const now = mysqlNow()
    await this.db
      .update(agentTasks)
      .set({
        status: AGENT_TASK_STATUSES.COMPLETED,
        output: output as Record<string, unknown>,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(agentTasks.id, id))
  }

  async markFailed(id: string, error: { code: string; message: string }, canRetry = false): Promise<void> {
    const row = await this.findById(id)
    if (!row) return

    const newRetryCount = row.retryCount + 1
    const shouldRetry = canRetry && newRetryCount <= row.maxRetries

    await this.db
      .update(agentTasks)
      .set({
        status: shouldRetry ? AGENT_TASK_STATUSES.QUEUED : AGENT_TASK_STATUSES.FAILED,
        error: error as unknown as Record<string, unknown>,
        retryCount: newRetryCount,
        updatedAt: mysqlNow(),
      })
      .where(eq(agentTasks.id, id))

    if (shouldRetry) {
      logger.info('[AgentTaskStore] Task re-queued for retry', {
        taskId: id,
        retryCount: newRetryCount,
        maxRetries: row.maxRetries,
      })
    }
  }

  async markCancelled(id: string): Promise<void> {
    await this.db
      .update(agentTasks)
      .set({ status: AGENT_TASK_STATUSES.CANCELLED, updatedAt: mysqlNow() })
      .where(eq(agentTasks.id, id))
  }

  private mapRow(row: typeof agentTasks.$inferSelect): AgentTask {
    return {
      id: row.id,
      parentRunId: row.parentRunId,
      childRunId: row.childRunId,
      fromAgentId: row.fromAgentId,
      toAgentId: row.toAgentId,
      status: row.status as AgentTask['status'],
      input: row.input,
      output: row.output ?? undefined,
      error: row.error as { code: string; message: string } | undefined,
      idempotencyKey: row.idempotencyKey ?? undefined,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      priority: row.priority,
      createdAt: row.createdAt,
      startedAt: row.startedAt ?? undefined,
      completedAt: row.completedAt ?? undefined,
      updatedAt: row.updatedAt,
    }
  }
}

export const agentTaskStore = new AgentTaskStore()

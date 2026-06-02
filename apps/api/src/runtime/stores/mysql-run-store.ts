import { and, asc, eq, desc } from 'drizzle-orm'
import type {
  Run,
  RunStatus,
  Step,
  AgentEvent,
  CreateRunInput,
  CreateStepInput,
  UpdateStepInput,
} from '@agent-frame/shared'
import type { RunStore } from './run-store.js'
import { getDb } from '../../shared/db/client.js'
import { runs, steps, runEvents } from '../../shared/db/schema.js'
import { mysqlNow, toMySQL } from '../../shared/db/datetime.js'
import { logger } from '../../shared/observability/logger.js'
import { AppError } from '../../shared/errors/app-error.js'

// ============================================================
// MySQLRunStore — 基于 Drizzle ORM 的 MySQL 持久化实现
// ============================================================

export class MySQLRunStore implements RunStore {
  private get db() {
    return getDb()
  }

  // ─── Run 操作 ───────────────────────────────────────────────

  async createRun(input: CreateRunInput & { id: string }): Promise<Run> {
    const ts = mysqlNow()
    await this.db.insert(runs).values({
      id: input.id,
      traceId: input.traceId,
      userId: input.userId ?? null,
      projectId: input.projectId ?? null,
      agentId: input.agentId ?? null,
      sessionId: input.sessionId ?? null,
      status: 'queued',
      input: input.input,
      output: null,
      error: null,
      createdAt: ts,
      updatedAt: ts,
    })

    const run = await this.getRun(input.id)
    if (!run) throw new AppError('INTERNAL_ERROR', 'Failed to create run in MySQL')
    logger.debug('[MySQLRunStore] createRun', { runId: input.id })
    return run
  }

  async getRun(runId: string): Promise<Run | null> {
    const rows = await this.db
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1)

    if (rows.length === 0) return null
    return this.mapRun(rows[0])
  }

  async updateRunStatus(
    runId: string,
    status: RunStatus,
    options?: { output?: unknown; error?: unknown },
  ): Promise<void> {
    await this.db
      .update(runs)
      .set({
        status,
        output: options?.output ?? null,
        error: options?.error ?? null,
        updatedAt: mysqlNow(),
      })
      .where(eq(runs.id, runId))

    logger.debug('[MySQLRunStore] updateRunStatus', { runId, status })
  }

  async listRuns(limit = 20): Promise<Run[]> {
    const rows = await this.db
      .select()
      .from(runs)
      .orderBy(desc(runs.createdAt))
      .limit(limit)

    return rows.map(this.mapRun)
  }

  async listRunsByUser(userId: string, limit = 20): Promise<Run[]> {
    const rows = await this.db
      .select()
      .from(runs)
      .where(eq(runs.userId, userId))
      .orderBy(desc(runs.createdAt))
      .limit(limit)

    return rows.map(this.mapRun)
  }

  async listRunsBySession(sessionId: string, userId: string): Promise<Run[]> {
    const rows = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.sessionId, sessionId), eq(runs.userId, userId)))
      .orderBy(asc(runs.createdAt))

    return rows.map(this.mapRun)
  }

  // ─── Step 操作 ─────────────────────────────────────────────

  async createStep(input: CreateStepInput): Promise<Step> {
    const ts = mysqlNow()
    await this.db.insert(steps).values({
      id: input.id,
      runId: input.runId,
      parentStepId: input.parentStepId ?? null,
      type: input.type,
      status: 'running',
      agentId: input.agentId ?? null,
      fromAgentId: input.fromAgentId ?? null,
      toAgentId: input.toAgentId ?? null,
      input: input.input ?? null,
      output: null,
      error: null,
      startedAt: ts,
      endedAt: null,
    })

    const step = await this.getStep(input.id)
    if (!step) throw new AppError('INTERNAL_ERROR', 'Failed to create step in MySQL')
    return step
  }

  async updateStep(stepId: string, update: UpdateStepInput): Promise<void> {
    const endedAt = update.endedAt
      ? toMySQL(update.endedAt)
      : (update.status !== 'running' ? mysqlNow() : null)
    await this.db
      .update(steps)
      .set({
        status: update.status,
        output: update.output ?? null,
        error: update.error ?? null,
        endedAt,
      })
      .where(eq(steps.id, stepId))
  }

  async getStep(stepId: string): Promise<Step | null> {
    const rows = await this.db
      .select()
      .from(steps)
      .where(eq(steps.id, stepId))
      .limit(1)

    if (rows.length === 0) return null
    return this.mapStep(rows[0])
  }

  async listSteps(runId: string): Promise<Step[]> {
    const rows = await this.db
      .select()
      .from(steps)
      .where(eq(steps.runId, runId))
      .orderBy(steps.startedAt)

    return rows.map(this.mapStep)
  }

  // ─── Event 操作 ────────────────────────────────────────────

  async appendEvent(runId: string, event: AgentEvent): Promise<void> {
    await this.db.insert(runEvents).values({
      runId,
      eventType: event.type,
      eventData: event,
      createdAt: mysqlNow(),
    })
  }

  async listEvents(runId: string): Promise<AgentEvent[]> {
    const rows = await this.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(runEvents.id)    // id 自增，保证顺序

    return rows.map((r) => r.eventData as AgentEvent)
  }

  // ─── 映射函数 ────────────────────────────────────────────

  // 使用箭头函数属性避免 .map(this.mapRun) 时 this 丢失
  private mapRun = (row: typeof runs.$inferSelect): Run => {
    return {
      id: row.id,
      traceId: row.traceId,
      userId: row.userId ?? undefined,
      projectId: row.projectId ?? undefined,
      agentId: row.agentId ?? undefined,
      sessionId: row.sessionId ?? undefined,
      status: row.status as RunStatus,
      input: row.input,
      output: row.output ?? undefined,
      error: row.error as Run['error'] ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private mapStep = (row: typeof steps.$inferSelect): Step => {
    return {
      id: row.id,
      runId: row.runId,
      parentStepId: row.parentStepId ?? undefined,
      type: row.type as Step['type'],
      status: row.status as Step['status'],
      agentId: row.agentId ?? undefined,
      fromAgentId: row.fromAgentId ?? undefined,
      toAgentId: row.toAgentId ?? undefined,
      input: row.input ?? undefined,
      output: row.output ?? undefined,
      error: row.error ?? undefined,
      startedAt: row.startedAt,
      endedAt: row.endedAt ?? undefined,
    }
  }
}

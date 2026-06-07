import type {
  Run,
  RunStatus,
  Step,
  AgentEvent,
  StoredAgentEvent,
  RunCheckpointPayload,
  CreateRunInput,
  CreateStepInput,
  UpdateStepInput,
  ToolInvocation,
  CreateToolInvocationInput,
  UpdateToolInvocationInput,
} from '@agent-frame/shared'
import { RUN_STATUS, STEP_STATUS, TOOL_INVOCATION_PHASE, TOOL_INVOCATION_STATUS } from '@agent-frame/shared'
import type { RunStore } from './run-store.js'
import { getDb } from '../../shared/db/client.js'
import { runs, steps, runEvents, toolInvocations } from '../../shared/db/schema.js'
import { mysqlNow, toMySQL } from '../../shared/db/datetime.js'
import { logger } from '../../shared/observability/logger.js'
import { AppError } from '../../shared/errors/app-error.js'
import { and, asc, eq, desc, lte, gt, inArray } from 'drizzle-orm'

// ============================================================
// MySQLRunStore — 基于 Drizzle ORM 的 MySQL 持久化实现
// ============================================================

export class MySQLRunStore implements RunStore {
  private get db() {
    return getDb()
  }

  // ─── Run 操作 ───────────────────────────────────────────────

  async createRun(input: CreateRunInput & { id: string }): Promise<Run> {
    if (input.idempotencyKey) {
      const existing = await this.getRunByIdempotencyKey(input.idempotencyKey, input.userId)
      if (existing) return existing
    }

    const ts = mysqlNow()
    await this.db.insert(runs).values({
      id: input.id,
      traceId: input.traceId,
      userId: input.userId ?? null,
      projectId: input.projectId ?? null,
      agentId: input.agentId ?? null,
      sessionId: input.sessionId ?? null,
      status: RUN_STATUS.QUEUED,
      input: input.input,
      output: null,
      error: null,
      idempotencyKey: input.idempotencyKey ?? null,
      checkpointPayload: null,
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

  async getRunByIdempotencyKey(idempotencyKey: string, userId?: string): Promise<Run | null> {
    const conditions = userId
      ? and(eq(runs.idempotencyKey, idempotencyKey), eq(runs.userId, userId))
      : eq(runs.idempotencyKey, idempotencyKey)
    const rows = await this.db.select().from(runs).where(conditions).limit(1)
    if (rows.length === 0) return null
    return this.mapRun(rows[0])
  }

  async updateRunCheckpoint(runId: string, checkpoint: RunCheckpointPayload): Promise<void> {
    await this.db
      .update(runs)
      .set({ checkpointPayload: checkpoint, updatedAt: mysqlNow() })
      .where(eq(runs.id, runId))
  }

  async listStaleRuns(options: {
    staleBefore: string
    statuses: RunStatus[]
    limit?: number
  }): Promise<Run[]> {
    const rows = await this.db
      .select()
      .from(runs)
      .where(
        and(
          inArray(runs.status, options.statuses),
          lte(runs.updatedAt, toMySQL(options.staleBefore)),
        ),
      )
      .orderBy(runs.updatedAt)
      .limit(options.limit ?? 50)
    return rows.map(this.mapRun)
  }

  async listActiveRunsBySession(sessionId: string, userId: string): Promise<Run[]> {
    const rows = await this.db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.sessionId, sessionId),
          eq(runs.userId, userId),
          inArray(runs.status, [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING]),
        ),
      )
      .orderBy(desc(runs.createdAt))
    return rows.map(this.mapRun)
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
      status: STEP_STATUS.RUNNING,
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
      : (update.status !== STEP_STATUS.RUNNING ? mysqlNow() : null)
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

  async appendEvent(runId: string, event: AgentEvent): Promise<number | undefined> {
    const ts = mysqlNow()
    const result = await this.db.insert(runEvents).values({
      runId,
      eventType: event.type,
      eventData: event,
      createdAt: ts,
    })
    return Number(result[0]?.insertId ?? 0) || undefined
  }

  async listEvents(runId: string): Promise<AgentEvent[]> {
    const rows = await this.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(runEvents.id)

    return rows.map((r) => r.eventData as AgentEvent)
  }

  async listStoredEvents(runId: string): Promise<StoredAgentEvent[]> {
    const rows = await this.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(runEvents.id)
    return rows.map((r) => ({
      id: r.id,
      event: r.eventData as AgentEvent,
      createdAt: r.createdAt,
    }))
  }

  async listEventsAfter(runId: string, afterEventId: number): Promise<StoredAgentEvent[]> {
    const rows = await this.db
      .select()
      .from(runEvents)
      .where(and(eq(runEvents.runId, runId), gt(runEvents.id, afterEventId)))
      .orderBy(runEvents.id)
    return rows.map((r) => ({
      id: r.id,
      event: r.eventData as AgentEvent,
      createdAt: r.createdAt,
    }))
  }

  // ─── ToolInvocation 操作 ───────────────────────────────────

  async createToolInvocation(input: CreateToolInvocationInput): Promise<ToolInvocation> {
    const existing = await this.getToolInvocationByIdempotencyKey(input.idempotencyKey)
    if (existing) return existing

    const ts = mysqlNow()
    await this.db.insert(toolInvocations).values({
      id: input.id,
      runId: input.runId,
      stepId: input.stepId,
      toolName: input.toolName,
      idempotencyKey: input.idempotencyKey,
      status: TOOL_INVOCATION_STATUS.PENDING,
      phase: TOOL_INVOCATION_PHASE.CREATED,
      inputHash: input.inputHash,
      inputPreview: input.inputPreview ?? null,
      recoveryPayload: null,
      outputRef: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      heartbeatAt: null,
      finishedAt: null,
      retryCount: 0,
      createdAt: ts,
      updatedAt: ts,
    })

    const invocation = await this.getToolInvocation(input.id)
    if (!invocation) throw new AppError('INTERNAL_ERROR', 'Failed to create tool invocation in MySQL')
    return invocation
  }

  async getToolInvocation(invocationId: string): Promise<ToolInvocation | null> {
    const rows = await this.db
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.id, invocationId))
      .limit(1)

    if (rows.length === 0) return null
    return this.mapToolInvocation(rows[0])
  }

  async getToolInvocationByIdempotencyKey(idempotencyKey: string): Promise<ToolInvocation | null> {
    const rows = await this.db
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.idempotencyKey, idempotencyKey))
      .limit(1)

    if (rows.length === 0) return null
    return this.mapToolInvocation(rows[0])
  }

  async updateToolInvocation(invocationId: string, update: UpdateToolInvocationInput): Promise<void> {
    await this.db
      .update(toolInvocations)
      .set({
        status: update.status,
        phase: update.phase,
        recoveryPayload: update.recoveryPayload,
        outputRef: update.outputRef,
        errorCode: update.errorCode,
        errorMessage: update.errorMessage,
        heartbeatAt: update.heartbeatAt ? toMySQL(update.heartbeatAt) : undefined,
        finishedAt: update.finishedAt ? toMySQL(update.finishedAt) : undefined,
        retryCount: update.retryCount,
        startedAt: update.status === TOOL_INVOCATION_STATUS.RUNNING ? mysqlNow() : undefined,
        updatedAt: mysqlNow(),
      })
      .where(eq(toolInvocations.id, invocationId))
  }

  async listToolInvocations(runId: string): Promise<ToolInvocation[]> {
    const rows = await this.db
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.runId, runId))
      .orderBy(toolInvocations.createdAt)

    return rows.map(this.mapToolInvocation)
  }

  async listRecoverableToolInvocations(options: { staleBefore: string; limit?: number }): Promise<ToolInvocation[]> {
    const rows = await this.db
      .select()
      .from(toolInvocations)
      .where(
        and(
          eq(toolInvocations.status, TOOL_INVOCATION_STATUS.RUNNING),
          lte(toolInvocations.updatedAt, toMySQL(options.staleBefore)),
        ),
      )
      .orderBy(toolInvocations.updatedAt)
      .limit(options.limit ?? 50)

    return rows.map(this.mapToolInvocation)
  }

  async listWaitingRepairToolInvocations(options: { limit?: number }): Promise<ToolInvocation[]> {
    const rows = await this.db
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.status, TOOL_INVOCATION_STATUS.WAITING_REPAIR))
      .orderBy(toolInvocations.updatedAt)
      .limit(options.limit ?? 50)
    return rows.map(this.mapToolInvocation)
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
      idempotencyKey: row.idempotencyKey ?? undefined,
      checkpointPayload: row.checkpointPayload as Run['checkpointPayload'] ?? undefined,
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

  private mapToolInvocation = (row: typeof toolInvocations.$inferSelect): ToolInvocation => ({
    id: row.id,
    runId: row.runId,
    stepId: row.stepId,
    toolName: row.toolName,
    idempotencyKey: row.idempotencyKey,
    status: row.status as ToolInvocation['status'],
    phase: row.phase as ToolInvocation['phase'],
    inputHash: row.inputHash,
    inputPreview: row.inputPreview ?? undefined,
    recoveryPayload: row.recoveryPayload ?? undefined,
    outputRef: row.outputRef ?? undefined,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    startedAt: row.startedAt ?? undefined,
    heartbeatAt: row.heartbeatAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    retryCount: row.retryCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

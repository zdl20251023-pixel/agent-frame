import type { WorkflowRun, WorkflowStageResult } from '@agent-frame/shared'
import { WORKFLOW_STATUS } from '@agent-frame/shared'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../shared/db/client.js'
import { mysqlNow } from '../shared/db/datetime.js'
import { workflowRuns } from '../shared/db/schema.js'
import { generateId, now } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// WorkflowStore — WorkflowRun 状态存储（内存 MVP 实现）
//
// 设计：
// - 接口与实现分离，后续可换 MySQL 实现
// - WorkflowRun 不依赖 Run 级别 Store，独立追踪 Stage 进度
// - 每个 Stage 完成后 upsert 对应 stageResult
// ============================================================

export interface WorkflowStore {
  createWorkflowRun(input: {
    workflowId: string
    runId: string
    stageIds: string[]
    stageNames: string[]
  }): Promise<WorkflowRun>

  getWorkflowRun(id: string): Promise<WorkflowRun | null>
  getWorkflowRunByRunId(runId: string): Promise<WorkflowRun | null>
  listWorkflowRuns(workflowId?: string): Promise<WorkflowRun[]>

  updateStatus(id: string, status: WorkflowRun['status'], extra?: {
    currentStageId?: string
    waitingHumanStageId?: string
    error?: { code: string; message: string }
  }): Promise<void>

  upsertStageResult(workflowRunId: string, result: WorkflowStageResult): Promise<void>
}

export class MemoryWorkflowStore implements WorkflowStore {
  private runs = new Map<string, WorkflowRun>()

  async createWorkflowRun(input: {
    workflowId: string
    runId: string
    stageIds: string[]
    stageNames: string[]
  }): Promise<WorkflowRun> {
    const id = `wfrun-${generateId()}`
    const ts = now()
    const run: WorkflowRun = {
      id,
      runId: input.runId,
      workflowId: input.workflowId,
      status: WORKFLOW_STATUS.PENDING,
      stageResults: input.stageIds.map((stageId, i) => ({
        stageId,
        stageName: input.stageNames[i] ?? stageId,
        status: 'pending',
        retryCount: 0,
      })),
      createdAt: ts,
      updatedAt: ts,
    }
    this.runs.set(id, run)
    logger.debug('[WorkflowStore] WorkflowRun created', { id, workflowId: input.workflowId })
    return run
  }

  async getWorkflowRun(id: string): Promise<WorkflowRun | null> {
    return this.runs.get(id) ?? null
  }

  async getWorkflowRunByRunId(runId: string): Promise<WorkflowRun | null> {
    for (const run of this.runs.values()) {
      if (run.runId === runId) return run
    }
    return null
  }

  async listWorkflowRuns(workflowId?: string): Promise<WorkflowRun[]> {
    const all = [...this.runs.values()]
    if (workflowId) return all.filter((r) => r.workflowId === workflowId)
    return all
  }

  async updateStatus(id: string, status: WorkflowRun['status'], extra?: {
    currentStageId?: string
    waitingHumanStageId?: string
    error?: { code: string; message: string }
  }): Promise<void> {
    const run = this.runs.get(id)
    if (!run) return
    run.status = status
    run.updatedAt = now()
    if (extra?.currentStageId !== undefined) run.currentStageId = extra.currentStageId
    if (extra?.waitingHumanStageId !== undefined) run.waitingHumanStageId = extra.waitingHumanStageId
    if (extra?.error !== undefined) run.error = extra.error
  }

  async upsertStageResult(workflowRunId: string, result: WorkflowStageResult): Promise<void> {
    const run = this.runs.get(workflowRunId)
    if (!run) return
    const idx = run.stageResults.findIndex((r) => r.stageId === result.stageId)
    if (idx >= 0) {
      run.stageResults[idx] = result
    } else {
      run.stageResults.push(result)
    }
    run.updatedAt = now()
  }
}

export class MySQLWorkflowStore implements WorkflowStore {
  private get db() {
    return getDb()
  }

  async createWorkflowRun(input: {
    workflowId: string
    runId: string
    stageIds: string[]
    stageNames: string[]
  }): Promise<WorkflowRun> {
    const id = `wfrun-${generateId()}`
    const ts = mysqlNow()
    const stageResults: WorkflowStageResult[] = input.stageIds.map((stageId, i) => ({
      stageId,
      stageName: input.stageNames[i] ?? stageId,
      status: 'pending',
      retryCount: 0,
    }))

    await this.db.insert(workflowRuns).values({
      id,
      runId: input.runId,
      workflowId: input.workflowId,
      status: WORKFLOW_STATUS.PENDING,
      currentStageId: null,
      waitingHumanStageId: null,
      stageResults,
      error: null,
      createdAt: ts,
      updatedAt: ts,
    })

    const run = await this.getWorkflowRun(id)
    if (!run) throw new Error(`Failed to create WorkflowRun: ${id}`)
    logger.debug('[MySQLWorkflowStore] WorkflowRun created', { id, workflowId: input.workflowId })
    return run
  }

  async getWorkflowRun(id: string): Promise<WorkflowRun | null> {
    const rows = await this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, id))
      .limit(1)
    return rows[0] ? this.mapRow(rows[0]) : null
  }

  async getWorkflowRunByRunId(runId: string): Promise<WorkflowRun | null> {
    const rows = await this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.runId, runId))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1)
    return rows[0] ? this.mapRow(rows[0]) : null
  }

  async listWorkflowRuns(workflowId?: string): Promise<WorkflowRun[]> {
    const query = this.db.select().from(workflowRuns).orderBy(desc(workflowRuns.createdAt))
    const rows = workflowId
      ? await query.where(eq(workflowRuns.workflowId, workflowId))
      : await query
    return rows.map((row) => this.mapRow(row))
  }

  async updateStatus(id: string, status: WorkflowRun['status'], extra?: {
    currentStageId?: string
    waitingHumanStageId?: string
    error?: { code: string; message: string }
  }): Promise<void> {
    await this.db
      .update(workflowRuns)
      .set({
        status,
        currentStageId: extra?.currentStageId ?? null,
        waitingHumanStageId: extra?.waitingHumanStageId ?? null,
        error: extra?.error ?? null,
        updatedAt: mysqlNow(),
      })
      .where(eq(workflowRuns.id, id))
  }

  async upsertStageResult(workflowRunId: string, result: WorkflowStageResult): Promise<void> {
    const run = await this.getWorkflowRun(workflowRunId)
    if (!run) return

    const nextStageResults = [...run.stageResults]
    const idx = nextStageResults.findIndex((stage) => stage.stageId === result.stageId)
    if (idx >= 0) {
      nextStageResults[idx] = result
    } else {
      nextStageResults.push(result)
    }

    await this.db
      .update(workflowRuns)
      .set({
        stageResults: nextStageResults,
        updatedAt: mysqlNow(),
      })
      .where(eq(workflowRuns.id, workflowRunId))
  }

  private mapRow(row: typeof workflowRuns.$inferSelect): WorkflowRun {
    return {
      id: row.id,
      runId: row.runId,
      workflowId: row.workflowId,
      status: row.status as WorkflowRun['status'],
      currentStageId: row.currentStageId ?? undefined,
      waitingHumanStageId: row.waitingHumanStageId ?? undefined,
      stageResults: (row.stageResults ?? []) as WorkflowStageResult[],
      error: row.error as WorkflowRun['error'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}

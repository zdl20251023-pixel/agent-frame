import type { WorkflowRun, WorkflowStageResult } from '@agent-frame/shared'
import { WORKFLOW_STATUS } from '@agent-frame/shared'
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

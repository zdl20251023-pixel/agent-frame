import { get, post } from '../../lib/http.ts'

// ──────────────────────────────────────────────────────────
// workflows.api.ts — Workflow 前端 API 客户端
// ──────────────────────────────────────────────────────────

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_human'
  | 'completed'
  | 'failed'

export type WorkflowStageRun = {
  stageId: string
  stageName: string
  status: WorkflowRunStatus
  startedAt?: string
  completedAt?: string
  stepId?: string
  output?: unknown
  error?: { code: string; message: string }
  retryCount: number
}

export type WorkflowRun = {
  id: string
  runId: string
  workflowId: string
  status: WorkflowRunStatus
  currentStageId?: string
  stageResults: WorkflowStageRun[]
  waitingHumanStageId?: string
  error?: { code: string; message: string }
  createdAt: string
  updatedAt: string
}

export async function listWorkflowRuns(): Promise<{ runs: WorkflowRun[]; total: number }> {
  return get('/workflows/runs')
}

export async function getWorkflowRun(runId: string): Promise<WorkflowRun> {
  return get(`/workflows/runs/${runId}`)
}

export async function startWorkflow(input: {
  workflowId: string
  input?: unknown
}): Promise<{ workflowRunId: string }> {
  return post(`/workflows/${input.workflowId}/runs`, { input: input.input })
}

export async function approveHumanGate(workflowRunId: string, stageId: string): Promise<void> {
  return post(`/workflows/runs/${workflowRunId}/stages/${stageId}/approve`, {})
}

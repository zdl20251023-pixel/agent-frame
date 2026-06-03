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
  status: WorkflowRunStatus
  startedAt?: string
  completedAt?: string
  agentId?: string
  artifactId?: string
  error?: string
}

export type WorkflowRun = {
  id: string
  workflowId: string
  status: WorkflowRunStatus
  currentStageId?: string
  stages: WorkflowStageRun[]
  input?: unknown
  output?: unknown
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
  return post('/workflows/start', input)
}

export async function approveHumanGate(workflowRunId: string, stageId: string): Promise<void> {
  return post(`/workflows/${workflowRunId}/stages/${stageId}/approve`, {})
}

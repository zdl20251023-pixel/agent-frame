// ============================================================
// Workflow 类型（MVP 预留，不实现 Runner）
// ============================================================

export type WorkflowDefinition = {
  id: string
  name: string
  description?: string
  stages: WorkflowStage[]
}

export type WorkflowStage = {
  id: string
  name: string
  agentId?: string
  requiredInputTypes?: string[]
  outputTypes?: string[]
  mode: 'sync' | 'async' | 'manual'
  timeoutMs?: number
}

export type WorkflowRun = {
  id: string
  runId: string
  workflowId: string
  currentStageId?: string
  status: 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  updatedAt: string
}

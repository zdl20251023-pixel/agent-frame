import type {
  ToolInvocationPhase,
  ToolInvocationStatus,
} from '../constants/tool-invocation-constants.js'

// ============================================================
// ToolInvocation — 一次 Tool 调用的可恢复状态模型
// ============================================================

export type ToolInvocation = {
  id: string
  runId: string
  stepId: string
  toolName: string
  idempotencyKey: string
  status: ToolInvocationStatus
  phase: ToolInvocationPhase
  inputHash: string
  inputPreview?: unknown
  /** 用于恢复器重放当前 phase 的最小载荷，例如 artifact_write 的写入参数。 */
  recoveryPayload?: unknown
  outputRef?: string
  errorCode?: string
  errorMessage?: string
  startedAt?: string
  heartbeatAt?: string
  finishedAt?: string
  retryCount: number
  createdAt: string
  updatedAt: string
}

export type CreateToolInvocationInput = {
  id: string
  runId: string
  stepId: string
  toolName: string
  idempotencyKey: string
  inputHash: string
  inputPreview?: unknown
}

export type UpdateToolInvocationInput = {
  status?: ToolInvocationStatus
  phase?: ToolInvocationPhase
  outputRef?: string
  recoveryPayload?: unknown
  errorCode?: string
  errorMessage?: string
  heartbeatAt?: string
  finishedAt?: string
  retryCount?: number
}

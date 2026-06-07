import type {
  ToolInvocationPhase,
  ToolInvocationStatus,
} from '../constants/tool-invocation-constants.js'

// ============================================================
// ToolInvocation — 一次 Tool 调用的可恢复状态模型
// ============================================================

export type ToolInvocation = {
  id: string                         // ToolInvocation 唯一 ID
  runId: string                      // 所属 Run ID
  stepId: string                     // 关联 Tool Call Step ID
  toolName: string                   // 工具名称
  idempotencyKey: string             // 工具调用幂等键
  status: ToolInvocationStatus       // 工具调用状态
  phase: ToolInvocationPhase         // 当前执行阶段
  inputHash: string                  // 工具输入哈希
  inputPreview?: unknown             // 工具输入预览
  recoveryPayload?: unknown          // 恢复器重放当前 phase 的最小载荷
  outputRef?: string                 // 输出引用，通常为 Artifact ID
  errorCode?: string                 // 失败错误码
  errorMessage?: string              // 失败错误说明
  startedAt?: string                 // 开始时间（ISO 8601）
  heartbeatAt?: string               // 最近心跳时间（ISO 8601）
  finishedAt?: string                // 完成时间（ISO 8601）
  retryCount: number                 // 已重试次数
  createdAt: string                  // 创建时间（ISO 8601）
  updatedAt: string                  // 更新时间（ISO 8601）
}

export type CreateToolInvocationInput = {
  id: string                 // ToolInvocation 唯一 ID
  runId: string              // 所属 Run ID
  stepId: string             // 关联 Tool Call Step ID
  toolName: string           // 工具名称
  idempotencyKey: string     // 工具调用幂等键
  inputHash: string          // 工具输入哈希
  inputPreview?: unknown     // 工具输入预览
}

export type UpdateToolInvocationInput = {
  status?: ToolInvocationStatus  // 更新后的工具调用状态
  phase?: ToolInvocationPhase    // 更新后的工具执行阶段
  outputRef?: string             // 输出引用，通常为 Artifact ID
  recoveryPayload?: unknown      // 恢复器重放所需载荷
  errorCode?: string             // 失败错误码
  errorMessage?: string          // 失败错误说明
  heartbeatAt?: string           // 最近心跳时间（ISO 8601）
  finishedAt?: string            // 完成时间（ISO 8601）
  retryCount?: number            // 已重试次数
}

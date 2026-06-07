// ============================================================
// SessionProjection — 会话级统一状态投影
// 前端单一数据源，避免 Run / ToolInvocation / AgentTask / Artifact 多源拼装。
// ============================================================

import type { RunStatus } from '../constants/run-constants.js'
import type { ToolInvocationStatus, ToolInvocationPhase } from '../constants/tool-invocation-constants.js'

export type SessionProjectionActiveRun = {
  runId: string        // 活跃 Run ID
  traceId: string      // 链路追踪 ID
  agentId?: string     // 当前 Run 目标 Agent ID
  status: RunStatus    // Run 当前状态
  createdAt: string    // Run 创建时间（ISO 8601）
  updatedAt: string    // Run 更新时间（ISO 8601）
}

export type SessionProjectionToolInvocation = {
  id: string                         // ToolInvocation ID
  runId: string                      // 所属 Run ID
  toolName: string                   // 工具名称
  status: ToolInvocationStatus       // 工具调用状态
  phase: ToolInvocationPhase         // 工具当前执行阶段
  artifactRef?: string               // 关联 Artifact ID
  taskRef?: string                   // 关联异步 AgentTask ID
  errorCode?: string                 // 失败错误码
  errorMessage?: string              // 失败错误说明
  retryCount: number                 // 已重试次数
  updatedAt: string                  // 更新时间（ISO 8601）
}

export type SessionProjectionArtifact = {
  artifactId: string    // Artifact ID
  type: string          // Artifact 类型
  title?: string        // Artifact 标题
  currentVersionId?: string // 当前版本 ID
  status?: string       // 产物相关状态，通常来自修复中的 ToolInvocation
  repairState?: 'none' | 'queued' | 'running' | 'completed' | 'failed' // 后台修复状态
  versionCount: number  // 版本数量
  updatedAt: string     // 更新时间（ISO 8601）
}

export type SessionProjectionPendingTask = {
  id: string                                                // AgentTask ID
  parentRunId: string                                       // 父 Run ID
  toAgentId: string                                         // 目标 Agent ID
  type?: string                                             // 任务业务类型
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' // 任务状态
  retryCount: number                                        // 已重试次数
  maxRetries: number                                        // 最大重试次数
  errorSummary?: string                                     // 最近失败摘要
  updatedAt: string                                         // 更新时间（ISO 8601）
}

export type SessionProjection = {
  sessionId: string                                    // 会话 ID
  activeRuns: SessionProjectionActiveRun[]             // 当前仍在执行的 Run 列表
  toolInvocations: SessionProjectionToolInvocation[]   // 最近 ToolInvocation 状态列表
  artifacts: SessionProjectionArtifact[]               // 会话相关 Artifact 摘要列表
  pendingTasks: SessionProjectionPendingTask[]         // 会话相关异步任务列表
  activeHandHistory?: {                                // 当前会话激活的牌谱引用
    artifactId: string // 当前激活牌谱 Artifact ID
    versionId: string  // 当前激活牌谱版本 ID
    status?: string    // 当前激活牌谱状态
  }
  generatedAt: string                                  // 投影生成时间（ISO 8601）
}

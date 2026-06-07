import type { StepType } from '../constants/step-types.js'
import type { RunStatus, StepStatus } from '../constants/run-constants.js'

// ============================================================
// Run 和 Step 核心模型
// ============================================================

/** Run 检查点载荷 — 用于故障恢复时定位最后安全步骤 */
export type RunCheckpointPayload = {
  lastCompletedStepId?: string  // 最近完成的 Step ID
  lastStepType?: string         // 最近完成的 Step 类型
  agentId?: string              // 产生检查点的 Agent ID
  toolInvocationId?: string     // 关联 ToolInvocation ID
  toolPhase?: string            // 关联工具执行阶段
  updatedAt: string             // 检查点更新时间（ISO 8601）
}

export type Run = {
  id: string           // Run 唯一 ID（ULID）
  traceId: string      // 链路追踪 ID
  userId?: string      // 发起用户 ID（MVP 固定）
  projectId?: string   // 所属项目 ID
  agentId?: string     // 主执行 Agent ID
  sessionId?: string   // 会话 ID
  status: RunStatus     // Run 当前状态
  input: unknown       // 初始输入
  output?: unknown     // 最终输出
  error?: RunError     // 失败信息
  /** 客户端幂等键，防止重复创建 Run */
  idempotencyKey?: string // 客户端幂等键，防止重复创建 Run
  /** 最后完成的步骤检查点 */
  checkpointPayload?: RunCheckpointPayload // 最后完成的步骤检查点
  createdAt: string    // ISO 8601
  updatedAt: string    // ISO 8601
}

export type RunError = {
  code: string       // 错误码
  message: string    // 错误说明
  details?: unknown  // 附加错误详情
}

export type Step = {
  id: string               // Step 唯一 ID
  runId: string            // 所属 Run ID
  parentStepId?: string    // 父 Step（表达调用树）
  type: StepType           // Step 类型
  status: StepStatus       // Step 当前状态
  agentId?: string         // 执行该 Step 的 Agent ID
  fromAgentId?: string     // A2A 调用发起 Agent ID
  toAgentId?: string       // A2A 调用目标 Agent ID
  input?: unknown          // Step 输入快照
  output?: unknown         // Step 输出快照
  error?: unknown          // Step 失败信息
  startedAt: string        // 开始时间（ISO 8601）
  endedAt?: string         // 结束时间（ISO 8601）
}

export type CreateRunInput = {
  traceId: string          // 链路追踪 ID
  userId?: string          // 发起用户 ID
  projectId?: string       // 所属项目 ID
  agentId?: string         // 目标 Agent ID
  sessionId?: string       // 所属会话 ID
  input: unknown           // Run 初始输入
  idempotencyKey?: string  // 客户端幂等键
}

export type CreateStepInput = {
  id: string            // Step 唯一 ID
  runId: string         // 所属 Run ID
  parentStepId?: string // 父 Step ID
  type: StepType        // Step 类型
  agentId?: string      // 执行该 Step 的 Agent ID
  fromAgentId?: string  // A2A 调用发起 Agent ID
  toAgentId?: string    // A2A 调用目标 Agent ID
  input?: unknown       // Step 输入快照
}

export type UpdateStepInput = {
  status: StepStatus // 更新后的 Step 状态
  output?: unknown   // Step 输出快照
  error?: unknown    // Step 失败信息
  endedAt?: string   // Step 结束时间（ISO 8601）
}

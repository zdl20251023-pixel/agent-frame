import type { StepType } from '../constants/step-types.js'
import type { RunStatus, StepStatus } from '../constants/run-constants.js'

// ============================================================
// Run 和 Step 核心模型
// ============================================================

export type Run = {
  id: string           // Run 唯一 ID（ULID）
  traceId: string      // 链路追踪 ID
  userId?: string      // 发起用户 ID（MVP 固定）
  projectId?: string   // 所属项目 ID
  agentId?: string     // 主执行 Agent ID
  sessionId?: string   // 会话 ID
  status: RunStatus
  input: unknown       // 初始输入
  output?: unknown     // 最终输出
  error?: RunError     // 失败信息
  createdAt: string    // ISO 8601
  updatedAt: string    // ISO 8601
}

export type RunError = {
  code: string
  message: string
  details?: unknown
}

export type Step = {
  id: string
  runId: string
  parentStepId?: string    // 父 Step（表达调用树）
  type: StepType
  status: StepStatus
  agentId?: string
  fromAgentId?: string
  toAgentId?: string
  input?: unknown
  output?: unknown
  error?: unknown
  startedAt: string
  endedAt?: string
}

export type CreateRunInput = {
  traceId: string
  userId?: string
  projectId?: string
  agentId?: string
  sessionId?: string
  input: unknown
}

export type CreateStepInput = {
  id: string
  runId: string
  parentStepId?: string
  type: StepType
  agentId?: string
  fromAgentId?: string
  toAgentId?: string
  input?: unknown
}

export type UpdateStepInput = {
  status: StepStatus
  output?: unknown
  error?: unknown
  endedAt?: string
}

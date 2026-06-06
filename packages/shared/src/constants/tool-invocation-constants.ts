// ============================================================
// ToolInvocation 状态与阶段常量
// 用于描述一次 Tool 调用的可恢复执行状态。
// ============================================================

export const TOOL_INVOCATION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING_REPAIR: 'waiting_repair',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed_out',
} as const

export type ToolInvocationStatus = typeof TOOL_INVOCATION_STATUS[keyof typeof TOOL_INVOCATION_STATUS]

export const TOOL_INVOCATION_PHASE = {
  CREATED: 'created',
  PRE_PARSE_AUTOFIX: 'pre_parse_autofix',
  SCHEMA_VALIDATE: 'schema_validate',
  SIMULATE_HAND: 'simulate_hand',
  INNER_REPAIR: 'inner_repair',
  ARTIFACT_WRITE: 'artifact_write',
  COMPLETED: 'completed',
} as const

export type ToolInvocationPhase = typeof TOOL_INVOCATION_PHASE[keyof typeof TOOL_INVOCATION_PHASE]

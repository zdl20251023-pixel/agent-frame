// ============================================================
// ToolInvocation 状态与阶段常量
// 用于描述一次 Tool 调用的可恢复执行状态。
// ============================================================

export const TOOL_INVOCATION_STATUS = {
  PENDING: 'pending',                  // ToolInvocation 已创建但尚未执行
  RUNNING: 'running',                  // ToolInvocation 正在执行
  WAITING_REPAIR: 'waiting_repair',    // 工具结果需后台修复
  SUCCEEDED: 'succeeded',              // 工具调用成功完成
  FAILED: 'failed',                    // 工具调用失败
  CANCELLED: 'cancelled',              // 工具调用被取消
  TIMED_OUT: 'timed_out',              // 工具调用或恢复流程超时
} as const

export type ToolInvocationStatus = typeof TOOL_INVOCATION_STATUS[keyof typeof TOOL_INVOCATION_STATUS]

export const TOOL_INVOCATION_PHASE = {
  CREATED: 'created',                          // 调用记录已创建
  PRE_PARSE_AUTOFIX: 'pre_parse_autofix',      // 解析前自动修复阶段
  SCHEMA_VALIDATE: 'schema_validate',          // Schema 结构校验阶段
  SIMULATE_HAND: 'simulate_hand',              // 牌局模拟校验阶段
  INNER_REPAIR: 'inner_repair',                // 内层 LLM 修复阶段
  ARTIFACT_WRITE: 'artifact_write',            // Artifact 写入阶段
  COMPLETED: 'completed',                      // 工具阶段全部完成
} as const

export type ToolInvocationPhase = typeof TOOL_INVOCATION_PHASE[keyof typeof TOOL_INVOCATION_PHASE]

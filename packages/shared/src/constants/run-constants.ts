// ============================================================
// Run 和 Step 状态常量
// ============================================================

export const RUN_STATUS = {
  QUEUED: 'queued',        // Run 已创建并等待调度
  RUNNING: 'running',      // Run 正在执行
  COMPLETED: 'completed',  // Run 成功完成
  FAILED: 'failed',        // Run 执行失败
  CANCELLED: 'cancelled',  // Run 被用户或系统取消
} as const

export type RunStatus = typeof RUN_STATUS[keyof typeof RUN_STATUS]

export const STEP_STATUS = {
  RUNNING: 'running',      // Step 正在执行
  COMPLETED: 'completed',  // Step 成功完成
  FAILED: 'failed',        // Step 执行失败
  CANCELLED: 'cancelled',  // Step 被取消
} as const

export type StepStatus = typeof STEP_STATUS[keyof typeof STEP_STATUS]

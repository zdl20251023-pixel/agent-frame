// ============================================================
// Run 和 Step 状态常量
// ============================================================

export const RUN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

export type RunStatus = typeof RUN_STATUS[keyof typeof RUN_STATUS]

export const STEP_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

export type StepStatus = typeof STEP_STATUS[keyof typeof STEP_STATUS]

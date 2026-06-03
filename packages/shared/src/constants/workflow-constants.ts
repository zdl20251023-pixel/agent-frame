// ============================================================
// Workflow 状态常量
// 前后端共享，统一避免硬编码字符串
// ============================================================

/** WorkflowRun 级别状态 */
export const WORKFLOW_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING_HUMAN: 'waiting_human',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

export type WorkflowStatus = typeof WORKFLOW_STATUS[keyof typeof WORKFLOW_STATUS]

/** 单个 Stage 级别状态 */
export const WORKFLOW_STAGE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING_HUMAN: 'waiting_human',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  RETRYING: 'retrying',
} as const

export type WorkflowStageStatus = typeof WORKFLOW_STAGE_STATUS[keyof typeof WORKFLOW_STAGE_STATUS]

/** Stage 执行模式 */
export const WORKFLOW_STAGE_MODE = {
  SYNC: 'sync',
  ASYNC: 'async',
  MANUAL: 'manual',
} as const

export type WorkflowStageMode = typeof WORKFLOW_STAGE_MODE[keyof typeof WORKFLOW_STAGE_MODE]

/** 人工节点决策结果 */
export const HUMAN_GATE_DECISION = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type HumanGateDecision = typeof HUMAN_GATE_DECISION[keyof typeof HUMAN_GATE_DECISION]

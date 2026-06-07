// ============================================================
// Workflow 状态常量
// 前后端共享，统一避免硬编码字符串
// ============================================================

/** WorkflowRun 级别状态 */
export const WORKFLOW_STATUS = {
  PENDING: 'pending',                // WorkflowRun 已创建但尚未开始
  RUNNING: 'running',                // WorkflowRun 正在执行
  WAITING_HUMAN: 'waiting_human',    // WorkflowRun 等待人工节点决策
  COMPLETED: 'completed',            // WorkflowRun 成功完成
  FAILED: 'failed',                  // WorkflowRun 执行失败
  CANCELLED: 'cancelled',            // WorkflowRun 被取消
} as const

export type WorkflowStatus = typeof WORKFLOW_STATUS[keyof typeof WORKFLOW_STATUS]

/** 单个 Stage 级别状态 */
export const WORKFLOW_STAGE_STATUS = {
  PENDING: 'pending',              // Stage 等待执行
  RUNNING: 'running',              // Stage 正在执行
  WAITING_HUMAN: 'waiting_human',  // Stage 等待人工审批
  COMPLETED: 'completed',          // Stage 成功完成
  FAILED: 'failed',                // Stage 执行失败
  SKIPPED: 'skipped',              // Stage 被跳过
  RETRYING: 'retrying',            // Stage 正在等待或执行重试
} as const

export type WorkflowStageStatus = typeof WORKFLOW_STAGE_STATUS[keyof typeof WORKFLOW_STAGE_STATUS]

/** Stage 执行模式 */
export const WORKFLOW_STAGE_MODE = {
  SYNC: 'sync',      // 同步执行 Stage
  ASYNC: 'async',    // 异步执行 Stage
  MANUAL: 'manual',  // 人工节点 Stage
} as const

export type WorkflowStageMode = typeof WORKFLOW_STAGE_MODE[keyof typeof WORKFLOW_STAGE_MODE]

/** 人工节点决策结果 */
export const HUMAN_GATE_DECISION = {
  APPROVED: 'approved',  // 人工审批通过
  REJECTED: 'rejected',  // 人工审批拒绝
} as const

export type HumanGateDecision = typeof HUMAN_GATE_DECISION[keyof typeof HUMAN_GATE_DECISION]

// ============================================================
// packages/shared/src/constants/agent-task-constants.ts
// 异步 Agent 任务状态常量
// 对应 FRAMEWORK_DESIGN §40.11 AgentTask 状态
// ============================================================

export const AGENT_TASK_STATUSES = {
  QUEUED: 'queued',        // 任务已入队，等待 Worker 消费
  RUNNING: 'running',      // 任务正在被 Worker 执行
  COMPLETED: 'completed',  // 任务已成功完成
  FAILED: 'failed',        // 任务执行失败
  CANCELLED: 'cancelled',  // 任务被取消
} as const

export type AgentTaskStatus = typeof AGENT_TASK_STATUSES[keyof typeof AGENT_TASK_STATUSES]

export const AGENT_TASK_PRIORITIES = {
  HIGHEST: 1,  // 最高优先级，最先调度
  HIGH: 3,     // 高优先级
  NORMAL: 5,   // 默认优先级
  LOW: 7,      // 低优先级
  LOWEST: 10,  // 最低优先级，最后调度
} as const

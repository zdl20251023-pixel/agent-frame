// ============================================================
// packages/shared/src/constants/agent-task-constants.ts
// 异步 Agent 任务状态常量
// 对应 FRAMEWORK_DESIGN §40.11 AgentTask 状态
// ============================================================

export const AGENT_TASK_STATUSES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

export type AgentTaskStatus = typeof AGENT_TASK_STATUSES[keyof typeof AGENT_TASK_STATUSES]

export const AGENT_TASK_PRIORITIES = {
  HIGHEST: 1,
  HIGH: 3,
  NORMAL: 5,
  LOW: 7,
  LOWEST: 10,
} as const

// ============================================================
// A2A 调用模式常量
// ============================================================

export const A2A_CALL_MODES = {
  SYNC: 'sync',
  ASYNC: 'async',
  STREAM: 'stream',
} as const

export type A2ACallMode = typeof A2A_CALL_MODES[keyof typeof A2A_CALL_MODES]

export const A2A_STATUSES = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  ACCEPTED: 'accepted',
  STREAMING: 'streaming',
} as const

export type A2AStatus = typeof A2A_STATUSES[keyof typeof A2A_STATUSES]


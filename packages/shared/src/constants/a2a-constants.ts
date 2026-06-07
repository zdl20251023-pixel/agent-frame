// ============================================================
// A2A 调用模式常量
// ============================================================

export const A2A_CALL_MODES = {
  SYNC: 'sync',      // 同步调用，调用方等待目标 Agent 返回结果
  ASYNC: 'async',    // 异步调用，立即返回任务 ID，后台继续执行
  STREAM: 'stream',  // 流式调用，目标 Agent 通过事件流持续输出
} as const

export type A2ACallMode = typeof A2A_CALL_MODES[keyof typeof A2A_CALL_MODES]

export const A2A_STATUSES = {
  COMPLETED: 'completed',  // 调用已成功完成
  FAILED: 'failed',        // 调用已失败并进入终态
  ACCEPTED: 'accepted',    // 异步调用已被接收
  STREAMING: 'streaming',  // 流式调用正在输出
} as const

export type A2AStatus = typeof A2A_STATUSES[keyof typeof A2A_STATUSES]


// ============================================================
// Model Client 流式事件类型常量
// ============================================================

export const MODEL_STREAM_EVENT_TYPES = {
  TEXT_DELTA: 'text.delta',
  TOOL_CALL: 'tool.call',
  TOOL_RESULT: 'tool.result',
  MODEL_COMPLETED: 'model.completed',
  MODEL_FAILED: 'model.failed',
} as const

export type ModelStreamEventType = typeof MODEL_STREAM_EVENT_TYPES[keyof typeof MODEL_STREAM_EVENT_TYPES]

// ============================================================
// Model Client 流式事件类型常量
// ============================================================

export const MODEL_STREAM_EVENT_TYPES = {
  TEXT_DELTA: 'text.delta',          // 模型流式文本增量
  TOOL_CALL: 'tool.call',            // 模型请求调用工具
  TOOL_RESULT: 'tool.result',        // 工具调用结果返回给模型流
  MODEL_COMPLETED: 'model.completed', // 模型调用正常完成
  MODEL_FAILED: 'model.failed',      // 模型调用失败
} as const

export type ModelStreamEventType = typeof MODEL_STREAM_EVENT_TYPES[keyof typeof MODEL_STREAM_EVENT_TYPES]

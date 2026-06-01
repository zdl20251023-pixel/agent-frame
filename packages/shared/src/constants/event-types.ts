// ============================================================
// 所有事件 type 字面量常量
// 避免前后端各自硬编码字符串
// ============================================================

export const EVENT_TYPES = {
  // Run
  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',

  // Message
  MESSAGE_DELTA: 'message.delta',

  // Tool
  TOOL_CALL: 'tool.call',
  TOOL_RESULT: 'tool.result',

  // A2A
  AGENT_CALL_STARTED: 'agent.call.started',
  AGENT_CALL_COMPLETED: 'agent.call.completed',
  AGENT_CALL_FAILED: 'agent.call.failed',
  AGENT_CALL_QUEUED: 'agent.call.queued',
  AGENT_CALL_PROGRESS: 'agent.call.progress',
  AGENT_CALL_CANCELLED: 'agent.call.cancelled',

  // Artifact
  ARTIFACT_CREATED: 'artifact.created',
  ARTIFACT_VERSION_CREATED: 'artifact.version.created',
} as const

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES]

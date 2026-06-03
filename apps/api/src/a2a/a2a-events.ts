import { EVENT_TYPES } from '@agent-frame/shared'
import { now } from '../shared/utils/id.js'

// ============================================================
// A2A 事件构造函数
// 统一封装 A2A 相关事件构造逻辑，避免在 a2a-client 中内联拼对象
// ============================================================

export type A2AStartedEventInput = {
  runId: string
  traceId: string
  stepId: string
  parentStepId?: string
  fromAgentId: string
  toAgentId: string
  inputPreview?: string
}

export type A2ACompletedEventInput = {
  runId: string
  traceId: string
  stepId: string
  fromAgentId: string
  toAgentId: string
  outputPreview?: string
  latencyMs: number
}

export type A2AQueuedEventInput = {
  runId: string
  childRunId: string
  taskId: string
  fromAgentId: string
  toAgentId: string
}

export type A2AFailedEventInput = {
  runId: string
  traceId: string
  stepId: string
  fromAgentId: string
  toAgentId: string
  error: { code: string; message: string }
}

export function buildA2AQueuedEvent(input: A2AQueuedEventInput) {
  return {
    type: EVENT_TYPES.AGENT_CALL_QUEUED,
    runId: input.runId,
    childRunId: input.childRunId,
    taskId: input.taskId,
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
    timestamp: now(),
  } as const
}

export function buildA2AStartedEvent(input: A2AStartedEventInput) {
  return {
    type: EVENT_TYPES.AGENT_CALL_STARTED,
    runId: input.runId,
    traceId: input.traceId,
    stepId: input.stepId,
    parentStepId: input.parentStepId,
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
    inputPreview: input.inputPreview,
    timestamp: now(),
  } as const
}

export function buildA2ACompletedEvent(input: A2ACompletedEventInput) {
  return {
    type: EVENT_TYPES.AGENT_CALL_COMPLETED,
    runId: input.runId,
    traceId: input.traceId,
    stepId: input.stepId,
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
    outputPreview: input.outputPreview,
    latencyMs: input.latencyMs,
    timestamp: now(),
  } as const
}

export function buildA2AFailedEvent(input: A2AFailedEventInput) {
  return {
    type: EVENT_TYPES.AGENT_CALL_FAILED,
    runId: input.runId,
    traceId: input.traceId,
    stepId: input.stepId,
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
    error: input.error,
    timestamp: now(),
  } as const
}

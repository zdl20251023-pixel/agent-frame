import type { A2ACallMode } from '../constants/a2a-constants.js'
import { A2A_CALL_MODES, A2A_STATUSES } from '../constants/a2a-constants.js'

export type A2ARequest = {
  runId: string
  traceId: string
  parentStepId?: string
  fromAgentId: string
  toAgentId: string
  mode: A2ACallMode
  input: unknown
  timeoutMs?: number
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

export type A2AResponse =
  | {
      mode: typeof A2A_CALL_MODES.SYNC
      status: typeof A2A_STATUSES.COMPLETED | typeof A2A_STATUSES.FAILED
      output?: unknown
      error?: A2AError
      latencyMs: number
      usage?: {
        inputTokens?: number
        outputTokens?: number
        estimatedCostUsd?: number
      }
    }
  | {
      mode: typeof A2A_CALL_MODES.ASYNC
      status: typeof A2A_STATUSES.ACCEPTED
      taskId: string
      childRunId: string
      eventsUrl?: string
    }
  | {
      mode: typeof A2A_CALL_MODES.STREAM
      status: typeof A2A_STATUSES.STREAMING
      streamId: string
      childRunId: string
    }


export type A2AError = {
  code: string
  message: string
  retryable?: boolean
  details?: Record<string, unknown>
}

export type A2APolicyRule = {
  fromAgentId: string
  toAgentId: string
  allowed: boolean
  maxDepth: number
  maxCallsPerRun: number
  timeoutMs: number
  maxInputTokens?: number
  maxOutputTokens?: number
  requiresApproval?: boolean
}

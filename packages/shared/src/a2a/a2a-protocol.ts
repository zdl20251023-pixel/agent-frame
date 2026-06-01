// ============================================================
// A2A 协议类型
// ============================================================

export type A2ACallMode = 'sync' | 'async' | 'stream'

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
      mode: 'sync'
      status: 'completed' | 'failed'
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
      mode: 'async'
      status: 'accepted'
      taskId: string
      childRunId: string
      eventsUrl?: string
    }
  | {
      mode: 'stream'
      status: 'streaming'
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

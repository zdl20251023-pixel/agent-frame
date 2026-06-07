// ============================================================
// SessionProjection — 会话级统一状态投影
// 前端单一数据源，避免 Run / ToolInvocation / AgentTask / Artifact 多源拼装。
// ============================================================

import type { RunStatus } from '../constants/run-constants.js'
import type { ToolInvocationStatus, ToolInvocationPhase } from '../constants/tool-invocation-constants.js'

export type SessionProjectionActiveRun = {
  runId: string
  traceId: string
  agentId?: string
  status: RunStatus
  createdAt: string
  updatedAt: string
}

export type SessionProjectionToolInvocation = {
  id: string
  runId: string
  toolName: string
  status: ToolInvocationStatus
  phase: ToolInvocationPhase
  artifactRef?: string
  taskRef?: string
  errorCode?: string
  errorMessage?: string
  retryCount: number
  updatedAt: string
}

export type SessionProjectionArtifact = {
  artifactId: string
  type: string
  title?: string
  currentVersionId?: string
  status?: string
  repairState?: 'none' | 'queued' | 'running' | 'completed' | 'failed'
  versionCount: number
  updatedAt: string
}

export type SessionProjectionPendingTask = {
  id: string
  parentRunId: string
  toAgentId: string
  type?: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  retryCount: number
  maxRetries: number
  errorSummary?: string
  updatedAt: string
}

export type SessionProjection = {
  sessionId: string
  activeRuns: SessionProjectionActiveRun[]
  toolInvocations: SessionProjectionToolInvocation[]
  artifacts: SessionProjectionArtifact[]
  pendingTasks: SessionProjectionPendingTask[]
  activeHandHistory?: {
    artifactId: string
    versionId: string
    status?: string
  }
  generatedAt: string
}

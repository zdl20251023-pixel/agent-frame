import type { MemoryScope, MemoryCandidateStatus } from '../constants/memory-constants.js'

export type MemoryItem = {
  id: string
  scope: MemoryScope
  scopeId: string          // 对应 scope 的实例 ID（userId/sessionId/projectId...）
  kind: string             // preference | fact | summary | constraint
  content: unknown
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// 候选记忆写入请求（需审核后才写入正式 Memory）
export type MemoryWriteCandidate = {
  id: string
  projectId?: string
  userId?: string
  runId: string
  stepId?: string
  agentId: string
  key: string
  value: unknown
  reason: string
  status: MemoryCandidateStatus
  createdAt: string
}


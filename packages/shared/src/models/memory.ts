// ============================================================
// Memory 模型（MVP 预留接口，不主动写入）
// ============================================================

export type MemoryScope = 'user' | 'session' | 'project' | 'agent' | 'global'

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
  status: 'pending' | 'approved' | 'rejected' | 'applied'
  createdAt: string
}

// ============================================================
// memory/ — 通用记忆层类型定义
// MVP 阶段只保留接口和简单实现，不做复杂向量检索
// ============================================================

/** 记忆作用域 */
export type MemoryScope = 'user' | 'session' | 'project' | 'agent' | 'global'

/** 记忆条目 */
export type MemoryItem = {
  id: string
  scope: MemoryScope
  scopeId: string      // 作用域实例 ID，例如 userId、sessionId、projectId
  kind: string         // 记忆类型，例如 preference、fact、summary、constraint
  content: unknown
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type CreateMemoryInput = {
  scope: MemoryScope
  scopeId: string
  kind: string
  content: unknown
  metadata?: Record<string, unknown>
}

/** 记忆存储接口 */
export interface MemoryStore {
  create(input: CreateMemoryInput & { id: string }): Promise<MemoryItem>
  get(id: string): Promise<MemoryItem | null>
  list(scope: MemoryScope, scopeId: string, kind?: string): Promise<MemoryItem[]>
  delete(id: string): Promise<void>
  deleteByScope(scope: MemoryScope, scopeId: string): Promise<void>
}

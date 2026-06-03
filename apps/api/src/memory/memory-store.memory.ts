import type { MemoryStore, MemoryItem, CreateMemoryInput, MemoryScope } from './memory.types.js'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// MemoryStore 内存实现
// MVP 阶段使用内存存储，后续可替换为 MySQL / 向量数据库实现
// ============================================================

export class MemoryMemoryStore implements MemoryStore {
  private items = new Map<string, MemoryItem>()

  async create(input: CreateMemoryInput & { id: string }): Promise<MemoryItem> {
    const ts = new Date().toISOString()
    const item: MemoryItem = {
      id: input.id,
      scope: input.scope,
      scopeId: input.scopeId,
      kind: input.kind,
      content: input.content,
      metadata: input.metadata,
      createdAt: ts,
      updatedAt: ts,
    }
    this.items.set(item.id, item)
    logger.debug('[MemoryStore] Memory created', { id: item.id, scope: item.scope })
    return item
  }

  async get(id: string): Promise<MemoryItem | null> {
    return this.items.get(id) ?? null
  }

  async list(scope: MemoryScope, scopeId: string, kind?: string): Promise<MemoryItem[]> {
    return Array.from(this.items.values()).filter(
      (item) =>
        item.scope === scope &&
        item.scopeId === scopeId &&
        (kind === undefined || item.kind === kind),
    )
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id)
  }

  async deleteByScope(scope: MemoryScope, scopeId: string): Promise<void> {
    for (const [id, item] of this.items) {
      if (item.scope === scope && item.scopeId === scopeId) {
        this.items.delete(id)
      }
    }
  }
}

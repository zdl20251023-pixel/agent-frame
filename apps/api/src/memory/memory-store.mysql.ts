import { getDb } from '../shared/db/client.js'
import { memories } from '../shared/db/schema.js'
import { eq, and } from 'drizzle-orm'
import { mysqlNow } from '../shared/db/datetime.js'
import type { MemoryStore, MemoryItem, CreateMemoryInput, MemoryScope } from './memory.types.js'

// ============================================================
// MySQLMemoryStore — Memory MySQL 持久化实现
// 对应 FRAMEWORK_DESIGN §13 memory/ 通用记忆层
//
// 表：memories
// 关键查询：按 scope + scopeId 检索（+ 可选 kind 过滤）
// MVP 阶段不做向量检索，只做结构化关键字匹配
// 使用 getDb() 延迟初始化（与其他 Repository 保持一致）
// ============================================================

export class MySQLMemoryStore implements MemoryStore {
  private get db() {
    return getDb()
  }

  async create(input: CreateMemoryInput & { id: string }): Promise<MemoryItem> {
    const ts = mysqlNow()
    await this.db.insert(memories).values({
      id: input.id,
      scope: input.scope,
      scopeId: input.scopeId,
      kind: input.kind,
      content: input.content as Record<string, unknown>,
      metadata: (input.metadata ?? null) as Record<string, unknown> | null,
      createdAt: ts,
      updatedAt: ts,
    })
    return this.get(input.id) as Promise<MemoryItem>
  }

  async get(id: string): Promise<MemoryItem | null> {
    const rows = await this.db
      .select()
      .from(memories)
      .where(eq(memories.id, id))
      .limit(1)
    return rows.length > 0 ? toMemoryItem(rows[0]) : null
  }

  async list(scope: MemoryScope, scopeId: string, kind?: string): Promise<MemoryItem[]> {
    const condition = kind
      ? and(eq(memories.scope, scope), eq(memories.scopeId, scopeId), eq(memories.kind, kind))
      : and(eq(memories.scope, scope), eq(memories.scopeId, scopeId))

    const rows = await this.db.select().from(memories).where(condition)
    return rows.map(toMemoryItem)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(memories).where(eq(memories.id, id))
  }

  async deleteByScope(scope: MemoryScope, scopeId: string): Promise<void> {
    await this.db
      .delete(memories)
      .where(and(eq(memories.scope, scope), eq(memories.scopeId, scopeId)))
  }
}

function toMemoryItem(row: typeof memories.$inferSelect): MemoryItem {
  return {
    id: row.id,
    scope: row.scope as MemoryScope,
    scopeId: row.scopeId,
    kind: row.kind,
    content: row.content,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

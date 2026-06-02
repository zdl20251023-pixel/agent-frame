import { and, desc, eq, isNull } from 'drizzle-orm'
import type { ChatSession } from '@agent-frame/shared'
import { getDb } from '../../shared/db/client.js'
import { chatSessions } from '../../shared/db/schema.js'
import { AppError } from '../../shared/errors/app-error.js'
import { env } from '../../shared/config/env.js'
import { mysqlNow } from '../../shared/db/datetime.js'

// ============================================================
// 聊天会话数据访问
// ============================================================

export class SessionsRepository {
  private get db() {
    if (!env.DATABASE_URL) {
      throw new AppError('INTERNAL_ERROR', 'DATABASE_URL is required for sessions')
    }
    return getDb()
  }

  async listByUser(userId: string, limit = 50): Promise<ChatSession[]> {
    const rows = await this.db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.userId, userId), isNull(chatSessions.deletedAt)))
      .orderBy(desc(chatSessions.updatedAt))
      .limit(limit)

    return rows.map((r) => this.mapSession(r))
  }

  async getByIdForUser(sessionId: string, userId: string): Promise<ChatSession | null> {
    const rows = await this.db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.userId, userId),
          isNull(chatSessions.deletedAt),
        ),
      )
      .limit(1)
    if (rows.length === 0) return null
    return this.mapSession(rows[0])
  }

  async createSession(input: {
    id: string
    userId: string
    title?: string
  }): Promise<ChatSession> {
    const ts = mysqlNow()
    await this.db.insert(chatSessions).values({
      id: input.id,
      userId: input.userId,
      title: input.title ?? null,
      deletedAt: null,
      createdAt: ts,
      updatedAt: ts,
    })
    const session = await this.getByIdForUser(input.id, input.userId)
    if (!session) throw new AppError('INTERNAL_ERROR', 'Failed to create session')
    return session
  }

  async softDelete(sessionId: string, userId: string): Promise<boolean> {
    const existing = await this.getByIdForUser(sessionId, userId)
    if (!existing) return false
    await this.db
      .update(chatSessions)
      .set({ deletedAt: mysqlNow(), updatedAt: mysqlNow() })
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    return true
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.db
      .update(chatSessions)
      .set({ updatedAt: mysqlNow() })
      .where(eq(chatSessions.id, sessionId))
  }

  async updateTitle(sessionId: string, userId: string, title: string): Promise<void> {
    await this.db
      .update(chatSessions)
      .set({ title, updatedAt: mysqlNow() })
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.userId, userId),
          isNull(chatSessions.deletedAt),
        ),
      )
  }

  private mapSession(row: {
    id: string
    userId: string
    title: string | null
    deletedAt: string | null
    createdAt: string
    updatedAt: string
    runCount?: number
  }): ChatSession {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title ?? undefined,
      deletedAt: row.deletedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      runCount: row.runCount,
    }
  }
}

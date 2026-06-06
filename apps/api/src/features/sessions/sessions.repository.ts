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

  /**
   * 读取会话滚动摘要（存于 metadata.conversationSummary）。
   */
  async getConversationSummary(sessionId: string): Promise<string | undefined> {
    try {
      const rows = await this.db
        .select({ metadata: chatSessions.metadata })
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId))
        .limit(1)
      if (rows.length === 0 || !rows[0].metadata) return undefined
      const meta = rows[0].metadata as Record<string, unknown>
      const summary = meta.conversationSummary
      return typeof summary === 'string' && summary.trim() ? summary : undefined
    } catch {
      // 旧库未迁移 metadata 列时降级，不阻塞 Run 创建
      return undefined
    }
  }

  /**
   * 更新会话滚动摘要到 metadata。
   */
  async updateConversationSummary(sessionId: string, summary: string): Promise<void> {
    try {
      const rows = await this.db
        .select({ metadata: chatSessions.metadata })
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId))
        .limit(1)
      const existing =
        rows.length > 0 && rows[0].metadata && typeof rows[0].metadata === 'object'
          ? (rows[0].metadata as Record<string, unknown>)
          : {}
      await this.db
        .update(chatSessions)
        .set({
          metadata: {
            ...existing,
            conversationSummary: summary,
            summaryUpdatedAt: mysqlNow(),
          },
          updatedAt: mysqlNow(),
        })
        .where(eq(chatSessions.id, sessionId))
    } catch {
      // metadata 列不存在时跳过摘要持久化
    }
  }

  /**
   * 记录当前会话正在编辑的 hand_history。
   *
   * 参数：
   * - sessionId：会话 ID。
   * - state：当前活跃牌谱 Artifact 与版本信息。
   *
   * 返回值：无。旧库缺少 metadata 列时会降级跳过，不阻塞主链路。
   */
  async updateActiveHandHistory(
    sessionId: string,
    state: {
      artifactId: string
      versionId: string
      status: 'draft' | 'valid' | 'invalid_needs_user_input' | 'patched'
      updatedByRunId: string
    },
  ): Promise<void> {
    try {
      const existing = await this.getMetadata(sessionId)
      await this.db
        .update(chatSessions)
        .set({
          metadata: {
            ...existing,
            activeHandHistory: {
              artifactId: state.artifactId,
              versionId: state.versionId,
              status: state.status,
              updatedByRunId: state.updatedByRunId,
              updatedAt: mysqlNow(),
            },
          },
          updatedAt: mysqlNow(),
        })
        .where(eq(chatSessions.id, sessionId))
    } catch {
      // metadata 列不存在或 Memory 模式下不阻塞 Run 主链路
    }
  }

  /**
   * 读取当前会话的 active hand_history 引用。
   */
  async getActiveHandHistory(sessionId: string): Promise<{
    artifactId: string
    versionId: string
    status?: string
  } | undefined> {
    try {
      const metadata = await this.getMetadata(sessionId)
      const raw = metadata.activeHandHistory
      if (!raw || typeof raw !== 'object') return undefined
      const active = raw as Record<string, unknown>
      if (typeof active.artifactId !== 'string' || typeof active.versionId !== 'string') return undefined
      return {
        artifactId: active.artifactId,
        versionId: active.versionId,
        status: typeof active.status === 'string' ? active.status : undefined,
      }
    } catch {
      return undefined
    }
  }

  private async getMetadata(sessionId: string): Promise<Record<string, unknown>> {
    const rows = await this.db
      .select({ metadata: chatSessions.metadata })
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1)
    return rows.length > 0 && rows[0].metadata && typeof rows[0].metadata === 'object'
      ? (rows[0].metadata as Record<string, unknown>)
      : {}
  }

  private mapSession(row: {
    id: string
    userId: string
    title: string | null
    metadata?: unknown
    deletedAt: string | null
    createdAt: string
    updatedAt: string
    runCount?: number
  }): ChatSession {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title ?? undefined,
      metadata: row.metadata && typeof row.metadata === 'object'
        ? row.metadata as Record<string, unknown>
        : undefined,
      deletedAt: row.deletedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      runCount: row.runCount,
    }
  }
}

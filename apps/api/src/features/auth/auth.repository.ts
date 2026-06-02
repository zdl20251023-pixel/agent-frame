import { eq } from 'drizzle-orm'
import type { PublicUser, User } from '@agent-frame/shared'
import { getDb } from '../../shared/db/client.js'
import { users } from '../../shared/db/schema.js'
import { AppError } from '../../shared/errors/app-error.js'
import { env } from '../../shared/config/env.js'

// ============================================================
// 用户数据访问
// ============================================================

export class AuthRepository {
  private get db() {
    if (!env.DATABASE_URL) {
      throw new AppError('INTERNAL_ERROR', 'DATABASE_URL is required for authentication')
    }
    return getDb()
  }

  async findByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1)
    if (rows.length === 0) return null
    return this.mapUserRow(rows[0])
  }

  async findById(id: string): Promise<(User & { passwordHash: string }) | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    if (rows.length === 0) return null
    return this.mapUserRow(rows[0])
  }

  async findPublicUserById(id: string): Promise<PublicUser | null> {
    const user = await this.findById(id)
    if (!user) return null
    return this.toPublic(user)
  }

  async createUser(input: {
    id: string
    email: string
    username?: string
    passwordHash: string
    createdAt: string
    updatedAt: string
  }): Promise<User> {
    try {
      await this.db.insert(users).values({
        id: input.id,
        email: input.email,
        username: input.username ?? null,
        passwordHash: input.passwordHash,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('Duplicate') || message.includes('duplicate')) {
        throw new AppError('BAD_REQUEST', 'Email already registered')
      }
      throw err
    }
    const user = await this.findById(input.id)
    if (!user) throw new AppError('INTERNAL_ERROR', 'Failed to create user')
    return user
  }

  private mapUserRow(row: typeof users.$inferSelect): User & { passwordHash: string } {
    return {
      id: row.id,
      email: row.email,
      username: row.username ?? undefined,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
    }
  }
}

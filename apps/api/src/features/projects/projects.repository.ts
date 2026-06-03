import { getDb } from '../../shared/db/client.js'
import { projects, runs, artifacts } from '../../shared/db/schema.js'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { mysqlNow } from '../../shared/db/datetime.js'
import type { Project } from '@agent-frame/shared'

// ============================================================
// ProjectsRepository — Project 数据访问层
// 对应 FRAMEWORK_DESIGN §18.4 Project API + §20.3 数据模型
// 使用 getDb() 延迟初始化（与其他 Repository 保持一致）
// ============================================================

export class ProjectsRepository {
  private get db() {
    return getDb()
  }

  /** 创建 Project */
  async create(input: {
    id: string
    ownerId: string
    name: string
    type: string
    description?: string
    metadata?: Record<string, unknown>
  }): Promise<Project> {
    const ts = mysqlNow()
    await this.db.insert(projects).values({
      id: input.id,
      ownerId: input.ownerId,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      metadata: input.metadata ?? null,
      deletedAt: null,
      createdAt: ts,
      updatedAt: ts,
    })
    return this.getByIdForOwner(input.id, input.ownerId) as Promise<Project>
  }

  /** 按 owner 列表（软删除过滤）*/
  async listByOwner(ownerId: string): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.ownerId, ownerId), isNull(projects.deletedAt)))
      .orderBy(desc(projects.updatedAt))
    return rows.map(toProject)
  }

  /** 按 ID + owner 查询 */
  async getByIdForOwner(projectId: string, ownerId: string): Promise<Project | null> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.ownerId, ownerId), isNull(projects.deletedAt)),
      )
      .limit(1)
    return rows.length > 0 ? toProject(rows[0]) : null
  }

  /** 软删除 */
  async softDelete(projectId: string, ownerId: string): Promise<boolean> {
    const result = await this.db
      .update(projects)
      .set({ deletedAt: mysqlNow(), updatedAt: mysqlNow() })
      .where(
        and(eq(projects.id, projectId), eq(projects.ownerId, ownerId), isNull(projects.deletedAt)),
      )
    return (result as unknown as { rowsAffected?: number }[])[0]?.rowsAffected === 1
  }

  /** 更新 */
  async update(
    projectId: string,
    ownerId: string,
    updates: { name?: string; description?: string; metadata?: Record<string, unknown> },
  ): Promise<boolean> {
    const result = await this.db
      .update(projects)
      .set({ ...updates, updatedAt: mysqlNow() })
      .where(
        and(eq(projects.id, projectId), eq(projects.ownerId, ownerId), isNull(projects.deletedAt)),
      )
    return (result as unknown as { rowsAffected?: number }[])[0]?.rowsAffected === 1
  }

  /** 获取 Project 下的 Run 列表（分页）*/
  async listRunsByProject(projectId: string, limit = 20, offset = 0) {
    return this.db
      .select()
      .from(runs)
      .where(eq(runs.projectId, projectId))
      .orderBy(desc(runs.createdAt))
      .limit(limit)
      .offset(offset)
  }

  /** 获取 Project 下的 Artifact 列表 */
  async listArtifactsByProject(projectId: string) {
    return this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.projectId, projectId))
      .orderBy(desc(artifacts.createdAt))
  }
}

function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    type: row.type as Project['type'],
    description: row.description ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

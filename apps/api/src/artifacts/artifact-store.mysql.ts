import { eq } from 'drizzle-orm'
import type { Artifact, ArtifactVersion } from '@agent-frame/shared'
import { ARTIFACT_REVIEW_STATUS } from '@agent-frame/shared'
import { createHash } from 'node:crypto'
import type {
  ArtifactStore,
  CreateArtifactInput,
  CreateArtifactVersionInput,
} from './artifact-store.js'
import { getDb } from '../shared/db/client.js'
import { artifacts, artifactVersions } from '../shared/db/schema.js'
import { generateArtifactId, generateVersionId } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'
import { AppError } from '../shared/errors/app-error.js'

// ============================================================
// MySQLArtifactStore — 基于 Drizzle ORM 的 MySQL 持久化实现
// ============================================================

/** ISO 时间转 MySQL DATETIME(3) 格式 */
function toMySQL(d: Date = new Date()): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  )
}

export class MySQLArtifactStore implements ArtifactStore {
  private get db() {
    return getDb()
  }

  // ─── 原子写入（事务）─────────────────────────────────────

  async createArtifactWithVersion(
    artifactInput: Omit<CreateArtifactInput, 'id'>,
    content: unknown,
    context: { runId: string; stepId?: string; agentId?: string; idempotencyKey?: string },
  ): Promise<{ artifact: Artifact; version: ArtifactVersion }> {
    const idempotencyKey = context.idempotencyKey ?? artifactInput.idempotencyKey
    const artifactId = idempotencyKey ? stableArtifactId(idempotencyKey) : generateArtifactId()
    const versionId = generateVersionId()
    const ts = toMySQL()
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content)

    const existingArtifact = await this.getArtifact(artifactId)
    if (existingArtifact?.currentVersionId) {
      const existingVersion = await this.getVersion(existingArtifact.currentVersionId)
      if (existingVersion) return { artifact: existingArtifact, version: existingVersion }
    }

    // MySQL 事务：先写库，再 emit 事件（设计原则：事务外不推事件）
    await this.db.transaction(async (tx) => {
      // 1. 插入 artifact
      await tx.insert(artifacts).values({
        id: artifactId,
        runId: artifactInput.runId,
        projectId: artifactInput.projectId ?? null,
        workflowRunId: null,
        workflowStageId: null,
        type: artifactInput.type,
        title: artifactInput.title ?? null,
        currentVersionId: versionId,     // 直接设为第一个版本
        metadata: artifactInput.metadata ?? null,
        createdAt: ts,
        updatedAt: ts,
      })

      // 2. 插入 version
      await tx.insert(artifactVersions).values({
        id: versionId,
        artifactId,
        version: 1,
        content: contentStr,
        createdByRunId: context.runId,
        createdByStepId: context.stepId ?? null,
        createdByAgentId: context.agentId ?? null,
        parentVersionId: null,
        reviewStatus: ARTIFACT_REVIEW_STATUS.PENDING,
        diffSummary: null,
        createdAt: ts,
      })
    })

    logger.debug('[MySQLArtifactStore] createArtifactWithVersion', {
      artifactId,
      versionId,
      runId: context.runId,
    })

    const artifact = await this.getArtifact(artifactId)
    const version = await this.getVersion(versionId)
    if (!artifact || !version) {
      throw new AppError('ARTIFACT_SAVE_FAILED', 'Failed to create artifact in MySQL')
    }
    return { artifact, version }
  }

  // ─── Artifact 操作 ─────────────────────────────────────────

  async createArtifact(input: CreateArtifactInput): Promise<Artifact> {
    const existing = await this.getArtifact(input.id)
    if (existing) return existing

    const ts = toMySQL()
    await this.db.insert(artifacts).values({
      id: input.id,
      runId: input.runId,
      projectId: input.projectId ?? null,
      workflowRunId: null,
      workflowStageId: null,
      type: input.type,
      title: input.title ?? null,
      currentVersionId: null,
      metadata: input.metadata ?? null,
      createdAt: ts,
      updatedAt: ts,
    })

    const artifact = await this.getArtifact(input.id)
    if (!artifact) throw new AppError('ARTIFACT_SAVE_FAILED', 'Failed to create artifact')
    return artifact
  }

  async createVersion(input: CreateArtifactVersionInput): Promise<ArtifactVersion> {
    const ts = toMySQL()
    const contentStr = typeof input.content === 'string'
      ? input.content
      : JSON.stringify(input.content)

    await this.db.insert(artifactVersions).values({
      id: input.id,
      artifactId: input.artifactId,
      version: input.version,
      content: contentStr,
      createdByRunId: input.createdByRunId,
      createdByStepId: input.createdByStepId ?? null,
      createdByAgentId: input.createdByAgentId ?? null,
      parentVersionId: input.parentVersionId ?? null,
      reviewStatus: ARTIFACT_REVIEW_STATUS.PENDING,
      diffSummary: input.diffSummary ?? null,
      createdAt: ts,
    })

    const version = await this.getVersion(input.id)
    if (!version) throw new AppError('ARTIFACT_SAVE_FAILED', 'Failed to create artifact version')
    return version
  }

  async setCurrentVersion(artifactId: string, versionId: string): Promise<void> {
    await this.db
      .update(artifacts)
      .set({ currentVersionId: versionId, updatedAt: toMySQL() })
      .where(eq(artifacts.id, artifactId))
  }

  async getArtifact(artifactId: string): Promise<Artifact | null> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1)

    if (rows.length === 0) return null
    return this.mapArtifact(rows[0])
  }

  async listVersions(artifactId: string): Promise<ArtifactVersion[]> {
    const rows = await this.db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .orderBy(artifactVersions.version)

    return rows.map(this.mapVersion)
  }

  async getVersion(versionId: string): Promise<ArtifactVersion | null> {
    const rows = await this.db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.id, versionId))
      .limit(1)

    if (rows.length === 0) return null
    return this.mapVersion(rows[0])
  }

  async listArtifactsByRun(runId: string): Promise<Artifact[]> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.runId, runId))
      .orderBy(artifacts.createdAt)

    return rows.map(this.mapArtifact)
  }

  // ─── 映射函数（箭头函数属性避免 this 丢失）─────────────────

  private mapArtifact = (row: typeof artifacts.$inferSelect): Artifact => ({
    id: row.id,
    runId: row.runId,
    projectId: row.projectId ?? undefined,
    workflowRunId: row.workflowRunId ?? undefined,
    workflowStageId: row.workflowStageId ?? undefined,
    type: row.type,
    title: row.title ?? undefined,
    currentVersionId: row.currentVersionId ?? undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

  private mapVersion = (row: typeof artifactVersions.$inferSelect): ArtifactVersion => ({
    id: row.id,
    artifactId: row.artifactId,
    version: row.version,
    content: this.parseContent(row.content),
    createdByRunId: row.createdByRunId,
    createdByStepId: row.createdByStepId ?? undefined,
    createdByAgentId: row.createdByAgentId ?? undefined,
    parentVersionId: row.parentVersionId ?? undefined,
    reviewStatus: row.reviewStatus as ArtifactVersion['reviewStatus'] ?? undefined,
    diffSummary: row.diffSummary ?? undefined,
    createdAt: row.createdAt,
  })

  private parseContent(content: string): unknown {
    try {
      return JSON.parse(content)
    } catch {
      return content
    }
  }
}

function stableArtifactId(idempotencyKey: string): string {
  const hash = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 22)
  return `art-${hash}`
}

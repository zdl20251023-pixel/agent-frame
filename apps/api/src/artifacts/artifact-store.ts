import type { Artifact, ArtifactVersion } from '@agent-frame/shared'

// ============================================================
// ArtifactStore 接口 — 产物存储抽象
// ============================================================

export type CreateArtifactInput = {
  id: string
  runId: string
  type: string
  title?: string
  projectId?: string
  metadata?: Record<string, unknown>
}

export type CreateArtifactVersionInput = {
  id: string
  artifactId: string
  version: number
  content: unknown
  createdByRunId: string
  createdByStepId?: string
  createdByAgentId?: string
  parentVersionId?: string
  diffSummary?: string
}

export interface ArtifactStore {
  // ─── Artifact 操作 ─────────────────────────────────────────

  /** 创建 Artifact 记录（不含版本内容） */
  createArtifact(input: CreateArtifactInput): Promise<Artifact>

  /** 创建版本内容 */
  createVersion(input: CreateArtifactVersionInput): Promise<ArtifactVersion>

  /**
   * 原子写入：创建 Artifact + 创建第一个版本 + 更新 currentVersionId
   * 设计原则：先提交事务，再 emit SSE 事件
   */
  createArtifactWithVersion(
    artifactInput: Omit<CreateArtifactInput, 'id'>,
    content: unknown,
    context: { runId: string; stepId?: string; agentId?: string },
  ): Promise<{ artifact: Artifact; version: ArtifactVersion }>

  /** 更新 currentVersionId */
  setCurrentVersion(artifactId: string, versionId: string): Promise<void>

  /** 查询 Artifact 基础信息 */
  getArtifact(artifactId: string): Promise<Artifact | null>

  /** 查询 Artifact 的所有版本 */
  listVersions(artifactId: string): Promise<ArtifactVersion[]>

  /** 查询特定版本 */
  getVersion(versionId: string): Promise<ArtifactVersion | null>

  /** 查询某个 Run 产出的所有 Artifact */
  listArtifactsByRun(runId: string): Promise<Artifact[]>
}

import type { Artifact, ArtifactVersion } from '@agent-frame/shared'
import { ARTIFACT_REVIEW_STATUS } from '@agent-frame/shared'
import { createHash } from 'node:crypto'
import type {
  ArtifactStore,
  CreateArtifactInput,
  CreateArtifactVersionInput,
} from './artifact-store.js'
import { generateArtifactId, generateVersionId, now } from '../shared/utils/id.js'

// ============================================================
// MemoryArtifactStore — 内存实现（开发调试 / 降级）
// ============================================================

export class MemoryArtifactStore implements ArtifactStore {
  private artifacts = new Map<string, Artifact>()
  private versions = new Map<string, ArtifactVersion>()
  private versionsByArtifact = new Map<string, string[]>()
  private artifactsByRun = new Map<string, string[]>()

  async createArtifact(input: CreateArtifactInput): Promise<Artifact> {
    const existing = this.artifacts.get(input.id)
    if (existing) return existing

    const ts = now()
    const artifact: Artifact = {
      id: input.id,
      runId: input.runId,
      type: input.type,
      title: input.title,
      projectId: input.projectId,
      metadata: input.metadata,
      currentVersionId: undefined,
      createdAt: ts,
      updatedAt: ts,
    }
    this.artifacts.set(artifact.id, artifact)
    // 按 run 索引
    const list = this.artifactsByRun.get(artifact.runId) ?? []
    list.push(artifact.id)
    this.artifactsByRun.set(artifact.runId, list)
    return artifact
  }

  async createVersion(input: CreateArtifactVersionInput): Promise<ArtifactVersion> {
    const version: ArtifactVersion = {
      id: input.id,
      artifactId: input.artifactId,
      version: input.version,
      content: input.content,
      createdByRunId: input.createdByRunId,
      createdByStepId: input.createdByStepId,
      createdByAgentId: input.createdByAgentId,
      parentVersionId: input.parentVersionId,
      diffSummary: input.diffSummary,
      reviewStatus: ARTIFACT_REVIEW_STATUS.PENDING,
      createdAt: now(),
    }
    this.versions.set(version.id, version)
    const list = this.versionsByArtifact.get(version.artifactId) ?? []
    list.push(version.id)
    this.versionsByArtifact.set(version.artifactId, list)
    return version
  }

  async createArtifactWithVersion(
    artifactInput: Omit<CreateArtifactInput, 'id'>,
    content: unknown,
    context: { runId: string; stepId?: string; agentId?: string; idempotencyKey?: string },
  ): Promise<{ artifact: Artifact; version: ArtifactVersion }> {
    const idempotencyKey = context.idempotencyKey ?? artifactInput.idempotencyKey
    const artifactId = idempotencyKey ? stableArtifactId(idempotencyKey) : generateArtifactId()
    const versionId = generateVersionId()

    const existingArtifact = await this.getArtifact(artifactId)
    if (existingArtifact?.currentVersionId) {
      const existingVersion = await this.getVersion(existingArtifact.currentVersionId)
      if (existingVersion) return { artifact: existingArtifact, version: existingVersion }
    }

    const artifact = await this.createArtifact({ ...artifactInput, id: artifactId })
    const version = await this.createVersion({
      id: versionId,
      artifactId,
      version: 1,
      content,
      createdByRunId: context.runId,
      createdByStepId: context.stepId,
      createdByAgentId: context.agentId,
    })
    await this.setCurrentVersion(artifactId, versionId)
    return { artifact: { ...artifact, currentVersionId: versionId }, version }
  }

  async setCurrentVersion(artifactId: string, versionId: string): Promise<void> {
    const artifact = this.artifacts.get(artifactId)
    if (!artifact) return
    this.artifacts.set(artifactId, {
      ...artifact,
      currentVersionId: versionId,
      updatedAt: now(),
    })
  }

  async getArtifact(artifactId: string): Promise<Artifact | null> {
    return this.artifacts.get(artifactId) ?? null
  }

  async listVersions(artifactId: string): Promise<ArtifactVersion[]> {
    const ids = this.versionsByArtifact.get(artifactId) ?? []
    return ids.map((id) => this.versions.get(id)!).filter(Boolean)
  }

  async getVersion(versionId: string): Promise<ArtifactVersion | null> {
    return this.versions.get(versionId) ?? null
  }

  async listArtifactsByRun(runId: string): Promise<Artifact[]> {
    const ids = this.artifactsByRun.get(runId) ?? []
    return ids.map((id) => this.artifacts.get(id)!).filter(Boolean)
  }
}

function stableArtifactId(idempotencyKey: string): string {
  const hash = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 22)
  return `art-${hash}`
}

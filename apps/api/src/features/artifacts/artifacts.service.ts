import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import type { Artifact, ArtifactVersion } from '@agent-frame/shared'
import { AppError } from '../../shared/errors/app-error.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// ArtifactsService — 产物查询应用服务
//
// 职责：
// - 封装 ArtifactStore 的查询逻辑，供 HTTP route 使用
// - 处理 Not Found 转换为 AppError
// - 未来可在此层加缓存、访问控制（artifact-policy）、脱敏等逻辑
// ============================================================

export type ArtifactContentResult = {
  artifactId: string
  type: string
  title?: string
  version: number
  versionId: string
  content: unknown
  createdAt: string
  updatedAt: string
}

export class ArtifactsService {
  constructor(private readonly store: ArtifactStore) {}

  /**
   * 查询 Artifact 基础信息
   */
  async getArtifact(artifactId: string): Promise<Artifact> {
    const artifact = await this.store.getArtifact(artifactId)
    if (!artifact) {
      throw new AppError('NOT_FOUND', `Artifact not found: ${artifactId}`, { statusCode: 404 })
    }
    logger.debug('[ArtifactsService] getArtifact', { artifactId })
    return artifact
  }

  /**
   * 查询 Artifact 的所有版本
   */
  async listVersions(artifactId: string): Promise<{ artifactId: string; versions: ArtifactVersion[]; total: number }> {
    // 先确认 artifact 存在
    const artifact = await this.store.getArtifact(artifactId)
    if (!artifact) {
      throw new AppError('NOT_FOUND', `Artifact not found: ${artifactId}`, { statusCode: 404 })
    }

    const versions = await this.store.listVersions(artifactId)
    logger.debug('[ArtifactsService] listVersions', { artifactId, count: versions.length })
    return { artifactId, versions, total: versions.length }
  }

  /**
   * 查询指定版本
   */
  async getVersion(artifactId: string, versionId: string): Promise<ArtifactVersion> {
    const version = await this.store.getVersion(versionId)
    if (!version || version.artifactId !== artifactId) {
      throw new AppError(
        'NOT_FOUND',
        `Version ${versionId} not found for artifact ${artifactId}`,
        { statusCode: 404 },
      )
    }
    return version
  }

  /**
   * 获取当前版本内容（快捷接口）
   */
  async getContent(artifactId: string): Promise<ArtifactContentResult> {
    const artifact = await this.store.getArtifact(artifactId)
    if (!artifact) {
      throw new AppError('NOT_FOUND', `Artifact not found: ${artifactId}`, { statusCode: 404 })
    }

    if (!artifact.currentVersionId) {
      throw new AppError('NOT_FOUND', `Artifact ${artifactId} has no content yet`, { statusCode: 404 })
    }

    const version = await this.store.getVersion(artifact.currentVersionId)
    if (!version) {
      throw new AppError('NOT_FOUND', `Current version not found for artifact ${artifactId}`, { statusCode: 404 })
    }

    logger.debug('[ArtifactsService] getContent', { artifactId, versionId: version.id })
    return {
      artifactId: artifact.id,
      type: artifact.type,
      title: artifact.title,
      version: version.version,
      versionId: version.id,
      content: version.content,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    }
  }

  /**
   * 查询 Run 下的所有 Artifact
   */
  async listByRun(runId: string): Promise<Artifact[]> {
    const artifacts = await this.store.listArtifactsByRun(runId)
    logger.debug('[ArtifactsService] listByRun', { runId, count: artifacts.length })
    return artifacts
  }
}

import type { ArtifactVersion } from '@agent-frame/shared'
import type { ArtifactStore, CreateArtifactVersionInput } from './artifact-store.js'
import { generateVersionId } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'
import { AppError } from '../shared/errors/app-error.js'

// ============================================================
// ArtifactVersionManager — Artifact 版本管理独立模块
//
// 职责：
// - 封装「创建新版本 + 更新 currentVersionId」的原子操作
// - 支持 diff 摘要（简单文本比对）
// - 支持版本回滚（将 currentVersionId 指向历史版本）
// - 提供 getLatestVersion / getVersionByNumber 快捷查询
// ============================================================

export class ArtifactVersionManager {
  constructor(private store: ArtifactStore) {}

  /**
   * 为已存在的 Artifact 追加新版本
   *
   * @param artifactId 目标 Artifact ID
   * @param content 新内容
   * @param context 创建上下文（runId、stepId、agentId）
   * @param diffSummary 可选：变更摘要说明
   */
  async addVersion(
    artifactId: string,
    content: unknown,
    context: { runId: string; stepId?: string; agentId?: string },
    diffSummary?: string,
  ): Promise<ArtifactVersion> {
    const artifact = await this.store.getArtifact(artifactId)
    if (!artifact) {
      throw new AppError('NOT_FOUND', `Artifact not found: ${artifactId}`, { statusCode: 404 })
    }

    // 获取当前最新版本号
    const versions = await this.store.listVersions(artifactId)
    const nextVersionNumber = versions.length > 0
      ? Math.max(...versions.map((v) => v.version)) + 1
      : 1

    const input: CreateArtifactVersionInput = {
      id: generateVersionId(),
      artifactId,
      version: nextVersionNumber,
      content,
      createdByRunId: context.runId,
      createdByStepId: context.stepId,
      createdByAgentId: context.agentId,
      parentVersionId: artifact.currentVersionId,
      diffSummary: diffSummary ?? this.computeDiffSummary(
        artifact.currentVersionId ? versions.find((v) => v.id === artifact.currentVersionId)?.content : undefined,
        content,
      ),
    }

    const version = await this.store.createVersion(input)
    await this.store.setCurrentVersion(artifactId, version.id)

    logger.info('[ArtifactVersionManager] New version added', {
      artifactId,
      versionId: version.id,
      versionNumber: nextVersionNumber,
    })

    return version
  }

  /**
   * 版本回滚：将 currentVersionId 回退到指定历史版本
   */
  async rollback(artifactId: string, targetVersionId: string): Promise<void> {
    const artifact = await this.store.getArtifact(artifactId)
    if (!artifact) {
      throw new AppError('NOT_FOUND', `Artifact not found: ${artifactId}`, { statusCode: 404 })
    }

    const version = await this.store.getVersion(targetVersionId)
    if (!version || version.artifactId !== artifactId) {
      throw new AppError('NOT_FOUND', `Version ${targetVersionId} not found for artifact ${artifactId}`, {
        statusCode: 404,
      })
    }

    await this.store.setCurrentVersion(artifactId, targetVersionId)
    logger.info('[ArtifactVersionManager] Rolled back to version', { artifactId, targetVersionId })
  }

  /**
   * 获取最新版本（即 currentVersionId 指向的版本）
   */
  async getLatestVersion(artifactId: string): Promise<ArtifactVersion | null> {
    const artifact = await this.store.getArtifact(artifactId)
    if (!artifact?.currentVersionId) return null
    return this.store.getVersion(artifact.currentVersionId)
  }

  /**
   * 按版本号查询（版本号从 1 开始）
   */
  async getVersionByNumber(artifactId: string, versionNumber: number): Promise<ArtifactVersion | null> {
    const versions = await this.store.listVersions(artifactId)
    return versions.find((v) => v.version === versionNumber) ?? null
  }

  /**
   * 简单 diff 摘要：内容变化的字符数
   */
  private computeDiffSummary(prevContent: unknown, nextContent: unknown): string {
    try {
      const prev = typeof prevContent === 'string' ? prevContent : JSON.stringify(prevContent ?? '')
      const next = typeof nextContent === 'string' ? nextContent : JSON.stringify(nextContent ?? '')
      const delta = next.length - prev.length
      return delta >= 0
        ? `+${delta} chars (${next.length} total)`
        : `${delta} chars (${next.length} total)`
    } catch {
      return 'Content changed'
    }
  }
}

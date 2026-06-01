import { Elysia, t } from 'elysia'
import { container } from '../../container.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// Artifacts Feature — HTTP API 入口
// ============================================================

export const artifactsRoute = new Elysia({ prefix: '/artifacts' })

  // GET /artifacts/:artifactId — 查询 Artifact 基础信息（含 currentVersionId）
  .get(
    '/:artifactId',
    async ({ params, set }) => {
      const artifact = await container.artifactStore.getArtifact(params.artifactId)
      if (!artifact) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Artifact not found: ${params.artifactId}` }
      }
      return artifact
    },
    {
      params: t.Object({ artifactId: t.String() }),
    },
  )

  // GET /artifacts/:artifactId/versions — 查询所有版本列表
  .get(
    '/:artifactId/versions',
    async ({ params, set }) => {
      const artifact = await container.artifactStore.getArtifact(params.artifactId)
      if (!artifact) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Artifact not found: ${params.artifactId}` }
      }
      const versions = await container.artifactStore.listVersions(params.artifactId)
      return {
        artifactId: params.artifactId,
        versions,
        total: versions.length,
      }
    },
    {
      params: t.Object({ artifactId: t.String() }),
    },
  )

  // GET /artifacts/:artifactId/versions/:versionId — 查询特定版本内容
  .get(
    '/:artifactId/versions/:versionId',
    async ({ params, set }) => {
      const version = await container.artifactStore.getVersion(params.versionId)
      if (!version || version.artifactId !== params.artifactId) {
        set.status = 404
        return {
          code: 'NOT_FOUND',
          message: `Version ${params.versionId} not found for artifact ${params.artifactId}`,
        }
      }
      return version
    },
    {
      params: t.Object({
        artifactId: t.String(),
        versionId: t.String(),
      }),
    },
  )

  // GET /artifacts/:artifactId/content — 直接返回当前版本内容（快捷接口）
  .get(
    '/:artifactId/content',
    async ({ params, set }) => {
      const artifact = await container.artifactStore.getArtifact(params.artifactId)
      if (!artifact) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Artifact not found: ${params.artifactId}` }
      }

      if (!artifact.currentVersionId) {
        set.status = 404
        return { code: 'NOT_FOUND', message: 'Artifact has no content yet' }
      }

      const version = await container.artifactStore.getVersion(artifact.currentVersionId)
      if (!version) {
        set.status = 404
        return { code: 'NOT_FOUND', message: 'Current version not found' }
      }

      logger.debug('[artifacts.route] Content fetched', {
        artifactId: params.artifactId,
        versionId: version.id,
      })

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
    },
    {
      params: t.Object({ artifactId: t.String() }),
    },
  )

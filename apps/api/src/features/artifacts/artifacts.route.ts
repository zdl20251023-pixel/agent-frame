import { Elysia, t } from 'elysia'
import { container } from '../../container.js'

// ============================================================
// Artifacts Feature — HTTP API 入口
// 通过 ArtifactsService 统一查询，不直接访问 ArtifactStore
// ============================================================

export const artifactsRoute = new Elysia({ prefix: '/artifacts' })

  // GET /artifacts/:artifactId — 查询 Artifact 基础信息（含 currentVersionId）
  .get(
    '/:artifactId',
    async ({ params }) => {
      return container.artifactsService.getArtifact(params.artifactId)
    },
    {
      params: t.Object({ artifactId: t.String() }),
    },
  )

  // GET /artifacts/:artifactId/versions — 查询所有版本列表
  .get(
    '/:artifactId/versions',
    async ({ params }) => {
      return container.artifactsService.listVersions(params.artifactId)
    },
    {
      params: t.Object({ artifactId: t.String() }),
    },
  )

  // GET /artifacts/:artifactId/versions/:versionId — 查询特定版本内容
  .get(
    '/:artifactId/versions/:versionId',
    async ({ params }) => {
      return container.artifactsService.getVersion(params.artifactId, params.versionId)
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
    async ({ params }) => {
      return container.artifactsService.getContent(params.artifactId)
    },
    {
      params: t.Object({ artifactId: t.String() }),
    },
  )

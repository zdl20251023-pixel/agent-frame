import { Elysia, t } from 'elysia'
import { container } from '../../container.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// Projects Feature — HTTP API
// 对应 FRAMEWORK_DESIGN §18.4 Project API
//
// 路由：
// POST   /projects                        — 创建 Project
// GET    /projects                        — 列出当前用户所有 Project
// GET    /projects/:projectId             — 查询 Project 详情
// PATCH  /projects/:projectId             — 更新 Project
// DELETE /projects/:projectId             — 删除 Project（软删除）
// GET    /projects/:projectId/runs        — Project 下的 Run 列表
// GET    /projects/:projectId/artifacts   — Project 下的 Artifact 列表
// ============================================================

export const projectsRoute = new Elysia({ prefix: '/projects' })
  .use(requireAuthPlugin)

  // POST /projects — 创建 Project
  .post(
    '/',
    async ({ authUser, body, set }) => {
      try {
        const project = await container.projectsService.createProject(authUser!.id, {
          name: body.name,
          type: body.type as 'general' | 'creative' | 'research' | 'automation' | undefined,
          description: body.description,
          metadata: body.metadata as Record<string, unknown> | undefined,
        })
        set.status = 201
        return project
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        logger.error('[projects.route] createProject error', { errorCode: 'INTERNAL_ERROR' })
        set.status = 500
        return { code: 'INTERNAL_ERROR', message: 'Failed to create project' }
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        type: t.Optional(t.String()),
        description: t.Optional(t.String()),
        metadata: t.Optional(t.Any()),
      }),
    },
  )

  // GET /projects — 列出 Project
  .get('/', async ({ authUser }) => {
    return container.projectsService.listProjects(authUser!.id)
  })

  // GET /projects/:projectId — 查询详情
  .get(
    '/:projectId',
    async ({ authUser, params, set }) => {
      try {
        return await container.projectsService.getProject(authUser!.id, params.projectId)
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    { params: t.Object({ projectId: t.String() }) },
  )

  // PATCH /projects/:projectId — 更新 Project
  .patch(
    '/:projectId',
    async ({ authUser, params, body, set }) => {
      try {
        return await container.projectsService.updateProject(authUser!.id, params.projectId, {
          name: body.name,
          description: body.description,
          metadata: body.metadata as Record<string, unknown> | undefined,
        })
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      params: t.Object({ projectId: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        metadata: t.Optional(t.Any()),
      }),
    },
  )

  // DELETE /projects/:projectId — 软删除
  .delete(
    '/:projectId',
    async ({ authUser, params, set }) => {
      try {
        await container.projectsService.deleteProject(authUser!.id, params.projectId)
        set.status = 204
        return
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    { params: t.Object({ projectId: t.String() }) },
  )

  // GET /projects/:projectId/runs — Project 下的 Run 列表
  .get(
    '/:projectId/runs',
    async ({ authUser, params, query, set }) => {
      try {
        const limit = Number(query.limit) || 20
        const offset = Number(query.offset) || 0
        const runs = await container.projectsService.listProjectRuns(
          authUser!.id,
          params.projectId,
          limit,
          offset,
        )
        return { projectId: params.projectId, runs, total: runs.length }
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      params: t.Object({ projectId: t.String() }),
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  // GET /projects/:projectId/artifacts — Project 下的 Artifact 列表
  .get(
    '/:projectId/artifacts',
    async ({ authUser, params, set }) => {
      try {
        const artifactList = await container.projectsService.listProjectArtifacts(
          authUser!.id,
          params.projectId,
        )
        return { projectId: params.projectId, artifacts: artifactList, total: artifactList.length }
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    { params: t.Object({ projectId: t.String() }) },
  )

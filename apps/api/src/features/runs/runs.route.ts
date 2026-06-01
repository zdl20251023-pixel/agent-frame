import { Elysia, t } from 'elysia'
import { container } from '../../container.js'
import { createSseStream } from '../../shared/realtime/sse.handler.js'
import { AppError, isAppError } from '../../shared/errors/app-error.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// Runs Feature — HTTP API 入口
// ============================================================

export const runsRoute = new Elysia({ prefix: '/runs' })

  // POST /runs — 创建并启动一次 Run
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const run = await container.runManager.createRun({
          input: body.input,
          agentId: body.agentId,
          userId: body.userId ?? 'dev-user',
          projectId: body.projectId,
          sessionId: body.sessionId,
        })

        set.status = 201
        return {
          runId: run.id,
          traceId: run.traceId,
          status: run.status,
          createdAt: run.createdAt,
        }
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        logger.error('[runs.route] POST /runs failed', { errorCode: 'INTERNAL_ERROR' })
        set.status = 500
        return { code: 'INTERNAL_ERROR', message: 'Internal server error' }
      }
    },
    {
      body: t.Object({
        input: t.Any(),
        agentId: t.Optional(t.String()),
        userId: t.Optional(t.String()),
        projectId: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
      }),
    },
  )

  // GET /runs/:runId — 查询 Run 状态
  .get(
    '/:runId',
    async ({ params, set }) => {
      const run = await container.runManager.getRun(params.runId)
      if (!run) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Run not found: ${params.runId}` }
      }
      return run
    },
    {
      params: t.Object({ runId: t.String() }),
    },
  )

  // GET /runs/:runId/events — SSE 订阅 Run 事件流
  .get(
    '/:runId/events',
    async ({ params, set }) => {
      set.headers['Content-Type'] = 'text/event-stream'
      set.headers['Cache-Control'] = 'no-cache'
      set.headers['Connection'] = 'keep-alive'
      set.headers['X-Accel-Buffering'] = 'no'
      set.headers['Access-Control-Allow-Origin'] = '*'

      // 先检查 Run 是否存在
      const run = await container.runManager.getRun(params.runId)
      if (!run) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Run not found: ${params.runId}` }
      }

      logger.info('[runs.route] SSE subscription started', { runId: params.runId })

      return createSseStream(params.runId)
    },
    {
      params: t.Object({ runId: t.String() }),
    },
  )

  // DELETE /runs/:runId — 取消 Run
  .delete(
    '/:runId',
    async ({ params, set }) => {
      const cancelled = await container.runManager.cancelRun(params.runId)
      if (!cancelled) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Run not found or already finished: ${params.runId}` }
      }
      return { success: true, runId: params.runId }
    },
    {
      params: t.Object({ runId: t.String() }),
    },
  )

  // GET /runs/:runId/artifacts — 查询 Run 的产物（MVP 返回空列表）
  .get(
    '/:runId/artifacts',
    async ({ params }) => {
      return { runId: params.runId, artifacts: [] }
    },
    {
      params: t.Object({ runId: t.String() }),
    },
  )

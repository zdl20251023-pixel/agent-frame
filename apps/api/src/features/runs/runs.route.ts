import { Elysia, t } from 'elysia'
import { container } from '../../container.js'
import { createSseStream } from '../../shared/realtime/sse.handler.js'
import { AppError, isAppError } from '../../shared/errors/app-error.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// Runs Feature — HTTP API 入口
// ============================================================

export const runsRoute = new Elysia({ prefix: '/runs' })

  // GET /runs — 查询 Run 历史列表（MySQL 下持久化可用）
  .get(
    '/',
    async ({ query, set }) => {
      try {
        const limit = Math.min(Number(query.limit ?? 20), 100)
        const runs = await container.store.listRuns(limit)
        return { runs, total: runs.length }
      } catch (err) {
        logger.error('[runs.route] GET /runs failed', {
          errorCode: 'INTERNAL_ERROR',
        })
        console.error('[GET /runs] error:', err)
        set.status = 500
        return { code: 'INTERNAL_ERROR', message: String(err) }
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric()),
      }),
    },
  )

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
        console.error('[POST /runs] error:', err)
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

  // GET /runs/:runId/steps — 查询 Run 的所有 Step（调用链追踪）
  .get(
    '/:runId/steps',
    async ({ params, set }) => {
      const run = await container.runManager.getRun(params.runId)
      if (!run) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Run not found: ${params.runId}` }
      }
      const steps = await container.store.listSteps(params.runId)
      return { runId: params.runId, steps }
    },
    {
      params: t.Object({ runId: t.String() }),
    },
  )

  // GET /runs/:runId/events — SSE 订阅实时事件流 / 回放历史事件
  .get(
    '/:runId/events',
    async ({ params, query, set }) => {
      const run = await container.runManager.getRun(params.runId)
      if (!run) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Run not found: ${params.runId}` }
      }

      // replay=true：返回历史事件 JSON 数组（用于查询已完成的 Run）
      if (query.replay === 'true') {
        const events = await container.store.listEvents(params.runId)
        return { runId: params.runId, events, total: events.length }
      }

      const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      }

      logger.info('[runs.route] SSE subscription started', { runId: params.runId })

      // 如果 Run 已结束，先推送所有历史事件再关闭
      if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
        const pastEvents = await container.store.listEvents(params.runId)
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            for (const event of pastEvents) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            }
            controller.close()
          },
        })
        return new Response(stream, { headers })
      }

      return new Response(createSseStream(params.runId), { headers })
    },
    {
      params: t.Object({ runId: t.String() }),
      query: t.Object({
        replay: t.Optional(t.String()),
      }),
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

  // GET /runs/:runId/artifacts — 查询 Run 的所有产物
  .get(
    '/:runId/artifacts',
    async ({ params, set }) => {
      const run = await container.runManager.getRun(params.runId)
      if (!run) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Run not found: ${params.runId}` }
      }
      const artifacts = await container.artifactStore.listArtifactsByRun(params.runId)
      return { runId: params.runId, artifacts, total: artifacts.length }
    },
    {
      params: t.Object({ runId: t.String() }),
    },
  )

import { Elysia, t } from 'elysia'
import { container } from '../../container.js'
import { createSseStream } from '../../shared/realtime/sse.handler.js'
import { isAppError } from '../../shared/errors/app-error.js'
import { logger } from '../../shared/observability/logger.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { sessionsService } from '../sessions/sessions.service.js'
import { RunsService } from './runs.service.js'
import { RUN_STATUS } from '@agent-frame/shared'
import { ConversationContextBuilder } from '../sessions/conversation-context.builder.js'
import { SessionsRepository } from '../sessions/sessions.repository.js'

// ─── 初始化 Service 层 ────────────────────────────────────────
sessionsService.setRunStore(container.store)

const conversationContextBuilder = new ConversationContextBuilder(
  container.store,
  container.artifactStore,
  new SessionsRepository(),
)

const runsService = new RunsService(
  container.runManager,
  container.store,
  container.artifactStore,
  sessionsService,
  conversationContextBuilder,
)

// ============================================================
// Runs Feature — HTTP API 入口（需登录）
// route 只负责 HTTP 协议层，业务逻辑委托给 RunsService
// ============================================================

export const runsRoute = new Elysia({ prefix: '/runs' })
  .use(requireAuthPlugin)

  .get(
    '/',
    async ({ authUser, query, set }) => {
      try {
        const limit = Math.min(Number(query.limit ?? 20), 100)
        const runs = await runsService.listRuns(authUser!.id, limit)
        return { runs, total: runs.length }
      } catch (err) {
        logger.error('[runs.route] GET /runs failed', { errorCode: 'INTERNAL_ERROR' })
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

  .post(
    '/',
    async ({ authUser, body, set }) => {
      try {
        const result = await runsService.createRun({
          input: body.input,
          agentId: body.agentId,
          userId: authUser!.id,
          projectId: body.projectId,
          sessionId: body.sessionId,
        })
        set.status = 201
        return result
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        const detail = err instanceof Error ? err.message : String(err)
        logger.error('[runs.route] POST /runs failed', { errorCode: 'INTERNAL_ERROR', message: detail })
        set.status = 500
        return { code: 'INTERNAL_ERROR', message: detail }
      }
    },
    {
      body: t.Object({
        input: t.Any(),
        agentId: t.Optional(t.String()),
        projectId: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
      }),
    },
  )

  .get(
    '/:runId',
    async ({ authUser, params, set }) => {
      try {
        const run = await runsService.getRun(params.runId, authUser!.id)
        return run
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    { params: t.Object({ runId: t.String() }) },
  )

  .get(
    '/:runId/steps',
    async ({ authUser, params, set }) => {
      try {
        const steps = await runsService.getSteps(params.runId, authUser!.id)
        return { runId: params.runId, steps }
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    { params: t.Object({ runId: t.String() }) },
  )

  .get(
    '/:runId/events',
    async ({ authUser, params, query, set }) => {
      try {
        await runsService.assertRunAccess(params.runId, authUser!.id)
        const run = await container.runManager.getRun(params.runId)
        if (!run) {
          set.status = 404
          return { code: 'NOT_FOUND', message: `Run not found: ${params.runId}` }
        }

        if (query.replay === 'true') {
          const events = await runsService.getEvents(params.runId, authUser!.id)
          return { runId: params.runId, events, total: events.length }
        }

        const headers = {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': '*',
        }

        logger.info('[runs.route] SSE subscription started', { runId: params.runId })

        if (run.status === RUN_STATUS.COMPLETED || run.status === RUN_STATUS.FAILED || run.status === RUN_STATUS.CANCELLED) {
          const pastEvents = await runsService.getEvents(params.runId, authUser!.id)
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
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    {
      params: t.Object({ runId: t.String() }),
      query: t.Object({
        replay: t.Optional(t.String()),
      }),
    },
  )

  .delete(
    '/:runId',
    async ({ authUser, params, set }) => {
      try {
        const cancelled = await runsService.cancelRun(params.runId, authUser!.id)
        if (!cancelled) {
          set.status = 404
          return { code: 'NOT_FOUND', message: `Run not found or already finished: ${params.runId}` }
        }
        return { success: true, runId: params.runId }
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    { params: t.Object({ runId: t.String() }) },
  )

  .get(
    '/:runId/artifacts',
    async ({ authUser, params, set }) => {
      try {
        const artifacts = await runsService.getArtifacts(params.runId, authUser!.id)
        return { runId: params.runId, artifacts, total: artifacts.length }
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    { params: t.Object({ runId: t.String() }) },
  )

import { Elysia, t } from 'elysia'
import { container } from '../../container.js'
import { createSseStream } from '../../shared/realtime/sse.handler.js'
import { AppError, isAppError } from '../../shared/errors/app-error.js'
import { logger } from '../../shared/observability/logger.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { sessionsService } from '../sessions/sessions.service.js'

sessionsService.setRunStore(container.store)

// ============================================================
// Runs Feature — HTTP API 入口（需登录）
// ============================================================

async function assertRunAccess(runId: string, userId: string) {
  await sessionsService.assertRunOwnedByUser(runId, userId)
}

function extractMessage(input: unknown): string {
  if (input && typeof input === 'object' && input !== null && 'message' in input) {
    const msg = (input as { message?: unknown }).message
    if (typeof msg === 'string') return msg
  }
  return ''
}

export const runsRoute = new Elysia({ prefix: '/runs' })
  .use(requireAuthPlugin)

  .get(
    '/',
    async ({ authUser, query, set }) => {
      try {
        const limit = Math.min(Number(query.limit ?? 20), 100)
        const runs = await container.store.listRunsByUser(authUser!.id, limit)
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
        const userId = authUser!.id
        const sessionId = await sessionsService.resolveSessionId(userId, body.sessionId)
        const message = extractMessage(body.input)

        const run = await container.runManager.createRun({
          input: body.input,
          agentId: body.agentId,
          userId,
          projectId: body.projectId,
          sessionId,
        })

        await sessionsService.touchSession(sessionId)
        if (message) {
          await sessionsService.maybeSetTitleFromMessage(sessionId, userId, message)
        }

        set.status = 201
        return {
          runId: run.id,
          traceId: run.traceId,
          status: run.status,
          sessionId,
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
        projectId: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
      }),
    },
  )

  .get(
    '/:runId',
    async ({ authUser, params, set }) => {
      try {
        await assertRunAccess(params.runId, authUser!.id)
        const run = await container.runManager.getRun(params.runId)
        if (!run) {
          set.status = 404
          return { code: 'NOT_FOUND', message: `Run not found: ${params.runId}` }
        }
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
        await assertRunAccess(params.runId, authUser!.id)
        const steps = await container.store.listSteps(params.runId)
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
        await assertRunAccess(params.runId, authUser!.id)
        const run = await container.runManager.getRun(params.runId)
        if (!run) {
          set.status = 404
          return { code: 'NOT_FOUND', message: `Run not found: ${params.runId}` }
        }

        if (query.replay === 'true') {
          const events = await container.store.listEvents(params.runId)
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
        await assertRunAccess(params.runId, authUser!.id)
        const cancelled = await container.runManager.cancelRun(params.runId)
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
        await assertRunAccess(params.runId, authUser!.id)
        const artifacts = await container.artifactStore.listArtifactsByRun(params.runId)
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

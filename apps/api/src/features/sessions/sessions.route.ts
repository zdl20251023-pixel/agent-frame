import { Elysia, t } from 'elysia'
import { sessionsService } from './sessions.service.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'
import { container } from '../../container.js'
import { SessionsRepository } from './sessions.repository.js'
import { SessionProjectionService } from './session-projection.service.js'
import { createSessionSseStream } from '../../shared/realtime/sse.handler.js'

sessionsService.setRunStore(container.store)

const sessionProjectionService = new SessionProjectionService(
  container.store,
  container.artifactStore,
  new SessionsRepository(),
)

// ============================================================
// 会话 HTTP 路由
// ============================================================

export const sessionsRoute = new Elysia({ prefix: '/sessions' })
  .use(requireAuthPlugin)
  .get('/', async ({ authUser, set }) => {
    try {
      return await sessionsService.listSessions(authUser!.id)
    } catch (err) {
      if (isAppError(err)) {
        set.status = err.statusCode
        return err.toJSON()
      }
      throw err
    }
  })
  .post(
    '/',
    async ({ authUser, body, set }) => {
      try {
        const session = await sessionsService.createSession(authUser!.id, body.title)
        set.status = 201
        return { session }
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
      }),
    },
  )
  .get('/:sessionId/transcript', async ({ authUser, params, set }) => {
    try {
      return await sessionsService.getTranscript(authUser!.id, params.sessionId)
    } catch (err) {
      if (isAppError(err)) {
        set.status = err.statusCode
        return err.toJSON()
      }
      throw err
    }
  })
  // GET /sessions/:sessionId/runs — Session 下所有 Run 的归属列表（完整归档）
  .get('/:sessionId/runs', async ({ authUser, params, set }) => {
    try {
      return await sessionsService.listSessionRuns(authUser!.id, params.sessionId)
    } catch (err) {
      if (isAppError(err)) {
        set.status = err.statusCode
        return err.toJSON()
      }
      throw err
    }
  })
  .get('/:sessionId/projection', async ({ authUser, params, set }) => {
    try {
      await sessionsService.assertSessionOwnedByUser(authUser!.id, params.sessionId)
      return await sessionProjectionService.build(params.sessionId, authUser!.id)
    } catch (err) {
      if (isAppError(err)) {
        set.status = err.statusCode
        return err.toJSON()
      }
      throw err
    }
  })
  .get('/:sessionId/events', async ({ authUser, params, set }) => {
    try {
      await sessionsService.assertSessionOwnedByUser(authUser!.id, params.sessionId)
      const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      }
      return new Response(createSessionSseStream(params.sessionId), { headers })
    } catch (err) {
      if (isAppError(err)) {
        set.status = err.statusCode
        return err.toJSON()
      }
      throw err
    }
  })
  .delete('/:sessionId', async ({ authUser, params, set }) => {
    try {
      await sessionsService.deleteSession(authUser!.id, params.sessionId)
      return { success: true, sessionId: params.sessionId }
    } catch (err) {
      if (isAppError(err)) {
        set.status = err.statusCode
        return err.toJSON()
      }
      throw err
    }
  })

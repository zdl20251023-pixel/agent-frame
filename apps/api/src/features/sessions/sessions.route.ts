import { Elysia, t } from 'elysia'
import { sessionsService } from './sessions.service.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'
import { container } from '../../container.js'

// 注入 RunStore
sessionsService.setRunStore(container.store)

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

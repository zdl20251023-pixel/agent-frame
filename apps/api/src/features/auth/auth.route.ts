import { Elysia, t } from 'elysia'
import { authService } from './auth.service.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'

// ============================================================
// 认证 HTTP 路由
// ============================================================

export const authRoute = new Elysia({ prefix: '/auth' })
  .post(
    '/register',
    async ({ body, set }) => {
      try {
        const result = await authService.register(body)
        set.status = 201
        return result
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
        email: t.String(),
        password: t.String(),
        username: t.Optional(t.String()),
      }),
    },
  )
  .post(
    '/login',
    async ({ body, set }) => {
      try {
        return await authService.login(body)
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
        email: t.String(),
        password: t.String(),
      }),
    },
  )
  .use(requireAuthPlugin)
  .get('/me', async ({ authUser }) => {
    return { user: await authService.me(authUser!.id) }
  })

import { Elysia, t } from 'elysia'
import { authService } from './auth.service.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'

// ============================================================
// 认证 HTTP 路由 — 完整 JWT 认证
// 对应 FRAMEWORK_DESIGN §4 — 阶段 4.3 完整 JWT 认证
//
// 路由：
// POST /auth/register          — 注册（public）
// POST /auth/login             — 登录，返回 accessToken（public）
// POST /auth/refresh           — 刷新 accessToken（public）
// GET  /auth/me                — 获取当前用户信息（需登录）
// PATCH /auth/me               — 更新用户信息（需登录）
// POST /auth/change-password   — 修改密码（需登录）
// POST /auth/logout            — 登出（需登录，当前 JWT 无状态只做客户端清除提示）
// ============================================================

export const authRoute = new Elysia({ prefix: '/auth' })

  // POST /auth/register — 注册
  .post(
    '/register',
    async ({ body, set }) => {
      try {
        const result = await authService.register(body)
        set.status = 201
        return result
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 6 }),
        username: t.Optional(t.String({ maxLength: 80 })),
      }),
    },
  )

  // POST /auth/login — 登录
  .post(
    '/login',
    async ({ body, set }) => {
      try {
        return await authService.login(body)
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
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

  // POST /auth/refresh — 刷新 accessToken
  // MVP 阶段：复用 login 流程（stateless JWT 无 refresh token 表）
  // 未来：引入 refresh_tokens 表实现真正的 token rotation
  .post(
    '/refresh',
    async ({ body, set }) => {
      try {
        // 验证旧 token 并重新签发（不校验密码，只校验 token 有效性）
        const refreshed = await authService.refreshToken(body.accessToken)
        return refreshed
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        set.status = 401
        return { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
      }
    },
    {
      body: t.Object({
        accessToken: t.String(),
      }),
    },
  )

  // — 以下路由需要认证 —
  .use(requireAuthPlugin)

  // GET /auth/me — 当前用户信息
  .get('/me', async ({ authUser }) => {
    return { user: await authService.me(authUser!.id) }
  })

  // PATCH /auth/me — 更新用户资料（username）
  .patch(
    '/me',
    async ({ authUser, body, set }) => {
      try {
        const updated = await authService.updateProfile(authUser!.id, {
          username: body.username,
        })
        return { user: updated }
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      body: t.Object({
        username: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
      }),
    },
  )

  // POST /auth/change-password — 修改密码
  .post(
    '/change-password',
    async ({ authUser, body, set }) => {
      try {
        await authService.changePassword(authUser!.id, {
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
        })
        return { success: true, message: 'Password updated successfully' }
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String({ minLength: 6 }),
      }),
    },
  )

  // POST /auth/logout — 登出
  // 无状态 JWT 下，登出只告知客户端清除 token
  // 未来接入 refresh_tokens 表时，在此处将 token 加入黑名单
  .post('/logout', ({ authUser }) => {
    return {
      success: true,
      message: 'Logged out successfully. Please discard your access token.',
      userId: authUser!.id,
    }
  })

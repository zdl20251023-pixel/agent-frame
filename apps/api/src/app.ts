import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { runsRoute } from './features/runs/runs.route.js'
import { agentsRoute } from './features/agents/agents.route.js'
import { isAppError } from './shared/errors/app-error.js'
import { logger } from './shared/observability/logger.js'
import { env } from './shared/config/env.js'

// ============================================================
// Elysia 应用创建和中间件注册
// ============================================================

export function createApp() {
  const app = new Elysia()
    .use(
      cors({
        origin: env.WEB_ORIGIN,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }),
    )
    // 请求日志中间件
    .onRequest(({ request }) => {
      logger.info('[HTTP] Request', {
        eventType: `${request.method} ${new URL(request.url).pathname}`,
      })
    })
    // 统一错误处理
    .onError(({ error, set }) => {
      if (isAppError(error)) {
        set.status = error.statusCode
        return error.toJSON()
      }
      logger.error('[HTTP] Unhandled error', { errorCode: 'INTERNAL_ERROR' })
      set.status = 500
      return { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    })
    // 健康检查
    .get('/health', () => ({
      ok: true,
      ts: new Date().toISOString(),
      version: '0.1.0',
    }))
    // 功能路由
    .use(runsRoute)
    .use(agentsRoute)

  return app
}

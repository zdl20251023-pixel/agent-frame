import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { runsRoute } from './features/runs/runs.route.js'
import { agentsRoute } from './features/agents/agents.route.js'
import { artifactsRoute } from './features/artifacts/artifacts.route.js'
import { authRoute } from './features/auth/auth.route.js'
import { sessionsRoute } from './features/sessions/sessions.route.js'
import { workflowsRoute } from './features/workflows/workflows.route.js'
import { isAppError } from './shared/errors/app-error.js'
import { logger } from './shared/observability/logger.js'
import { env } from './shared/config/env.js'

// ============================================================
// Elysia 应用创建和中间件注册
// ============================================================

const SENSITIVE_BODY_KEYS = new Set(['password', 'token', 'authorization', 'apiKey', 'api_key', 'secret'])

/**
 * 对请求体做日志安全处理。
 *
 * @param value - 任意请求体字段值。
 * @returns 可安全写入日志的值；敏感字段会被替换为 [REDACTED]。
 */
function sanitizeRequestBody(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRequestBody(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        SENSITIVE_BODY_KEYS.has(key) ? '[REDACTED]' : sanitizeRequestBody(entryValue),
      ]),
    )
  }

  return value
}

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
    // 开发环境请求体日志中间件
    .onBeforeHandle(({ request, body }) => {
      if (env.NODE_ENV !== 'development') return
      if (request.method === 'GET' || request.method === 'HEAD') return
      if (body === undefined || body === null) return

      logger.info('[HTTP] Request body', {
        eventType: `${request.method} ${new URL(request.url).pathname}`,
        body: sanitizeRequestBody(body),
      })
    })
    // 响应日志中间件
    .onAfterHandle(({ request, set }) => {
      const status = set.status ?? 200
      logger.info('[HTTP] Response', {
        eventType: `${status} ${new URL(request.url).pathname}`,
      })
    })
    // 统一错误处理
    .onError(({ error, set }) => {
      if (isAppError(error)) {
        set.status = error.statusCode
        return error.toJSON()
      }
      if (env.NODE_ENV === 'development') {
        console.error('[HTTP] Unhandled error detail:', error)
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
    .use(authRoute)
    .use(sessionsRoute)
    .use(runsRoute)
    .use(agentsRoute)
    .use(artifactsRoute)
    .use(workflowsRoute)

  return app
}

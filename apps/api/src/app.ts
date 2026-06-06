import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { runsRoute } from './features/runs/runs.route.js'
import { agentsRoute } from './features/agents/agents.route.js'
import { artifactsRoute } from './features/artifacts/artifacts.route.js'
import { authRoute } from './features/auth/auth.route.js'
import { sessionsRoute } from './features/sessions/sessions.route.js'
import { workflowsRoute } from './features/workflows/workflows.route.js'
import { projectsRoute } from './features/projects/projects.route.js'
import { memoryRoute } from './features/memory/memory.route.js'
import { usageRoute } from './features/usage/usage.route.js'
import { agentTasksRoute } from './features/agent-tasks/agent-tasks.route.js'
import { toolInvocationsRoute } from './features/tool-invocations/tool-invocations.route.js'
import { wsRoute } from './features/realtime/ws.route.js'
import { isAppError } from './shared/errors/app-error.js'
import { logger } from './shared/observability/logger.js'
import { env } from './shared/config/env.js'
import { tracingPlugin } from './shared/observability/tracing.js'
import { rateLimitPlugin } from './shared/middlewares/rate-limit.middleware.js'
import { getMetricsSnapshot } from './shared/observability/metrics.js'
import { pluginsRoute } from './features/plugins/plugins.route.js'
import { registerBuiltinPlugins } from './plugins/builtin-plugins.js'
import { runScheduler } from './runtime/scheduler.js'

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
  // 注册内置插件（FRAMEWORK_DESIGN §12 — builtin-plugins.ts）
  registerBuiltinPlugins()
  const app = new Elysia()
    .use(
      cors({
        origin: env.WEB_ORIGIN,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }),
    )
    // 链路追踪：为每个请求生成/注入 traceId（FRAMEWORK_DESIGN §0.7）
    .use(tracingPlugin)
    // 请求限流：IP 级别滑动窗口（FRAMEWORK_DESIGN §0.5 防止滥用）
    .use(rateLimitPlugin)
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
      scheduler: runScheduler.getStats(),
    }))
    // 指标端点（只在内网或监控使用）
    .get('/metrics', () => getMetricsSnapshot())
    // 功能路由
    .use(authRoute)
    .use(sessionsRoute)
    .use(runsRoute)
    .use(agentsRoute)
    .use(artifactsRoute)
    .use(workflowsRoute)
    .use(projectsRoute)
    .use(memoryRoute)
    .use(usageRoute)
    .use(agentTasksRoute)
    .use(toolInvocationsRoute)
    .use(wsRoute)
    .use(pluginsRoute)

  return app
}

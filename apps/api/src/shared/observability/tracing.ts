import { Elysia } from 'elysia'
import { generateTraceId } from '../utils/id.js'
import { logger } from './logger.js'

// ============================================================
// shared/observability/tracing.ts — traceId 链路追踪中间件
//
// 设计依据：FRAMEWORK_DESIGN §0.7 关键 ID 贯穿说明
//   "traceId — 贯穿日志、模型调用、A2A、事件和错误定位"
//
// 职责：
// - 每个 HTTP 请求生成唯一 traceId（或复用客户端传入的 X-Trace-Id）
// - 将 traceId 写入响应头 X-Trace-Id
// - 将 traceId 注入请求 context，供 route / service / logger 使用
// - 记录请求耗时到结构化日志（latencyMs）
//
// 注意：traceId 不等于 runId，一次 HTTP 请求可能包含多次 Run 创建
// ============================================================

export const tracingPlugin = new Elysia({ name: 'tracing' })
  .derive({ as: 'global' }, ({ request }): { traceId: string } => {
    // 优先使用客户端传入的 X-Trace-Id（链路追踪系统透传场景）
    const incoming = request.headers.get('x-trace-id')?.trim()
    const traceId =
      incoming && /^[a-zA-Z0-9\-_]{8,64}$/.test(incoming)
        ? incoming
        : generateTraceId()
    return { traceId }
  })
  .onBeforeHandle(({ traceId, request }) => {
    // 在请求开始时记录日志（携带 traceId）
    logger.debug('[tracing] Request started', {
      traceId,
      method: request.method,
      path: new URL(request.url).pathname,
    })
  })
  .onAfterHandle(({ traceId, request, response, set }) => {
    // 将 traceId 写入响应头，方便前端和网关关联
    if (set && typeof set.headers === 'object') {
      (set.headers as Record<string, string>)['x-trace-id'] = traceId
    }
    const status = response instanceof Response ? response.status : (set?.status ?? 200)
    logger.debug('[tracing] Request completed', {
      traceId,
      method: request.method,
      path: new URL(request.url).pathname,
      status,
    })
  })
  .onError(({ traceId, error, set }) => {
    logger.error('[tracing] Request error', {
      traceId,
      errorCode: 'HTTP_ERROR',
      error: error instanceof Error ? error.message : String(error),
    })
    if (set && typeof set.headers === 'object') {
      (set.headers as Record<string, string>)['x-trace-id'] = traceId
    }
  })

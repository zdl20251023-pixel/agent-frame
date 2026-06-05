// ============================================================
// ModelMiddleware — 模型调用中间件
//
// 包含两类中间件：
// 1. LoggingMiddleware：在模型调用前后打结构化日志（含 promptHash）
// 2. FallbackMiddleware：限流/服务不可用时自动切换到 fallback 模型
//
// 规则：
// - Middleware 只在 ai/model-client/ 内使用，绝不向外层扩散
// - 不使用 Vercel AI SDK 的 wrapLanguageModel（避免 SDK 类型泄漏）
// - FallbackMiddleware 触发时发出结构化日志（model.fallback 事件）
// ============================================================

import { logger } from '../../../shared/observability/logger.js'
import type { ModelEntry } from '../model-registry.js'
import type { ModelCallRecord } from '../usage-logger.js'

// ─── 日志中间件 ───────────────────────────────────────────────

export type LoggingContext = {
  runId?: string
  traceId?: string
  agentId?: string
  stepId?: string
  promptHash?: string
  modelAlias: string
  provider: string
  actualModelId: string
}

/**
 * 模型调用前打开始日志。
 * @returns 开始时间戳（用于计算 latency）
 */
export function logModelCallStart(ctx: LoggingContext): number {
  const startMs = Date.now()
  logger.debug('[ModelMiddleware] model call start', {
    runId: ctx.runId,
    traceId: ctx.traceId,
    agentId: ctx.agentId,
    stepId: ctx.stepId,
    promptHash: ctx.promptHash,
    modelAlias: ctx.modelAlias,
  })
  return startMs
}

/**
 * 模型调用成功后打完成日志。
 */
export function logModelCallComplete(
  ctx: LoggingContext,
  startMs: number,
  extra?: { inputTokens?: number; outputTokens?: number; finishReason?: string },
): void {
  const latencyMs = Date.now() - startMs
  logger.info('[ModelMiddleware] model call complete', {
    runId: ctx.runId,
    traceId: ctx.traceId,
    agentId: ctx.agentId,
    modelAlias: ctx.modelAlias,
    latencyMs,
    tokenInput: extra?.inputTokens,
    tokenOutput: extra?.outputTokens,
  })
}

/**
 * 模型调用失败后打错误日志。
 */
export function logModelCallError(
  ctx: LoggingContext,
  startMs: number,
  errorCode: string,
): void {
  const latencyMs = Date.now() - startMs
  logger.error('[ModelMiddleware] model call failed', {
    runId: ctx.runId,
    traceId: ctx.traceId,
    agentId: ctx.agentId,
    modelAlias: ctx.modelAlias,
    latencyMs,
    errorCode,
  })
}

// ─── Fallback 中间件 ──────────────────────────────────────────

export type FallbackResult<T> =
  | { success: true; value: T; usedFallback: false }
  | { success: true; value: T; usedFallback: true; fallbackAlias: string }
  | { success: false; error: unknown }

/**
 * 带 Fallback 的模型调用包装器。
 *
 * 如果主模型调用失败，且 ModelRegistry 中配置了 fallbackAlias，
 * 则使用 fallback 模型重试一次，并打 model.fallback 日志。
 *
 * @param primaryAlias - 主模型别名
 * @param getFallbackEntry - 获取 fallback 模型定义的函数（来自 ModelRegistry）
 * @param callFn - 实际调用函数，接受 ModelEntry 和别名，返回 Promise<T>
 * @param ctx - 日志上下文
 */
export async function withFallback<T>(
  primaryAlias: string,
  getFallbackEntry: (alias: string) => ModelEntry | undefined,
  callFn: (entry: ModelEntry, alias: string) => Promise<T>,
  primaryEntry: ModelEntry,
  ctx: Omit<LoggingContext, 'modelAlias' | 'provider' | 'actualModelId'>,
): Promise<FallbackResult<T>> {
  // ── 尝试主模型 ───────────────────────────────────────────
  try {
    const value = await callFn(primaryEntry, primaryAlias)
    return { success: true, value, usedFallback: false }
  } catch (primaryErr: unknown) {
    const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)

    // 判断是否值得 fallback（限流或服务不可用）
    const isRetryable = /rate.?limit|too many|quota|503|502|overloaded/i.test(errMsg)
    if (!isRetryable) {
      return { success: false, error: primaryErr }
    }

    const fallbackEntry = getFallbackEntry(primaryAlias)
    if (!fallbackEntry) {
      logger.warn('[ModelMiddleware] No fallback configured for model', {
        modelAlias: primaryAlias,
        errorCode: 'NO_FALLBACK',
        ...ctx,
      })
      return { success: false, error: primaryErr }
    }

    // ── 使用 fallback 重试 ─────────────────────────────────
    const fallbackAlias = fallbackEntry.actualModelId
    logger.warn('[ModelMiddleware] Switching to fallback model', {
      primaryAlias,
      fallbackProvider: fallbackEntry.provider,
      fallbackModel: fallbackEntry.actualModelId,
      reason: errMsg.slice(0, 200),
      ...ctx,
    })

    try {
      const value = await callFn(fallbackEntry, fallbackAlias)
      return { success: true, value, usedFallback: true, fallbackAlias }
    } catch (fallbackErr: unknown) {
      return { success: false, error: fallbackErr }
    }
  }
}

// ─── Usage 记录辅助（含 retryCount）─────────────────────────────

export type UsageRecordInput = Omit<ModelCallRecord, 'retryCount'> & {
  retryCount?: number
}

// ============================================================
// StreamErrorNormalizer — 流式响应错误归一化
//
// 规则：
// - 将 provider 原始错误（HTTP 状态码、字符串、Error 对象）
//   统一转换为框架内部的 ModelError 结构
// - 不向前端暴露 provider 原始错误细节
// - 所有分类依据公开 HTTP 状态或错误消息模式
// ============================================================

import type { ModelError } from '../../ai/model-client/model-client.types.js'

// ─── 可识别的错误类型 ─────────────────────────────────────────

/** 速率限制错误（HTTP 429 / "rate limit" 关键字） */
const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /too many requests/i,
  /quota exceeded/i,
  /request limit/i,
]

/** 超时错误 */
const TIMEOUT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /ETIMEDOUT/,
  /deadline exceeded/i,
]

/** Provider 服务不可用 */
const UNAVAILABLE_PATTERNS = [
  /service unavailable/i,
  /overloaded/i,
  /capacity/i,
  /503/,
  /502/,
]

/** 认证失败 */
const AUTH_PATTERNS = [
  /unauthorized/i,
  /invalid api key/i,
  /authentication failed/i,
  /401/,
  /403/,
]

/** 内容安全拦截 */
const CONTENT_FILTER_PATTERNS = [
  /content filter/i,
  /safety/i,
  /policy violation/i,
  /content_filter/i,
]

// ─── 错误分类函数 ─────────────────────────────────────────────

function matchPatterns(message: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(message))
}

function getStatusCode(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    const status = e.status ?? e.statusCode ?? e.code
    if (typeof status === 'number') return status
    if (typeof status === 'string') {
      const n = parseInt(status, 10)
      if (!isNaN(n)) return n
    }
  }
  return undefined
}

/**
 * 将任意错误归一化为框架的 ModelError 结构。
 *
 * @param err - 来自 AI SDK / provider 的原始错误
 * @param provider - 可选：provider 名称，用于错误上下文
 * @param modelAlias - 可选：模型别名，用于错误上下文
 */
export function normalizeStreamError(
  err: unknown,
  provider?: string,
  modelAlias?: string,
): ModelError {
  const message = err instanceof Error ? err.message : String(err)
  const statusCode = getStatusCode(err)

  // ── 速率限制 ───────────────────────────────────────────────
  if (statusCode === 429 || matchPatterns(message, RATE_LIMIT_PATTERNS)) {
    return {
      code: 'RATE_LIMIT',
      message: 'Model provider rate limit reached. Please retry later.',
      provider,
      model: modelAlias,
      retryable: true,
    }
  }

  // ── 超时 ───────────────────────────────────────────────────
  if (matchPatterns(message, TIMEOUT_PATTERNS)) {
    return {
      code: 'MODEL_TIMEOUT',
      message: 'Model call timed out.',
      provider,
      model: modelAlias,
      retryable: true,
    }
  }

  // ── Provider 不可用 ────────────────────────────────────────
  if (
    statusCode === 502 ||
    statusCode === 503 ||
    matchPatterns(message, UNAVAILABLE_PATTERNS)
  ) {
    return {
      code: 'PROVIDER_ERROR',
      message: 'Model provider is temporarily unavailable.',
      provider,
      model: modelAlias,
      retryable: true,
    }
  }

  // ── 认证失败 ───────────────────────────────────────────────
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    matchPatterns(message, AUTH_PATTERNS)
  ) {
    return {
      code: 'PROVIDER_ERROR',
      message: 'Model provider authentication failed. Check API key.',
      provider,
      model: modelAlias,
      retryable: false,
    }
  }

  // ── 内容安全拦截 ───────────────────────────────────────────
  if (matchPatterns(message, CONTENT_FILTER_PATTERNS)) {
    return {
      code: 'MODEL_CALL_FAILED',
      message: 'Request was blocked by content safety filters.',
      provider,
      model: modelAlias,
      retryable: false,
    }
  }

  // ── 通用模型调用失败 ───────────────────────────────────────
  return {
    code: 'MODEL_CALL_FAILED',
    message: `Model stream failed: ${message}`,
    provider,
    model: modelAlias,
    retryable: false,
  }
}

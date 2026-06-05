// ============================================================
// 单元测试：StreamErrorNormalizer
// ============================================================

import { describe, it, expect } from 'bun:test'
import { normalizeStreamError } from '../../../src/shared/errors/stream-error-normalizer.js'

describe('normalizeStreamError', () => {
  // ── 速率限制 ──────────────────────────────────────────────

  it('HTTP 429 状态码 → RATE_LIMIT', () => {
    const err = Object.assign(new Error('Request failed'), { status: 429 })
    const result = normalizeStreamError(err, 'openai', 'fast.chat')
    expect(result.code).toBe('RATE_LIMIT')
    expect(result.retryable).toBe(true)
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('fast.chat')
  })

  it('"rate limit" 关键字 → RATE_LIMIT', () => {
    const err = new Error('rate limit exceeded')
    expect(normalizeStreamError(err).code).toBe('RATE_LIMIT')
    expect(normalizeStreamError(err).retryable).toBe(true)
  })

  it('"Too Many Requests" 关键字 → RATE_LIMIT', () => {
    const err = new Error('Too Many Requests from user')
    expect(normalizeStreamError(err).code).toBe('RATE_LIMIT')
  })

  it('"quota exceeded" → RATE_LIMIT', () => {
    const err = new Error('quota exceeded for this model')
    expect(normalizeStreamError(err).code).toBe('RATE_LIMIT')
  })

  // ── 超时 ──────────────────────────────────────────────────

  it('"timeout" 关键字 → MODEL_TIMEOUT', () => {
    const err = new Error('Request timeout after 30000ms')
    const result = normalizeStreamError(err)
    expect(result.code).toBe('MODEL_TIMEOUT')
    expect(result.retryable).toBe(true)
  })

  it('"ETIMEDOUT" → MODEL_TIMEOUT', () => {
    const err = new Error('ETIMEDOUT')
    expect(normalizeStreamError(err).code).toBe('MODEL_TIMEOUT')
  })

  it('"deadline exceeded" → MODEL_TIMEOUT', () => {
    const err = new Error('deadline exceeded')
    expect(normalizeStreamError(err).code).toBe('MODEL_TIMEOUT')
  })

  // ── Provider 不可用 ───────────────────────────────────────

  it('HTTP 503 状态码 → PROVIDER_ERROR', () => {
    const err = Object.assign(new Error('Service Unavailable'), { statusCode: 503 })
    const result = normalizeStreamError(err)
    expect(result.code).toBe('PROVIDER_ERROR')
    expect(result.retryable).toBe(true)
  })

  it('"overloaded" 关键字 → PROVIDER_ERROR', () => {
    const err = new Error('Claude is overloaded at the moment')
    expect(normalizeStreamError(err).code).toBe('PROVIDER_ERROR')
  })

  // ── 认证失败 ──────────────────────────────────────────────

  it('HTTP 401 状态码 → PROVIDER_ERROR（不可重试）', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    const result = normalizeStreamError(err)
    expect(result.code).toBe('PROVIDER_ERROR')
    expect(result.retryable).toBe(false)
  })

  it('"invalid api key" → PROVIDER_ERROR（不可重试）', () => {
    const err = new Error('Invalid API key provided')
    const result = normalizeStreamError(err)
    expect(result.code).toBe('PROVIDER_ERROR')
    expect(result.retryable).toBe(false)
  })

  // ── 内容安全 ──────────────────────────────────────────────

  it('"content filter" → MODEL_CALL_FAILED（不可重试）', () => {
    const err = new Error('Request blocked by content filter')
    const result = normalizeStreamError(err)
    expect(result.code).toBe('MODEL_CALL_FAILED')
    expect(result.retryable).toBe(false)
  })

  // ── 通用兜底 ──────────────────────────────────────────────

  it('未知错误 → MODEL_CALL_FAILED', () => {
    const err = new Error('Some unknown error')
    const result = normalizeStreamError(err)
    expect(result.code).toBe('MODEL_CALL_FAILED')
    expect(result.message).toContain('Some unknown error')
  })

  it('字符串错误 → MODEL_CALL_FAILED', () => {
    const result = normalizeStreamError('raw string error')
    expect(result.code).toBe('MODEL_CALL_FAILED')
  })

  it('null 错误 → MODEL_CALL_FAILED', () => {
    const result = normalizeStreamError(null)
    expect(result.code).toBe('MODEL_CALL_FAILED')
  })

  // ── provider / model 字段 ─────────────────────────────────

  it('正确设置 provider 和 model 字段', () => {
    const err = new Error('timeout')
    const result = normalizeStreamError(err, 'anthropic', 'claude.medium')
    expect(result.provider).toBe('anthropic')
    expect(result.model).toBe('claude.medium')
  })
})

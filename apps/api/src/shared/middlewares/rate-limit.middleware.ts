import { Elysia } from 'elysia'
import { AppError } from '../errors/app-error.js'

// ============================================================
// shared/middlewares/rate-limit.middleware.ts — 请求限流
//
// 设计依据：FRAMEWORK_DESIGN §0.5 当前 MVP 目标
//   防止单用户滥用、A2A 爆炸调用和成本失控
//
// MVP 实现：进程内滑动窗口计数器（无 Redis 依赖）
// 后续：替换为 Redis Lua 脚本实现的分布式限流
//
// 限流策略：
// - 全局 IP 限流：每 IP 每分钟最多 N 次请求
// - 按 userId 限流：每用户每分钟最多 M 次 Run 创建
// - 可配置的豁免路径（health、metrics、auth/login）
// ============================================================

type WindowEntry = {
  count: number
  windowStart: number
}

class SlidingWindowRateLimiter {
  private windows: Map<string, WindowEntry> = new Map()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
    private readonly label: string,
  ) {
    // 定期清理过期 window，防止内存泄漏
    this.cleanupTimer = setInterval(() => this.cleanup(), windowMs * 2)
  }

  /** 检查并消费配额；返回 true 表示允许 */
  check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const entry = this.windows.get(key)

    if (!entry || now - entry.windowStart >= this.windowMs) {
      // 新 window
      this.windows.set(key, { count: 1, windowStart: now })
      return { allowed: true, remaining: this.maxRequests - 1, resetAt: now + this.windowMs }
    }

    entry.count++
    const allowed = entry.count <= this.maxRequests
    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetAt: entry.windowStart + this.windowMs,
    }
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.windows.entries()) {
      if (now - entry.windowStart >= this.windowMs * 2) {
        this.windows.delete(key)
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
  }
}

// ─── 限流器实例 ─────────────────────────────────────────────

/** 全局 IP 限流：每 IP 每分钟 120 次 */
const ipLimiter = new SlidingWindowRateLimiter(60_000, 120, 'ip')

/** 用户 Run 创建限流：每用户每分钟 10 次 */
const runCreateLimiter = new SlidingWindowRateLimiter(60_000, 10, 'run-create')

// ─── 豁免路径 ────────────────────────────────────────────────

const EXEMPT_PATHS = new Set([
  '/api/health',
  '/api/metrics',
  '/api/auth/login',
  '/api/auth/register',
])

// ─── Elysia 中间件插件 ────────────────────────────────────────

/** 全局 IP 速率限制，适用于所有请求 */
export const rateLimitPlugin = new Elysia({ name: 'rate-limit' })
  .onBeforeHandle(({ request, set }) => {
    const path = new URL(request.url).pathname
    if (EXEMPT_PATHS.has(path)) return

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    const { allowed, remaining, resetAt } = ipLimiter.check(ip)

    // 写入速率限制响应头
    if (typeof set?.headers === 'object') {
      const h = set.headers as Record<string, string>
      h['x-ratelimit-limit'] = '120'
      h['x-ratelimit-remaining'] = String(remaining)
      h['x-ratelimit-reset'] = String(Math.ceil(resetAt / 1000))
    }

    if (!allowed) {
      set.status = 429
      throw new AppError('RATE_LIMIT', 'Too many requests. Please slow down.', { statusCode: 429 })
    }
  })

/**
 * Run 创建专用限流（额外用于 POST /runs）
 * 使用方式：在 runs.route.ts 里 .use(runCreateRateLimitPlugin)
 */
export const runCreateRateLimitPlugin = new Elysia({ name: 'run-create-rate-limit' })
  .onBeforeHandle(({ request, set }) => {
    const userId =
      request.headers.get('x-user-id') ??
      new URL(request.url).searchParams.get('userId') ??
      'anonymous'

    const { allowed, remaining, resetAt } = runCreateLimiter.check(userId)

    if (typeof set?.headers === 'object') {
      const h = set.headers as Record<string, string>
      h['x-run-ratelimit-limit'] = '10'
      h['x-run-ratelimit-remaining'] = String(remaining)
      h['x-run-ratelimit-reset'] = String(Math.ceil(resetAt / 1000))
    }

    if (!allowed) {
      set.status = 429
      throw new AppError('RATE_LIMIT', 'Too many run creation requests. Please wait.', { statusCode: 429 })
    }
  })

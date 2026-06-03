import { logger } from '../shared/observability/logger.js'

// ============================================================
// RetryPolicy — Stage 执行重试策略
//
// 采用指数退避：delay = backoffMs * 2^attempt（上限 30s）
// ============================================================

export type RetryPolicyConfig = {
  /** 最大重试次数（不含首次执行） */
  maxRetries: number
  /** 退避基础时间（ms）*/
  backoffMs: number
}

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxRetries: 2,
  backoffMs: 1000,
}

export class RetryPolicy {
  constructor(private config: RetryPolicyConfig = DEFAULT_RETRY_POLICY) {}

  get maxRetries() { return this.config.maxRetries }

  /**
   * 判断是否还可以重试
   */
  canRetry(attempt: number): boolean {
    return attempt < this.config.maxRetries
  }

  /**
   * 计算下次重试等待时间（ms），指数退避 + 上限 30s
   */
  getDelayMs(attempt: number): number {
    const delay = this.config.backoffMs * Math.pow(2, attempt)
    return Math.min(delay, 30_000)
  }

  /**
   * 等待重试延迟（可被 AbortSignal 中断）
   */
  async wait(attempt: number, signal?: AbortSignal): Promise<void> {
    const delayMs = this.getDelayMs(attempt)
    logger.debug('[RetryPolicy] Waiting before retry', { attempt, delayMs })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
  }
}

/**
 * 根据 Stage 配置创建 RetryPolicy，fallback 到默认值
 */
export function createRetryPolicy(options?: {
  maxRetries?: number
  retryBackoffMs?: number
}): RetryPolicy {
  return new RetryPolicy({
    maxRetries: options?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
    backoffMs: options?.retryBackoffMs ?? DEFAULT_RETRY_POLICY.backoffMs,
  })
}

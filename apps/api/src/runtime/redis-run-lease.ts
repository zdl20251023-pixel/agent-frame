import { env } from '../shared/config/env.js'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// RedisRunLease — 多实例 Run 调度并发租约
//
// Scheduler 本地仍负责闭包执行与优先级队列；生产多实例时，RedisRunLease
// 通过 ZSET 控制全局并发槽位，避免每个实例各自跑满 MAX_CONCURRENT_RUNS。
// queued/running Run 由 MySQL 持久化，进程重启后由 RunRecoveryWorker 重新入队。
// ============================================================

type RedisClient = {
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>
  zcard(key: string): Promise<number>
  zadd(key: string, score: number, member: string): Promise<number>
  zrem(key: string, member: string): Promise<number>
  quit(): Promise<unknown>
}

let redisPromise: Promise<RedisClient | null> | undefined

async function getRedis(): Promise<RedisClient | null> {
  if (!env.REDIS_URL) return null
  if (redisPromise) return redisPromise
  redisPromise = (async () => {
    try {
      const mod = await import('ioredis')
      return new mod.default(env.REDIS_URL, {
        lazyConnect: false,
        maxRetriesPerRequest: 2,
      }) as RedisClient
    } catch (err) {
      logger.warn('[RedisRunLease] Redis unavailable, falling back to local scheduler only', {
        errorCode: err instanceof Error ? err.message : 'REDIS_UNAVAILABLE',
      })
      return null
    }
  })()
  return redisPromise
}

export type RunLease = {
  taskId: string
  release: () => Promise<void>
}

export async function acquireRunLease(taskId: string, ttlMs: number): Promise<RunLease | undefined> {
  const redis = await getRedis()
  if (!redis) return undefined

  const key = 'agent-frame:run-scheduler:leases'
  const maxConcurrent = Number(env.MAX_CONCURRENT_RUNS || 5)
  const member = `${process.pid}:${taskId}`
  const now = Date.now()
  const expiresAt = now + ttlMs

  await redis.zremrangebyscore(key, '-inf', now)

  const current = await redis.zcard(key)
  if (current >= maxConcurrent) {
    throw new Error(`Distributed scheduler lease full (${current}/${maxConcurrent})`)
  }

  await redis.zadd(key, expiresAt, member)
  logger.debug('[RedisRunLease] Lease acquired', { taskId, expiresAt })

  return {
    taskId,
    release: async () => {
      await redis.zrem(key, member)
      logger.debug('[RedisRunLease] Lease released', { taskId })
    },
  }
}

import type { AgentEvent } from '@agent-frame/shared'
import { eventBus as memoryBus } from './event-bus.js'
import { logger } from '../observability/logger.js'

// ============================================================
// shared/realtime/redis-event-bus.ts — Redis Pub/Sub EventBus 适配器
//
// 设计依据：FRAMEWORK_DESIGN §40.10 队列与 Worker 的后续实现边界
//   "Redis — 后续可用于队列、分布式锁、事件广播"
//
// MVP 阶段：
// - 若 REDIS_URL 未配置，自动降级到内存 EventBus（无缝切换）
// - 若 REDIS_URL 已配置，使用 Redis Pub/Sub 广播事件（支持多实例）
//
// 架构说明：
// - 发布者：emit() 向 Redis channel `agent-frame:events:<runId>` 发布 JSON
// - 订阅者：subscribe() 监听该 channel，接收远程实例发出的事件
// - 本地 SSE/WS 连接仍由内存 eventBus 驱动，Redis 桥接作为跨实例广播补充
//
// 注意：当前 Bun 不内置 Redis 客户端，使用 ioredis 包（需要安装）
// 安装: bun add ioredis @types/ioredis
// ============================================================

export type EventBusAdapter = {
  subscribe(runId: string, handler: (event: AgentEvent) => void): () => void
  emit(event: AgentEvent): void
  listenerCount(runId: string): number
  clearRunHandlers(runId: string): void
}

/** 内存 EventBus 适配器（始终可用，作为降级和本地实现）*/
const memoryAdapter: EventBusAdapter = memoryBus

/**
 * Redis EventBus 适配器
 *
 * 使用方式：
 *   import { createRedisEventBus } from './redis-event-bus.js'
 *   const bus = await createRedisEventBus('redis://localhost:6379')
 *
 * 依赖：ioredis（需单独安装）
 * 当前为接口预留 + 动态 import，不影响无 Redis 环境的启动
 */
async function createRedisEventBus(redisUrl: string): Promise<EventBusAdapter> {
  // 动态 import，避免无 ioredis 时崩溃
  let Redis: typeof import('ioredis').default
  try {
    const mod = await import('ioredis')
    Redis = mod.default
  } catch {
    logger.warn('[RedisEventBus] ioredis not installed, falling back to memory EventBus')
    return memoryAdapter
  }

  const CHANNEL_PREFIX = 'agent-frame:events:'

  const pub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 })
  const sub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 })

  await pub.connect()
  await sub.connect()

  // 本地处理器存储（仍然与内存 bus 并行，确保同实例 SSE/WS 能接收）
  const localHandlers = new Map<string, Set<(event: AgentEvent) => void>>()

  // Redis 消息 → 本地处理器分发
  sub.on('message', (channel: string, message: string) => {
    const runId = channel.replace(CHANNEL_PREFIX, '')
    let event: AgentEvent
    try {
      event = JSON.parse(message) as AgentEvent
    } catch {
      return
    }
    const handlers = localHandlers.get(runId)
    if (!handlers) return
    for (const handler of handlers) {
      try { handler(event) } catch { /* ignore */ }
    }
  })

  sub.on('error', (err: Error) => {
    logger.warn('[RedisEventBus] Subscriber error', { errorCode: 'REDIS_ERROR', error: err.message })
  })
  pub.on('error', (err: Error) => {
    logger.warn('[RedisEventBus] Publisher error', { errorCode: 'REDIS_ERROR', error: err.message })
  })

  logger.info('[RedisEventBus] Connected to Redis', { redisUrl })

  return {
    subscribe(runId: string, handler: (event: AgentEvent) => void): () => void {
      if (!localHandlers.has(runId)) {
        localHandlers.set(runId, new Set())
        sub.subscribe(CHANNEL_PREFIX + runId).catch(() => {})
      }
      localHandlers.get(runId)!.add(handler)

      return () => {
        localHandlers.get(runId)?.delete(handler)
        if (localHandlers.get(runId)?.size === 0) {
          localHandlers.delete(runId)
          sub.unsubscribe(CHANNEL_PREFIX + runId).catch(() => {})
        }
      }
    },

    emit(event: AgentEvent): void {
      // 同步发布到 Redis channel（异步 fire-and-forget）
      pub.publish(CHANNEL_PREFIX + event.runId, JSON.stringify(event)).catch((err: Error) => {
        logger.warn('[RedisEventBus] Publish failed', {
          errorCode: 'REDIS_PUBLISH_FAILED',
          error: err.message,
        })
      })
      // 同时也触发本地处理器（同实例内 SSE 连接）
      memoryAdapter.emit(event)
    },

    listenerCount(runId: string): number {
      return localHandlers.get(runId)?.size ?? 0
    },

    clearRunHandlers(runId: string): void {
      localHandlers.delete(runId)
      sub.unsubscribe(CHANNEL_PREFIX + runId).catch(() => {})
    },
  }
}

/**
 * getEventBus — 统一的 EventBus 入口
 *
 * 如果 REDIS_URL 环境变量已配置，使用 Redis EventBus（多实例支持）
 * 否则使用内存 EventBus（单实例，零依赖）
 *
 * 使用懒初始化 + 单例缓存
 */
let _busPromise: Promise<EventBusAdapter> | null = null

export function getEventBus(): Promise<EventBusAdapter> {
  if (_busPromise) return _busPromise

  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    logger.info('[EventBus] Using Redis EventBus', { redisUrl: redisUrl.replace(/:[^:@]*@/, ':***@') })
    _busPromise = createRedisEventBus(redisUrl)
  } else {
    logger.info('[EventBus] Using in-memory EventBus (set REDIS_URL to enable multi-instance support)')
    _busPromise = Promise.resolve(memoryAdapter)
  }

  return _busPromise
}

/** 重置单例（仅用于测试）*/
export function _resetEventBus(): void {
  _busPromise = null
}

export type { EventBusAdapter }

import type { AgentEvent } from '@agent-frame/shared'

// ============================================================
// 进程内事件总线
// MVP 阶段使用内存实现，后续替换为 Redis Pub/Sub
// ============================================================

type EventHandler = (event: AgentEvent) => void

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map()

  subscribe(runId: string, handler: EventHandler): () => void {
    if (!this.handlers.has(runId)) {
      this.handlers.set(runId, new Set())
    }
    this.handlers.get(runId)!.add(handler)

    // 返回取消订阅函数
    return () => this.unsubscribe(runId, handler)
  }

  unsubscribe(runId: string, handler: EventHandler): void {
    this.handlers.get(runId)?.delete(handler)
    if (this.handlers.get(runId)?.size === 0) {
      this.handlers.delete(runId)
    }
  }

  emit(event: AgentEvent): void {
    const handlers = this.handlers.get(event.runId)
    if (!handlers || handlers.size === 0) return
    for (const handler of handlers) {
      try {
        handler(event)
      } catch (err) {
        console.error('[EventBus] Handler error:', err)
      }
    }
  }

  listenerCount(runId: string): number {
    return this.handlers.get(runId)?.size ?? 0
  }

  clearRunHandlers(runId: string): void {
    this.handlers.delete(runId)
  }
}

// 单例事件总线
export const eventBus = new EventBus()

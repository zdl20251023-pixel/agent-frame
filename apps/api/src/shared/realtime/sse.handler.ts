import type { AgentEvent, StoredAgentEvent } from '@agent-frame/shared'
import { isTerminalEvent } from '@agent-frame/shared'
import { getEventBus } from './redis-event-bus.js'

// ============================================================
// SSE（Server-Sent Events）流封装
// 支持 Last-Event-ID / cursor 续订（after=<eventId>）
// ============================================================

export function formatSseEvent(stored: StoredAgentEvent | { id?: number; event: AgentEvent }): string {
  const idLine = stored.id !== undefined ? `id: ${stored.id}\n` : ''
  return `${idLine}data: ${JSON.stringify(stored.event)}\n\n`
}

export function createSseStream(runId: string, afterEventId = 0): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(': heartbeat\n\n'))

      try {
        const bus = await getEventBus()
        unsubscribe = bus.subscribe(runId, (event: AgentEvent) => {
          const data = `data: ${JSON.stringify(event)}\n\n`
          try {
            controller.enqueue(encoder.encode(data))
            if (isTerminalEvent(event)) {
              controller.close()
              unsubscribe?.()
            }
          } catch {
            unsubscribe?.()
          }
        })
      } catch (err) {
        controller.error(err)
      }

      void afterEventId
    },
    cancel() {
      unsubscribe?.()
    },
  })
}

/** 从已持久化事件列表创建 SSE 回放流（带 event id） */
export function createReplaySseStream(storedEvents: StoredAgentEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const item of storedEvents) {
        controller.enqueue(encoder.encode(formatSseEvent(item)))
      }
      controller.close()
    },
  })
}

/** Session 级 SSE — 订阅 session 通道上的跨 Run 异步事件 */
export function createSessionSseStream(sessionId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  const channelId = `session:${sessionId}`

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(': heartbeat\n\n'))
      try {
        const bus = await getEventBus()
        unsubscribe = bus.subscribe(channelId, (event: AgentEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          } catch {
            unsubscribe?.()
          }
        })
      } catch (err) {
        controller.error(err)
      }
    },
    cancel() {
      unsubscribe?.()
    },
  })
}

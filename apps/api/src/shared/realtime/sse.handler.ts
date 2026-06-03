import type { AgentEvent } from '@agent-frame/shared'
import { isTerminalEvent } from '@agent-frame/shared'
import { getEventBus } from './redis-event-bus.js'

// ============================================================
// SSE（Server-Sent Events）流封装
// 供 Elysia route 直接调用
// ============================================================

export function createSseStream(runId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // 发送初始心跳（保持连接）
      controller.enqueue(encoder.encode(': heartbeat\n\n'))

      try {
        const bus = await getEventBus()
        unsubscribe = bus.subscribe(runId, (event: AgentEvent) => {
          const data = `data: ${JSON.stringify(event)}\n\n`
          try {
            controller.enqueue(encoder.encode(data))
            // 终态事件后关闭 SSE 流
            if (isTerminalEvent(event)) {
              controller.close()
              unsubscribe?.()
            }
          } catch {
            // 连接已关闭
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

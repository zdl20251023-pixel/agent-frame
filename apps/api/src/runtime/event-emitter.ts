import type { AgentEvent } from '@agent-frame/shared'
import { eventBus } from '../shared/realtime/event-bus.js'
import type { RunStore } from './stores/run-store.js'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// EventEmitter — 框架事件发布中心
// 发布事件 = 广播给 SSE 订阅者 + 持久化到 RunStore
// ============================================================

export class RunEventEmitter {
  constructor(private store: RunStore) {}

  async emit(event: AgentEvent): Promise<void> {
    const runId = event.runId
    const log = logger.child({ runId, eventType: event.type })

    // 1. 先持久化（RunStore.appendEvent）
    try {
      await this.store.appendEvent(runId, event)
    } catch (err) {
      log.error('[EventEmitter] Failed to persist event', { errorCode: 'INTERNAL_ERROR' })
    }

    // 2. 再广播给 SSE 订阅者
    eventBus.emit(event)

    log.debug('[EventEmitter] Event emitted')
  }
}

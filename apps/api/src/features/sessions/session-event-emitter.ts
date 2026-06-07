import type { AgentEvent } from '@agent-frame/shared'
import { getEventBus } from '../../shared/realtime/redis-event-bus.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// SessionEventEmitter — 会话级事件广播
// 用于 Run 完成后的异步 repair / AgentTask 事件推送。
// ============================================================

export async function emitSessionEvent(sessionId: string, event: AgentEvent): Promise<void> {
  if (!sessionId) return
  try {
    const bus = await getEventBus()
    bus.emit({ ...event, runId: `session:${sessionId}` } as AgentEvent)
  } catch (err) {
    logger.warn('[SessionEventEmitter] emit failed', {
      sessionId,
      errorCode: err instanceof Error ? err.message : 'EMIT_FAILED',
    })
  }
}

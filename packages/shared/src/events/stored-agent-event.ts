import type { AgentEvent } from './agent-event.js'

// ============================================================
// StoredAgentEvent — 带数据库自增 ID 的持久化事件
// 用于 SSE cursor 续订（after=<eventId>）
// ============================================================

export type StoredAgentEvent = {
  /** run_events 表自增主键 */
  id: number
  event: AgentEvent
  createdAt: string
}

import type { AgentEvent } from './agent-event.js'

// ============================================================
// StoredAgentEvent — 带数据库自增 ID 的持久化事件
// 用于 SSE cursor 续订（after=<eventId>）
// ============================================================

export type StoredAgentEvent = {
  id: number          // run_events 表自增主键，用作 SSE 回放游标
  event: AgentEvent   // 原始 AgentEvent 事件体
  createdAt: string   // 事件写入时间（ISO 8601）
}

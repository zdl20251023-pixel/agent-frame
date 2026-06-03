import type { AgentEvent } from '@agent-frame/shared'
import { getEventBus } from './redis-event-bus.js'
import { logger } from '../observability/logger.js'
import { metrics } from '../observability/metrics.js'

// ============================================================
// shared/realtime/ws.hub.ts — WebSocket 多 Run 订阅中心
//
// 设计依据：FRAMEWORK_DESIGN §0.13 Glossary
//   "WebSocket — 双向实时通信协议，适合多 run、多房间和双向控制场景"
//   vs "SSE — 单向推送，适合单 run 监听"
//
// 职责：
// - 管理每个 WebSocket 连接订阅的 runId 列表（一个连接可同时订阅多个 Run）
// - 将 eventBus 事件推送给订阅该 runId 的所有 WebSocket 连接
// - 处理连接关闭时自动取消订阅
// - 支持前端发送 subscribe / unsubscribe 控制消息
//
// 消息协议（JSON）：
// Client → Server:
//   { type: 'subscribe', runId: 'xxx' }
//   { type: 'unsubscribe', runId: 'xxx' }
//   { type: 'ping' }
//
// Server → Client:
//   { type: 'pong' }
//   { type: 'subscribed', runId: 'xxx' }
//   { type: 'unsubscribed', runId: 'xxx' }
//   { type: 'event', runId: 'xxx', event: AgentEvent }
//   { type: 'error', message: 'xxx' }
// ============================================================

/** WebSocket 客户端消息类型 */
export type WsClientMessage =
  | { type: 'subscribe'; runId: string }
  | { type: 'unsubscribe'; runId: string }
  | { type: 'ping' }

/** WebSocket 服务端消息类型 */
export type WsServerMessage =
  | { type: 'pong' }
  | { type: 'subscribed'; runId: string }
  | { type: 'unsubscribed'; runId: string }
  | { type: 'event'; runId: string; event: AgentEvent }
  | { type: 'error'; message: string }

type WsConnection = {
  id: string
  send: (data: string) => void
  close: () => void
  subscribedRunIds: Set<string>
  unsubscribeFns: Map<string, () => void>
  userId?: string
}

// ─── Hub 实现 ────────────────────────────────────────────────

class WebSocketHub {
  private connections: Map<string, WsConnection> = new Map()

  /** 注册新 WebSocket 连接 */
  addConnection(
    connectionId: string,
    send: (data: string) => void,
    close: () => void,
    userId?: string,
  ): void {
    const conn: WsConnection = {
      id: connectionId,
      send,
      close,
      subscribedRunIds: new Set(),
      unsubscribeFns: new Map(),
      userId,
    }
    this.connections.set(connectionId, conn)
    metrics.activeWsConnections.inc()
    logger.debug('[WsHub] Connection added', { connectionId, userId })
  }

  /** 移除 WebSocket 连接（连接关闭时调用）*/
  removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId)
    if (!conn) return

    // 取消所有 runId 订阅
    for (const unsub of conn.unsubscribeFns.values()) {
      unsub()
    }
    conn.unsubscribeFns.clear()
    conn.subscribedRunIds.clear()

    this.connections.delete(connectionId)
    metrics.activeWsConnections.dec()
    logger.debug('[WsHub] Connection removed', { connectionId })
  }

  /** 订阅一个 runId 的事件 */
  async subscribe(connectionId: string, runId: string): Promise<void> {
    const conn = this.connections.get(connectionId)
    if (!conn) return
    if (conn.subscribedRunIds.has(runId)) return // 已订阅，幂等

    conn.subscribedRunIds.add(runId)

    try {
      const bus = await getEventBus()
      // 再次检查连接是否存在（可能在 await 期间连接断开了）
      const activeConn = this.connections.get(connectionId)
      if (!activeConn) return

      const unsub = bus.subscribe(runId, (event) => {
        this.pushEvent(connectionId, runId, event)
      })

      activeConn.unsubscribeFns.set(runId, unsub)
      this.sendToConnection(activeConn, { type: 'subscribed', runId })
      logger.debug('[WsHub] Subscribed', { connectionId, runId })
    } catch (err: any) {
      conn.subscribedRunIds.delete(runId)
      this.sendToConnection(conn, { type: 'error', message: `Subscription failed: ${err.message}` })
    }
  }

  /** 取消订阅一个 runId */
  unsubscribe(connectionId: string, runId: string): void {
    const conn = this.connections.get(connectionId)
    if (!conn) return

    const unsub = conn.unsubscribeFns.get(runId)
    if (unsub) {
      unsub()
      conn.unsubscribeFns.delete(runId)
    }
    conn.subscribedRunIds.delete(runId)

    this.sendToConnection(conn, { type: 'unsubscribed', runId })
    logger.debug('[WsHub] Unsubscribed', { connectionId, runId })
  }

  /** 处理来自客户端的控制消息 */
  handleMessage(connectionId: string, rawData: string): void {
    const conn = this.connections.get(connectionId)
    if (!conn) return

    let msg: WsClientMessage
    try {
      msg = JSON.parse(rawData) as WsClientMessage
    } catch {
      this.sendToConnection(conn, { type: 'error', message: 'Invalid JSON message' })
      return
    }

    switch (msg.type) {
      case 'subscribe':
        if (!msg.runId || typeof msg.runId !== 'string') {
          this.sendToConnection(conn, { type: 'error', message: 'runId is required' })
          return
        }
        this.subscribe(connectionId, msg.runId)
        break

      case 'unsubscribe':
        if (!msg.runId) {
          this.sendToConnection(conn, { type: 'error', message: 'runId is required' })
          return
        }
        this.unsubscribe(connectionId, msg.runId)
        break

      case 'ping':
        this.sendToConnection(conn, { type: 'pong' })
        break

      default:
        this.sendToConnection(conn, { type: 'error', message: `Unknown message type` })
    }
  }

  /** 向某个连接推送 Run 事件 */
  private pushEvent(connectionId: string, runId: string, event: AgentEvent): void {
    const conn = this.connections.get(connectionId)
    if (!conn) return
    this.sendToConnection(conn, { type: 'event', runId, event })
  }

  private sendToConnection(conn: WsConnection, msg: WsServerMessage): void {
    try {
      conn.send(JSON.stringify(msg))
    } catch {
      // 连接已关闭，静默处理
      this.removeConnection(conn.id)
    }
  }

  /** 当前统计信息（供 /metrics 使用）*/
  stats() {
    return {
      connectionCount: this.connections.size,
      subscriptionCount: [...this.connections.values()].reduce(
        (sum, c) => sum + c.subscribedRunIds.size,
        0,
      ),
    }
  }
}

export const wsHub = new WebSocketHub()

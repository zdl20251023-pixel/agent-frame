import { Elysia } from 'elysia'
import { wsHub } from '../../shared/realtime/ws.hub.js'
import { verifyAccessToken } from '../../shared/auth/jwt.js'
import { logger } from '../../shared/observability/logger.js'
import { generateId } from '../../shared/utils/id.js'

// ============================================================
// features/realtime/ws.route.ts — WebSocket 多 Run 订阅端点
//
// 设计依据：FRAMEWORK_DESIGN §0.13 Glossary
//   "WebSocket — 适合多 run、多房间和双向控制场景"
//
// 端点：GET /ws (WebSocket Upgrade)
//
// 认证方式：query param ?token=<jwt>（与 SSE 一致）
// 协议：见 ws.hub.ts WsClientMessage / WsServerMessage
// ============================================================

export const wsRoute = new Elysia({ prefix: '/ws' })
  .ws('/', {
    open(ws) {
      const connectionId = generateId()
      const url = ws.data.request?.url ?? ''
      const token = new URL(url, 'http://localhost').searchParams.get('token')

      // 异步验证 token，认证失败时关闭连接
      ;(async () => {
        let userId: string | undefined
        if (token) {
          try {
            const payload = await verifyAccessToken(token)
            userId = payload.sub
          } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }))
            ws.close()
            return
          }
        }

        // 存储 connectionId 到 ws.data 供后续 message/close 使用
        ;(ws.data as Record<string, unknown>).connectionId = connectionId

        wsHub.addConnection(
          connectionId,
          (data) => ws.send(data),
          () => ws.close(),
          userId,
        )

        logger.debug('[WsRoute] Connection opened', { connectionId, userId })
      })()
    },

    message(ws, message) {
      const connectionId = (ws.data as Record<string, unknown>).connectionId as string
      if (!connectionId) return
      wsHub.handleMessage(connectionId, typeof message === 'string' ? message : JSON.stringify(message))
    },

    close(ws) {
      const connectionId = (ws.data as Record<string, unknown>).connectionId as string
      if (connectionId) {
        wsHub.removeConnection(connectionId)
        logger.debug('[WsRoute] Connection closed', { connectionId })
      }
    },
  })

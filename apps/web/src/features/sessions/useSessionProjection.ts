import { useCallback, useEffect, useState } from 'react'
import type { AgentEvent, SessionProjection } from '@agent-frame/shared'
import { get, sseUrl } from '../../lib/http.ts'

// ============================================================
// useSessionProjection — 会话级统一状态订阅
//
// 前端通过一个投影 API 聚合 Run / ToolInvocation / AgentTask / Artifact。
// Session SSE 收到异步修复或 artifact 版本事件后，刷新投影并广播给产物面板。
// ============================================================

export type UseSessionProjectionResult = {
  projection: SessionProjection | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useSessionProjection(sessionId: string | null): UseSessionProjectionResult {
  const [projection, setProjection] = useState<SessionProjection | null>(null)
  const [loading, setLoading] = useState(Boolean(sessionId))
  const [error, setError] = useState<string | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)

  const reload = useCallback(() => setReloadSeq((n) => n + 1), [])

  useEffect(() => {
    if (!sessionId) {
      setProjection(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    get<SessionProjection>(`/sessions/${sessionId}/projection`)
      .then((next) => {
        if (cancelled) return
        setProjection(next)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载会话状态失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [sessionId, reloadSeq])

  useEffect(() => {
    if (!sessionId) return
    const source = new EventSource(sseUrl(`/sessions/${sessionId}/events`))
    source.onmessage = (message) => {
      const event = parseEvent(message.data)
      if (!event) return
      if (event.type === 'artifact.version.created' || event.type === 'artifact.repair.completed') {
        const artifactId = 'artifactId' in event ? event.artifactId : undefined
        window.dispatchEvent(new CustomEvent('artifact:version-created', {
          detail: {
            artifactId,
            event,
          },
        }))
      }
      reload()
    }
    source.onerror = () => {
      setError('会话事件流已断开，状态会退回手动刷新')
      source.close()
    }
    return () => source.close()
  }, [sessionId, reload])

  return { projection, loading, error, reload }
}

function parseEvent(raw: string): AgentEvent | null {
  try {
    return JSON.parse(raw) as AgentEvent
  } catch {
    return null
  }
}

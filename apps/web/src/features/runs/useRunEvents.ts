import { useEffect, useRef, useState } from 'react'
import type { AgentEvent } from '@agent-frame/shared'
import { isTerminalEvent } from '@agent-frame/shared'
import { connectSSE } from '../../lib/sse.ts'


// ============================================================
// useRunEvents — 订阅 SSE，维护事件列表
// ============================================================

export type RunEventState = {
  events: AgentEvent[]
  isConnected: boolean
  isTerminated: boolean
  fullText: string    // 所有 message.delta 拼接
}

export function useRunEvents(runId: string | null): RunEventState {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isTerminated, setIsTerminated] = useState(false)
  const [fullText, setFullText] = useState('')
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!runId) return
    setEvents([])
    setIsConnected(false)
    setIsTerminated(false)
    setFullText('')

    const cleanup = connectSSE<AgentEvent>(
      `/api/runs/${runId}/events`,
      (event) => {
        setIsConnected(true)
        setEvents((prev) => [...prev, event])

        if (event.type === 'message.delta') {
          setFullText((prev) => prev + event.delta)
        }
        if (isTerminalEvent(event)) {
          setIsTerminated(true)
        }
      },
      () => setIsConnected(false),
    )

    cleanupRef.current = cleanup
    return () => cleanup()
  }, [runId])

  return { events, isConnected, isTerminated, fullText }
}

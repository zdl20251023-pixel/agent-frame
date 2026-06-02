import { useEffect, useReducer, useRef } from 'react'
import type { AgentEvent } from '@agent-frame/shared'
import { isTerminalEvent } from '@agent-frame/shared'
import { connectSSE } from '../../lib/sse.ts'
import { sseUrl } from '../../lib/http.ts'


// ============================================================
// useRunEvents — 订阅 SSE，维护事件列表
// ============================================================

export type RunEventState = {
  events: AgentEvent[]
  isConnected: boolean
  isTerminated: boolean
  fullText: string    // 所有 message.delta 拼接
}

type RunEventAction =
  | { type: 'reset' }
  | { type: 'connected'; event: AgentEvent }
  | { type: 'disconnected' }

const initialRunEventState: RunEventState = {
  events: [],
  isConnected: false,
  isTerminated: false,
  fullText: '',
}

/**
 * 统一维护 SSE 订阅状态，避免在 effect 初始化阶段连续触发多个 setState。
 *
 * @param state - 当前 run 的事件状态。
 * @param action - SSE 连接、断开或重置动作。
 * @returns 更新后的事件状态。
 */
function runEventReducer(state: RunEventState, action: RunEventAction): RunEventState {
  switch (action.type) {
    case 'reset':
      return initialRunEventState
    case 'connected': {
      const { event } = action
      return {
        events: [...state.events, event],
        isConnected: true,
        isTerminated: isTerminalEvent(event) || state.isTerminated,
        fullText: event.type === 'message.delta' ? state.fullText + event.delta : state.fullText,
      }
    }
    case 'disconnected':
      return { ...state, isConnected: false }
  }
}

export function useRunEvents(runId: string | null): RunEventState {
  const [state, dispatch] = useReducer(runEventReducer, initialRunEventState)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!runId) return
    dispatch({ type: 'reset' })

    const cleanup = connectSSE<AgentEvent>(
      sseUrl(`/runs/${runId}/events`),
      (event) => {
        dispatch({ type: 'connected', event })
        if (isTerminalEvent(event)) {
          cleanupRef.current?.()
        }
      },
      () => dispatch({ type: 'disconnected' }),
    )

    cleanupRef.current = cleanup
    return () => cleanup()
  }, [runId])

  return state
}

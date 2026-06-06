import { useEffect, useRef, useState } from 'react'
import type { ToolInvocation } from '@agent-frame/shared'
import { get } from '../../lib/http.ts'

export type UseToolInvocationResult = {
  toolInvocation: ToolInvocation | null
  loading: boolean
  error: string | null
}

/** 同一 invocationId 并发请求去重，避免 StrictMode 双挂载或 effect 重跑时打爆后端 */
const inflightById = new Map<string, Promise<ToolInvocation>>()

/**
 * 拉取并可选轮询 ToolInvocation 状态。
 * 终态（succeeded / failed / cancelled / timed_out）自动停止轮询。
 */
export function useToolInvocation(
  invocationId: string | undefined,
  options: { poll?: boolean; intervalMs?: number; onPoll?: (invocation: ToolInvocation) => void } = {},
): UseToolInvocationResult {
  const [toolInvocation, setToolInvocation] = useState<ToolInvocation | null>(null)
  const [loading, setLoading] = useState(Boolean(invocationId))
  const [error, setError] = useState<string | null>(null)
  const onPollRef = useRef(options.onPoll)
  onPollRef.current = options.onPoll

  useEffect(() => {
    if (!invocationId) {
      setToolInvocation(null)
      setLoading(false)
      return
    }

    const id = invocationId
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function fetchInvocation(): Promise<ToolInvocation | null> {
      let inflight = inflightById.get(id)
      if (!inflight) {
        inflight = get<{ toolInvocation: ToolInvocation }>(`/tool-invocations/${id}`).then(
          (result) => result.toolInvocation,
        )
        inflightById.set(id, inflight)
        void inflight.finally(() => {
          if (inflightById.get(id) === inflight) {
            inflightById.delete(id)
          }
        })
      }

      try {
        const invocation = await inflight
        if (cancelled) return null
        setToolInvocation(invocation)
        setError(null)
        onPollRef.current?.(invocation)
        return invocation
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载工具状态失败')
        return null
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    async function loadAndSchedule(allowPoll: boolean) {
      const invocation = await fetchInvocation()
      if (cancelled) return
      const keepPolling = (allowPoll || needsActiveRepairPolling(invocation)) && !isTerminalInvocation(invocation)
      if (!keepPolling) return
      timer = setTimeout(() => void loadAndSchedule(true), options.intervalMs ?? 3000)
    }

    setLoading(true)
    void loadAndSchedule(Boolean(options.poll))

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [invocationId, options.poll, options.intervalMs])

  return { toolInvocation, loading, error }
}

export function isTerminalInvocation(invocation: ToolInvocation | null): boolean {
  if (!invocation) return false
  return ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(invocation.status)
}

/** 内层异步修复进行中时需要持续轮询 */
function needsActiveRepairPolling(invocation: ToolInvocation | null): boolean {
  if (!invocation) return false
  if (invocation.status === 'waiting_repair') return true
  return invocation.status === 'running' && invocation.phase === 'inner_repair'
}

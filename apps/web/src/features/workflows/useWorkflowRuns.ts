import { useState, useEffect, useCallback } from 'react'
import type { WorkflowRun } from './workflows.api.ts'
import { listWorkflowRuns } from './workflows.api.ts'

// ──────────────────────────────────────────────────────────
// useWorkflowRuns — 加载 Workflow Run 列表（轮询刷新）
// ──────────────────────────────────────────────────────────

export function useWorkflowRuns(pollIntervalMs = 5000) {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await listWorkflowRuns()
      setRuns(result.runs ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, pollIntervalMs)
    return () => clearInterval(timer)
  }, [refresh, pollIntervalMs])

  return { runs, loading, error, refresh }
}

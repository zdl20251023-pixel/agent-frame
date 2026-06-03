import { useEffect, useReducer } from 'react'
import { getUsageSummary, type UsagePeriod, type UsageSummary } from './usage.api.ts'

// ============================================================
// useUsageSummary — Usage 统计加载
// ============================================================

type UsageState = {
  summary: UsageSummary | null
  loading: boolean
  error: string | null
}

type UsageAction =
  | { type: 'load_success'; summary: UsageSummary }
  | { type: 'load_failed'; error: string }

const initialUsageState: UsageState = {
  summary: null,
  loading: true,
  error: null,
}

function usageReducer(state: UsageState, action: UsageAction): UsageState {
  switch (action.type) {
    case 'load_success':
      return { summary: action.summary, loading: false, error: null }
    case 'load_failed':
      return { ...state, loading: false, error: action.error }
  }
}

export function useUsageSummary(period: UsagePeriod) {
  const [state, dispatch] = useReducer(usageReducer, initialUsageState)

  useEffect(() => {
    let cancelled = false
    getUsageSummary(period)
      .then((summary) => {
        if (!cancelled) dispatch({ type: 'load_success', summary })
      })
      .catch((err) => {
        if (!cancelled) {
          dispatch({
            type: 'load_failed',
            error: err instanceof Error ? err.message : '加载用量统计失败',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [period])

  const isLoading = state.loading || state.summary?.period !== period

  return { ...state, loading: isLoading }
}

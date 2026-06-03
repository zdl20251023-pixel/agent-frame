import { get } from '../../lib/http.ts'

// ============================================================
// usage.api.ts — Token / 成本统计前端 API 客户端
// ============================================================

export type UsagePeriod = 'day' | 'week' | 'month'

export type UsageSummary = {
  period: UsagePeriod
  since: string
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalCostUsd: number
}

export function getUsageSummary(period: UsagePeriod): Promise<UsageSummary> {
  return get<UsageSummary>(`/usage/summary?period=${period}`)
}

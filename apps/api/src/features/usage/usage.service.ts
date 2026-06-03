import { and, count, eq, gte, sum } from 'drizzle-orm'
import { requireDb } from '../../shared/db/client.js'
import { modelCallLogs } from '../../shared/db/schema.js'

// ============================================================
// UsageService — Token / 成本统计业务层
// ============================================================

export type UsagePeriod = 'day' | 'week' | 'month'

function getStartDate(period: string): Date {
  const now = new Date()
  if (period === 'week') now.setDate(now.getDate() - 7)
  else if (period === 'month') now.setMonth(now.getMonth() - 1)
  else now.setHours(0, 0, 0, 0)
  return now
}

function toMysqlDatetime(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000`
  )
}

function normalizePeriod(period?: string): UsagePeriod {
  return period === 'week' || period === 'month' ? period : 'day'
}

export class UsageService {
  async getSummary(periodInput?: string) {
    const period = normalizePeriod(periodInput)
    const startDate = getStartDate(period)
    const db = requireDb()
    const result = await db
      .select({
        totalCalls: count(),
        totalInputTokens: sum(modelCallLogs.inputTokens),
        totalOutputTokens: sum(modelCallLogs.outputTokens),
        totalTokens: sum(modelCallLogs.totalTokens),
        totalCostUsd: sum(modelCallLogs.estimatedCostUsd),
      })
      .from(modelCallLogs)
      .where(gte(modelCallLogs.createdAt, toMysqlDatetime(startDate)))

    const row = result[0]
    return {
      period,
      since: startDate.toISOString(),
      totalCalls: Number(row?.totalCalls ?? 0),
      totalInputTokens: Number(row?.totalInputTokens ?? 0),
      totalOutputTokens: Number(row?.totalOutputTokens ?? 0),
      totalTokens: Number(row?.totalTokens ?? 0),
      totalCostUsd: Number(row?.totalCostUsd ?? 0),
    }
  }

  async getByRun(runId: string) {
    const db = requireDb()
    const rows = await db
      .select()
      .from(modelCallLogs)
      .where(eq(modelCallLogs.runId, runId))

    const totalInputTokens = rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0)
    const totalOutputTokens = rows.reduce((s, r) => s + (r.outputTokens ?? 0), 0)
    const totalCostUsd = rows.reduce(
      (s, r) => s + (r.estimatedCostUsd ? Number(r.estimatedCostUsd) : 0),
      0,
    )

    return {
      runId,
      calls: rows.length,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      records: rows.map((r) => ({
        agentId: r.agentId,
        modelAlias: r.modelAlias,
        actualModel: r.actualModel,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        latencyMs: r.latencyMs,
        finishReason: r.finishReason,
        createdAt: r.createdAt,
      })),
    }
  }

  async getByAgent(agentId: string, periodInput?: string) {
    const period = normalizePeriod(periodInput)
    const startDate = getStartDate(period)
    const db = requireDb()
    const result = await db
      .select({
        totalCalls: count(),
        totalInputTokens: sum(modelCallLogs.inputTokens),
        totalOutputTokens: sum(modelCallLogs.outputTokens),
        totalTokens: sum(modelCallLogs.totalTokens),
        totalCostUsd: sum(modelCallLogs.estimatedCostUsd),
      })
      .from(modelCallLogs)
      .where(
        and(
          eq(modelCallLogs.agentId, agentId),
          gte(modelCallLogs.createdAt, toMysqlDatetime(startDate)),
        ),
      )

    const row = result[0]
    return {
      agentId,
      period,
      since: startDate.toISOString(),
      totalCalls: Number(row?.totalCalls ?? 0),
      totalInputTokens: Number(row?.totalInputTokens ?? 0),
      totalOutputTokens: Number(row?.totalOutputTokens ?? 0),
      totalTokens: Number(row?.totalTokens ?? 0),
      totalCostUsd: Number(row?.totalCostUsd ?? 0),
    }
  }
}

export const usageService = new UsageService()

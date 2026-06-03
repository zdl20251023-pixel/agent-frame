import { Elysia, t } from 'elysia'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'
import { getDb } from '../../shared/db/client.js'
import { modelCallLogs } from '../../shared/db/schema.js'
import { eq, and, gte, sum, count } from 'drizzle-orm'

// ============================================================
// features/usage/ — Token / 成本统计 API
//
// 设计依据：FRAMEWORK_DESIGN 可观测性 + model_call_logs 表
// 数据来源：ai/model-client/usage-logger.ts 写入的 model_call_logs
//
// 路由：
// GET /usage/summary?period=day|week|month     — 当前用户用量摘要
// GET /usage/by-run?runId=xxx                  — 指定 Run 的用量详情
// GET /usage/by-agent?agentId=xxx&period=day   — 按 Agent 聚合用量
// ============================================================

function getStartDate(period: string): Date {
  const now = new Date()
  if (period === 'week') now.setDate(now.getDate() - 7)
  else if (period === 'month') now.setMonth(now.getMonth() - 1)
  else now.setHours(0, 0, 0, 0) // default: today
  return now
}

function toMysqlDatetime(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000`
  )
}

export const usageRoute = new Elysia({ prefix: '/usage' })
  .use(requireAuthPlugin)

  // GET /usage/summary — 当前用户用量汇总
  .get(
    '/summary',
    async ({ query, set }) => {
      try {
        const period = (query.period as string) || 'day'
        const startDate = getStartDate(period)

        const db = getDb()
        const result = await db
          .select({
            totalCalls: count(),
            totalInputTokens: sum(modelCallLogs.inputTokens),
            totalOutputTokens: sum(modelCallLogs.outputTokens),
            totalTokens: sum(modelCallLogs.totalTokens),
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
        }
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      query: t.Object({
        period: t.Optional(t.String()),
      }),
    },
  )

  // GET /usage/by-run?runId=xxx — 指定 Run 的用量详情
  .get(
    '/by-run',
    async ({ query, set }) => {
      if (!query.runId) {
        set.status = 400
        return { code: 'VALIDATION_ERROR', message: 'runId is required' }
      }
      try {
        const db = getDb()
        const rows = await db
          .select()
          .from(modelCallLogs)
          .where(eq(modelCallLogs.runId, query.runId))

        const totalInputTokens = rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0)
        const totalOutputTokens = rows.reduce((s, r) => s + (r.outputTokens ?? 0), 0)
        const totalCostUsd = rows.reduce(
          (s, r) => s + (r.estimatedCostUsd ? Number(r.estimatedCostUsd) : 0),
          0,
        )

        return {
          runId: query.runId,
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
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      query: t.Object({
        runId: t.Optional(t.String()),
      }),
    },
  )

  // GET /usage/by-agent?agentId=xxx&period=day — 按 Agent 聚合
  .get(
    '/by-agent',
    async ({ query, set }) => {
      if (!query.agentId) {
        set.status = 400
        return { code: 'VALIDATION_ERROR', message: 'agentId is required' }
      }
      try {
        const period = (query.period as string) || 'day'
        const startDate = getStartDate(period)

        const db = getDb()
        const result = await db
          .select({
            totalCalls: count(),
            totalInputTokens: sum(modelCallLogs.inputTokens),
            totalOutputTokens: sum(modelCallLogs.outputTokens),
            totalTokens: sum(modelCallLogs.totalTokens),
          })
          .from(modelCallLogs)
          .where(
            and(
              eq(modelCallLogs.agentId, query.agentId),
              gte(modelCallLogs.createdAt, toMysqlDatetime(startDate)),
            ),
          )

        const row = result[0]
        return {
          agentId: query.agentId,
          period,
          since: startDate.toISOString(),
          totalCalls: Number(row?.totalCalls ?? 0),
          totalInputTokens: Number(row?.totalInputTokens ?? 0),
          totalOutputTokens: Number(row?.totalOutputTokens ?? 0),
          totalTokens: Number(row?.totalTokens ?? 0),
        }
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      query: t.Object({
        agentId: t.Optional(t.String()),
        period: t.Optional(t.String()),
      }),
    },
  )

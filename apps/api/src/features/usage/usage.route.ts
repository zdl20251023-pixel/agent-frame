import { Elysia, t } from 'elysia'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'
import { usageService } from './usage.service.js'

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

export const usageRoute = new Elysia({ prefix: '/usage' })
  .use(requireAuthPlugin)

  // GET /usage/summary — 当前用户用量汇总
  .get(
    '/summary',
    async ({ query, set }) => {
      try {
        return await usageService.getSummary(query.period)
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
        return await usageService.getByRun(query.runId)
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
        return await usageService.getByAgent(query.agentId, query.period)
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

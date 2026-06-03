import { getDb } from '../../shared/db/client.js'
import { modelCallLogs } from '../../shared/db/schema.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// UsageLogger — 模型调用用量记录器
// 每次 ModelClient 调用完成后，写入 model_call_logs 表
// 供 features/usage/ 做成本分析和可观测性查询
// ============================================================

export type ModelCallRecord = {
  traceId: string
  runId: string
  stepId?: string
  agentId?: string
  modelAlias: string        // 框架别名，例如 fast.chat
  provider: string          // provider 名称，例如 deepseek
  actualModel: string       // 实际模型 ID，例如 deepseek-chat
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  latencyMs: number
  finishReason?: string
  errorCode?: string
  retryCount?: number
}

export class UsageLogger {
  async log(record: ModelCallRecord): Promise<void> {
    try {
      const db = getDb()
      const now = new Date()
      const pad = (n: number, len = 2) => String(n).padStart(len, '0')
      const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
      await db.insert(modelCallLogs).values({
        traceId: record.traceId,
        runId: record.runId,
        stepId: record.stepId ?? null,
        agentId: record.agentId ?? null,
        modelAlias: record.modelAlias,
        provider: record.provider,
        actualModel: record.actualModel,
        inputTokens: record.inputTokens ?? null,
        outputTokens: record.outputTokens ?? null,
        totalTokens: record.totalTokens ?? null,
        estimatedCostUsd: record.estimatedCostUsd ? String(record.estimatedCostUsd) : null,
        latencyMs: record.latencyMs,
        finishReason: record.finishReason ?? null,
        errorCode: record.errorCode ?? null,
        retryCount: record.retryCount ?? 0,
        createdAt: ts,
      })
    } catch (err) {
      // 用量记录失败不影响主流程，只打 warn
      logger.warn('[UsageLogger] Failed to write model_call_log', {
        runId: record.runId,
        modelAlias: record.modelAlias,
        errorCode: 'USAGE_LOG_FAILED',
      })
    }
  }
}

/** 全局单例，供 VercelAIModelClient 使用 */
export const usageLogger = new UsageLogger()

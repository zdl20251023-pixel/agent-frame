// ============================================================
// StructuredOutputPipeline — 结构化输出管道
//
// 职责：
// - 调用 ModelClient.generateObject() 并用 Zod 做二次校验
// - 解析失败时生成修复 prompt 并自动重试
// - 记录每次尝试的 prompt 和结果（便于调试）
//
// 规则：
// - 只使用框架自定义的 ModelClient 接口，不直接调用 AI SDK
// - schema 为 Zod schema（ZodType），调用者传入
// - 重试 prompt 由 repair.ts 生成，不硬编码在 pipeline 中
// ============================================================

import type { ZodType, ZodError } from 'zod'
import type { ModelClient } from '../model-client/model-client.js'
import type { GenerateObjectInput } from '../model-client/model-client.types.js'
import { logger } from '../../shared/observability/logger.js'
import { buildRepairPrompt } from './repair.js'

// ─── Pipeline 选项 ────────────────────────────────────────────

export type PipelineOptions = {
  /** 最大重试次数（包含首次尝试），默认 3 */
  maxAttempts?: number
  /** 两次尝试之间的等待时间（ms），默认 0 */
  retryDelayMs?: number
}

// ─── Pipeline 结果 ────────────────────────────────────────────

export type PipelineResult<T> =
  | { success: true; data: T; attempts: number }
  | { success: false; error: string; attempts: number; lastRaw?: string }

// ─── 核心函数 ─────────────────────────────────────────────────

/**
 * executeWithRetry — 带自动修复的结构化输出生成
 *
 * 流程：
 * 1. 调用 modelClient.generateObject() 获取原始对象
 * 2. 用 Zod schema 做二次校验
 * 3. 校验失败时，用 buildRepairPrompt() 构造修复 prompt 后重试
 * 4. 超过 maxAttempts 次后返回失败结果
 *
 * @param modelClient - 框架 ModelClient 接口实例
 * @param input - 生成输入（同 ModelClient.generateObject 的入参）
 * @param schema - Zod schema，用于运行时校验
 * @param options - 可选重试配置
 */
export async function executeWithRetry<T>(
  modelClient: ModelClient,
  input: GenerateObjectInput,
  schema: ZodType<T>,
  options: PipelineOptions = {},
): Promise<PipelineResult<T>> {
  const maxAttempts = options.maxAttempts ?? 3
  const retryDelayMs = options.retryDelayMs ?? 0

  let currentPrompt = input.prompt
  let lastRaw: string | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // ── 调用模型生成对象 ───────────────────────────────────
      const raw = await modelClient.generateObject<unknown>({
        ...input,
        prompt: currentPrompt,
      })

      lastRaw = JSON.stringify(raw)

      // ── Zod 二次校验 ────────────────────────────────────────
      const parsed = schema.safeParse(raw)
      if (parsed.success) {
        if (attempt > 1) {
          logger.info('[StructuredOutputPipeline] Repair succeeded', {
            runId: input.metadata?.runId as string | undefined,
            agentId: input.metadata?.agentId as string | undefined,
            model: input.model,
            attempt,
          })
        }
        return { success: true, data: parsed.data, attempts: attempt }
      }

      // ── 校验失败，构造修复 prompt ────────────────────────────
      const zodError = parsed.error as ZodError
      logger.warn('[StructuredOutputPipeline] Schema validation failed, building repair prompt', {
        runId: input.metadata?.runId as string | undefined,
        agentId: input.metadata?.agentId as string | undefined,
        model: input.model,
        attempt,
        issues: zodError.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`),
      })

      if (attempt < maxAttempts) {
        currentPrompt = buildRepairPrompt({
          originalPrompt: input.prompt,
          rawOutput: lastRaw,
          zodError,
          attempt,
        })

        if (retryDelayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs))
        }
      } else {
        // 最后一次仍然失败
        return {
          success: false,
          error: `Schema validation failed after ${maxAttempts} attempts: ${zodError.message}`,
          attempts: maxAttempts,
          lastRaw,
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[StructuredOutputPipeline] Model call failed', {
        runId: input.metadata?.runId as string | undefined,
        agentId: input.metadata?.agentId as string | undefined,
        model: input.model,
        attempt,
        errorCode: 'MODEL_CALL_FAILED',
      })

      if (attempt === maxAttempts) {
        return {
          success: false,
          error: `Model call failed: ${message}`,
          attempts: attempt,
          lastRaw,
        }
      }

      if (retryDelayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs))
      }
    }
  }

  // 理论上不可达，但满足 TS 类型系统
  return { success: false, error: 'Unexpected pipeline exit', attempts: maxAttempts }
}

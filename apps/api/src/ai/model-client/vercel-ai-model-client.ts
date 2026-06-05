import { generateText, streamText, generateObject as aiGenerateObject } from 'ai'
import { z } from 'zod'
import type { ModelClient } from './model-client.js'
import type {
  GenerateInput,
  GenerateOutput,
  StreamInput,
  ModelStreamEvent,
  GenerateObjectInput,
  EmbedInput,
  EmbedOutput,
  TokenUsage,
  ToolCall,
} from './model-client.types.js'
import { models } from '../models.js'
import { modelRegistry } from './model-registry.js'
import { now } from '../../shared/utils/id.js'
import { AppError } from '../../shared/errors/app-error.js'
import { usageLogger } from './usage-logger.js'
import { env } from '../../shared/config/env.js'
import { MODEL_STREAM_EVENT_TYPES } from '@agent-frame/shared'
import { normalizeStreamError } from '../../shared/errors/stream-error-normalizer.js'
import { langfuseBridge } from '../../shared/observability/langfuse-bridge.js'
import {
  logModelCallStart,
  logModelCallComplete,
  logModelCallError,
  withFallback,
} from './middlewares/index.js'

// ============================================================
// VercelAIModelClient — 基于 Vercel AI SDK 的 ModelClient 实现
//
// 规则：
// - 所有 AI SDK 类型只在此文件内使用
// - 返回值必须转换为框架自定义类型
// - raw 字段只在 ai/ 层使用，不向外扩散
// - 每次调用完成后写入 model_call_logs（通过 UsageLogger）
//
// 融合增强（阶段 7）：
// - 通过 ModelRegistry 解析模型定义（含 fallback 路由）
// - 通过 LoggingMiddleware 打结构化日志（含 promptHash）
// - 通过 FallbackMiddleware 处理限流自动切换
// - 通过 StreamErrorNormalizer 归一化流式错误
// - 通过 LangfuseBridge 上报 Langfuse span（可选）
// ============================================================

function normalizeUsage(usage: {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
} | undefined): TokenUsage | undefined {
  if (!usage) return undefined
  return {
    inputTokens: usage.inputTokens ?? usage.promptTokens,
    outputTokens: usage.outputTokens ?? usage.completionTokens,
    totalTokens: usage.totalTokens,
  }
}

function normalizeToolCalls(toolCalls: readonly { toolCallId: string; toolName: string; args: unknown }[] | undefined): ToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined
  return toolCalls.map((tc) => ({
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    input: tc.args,
  }))
}

function safeMetaString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const val = metadata?.[key]
  return typeof val === 'string' ? val : undefined
}

const AI_SDK_PART_TYPES = {
  TEXT_DELTA: 'text-delta',
  FINISH: 'finish',
  ERROR: 'error',
} as const

export class VercelAIModelClient implements ModelClient {
  async generate(input: GenerateInput): Promise<GenerateOutput> {
    // ── 解析模型（优先从 ModelRegistry，兼容 models 直接访问）──────
    const modelEntry = modelRegistry.get(input.model) ?? (() => {
      const def = models[input.model]
      return def ? { ...def, capabilities: ['streaming', 'structured-output'] as const } : undefined
    })()
    if (!modelEntry) throw new AppError('MODEL_CALL_FAILED', `Unknown model alias: ${input.model}`)

    const runId = safeMetaString(input.metadata, 'runId')
    const traceId = safeMetaString(input.metadata, 'traceId')
    const agentId = safeMetaString(input.metadata, 'agentId')
    const stepId = safeMetaString(input.metadata, 'stepId')
    const promptHash = safeMetaString(input.metadata, 'promptHash')

    const logCtx = {
      runId, traceId, agentId, stepId, promptHash,
      modelAlias: input.model,
      provider: modelEntry.provider,
      actualModelId: modelEntry.actualModelId,
    }

    // ── Langfuse span ─────────────────────────────────────────
    const span = langfuseBridge.createGenerationSpan({ traceId: traceId ?? '', runId, stepId, agentId, modelAlias: input.model, promptHash })

    const startMs = logModelCallStart(logCtx)

    // ── FallbackMiddleware 包装调用 ───────────────────────────
    const result = await withFallback(
      input.model,
      (alias) => modelRegistry.getFallback(alias),
      async (entry) => {
        const sdkResult = await generateText({
          model: entry.model,
          system: input.system,
          prompt: input.prompt,
          temperature: input.temperature ?? entry.temperature,
          maxOutputTokens: input.maxTokens ?? entry.maxTokens,
        })
        return sdkResult
      },
      modelEntry,
      { runId, traceId, agentId, stepId },
    )

    if (!result.success) {
      const latencyMs = Date.now() - startMs
      logModelCallError(logCtx, startMs, 'MODEL_CALL_FAILED')
      span.fail('MODEL_CALL_FAILED')

      if (runId && traceId && env.DATABASE_URL) {
        usageLogger.log({
          traceId, runId, stepId, agentId,
          modelAlias: input.model,
          provider: modelEntry.provider,
          actualModel: modelEntry.actualModelId,
          latencyMs,
          errorCode: 'MODEL_CALL_FAILED',
        })
      }

      const message = result.error instanceof Error ? result.error.message : String(result.error)
      throw new AppError('MODEL_CALL_FAILED', `Model generate failed: ${message}`, {
        cause: result.error,
        retryable: true,
      })
    }

    const sdkResult = result.value
    const output: GenerateOutput = {
      text: sdkResult.text,
      finishReason: sdkResult.finishReason,
      usage: normalizeUsage(sdkResult.usage),
      toolCalls: normalizeToolCalls(sdkResult.toolCalls as never),
      raw: undefined,
    }

    const latencyMs = Date.now() - startMs
    logModelCallComplete(logCtx, startMs, {
      inputTokens: output.usage?.inputTokens,
      outputTokens: output.usage?.outputTokens,
      finishReason: output.finishReason,
    })
    span.end({ inputTokens: output.usage?.inputTokens, outputTokens: output.usage?.outputTokens, latencyMs })

    if (runId && traceId && env.DATABASE_URL) {
      usageLogger.log({
        traceId, runId, stepId, agentId,
        modelAlias: input.model,
        provider: modelEntry.provider,
        actualModel: modelEntry.actualModelId,
        inputTokens: output.usage?.inputTokens,
        outputTokens: output.usage?.outputTokens,
        totalTokens: output.usage?.totalTokens,
        estimatedCostUsd: output.usage?.estimatedCostUsd,
        latencyMs,
        finishReason: sdkResult.finishReason,
        retryCount: result.usedFallback ? 1 : 0,
      })
    }

    return output
  }

  async *stream(input: StreamInput): AsyncIterable<ModelStreamEvent> {
    const modelEntry = modelRegistry.get(input.model) ?? (() => {
      const def = models[input.model]
      return def ? { ...def, capabilities: ['streaming', 'structured-output'] as const } : undefined
    })()
    if (!modelEntry) throw new AppError('MODEL_CALL_FAILED', `Unknown model alias: ${input.model}`)

    const runId = safeMetaString(input.metadata, 'runId')
    const traceId = safeMetaString(input.metadata, 'traceId')
    const agentId = safeMetaString(input.metadata, 'agentId')
    const stepId = safeMetaString(input.metadata, 'stepId')
    const promptHash = safeMetaString(input.metadata, 'promptHash')

    const logCtx = {
      runId, traceId, agentId, stepId, promptHash,
      modelAlias: input.model,
      provider: modelEntry.provider,
      actualModelId: modelEntry.actualModelId,
    }

    const span = langfuseBridge.createGenerationSpan({ traceId: traceId ?? '', runId, stepId, agentId, modelAlias: input.model, promptHash })

    const startMs = logModelCallStart(logCtx)
    let finalUsage: TokenUsage | undefined

    try {
      const result = streamText({
        model: modelEntry.model,
        system: input.system,
        prompt: input.prompt,
        temperature: input.temperature ?? modelEntry.temperature,
        maxOutputTokens: input.maxTokens ?? modelEntry.maxTokens,
      })

      for await (const part of result.fullStream) {
        if (part.type === AI_SDK_PART_TYPES.TEXT_DELTA) {
          yield { type: MODEL_STREAM_EVENT_TYPES.TEXT_DELTA, delta: (part as any).text, timestamp: now() }
        } else if (part.type === AI_SDK_PART_TYPES.FINISH) {
          const rawUsage = (part as any).usage ?? (part as any).totalUsage
          finalUsage = normalizeUsage(rawUsage)
          yield {
            type: MODEL_STREAM_EVENT_TYPES.MODEL_COMPLETED,
            usage: finalUsage,
            timestamp: now(),
          }
        } else if (part.type === AI_SDK_PART_TYPES.ERROR) {
          // ── StreamErrorNormalizer ────────────────────────────
          const modelError = normalizeStreamError(
            (part as any).error,
            modelEntry.provider,
            input.model,
          )
          yield {
            type: MODEL_STREAM_EVENT_TYPES.MODEL_FAILED,
            error: modelError,
            timestamp: now(),
          }
        }
      }

      const latencyMs = Date.now() - startMs
      logModelCallComplete(logCtx, startMs, {
        inputTokens: finalUsage?.inputTokens,
        outputTokens: finalUsage?.outputTokens,
      })
      span.end({ inputTokens: finalUsage?.inputTokens, outputTokens: finalUsage?.outputTokens, latencyMs })

      if (runId && traceId && env.DATABASE_URL) {
        usageLogger.log({
          traceId, runId, stepId, agentId,
          modelAlias: input.model,
          provider: modelEntry.provider,
          actualModel: modelEntry.actualModelId,
          inputTokens: finalUsage?.inputTokens,
          outputTokens: finalUsage?.outputTokens,
          totalTokens: finalUsage?.totalTokens,
          latencyMs,
          finishReason: 'stop',
        })
      }
    } catch (err: unknown) {
      const latencyMs = Date.now() - startMs
      // ── StreamErrorNormalizer ────────────────────────────────
      const modelError = normalizeStreamError(err, modelEntry.provider, input.model)

      logModelCallError(logCtx, startMs, modelError.code)
      span.fail(modelError.code)

      if (runId && traceId && env.DATABASE_URL) {
        usageLogger.log({
          traceId, runId, stepId, agentId,
          modelAlias: input.model,
          provider: modelEntry.provider,
          actualModel: modelEntry.actualModelId,
          latencyMs,
          errorCode: modelError.code,
        })
      }

      yield {
        type: MODEL_STREAM_EVENT_TYPES.MODEL_FAILED,
        error: modelError,
        timestamp: now(),
      }
    }
  }

  async generateObject<T>(input: GenerateObjectInput): Promise<T> {
    const modelEntry = modelRegistry.get(input.model) ?? (() => {
      const def = models[input.model]
      return def ? { ...def, capabilities: [] as const } : undefined
    })()
    if (!modelEntry) throw new AppError('MODEL_CALL_FAILED', `Unknown model alias: ${input.model}`)

    try {
      const result = await aiGenerateObject({
        model: modelEntry.model,
        system: input.system,
        prompt: input.prompt,
        schema: input.schema as ReturnType<typeof z.object>,
        temperature: input.temperature ?? modelEntry.temperature,
      })
      return result.object as T
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new AppError('MODEL_CALL_FAILED', `generateObject failed: ${message}`, { cause: err })
    }
  }

  async embed(_input: EmbedInput): Promise<EmbedOutput> {
    // MVP 暂不实现
    throw new AppError('INTERNAL_ERROR', 'embed() not implemented in MVP')
  }
}

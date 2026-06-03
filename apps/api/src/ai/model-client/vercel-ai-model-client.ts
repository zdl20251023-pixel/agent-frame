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
import { logger } from '../../shared/observability/logger.js'
import { now } from '../../shared/utils/id.js'
import { AppError } from '../../shared/errors/app-error.js'
import { usageLogger } from './usage-logger.js'
import { env } from '../../shared/config/env.js'
import { MODEL_STREAM_EVENT_TYPES } from '@agent-frame/shared'

// ============================================================
// VercelAIModelClient — 基于 Vercel AI SDK 的 ModelClient 实现
//
// 规则：
// - 所有 AI SDK 类型只在此文件内使用
// - 返回值必须转换为框架自定义类型
// - raw 字段只在 ai/ 层使用，不向外扩散
// - 每次调用完成后写入 model_call_logs（通过 UsageLogger）
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
    const modelDef = models[input.model]
    if (!modelDef) throw new AppError('MODEL_CALL_FAILED', `Unknown model alias: ${input.model}`)

    const runId = safeMetaString(input.metadata, 'runId')
    const traceId = safeMetaString(input.metadata, 'traceId')
    const agentId = safeMetaString(input.metadata, 'agentId')
    const stepId = safeMetaString(input.metadata, 'stepId')

    const log = logger.child({ agentId, runId, traceId })
    log.debug('[ModelClient] generate start', { model: input.model })
    const startMs = Date.now()

    try {
      const result = await generateText({
        model: modelDef.model,
        system: input.system,
        prompt: input.prompt,
        temperature: input.temperature ?? modelDef.temperature,
        maxTokens: input.maxTokens ?? modelDef.maxTokens,
      })

      const latencyMs = Date.now() - startMs
      const output: GenerateOutput = {
        text: result.text,
        finishReason: result.finishReason,
        usage: normalizeUsage(result.usage),
        toolCalls: normalizeToolCalls(result.toolCalls as never),
        raw: undefined,
      }

      log.info('[ModelClient] generate completed', {
        latencyMs,
        tokenInput: output.usage?.inputTokens,
        tokenOutput: output.usage?.outputTokens,
      })

      // ─── 写入 model_call_logs ────────────────────────────────
      if (runId && traceId && env.DATABASE_URL) {
        usageLogger.log({
          traceId,
          runId,
          stepId,
          agentId,
          modelAlias: input.model,
          provider: modelDef.provider,
          actualModel: modelDef.actualModelId,
          inputTokens: output.usage?.inputTokens,
          outputTokens: output.usage?.outputTokens,
          totalTokens: output.usage?.totalTokens,
          estimatedCostUsd: output.usage?.estimatedCostUsd,
          latencyMs,
          finishReason: result.finishReason,
        })
      }

      return output
    } catch (err: unknown) {
      const latencyMs = Date.now() - startMs
      const message = err instanceof Error ? err.message : String(err)

      // ─── 错误也写入 model_call_logs ──────────────────────────
      if (runId && traceId && env.DATABASE_URL) {
        usageLogger.log({
          traceId,
          runId,
          stepId,
          agentId,
          modelAlias: input.model,
          provider: modelDef.provider,
          actualModel: modelDef.actualModelId,
          latencyMs,
          errorCode: 'MODEL_CALL_FAILED',
        })
      }

      throw new AppError('MODEL_CALL_FAILED', `Model generate failed: ${message}`, {
        cause: err,
        retryable: true,
      })
    }
  }

  async *stream(input: StreamInput): AsyncIterable<ModelStreamEvent> {
    const modelDef = models[input.model]
    if (!modelDef) throw new AppError('MODEL_CALL_FAILED', `Unknown model alias: ${input.model}`)

    const runId = safeMetaString(input.metadata, 'runId')
    const traceId = safeMetaString(input.metadata, 'traceId')
    const agentId = safeMetaString(input.metadata, 'agentId')
    const stepId = safeMetaString(input.metadata, 'stepId')

    const log = logger.child({ agentId, runId, traceId })
    log.debug('[ModelClient] stream start', { model: input.model })
    const startMs = Date.now()
    let finalUsage: TokenUsage | undefined

    try {
      const result = streamText({
        model: modelDef.model,
        system: input.system,
        prompt: input.prompt,
        temperature: input.temperature ?? modelDef.temperature,
        maxTokens: input.maxTokens ?? modelDef.maxTokens,
      })

      for await (const part of result.fullStream) {
        if (part.type === AI_SDK_PART_TYPES.TEXT_DELTA) {
          yield { type: MODEL_STREAM_EVENT_TYPES.TEXT_DELTA, delta: (part as any).text, timestamp: now() }
        } else if (part.type === AI_SDK_PART_TYPES.FINISH) {
          // Vercel AI SDK finish part 包含 usage 字段
          // 字段名可能是 usage（新版）或 totalUsage（旧版），normalizeUsage 统一处理
          const rawUsage = (part as any).usage ?? (part as any).totalUsage
          finalUsage = normalizeUsage(rawUsage)
          yield {
            type: MODEL_STREAM_EVENT_TYPES.MODEL_COMPLETED,
            usage: finalUsage,
            timestamp: now(),
          }
        } else if (part.type === AI_SDK_PART_TYPES.ERROR) {
          yield {
            type: MODEL_STREAM_EVENT_TYPES.MODEL_FAILED,
            error: { code: 'MODEL_CALL_FAILED', message: String(part.error) },
            timestamp: now(),
          }
        }
      }

      const latencyMs = Date.now() - startMs
      // ─── 写入 model_call_logs ────────────────────────────────
      if (runId && traceId && env.DATABASE_URL) {
        usageLogger.log({
          traceId,
          runId,
          stepId,
          agentId,
          modelAlias: input.model,
          provider: modelDef.provider,
          actualModel: modelDef.actualModelId,
          inputTokens: finalUsage?.inputTokens,
          outputTokens: finalUsage?.outputTokens,
          totalTokens: finalUsage?.totalTokens,
          latencyMs,
          finishReason: 'stop',
        })
      }
    } catch (err: unknown) {
      const latencyMs = Date.now() - startMs
      const message = err instanceof Error ? err.message : String(err)

      if (runId && traceId && env.DATABASE_URL) {
        usageLogger.log({
          traceId,
          runId,
          stepId,
          agentId,
          modelAlias: input.model,
          provider: modelDef.provider,
          actualModel: modelDef.actualModelId,
          latencyMs,
          errorCode: 'MODEL_CALL_FAILED',
        })
      }

      yield {
        type: MODEL_STREAM_EVENT_TYPES.MODEL_FAILED,
        error: { code: 'MODEL_CALL_FAILED', message, retryable: true },
        timestamp: now(),
      }
    }
  }

  async generateObject<T>(input: GenerateObjectInput<T>): Promise<T> {
    const modelDef = models[input.model]
    if (!modelDef) throw new AppError('MODEL_CALL_FAILED', `Unknown model alias: ${input.model}`)

    try {
      const result = await aiGenerateObject({
        model: modelDef.model,
        system: input.system,
        prompt: input.prompt,
        schema: input.schema as ReturnType<typeof z.object>,
        temperature: input.temperature ?? modelDef.temperature,
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

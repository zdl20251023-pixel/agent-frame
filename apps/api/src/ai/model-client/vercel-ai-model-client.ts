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

// ============================================================
// VercelAIModelClient — 基于 Vercel AI SDK 的 ModelClient 实现
//
// 规则：
// - 所有 AI SDK 类型只在此文件内使用
// - 返回值必须转换为框架自定义类型
// - raw 字段只在 ai/ 层使用，不向外扩散
// ============================================================

function normalizeUsage(usage: {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
} | undefined): TokenUsage | undefined {
  if (!usage) return undefined
  return {
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
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

export class VercelAIModelClient implements ModelClient {
  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const modelDef = models[input.model]
    if (!modelDef) throw new AppError('MODEL_CALL_FAILED', `Unknown model alias: ${input.model}`)

    const log = logger.child({
      agentId: input.metadata?.agentId as string,
      runId: input.metadata?.runId as string,
    })
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

      const output: GenerateOutput = {
        text: result.text,
        finishReason: result.finishReason,
        usage: normalizeUsage(result.usage),
        toolCalls: normalizeToolCalls(result.toolCalls as never),
        raw: undefined, // 不向外扩散
      }

      log.info('[ModelClient] generate completed', {
        latencyMs: Date.now() - startMs,
        tokenInput: output.usage?.inputTokens,
        tokenOutput: output.usage?.outputTokens,
      })

      return output
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new AppError('MODEL_CALL_FAILED', `Model generate failed: ${message}`, {
        cause: err,
        retryable: true,
      })
    }
  }

  async *stream(input: StreamInput): AsyncIterable<ModelStreamEvent> {
    const modelDef = models[input.model]
    if (!modelDef) throw new AppError('MODEL_CALL_FAILED', `Unknown model alias: ${input.model}`)

    const log = logger.child({
      agentId: input.metadata?.agentId as string,
      runId: input.metadata?.runId as string,
    })
    log.debug('[ModelClient] stream start', { model: input.model })

    try {
      const result = streamText({
        model: modelDef.model,
        system: input.system,
        prompt: input.prompt,
        temperature: input.temperature ?? modelDef.temperature,
        maxTokens: input.maxTokens ?? modelDef.maxTokens,
      })

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          yield { type: 'text.delta', delta: part.textDelta, timestamp: now() }
        } else if (part.type === 'finish') {
          yield {
            type: 'model.completed',
            usage: normalizeUsage(part.usage),
            timestamp: now(),
          }
        } else if (part.type === 'error') {
          yield {
            type: 'model.failed',
            error: { code: 'MODEL_CALL_FAILED', message: String(part.error) },
            timestamp: now(),
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      yield {
        type: 'model.failed',
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

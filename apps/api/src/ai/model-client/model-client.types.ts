// ============================================================
// ModelClient 类型定义
// 核心框架只依赖这里的类型，绝不直接依赖 Vercel AI SDK 类型
// ============================================================

import type { TokenUsage } from '@agent-frame/shared'
import { MODEL_STREAM_EVENT_TYPES } from '@agent-frame/shared'

export type { TokenUsage }

// Tool定义（Agent 内部工具，不用于 A2A）
export type ToolDefinition = {
  name: string
  description: string
  parameters: unknown    // JSON Schema
  execute: (input: unknown) => Promise<unknown>
}

// Tool 调用记录
export type ToolCall = {
  toolCallId: string
  toolName: string
  input: unknown
}

// Tool 调用结果
export type ToolResult = {
  toolCallId: string
  toolName: string
  output: unknown
}

// ─── 生成输入 ──────────────────────────────────────────────────
export type GenerateInput = {
  model: string                       // 框架内部别名，例如 creative.medium
  system?: string
  prompt: string
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  metadata?: Record<string, unknown>  // runId、stepId、agentId、traceId
}

// ─── 生成输出 ──────────────────────────────────────────────────
export type GenerateOutput = {
  text: string
  finishReason?: string
  usage?: TokenUsage
  toolCalls?: ToolCall[]
  raw?: unknown                       // 仅 ai/ 层调试用，不向外扩散
}

// ─── 流式输入 ──────────────────────────────────────────────────
export type StreamInput = {
  model: string
  system?: string
  prompt: string
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  metadata?: Record<string, unknown>
}

// ─── 流式事件 ─────────────────────────────────────────────────
export type ModelStreamEvent =
  | { type: typeof MODEL_STREAM_EVENT_TYPES.TEXT_DELTA; delta: string; timestamp: string }
  | { type: typeof MODEL_STREAM_EVENT_TYPES.TOOL_CALL; toolCallId: string; toolName: string; input: unknown; timestamp: string }
  | { type: typeof MODEL_STREAM_EVENT_TYPES.TOOL_RESULT; toolCallId: string; toolName: string; output: unknown; timestamp: string }
  | { type: typeof MODEL_STREAM_EVENT_TYPES.MODEL_COMPLETED; usage?: TokenUsage; timestamp: string }
  | { type: typeof MODEL_STREAM_EVENT_TYPES.MODEL_FAILED; error: ModelError; timestamp: string }

// ─── 结构化生成 ───────────────────────────────────────────────
export type GenerateObjectInput = {
  model: string
  system?: string
  prompt: string
  schema: unknown                     // Zod schema 或 JSON Schema
  temperature?: number
  maxTokens?: number
  metadata?: Record<string, unknown>
}

// ─── Embedding ────────────────────────────────────────────────
export type EmbedInput = {
  model: string
  text: string | string[]
  metadata?: Record<string, unknown>
}

export type EmbedOutput = {
  embeddings: number[][]
  usage?: { inputTokens?: number }
}

// ─── 错误 ─────────────────────────────────────────────────────
export type ModelError = {
  code: string                        // MODEL_TIMEOUT | RATE_LIMIT | PROVIDER_ERROR
  message: string
  provider?: string
  model?: string
  retryable?: boolean
  raw?: unknown                       // 仅 ai/ 层调试，不向外扩散
}

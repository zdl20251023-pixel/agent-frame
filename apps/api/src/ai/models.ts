import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import type { ModelDef } from './providers.js'

// ============================================================
// 模型别名注册表
// 上层 Agent 使用别名（如 fast.chat），不使用 provider model id
// 这里是唯一需要知道具体 model id 的地方
// ============================================================

export const models: Record<string, ModelDef> = {
  // ─── 快速对话型 ────────────────────────────────────────────
  'fast.chat': {
    model: openai('gpt-4o-mini'),
    provider: 'openai',
    actualModelId: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048,
    costLevel: 'low',
  },

  // ─── 通用能力型 ────────────────────────────────────────────
  'creative.medium': {
    model: openai('gpt-4.1-mini'),
    provider: 'openai',
    actualModelId: 'gpt-4.1-mini',
    temperature: 0.7,
    maxTokens: 4096,
    costLevel: 'medium',
  },

  // ─── 强推理型 ──────────────────────────────────────────────
  'reasoning.high': {
    model: openai('gpt-4.1'),
    provider: 'openai',
    actualModelId: 'gpt-4.1',
    temperature: 0.3,
    maxTokens: 8192,
    costLevel: 'high',
  },

  // ─── Anthropic 系列 ────────────────────────────────────────
  'claude.fast': {
    model: anthropic('claude-haiku-4-5'),
    provider: 'anthropic',
    actualModelId: 'claude-haiku-4-5',
    temperature: 0.7,
    maxTokens: 2048,
    costLevel: 'low',
  },
  'claude.medium': {
    model: anthropic('claude-sonnet-4-5'),
    provider: 'anthropic',
    actualModelId: 'claude-sonnet-4-5',
    temperature: 0.7,
    maxTokens: 4096,
    costLevel: 'medium',
  },

  // ─── 默认 ──────────────────────────────────────────────────
  'default': {
    model: openai('gpt-4o-mini'),
    provider: 'openai',
    actualModelId: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048,
    costLevel: 'low',
  },
}

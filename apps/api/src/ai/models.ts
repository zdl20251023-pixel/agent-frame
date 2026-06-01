import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { deepseek } from '@ai-sdk/deepseek'
import type { ModelDef } from './providers.js'

// ============================================================
// 模型别名注册表
// 上层 Agent 使用别名（如 fast.chat），不使用 provider model id
// ============================================================

import { env } from '../shared/config/env.js'

// 根据环境变量动态选择默认模型，偏好顺序：DeepSeek -> Gemini -> OpenAI -> Anthropic
let defaultFastModel: any = openai('gpt-4o-mini')
let defaultFastProvider: any = 'openai'
let defaultFastId = 'gpt-4o-mini'

let defaultMediumModel: any = openai('gpt-4o')
let defaultMediumProvider: any = 'openai'
let defaultMediumId = 'gpt-4o'

if (env.DEEPSEEK_API_KEY) {
  defaultFastModel = deepseek('deepseek-chat')
  defaultFastProvider = 'deepseek'
  defaultFastId = 'deepseek-chat'
  
  defaultMediumModel = deepseek('deepseek-reasoner')
  defaultMediumProvider = 'deepseek'
  defaultMediumId = 'deepseek-reasoner'
} else if (env.GEMINI_API_KEY) {
  defaultFastModel = google('gemini-1.5-flash')
  defaultFastProvider = 'google'
  defaultFastId = 'gemini-1.5-flash'
  
  defaultMediumModel = google('gemini-1.5-pro')
  defaultMediumProvider = 'google'
  defaultMediumId = 'gemini-1.5-pro'
}

export const models: Record<string, ModelDef> = {
  // ─── 快速对话型 ────────────────────────────────────────────
  'fast.chat': {
    model: defaultFastModel,
    provider: defaultFastProvider,
    actualModelId: defaultFastId,
    temperature: 0.7,
    maxTokens: 2048,
    costLevel: 'low',
  },

  // ─── 通用能力型 ────────────────────────────────────────────
  'creative.medium': {
    model: defaultMediumModel,
    provider: defaultMediumProvider,
    actualModelId: defaultMediumId,
    temperature: 0.7,
    maxTokens: 4096,
    costLevel: 'medium',
  },

  // ─── 强推理型 ──────────────────────────────────────────────
  'reasoning.high': {
    model: defaultMediumModel, // R1/Pro/GPT-4o
    provider: defaultMediumProvider,
    actualModelId: defaultMediumId,
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

  // ─── DeepSeek 系列 ─────────────────────────────────────────
  'deepseek.chat': {
    model: deepseek('deepseek-chat'),
    provider: 'deepseek',
    actualModelId: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 8192,
    costLevel: 'low',
  },
  'deepseek.reasoner': {
    model: deepseek('deepseek-reasoner'),
    provider: 'deepseek',
    actualModelId: 'deepseek-reasoner',
    temperature: 0.7,
    maxTokens: 8192,
    costLevel: 'medium',
  },

  // ─── Gemini 系列 ───────────────────────────────────────────
  'gemini.flash': {
    model: google('gemini-1.5-flash'),
    provider: 'google',
    actualModelId: 'gemini-1.5-flash',
    temperature: 0.7,
    maxTokens: 8192,
    costLevel: 'low',
  },
  'gemini.pro': {
    model: google('gemini-1.5-pro'),
    provider: 'google',
    actualModelId: 'gemini-1.5-pro',
    temperature: 0.7,
    maxTokens: 8192,
    costLevel: 'medium',
  },

  // ─── 默认 ──────────────────────────────────────────────────
  'default': {
    model: defaultFastModel,
    provider: defaultFastProvider,
    actualModelId: defaultFastId,
    temperature: 0.7,
    maxTokens: 2048,
    costLevel: 'low',
  },
}

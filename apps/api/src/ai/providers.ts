import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { deepseek } from '@ai-sdk/deepseek'
import { env } from '../shared/config/env.js'
import type { LanguageModel } from 'ai'

// ============================================================
// Provider 初始化
// 只在 ai/ 层使用，不向 runtime/a2a/workflow 扩散
// ============================================================

export function createOpenAIProvider() {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return openai
}

export function createAnthropicProvider() {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }
  return anthropic
}

export function createDeepseekProvider() {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not set')
  }
  return deepseek
}

export function createGoogleProvider() {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set')
  }
  return google
}

// 模型定义结构
export type ModelDef = {
  model: LanguageModel
  provider: 'openai' | 'anthropic' | 'deepseek' | 'google'
  actualModelId: string
  temperature?: number
  maxTokens?: number
  costLevel: 'low' | 'medium' | 'high'
}

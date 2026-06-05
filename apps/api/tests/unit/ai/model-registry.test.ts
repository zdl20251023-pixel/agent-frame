// ============================================================
// 单元测试：ModelRegistry
// ============================================================

import { describe, it, expect, beforeEach } from 'bun:test'
import { ModelRegistry } from '../../../src/ai/model-client/model-registry.js'
import type { ModelEntry } from '../../../src/ai/model-client/model-registry.js'

// ─── 测试数据 ─────────────────────────────────────────────────

const makeMockModel = (): any => ({
  // 模拟 LanguageModel 对象（只需类型兼容）
  specificationVersion: 'v1',
  provider: 'test-provider',
  modelId: 'test-model',
  defaultObjectGenerationMode: 'json',
})

function makeFastEntry(): ModelEntry {
  return {
    model: makeMockModel(),
    provider: 'openai',
    actualModelId: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048,
    costLevel: 'low',
    capabilities: ['streaming', 'structured-output'],
    fallbackAlias: 'default',
  }
}

function makeDefaultEntry(): ModelEntry {
  return {
    model: makeMockModel(),
    provider: 'openai',
    actualModelId: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048,
    costLevel: 'low',
    capabilities: ['streaming'],
  }
}

function makeHighEntry(): ModelEntry {
  return {
    model: makeMockModel(),
    provider: 'anthropic',
    actualModelId: 'claude-sonnet-4-5',
    temperature: 0.3,
    maxTokens: 8192,
    costLevel: 'high',
    capabilities: ['streaming', 'structured-output', 'tool-calling', 'reasoning'],
    fallbackAlias: 'fast.chat',
  }
}

// ─── 测试套件 ─────────────────────────────────────────────────

describe('ModelRegistry', () => {
  let registry: ModelRegistry

  beforeEach(() => {
    registry = new ModelRegistry()
    registry.register('fast.chat', makeFastEntry())
    registry.register('default', makeDefaultEntry())
    registry.register('reasoning.high', makeHighEntry())
  })

  // ── get ───────────────────────────────────────────────────

  it('get() 返回已注册的模型', () => {
    const entry = registry.get('fast.chat')
    expect(entry).toBeDefined()
    expect(entry?.actualModelId).toBe('gpt-4o-mini')
    expect(entry?.costLevel).toBe('low')
  })

  it('get() 对未注册的别名返回 undefined', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  // ── getOrThrow ────────────────────────────────────────────

  it('getOrThrow() 成功返回已注册模型', () => {
    const entry = registry.getOrThrow('fast.chat')
    expect(entry.provider).toBe('openai')
  })

  it('getOrThrow() 对未注册别名抛出 Error', () => {
    expect(() => registry.getOrThrow('unknown')).toThrow()
    expect(() => registry.getOrThrow('unknown')).toThrow(/Unknown model alias/)
  })

  it('getOrThrow() 错误消息包含可用别名列表', () => {
    try {
      registry.getOrThrow('bad-alias')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('fast.chat')
    }
  })

  // ── getFallback ───────────────────────────────────────────

  it('getFallback() 返回 fallback 模型', () => {
    const fallback = registry.getFallback('fast.chat')
    expect(fallback).toBeDefined()
    expect(fallback?.actualModelId).toBe('gpt-4o-mini') // 'default' 的 actualModelId
  })

  it('getFallback() 对无 fallback 模型返回 undefined', () => {
    expect(registry.getFallback('default')).toBeUndefined()
  })

  it('getFallback() 对未注册别名返回 undefined', () => {
    expect(registry.getFallback('nonexistent')).toBeUndefined()
  })

  // ── hasCapability ─────────────────────────────────────────

  it('hasCapability() 正确识别已有能力', () => {
    expect(registry.hasCapability('fast.chat', 'streaming')).toBe(true)
    expect(registry.hasCapability('fast.chat', 'structured-output')).toBe(true)
  })

  it('hasCapability() 正确识别未有能力', () => {
    expect(registry.hasCapability('fast.chat', 'vision')).toBe(false)
  })

  it('hasCapability() 对 reasoning.high 识别 reasoning 能力', () => {
    expect(registry.hasCapability('reasoning.high', 'reasoning')).toBe(true)
    expect(registry.hasCapability('reasoning.high', 'tool-calling')).toBe(true)
  })

  it('hasCapability() 对未注册别名返回 false', () => {
    expect(registry.hasCapability('nonexistent', 'streaming')).toBe(false)
  })

  // ── listAliases ───────────────────────────────────────────

  it('listAliases() 返回所有已注册别名', () => {
    const aliases = registry.listAliases()
    expect(aliases).toContain('fast.chat')
    expect(aliases).toContain('default')
    expect(aliases).toContain('reasoning.high')
    expect(aliases.length).toBe(3)
  })

  // ── register 覆盖 ────────────────────────────────────────

  it('register() 可覆盖已有别名', () => {
    const newEntry: ModelEntry = {
      ...makeFastEntry(),
      actualModelId: 'new-model-id',
      costLevel: 'medium',
    }
    registry.register('fast.chat', newEntry)
    expect(registry.get('fast.chat')?.actualModelId).toBe('new-model-id')
    expect(registry.get('fast.chat')?.costLevel).toBe('medium')
  })
})

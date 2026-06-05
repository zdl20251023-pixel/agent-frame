// ============================================================
// PromptProvider — Prompt 版本化管理
//
// 职责：
// - 集中管理 prompt 模板，避免字符串散落在 Agent 代码中
// - 每个 prompt 有唯一 name + version，生成 hash 供追踪
// - 支持请求级 override（测试/调试时覆盖特定 prompt）
//
// 规则：
// - Agent 优先通过 PromptProvider 获取 prompt
// - 保持对旧字符串方式的兼容（promptHash 为 undefined 时降级）
// - PromptProvider 只在 ai/ 层使用，不向 runtime/a2a 扩散
// ============================================================

import { createHash } from 'node:crypto'

// ─── Prompt 条目 ──────────────────────────────────────────────

export type PromptEntry = {
  /** Prompt 唯一名称（如 supervisor.plan.system）*/
  name: string
  /** 版本标识（建议语义化版本 1.0.0 或日期 2026-06-05）*/
  version: string
  /** Prompt 文本内容 */
  content: string
  /** SHA-256 hash，由 content 自动计算 */
  hash: string
}

// ─── PromptProvider 接口 ──────────────────────────────────────

export interface IPromptProvider {
  /**
   * 根据 name 获取 prompt 条目。
   * @param name - prompt 唯一名称
   * @returns PromptEntry 或 undefined（未注册时）
   */
  get(name: string): PromptEntry | undefined

  /**
   * 获取 prompt 内容字符串（未注册时返回 undefined）。
   */
  getContent(name: string): string | undefined

  /**
   * 获取 promptHash（未注册时返回 undefined，由调用方降级）。
   */
  getHash(name: string): string | undefined

  /**
   * 覆盖一个 prompt（测试/A-B 测试用）。
   * @param name - prompt 名称
   * @param content - 新 prompt 内容
   */
  override(name: string, content: string): void

  /** 列出所有已注册 prompt 名称 */
  listNames(): string[]
}

// ─── 工具函数 ─────────────────────────────────────────────────

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

function makeEntry(name: string, version: string, content: string): PromptEntry {
  return { name, version, content, hash: computeHash(content) }
}

// ─── 内存 PromptProvider ──────────────────────────────────────

/**
 * InMemoryPromptProvider — 默认实现，基于内存注册。
 *
 * 使用方式：
 * ```ts
 * promptProvider.register('supervisor.plan.system', '1.0.0', SUPERVISOR_PLAN_SYSTEM)
 * const { content, hash } = promptProvider.get('supervisor.plan.system')!
 * ```
 */
export class InMemoryPromptProvider implements IPromptProvider {
  private readonly prompts = new Map<string, PromptEntry>()

  /**
   * 注册一个 prompt。
   * @param name - 唯一名称
   * @param version - 版本字符串
   * @param content - prompt 文本
   */
  register(name: string, version: string, content: string): void {
    this.prompts.set(name, makeEntry(name, version, content))
  }

  /**
   * 批量注册（便于初始化时一次性载入）。
   */
  registerAll(entries: Array<{ name: string; version: string; content: string }>): void {
    for (const e of entries) {
      this.register(e.name, e.version, e.content)
    }
  }

  get(name: string): PromptEntry | undefined {
    return this.prompts.get(name)
  }

  getContent(name: string): string | undefined {
    return this.prompts.get(name)?.content
  }

  getHash(name: string): string | undefined {
    return this.prompts.get(name)?.hash
  }

  override(name: string, content: string): void {
    const existing = this.prompts.get(name)
    const version = existing ? `${existing.version}+override` : '0.0.0+override'
    this.prompts.set(name, makeEntry(name, version, content))
  }

  listNames(): string[] {
    return Array.from(this.prompts.keys())
  }
}

// ─── 默认全局单例 ─────────────────────────────────────────────

/**
 * 全局 PromptProvider 单例。
 * 在 ai/prompts/index.ts 或 container.ts 初始化时注册所有 prompt。
 */
export const promptProvider = new InMemoryPromptProvider()

// ─── Prompt 名称常量（防止魔法字符串）────────────────────────────

export const PROMPT_NAMES = {
  SUPERVISOR_PLAN_SYSTEM: 'supervisor.plan.system',
  SUPERVISOR_ANSWER_SYSTEM: 'supervisor.answer.system',
  RESEARCH_SYSTEM: 'research.system',
  SUMMARY_SYSTEM: 'summary.system',
} as const

export type PromptName = (typeof PROMPT_NAMES)[keyof typeof PROMPT_NAMES]

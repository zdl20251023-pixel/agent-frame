// ============================================================
// ModelRegistry — 模型注册表
//
// 职责：
// - 集中管理所有模型别名、provider、能力标记、成本配置
// - 提供 get() / getFallback() / hasCapability() 接口
// - 供 VercelAIModelClient 使用，不向 runtime/a2a/workflow 扩散
//
// 规则：
// - 上层 Agent 只使用别名（如 fast.chat），永远不直接写 provider model id
// - 能力标记（capability）用于 StructuredOutput / Streaming / ToolCalling 等功能门控
// ============================================================

import type { LanguageModel } from 'ai'

// ─── 模型能力枚举 ──────────────────────────────────────────────

export type ModelCapability =
  | 'streaming'          // 支持流式输出
  | 'tool-calling'       // 支持工具调用
  | 'structured-output'  // 支持结构化对象生成（generateObject）
  | 'vision'             // 支持图像输入
  | 'reasoning'          // 支持推理/思考链

// ─── 模型定义 ─────────────────────────────────────────────────

export type ModelEntry = {
  /** AI SDK LanguageModel 实例（只在 ai/ 层使用）*/
  model: LanguageModel
  /** Provider 名称 */
  provider: 'openai' | 'anthropic' | 'deepseek' | 'google'
  /** 实际模型 ID，如 deepseek-chat */
  actualModelId: string
  /** 默认采样温度 */
  temperature?: number
  /** 默认最大 token 数 */
  maxTokens?: number
  /** 成本档次，供 Policy 做预算控制 */
  costLevel: 'low' | 'medium' | 'high'
  /** 支持的能力列表 */
  capabilities?: ModelCapability[]
  /** 首选 fallback 别名（当此模型不可用时使用）*/
  fallbackAlias?: string
}

// ─── ModelRegistry 接口 ───────────────────────────────────────

export interface IModelRegistry {
  /** 注册一个模型别名 */
  register(alias: string, entry: ModelEntry): void
  /** 获取模型定义，不存在时返回 undefined */
  get(alias: string): ModelEntry | undefined
  /** 获取模型定义，不存在时抛出错误 */
  getOrThrow(alias: string): ModelEntry
  /** 获取 fallback 模型定义（若无 fallback 则返回 undefined）*/
  getFallback(alias: string): ModelEntry | undefined
  /** 检查模型是否支持某种能力 */
  hasCapability(alias: string, capability: ModelCapability): boolean
  /** 列出所有已注册的别名 */
  listAliases(): string[]
}

// ─── ModelRegistry 实现 ───────────────────────────────────────

export class ModelRegistry implements IModelRegistry {
  private readonly entries = new Map<string, ModelEntry>()

  register(alias: string, entry: ModelEntry): void {
    this.entries.set(alias, entry)
  }

  get(alias: string): ModelEntry | undefined {
    return this.entries.get(alias)
  }

  getOrThrow(alias: string): ModelEntry {
    const entry = this.entries.get(alias)
    if (!entry) {
      throw new Error(
        `[ModelRegistry] Unknown model alias: "${alias}". ` +
        `Available aliases: ${this.listAliases().join(', ')}`,
      )
    }
    return entry
  }

  getFallback(alias: string): ModelEntry | undefined {
    const entry = this.entries.get(alias)
    if (!entry?.fallbackAlias) return undefined
    return this.entries.get(entry.fallbackAlias)
  }

  hasCapability(alias: string, capability: ModelCapability): boolean {
    const entry = this.entries.get(alias)
    if (!entry) return false
    // 默认假设所有模型支持 streaming 和 structured-output
    if (capability === 'streaming' || capability === 'structured-output') {
      return entry.capabilities?.includes(capability) !== false
    }
    return entry.capabilities?.includes(capability) ?? false
  }

  listAliases(): string[] {
    return Array.from(this.entries.keys())
  }
}

// ─── 默认单例（由 models.ts 初始化数据填充）─────────────────────

export const modelRegistry = new ModelRegistry()

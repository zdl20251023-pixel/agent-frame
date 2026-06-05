// ============================================================
// ToolFactory — 工具工厂
//
// 职责：
// - 通过工厂函数创建 ToolDefinition，注入 PromptProvider / ModelClient 等上下文
// - 解耦 Tool 与全局状态的依赖（Tool 不直接读取全局 promptProvider）
// - 提供内置工具示例，演示工厂模式
//
// 规则：
// - Tool 是确定性能力，不是 Agent（Tool 没有独立 agentId 和 Run/Step）
// - Agent 间调用必须走 A2AClient，不能伪装成 Tool
// ============================================================

import type { ToolDefinition } from '../model-client/model-client.types.js'
import type { IPromptProvider } from '../prompts/prompt-provider.js'
import type { ModelClient } from '../model-client/model-client.js'

// ─── 工厂上下文 ───────────────────────────────────────────────

/**
 * ToolFactory 注入的上下文，供 Tool 在创建时使用。
 * Tool 只在创建时接收上下文，执行时不依赖全局单例。
 */
export type ToolFactoryContext = {
  /** Prompt 提供者，Tool 内若需要模型推理可使用 */
  promptProvider?: IPromptProvider
  /** ModelClient，Tool 内若需要内层 LLM 推理可使用 */
  modelClient?: ModelClient
  /** 额外的业务上下文（由 Agent 传入，如 runId、userId）*/
  extra?: Record<string, unknown>
}

// ─── 工厂函数类型 ──────────────────────────────────────────────

/**
 * 工具工厂函数：接受 ToolFactoryContext，返回 ToolDefinition。
 * 每个工具文件导出一个这样的工厂函数。
 */
export type ToolFactory = (ctx: ToolFactoryContext) => ToolDefinition

// ─── 工具注册表 ───────────────────────────────────────────────

/**
 * ToolRegistry 管理工厂函数，按名称注册和获取。
 * 和 ModelRegistry 模式一致，便于依赖注入和测试替换。
 */
export class ToolRegistry {
  private readonly factories = new Map<string, ToolFactory>()

  register(name: string, factory: ToolFactory): void {
    this.factories.set(name, factory)
  }

  registerAll(entries: Array<{ name: string; factory: ToolFactory }>): void {
    for (const { name, factory } of entries) {
      this.register(name, factory)
    }
  }

  /**
   * 用给定上下文实例化工具，返回可用的 ToolDefinition。
   */
  build(name: string, ctx: ToolFactoryContext): ToolDefinition {
    const factory = this.factories.get(name)
    if (!factory) {
      throw new Error(`[ToolRegistry] Unknown tool: "${name}"`)
    }
    return factory(ctx)
  }

  /**
   * 批量实例化所有已注册工具。
   */
  buildAll(ctx: ToolFactoryContext): ToolDefinition[] {
    return Array.from(this.factories.entries()).map(([, factory]) => factory(ctx))
  }

  listNames(): string[] {
    return Array.from(this.factories.keys())
  }
}

// ─── 全局单例 ─────────────────────────────────────────────────

export const toolRegistry = new ToolRegistry()

// ─── 内置工具示例：echo-tool ──────────────────────────────────

/**
 * EchoTool — 演示工厂模式的示例工具
 * 功能：原样返回输入文本（用于测试工具链路）
 *
 * 真实工具示例（待实现）：
 * - web-search.tool.ts — 网络搜索
 * - calculator.tool.ts — 数学计算
 */
export const echoToolFactory: ToolFactory = (_ctx: ToolFactoryContext): ToolDefinition => ({
  name: 'echo',
  description: '将输入文本原样返回，用于测试工具调用链路。',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要返回的文本' },
    },
    required: ['text'],
  },
  execute: async (input: unknown) => {
    const { text } = input as { text: string }
    return { echoed: text, timestamp: new Date().toISOString() }
  },
})

// 注册内置工具
toolRegistry.register('echo', echoToolFactory)

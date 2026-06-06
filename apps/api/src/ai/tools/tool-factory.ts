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
import { z } from 'zod'

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

/** Tool 执行上下文；预留给后续需要 runId/userId/模型客户端的工具执行场景。 */
export type ToolExecutionContext = ToolFactoryContext

// ─── 工厂函数类型 ──────────────────────────────────────────────

/**
 * 工具工厂函数：接受 ToolFactoryContext，返回 ToolDefinition。
 * 每个工具文件导出一个这样的工厂函数。
 */
export type ToolFactory = (ctx: ToolFactoryContext) => ToolDefinition

/**
 * AgentToolDefinition 是框架层可复用的工具定义抽象。
 *
 * 设计目标：
 * - name/description/schema 作为稳定元数据，可注册到插件发现层。
 * - execute 只描述业务执行逻辑，不绑定某个模型供应商 SDK。
 * - toModelToolDefinition 统一适配 ModelClient 所需的 ToolDefinition。
 */
export type AgentToolDefinition<TInput = unknown, TOutput = unknown> = {
  name: string
  description: string
  schema: unknown
  parameters?: unknown
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>
  toModelToolDefinition: (ctx: ToolFactoryContext) => ToolDefinition
}

/**
 * 创建通用 Agent 工具定义。
 *
 * 参数：
 * - definition: 工具名称、描述、输入 schema 和执行函数。
 *
 * 返回：
 * - AgentToolDefinition，可同时适配 ToolRegistry、ModelClient 和 PluginRegistry 元数据。
 */
export function createAgentToolDefinition<TInput = unknown, TOutput = unknown>(
  definition: Omit<AgentToolDefinition<TInput, TOutput>, 'toModelToolDefinition'>,
): AgentToolDefinition<TInput, TOutput> {
  return {
    ...definition,
    toModelToolDefinition: (ctx: ToolFactoryContext): ToolDefinition => ({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters ?? definition.schema,
      inputSchema: definition.schema,
      execute: async (input: unknown) => definition.execute(input as TInput, ctx),
    }),
  }
}

/** 将通用 Agent 工具定义转换为 ToolRegistry 可注册的工厂函数。 */
export function toToolFactory<TInput = unknown, TOutput = unknown>(
  definition: AgentToolDefinition<TInput, TOutput>,
): ToolFactory {
  return (ctx: ToolFactoryContext) => definition.toModelToolDefinition(ctx)
}

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
  inputSchema: z.object({
    text: z.string().describe('要返回的文本'),
  }),
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

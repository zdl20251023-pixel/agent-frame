// ============================================================
// MCPAdapter — MCP (Model Context Protocol) 工具服务适配器
//
// 职责：
// - 定义连接外部 MCP Server 的标准接口
// - 将 MCP Tool 转换为框架的 ToolDefinition 格式
// - 通过 SchemaSanitizer 处理 schema 兼容问题
//
// 当前实现：接口定义 + MockMCPAdapter（用于开发和测试）
// 生产接入：等有真实 MCP Server 需求时，实现 HttpMCPAdapter
//
// 规则：
// - Agent 通过 ToolFactory 使用 MCP 工具，不直接依赖 MCPAdapter
// - MCPAdapter 只在 integrations/mcp/ 内使用
// ============================================================

import type { ToolDefinition } from '../../ai/model-client/model-client.types.js'
import { sanitizeSchema } from './schema-sanitizer.js'
import { logger } from '../../shared/observability/logger.js'

// ─── MCP Tool 定义（来自 MCP Server）──────────────────────────

export type MCPToolInfo = {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema（可能含不兼容字段）
}

// ─── MCPAdapter 接口 ──────────────────────────────────────────

export interface IMCPAdapter {
  /**
   * 列出 MCP Server 提供的所有工具
   */
  listTools(): Promise<MCPToolInfo[]>

  /**
   * 调用 MCP Server 上的工具
   */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>

  /**
   * 将 MCP 工具列表转换为框架 ToolDefinition 列表
   * @param targetProvider - 目标 AI provider，用于 schema 清洁
   */
  toToolDefinitions(targetProvider?: string): Promise<ToolDefinition[]>
}

// ─── MockMCPAdapter（MVP 开发用）─────────────────────────────

/**
 * MockMCPAdapter — 用于开发、测试和接口验证
 *
 * 当无法连接真实 MCP Server 时使用。
 * 可预置工具列表和响应，方便集成测试。
 */
export class MockMCPAdapter implements IMCPAdapter {
  private readonly mockTools: MCPToolInfo[]
  private readonly mockResponses: Map<string, unknown>

  constructor(
    tools: MCPToolInfo[] = [],
    responses: Record<string, unknown> = {},
  ) {
    this.mockTools = tools
    this.mockResponses = new Map(Object.entries(responses))
  }

  async listTools(): Promise<MCPToolInfo[]> {
    return this.mockTools
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = this.mockResponses.get(name)
    if (response === undefined) {
      logger.warn('[MCPAdapter] Mock tool not found', { toolName: name })
      return { error: `Mock tool "${name}" not configured` }
    }
    // 支持响应为函数（动态 mock）
    if (typeof response === 'function') {
      return (response as (args: unknown) => unknown)(args)
    }
    return response
  }

  async toToolDefinitions(targetProvider?: string): Promise<ToolDefinition[]> {
    const tools = await this.listTools()
    return tools.map((tool) => this.convertToToolDefinition(tool, targetProvider))
  }

  private convertToToolDefinition(
    tool: MCPToolInfo,
    targetProvider?: string,
  ): ToolDefinition {
    // 根据 provider 清洁 schema
    const cleanedSchema = targetProvider === 'google' || targetProvider === 'gemini'
      ? sanitizeSchema(tool.inputSchema as never, { removeAdditionalProperties: true, targetProvider: 'gemini' })
      : sanitizeSchema(tool.inputSchema as never, { removeAdditionalProperties: true })

    return {
      name: tool.name,
      description: tool.description,
      parameters: cleanedSchema,
      execute: async (input: unknown) => {
        return this.callTool(tool.name, input as Record<string, unknown>)
      },
    }
  }
}

// ─── 默认 MockMCPAdapter 单例（可在测试中替换）──────────────────

export const defaultMCPAdapter: IMCPAdapter = new MockMCPAdapter([
  {
    name: 'web-search',
    description: '搜索互联网并返回相关结果摘要（MCP 版，待接入真实 Server）',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        maxResults: { type: 'number', description: '最大返回结果数，默认 5' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
], {
  'web-search': (args: unknown) => {
    const { query } = args as { query: string }
    return {
      results: [
        { title: `关于「${query}」的搜索结果（Mock）`, url: 'https://example.com', snippet: '这是一个 Mock 搜索结果。' },
      ],
    }
  },
})

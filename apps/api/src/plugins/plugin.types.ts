// ============================================================
// plugins/ — 插件注册层类型定义
// 目标：让未来业务能力通过注册方式接入，不修改核心 runtime
// ============================================================

import type { AgentDefinition } from '@agent-frame/shared'

/** 工具定义（AI 工具，用于 Agent 内部调用，不替代 A2A）*/
export type ToolDefinition = {
  id: string
  name: string
  description: string
  parameters: unknown    // JSON Schema
}

/** Workflow 模板定义（预留，当前 MVP 不强制实现）*/
export type WorkflowDefinition = {
  id: string
  name: string
  description?: string
  stages: WorkflowStage[]
}

export type WorkflowStage = {
  id: string
  name: string
  agentId?: string
  mode: 'sync' | 'async' | 'manual'
  timeoutMs?: number
}

/** Artifact 类型定义（用于校验和展示）*/
export type ArtifactTypeDefinition = {
  id: string
  name: string
  description?: string
  schema?: unknown    // 内容 schema，用于校验
}

/** 插件可访问的注册上下文 */
export type PluginContext = {
  registerAgent: (agent: AgentDefinition) => void
  registerTool: (tool: ToolDefinition) => void
  registerWorkflow: (workflow: WorkflowDefinition) => void
  registerArtifactType: (type: ArtifactTypeDefinition) => void
}

/** 插件定义 */
export type AgentPlugin = {
  id: string
  name: string
  description?: string
  register: (ctx: PluginContext) => void
}

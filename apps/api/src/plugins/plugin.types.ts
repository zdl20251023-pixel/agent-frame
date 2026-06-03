// ============================================================
// plugins/ — 插件注册层类型定义
// 目标：让未来业务能力通过注册方式接入，不修改核心 runtime
// ============================================================

/**
 * 插件注册的 Agent 元数据（仅包含可发现信息）
 * 不包含 model / systemPrompt 等运行时配置（运行时由 Agent 实现类自行管理）
 */
export type PluginAgentDefinition = {
  id: string
  name: string
  description: string
  supportedModes: string[]
  maxRuntimeMs: number
  costLevel: 'low' | 'medium' | 'high'
  riskLevel?: 'low' | 'medium' | 'high'
  inputArtifactTypes?: string[]
  outputArtifactTypes?: string[]
  permissions?: string[]
}

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
  registerAgent: (agent: PluginAgentDefinition) => void
  registerTool: (tool: ToolDefinition) => void
  registerWorkflow: (workflow: WorkflowDefinition) => void
  registerArtifactType: (type: ArtifactTypeDefinition) => void
  /** 带 pluginId 上下文的结构化日志 */
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void
}

/** 插件定义 */
export type AgentPlugin = {
  id: string
  name: string
  description?: string
  register: (ctx: PluginContext) => void
}

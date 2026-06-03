import type { ArtifactRef, ArtifactWriteInput } from './artifact.js'

// ============================================================
// Agent 定义和输入输出统一模型
// ============================================================

export type AgentDefinition = {
  id: string            // Agent 唯一 ID，例如 supervisor-agent
  name: string
  description: string
  model: string         // 默认模型别名，例如 creative.medium
  systemPrompt: string
  tools?: string[]      // 可用 Tool ID 列表
  capability: AgentCapability
}

import type { A2ACallMode } from '../constants/a2a-constants.js'

export type AgentCapability = {
  id: string
  name: string
  description: string
  supportedModes: A2ACallMode[]
  inputSchema?: unknown
  outputSchema?: unknown
  inputArtifactTypes?: string[]
  outputArtifactTypes?: string[]
  maxRuntimeMs: number
  costLevel: 'low' | 'medium' | 'high'
  requiresApproval?: boolean
  /** 调用该 Agent 所需权限标识，例如 ['weather:query', 'research:read'] */
  permissions?: string[]
  /** 风险级别，高风险 Agent 后续可接人工审批 */
  riskLevel?: 'low' | 'medium' | 'high'
}



// 统一 Agent 执行输入
export type AgentInput<T = unknown> = {
  runId: string
  stepId?: string
  traceId: string
  userId?: string
  projectId?: string
  sessionId?: string
  payload: T                     // 当前 Agent 的直接输入
  artifacts?: ArtifactRef[]      // 上游产物引用
  context?: ContextRef           // 上下文加载策略
  signal?: AbortSignal           // 取消信号
}

// 统一 Agent 执行输出
export type AgentOutput<T = unknown> = {
  output: T                              // 主要结构化输出
  artifacts?: ArtifactWriteInput[]       // 需要持久化的产物
  memoryCandidates?: MemoryCandidate[]   // 候选记忆（预留）
  usage?: TokenUsage                     // token/成本统计
}

// 上下文引用（声明 Agent 需要哪些上下文）
export type ContextRef = {
  includeSessionMessages?: boolean
  includeProjectMemory?: boolean
  includeArtifacts?: ArtifactRef[]
  maxTokens?: number
  strategy?: 'summary' | 'full' | 'schema_only'
}

// 候选记忆（预留，MVP 不主动使用）
export type MemoryCandidate = {
  key: string
  value: unknown
  reason: string
}

// Token 用量统计
export type TokenUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  estimatedCostUsd?: number
}

import type { ArtifactRef, ArtifactWriteInput } from './artifact.js'

// ============================================================
// Agent 定义和输入输出统一模型
// ============================================================

export type AgentDefinition = {
  id: string            // Agent 唯一 ID，例如 supervisor-agent
  name: string          // Agent 展示名称
  description: string   // Agent 能力描述
  model: string         // 默认模型别名，例如 creative.medium
  systemPrompt: string  // 默认系统提示词
  tools?: string[]      // 可用 Tool ID 列表
  capability: AgentCapability // Agent 能力声明
}

import type { A2ACallMode } from '../constants/a2a-constants.js'

export type AgentCapability = {
  id: string                             // 能力唯一 ID
  name: string                           // 能力展示名称
  description: string                    // 能力说明，供路由和 UI 展示
  supportedModes: A2ACallMode[]          // 支持的 A2A 调用模式
  inputSchema?: unknown                  // 输入 Schema，用于校验或文档生成
  outputSchema?: unknown                 // 输出 Schema，用于校验或文档生成
  inputArtifactTypes?: string[]          // 支持读取的输入 Artifact 类型
  outputArtifactTypes?: string[]         // 可能产出的 Artifact 类型
  maxRuntimeMs: number                   // 预期最大运行时长（毫秒）
  costLevel: 'low' | 'medium' | 'high'   // 成本等级，用于预算和 UI 提示
  requiresApproval?: boolean             // 调用前是否需要人工审批
  permissions?: string[]               // 调用该 Agent 所需权限标识
  riskLevel?: 'low' | 'medium' | 'high' // 风险级别，高风险 Agent 后续可接人工审批
}



import type { ConversationContext } from './conversation-context.js'

// 统一 Agent 执行输入
export type AgentInput<T = unknown> = {
  runId: string                   // 当前执行所属 Run ID
  stepId?: string                 // 当前执行关联 Step ID
  traceId: string                 // 链路追踪 ID
  userId?: string                 // 发起用户 ID
  projectId?: string              // 所属项目 ID
  sessionId?: string              // 所属会话 ID
  payload: T                     // 当前 Agent 的直接输入
  conversationContext?: ConversationContext // 预算内会话历史
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
  includeSessionMessages?: boolean              // 是否包含会话历史消息
  includeProjectMemory?: boolean                // 是否包含项目级 Memory
  includeArtifacts?: ArtifactRef[]              // 需要加载的 Artifact 引用
  maxTokens?: number                            // 上下文最大 token 预算
  strategy?: 'summary' | 'full' | 'schema_only' // 上下文构建策略
}

// 候选记忆（预留，MVP 不主动使用）
export type MemoryCandidate = {
  key: string      // 候选记忆键
  value: unknown   // 候选记忆值
  reason: string   // 产生该候选记忆的原因
}

// Token 用量统计
export type TokenUsage = {
  inputTokens?: number       // 输入 token 数
  outputTokens?: number      // 输出 token 数
  totalTokens?: number       // 总 token 数
  reasoningTokens?: number   // 推理 token 数
  estimatedCostUsd?: number  // 预估成本（美元）
}

// ============================================================
// CapabilityHints — 插件能力路由提示
// 供 CapabilityRouter 聚合评分，避免硬编码在核心路由中。
// ============================================================

export type CapabilityHints = {
  agentId: string
  /** 强匹配正则/关键词模式（字符串将被转为 RegExp） */
  strongPatterns?: string[]
  /** 弱匹配模式 */
  weakPatterns?: string[]
  /** 加分短语 */
  boostPatterns?: string[]
  /** 减分短语（避免误路由，如英文 turn 非扑克语境） */
  penaltyPatterns?: string[]
  /** 路由到此 Agent 的最低置信分（覆盖全局阈值） */
  minScore?: number
  /** 正例（用于 eval 与文档） */
  examples?: string[]
  /** 负例（不应路由到此 Agent） */
  negativeExamples?: string[]
}

export type CapabilityRouteDecisionRecord = {
  id: string
  runId?: string
  sessionId?: string
  userId?: string
  inputHash: string
  requestedAgentId?: string
  resolvedAgentId?: string
  routeType: 'agent' | 'ask_clarification' | 'default'
  confidence: number
  reason: string
  source: string
  createdAt: string
}

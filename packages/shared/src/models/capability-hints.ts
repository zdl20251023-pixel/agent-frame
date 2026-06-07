// ============================================================
// CapabilityHints — 插件能力路由提示
// 供 CapabilityRouter 聚合评分，避免硬编码在核心路由中。
// ============================================================

export type CapabilityHints = {
  agentId: string // 目标 Agent ID
  strongPatterns?: string[]   // 强匹配正则/关键词模式（字符串将被转为 RegExp）
  weakPatterns?: string[]     // 弱匹配模式
  boostPatterns?: string[]    // 加分短语
  penaltyPatterns?: string[]  // 减分短语（避免误路由，如英文 turn 非扑克语境）
  minScore?: number           // 路由到此 Agent 的最低置信分（覆盖全局阈值）
  examples?: string[]         // 正例（用于 eval 与文档）
  negativeExamples?: string[] // 负例（不应路由到此 Agent）
}

export type CapabilityRouteDecisionRecord = {
  id: string                                      // 路由决策记录 ID
  runId?: string                                 // 关联 Run ID，澄清前可能为空
  sessionId?: string                             // 关联会话 ID
  userId?: string                                // 发起用户 ID
  inputHash: string                              // 输入内容哈希，避免保存原文造成隐私风险
  requestedAgentId?: string                      // 用户或前端显式请求的 Agent ID
  resolvedAgentId?: string                       // 最终解析出的 Agent ID
  routeType: 'agent' | 'ask_clarification' | 'default' // 路由结果类型
  confidence: number                             // 路由置信度评分
  reason: string                                 // 路由原因说明
  source: string                                 // 决策来源，如 heuristic、plugin、default
  createdAt: string                              // 记录创建时间（ISO 8601）
}

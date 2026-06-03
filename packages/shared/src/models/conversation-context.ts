// ============================================================
// ConversationContext — 预算内会话上下文（供 Agent prompt 使用）
// ============================================================

/** 单轮对话（仅用户最终输入 + 助手最终回答） */
export type ConversationTurn = {
  runId: string
  userMessage: string
  assistantText: string
}

/** Artifact 轻量引用（不含正文） */
export type ConversationArtifactRef = {
  artifactId: string
  runId: string
  type: string
  title?: string
  summary?: string
}

/** 构建后的会话上下文 */
export type ConversationContext = {
  /** 已格式化的 prompt 片段，可直接拼入模型输入 */
  promptText: string
  /** 最近短窗口内的对话轮次 */
  recentTurns: ConversationTurn[]
  /** 超出短窗口的旧历史滚动摘要 */
  sessionSummary?: string
  /** 会话内产物引用（不含正文） */
  artifactRefs: ConversationArtifactRef[]
  /** 实际使用的字符数（观测用） */
  usedChars: number
}

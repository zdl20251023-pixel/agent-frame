// ============================================================
// ConversationContext — 预算内会话上下文（供 Agent prompt 使用）
// ============================================================

/** 单轮对话（仅用户最终输入 + 助手最终回答） */
export type ConversationTurn = {
  runId: string          // 对应历史 Run ID
  userMessage: string    // 用户在该轮输入的最终文本
  assistantText: string  // 助手在该轮输出的最终文本
}

/** Artifact 轻量引用（不含正文） */
export type ConversationArtifactRef = {
  artifactId: string  // Artifact ID
  runId: string       // 创建或关联该 Artifact 的 Run ID
  type: string        // Artifact 类型
  title?: string      // Artifact 标题
  summary?: string    // Artifact 内容摘要
}

/** 构建后的会话上下文 */
export type ConversationContext = {
  promptText: string                    // 已格式化的 prompt 片段，可直接拼入模型输入
  recentTurns: ConversationTurn[]       // 最近短窗口内的对话轮次
  sessionSummary?: string               // 超出短窗口的旧历史滚动摘要
  artifactRefs: ConversationArtifactRef[] // 会话内产物引用（不含正文）
  usedChars: number                     // 实际使用的字符数（观测用）
}

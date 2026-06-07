import type { AgentEvent } from '../events/agent-event.js'
import type { Run } from './run.js'

// ============================================================
// 聊天会话模型
// ============================================================

export type ChatSession = {
  id: string                       // 会话唯一 ID
  userId: string                   // 会话所属用户 ID
  title?: string                   // 会话标题
  metadata?: Record<string, unknown> // 会话扩展元数据
  deletedAt?: string               // 软删除时间（ISO 8601）
  createdAt: string                // 创建时间（ISO 8601）
  updatedAt: string                // 更新时间（ISO 8601）
  runCount?: number                // 会话内 Run 数量
}

export type TranscriptRun = {
  run: Run                 // Run 记录
  events: AgentEvent[]     // Run 对应事件列表
  userMessage: string      // 该 Run 的用户输入文本
  assistantText: string    // 该 Run 的助手最终回答文本
}

export type SessionTranscript = {
  session: ChatSession     // 会话基本信息
  runs: TranscriptRun[]    // 会话内按时间排列的 Run 转录
}

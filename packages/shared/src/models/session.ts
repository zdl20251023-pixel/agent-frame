import type { AgentEvent, Run } from './run.js'

// ============================================================
// 聊天会话模型
// ============================================================

export type ChatSession = {
  id: string
  userId: string
  title?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
  runCount?: number
}

export type TranscriptRun = {
  run: Run
  events: AgentEvent[]
  userMessage: string
  assistantText: string
}

export type SessionTranscript = {
  session: ChatSession
  runs: TranscriptRun[]
}

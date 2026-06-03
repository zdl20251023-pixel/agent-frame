import type { AgentEvent, ChatSession, SessionTranscript, TranscriptRun } from '@agent-frame/shared'
import { SessionsRepository } from './sessions.repository.js'
import { AppError } from '../../shared/errors/app-error.js'
import { generateSessionId } from '../../shared/utils/id.js'
import type { RunStore } from '../../runtime/stores/run-store.js'

// ============================================================
// 会话业务逻辑
// ============================================================

export class SessionsService {
  constructor(
    private repo = new SessionsRepository(),
    private runStore?: RunStore,
  ) {}

  setRunStore(store: RunStore) {
    this.runStore = store
  }

  async listSessions(userId: string): Promise<{ sessions: ChatSession[]; total: number }> {
    const sessions = await this.repo.listByUser(userId)
    return { sessions, total: sessions.length }
  }

  async createSession(userId: string, title?: string): Promise<ChatSession> {
    return this.repo.createSession({
      id: generateSessionId(),
      userId,
      title: title?.trim() || '新对话',
    })
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const ok = await this.repo.softDelete(sessionId, userId)
    if (!ok) throw new AppError('NOT_FOUND', 'Session not found')
  }

  /**
   * 解析会话 ID：若未传则创建新会话；若传入则校验归属。
   */
  async resolveSessionId(userId: string, sessionId?: string): Promise<string> {
    if (sessionId) {
      const session = await this.repo.getByIdForUser(sessionId, userId)
      if (!session) throw new AppError('NOT_FOUND', 'Session not found')
      return session.id
    }
    const session = await this.createSession(userId)
    return session.id
  }

  async getTranscript(userId: string, sessionId: string): Promise<SessionTranscript> {
    const session = await this.repo.getByIdForUser(sessionId, userId)
    if (!session) throw new AppError('NOT_FOUND', 'Session not found')
    if (!this.runStore) throw new AppError('INTERNAL_ERROR', 'RunStore not configured')

    const runs = await this.runStore.listRunsBySession(sessionId, userId)
    const transcriptRuns: TranscriptRun[] = []

    for (const run of runs) {
      const events = await this.runStore.listEvents(run.id)
      const userMessage = extractUserMessage(run.input)
      const assistantText = buildAssistantText(events, run.output)
      transcriptRuns.push({ run, events, userMessage, assistantText })
    }

    return { session, runs: transcriptRuns }
  }

  async assertRunOwnedByUser(runId: string, userId: string): Promise<void> {
    if (!this.runStore) throw new AppError('INTERNAL_ERROR', 'RunStore not configured')
    const run = await this.runStore.getRun(runId)
    if (!run || run.userId !== userId) {
      throw new AppError('NOT_FOUND', 'Run not found')
    }
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.repo.touchSession(sessionId)
  }

  maybeSetTitleFromMessage(sessionId: string, userId: string, message: string): Promise<void> {
    return this.repo.getByIdForUser(sessionId, userId).then(async (session) => {
      if (!session) return
      if (session.title && session.title !== '新对话') return
      const title = message.trim().slice(0, 30) || '新对话'
      await this.repo.updateTitle(sessionId, userId, title)
    })
  }

  /**
   * 查询 Session 下的所有 Run（用于 Run 归属展示和完整归档）
   */
  async listSessionRuns(
    userId: string,
    sessionId: string,
  ): Promise<{ runs: unknown[]; total: number }> {
    const session = await this.repo.getByIdForUser(sessionId, userId)
    if (!session) throw new AppError('NOT_FOUND', 'Session not found')
    if (!this.runStore) throw new AppError('INTERNAL_ERROR', 'RunStore not configured')

    const runs = await this.runStore.listRunsBySession(sessionId, userId)
    return { runs, total: runs.length }
  }
}

function extractUserMessage(input: unknown): string {
  if (input && typeof input === 'object' && input !== null && 'message' in input) {
    const msg = (input as { message?: unknown }).message
    if (typeof msg === 'string') return msg
  }
  return typeof input === 'string' ? input : JSON.stringify(input)
}

function buildAssistantText(events: AgentEvent[], output: unknown): string {
  const deltas = events
    .filter((e): e is Extract<AgentEvent, { type: 'message.delta' }> => e.type === 'message.delta')
    .map((e) => e.delta)
    .join('')
  if (deltas) return deltas
  if (output && typeof output === 'object' && output !== null && 'answer' in output) {
    return String((output as { answer?: unknown }).answer ?? '')
  }
  return ''
}

export const sessionsService = new SessionsService()

import type { ChatSession, SessionTranscript } from '@agent-frame/shared'
import { get, post, del } from '../../lib/http.ts'

export async function listSessions(): Promise<{ sessions: ChatSession[]; total: number }> {
  return get('/sessions')
}

export async function createSession(title?: string): Promise<{ session: ChatSession }> {
  return post('/sessions', title ? { title } : {})
}

export async function deleteSession(sessionId: string): Promise<{ success: boolean; sessionId: string }> {
  return del(`/sessions/${sessionId}`)
}

export async function getTranscript(sessionId: string): Promise<SessionTranscript> {
  return get(`/sessions/${sessionId}/transcript`)
}

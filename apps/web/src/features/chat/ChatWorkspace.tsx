import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { ChatSession, SessionTranscript } from '@agent-frame/shared'
import { useAuth } from '../auth/useAuth.tsx'
import { SessionSidebar } from '../sessions/SessionSidebar.tsx'
import * as sessionsApi from '../sessions/sessions.api.ts'
import { ChatPage } from './ChatPage.tsx'

export function ChatWorkspace() {
  const { user, logout } = useAuth()
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(urlSessionId ?? null)
  const [transcript, setTranscript] = useState<SessionTranscript | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshSessions = useCallback(async () => {
    const { sessions: list } = await sessionsApi.listSessions()
    setSessions(list)
    return list
  }, [])

  const loadTranscript = useCallback(async (sessionId: string) => {
    const data = await sessionsApi.getTranscript(sessionId)
    setTranscript(data)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const list = await refreshSessions()
        if (list.length > 0) {
          setCurrentSessionId(list[0].id)
          await loadTranscript(list[0].id)
        } else {
          const { session } = await sessionsApi.createSession()
          setSessions([session])
          setCurrentSessionId(session.id)
          setTranscript({ session, runs: [] })
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [refreshSessions, loadTranscript])

  async function handleSelectSession(sessionId: string) {
    setCurrentSessionId(sessionId)
    navigate(`/session/${sessionId}`)
    await loadTranscript(sessionId)
  }

  async function handleCreateSession() {
    const { session } = await sessionsApi.createSession()
    const list = await refreshSessions()
    setSessions(list)
    setCurrentSessionId(session.id)
    navigate(`/session/${session.id}`)
    setTranscript({ session, runs: [] })
  }

  async function handleDeleteSession(sessionId: string) {
    await sessionsApi.deleteSession(sessionId)
    const list = await refreshSessions()
    if (list.length === 0) {
      const { session } = await sessionsApi.createSession()
      setSessions([session])
      setCurrentSessionId(session.id)
      setTranscript({ session, runs: [] })
      return
    }
    if (sessionId === currentSessionId) {
      setCurrentSessionId(list[0].id)
      await loadTranscript(list[0].id)
    }
  }

  async function handleSessionActivity() {
    const list = await refreshSessions()
    setSessions(list)
    if (currentSessionId) {
      await loadTranscript(currentSessionId)
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117', color: '#6b7280' }}>
        加载中...
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0f1117',
        color: '#e5e7eb',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '15px' }}>Agent Frame</span>
        <span style={{ marginLeft: '12px', fontSize: '12px', color: '#6b7280' }}>{user?.email}</span>
        <button
          type="button"
          onClick={logout}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          退出登录
        </button>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <SessionSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelect={handleSelectSession}
          onCreate={handleCreateSession}
          onDelete={handleDeleteSession}
        />
        <ChatPage
          sessionId={currentSessionId}
          transcript={transcript}
          onSessionActivity={handleSessionActivity}
        />
      </div>
    </div>
  )
}

import { useState, useRef, useEffect, type FormEvent } from 'react'
import { post } from '../../lib/http.ts'
import { RunMessageItem } from '../runs/RunMessageItem.tsx'
import type { SessionTranscript } from '@agent-frame/shared'

type SessionRun = { runId: string; userMessage: string }

type CreateRunResponse = {
  runId: string
  traceId: string
  status: string
  sessionId: string
}

type Props = {
  sessionId: string | null
  transcript: SessionTranscript | null
  onSessionActivity: () => void
}

export function ChatPage({ sessionId, transcript, onSessionActivity }: Props) {
  const [input, setInput] = useState('')
  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([])
  const [agentMode, setAgentMode] = useState<'general' | 'hand-history'>('general')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!transcript) {
      setSessionRuns([])
      return
    }
    setSessionRuns(
      transcript.runs.map((r) => ({
        runId: r.run.id,
        userMessage: r.userMessage,
      })),
    )
  }, [transcript])

  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    const observer = new MutationObserver(() => {
      const isScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 100
      if (!isScrolledUp) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      }
    })
    observer.observe(el, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    const message = input.trim()
    if (!message || isSubmitting || !sessionId) return

    setError(null)
    setIsSubmitting(true)

    try {
      const result = await post<CreateRunResponse>('/runs', {
        input: { message },
        agentId: agentMode === 'hand-history' ? 'nl-to-hand-agent' : 'supervisor-agent',
        sessionId,
      })
      setSessionRuns((prev) => [...prev, { runId: result.runId, userMessage: message }])
      setInput('')
      textareaRef.current?.focus()
      onSessionActivity()
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  if (!sessionId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
        请选择或新建一个会话
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%' }}>
      <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', background: '#0f1117' }}>
        {sessionRuns.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: '#4b5563',
            }}
          >
            <div style={{ fontSize: '40px', opacity: 0.4 }}>⚡</div>
            <div style={{ fontSize: '14px' }}>发送消息开始对话</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sessionRuns.map((run) => (
              <RunMessageItem key={run.runId} runId={run.runId} userMessage={run.userMessage} />
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: '#0f1117',
          flexShrink: 0,
        }}
      >
        {error && (
          <div
            style={{
              marginBottom: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5',
              fontSize: '13px',
            }}
          >
            ✗ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button
            type="button"
            onClick={() => setAgentMode('general')}
            disabled={isSubmitting}
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              border: agentMode === 'general' ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.12)',
              background: agentMode === 'general' ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)',
              color: agentMode === 'general' ? '#ddd6fe' : '#9ca3af',
              fontSize: '12px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            通用聊天
          </button>
          <button
            type="button"
            onClick={() => setAgentMode('hand-history')}
            disabled={isSubmitting}
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              border: agentMode === 'hand-history' ? '1px solid #f97316' : '1px solid rgba(255,255,255,0.12)',
              background: agentMode === 'hand-history' ? 'rgba(249,115,22,0.16)' : 'rgba(255,255,255,0.04)',
              color: agentMode === 'hand-history' ? '#fed7aa' : '#9ca3af',
              fontSize: '12px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            牌谱生成
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={agentMode === 'hand-history' ? '描述一手德州扑克牌局... (Ctrl+Enter 提交)' : '输入问题... (Ctrl+Enter 提交)'}
            rows={2}
            disabled={isSubmitting}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              color: '#e5e7eb',
              fontSize: '14px',
              padding: '12px 16px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={isSubmitting || !input.trim()}
            style={{
              padding: '12px 20px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              height: '52px',
            }}
          >
            {isSubmitting ? '⏳' : '发送'}
          </button>
        </form>
      </div>
    </div>
  )
}

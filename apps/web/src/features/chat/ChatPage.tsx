import { useState, useRef, useEffect, type FormEvent } from 'react'
import { post } from '../../lib/http.ts'
import { RunMessageItem } from '../runs/RunMessageItem.tsx'

// ============================================================
// ChatPage — 主聊天界面 + RunTimeline
// ============================================================

type CreateRunResponse = {
  runId: string
  traceId: string
  status: string
}

export function ChatPage() {
  const [input, setInput] = useState('')
  const [sessionRuns, setSessionRuns] = useState<{ runId: string; userMessage: string }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
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
    if (!message || isSubmitting) return

    setError(null)
    setIsSubmitting(true)

    try {
      const result = await post<CreateRunResponse>('/runs', {
        input: { message },
        agentId: 'supervisor-agent',
      })
      setSessionRuns((prev) => [...prev, { runId: result.runId, userMessage: message }])
      setInput('')
      textareaRef.current?.focus()
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0f1117',
        color: '#e5e7eb',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      {/* 顶部栏 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.02)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}
          >
            ⚡
          </div>
          <div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
              }}
            >
              Agent Frame
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '-1px' }}>
              MVP · Multi-Agent Framework
            </div>
          </div>
        </div>

        {/* 状态指示器 */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
        </div>
      </header>

      {/* 主内容区 */}
      <div 
        ref={feedRef}
        style={{ flex: 1, overflowY: 'auto', background: '#0f1117' }}
      >
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
            <div style={{ fontSize: '12px', color: '#374151' }}>
              SupervisorAgent 将自动调用 ResearchAgent 和 SummaryAgent
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sessionRuns.map((run) => (
              <RunMessageItem key={run.runId} runId={run.runId} userMessage={run.userMessage} />
            ))}
          </div>
        )}
      </div>

      {/* 底部输入区 */}
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

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题发送给 SupervisorAgent...  (Ctrl+Enter 提交)"
            rows={2}
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
              transition: 'border-color 0.2s',
              lineHeight: 1.5,
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(99,102,241,0.5)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.1)'
            }}
            disabled={isSubmitting}
          />
          <button
            type="submit"
            disabled={isSubmitting || !input.trim()}
            style={{
              padding: '12px 20px',
              borderRadius: '10px',
              background:
                isSubmitting || !input.trim()
                  ? 'rgba(99,102,241,0.3)'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: isSubmitting || !input.trim() ? '#6b7280' : '#fff',
              border: 'none',
              cursor: isSubmitting || !input.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              height: '52px',
            }}
          >
            {isSubmitting ? '⏳' : '发送 ⚡'}
          </button>
        </form>
        <div
          style={{
            marginTop: '6px',
            fontSize: '11px',
            color: '#374151',
            textAlign: 'right',
          }}
        >
          Ctrl+Enter 快速提交 · MVP v0.1
        </div>
      </div>
    </div>
  )
}

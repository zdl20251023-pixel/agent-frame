import { useEffect, useRef } from 'react'
import type { AgentEvent } from '@agent-frame/shared'
import { AgentEventCard } from './AgentEventCard.tsx'

// ============================================================
// RunTimeline — 展示 Run 执行时间线
// ============================================================

type Props = {
  events: AgentEvent[]
  isConnected: boolean
  isTerminated: boolean
  fullText: string
  runId: string | null
}

function StatusBadge({ connected, terminated }: { connected: boolean; terminated: boolean }) {
  if (terminated) {
    return (
      <span
        style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '999px',
          background: 'rgba(59,130,246,0.15)',
          color: '#60a5fa',
          border: '1px solid rgba(59,130,246,0.3)',
        }}
      >
        ✓ 已完成
      </span>
    )
  }
  if (connected) {
    return (
      <span
        style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '999px',
          background: 'rgba(34,197,94,0.15)',
          color: '#4ade80',
          border: '1px solid rgba(34,197,94,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#4ade80',
            animation: 'pulse 1.5s infinite',
          }}
        />
        运行中
      </span>
    )
  }
  return null
}

export function RunTimeline({ events, isConnected, isTerminated, fullText, runId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (!runId) return null

  // 过滤 message.delta，分组展示
  const nonDeltaEvents = events.filter((e) => e.type !== 'message.delta')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>
            RUN:{' '}
          </span>
          <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>
            {runId}
          </span>
        </div>
        <StatusBadge connected={isConnected} terminated={isTerminated} />
      </div>

      {/* 事件列表 */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px',
        }}
      >
        {/* 系统事件 */}
        {nonDeltaEvents.map((event, i) => (
          <AgentEventCard key={`${event.type}-${i}`} event={event} index={i} />
        ))}

        {/* AI 回复文本 */}
        {fullText && (
          <div
            style={{
              marginTop: '12px',
              padding: '14px',
              borderRadius: '8px',
              background: 'rgba(139,92,246,0.08)',
              border: '1px solid rgba(139,92,246,0.2)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#8b5cf6',
                marginBottom: '8px',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              AI 回复
            </div>
            <div
              style={{
                fontSize: '14px',
                color: '#e5e7eb',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {fullText}
            </div>
          </div>
        )}

        {/* 正在运行的指示器 */}
        {isConnected && !isTerminated && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              color: '#6b7280',
              fontSize: '12px',
            }}
          >
            <span className="loading-dots">···</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 底部统计 */}
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: '11px',
          color: '#4b5563',
          flexShrink: 0,
          display: 'flex',
          gap: '16px',
        }}
      >
        <span>总事件：{events.length}</span>
        <span>系统事件：{nonDeltaEvents.length}</span>
        {fullText && <span>回复字数：{fullText.length}</span>}
      </div>
    </div>
  )
}

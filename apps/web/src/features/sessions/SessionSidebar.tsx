import type { CSSProperties } from 'react'
import type { ChatSession } from '@agent-frame/shared'

type Props = {
  sessions: ChatSession[]
  currentSessionId: string | null
  onSelect: (sessionId: string) => void
  onCreate: () => void
  onDelete: (sessionId: string) => void
}

export function SessionSidebar({
  sessions,
  currentSessionId,
  onSelect,
  onCreate,
  onDelete,
}: Props) {
  return (
    <aside
      style={{
        width: '260px',
        flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button type="button" onClick={onCreate} style={newBtnStyle}>
          + 新建会话
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {sessions.length === 0 ? (
          <div style={{ padding: '12px', color: '#6b7280', fontSize: '12px' }}>暂无会话</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginBottom: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  background:
                    s.id === currentSessionId
                      ? 'rgba(99,102,241,0.25)'
                      : 'transparent',
                  color: s.id === currentSessionId ? '#e5e7eb' : '#9ca3af',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || '新对话'}
                </div>
                <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                  {s.updatedAt?.slice(0, 19).replace('T', ' ')}
                </div>
              </button>
              <button
                type="button"
                title="删除会话"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('确定删除该会话？')) onDelete(s.id)
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '4px',
                  fontSize: '14px',
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { href: '/agents', icon: '⚡', label: 'Agent 中心' },
          { href: '/workflows', icon: '◈', label: 'Workflow' },
        ].map(({ href, icon, label }) => (
          <a
            key={href}
            href={href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '8px',
              color: '#6b7280',
              fontSize: '13px',
              textDecoration: 'none',
              transition: 'background 0.15s, color 0.15s',
              marginBottom: '2px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.color = '#d1d5db'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#6b7280'
            }}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </a>
        ))}
      </div>
    </aside>
  )
}

const newBtnStyle: CSSProperties = {
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  border: '1px dashed rgba(99,102,241,0.4)',
  background: 'rgba(99,102,241,0.08)',
  color: '#a5b4fc',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
}

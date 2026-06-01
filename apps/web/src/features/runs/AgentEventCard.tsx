import type { AgentEvent } from '@agent-frame/shared'

// ============================================================
// AgentEventCard — 渲染单个 AgentEvent
// ============================================================

type Props = { event: AgentEvent; index: number }

const EVENT_COLORS: Record<string, string> = {
  'run.started': '#22c55e',
  'run.completed': '#3b82f6',
  'run.failed': '#ef4444',
  'run.cancelled': '#f59e0b',
  'message.delta': '#8b5cf6',
  'agent.call.started': '#06b6d4',
  'agent.call.completed': '#10b981',
  'agent.call.failed': '#f43f5e',
  'tool.call': '#f97316',
  'tool.result': '#84cc16',
  'artifact.created': '#a78bfa',
  'artifact.version.created': '#c084fc',
}

const EVENT_ICONS: Record<string, string> = {
  'run.started': '▶',
  'run.completed': '✓',
  'run.failed': '✗',
  'run.cancelled': '⊘',
  'message.delta': '💬',
  'agent.call.started': '→',
  'agent.call.completed': '←',
  'agent.call.failed': '✗',
  'tool.call': '⚙',
  'tool.result': '✓',
  'artifact.created': '📄',
  'artifact.version.created': '📝',
}

function formatEventDetails(event: AgentEvent): string {
  switch (event.type) {
    case 'run.started':
      return `Agent: ${event.agentId ?? 'unknown'}`
    case 'run.completed':
      return 'Run completed successfully'
    case 'run.failed':
      return `Error: ${event.errorCode ?? ''} — ${event.reason ?? ''}`
    case 'run.cancelled':
      return `Reason: ${event.reason ?? 'user request'}`
    case 'message.delta':
      return event.delta.length > 60 ? event.delta.slice(0, 60) + '...' : event.delta
    case 'agent.call.started':
      return `${event.fromAgentId} → ${event.toAgentId}`
    case 'agent.call.completed':
      return `${event.fromAgentId} ← ${event.toAgentId}  (${event.latencyMs}ms)`
    case 'agent.call.failed':
      return `${event.error.code}: ${event.error.message}`
    case 'tool.call':
      return `[${event.agentId}] ${event.toolName}`
    case 'tool.result':
      return `[${event.agentId}] ${event.toolName} ✓`
    case 'artifact.created':
      return `type=${event.artifactType}  title=${event.title ?? '-'}`
    case 'artifact.version.created':
      return `artifact=${event.artifactId}  v${event.version}`
    default:
      return ''
  }
}

export function AgentEventCard({ event, index }: Props) {
  const color = EVENT_COLORS[event.type] ?? '#6b7280'
  const icon = EVENT_ICONS[event.type] ?? '•'
  const details = formatEventDetails(event)

  // message.delta 事件太多，精简展示
  if (event.type === 'message.delta') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          fontSize: '12px',
          color: '#9ca3af',
        }}
      >
        <span style={{ color, fontSize: '10px' }}>{icon}</span>
        <span style={{ color: '#d1d5db', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {event.delta}
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid rgba(255,255,255,0.05)`,
        marginBottom: '4px',
        transition: 'all 0.2s ease',
      }}
    >
      {/* 序号 */}
      <span
        style={{
          fontSize: '10px',
          color: '#6b7280',
          minWidth: '20px',
          marginTop: '2px',
          fontFamily: 'monospace',
        }}
      >
        {String(index + 1).padStart(3, '0')}
      </span>

      {/* 图标 */}
      <span
        style={{
          fontSize: '14px',
          color,
          minWidth: '18px',
          textAlign: 'center',
        }}
      >
        {icon}
      </span>

      {/* 主体内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {event.type}
          </span>
          {details && (
            <span
              style={{
                fontSize: '12px',
                color: '#9ca3af',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '400px',
              }}
            >
              {details}
            </span>
          )}
        </div>
      </div>

      {/* 时间戳 */}
      <span
        style={{
          fontSize: '10px',
          color: '#4b5563',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {new Date(event.timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3,
        })}
      </span>
    </div>
  )
}

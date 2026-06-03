import type { AgentEvent } from '@agent-frame/shared'
import { EVENT_TYPES } from '@agent-frame/shared'

// ============================================================
// AgentEventCard — 渲染单个 AgentEvent
// ============================================================

type Props = { event: AgentEvent; index: number }

const EVENT_COLORS: Record<string, string> = {
  [EVENT_TYPES.RUN_STARTED]: '#22c55e',
  [EVENT_TYPES.RUN_COMPLETED]: '#3b82f6',
  [EVENT_TYPES.RUN_FAILED]: '#ef4444',
  [EVENT_TYPES.RUN_CANCELLED]: '#f59e0b',
  [EVENT_TYPES.MESSAGE_DELTA]: '#8b5cf6',
  [EVENT_TYPES.AGENT_CALL_STARTED]: '#06b6d4',
  [EVENT_TYPES.AGENT_CALL_COMPLETED]: '#10b981',
  [EVENT_TYPES.AGENT_CALL_FAILED]: '#f43f5e',
  [EVENT_TYPES.TOOL_CALL]: '#f97316',
  [EVENT_TYPES.TOOL_RESULT]: '#84cc16',
  [EVENT_TYPES.ARTIFACT_CREATED]: '#a78bfa',
  [EVENT_TYPES.ARTIFACT_VERSION_CREATED]: '#c084fc',
}

const EVENT_ICONS: Record<string, string> = {
  [EVENT_TYPES.RUN_STARTED]: '▶',
  [EVENT_TYPES.RUN_COMPLETED]: '✓',
  [EVENT_TYPES.RUN_FAILED]: '✗',
  [EVENT_TYPES.RUN_CANCELLED]: '⊘',
  [EVENT_TYPES.MESSAGE_DELTA]: '💬',
  [EVENT_TYPES.AGENT_CALL_STARTED]: '→',
  [EVENT_TYPES.AGENT_CALL_COMPLETED]: '←',
  [EVENT_TYPES.AGENT_CALL_FAILED]: '✗',
  [EVENT_TYPES.TOOL_CALL]: '⚙',
  [EVENT_TYPES.TOOL_RESULT]: '✓',
  [EVENT_TYPES.ARTIFACT_CREATED]: '📄',
  [EVENT_TYPES.ARTIFACT_VERSION_CREATED]: '📝',
}

function formatEventDetails(event: AgentEvent): string {
  switch (event.type) {
    case EVENT_TYPES.RUN_STARTED:
      return `Agent: ${event.agentId ?? 'unknown'}`
    case EVENT_TYPES.RUN_COMPLETED:
      return 'Run completed successfully'
    case EVENT_TYPES.RUN_FAILED:
      return `Error: ${event.errorCode ?? ''} — ${event.reason ?? ''}`
    case EVENT_TYPES.RUN_CANCELLED:
      return `Reason: ${event.reason ?? 'user request'}`
    case EVENT_TYPES.MESSAGE_DELTA:
      return event.delta.length > 60 ? event.delta.slice(0, 60) + '...' : event.delta
    case EVENT_TYPES.AGENT_CALL_STARTED:
      return `${event.fromAgentId} → ${event.toAgentId}`
    case EVENT_TYPES.AGENT_CALL_COMPLETED:
      return `${event.fromAgentId} ← ${event.toAgentId}  (${event.latencyMs}ms)`
    case EVENT_TYPES.AGENT_CALL_FAILED:
      return `${event.error.code}: ${event.error.message}`
    case EVENT_TYPES.TOOL_CALL:
      return `[${event.agentId}] ${event.toolName}`
    case EVENT_TYPES.TOOL_RESULT:
      return `[${event.agentId}] ${event.toolName} ✓`
    case EVENT_TYPES.ARTIFACT_CREATED:
      return `type=${event.artifactType}  title=${event.title ?? '-'}`
    case EVENT_TYPES.ARTIFACT_VERSION_CREATED:
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
  if (event.type === EVENT_TYPES.MESSAGE_DELTA) {
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

import type { AgentEvent } from '@agent-frame/shared'
import { EVENT_TYPES } from '@agent-frame/shared'

// ============================================================
// AgentEventCard — 渲染单个 AgentEvent
// ============================================================

type Props = { event: AgentEvent; index: number }

type ToolCallPreview = {
  playerCount?: number
  bigBlind?: number
  heroPosition?: string
  heroCards?: string
  actionCount?: number
  hasFlop?: boolean
  hasTurn?: boolean
  hasRiver?: boolean
}

type ToolResultPreview = {
  status?: 'success' | 'failed'
  validationCode?: string
  errorStep?: number
  errorPosition?: string
  errorReason?: string
  fixPath?: string
  askUser?: string
  artifactId?: string
  versionId?: string
}

const EVENT_COLORS: Record<string, string> = {
  [EVENT_TYPES.RUN_STARTED]: '#22c55e',
  [EVENT_TYPES.RUN_COMPLETED]: '#3b82f6',
  [EVENT_TYPES.RUN_FAILED]: '#ef4444',
  [EVENT_TYPES.RUN_CANCELLED]: '#f59e0b',
  [EVENT_TYPES.MESSAGE_DELTA]: '#8b5cf6',
  [EVENT_TYPES.AGENT_CALL_STARTED]: '#06b6d4',
  [EVENT_TYPES.AGENT_CALL_COMPLETED]: '#10b981',
  [EVENT_TYPES.AGENT_CALL_FAILED]: '#f43f5e',
  [EVENT_TYPES.AGENT_CALL_QUEUED]: '#818cf8',
  [EVENT_TYPES.AGENT_CALL_PROGRESS]: '#38bdf8',
  [EVENT_TYPES.AGENT_CALL_CANCELLED]: '#f59e0b',
  [EVENT_TYPES.TOOL_CALL]: '#f97316',
  [EVENT_TYPES.TOOL_RESULT]: '#84cc16',
  [EVENT_TYPES.ARTIFACT_CREATED]: '#a78bfa',
  [EVENT_TYPES.ARTIFACT_VERSION_CREATED]: '#c084fc',
  [EVENT_TYPES.WORKFLOW_STARTED]: '#38bdf8',
  [EVENT_TYPES.WORKFLOW_COMPLETED]: '#22c55e',
  [EVENT_TYPES.WORKFLOW_FAILED]: '#ef4444',
  [EVENT_TYPES.WORKFLOW_CANCELLED]: '#f59e0b',
  [EVENT_TYPES.WORKFLOW_STAGE_STARTED]: '#60a5fa',
  [EVENT_TYPES.WORKFLOW_STAGE_COMPLETED]: '#34d399',
  [EVENT_TYPES.WORKFLOW_STAGE_FAILED]: '#fb7185',
  [EVENT_TYPES.WORKFLOW_STAGE_SKIPPED]: '#94a3b8',
  [EVENT_TYPES.WORKFLOW_HUMAN_GATE_WAITING]: '#facc15',
  [EVENT_TYPES.WORKFLOW_HUMAN_GATE_APPROVED]: '#4ade80',
  [EVENT_TYPES.WORKFLOW_HUMAN_GATE_REJECTED]: '#f87171',
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
  [EVENT_TYPES.AGENT_CALL_QUEUED]: '⏳',
  [EVENT_TYPES.AGENT_CALL_PROGRESS]: '…',
  [EVENT_TYPES.AGENT_CALL_CANCELLED]: '⊘',
  [EVENT_TYPES.TOOL_CALL]: '⚙',
  [EVENT_TYPES.TOOL_RESULT]: '✓',
  [EVENT_TYPES.ARTIFACT_CREATED]: '📄',
  [EVENT_TYPES.ARTIFACT_VERSION_CREATED]: '📝',
  [EVENT_TYPES.WORKFLOW_STARTED]: '◇',
  [EVENT_TYPES.WORKFLOW_COMPLETED]: '◆',
  [EVENT_TYPES.WORKFLOW_FAILED]: '!',
  [EVENT_TYPES.WORKFLOW_CANCELLED]: '⊘',
  [EVENT_TYPES.WORKFLOW_STAGE_STARTED]: '▷',
  [EVENT_TYPES.WORKFLOW_STAGE_COMPLETED]: '✓',
  [EVENT_TYPES.WORKFLOW_STAGE_FAILED]: '✗',
  [EVENT_TYPES.WORKFLOW_STAGE_SKIPPED]: '↷',
  [EVENT_TYPES.WORKFLOW_HUMAN_GATE_WAITING]: '⏸',
  [EVENT_TYPES.WORKFLOW_HUMAN_GATE_APPROVED]: '✓',
  [EVENT_TYPES.WORKFLOW_HUMAN_GATE_REJECTED]: '✗',
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
    case EVENT_TYPES.AGENT_CALL_QUEUED:
      return `${event.fromAgentId} → ${event.toAgentId} queued  task=${event.taskId} child=${event.childRunId}`
    case EVENT_TYPES.AGENT_CALL_PROGRESS:
      return `task=${event.taskId} child=${event.childRunId}${event.progress !== undefined ? ` ${event.progress}%` : ''}${event.message ? ` — ${event.message}` : ''}`
    case EVENT_TYPES.AGENT_CALL_CANCELLED:
      return `task=${event.taskId} child=${event.childRunId} cancelled${event.reason ? ` — ${event.reason}` : ''}`
    case EVENT_TYPES.TOOL_CALL:
      return formatToolCallSummary(event.toolName, event.input)
    case EVENT_TYPES.TOOL_RESULT:
      return formatToolResultSummary(event.toolName, event.output)
    case EVENT_TYPES.ARTIFACT_CREATED:
      return `type=${event.artifactType}  title=${event.title ?? '-'}`
    case EVENT_TYPES.ARTIFACT_VERSION_CREATED:
      return `artifact=${event.artifactId}  v${event.version}`
    case EVENT_TYPES.WORKFLOW_STARTED:
      return `Workflow started: ${event.workflowId ?? event.workflowRunId ?? '-'}`
    case EVENT_TYPES.WORKFLOW_COMPLETED:
      return `Workflow completed: ${event.workflowId ?? event.workflowRunId ?? '-'}`
    case EVENT_TYPES.WORKFLOW_FAILED:
      return event.error ? `${event.error.code}: ${event.error.message}` : 'Workflow failed'
    case EVENT_TYPES.WORKFLOW_CANCELLED:
      return `Workflow cancelled: ${event.workflowId ?? event.workflowRunId ?? '-'}`
    case EVENT_TYPES.WORKFLOW_STAGE_STARTED:
      return `Stage started: ${event.stageName ?? event.stageId}${event.agentId ? ` (${event.agentId})` : ''}`
    case EVENT_TYPES.WORKFLOW_STAGE_COMPLETED:
      return `Stage completed: ${event.stageName ?? event.stageId}`
    case EVENT_TYPES.WORKFLOW_STAGE_FAILED:
      return event.error
        ? `Stage failed: ${event.stageName ?? event.stageId} — ${event.error.message}`
        : `Stage failed: ${event.stageName ?? event.stageId}`
    case EVENT_TYPES.WORKFLOW_STAGE_SKIPPED:
      return `Stage skipped: ${event.stageName ?? event.stageId}`
    case EVENT_TYPES.WORKFLOW_HUMAN_GATE_WAITING:
      return `等待人工审核: ${event.stageName ?? event.stageId}`
    case EVENT_TYPES.WORKFLOW_HUMAN_GATE_APPROVED:
      return `人工审核通过: ${event.stageName ?? event.stageId}`
    case EVENT_TYPES.WORKFLOW_HUMAN_GATE_REJECTED:
      return `人工审核拒绝: ${event.stageName ?? event.stageId}${event.reason ? ` — ${event.reason}` : ''}`
    default:
      return ''
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatToolCallSummary(toolName: string, input: unknown): string {
  if (toolName !== 'nl_to_hand' || !isRecord(input)) return toolName
  const preview = input as ToolCallPreview
  const parts = [
    preview.playerCount ? `${preview.playerCount}人桌` : undefined,
    preview.bigBlind ? `BB=${preview.bigBlind}` : undefined,
    preview.heroPosition ? `Hero ${preview.heroPosition}` : undefined,
    preview.heroCards,
    preview.actionCount !== undefined ? `${preview.actionCount} actions` : undefined,
  ].filter(Boolean)
  return `nl_to_hand 调用：${parts.join(' · ') || '候选牌谱'}`
}

function formatToolResultSummary(toolName: string, output: unknown): string {
  if (toolName !== 'nl_to_hand' || !isRecord(output)) return `${toolName} ✓`
  const preview = output as ToolResultPreview
  if (preview.status === 'success') return 'nl_to_hand 校验通过'
  return `nl_to_hand 待修正${preview.validationCode ? `：${preview.validationCode}` : ''}`
}

function ToolEventDetails({ event }: { event: AgentEvent }) {
  if (event.type === EVENT_TYPES.TOOL_CALL && event.toolName === 'nl_to_hand' && isRecord(event.input)) {
    const preview = event.input as ToolCallPreview
    const streets = [
      preview.hasFlop ? 'Flop' : undefined,
      preview.hasTurn ? 'Turn' : undefined,
      preview.hasRiver ? 'River' : undefined,
    ].filter(Boolean)

    return (
      <div style={toolDetailBoxStyle}>
        <ToolChip label="人数" value={preview.playerCount ? `${preview.playerCount}` : '未知'} />
        <ToolChip label="BB" value={preview.bigBlind ? `${preview.bigBlind}` : '未知'} />
        <ToolChip label="Hero" value={[preview.heroPosition, preview.heroCards].filter(Boolean).join(' ') || '未知'} />
        <ToolChip label="行动" value={preview.actionCount !== undefined ? `${preview.actionCount}` : '未知'} />
        <ToolChip label="街道" value={streets.length ? streets.join('/') : 'Preflop'} />
      </div>
    )
  }

  if (event.type === EVENT_TYPES.TOOL_RESULT && event.toolName === 'nl_to_hand' && isRecord(event.output)) {
    const preview = event.output as ToolResultPreview
    const isSuccess = preview.status === 'success'

    return (
      <div style={toolDetailBoxStyle}>
        <ToolChip label="状态" value={isSuccess ? '校验通过' : '待修正'} tone={isSuccess ? 'success' : 'warning'} />
        {preview.validationCode && <ToolChip label="错误码" value={preview.validationCode} tone="warning" />}
        {preview.errorStep !== undefined && <ToolChip label="步骤" value={`${preview.errorStep}`} />}
        {preview.errorPosition && <ToolChip label="位置" value={preview.errorPosition} />}
        {preview.fixPath && <ToolChip label="fixPath" value={preview.fixPath} />}
        {preview.errorReason && (
          <div style={toolMessageStyle}>
            <strong>原因：</strong>{preview.errorReason}
          </div>
        )}
        {preview.askUser && (
          <div style={toolAskStyle}>
            <strong>需要补充：</strong>{preview.askUser}
          </div>
        )}
      </div>
    )
  }

  return null
}

function ToolChip({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'success' | 'warning'
}) {
  const color = tone === 'success' ? '#86efac' : tone === 'warning' ? '#fdba74' : '#cbd5e1'
  const border = tone === 'success'
    ? 'rgba(34,197,94,0.28)'
    : tone === 'warning'
      ? 'rgba(249,115,22,0.28)'
      : 'rgba(148,163,184,0.2)'

  return (
    <span style={{ ...toolChipStyle, color, borderColor: border }}>
      <span style={{ color: '#94a3b8' }}>{label}:</span> {value}
    </span>
  )
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
        <ToolEventDetails event={event} />
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

const toolDetailBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginTop: '8px',
}

const toolChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: '4px',
  alignItems: 'center',
  padding: '3px 7px',
  borderRadius: '999px',
  border: '1px solid',
  background: 'rgba(15,23,42,0.42)',
  fontSize: '11px',
  fontFamily: 'monospace',
}

const toolMessageStyle: React.CSSProperties = {
  flexBasis: '100%',
  color: '#d1d5db',
  fontSize: '12px',
  lineHeight: 1.6,
  padding: '6px 8px',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.035)',
}

const toolAskStyle: React.CSSProperties = {
  flexBasis: '100%',
  color: '#fed7aa',
  fontSize: '12px',
  lineHeight: 1.6,
  padding: '6px 8px',
  borderRadius: '8px',
  background: 'rgba(249,115,22,0.10)',
  border: '1px solid rgba(249,115,22,0.22)',
}

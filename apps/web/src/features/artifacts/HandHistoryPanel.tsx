import { useCallback, useEffect, useRef } from 'react'
import type React from 'react'
import type { ToolInvocation } from '@agent-frame/shared'
import type { ArtifactContent } from './useArtifact.ts'
import { useToolInvocation } from './useToolInvocation.ts'

// ============================================================
// HandHistoryPanel — hand_history 专用展示面板
//
// 职责：
// - 展示 nl_to_hand 生成的结构化牌谱 Artifact。
// - 合法牌谱优先展示 Markdown 摘要。
// - draft / failed 牌谱展示错误码、fixPath 和需要用户补充的问题。
// ============================================================

type HandHistoryContent = {
  rawUserText?: string
  gameHand?: {
    players?: Array<{
      seat_no: number
      name?: string
      position_tag?: string
      stack?: number
      hole_card_list?: string
    }>
    big_blind?: number
    ante?: number
    actions?: Array<{ action: string; seat_no: number; amount: number }>
    result?: unknown
  }
  validation?: {
    ok?: boolean
    code?: string
    message?: string
    step?: number
    fixPath?: string
    askUser?: string
  }
  renderedMarkdown?: string
  toolResultText?: string
  handHistoryState?: {
    status?: 'draft' | 'valid' | 'invalid_needs_user_input' | 'patched' | 'repairing' | 'repair_failed'
    asyncRepair?: boolean
    baseArtifactId?: string
    baseVersionId?: string
    commandType?: string
  }
  createdBy?: {
    runId?: string
    agentId?: string
    toolName?: string
    toolInvocationId?: string
  }
  repairedBy?: {
    taskType?: string
    repairedAt?: string
  }
}

export function HandHistoryPanel({ content, onRefresh }: { content: ArtifactContent; onRefresh?: () => void }) {
  const data = normalizeHandHistoryContent(content.content)
  const gameHand = data.gameHand
  const validation = data.validation
  const players = gameHand?.players ?? []
  const hero = players.find((player) => player.hole_card_list)
  const toolInvocationId = data.createdBy?.toolInvocationId
  const refreshedInvocationRef = useRef<string | null>(null)

  useEffect(() => {
    refreshedInvocationRef.current = null
  }, [toolInvocationId])

  const handleToolPoll = useCallback((invocation: ToolInvocation) => {
    // 内容已有效，或该 invocation 已触发过刷新，无需再拉 artifact
    if (data.validation?.ok) return
    if (
      invocation.status === 'succeeded' &&
      invocation.phase === 'completed' &&
      refreshedInvocationRef.current !== invocation.id
    ) {
      refreshedInvocationRef.current = invocation.id
      onRefresh?.()
    }
  }, [onRefresh, data.validation?.ok])
  const { toolInvocation, error: toolStatusError } = useToolInvocation(toolInvocationId, {
    poll: shouldPollToolInvocation(data, toolInvocationId),
    intervalMs: 3000,
    onPoll: handleToolPoll,
  })
  const status = resolveHandHistoryStatus(data, toolInvocation)
  const statusMeta = getStatusMeta(status)

  function handleContinueEdit() {
    window.dispatchEvent(new CustomEvent('hand-history:continue-edit', {
      detail: {
        artifactId: content.artifactId,
        baseVersionId: content.versionId,
        title: content.title,
      },
    }))
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={labelStyle}>Hand History</div>
          <h3 style={titleStyle}>{content.title ?? '牌谱产物'}</h3>
        </div>
        <span style={statusMeta.badgeStyle}>
          {statusMeta.label}
        </span>
      </div>

      <div style={statusPanelStyle}>
        <div style={statusTitleStyle}>{statusMeta.title}</div>
        <div style={statusDescriptionStyle}>{statusMeta.description}</div>
        {toolInvocation && (
          <div style={statusDetailStyle}>
            ToolInvocation: <code>{toolInvocation.id.slice(0, 18)}...</code>
            {' · '}
            {toolInvocation.status}/{toolInvocation.phase}
          </div>
        )}
        {toolStatusError && <div style={statusErrorStyle}>工具状态加载失败：{toolStatusError}</div>}
      </div>

      <button type="button" style={continueButtonStyle} onClick={handleContinueEdit}>
        基于此牌谱继续修改
      </button>

      <div style={gridStyle}>
        <InfoItem label="人数" value={players.length ? `${players.length} 人` : '未知'} />
        <InfoItem label="盲注" value={gameHand?.big_blind ? `${gameHand.big_blind}` : '未知'} />
        <InfoItem label="前注" value={gameHand?.ante !== undefined ? `${gameHand.ante}` : '未知'} />
        <InfoItem label="Hero" value={hero ? `${hero.position_tag ?? `seat ${hero.seat_no}`} ${hero.hole_card_list ?? ''}` : '未知'} />
        <InfoItem label="行动数" value={gameHand?.actions?.length !== undefined ? `${gameHand.actions.length}` : '未知'} />
        <InfoItem label="错误码" value={validation?.code ?? (validation?.ok ? 'OK' : '未知')} />
      </div>

      {data.rawUserText && (
        <Section title="原始描述">
          <div style={softTextStyle}>{data.rawUserText}</div>
        </Section>
      )}

      {!validation?.ok && (
        <Section title="当前卡住的问题">
          <div style={errorBoxStyle}>
            {validation?.step !== undefined && <div>出错步骤：{validation.step}</div>}
            {validation?.fixPath && <div>修复路径：<code>{validation.fixPath}</code></div>}
            {validation?.askUser && <div>需要补充：{validation.askUser}</div>}
            {!validation?.askUser && validation?.message && <pre style={preWrapStyle}>{validation.message}</pre>}
          </div>
        </Section>
      )}

      {data.renderedMarkdown && (
        <Section title="牌谱摘要">
          <pre style={markdownStyle}>{stripMarkdownFence(data.renderedMarkdown)}</pre>
        </Section>
      )}

      {players.length > 0 && (
        <Section title="玩家列表">
          <div style={playerListStyle}>
            {players.map((player) => (
              <div key={player.seat_no} style={playerRowStyle}>
                <span style={seatStyle}>seat {player.seat_no}</span>
                <span>{player.position_tag ?? '-'}</span>
                <span>{player.name ?? '-'}</span>
                <span>{player.stack ?? 0}</span>
                <span>{player.hole_card_list || '未知'}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <details style={detailsStyle}>
        <summary style={summaryStyle}>查看结构化 JSON</summary>
        <pre style={jsonStyle}>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  )
}

type HandHistoryStatus = 'valid' | 'draft' | 'repairing' | 'repair_failed' | 'invalid_needs_user_input'

function resolveHandHistoryStatus(data: HandHistoryContent, invocation: ToolInvocation | null): HandHistoryStatus {
  if (invocation?.status === 'waiting_repair') return 'repairing'
  if (invocation?.status === 'running' && invocation.phase === 'inner_repair') return 'repairing'
  if (invocation?.status === 'failed' && invocation.phase === 'inner_repair') return 'repair_failed'
  if (data.handHistoryState?.status === 'repairing') return 'repairing'
  if (data.handHistoryState?.status === 'repair_failed') return 'repair_failed'
  if (data.handHistoryState?.status === 'invalid_needs_user_input') return 'invalid_needs_user_input'
  if (data.validation?.ok || data.handHistoryState?.status === 'valid' || data.handHistoryState?.status === 'patched') {
    return 'valid'
  }
  return 'draft'
}

function shouldPollToolInvocation(data: HandHistoryContent, invocationId: string | undefined): boolean {
  if (!invocationId) return false
  if (data.validation?.ok) return false
  if (data.handHistoryState?.status === 'invalid_needs_user_input') return false
  if (data.handHistoryState?.status === 'repair_failed') return false
  // 仅在后端已标记修复中时才主动轮询；纯 draft 只拉一次 invocation（由 hook 内判断终态）
  return data.handHistoryState?.status === 'repairing' || data.handHistoryState?.asyncRepair === true
}

function getStatusMeta(status: HandHistoryStatus): {
  label: string
  title: string
  description: string
  badgeStyle: React.CSSProperties
} {
  if (status === 'valid') {
    return {
      label: '校验通过',
      title: '当前牌谱已通过校验',
      description: '这版牌谱已经通过确定性引擎校验，可以继续基于它做增量修改。',
      badgeStyle: validBadgeStyle,
    }
  }
  if (status === 'repairing') {
    return {
      label: '后台修复中',
      title: '已保存 draft，后台正在尝试修复',
      description: '同步 Run 已先返回，内层 LLM 修复正在后台执行；修复成功后会追加新的有效版本。',
      badgeStyle: repairingBadgeStyle,
    }
  }
  if (status === 'repair_failed') {
    return {
      label: '后台修复失败',
      title: '后台修复未生成合法牌谱',
      description: '当前 draft 仍然保留，可以根据错误信息补充缺失信息后继续修改。',
      badgeStyle: failedBadgeStyle,
    }
  }
  if (status === 'invalid_needs_user_input') {
    return {
      label: '需要补充信息',
      title: '需要用户补充后才能继续',
      description: '当前描述不足以稳定生成合法牌谱，请补充错误提示中指出的信息。',
      badgeStyle: draftBadgeStyle,
    }
  }
  return {
    label: '待补充 / 待修正',
    title: '当前为 draft 牌谱',
    description: '这版牌谱尚未通过完整校验，可以继续修改或等待后台修复结果。',
    badgeStyle: draftBadgeStyle,
  }
}

function normalizeHandHistoryContent(content: unknown): HandHistoryContent {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content) as HandHistoryContent
    } catch {
      return { renderedMarkdown: content }
    }
  }

  if (content && typeof content === 'object') {
    return content as HandHistoryContent
  }

  return {}
}

function stripMarkdownFence(markdown: string): string {
  return markdown
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoItemStyle}>
      <span style={infoLabelStyle}>{label}</span>
      <span style={infoValueStyle}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      {children}
    </section>
  )
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'flex-start',
}

const labelStyle: React.CSSProperties = {
  color: '#f97316',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 700,
}

const titleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  color: '#f8fafc',
  fontSize: '18px',
}

const validBadgeStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '999px',
  color: '#86efac',
  background: 'rgba(34,197,94,0.12)',
  border: '1px solid rgba(34,197,94,0.28)',
  fontSize: '12px',
}

const draftBadgeStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '999px',
  color: '#fbbf24',
  background: 'rgba(245,158,11,0.12)',
  border: '1px solid rgba(245,158,11,0.28)',
  fontSize: '12px',
}

const repairingBadgeStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '999px',
  color: '#93c5fd',
  background: 'rgba(59,130,246,0.12)',
  border: '1px solid rgba(59,130,246,0.28)',
  fontSize: '12px',
}

const failedBadgeStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '999px',
  color: '#fca5a5',
  background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.28)',
  fontSize: '12px',
}

const statusPanelStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '12px',
  background: 'rgba(255,255,255,0.035)',
  border: '1px solid rgba(255,255,255,0.08)',
}

const statusTitleStyle: React.CSSProperties = {
  color: '#e5e7eb',
  fontSize: '13px',
  fontWeight: 700,
  marginBottom: '4px',
}

const statusDescriptionStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: '12px',
  lineHeight: 1.6,
}

const statusDetailStyle: React.CSSProperties = {
  marginTop: '8px',
  color: '#94a3b8',
  fontSize: '11px',
}

const statusErrorStyle: React.CSSProperties = {
  marginTop: '8px',
  color: '#fca5a5',
  fontSize: '11px',
}

const continueButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 12px',
  borderRadius: '999px',
  border: '1px solid rgba(249,115,22,0.35)',
  background: 'rgba(249,115,22,0.12)',
  color: '#fed7aa',
  fontSize: '12px',
  cursor: 'pointer',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: '8px',
}

const infoItemStyle: React.CSSProperties = {
  padding: '10px',
  borderRadius: '10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
}

const infoLabelStyle: React.CSSProperties = {
  display: 'block',
  color: '#94a3b8',
  fontSize: '11px',
  marginBottom: '4px',
}

const infoValueStyle: React.CSSProperties = {
  color: '#e5e7eb',
  fontSize: '13px',
  fontFamily: 'monospace',
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const sectionTitleStyle: React.CSSProperties = {
  color: '#c4b5fd',
  fontSize: '13px',
  fontWeight: 700,
}

const softTextStyle: React.CSSProperties = {
  color: '#d1d5db',
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap',
}

const errorBoxStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '10px',
  color: '#fed7aa',
  background: 'rgba(249,115,22,0.1)',
  border: '1px solid rgba(249,115,22,0.25)',
  lineHeight: 1.7,
}

const markdownStyle: React.CSSProperties = {
  margin: 0,
  padding: '12px',
  borderRadius: '10px',
  color: '#e5e7eb',
  background: 'rgba(15,23,42,0.8)',
  border: '1px solid rgba(148,163,184,0.16)',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.7,
}

const playerListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const playerRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '70px 70px 1fr 70px 90px',
  gap: '8px',
  padding: '8px 10px',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.035)',
  color: '#d1d5db',
  fontSize: '12px',
}

const seatStyle: React.CSSProperties = {
  color: '#93c5fd',
  fontFamily: 'monospace',
}

const detailsStyle: React.CSSProperties = {
  borderTop: '1px solid rgba(255,255,255,0.08)',
  paddingTop: '10px',
}

const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  color: '#a5b4fc',
  fontSize: '13px',
}

const jsonStyle: React.CSSProperties = {
  marginTop: '10px',
  padding: '12px',
  borderRadius: '10px',
  background: '#020617',
  color: '#cbd5e1',
  overflowX: 'auto',
  fontSize: '12px',
}

const preWrapStyle: React.CSSProperties = {
  margin: '8px 0 0',
  whiteSpace: 'pre-wrap',
  color: '#fed7aa',
}


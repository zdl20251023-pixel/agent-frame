import type React from 'react'
import type { ArtifactContent } from './useArtifact.ts'

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
}

export function HandHistoryPanel({ content }: { content: ArtifactContent }) {
  const data = normalizeHandHistoryContent(content.content)
  const gameHand = data.gameHand
  const validation = data.validation
  const players = gameHand?.players ?? []
  const hero = players.find((player) => player.hole_card_list)
  const status = validation?.ok ? 'valid' : 'draft'

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={labelStyle}>Hand History</div>
          <h3 style={titleStyle}>{content.title ?? '牌谱产物'}</h3>
        </div>
        <span style={status === 'valid' ? validBadgeStyle : draftBadgeStyle}>
          {status === 'valid' ? '校验通过' : '待补充 / 待修正'}
        </span>
      </div>

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


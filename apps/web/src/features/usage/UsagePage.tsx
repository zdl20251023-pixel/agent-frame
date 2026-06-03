import { useMemo, useState } from 'react'
import type { UsagePeriod } from './usage.api.ts'
import { useUsageSummary } from './useUsageSummary.ts'

// ============================================================
// UsagePage — Token / 成本统计面板
// ============================================================

const PERIODS: { value: UsagePeriod; label: string }[] = [
  { value: 'day', label: '今日' },
  { value: 'week', label: '近 7 天' },
  { value: 'month', label: '近 30 天' },
]

export function UsagePage() {
  const [period, setPeriod] = useState<UsagePeriod>('day')
  const { summary, loading, error } = useUsageSummary(period)

  const estimatedCost = useMemo(() => `$${(summary?.totalCostUsd ?? 0).toFixed(6)}`, [summary])

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Usage 统计</h1>
          <p style={subtitleStyle}>查看模型调用次数与 Token 使用情况。</p>
        </div>
        <a href="/" style={linkStyle}>返回聊天</a>
      </header>

      <div style={periodRowStyle}>
        {PERIODS.map((item) => (
          <button
            key={item.value}
            onClick={() => setPeriod(item.value)}
            style={{
              ...periodButtonStyle,
              background: period === item.value ? '#6366f1' : 'rgba(255,255,255,0.04)',
              color: period === item.value ? '#fff' : '#d1d5db',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <div style={errorStyle}>⚠ {error}</div>}

      {loading ? (
        <div style={panelStyle}>加载统计中...</div>
      ) : !summary || summary.totalCalls === 0 ? (
        <div style={panelStyle}>
          <h2 style={sectionTitleStyle}>暂无用量数据</h2>
          <p style={mutedStyle}>当前周期内还没有模型调用记录。</p>
        </div>
      ) : (
        <>
          <section style={cardsStyle}>
            <MetricCard label="模型调用" value={summary.totalCalls.toLocaleString()} />
            <MetricCard label="总 Token" value={summary.totalTokens.toLocaleString()} />
            <MetricCard label="输入 Token" value={summary.totalInputTokens.toLocaleString()} />
            <MetricCard label="输出 Token" value={summary.totalOutputTokens.toLocaleString()} />
            <MetricCard label="估算成本" value={estimatedCost} />
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitleStyle}>统计范围</h2>
            <p style={mutedStyle}>周期：{PERIODS.find((item) => item.value === period)?.label}</p>
            <p style={mutedStyle}>起始时间：{new Date(summary.since).toLocaleString('zh-CN')}</p>
          </section>
        </>
      )}
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricCardStyle}>
      <span style={mutedStyle}>{label}</span>
      <strong style={{ fontSize: '28px' }}>{value}</strong>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  padding: '32px',
  background: '#0f1117',
  color: '#e5e7eb',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '24px',
}

const titleStyle: React.CSSProperties = { margin: 0, fontSize: '28px' }
const subtitleStyle: React.CSSProperties = { margin: '8px 0 0', color: '#9ca3af' }
const sectionTitleStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: '16px' }
const mutedStyle: React.CSSProperties = { color: '#9ca3af', fontSize: '13px' }

const periodRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '18px',
}

const periodButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '999px',
  padding: '8px 14px',
  cursor: 'pointer',
}

const cardsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '14px',
  marginBottom: '18px',
}

const metricCardStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  background: 'rgba(255,255,255,0.03)',
  padding: '18px',
}

const panelStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  background: 'rgba(255,255,255,0.03)',
  padding: '18px',
}

const linkStyle: React.CSSProperties = {
  color: '#a5b4fc',
  textDecoration: 'none',
}

const errorStyle: React.CSSProperties = {
  marginBottom: '16px',
  border: '1px solid rgba(248,113,113,0.3)',
  borderRadius: '10px',
  padding: '12px',
  color: '#fecaca',
  background: 'rgba(248,113,113,0.08)',
}

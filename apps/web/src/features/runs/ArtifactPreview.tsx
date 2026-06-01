import { useState, useEffect } from 'react'
import type { Artifact } from '@agent-frame/shared'

// ============================================================
// ArtifactPreview — 展示 Agent 产出的 Artifact 内容
// ============================================================

type ArtifactContent = {
  artifactId: string
  type: string
  title?: string
  version: number
  versionId: string
  content: unknown
  createdAt: string
  updatedAt: string
}

type ArtifactPreviewProps = {
  artifactId: string
  className?: string
}

type ArtifactListProps = {
  runId: string
  className?: string
}

// ─── 单个 Artifact 预览 ────────────────────────────────────

export function ArtifactPreview({ artifactId, className }: ArtifactPreviewProps) {
  const [content, setContent] = useState<ArtifactContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/artifacts/${artifactId}/content`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setContent)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [artifactId])

  if (loading) return <div className="artifact-loading">⏳ 加载产物中...</div>
  if (error) return <div className="artifact-error">⚠️ 产物加载失败: {error}</div>
  if (!content) return null


  return (
    <div className={`artifact-preview ${className ?? ''}`}>
      <div className="artifact-header" onClick={() => setExpanded((v) => !v)}>
        <span className="artifact-icon">{getArtifactIcon(content.type)}</span>
        <span className="artifact-title">{content.title ?? `${content.type} 产物`}</span>
        <span className="artifact-meta">
          v{content.version} · {content.type}
        </span>
        <span className="artifact-toggle">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="artifact-body">
          {renderContent(content)}
        </div>
      )}
    </div>
  )
}

// ─── 渲染内容（根据 type 选择展示方式）──────────────────────

function renderContent(content: ArtifactContent) {
  const raw = content.content

  // summary 类型：展示纯文本
  if (content.type === 'summary') {
    const text =
      typeof raw === 'object' && raw !== null && 'summary' in raw
        ? String((raw as Record<string, unknown>).summary)
        : String(raw)
    return (
      <div className="artifact-text">
        {text.split('\n').map((line, i) => (
          <p key={i}>{line || <br />}</p>
        ))}
      </div>
    )
  }

  // report / outline / code：展示 JSON
  if (content.type === 'code') {
    const code =
      typeof raw === 'object' && raw !== null && 'code' in raw
        ? String((raw as Record<string, unknown>).code)
        : JSON.stringify(raw, null, 2)
    return <pre className="artifact-code">{code}</pre>
  }

  // 通用 JSON 展示
  return (
    <pre className="artifact-json">
      {typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)}
    </pre>
  )
}

function getArtifactIcon(type: string): string {
  const icons: Record<string, string> = {
    summary: '📄',
    report: '📊',
    outline: '📝',
    code: '💻',
    script: '🎬',
    data: '🗃️',
  }
  return icons[type] ?? '📎'
}

// ─── Run 的 Artifact 列表 ─────────────────────────────────

export function RunArtifactList({ runId, className }: ArtifactListProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!runId) return
    fetch(`/api/runs/${runId}/artifacts`)
      .then((r) => r.ok ? r.json() : { artifacts: [] })
      .then((data) => setArtifacts(data.artifacts ?? []))
      .catch(() => setArtifacts([]))
      .finally(() => setLoading(false))
  }, [runId])

  if (loading || artifacts.length === 0) return null

  return (
    <div
      className={`run-artifact-list ${className ?? ''}`}
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '8px',
        margin: '0 12px 16px 12px',
        overflow: 'hidden',
      }}
    >
      <div className="artifact-list-title">
        <span>📎 产物</span>
        <span className="artifact-count">{artifacts.length}</span>
      </div>
      {artifacts.map((a) => (
        <ArtifactPreview key={a.id} artifactId={a.id} />
      ))}
    </div>
  )
}

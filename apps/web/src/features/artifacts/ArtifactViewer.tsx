import { useEffect, useState } from 'react'
import type { ArtifactVersion } from '@agent-frame/shared'
import { useArtifact } from './useArtifact.ts'
import { useArtifactVersions } from './useArtifactVersions.ts'
import type { ArtifactContent } from './useArtifact.ts'
import { HandHistoryPanel } from './HandHistoryPanel.tsx'

// ============================================================
// ArtifactViewer — 完整产物展示组件
//
// 设计依据：FRAMEWORK_DESIGN §15 features/artifacts/
// 职责：
// - 展示产物当前版本内容（根据 type 选择渲染方式）
// - 展示版本历史（版本号、创建时间、diff 摘要）
// - 关联展示来源 Run
// ============================================================

type ArtifactViewerProps = {
  artifactId: string
  /** 默认不展开版本历史 */
  showVersionHistory?: boolean
}

// ─── 主组件 ─────────────────────────────────────────────────

export function ArtifactViewer({ artifactId, showVersionHistory = false }: ArtifactViewerProps) {
  const { artifact, content, loading, error, reload } = useArtifact(artifactId)
  const [expanded, setExpanded] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(showVersionHistory)

  useEffect(() => {
    function handleArtifactVersionCreated(event: Event) {
      const detail = (event as CustomEvent<{ artifactId?: string }>).detail
      if (detail?.artifactId === artifactId) {
        reload()
      }
    }
    window.addEventListener('artifact:version-created', handleArtifactVersionCreated)
    return () => window.removeEventListener('artifact:version-created', handleArtifactVersionCreated)
  }, [artifactId, reload])

  if (loading) {
    return (
      <div className="artifact-viewer artifact-loading">
        <span className="artifact-spinner">⏳</span>
        <span>加载产物中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="artifact-viewer artifact-error">
        <span>⚠️ 产物加载失败: {error}</span>
        <button className="artifact-retry-btn" onClick={reload}>重试</button>
      </div>
    )
  }

  if (!artifact || !content) return null

  return (
    <div className="artifact-viewer">
      {/* 头部：类型图标 + 标题 + 版本 + 折叠控制 */}
      <div
        className="artifact-viewer-header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="artifact-icon" aria-hidden="true">
          {getArtifactIcon(content.type)}
        </span>
        <div className="artifact-header-info">
          <span className="artifact-title">{content.title ?? `${content.type} 产物`}</span>
          <span className="artifact-badge">{content.type}</span>
          <span className="artifact-version-badge">v{content.version}</span>
        </div>
        <div className="artifact-header-actions">
          {/* 版本历史切换 */}
          <button
            className="artifact-history-btn"
            onClick={(e) => {
              e.stopPropagation()
              setHistoryOpen((v) => !v)
            }}
            title="版本历史"
            aria-label="查看版本历史"
          >
            🕐 {historyOpen ? '收起历史' : '版本历史'}
          </button>
          <span className="artifact-toggle" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* 产物内容 */}
      {expanded && (
        <div className="artifact-viewer-body">
          <ArtifactContentRenderer content={content} onRefresh={reload} />
        </div>
      )}

      {/* 版本历史面板 */}
      {historyOpen && (
        <ArtifactVersionHistory artifactId={artifactId} currentVersionId={content.versionId} />
      )}

      {/* 元数据 footer */}
      <div className="artifact-viewer-footer">
        <span className="artifact-meta-item">
          🏃 Run: <code>{artifact.runId.slice(0, 16)}…</code>
        </span>
        <a className="artifact-meta-item" href={`/artifacts/${artifact.id}`}>
          打开详情
        </a>
        <span className="artifact-meta-item">
          🕐 {new Date(artifact.updatedAt).toLocaleString()}
        </span>
      </div>
    </div>
  )
}

// ─── 内容渲染器（按 type 选择展示方式）────────────────────────

function ArtifactContentRenderer({ content, onRefresh }: { content: ArtifactContent; onRefresh?: () => void }) {
  const raw = content.content

  // hand_history：自然语言转牌谱专用展示
  if (content.type === 'hand_history') {
    return <HandHistoryPanel content={content} onRefresh={onRefresh} />
  }

  // summary / report：纯文本段落
  if (content.type === 'summary' || content.type === 'report') {
    const text =
      typeof raw === 'object' && raw !== null && 'summary' in raw
        ? String((raw as Record<string, unknown>).summary)
        : typeof raw === 'object' && raw !== null && 'content' in raw
          ? String((raw as Record<string, unknown>).content)
          : typeof raw === 'string'
            ? raw
            : JSON.stringify(raw, null, 2)

    return (
      <div className="artifact-text-content">
        {text.split('\n').map((line, i) => (
          <p key={i}>{line || <br />}</p>
        ))}
      </div>
    )
  }

  // code：代码块
  if (content.type === 'code') {
    const code =
      typeof raw === 'object' && raw !== null && 'code' in raw
        ? String((raw as Record<string, unknown>).code)
        : typeof raw === 'string'
          ? raw
          : JSON.stringify(raw, null, 2)
    return (
      <pre className="artifact-code-content">
        <code>{code}</code>
      </pre>
    )
  }

  // outline：结构化大纲（JSON array）
  if (content.type === 'outline' && Array.isArray(raw)) {
    return (
      <ol className="artifact-outline-content">
        {(raw as unknown[]).map((item, i) => (
          <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
        ))}
      </ol>
    )
  }

  // 通用：JSON 展示
  return (
    <pre className="artifact-json-content">
      {typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)}
    </pre>
  )
}

// ─── 版本历史面板 ─────────────────────────────────────────────

function ArtifactVersionHistory({
  artifactId,
  currentVersionId,
}: {
  artifactId: string
  currentVersionId: string
}) {
  const { versions, loading, error } = useArtifactVersions(artifactId)

  if (loading) {
    return <div className="artifact-history-loading">⏳ 加载版本历史...</div>
  }

  if (error) {
    return <div className="artifact-history-error">⚠️ 加载版本历史失败</div>
  }

  if (versions.length === 0) {
    return <div className="artifact-history-empty">暂无版本历史</div>
  }

  return (
    <div className="artifact-history-panel">
      <div className="artifact-history-title">📜 版本历史</div>
      <div className="artifact-history-list">
        {[...versions].reverse().map((v) => (
          <ArtifactVersionRow
            key={v.id}
            version={v}
            isCurrent={v.id === currentVersionId}
          />
        ))}
      </div>
    </div>
  )
}

function ArtifactVersionRow({
  version,
  isCurrent,
}: {
  version: ArtifactVersion
  isCurrent: boolean
}) {
  return (
    <div className={`artifact-version-row ${isCurrent ? 'artifact-version-current' : ''}`}>
      <div className="artifact-version-row-left">
        <span className="artifact-version-number">v{version.version}</span>
        {isCurrent && <span className="artifact-version-current-badge">当前</span>}
      </div>
      <div className="artifact-version-row-right">
        <span className="artifact-version-time">
          {new Date(version.createdAt).toLocaleString()}
        </span>
        {(version as ArtifactVersion & { diffSummary?: string }).diffSummary && (
          <span className="artifact-version-diff">
            {(version as ArtifactVersion & { diffSummary?: string }).diffSummary}
          </span>
        )}
        <span className="artifact-version-run">
          <code>{version.createdByRunId?.slice(0, 12)}…</code>
        </span>
      </div>
    </div>
  )
}

// ─── 工具函数 ──────────────────────────────────────────────

function getArtifactIcon(type: string): string {
  const icons: Record<string, string> = {
    summary: '📄',
    report: '📊',
    outline: '📝',
    code: '💻',
    script: '🎬',
    data: '🗃️',
    research_report: '🔬',
    hand_history: '🃏',
    analysis: '🧠',
  }
  return icons[type] ?? '📎'
}

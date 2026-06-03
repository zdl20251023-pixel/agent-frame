import { useState, useEffect } from 'react'
import type { Artifact } from '@agent-frame/shared'
import { get } from '../../lib/http.ts'
import { ArtifactViewer } from './ArtifactViewer.tsx'

// ============================================================
// ArtifactList — 展示某个 Run 关联的所有产物
//
// 设计依据：FRAMEWORK_DESIGN §15 features/artifacts/
// 对应 API：GET /runs/:runId/artifacts
// 职责：
// - 拉取 Run 的所有 Artifact 列表
// - 每个 Artifact 展示为可折叠的 ArtifactViewer
// ============================================================

type ArtifactListProps = {
  runId: string
  className?: string
}

export function ArtifactList({ runId, className }: ArtifactListProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    setLoading(true)

    get<{ runId: string; artifacts: Artifact[]; total: number }>(`/runs/${runId}/artifacts`)
      .then((data) => {
        if (!cancelled) setArtifacts(data.artifacts ?? [])
      })
      .catch(() => {
        if (!cancelled) setArtifacts([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [runId])

  if (loading || artifacts.length === 0) return null

  return (
    <div className={`artifact-list ${className ?? ''}`}>
      <div className="artifact-list-header">
        <span className="artifact-list-title">📎 产物</span>
        <span className="artifact-list-count">{artifacts.length}</span>
      </div>
      <div className="artifact-list-items">
        {artifacts.map((artifact) => (
          <ArtifactViewer
            key={artifact.id}
            artifactId={artifact.id}
          />
        ))}
      </div>
    </div>
  )
}

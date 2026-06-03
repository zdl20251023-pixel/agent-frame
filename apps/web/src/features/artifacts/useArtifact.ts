import { useState, useEffect } from 'react'
import type { Artifact } from '@agent-frame/shared'
import { get } from '../../lib/http.ts'

// ============================================================
// useArtifact — 加载单个 Artifact 元数据 + 当前版本内容
// 符合 FRAMEWORK_DESIGN §15：features/artifacts/ 独立 feature
// ============================================================

export type ArtifactContent = {
  artifactId: string
  type: string
  title?: string
  version: number
  versionId: string
  content: unknown
  createdAt: string
  updatedAt: string
}

export type UseArtifactResult = {
  artifact: Artifact | null
  content: ArtifactContent | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useArtifact(artifactId: string): UseArtifactResult {
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [content, setContent] = useState<ArtifactContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!artifactId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      get<Artifact>(`/artifacts/${artifactId}`),
      get<ArtifactContent>(`/artifacts/${artifactId}/content`),
    ])
      .then(([a, c]) => {
        if (cancelled) return
        setArtifact(a)
        setContent(c)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [artifactId, tick])

  return { artifact, content, loading, error, reload: () => setTick((t) => t + 1) }
}

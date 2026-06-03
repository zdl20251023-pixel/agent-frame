import { useState, useEffect } from 'react'
import type { ArtifactVersion } from '@agent-frame/shared'
import { get } from '../../lib/http.ts'

// ============================================================
// useArtifactVersions — 加载 Artifact 历史版本列表
// ============================================================

export type UseArtifactVersionsResult = {
  versions: ArtifactVersion[]
  total: number
  loading: boolean
  error: string | null
}

export function useArtifactVersions(artifactId: string): UseArtifactVersionsResult {
  const [versions, setVersions] = useState<ArtifactVersion[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!artifactId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    get<{ artifactId: string; versions: ArtifactVersion[]; total: number }>(
      `/artifacts/${artifactId}/versions`,
    )
      .then((data) => {
        if (cancelled) return
        setVersions(data.versions ?? [])
        setTotal(data.total ?? 0)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [artifactId])

  return { versions, total, loading, error }
}

import { useState } from 'react'
import { useRunEvents } from './useRunEvents.ts'
import { RunTimeline } from './RunTimeline.tsx'
import { RunArtifactList } from './ArtifactPreview.tsx'
import { cancelRun } from './runs.api.ts'

type Props = {
  runId: string
  userMessage: string
}

export function RunMessageItem({ runId, userMessage }: Props) {
  const { events, isConnected, isTerminated, fullText } = useRunEvents(runId)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  async function handleCancelRun() {
    if (isCancelling || isTerminated) return
    setCancelError(null)
    setIsCancelling(true)
    try {
      await cancelRun(runId)
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : '中断失败')
      setIsCancelling(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {isConnected && !isTerminated && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px 0',
          }}
        >
          {cancelError && (
            <span style={{ color: '#fca5a5', fontSize: '12px' }}>
              {cancelError}
            </span>
          )}
          <button
            type="button"
            onClick={handleCancelRun}
            disabled={isCancelling}
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              border: '1px solid rgba(248,113,113,0.45)',
              background: isCancelling ? 'rgba(127,29,29,0.35)' : 'rgba(239,68,68,0.12)',
              color: '#fecaca',
              fontSize: '12px',
              cursor: isCancelling ? 'not-allowed' : 'pointer',
            }}
          >
            {isCancelling ? '正在中断...' : '中断运行'}
          </button>
        </div>
      )}

      {/* 上部分：时间线 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <RunTimeline
          userMessage={userMessage}
          events={events}
          isConnected={isConnected}
          isTerminated={isTerminated}
          fullText={fullText}
          runId={runId}
        />
      </div>

      {/* 下部分：产物（如果有） */}
      {isTerminated && (
        <RunArtifactList runId={runId} />
      )}
    </div>
  )
}

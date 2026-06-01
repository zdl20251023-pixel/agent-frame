import { useRunEvents } from './useRunEvents.ts'
import { RunTimeline } from './RunTimeline.tsx'
import { RunArtifactList } from './ArtifactPreview.tsx'

type Props = {
  runId: string
  userMessage: string
}

export function RunMessageItem({ runId, userMessage }: Props) {
  const { events, isConnected, isTerminated, fullText } = useRunEvents(runId)

  return (
    <div style={{ display: 'flex', width: '100%' }}>
      {/* 左侧：时间线 */}
      <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <RunTimeline
          userMessage={userMessage}
          events={events}
          isConnected={isConnected}
          isTerminated={isTerminated}
          fullText={fullText}
          runId={runId}
        />
      </div>

      {/* 右侧：产物（如果有） */}
      {isTerminated && (
        <RunArtifactList runId={runId} />
      )}
    </div>
  )
}

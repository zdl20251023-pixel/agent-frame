import { useWorkflowRuns } from './useWorkflowRuns.ts'
import type { WorkflowRun, WorkflowRunStatus, WorkflowStageRun } from './workflows.api.ts'
import { approveHumanGate } from './workflows.api.ts'
import { useState } from 'react'

// ──────────────────────────────────────────────────────────
// WorkflowsPage — Workflow 进度展示页
// 对应 PERFECTION_PLAN §5.4
// ──────────────────────────────────────────────────────────

const STATUS_LABEL: Record<WorkflowRunStatus, string> = {
  pending: '等待中',
  running: '执行中',
  waiting_human: '等待审核',
  completed: '已完成',
  failed: '失败',
}

const STATUS_CLASS: Record<WorkflowRunStatus, string> = {
  pending: 'status--pending',
  running: 'status--running',
  completed: 'status--completed',
  failed: 'status--failed',
  waiting_human: 'status--human',
}

function StageProgress({ stages }: { stages: WorkflowStageRun[] }) {
  return (
    <div className="stage-progress">
      {stages.map((stage, i) => (
        <div key={stage.stageId} className={`stage-step stage-step--${stage.status}`}>
          <div className="stage-step__dot" />
          {i < stages.length - 1 && <div className="stage-step__line" />}
          <div className="stage-step__info">
            <span className="stage-step__id">{stage.stageId}</span>
            {stage.agentId && <span className="stage-step__agent">{stage.agentId}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function WorkflowRunCard({
  run,
  onApprove,
}: {
  run: WorkflowRun
  onApprove: (runId: string, stageId: string) => void
}) {
  const waitingStage = run.stages.find((s) => s.status === 'waiting_human')
  const createdAt = new Date(run.createdAt).toLocaleString('zh-CN', { hour12: false })

  return (
    <div className={`workflow-run-card workflow-run-card--${run.status}`}>
      <div className="workflow-run-card__header">
        <div className="workflow-run-card__id-block">
          <span className="workflow-run-card__workflow-id">{run.workflowId}</span>
          <span className="workflow-run-card__run-id">{run.id.slice(-8)}</span>
        </div>
        <div className="workflow-run-card__right">
          <span className={`wf-status-badge ${STATUS_CLASS[run.status]}`}>
            {STATUS_LABEL[run.status]}
          </span>
          <span className="workflow-run-card__time">{createdAt}</span>
        </div>
      </div>

      {/* 阶段进度 */}
      {run.stages.length > 0 && <StageProgress stages={run.stages} />}

      {/* 等待人工审核时的操作按钮 */}
      {run.status === 'waiting_human' && waitingStage && (
        <div className="workflow-run-card__approval">
          <p className="workflow-run-card__approval-hint">
            阶段 <strong>{waitingStage.stageId}</strong> 需要人工审核
          </p>
          <button
            className="btn btn--approve"
            onClick={() => onApprove(run.id, waitingStage.stageId)}
          >
            ✓ 批准通过
          </button>
        </div>
      )}
    </div>
  )
}

export function WorkflowsPage() {
  const { runs, loading, error, refresh } = useWorkflowRuns()
  const [approving, setApproving] = useState<string | null>(null)

  async function handleApprove(runId: string, stageId: string) {
    setApproving(`${runId}-${stageId}`)
    try {
      await approveHumanGate(runId, stageId)
      await refresh()
    } catch (err) {
      console.error('Approve failed:', err)
    } finally {
      setApproving(null)
    }
  }

  const byStatus: Record<WorkflowRunStatus, WorkflowRun[]> = {
    running: [],
    waiting_human: [],
    pending: [],
    completed: [],
    failed: [],
  }

  runs.forEach((r) => {
    byStatus[r.status]?.push(r)
  })

  const activeCounts = byStatus.running.length + byStatus.waiting_human.length

  return (
    <div className="workflows-page">
      <div className="workflows-page__header">
        <h1 className="workflows-page__title">Workflow 执行中心</h1>
        <p className="workflows-page__subtitle">查看任务流进度，处理人工审核节点</p>
        <button className="btn btn--refresh" onClick={refresh}>
          ↻ 刷新
        </button>
      </div>

      {loading && (
        <div className="workflows-page__loading">
          <div className="spinner" />
          加载 Workflow 执行记录...
        </div>
      )}

      {error && (
        <div className="workflows-page__error">⚠ {error}</div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="workflows-page__empty">
          <div className="workflows-page__empty-icon">◈</div>
          <p>暂无 Workflow 执行记录</p>
          <p className="workflows-page__empty-hint">通过聊天触发 Workflow，记录将在此展示</p>
        </div>
      )}

      {/* 活跃任务区 */}
      {activeCounts > 0 && (
        <section className="wf-section">
          <div className="wf-section__title">
            活跃 <span className="wf-section__count">{activeCounts}</span>
          </div>
          <div className="wf-runs-list">
            {[...byStatus.running, ...byStatus.waiting_human].map((run) => (
              <WorkflowRunCard key={run.id} run={run} onApprove={handleApprove} />
            ))}
          </div>
        </section>
      )}

      {/* 历史记录 */}
      {(byStatus.completed.length > 0 || byStatus.failed.length > 0) && (
        <section className="wf-section">
          <div className="wf-section__title">历史记录</div>
          <div className="wf-runs-list">
            {[...byStatus.completed, ...byStatus.failed].map((run) => (
              <WorkflowRunCard key={run.id} run={run} onApprove={handleApprove} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

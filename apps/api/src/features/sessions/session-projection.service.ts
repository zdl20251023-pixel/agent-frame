import type { SessionProjection } from '@agent-frame/shared'
import { RUN_STATUS, TOOL_INVOCATION_STATUS } from '@agent-frame/shared'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import type { SessionsRepository } from '../sessions/sessions.repository.js'
import { agentTaskStore } from '../../queues/agent-task.store.js'
import { now } from '../../shared/utils/id.js'

// ============================================================
// SessionProjectionService — 会话级统一状态投影
// 前端单一数据源：activeRuns + toolInvocations + artifacts + pendingTasks
// ============================================================

export class SessionProjectionService {
  constructor(
    private readonly runStore: RunStore,
    private readonly artifactStore: ArtifactStore,
    private readonly sessionsRepo: SessionsRepository,
  ) {}

  async build(sessionId: string, userId: string): Promise<SessionProjection> {
    const [runs, activeHandHistory] = await Promise.all([
      this.runStore.listRunsBySession(sessionId, userId),
      this.sessionsRepo.getActiveHandHistory(sessionId),
    ])

    const activeRuns = runs
      .filter((run) => run.status === RUN_STATUS.QUEUED || run.status === RUN_STATUS.RUNNING)
      .map((run) => ({
        runId: run.id,
        traceId: run.traceId,
        agentId: run.agentId,
        status: run.status,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      }))

    const toolInvocations = []
    for (const run of runs.slice(-20)) {
      const items = await this.runStore.listToolInvocations(run.id)
      for (const item of items) {
        toolInvocations.push({
          id: item.id,
          runId: item.runId,
          toolName: item.toolName,
          status: item.status,
          phase: item.phase,
          artifactRef: item.outputRef,
          taskRef: undefined,
          errorCode: item.errorCode,
          errorMessage: item.errorMessage,
          retryCount: item.retryCount,
          updatedAt: item.updatedAt,
        })
      }
    }

    const artifactMap = new Map<string, SessionProjection['artifacts'][number]>()
    for (const run of runs.slice(-20)) {
      const artifacts = await this.artifactStore.listArtifactsByRun(run.id)
      for (const artifact of artifacts) {
        const versions = await this.artifactStore.listVersions(artifact.id)
        const invocations = await this.runStore.listToolInvocations(run.id)
        const repairInvocation = invocations.find(
          (inv) =>
            inv.outputRef === artifact.id &&
            (inv.status === TOOL_INVOCATION_STATUS.WAITING_REPAIR ||
              inv.status === TOOL_INVOCATION_STATUS.RUNNING),
        )
        artifactMap.set(artifact.id, {
          artifactId: artifact.id,
          type: artifact.type,
          title: artifact.title,
          currentVersionId: artifact.currentVersionId,
          status: repairInvocation?.status,
          repairState: mapRepairState(repairInvocation?.status),
          versionCount: versions.length,
          updatedAt: artifact.updatedAt,
        })
      }
    }

    const pendingTasks = []
    if (process.env.DATABASE_URL) {
      for (const run of runs.slice(-10)) {
        const tasks = await agentTaskStore.findByParentRunId(run.id)
        for (const task of tasks) {
          if (task.status === 'queued' || task.status === 'running' || task.status === 'failed') {
            pendingTasks.push({
              id: task.id,
              parentRunId: task.parentRunId,
              toAgentId: task.toAgentId,
              type: typeof task.input === 'object' && task.input && 'type' in task.input
                ? String((task.input as { type?: unknown }).type)
                : undefined,
              status: task.status,
              retryCount: task.retryCount,
              maxRetries: task.maxRetries,
              errorSummary: task.error?.message,
              updatedAt: task.updatedAt,
            })
          }
        }
      }
    }

    return {
      sessionId,
      activeRuns,
      toolInvocations,
      artifacts: [...artifactMap.values()],
      pendingTasks,
      activeHandHistory: activeHandHistory
        ? {
            artifactId: activeHandHistory.artifactId,
            versionId: activeHandHistory.versionId,
            status: activeHandHistory.status,
          }
        : undefined,
      generatedAt: now(),
    }
  }
}

function mapRepairState(
  status?: string,
): SessionProjection['artifacts'][number]['repairState'] {
  if (!status) return 'none'
  if (status === TOOL_INVOCATION_STATUS.WAITING_REPAIR) return 'queued'
  if (status === TOOL_INVOCATION_STATUS.RUNNING) return 'running'
  if (status === TOOL_INVOCATION_STATUS.SUCCEEDED) return 'completed'
  if (status === TOOL_INVOCATION_STATUS.FAILED || status === TOOL_INVOCATION_STATUS.TIMED_OUT) {
    return 'failed'
  }
  return 'none'
}

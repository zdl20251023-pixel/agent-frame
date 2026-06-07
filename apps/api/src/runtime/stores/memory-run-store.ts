import type {
  Run,
  RunStatus,
  Step,
  AgentEvent,
  StoredAgentEvent,
  RunCheckpointPayload,
  CreateRunInput,
  CreateStepInput,
  UpdateStepInput,
  ToolInvocation,
  CreateToolInvocationInput,
  UpdateToolInvocationInput,
} from '@agent-frame/shared'
import { RUN_STATUS, STEP_STATUS, TOOL_INVOCATION_PHASE, TOOL_INVOCATION_STATUS } from '@agent-frame/shared'
import type { RunStore } from './run-store.js'
import { now } from '../../shared/utils/id.js'

// ============================================================
// 内存 RunStore 实现
// 用于开发调试和单元测试
// ============================================================

export class MemoryRunStore implements RunStore {
  private runs = new Map<string, Run>()
  private runsByIdempotency = new Map<string, string>()
  private steps = new Map<string, Step>()
  private stepsByRun = new Map<string, string[]>()
  private storedEvents = new Map<string, StoredAgentEvent[]>()
  private eventIdCounter = 1
  private toolInvocations = new Map<string, ToolInvocation>()
  private toolInvocationByIdempotency = new Map<string, string>()
  private toolInvocationsByRun = new Map<string, string[]>()

  async createRun(input: CreateRunInput & { id: string }): Promise<Run> {
    if (input.idempotencyKey) {
      const existing = await this.getRunByIdempotencyKey(input.idempotencyKey, input.userId)
      if (existing) return existing
    }

    const run: Run = {
      id: input.id,
      traceId: input.traceId,
      userId: input.userId,
      projectId: input.projectId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      status: RUN_STATUS.QUEUED,
      input: input.input,
      idempotencyKey: input.idempotencyKey,
      createdAt: now(),
      updatedAt: now(),
    }
    this.runs.set(run.id, run)
    if (input.idempotencyKey) {
      this.runsByIdempotency.set(`${input.userId ?? ''}:${input.idempotencyKey}`, run.id)
    }
    this.storedEvents.set(run.id, [])
    return run
  }

  async getRun(runId: string): Promise<Run | null> {
    return this.runs.get(runId) ?? null
  }

  async getRunByIdempotencyKey(idempotencyKey: string, userId?: string): Promise<Run | null> {
    const runId = this.runsByIdempotency.get(`${userId ?? ''}:${idempotencyKey}`)
    return runId ? this.runs.get(runId) ?? null : null
  }

  async updateRunCheckpoint(runId: string, checkpoint: RunCheckpointPayload): Promise<void> {
    const run = this.runs.get(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    this.runs.set(runId, { ...run, checkpointPayload: checkpoint, updatedAt: now() })
  }

  async listStaleRuns(options: {
    staleBefore: string
    statuses: RunStatus[]
    limit?: number
  }): Promise<Run[]> {
    const staleMs = Date.parse(options.staleBefore)
    return [...this.runs.values()]
      .filter((run) => {
        if (!options.statuses.includes(run.status)) return false
        return Date.parse(run.updatedAt) <= staleMs
      })
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, options.limit ?? 50)
  }

  async listActiveRunsBySession(sessionId: string, userId: string): Promise<Run[]> {
    return [...this.runs.values()]
      .filter(
        (run) =>
          run.sessionId === sessionId &&
          run.userId === userId &&
          (run.status === RUN_STATUS.QUEUED || run.status === RUN_STATUS.RUNNING),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async updateRunStatus(
    runId: string,
    status: RunStatus,
    options?: { output?: unknown; error?: unknown },
  ): Promise<void> {
    const run = this.runs.get(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    this.runs.set(runId, {
      ...run,
      status,
      output: options?.output ?? run.output,
      error: options?.error as Run['error'] ?? run.error,
      updatedAt: now(),
    })
  }

  async listRuns(limit = 20): Promise<Run[]> {
    return [...this.runs.values()]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-limit)
  }

  async listRunsByUser(userId: string, limit = 20): Promise<Run[]> {
    return [...this.runs.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  async listRunsBySession(sessionId: string, userId: string): Promise<Run[]> {
    return [...this.runs.values()]
      .filter((r) => r.sessionId === sessionId && r.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async createStep(input: CreateStepInput): Promise<Step> {
    const step: Step = {
      id: input.id,
      runId: input.runId,
      parentStepId: input.parentStepId,
      type: input.type,
      status: STEP_STATUS.RUNNING,
      agentId: input.agentId,
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      input: input.input,
      startedAt: now(),
    }
    this.steps.set(step.id, step)
    const list = this.stepsByRun.get(step.runId) ?? []
    list.push(step.id)
    this.stepsByRun.set(step.runId, list)
    return step
  }

  async updateStep(stepId: string, update: UpdateStepInput): Promise<void> {
    const step = this.steps.get(stepId)
    if (!step) throw new Error(`Step not found: ${stepId}`)
    this.steps.set(stepId, {
      ...step,
      ...update,
      endedAt: update.endedAt ?? (update.status !== STEP_STATUS.RUNNING ? now() : step.endedAt),
    })
  }

  async getStep(stepId: string): Promise<Step | null> {
    return this.steps.get(stepId) ?? null
  }

  async listSteps(runId: string): Promise<Step[]> {
    const ids = this.stepsByRun.get(runId) ?? []
    return ids.map((id) => this.steps.get(id)!).filter(Boolean)
  }

  async appendEvent(runId: string, event: AgentEvent): Promise<number | undefined> {
    const list = this.storedEvents.get(runId) ?? []
    const id = this.eventIdCounter++
    list.push({ id, event, createdAt: now() })
    this.storedEvents.set(runId, list)
    return id
  }

  async listEvents(runId: string): Promise<AgentEvent[]> {
    return (this.storedEvents.get(runId) ?? []).map((item) => item.event)
  }

  async listStoredEvents(runId: string): Promise<StoredAgentEvent[]> {
    return this.storedEvents.get(runId) ?? []
  }

  async listEventsAfter(runId: string, afterEventId: number): Promise<StoredAgentEvent[]> {
    return (this.storedEvents.get(runId) ?? []).filter((item) => item.id > afterEventId)
  }

  async createToolInvocation(input: CreateToolInvocationInput): Promise<ToolInvocation> {
    const existingId = this.toolInvocationByIdempotency.get(input.idempotencyKey)
    if (existingId) {
      const existing = this.toolInvocations.get(existingId)
      if (existing) return existing
    }

    const ts = now()
    const invocation: ToolInvocation = {
      id: input.id,
      runId: input.runId,
      stepId: input.stepId,
      toolName: input.toolName,
      idempotencyKey: input.idempotencyKey,
      status: TOOL_INVOCATION_STATUS.PENDING,
      phase: TOOL_INVOCATION_PHASE.CREATED,
      inputHash: input.inputHash,
      inputPreview: input.inputPreview,
      retryCount: 0,
      createdAt: ts,
      updatedAt: ts,
    }
    this.toolInvocations.set(invocation.id, invocation)
    this.toolInvocationByIdempotency.set(invocation.idempotencyKey, invocation.id)
    const list = this.toolInvocationsByRun.get(invocation.runId) ?? []
    list.push(invocation.id)
    this.toolInvocationsByRun.set(invocation.runId, list)
    return invocation
  }

  async getToolInvocation(invocationId: string): Promise<ToolInvocation | null> {
    return this.toolInvocations.get(invocationId) ?? null
  }

  async getToolInvocationByIdempotencyKey(idempotencyKey: string): Promise<ToolInvocation | null> {
    const id = this.toolInvocationByIdempotency.get(idempotencyKey)
    return id ? this.toolInvocations.get(id) ?? null : null
  }

  async updateToolInvocation(invocationId: string, update: UpdateToolInvocationInput): Promise<void> {
    const invocation = this.toolInvocations.get(invocationId)
    if (!invocation) throw new Error(`ToolInvocation not found: ${invocationId}`)
    const ts = now()
    this.toolInvocations.set(invocationId, {
      ...invocation,
      ...update,
      startedAt: invocation.startedAt ?? (update.status === TOOL_INVOCATION_STATUS.RUNNING ? ts : undefined),
      updatedAt: ts,
    })
  }

  async listToolInvocations(runId: string): Promise<ToolInvocation[]> {
    const ids = this.toolInvocationsByRun.get(runId) ?? []
    return ids.map((id) => this.toolInvocations.get(id)!).filter(Boolean)
  }

  async listRecoverableToolInvocations(options: { staleBefore: string; limit?: number }): Promise<ToolInvocation[]> {
    const staleMs = Date.parse(options.staleBefore)
    const limit = options.limit ?? 50
    return [...this.toolInvocations.values()]
      .filter((invocation) => {
        if (invocation.status !== TOOL_INVOCATION_STATUS.RUNNING) return false
        const heartbeat = Date.parse(invocation.heartbeatAt ?? invocation.updatedAt)
        return Number.isFinite(heartbeat) && heartbeat <= staleMs
      })
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, limit)
  }

  async listWaitingRepairToolInvocations(options: { limit?: number }): Promise<ToolInvocation[]> {
    return [...this.toolInvocations.values()]
      .filter((invocation) => invocation.status === TOOL_INVOCATION_STATUS.WAITING_REPAIR)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, options.limit ?? 50)
  }
}

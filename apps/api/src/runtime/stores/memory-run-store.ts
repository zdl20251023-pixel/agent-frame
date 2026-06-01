import type { Run, RunStatus, Step, AgentEvent, CreateRunInput, CreateStepInput, UpdateStepInput } from '@agent-frame/shared'
import type { RunStore } from './run-store.js'
import { now } from '../../shared/utils/id.js'

// ============================================================
// 内存 RunStore 实现
// 用于开发调试和单元测试
// ============================================================

export class MemoryRunStore implements RunStore {
  private runs = new Map<string, Run>()
  private steps = new Map<string, Step>()
  private stepsByRun = new Map<string, string[]>()     // runId -> stepIds
  private events = new Map<string, AgentEvent[]>()     // runId -> events

  async createRun(input: CreateRunInput & { id: string }): Promise<Run> {
    const run: Run = {
      id: input.id,
      traceId: input.traceId,
      userId: input.userId,
      projectId: input.projectId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      status: 'queued',
      input: input.input,
      createdAt: now(),
      updatedAt: now(),
    }
    this.runs.set(run.id, run)
    this.events.set(run.id, [])
    return run
  }

  async getRun(runId: string): Promise<Run | null> {
    return this.runs.get(runId) ?? null
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
    return [...this.runs.values()].slice(-limit)
  }

  async createStep(input: CreateStepInput): Promise<Step> {
    const step: Step = {
      id: input.id,
      runId: input.runId,
      parentStepId: input.parentStepId,
      type: input.type,
      status: 'running',
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
      endedAt: update.endedAt ?? (update.status !== 'running' ? now() : step.endedAt),
    })
  }

  async getStep(stepId: string): Promise<Step | null> {
    return this.steps.get(stepId) ?? null
  }

  async listSteps(runId: string): Promise<Step[]> {
    const ids = this.stepsByRun.get(runId) ?? []
    return ids.map((id) => this.steps.get(id)!).filter(Boolean)
  }

  async appendEvent(runId: string, event: AgentEvent): Promise<void> {
    const list = this.events.get(runId) ?? []
    list.push(event)
    this.events.set(runId, list)
  }

  async listEvents(runId: string): Promise<AgentEvent[]> {
    return this.events.get(runId) ?? []
  }
}

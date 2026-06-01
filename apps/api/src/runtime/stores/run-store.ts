import type { Run, RunStatus, Step, AgentEvent, CreateRunInput, CreateStepInput, UpdateStepInput } from '@agent-frame/shared'

// ============================================================
// RunStore 接口
// MVP 先用内存实现，后续替换为 MySQLRunStore
// ============================================================

export interface RunStore {
  // Run 操作
  createRun(input: CreateRunInput & { id: string }): Promise<Run>
  getRun(runId: string): Promise<Run | null>
  updateRunStatus(
    runId: string,
    status: RunStatus,
    options?: { output?: unknown; error?: unknown }
  ): Promise<void>
  listRuns(limit?: number): Promise<Run[]>

  // Step 操作
  createStep(input: CreateStepInput): Promise<Step>
  updateStep(stepId: string, update: UpdateStepInput): Promise<void>
  getStep(stepId: string): Promise<Step | null>
  listSteps(runId: string): Promise<Step[]>

  // Event 操作
  appendEvent(runId: string, event: AgentEvent): Promise<void>
  listEvents(runId: string): Promise<AgentEvent[]>
}

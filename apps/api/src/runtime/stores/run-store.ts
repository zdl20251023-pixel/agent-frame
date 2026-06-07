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

// ============================================================
// RunStore 接口
// 生产环境必须使用 MySQLRunStore；MemoryRunStore 仅用于测试。
// ============================================================

export interface RunStore {
  // Run 操作
  createRun(input: CreateRunInput & { id: string }): Promise<Run>
  getRun(runId: string): Promise<Run | null>
  getRunByIdempotencyKey(idempotencyKey: string, userId?: string): Promise<Run | null>
  updateRunStatus(
    runId: string,
    status: RunStatus,
    options?: { output?: unknown; error?: unknown },
  ): Promise<void>
  updateRunCheckpoint(runId: string, checkpoint: RunCheckpointPayload): Promise<void>
  listRuns(limit?: number): Promise<Run[]>
  listRunsByUser(userId: string, limit?: number): Promise<Run[]>
  listRunsBySession(sessionId: string, userId: string): Promise<Run[]>
  listStaleRuns(options: {
    staleBefore: string
    statuses: RunStatus[]
    limit?: number
  }): Promise<Run[]>
  listActiveRunsBySession(sessionId: string, userId: string): Promise<Run[]>

  // Step 操作
  createStep(input: CreateStepInput): Promise<Step>
  updateStep(stepId: string, update: UpdateStepInput): Promise<void>
  getStep(stepId: string): Promise<Step | null>
  listSteps(runId: string): Promise<Step[]>

  // Event 操作
  appendEvent(runId: string, event: AgentEvent): Promise<number | undefined>
  listEvents(runId: string): Promise<AgentEvent[]>
  listEventsAfter(runId: string, afterEventId: number): Promise<StoredAgentEvent[]>
  listStoredEvents(runId: string): Promise<StoredAgentEvent[]>

  // ToolInvocation 操作
  createToolInvocation(input: CreateToolInvocationInput): Promise<ToolInvocation>
  getToolInvocation(invocationId: string): Promise<ToolInvocation | null>
  getToolInvocationByIdempotencyKey(idempotencyKey: string): Promise<ToolInvocation | null>
  updateToolInvocation(invocationId: string, update: UpdateToolInvocationInput): Promise<void>
  listToolInvocations(runId: string): Promise<ToolInvocation[]>
  listRecoverableToolInvocations(options: {
    staleBefore: string
    limit?: number
  }): Promise<ToolInvocation[]>
  listWaitingRepairToolInvocations(options: { limit?: number }): Promise<ToolInvocation[]>
}

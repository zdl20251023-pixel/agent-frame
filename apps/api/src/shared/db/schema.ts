import {
  mysqlTable,
  varchar,
  datetime,
  json,
  int,
  bigint,
  text,
  decimal,
  uniqueIndex,
  index,
} from 'drizzle-orm/mysql-core'

// ============================================================
// Drizzle ORM MySQL Schema
// 所有表使用 InnoDB + utf8mb4
// ============================================================

// ─── users 表 ────────────────────────────────────────────────
export const users = mysqlTable(
  'users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    username: varchar('username', { length: 80 }),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_users_email').on(table.email),
    uniqueIndex('uq_users_username').on(table.username),
  ],
)

// ─── chat_sessions 表 ─────────────────────────────────────────
export const chatSessions = mysqlTable(
  'chat_sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    title: varchar('title', { length: 255 }),
    metadata: json('metadata'),
    deletedAt: datetime('deleted_at', { mode: 'string', fsp: 3 }),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_chat_sessions_user_id').on(table.userId),
    index('idx_chat_sessions_updated_at').on(table.updatedAt),
  ],
)

// ─── runs 表 ─────────────────────────────────────────────────
export const runs = mysqlTable(
  'runs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    traceId: varchar('trace_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 }),
    projectId: varchar('project_id', { length: 36 }),
    agentId: varchar('agent_id', { length: 100 }),
    sessionId: varchar('session_id', { length: 36 }),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    input: json('input').notNull(),
    output: json('output'),
    error: json('error'),
    idempotencyKey: varchar('idempotency_key', { length: 160 }),
    checkpointPayload: json('checkpoint_payload'),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_status').on(table.status),
    index('idx_user_id').on(table.userId),
    index('idx_trace_id').on(table.traceId),
    index('idx_session_id').on(table.sessionId),
    uniqueIndex('uq_runs_idempotency_user').on(table.idempotencyKey, table.userId),
  ],
)

// ─── steps 表 ─────────────────────────────────────────────────
export const steps = mysqlTable(
  'steps',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    runId: varchar('run_id', { length: 36 }).notNull(),
    parentStepId: varchar('parent_step_id', { length: 36 }),
    type: varchar('type', { length: 30 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('running'),
    agentId: varchar('agent_id', { length: 100 }),
    fromAgentId: varchar('from_agent_id', { length: 100 }),
    toAgentId: varchar('to_agent_id', { length: 100 }),
    input: json('input'),
    output: json('output'),
    error: json('error'),
    startedAt: datetime('started_at', { mode: 'string', fsp: 3 }).notNull(),
    endedAt: datetime('ended_at', { mode: 'string', fsp: 3 }),
  },
  (table) => [index('idx_run_id').on(table.runId)],
)

// ─── run_events 表 ────────────────────────────────────────────
export const runEvents = mysqlTable(
  'run_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    runId: varchar('run_id', { length: 36 }).notNull(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    eventData: json('event_data').notNull(),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_run_id').on(table.runId),
    index('idx_event_type').on(table.eventType),
  ],
)

// ─── tool_invocations 表 ───────────────────────────────────────
// 保存一次 Tool 调用的可恢复执行状态；事件只是该状态的前端投影。
export const toolInvocations = mysqlTable(
  'tool_invocations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    runId: varchar('run_id', { length: 36 }).notNull(),
    stepId: varchar('step_id', { length: 36 }).notNull(),
    toolName: varchar('tool_name', { length: 100 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
    status: varchar('status', { length: 30 }).notNull().default('pending'),
    phase: varchar('phase', { length: 40 }).notNull().default('created'),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    inputPreview: json('input_preview'),
    recoveryPayload: json('recovery_payload'),
    outputRef: varchar('output_ref', { length: 160 }),
    errorCode: varchar('error_code', { length: 80 }),
    errorMessage: text('error_message'),
    startedAt: datetime('started_at', { mode: 'string', fsp: 3 }),
    heartbeatAt: datetime('heartbeat_at', { mode: 'string', fsp: 3 }),
    finishedAt: datetime('finished_at', { mode: 'string', fsp: 3 }),
    retryCount: int('retry_count').notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_tool_invocations_run_id').on(table.runId),
    index('idx_tool_invocations_step_id').on(table.stepId),
    index('idx_tool_invocations_status').on(table.status),
    uniqueIndex('uq_tool_invocations_idempotency').on(table.idempotencyKey),
  ],
)

// ─── artifacts 表 ─────────────────────────────────────────────
export const artifacts = mysqlTable(
  'artifacts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    runId: varchar('run_id', { length: 36 }).notNull(),
    projectId: varchar('project_id', { length: 36 }),
    workflowRunId: varchar('workflow_run_id', { length: 36 }),
    workflowStageId: varchar('workflow_stage_id', { length: 100 }),
    type: varchar('type', { length: 60 }).notNull(),
    title: varchar('title', { length: 255 }),
    currentVersionId: varchar('current_version_id', { length: 36 }),
    metadata: json('metadata'),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_run_id').on(table.runId),
    index('idx_project_id').on(table.projectId),
  ],
)

// ─── artifact_versions 表 ─────────────────────────────────────
export const artifactVersions = mysqlTable(
  'artifact_versions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    artifactId: varchar('artifact_id', { length: 36 }).notNull(),
    version: int('version').notNull().default(1),
    content: text('content').notNull(),       // JSON 序列化后存储
    createdByRunId: varchar('created_by_run_id', { length: 36 }).notNull(),
    createdByStepId: varchar('created_by_step_id', { length: 36 }),
    createdByAgentId: varchar('created_by_agent_id', { length: 100 }),
    parentVersionId: varchar('parent_version_id', { length: 36 }),
    reviewStatus: varchar('review_status', { length: 20 }),
    diffSummary: text('diff_summary'),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_artifact_id').on(table.artifactId),
    uniqueIndex('uq_artifact_version').on(table.artifactId, table.version),
  ],
)

// ─── model_call_logs 表（可观测性）────────────────────────────
export const modelCallLogs = mysqlTable(
  'model_call_logs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    traceId: varchar('trace_id', { length: 36 }).notNull(),
    runId: varchar('run_id', { length: 36 }).notNull(),
    stepId: varchar('step_id', { length: 36 }),
    agentId: varchar('agent_id', { length: 100 }),
    modelAlias: varchar('model_alias', { length: 60 }).notNull(),
    provider: varchar('provider', { length: 40 }).notNull(),
    actualModel: varchar('actual_model', { length: 100 }).notNull(),
    inputTokens: int('input_tokens'),
    outputTokens: int('output_tokens'),
    totalTokens: int('total_tokens'),
    estimatedCostUsd: decimal('estimated_cost_usd', { precision: 10, scale: 6 }),
    latencyMs: int('latency_ms').notNull(),
    finishReason: varchar('finish_reason', { length: 30 }),
    errorCode: varchar('error_code', { length: 60 }),
    retryCount: int('retry_count').notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_run_id').on(table.runId),
    index('idx_trace_id').on(table.traceId),
  ],
)

// ─── projects 表 ────────────────────────────────────────────
// 对应 FRAMEWORK_DESIGN §20.3 Project 数据模型
export const projects = mysqlTable(
  'projects',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    ownerId: varchar('owner_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 40 }).notNull().default('general'),
    description: text('description'),
    metadata: json('metadata'),
    deletedAt: datetime('deleted_at', { mode: 'string', fsp: 3 }),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_projects_owner_id').on(table.ownerId),
    index('idx_projects_type').on(table.type),
  ],
)

// ─── memories 表 ─────────────────────────────────────────────
// 对应 FRAMEWORK_DESIGN §13 memory/ 通用记忆层
export const memories = mysqlTable(
  'memories',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    scope: varchar('scope', { length: 20 }).notNull(), // user | session | project | agent | global
    scopeId: varchar('scope_id', { length: 36 }).notNull(),
    kind: varchar('kind', { length: 60 }).notNull(),   // preference | fact | summary | constraint
    content: json('content').notNull(),
    metadata: json('metadata'),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_memories_scope_id').on(table.scope, table.scopeId),
    index('idx_memories_kind').on(table.kind),
  ],
)

// ─── agent_tasks 表 ──────────────────────────────────────────
// 对应 FRAMEWORK_DESIGN §40.11 异步 A2A 的 MySQL 状态表
// AgentTask 表示一个异步 Agent 调用任务（不替代 Run，是 Run 的异步执行句柄）
export const agentTasks = mysqlTable(
  'agent_tasks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    parentRunId: varchar('parent_run_id', { length: 36 }).notNull(),
    childRunId: varchar('child_run_id', { length: 36 }).notNull(),
    fromAgentId: varchar('from_agent_id', { length: 100 }).notNull(),
    toAgentId: varchar('to_agent_id', { length: 100 }).notNull(),
    // queued | running | completed | failed | cancelled
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    input: json('input').notNull(),
    output: json('output'),
    error: json('error'),
    // 幂等键，避免重复入队（FRAMEWORK_DESIGN: 建议唯一索引）
    idempotencyKey: varchar('idempotency_key', { length: 100 }),
    retryCount: int('retry_count').notNull().default(0),
    maxRetries: int('max_retries').notNull().default(3),
    priority: int('priority').notNull().default(5),   // 1=最高, 10=最低
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    startedAt: datetime('started_at', { mode: 'string', fsp: 3 }),
    completedAt: datetime('completed_at', { mode: 'string', fsp: 3 }),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_agent_tasks_parent_run_id').on(table.parentRunId),
    index('idx_agent_tasks_child_run_id').on(table.childRunId),
    index('idx_agent_tasks_status').on(table.status),
    uniqueIndex('uq_agent_tasks_idempotency').on(table.idempotencyKey),
  ],
)

// ─── capability_route_decisions 表 ───────────────────────────
// 能力路由决策审计，用于治理、评测与误路由分析。
export const capabilityRouteDecisions = mysqlTable(
  'capability_route_decisions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    runId: varchar('run_id', { length: 36 }),
    sessionId: varchar('session_id', { length: 36 }),
    userId: varchar('user_id', { length: 36 }),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    requestedAgentId: varchar('requested_agent_id', { length: 100 }),
    resolvedAgentId: varchar('resolved_agent_id', { length: 100 }),
    routeType: varchar('route_type', { length: 30 }).notNull(),
    confidence: decimal('confidence', { precision: 5, scale: 4 }).notNull(),
    reason: text('reason').notNull(),
    source: varchar('source', { length: 30 }).notNull(),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_capability_route_run_id').on(table.runId),
    index('idx_capability_route_session_id').on(table.sessionId),
    index('idx_capability_route_user_id').on(table.userId),
    index('idx_capability_route_created_at').on(table.createdAt),
  ],
)

// ─── workflow_runs 表 ────────────────────────────────────────
// 存储 WorkflowRun 当前状态和各 Stage 结果；MVP 用 JSON 保持 schema 简洁。
export const workflowRuns = mysqlTable(
  'workflow_runs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    runId: varchar('run_id', { length: 36 }).notNull(),
    workflowId: varchar('workflow_id', { length: 100 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    currentStageId: varchar('current_stage_id', { length: 100 }),
    waitingHumanStageId: varchar('waiting_human_stage_id', { length: 100 }),
    stageResults: json('stage_results').notNull(),
    error: json('error'),
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_workflow_runs_run_id').on(table.runId),
    index('idx_workflow_runs_workflow_id').on(table.workflowId),
    index('idx_workflow_runs_status').on(table.status),
  ],
)

export type Schema = {
  users: typeof users
  chatSessions: typeof chatSessions
  projects: typeof projects
  runs: typeof runs
  steps: typeof steps
  runEvents: typeof runEvents
  artifacts: typeof artifacts
  artifactVersions: typeof artifactVersions
  modelCallLogs: typeof modelCallLogs
  memories: typeof memories
  agentTasks: typeof agentTasks
  capabilityRouteDecisions: typeof capabilityRouteDecisions
  workflowRuns: typeof workflowRuns
}

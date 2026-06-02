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
    createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_status').on(table.status),
    index('idx_user_id').on(table.userId),
    index('idx_trace_id').on(table.traceId),
    index('idx_session_id').on(table.sessionId),
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

export type Schema = {
  users: typeof users
  chatSessions: typeof chatSessions
  runs: typeof runs
  steps: typeof steps
  runEvents: typeof runEvents
  artifacts: typeof artifacts
  artifactVersions: typeof artifactVersions
  modelCallLogs: typeof modelCallLogs
}

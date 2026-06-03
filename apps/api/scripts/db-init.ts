/**
 * 数据库初始化脚本
 * 用法：DATABASE_URL=mysql://... bun run scripts/db-init.ts
 *
 * 此脚本直接执行 DDL，建表（如不存在则创建）
 * 适合开发环境快速初始化，生产环境请使用 drizzle-kit migrate
 */

import mysql from 'mysql2/promise'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set')
  process.exit(1)
}

const DDL_STATEMENTS = [
  // ─── users 表 ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    username      VARCHAR(80)  NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_username (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── chat_sessions 表 ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id     VARCHAR(36)  NOT NULL,
    title       VARCHAR(255) NULL,
    deleted_at  DATETIME(3)  NULL,
    created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_chat_sessions_user_id (user_id),
    INDEX idx_chat_sessions_updated_at (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── runs 表 ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS runs (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    trace_id      VARCHAR(36)  NOT NULL,
    user_id       VARCHAR(36)  NULL,
    project_id    VARCHAR(36)  NULL,
    agent_id      VARCHAR(100) NULL,
    session_id    VARCHAR(36)  NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'queued',
    input         JSON         NOT NULL,
    output        JSON         NULL,
    error         JSON         NULL,
    created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_status (status),
    INDEX idx_user_id (user_id),
    INDEX idx_trace_id (trace_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── steps 表 ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS steps (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    run_id          VARCHAR(36)  NOT NULL,
    parent_step_id  VARCHAR(36)  NULL,
    type            VARCHAR(30)  NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'running',
    agent_id        VARCHAR(100) NULL,
    from_agent_id   VARCHAR(100) NULL,
    to_agent_id     VARCHAR(100) NULL,
    input           JSON         NULL,
    output          JSON         NULL,
    error           JSON         NULL,
    started_at      DATETIME(3)  NOT NULL,
    ended_at        DATETIME(3)  NULL,
    INDEX idx_run_id (run_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── run_events 表 ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS run_events (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_id      VARCHAR(36)  NOT NULL,
    event_type  VARCHAR(60)  NOT NULL,
    event_data  JSON         NOT NULL,
    created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_run_id (run_id),
    INDEX idx_event_type (event_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── artifacts 表 ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS artifacts (
    id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
    run_id              VARCHAR(36)  NOT NULL,
    project_id          VARCHAR(36)  NULL,
    workflow_run_id     VARCHAR(36)  NULL,
    workflow_stage_id   VARCHAR(100) NULL,
    type                VARCHAR(60)  NOT NULL,
    title               VARCHAR(255) NULL,
    current_version_id  VARCHAR(36)  NULL,
    metadata            JSON         NULL,
    created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_run_id (run_id),
    INDEX idx_project_id (project_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── artifact_versions 表 ──────────────────────────────────
  `CREATE TABLE IF NOT EXISTS artifact_versions (
    id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
    artifact_id           VARCHAR(36)  NOT NULL,
    version               INT          NOT NULL DEFAULT 1,
    content               LONGTEXT     NOT NULL,
    created_by_run_id     VARCHAR(36)  NOT NULL,
    created_by_step_id    VARCHAR(36)  NULL,
    created_by_agent_id   VARCHAR(100) NULL,
    parent_version_id     VARCHAR(36)  NULL,
    review_status         VARCHAR(20)  NULL,
    diff_summary          TEXT         NULL,
    created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_artifact_id (artifact_id),
    UNIQUE KEY uq_artifact_version (artifact_id, version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── model_call_logs 表（可观测性）───────────────────────
  `CREATE TABLE IF NOT EXISTS model_call_logs (
    id                 BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    trace_id           VARCHAR(36)    NOT NULL,
    run_id             VARCHAR(36)    NOT NULL,
    step_id            VARCHAR(36)    NULL,
    agent_id           VARCHAR(100)   NULL,
    model_alias        VARCHAR(60)    NOT NULL,
    provider           VARCHAR(40)    NOT NULL,
    actual_model       VARCHAR(100)   NOT NULL,
    input_tokens       INT            NULL,
    output_tokens      INT            NULL,
    total_tokens       INT            NULL,
    estimated_cost_usd DECIMAL(10,6)  NULL,
    latency_ms         INT            NOT NULL,
    finish_reason      VARCHAR(30)    NULL,
    error_code         VARCHAR(60)    NULL,
    retry_count        INT            NOT NULL DEFAULT 0,
    created_at         DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_run_id (run_id),
    INDEX idx_trace_id (trace_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── workflow_runs 表 ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS workflow_runs (
    id                       VARCHAR(36)  NOT NULL PRIMARY KEY,
    run_id                   VARCHAR(36)  NOT NULL,
    workflow_id              VARCHAR(100) NOT NULL,
    status                   VARCHAR(30)  NOT NULL,
    current_stage_id         VARCHAR(100) NULL,
    waiting_human_stage_id   VARCHAR(100) NULL,
    stage_results            JSON         NOT NULL,
    error                    JSON         NULL,
    created_at               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_workflow_runs_run_id (run_id),
    INDEX idx_workflow_runs_workflow_id (workflow_id),
    INDEX idx_workflow_runs_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

async function main() {
  console.log(`\n🔧 Connecting to MySQL: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}\n`)

  const conn = await mysql.createConnection(DATABASE_URL)

  try {
    for (const ddl of DDL_STATEMENTS) {
      // 提取表名用于显示
      const match = ddl.match(/CREATE TABLE IF NOT EXISTS (\w+)/)
      const tableName = match?.[1] ?? 'unknown'
      process.stdout.write(`   Creating table: ${tableName} ... `)
      await conn.execute(ddl)
      console.log('✓')
    }
    console.log(`\n✅ Database initialized successfully! (${DDL_STATEMENTS.length} tables)\n`)
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error('\n❌ Database initialization failed:', err.message)
  process.exit(1)
})

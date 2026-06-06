import { ulid } from 'ulid'

// ============================================================
// ID 生成工具
// 使用 ULID：时间有序 + 全局唯一，适合 MySQL 主键
// ============================================================

export function generateId(prefix?: string): string {
  const id = ulid().toLowerCase()
  return prefix ? `${prefix}-${id}` : id
}

export function generateTraceId(): string {
  return `trace-${ulid().toLowerCase()}`
}

export function generateUserId(): string {
  return `user-${ulid().toLowerCase()}`
}

export function generateSessionId(): string {
  return `sess-${ulid().toLowerCase()}`
}

export function generateRunId(): string {
  return `run-${ulid().toLowerCase()}`
}

export function generateStepId(): string {
  return `step-${ulid().toLowerCase()}`
}

export function generateToolInvocationId(): string {
  return `tinv-${ulid().toLowerCase()}`
}

export function generateArtifactId(): string {
  return `art-${ulid().toLowerCase()}`
}

export function generateVersionId(): string {
  return `ver-${ulid().toLowerCase()}`
}

export function now(): string {
  return new Date().toISOString()
}

/** MySQL datetime(3) compatible timestamp: 'YYYY-MM-DD HH:MM:SS.mmm' */
export function mysqlNow(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 23)
}

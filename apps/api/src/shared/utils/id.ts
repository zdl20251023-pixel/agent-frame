import { ulid } from 'ulid'

// ============================================================
// ID 生成工具
// 使用 ULID：时间有序 + 全局唯一，适合 MySQL 主键
// ============================================================

export function generateId(): string {
  return ulid().toLowerCase()
}

export function generateTraceId(): string {
  return `trace-${ulid().toLowerCase()}`
}

export function generateRunId(): string {
  return `run-${ulid().toLowerCase()}`
}

export function generateStepId(): string {
  return `step-${ulid().toLowerCase()}`
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

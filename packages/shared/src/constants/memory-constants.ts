// ============================================================
// Memory 范围和状态常量
// ============================================================

export const MEMORY_SCOPES = {
  USER: 'user',
  SESSION: 'session',
  PROJECT: 'project',
  AGENT: 'agent',
  GLOBAL: 'global',
} as const

export type MemoryScope = typeof MEMORY_SCOPES[keyof typeof MEMORY_SCOPES]

export const MEMORY_CANDIDATE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  APPLIED: 'applied',
} as const

export type MemoryCandidateStatus = typeof MEMORY_CANDIDATE_STATUS[keyof typeof MEMORY_CANDIDATE_STATUS]

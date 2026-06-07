// ============================================================
// Memory 范围和状态常量
// ============================================================

export const MEMORY_SCOPES = {
  USER: 'user',        // 用户级记忆，跨会话复用
  SESSION: 'session',  // 会话级记忆，仅在当前会话内生效
  PROJECT: 'project',  // 项目级记忆，归属于长期项目空间
  AGENT: 'agent',      // Agent 级记忆，仅供指定 Agent 使用
  GLOBAL: 'global',    // 全局记忆，适用于系统级共享上下文
} as const

export type MemoryScope = typeof MEMORY_SCOPES[keyof typeof MEMORY_SCOPES]

export const MEMORY_CANDIDATE_STATUS = {
  PENDING: 'pending',    // 候选记忆等待审核
  APPROVED: 'approved',  // 候选记忆审核通过
  REJECTED: 'rejected',  // 候选记忆审核拒绝
  APPLIED: 'applied',    // 候选记忆已写入正式 Memory
} as const

export type MemoryCandidateStatus = typeof MEMORY_CANDIDATE_STATUS[keyof typeof MEMORY_CANDIDATE_STATUS]

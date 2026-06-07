import type { MemoryScope, MemoryCandidateStatus } from '../constants/memory-constants.js'

export type MemoryItem = {
  id: string               // Memory 唯一 ID
  scope: MemoryScope       // Memory 生效范围
  scopeId: string          // 对应 scope 的实例 ID（userId/sessionId/projectId...）
  kind: string             // preference | fact | summary | constraint
  content: unknown         // 记忆正文
  metadata?: Record<string, unknown> // 扩展元数据
  createdAt: string        // 创建时间（ISO 8601）
  updatedAt: string        // 更新时间（ISO 8601）
}

// 候选记忆写入请求（需审核后才写入正式 Memory）
export type MemoryWriteCandidate = {
  id: string                         // 候选记忆 ID
  projectId?: string                 // 关联项目 ID
  userId?: string                    // 关联用户 ID
  runId: string                      // 产生候选记忆的 Run ID
  stepId?: string                    // 产生候选记忆的 Step ID
  agentId: string                    // 产生候选记忆的 Agent ID
  key: string                        // 候选记忆键
  value: unknown                     // 候选记忆值
  reason: string                     // 推荐写入 Memory 的原因
  status: MemoryCandidateStatus      // 候选记忆审核状态
  createdAt: string                  // 创建时间（ISO 8601）
}


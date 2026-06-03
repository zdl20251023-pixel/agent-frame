import type { MemoryStore, MemoryItem, MemoryScope } from './memory.types.js'

// ============================================================
// MemoryRetriever — 记忆召回模块
// 对应 FRAMEWORK_DESIGN §13 memory/ 通用记忆层
//
// 职责：
// - 根据 RunContext（userId、sessionId、projectId、agentId）召回相关记忆
// - MVP 阶段：简单结构化检索（scope + scopeId + kind）
// - 未来：接入向量检索（Qdrant / Milvus），实现语义相似度召回
//
// 不在本模块做记忆写入决策，写入由 MemoryPolicy 控制
// ============================================================

export type MemoryQueryContext = {
  userId?: string
  sessionId?: string
  projectId?: string
  agentId?: string
}

export type MemoryRecallResult = {
  items: MemoryItem[]
  /** 按 scope 分组后的摘要，供 Agent 构造 System Prompt 使用 */
  summary: string
}

export class MemoryRetriever {
  constructor(private store: MemoryStore) {}

  /**
   * 根据请求上下文，按优先级召回所有相关记忆
   *
   * 召回顺序（优先级从高到低）：
   *   1. session scope（最即时、最相关）
   *   2. project scope（项目级知识）
   *   3. user scope（用户偏好）
   *   4. agent scope（Agent 自己的规则/知识）
   *
   * @param context  调用上下文，至少提供一个作用域 ID
   * @param kinds    可选：只召回特定 kind，例如 ['preference', 'constraint']
   * @param limit    每个 scope 最多召回条数（默认 10）
   */
  async recall(
    context: MemoryQueryContext,
    kinds?: string[],
    limit = 10,
  ): Promise<MemoryRecallResult> {
    const collected: MemoryItem[] = []

    // 1. session scope
    if (context.sessionId) {
      const items = await this.recallFromScope('session', context.sessionId, kinds)
      collected.push(...items.slice(0, limit))
    }

    // 2. project scope
    if (context.projectId) {
      const items = await this.recallFromScope('project', context.projectId, kinds)
      collected.push(...items.slice(0, limit))
    }

    // 3. user scope
    if (context.userId) {
      const items = await this.recallFromScope('user', context.userId, kinds)
      collected.push(...items.slice(0, limit))
    }

    // 4. agent scope
    if (context.agentId) {
      const items = await this.recallFromScope('agent', context.agentId, kinds)
      collected.push(...items.slice(0, limit))
    }

    // 去重（同 id 只保留一次）
    const seen = new Set<string>()
    const unique = collected.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })

    return {
      items: unique,
      summary: this.buildSummary(unique),
    }
  }

  /**
   * 直接按 scope + scopeId 召回（供 Memory CRUD 路由使用）
   */
  async recallByScope(
    scope: MemoryScope,
    scopeId: string,
    kind?: string,
  ): Promise<MemoryItem[]> {
    return this.store.list(scope, scopeId, kind)
  }

  private async recallFromScope(
    scope: MemoryScope,
    scopeId: string,
    kinds?: string[],
  ): Promise<MemoryItem[]> {
    if (kinds && kinds.length > 0) {
      // 多 kind 并行查询，合并去重
      const results = await Promise.all(
        kinds.map((k) => this.store.list(scope, scopeId, k)),
      )
      return results.flat()
    }
    return this.store.list(scope, scopeId)
  }

  /**
   * 将召回的记忆生成可供 Agent System Prompt 使用的摘要文本
   */
  private buildSummary(items: MemoryItem[]): string {
    if (items.length === 0) return ''

    const lines = items.map((item) => {
      const contentStr =
        typeof item.content === 'string'
          ? item.content
          : JSON.stringify(item.content)
      return `[${item.scope}/${item.kind}] ${contentStr}`
    })

    return `以下是相关上下文记忆：\n${lines.join('\n')}`
  }
}

import type { CreateMemoryInput, MemoryScope } from './memory.types.js'
import { AppError } from '../shared/errors/app-error.js'

// ============================================================
// MemoryPolicy — 记忆写入策略
// 对应 FRAMEWORK_DESIGN §13 memory/ 通用记忆层
//
// 设计原则：
// - 记忆写入必须经过策略检查，避免脏记忆污染
// - MVP 阶段只做基本校验（scope 限制、内容大小、kind 白名单）
// - 未来可扩展为：人工审核门控、置信度阈值、过期时间
//
// 不做记忆写入，只做准入决策（canWrite 返回 boolean 或抛出 AppError）
// ============================================================

/** 禁止直接写入的 scope（通用框架层面不允许直接写 global）*/
const RESTRICTED_SCOPES: MemoryScope[] = ['global']

/** 允许写入的 kind 白名单（MVP 先限定，后续可从配置中读）*/
const ALLOWED_KINDS = new Set([
  'preference',   // 用户偏好，例如语言、风格
  'fact',         // 事实性知识，例如用户的姓名、项目名
  'summary',      // 会话或任务摘要
  'constraint',   // 业务规则或限制条件
  'instruction',  // 对 Agent 的持久指令
  'goal',         // 项目或任务目标
  'note',         // 临时注释
])

/** 单条记忆内容最大字符数（防止超大文本写入）*/
const MAX_CONTENT_LENGTH = 4096

export class MemoryPolicy {
  /**
   * 检查是否允许写入该条记忆
   *
   * @throws AppError 如果违反任一策略规则
   */
  assertCanWrite(input: CreateMemoryInput): void {
    // 1. scope 限制
    if (RESTRICTED_SCOPES.includes(input.scope)) {
      throw new AppError(
        'FORBIDDEN',
        `Writing to scope '${input.scope}' is not allowed via API`,
        { statusCode: 403 },
      )
    }

    // 2. kind 白名单
    if (!ALLOWED_KINDS.has(input.kind)) {
      throw new AppError(
        'BAD_REQUEST',
        `Memory kind '${input.kind}' is not allowed. Allowed kinds: ${[...ALLOWED_KINDS].join(', ')}`,
        { statusCode: 400 },
      )
    }

    // 3. 内容大小限制
    const contentStr =
      typeof input.content === 'string' ? input.content : JSON.stringify(input.content)
    if (contentStr.length > MAX_CONTENT_LENGTH) {
      throw new AppError(
        'BAD_REQUEST',
        `Memory content exceeds max length of ${MAX_CONTENT_LENGTH} characters`,
        { statusCode: 400 },
      )
    }
  }

  /**
   * 检查是否允许删除某 scope 下的记忆
   * MVP：只有拥有者（通过 userId 确认）才能删除 user/session scope
   */
  assertCanDelete(scope: MemoryScope): void {
    if (RESTRICTED_SCOPES.includes(scope)) {
      throw new AppError(
        'FORBIDDEN',
        `Deleting from scope '${scope}' is not allowed`,
        { statusCode: 403 },
      )
    }
  }

  /** 获取允许的 kind 列表（供 API 文档和前端下拉使用）*/
  getAllowedKinds(): string[] {
    return [...ALLOWED_KINDS]
  }
}

/** 默认全局策略实例 */
export const memoryPolicy = new MemoryPolicy()

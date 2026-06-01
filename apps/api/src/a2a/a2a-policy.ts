import type { A2ARequest } from '@agent-frame/shared'
import type { RunContext } from '../runtime/run-manager.js'
import { AppError } from '../shared/errors/app-error.js'
import { env } from '../shared/config/env.js'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// A2APolicy — A2A 调用策略检查
// ============================================================

export type PolicyConfig = {
  // 全局默认规则
  maxDepth: number
  maxCallsPerRun: number
  defaultTimeoutMs: number
  // 允许的调用关系：fromAgentId -> Set<toAgentId>
  allowedCalls: Map<string, Set<string>>
}

export class A2APolicy {
  private config: PolicyConfig

  constructor(config?: Partial<PolicyConfig>) {
    this.config = {
      maxDepth: config?.maxDepth ?? env.MAX_A2A_DEPTH,
      maxCallsPerRun: config?.maxCallsPerRun ?? env.MAX_AGENT_CALLS_PER_RUN,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? env.DEFAULT_A2A_TIMEOUT_MS,
      allowedCalls: config?.allowedCalls ?? new Map(),
    }
  }

  /**
   * 注册允许的调用关系
   * allow('supervisor-agent', ['research-agent', 'summary-agent'])
   */
  allow(fromAgentId: string, toAgentIds: string[]): this {
    if (!this.config.allowedCalls.has(fromAgentId)) {
      this.config.allowedCalls.set(fromAgentId, new Set())
    }
    for (const toId of toAgentIds) {
      this.config.allowedCalls.get(fromAgentId)!.add(toId)
    }
    return this
  }

  assertCanCall(request: A2ARequest, context: RunContext): void {
    const { fromAgentId, toAgentId } = request
    const log = logger.child({ runId: request.runId, fromAgentId, toAgentId })

    // ─── 白名单检查 ────────────────────────────────────────
    const allowed = this.config.allowedCalls.get(fromAgentId)
    if (!allowed?.has(toAgentId)) {
      log.warn('[A2APolicy] Call denied: not in allowedCalls')
      throw new AppError(
        'AGENT_CALL_DENIED',
        `Agent ${fromAgentId} is not allowed to call ${toAgentId}`,
        { statusCode: 403 },
      )
    }

    // ─── 调用深度检查 ──────────────────────────────────────
    if (context.depth >= this.config.maxDepth) {
      log.warn('[A2APolicy] Call denied: max depth exceeded', { depth: context.depth })
      throw new AppError(
        'AGENT_CALL_DENIED',
        `Max A2A depth (${this.config.maxDepth}) exceeded`,
        { statusCode: 403 },
      )
    }

    // ─── 调用次数检查 ──────────────────────────────────────
    if (context.callCount >= this.config.maxCallsPerRun) {
      log.warn('[A2APolicy] Call denied: max calls per run exceeded', { callCount: context.callCount })
      throw new AppError(
        'AGENT_CALL_DENIED',
        `Max agent calls per run (${this.config.maxCallsPerRun}) exceeded`,
        { statusCode: 403 },
      )
    }

    log.debug('[A2APolicy] Call allowed')
  }
}

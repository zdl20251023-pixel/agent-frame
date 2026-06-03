import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import type { RunContext } from '../runtime/run-manager.js'
import type { AgentAdapter } from './a2a-router.js'
import { AppError } from '../shared/errors/app-error.js'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// RemoteAgentAdapter — 通过 HTTP 调用远程 Agent
//
// 设计意图：
// - 与 LocalAgentAdapter 实现同一个 AgentAdapter 接口
// - A2AClient 和 A2ARouter 无需感知本地还是远程
// - MVP 阶段：实现 HTTP 调用骨架，生产化时补充认证、重试
//
// 远程 Agent 协议（约定）：
//   POST {baseUrl}/execute
//   Body: AgentInput（JSON）
//   Response: AgentOutput（JSON）
// ============================================================

export type RemoteAgentConfig = {
  /** Agent ID（必须与注册到 A2ARouter 的 ID 一致） */
  agentId: string
  /** 远程 Agent 的基础 URL，例如 http://agent.internal:3100 */
  baseUrl: string
  /** 请求超时（ms），默认 30000 */
  timeoutMs?: number
  /** API Key（远程 Agent 要求认证时使用） */
  apiKey?: string
}

export class RemoteAgentAdapter implements AgentAdapter {
  readonly agentId: string
  private config: Required<RemoteAgentConfig>

  constructor(config: RemoteAgentConfig) {
    this.agentId = config.agentId
    this.config = {
      agentId: config.agentId,
      baseUrl: config.baseUrl.replace(/\/$/, ''), // 去掉末尾斜杠
      timeoutMs: config.timeoutMs ?? 30_000,
      apiKey: config.apiKey ?? '',
    }
  }

  async execute(input: AgentInput, context: RunContext): Promise<AgentOutput> {
    const { runId, traceId } = context
    const log = logger.child({ runId, traceId, agentId: this.agentId })

    const url = `${this.config.baseUrl}/execute`
    log.info('[RemoteAgentAdapter] Calling remote agent', { url })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Trace-Id': traceId,
      'X-Run-Id': runId,
    }
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
        signal: AbortSignal.any([
          context.signal,
          AbortSignal.timeout(this.config.timeoutMs),
        ]),
      })
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (isAbort) {
        throw new AppError('AGENT_CALL_TIMEOUT', `Remote agent ${this.agentId} timed out or was cancelled`, {
          retryable: true,
        })
      }
      throw new AppError('AGENT_CALL_FAILED', `Remote agent ${this.agentId} network error: ${String(err)}`, {
        retryable: true,
      })
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new AppError(
        'AGENT_CALL_FAILED',
        `Remote agent ${this.agentId} returned HTTP ${response.status}: ${body}`,
        { retryable: response.status >= 500 },
      )
    }

    let result: AgentOutput
    try {
      result = await response.json() as AgentOutput
    } catch {
      throw new AppError('AGENT_CALL_FAILED', `Remote agent ${this.agentId} returned invalid JSON`)
    }

    log.info('[RemoteAgentAdapter] Remote agent call completed', { agentId: this.agentId })
    return result
  }
}

/**
 * 便捷工厂函数
 */
export function createRemoteAgentAdapter(config: RemoteAgentConfig): RemoteAgentAdapter {
  return new RemoteAgentAdapter(config)
}

import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import type { RunContext } from '../runtime/run-manager.js'
import type { AgentAdapter } from './a2a-router.js'

// ============================================================
// LocalAgentAdapter — 将本地 Agent 实例适配为 A2A 可调用格式
//
// 设计意图：
// - A2AClient 只认识 AgentAdapter 接口，不关心 Agent 是本地还是远程
// - LocalAgentAdapter 将本地 Agent 类（有 execute 方法）包装成标准 AgentAdapter
// - 未来可以扩展 RemoteAgentAdapter，通过 HTTP 调用远程 Agent
// ============================================================

export type LocalAgent<TInput = unknown, TOutput = unknown> = {
  readonly agentId: string
  execute(input: AgentInput<TInput>, context: RunContext): Promise<AgentOutput<TOutput>>
}

/**
 * 将本地 Agent 实例包装为标准 AgentAdapter
 *
 * @example
 * const researchAdapter = createLocalAgentAdapter(new ResearchAgent(...))
 * a2aRouter.register(researchAdapter)
 */
export function createLocalAgentAdapter(agent: LocalAgent): AgentAdapter {
  return {
    agentId: agent.agentId,
    execute: (input: AgentInput, context: RunContext): Promise<AgentOutput> =>
      agent.execute(input, context),
  }
}

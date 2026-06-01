import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import type { RunContext } from '../runtime/run-manager.js'
import { AppError } from '../shared/errors/app-error.js'

// ============================================================
// A2ARouter — 根据 toAgentId 路由到本地 Agent 适配器
// ============================================================

export type AgentAdapter = {
  agentId: string
  execute(input: AgentInput, context: RunContext): Promise<AgentOutput>
}

export class A2ARouter {
  private registry = new Map<string, AgentAdapter>()

  register(adapter: AgentAdapter): this {
    this.registry.set(adapter.agentId, adapter)
    return this
  }

  resolve(agentId: string): AgentAdapter {
    const adapter = this.registry.get(agentId)
    if (!adapter) {
      throw new AppError('AGENT_NOT_FOUND', `Agent not found: ${agentId}`, { statusCode: 404 })
    }
    return adapter
  }

  listAgentIds(): string[] {
    return [...this.registry.keys()]
  }

  has(agentId: string): boolean {
    return this.registry.has(agentId)
  }
}

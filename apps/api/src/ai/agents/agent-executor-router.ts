import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import type { AgentExecutor, RunContext } from '../../runtime/run-manager.js'
import { AppError } from '../../shared/errors/app-error.js'

// ============================================================
// AgentExecutorRouter — Run 入口 Agent 分发器
//
// 职责：
// - RunManager 仍只依赖一个 AgentExecutor。
// - 该 Router 根据 RunContext.agentId 分发到具体业务 Agent。
// - 不把多 Agent 选择逻辑下沉到 runtime 层，保持 RunManager 只管生命周期。
// ============================================================

export class AgentExecutorRouter implements AgentExecutor {
  readonly agentId = 'agent-executor-router'
  private readonly executors = new Map<string, AgentExecutor>()

  constructor(private readonly defaultAgentId: string) {}

  register(executor: AgentExecutor): this {
    this.executors.set(executor.agentId, executor)
    return this
  }

  execute(input: AgentInput, context: RunContext): Promise<AgentOutput> {
    const targetAgentId = context.agentId ?? this.defaultAgentId
    const executor = this.executors.get(targetAgentId)
    if (!executor) {
      throw new AppError('AGENT_NOT_FOUND', `Agent executor not found: ${targetAgentId}`, {
        statusCode: 404,
      })
    }

    return executor.execute(input, context)
  }

  listAgentIds(): string[] {
    return [...this.executors.keys()]
  }
}


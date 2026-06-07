import type { CapabilityHints } from '@agent-frame/shared'
import type { AgentExecutor } from '../runtime/run-manager.js'
import type { ModelClient } from '../ai/model-client/model-client.js'
import type { RunStore } from '../runtime/stores/run-store.js'
import type { ArtifactStore } from '../artifacts/artifact-store.js'
import type { A2AClient } from '../a2a/a2a-client.js'
import type { MemoryRetriever } from '../memory/memory-retriever.js'
import type { MemoryStore } from '../memory/memory.types.js'
import type { SessionsRepository } from '../features/sessions/sessions.repository.js'
import type { WorkflowDefinition } from './plugin.types.js'

// ============================================================
// Plugin Agent Runtime — 插件可执行 Agent 装配契约
// ============================================================

/** 容器装配 Agent 运行时所需的依赖 */
export type AgentAssemblyDeps = {
  modelClient: ModelClient
  store: RunStore
  artifactStore: ArtifactStore
  a2aClient: A2AClient
  memoryRetriever: MemoryRetriever
  memoryStore: MemoryStore
  sessionsRepository: SessionsRepository
}

/** 插件注册的 Agent 运行时定义 */
export type PluginAgentRuntimeDefinition = {
  id: string
  factory: (deps: AgentAssemblyDeps) => AgentExecutor
  capabilityHints?: CapabilityHints
  /** 该 Agent 可发起的 A2A 调用目标 */
  a2aCanCall?: string[]
  /** 允许调用该 Agent 的上游 Agent */
  a2aCalledBy?: string[]
  /** 是否注册为 Run 入口 Agent（AgentExecutorRouter） */
  isEntryAgent?: boolean
  /** 是否注册到 A2A Router（可被其他 Agent 调度） */
  registerA2A?: boolean
}

export type PluginA2APolicyEntry = {
  fromAgentId: string
  toAgentIds: string[]
}

/** 插件提供的 Workflow runtime adapter */
export type PluginWorkflowRuntimeDefinition = {
  id: string
  definition: WorkflowDefinition
  /**
   * 预留运行时工厂：当前内置 WorkflowRunner 可直接消费 definition；
   * 若未来某插件需要自定义执行器，可在这里返回 adapter。
   */
  runnerFactory?: (deps: AgentAssemblyDeps) => unknown
}

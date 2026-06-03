import { MemoryRunStore } from './runtime/stores/memory-run-store.js'
import { MySQLRunStore } from './runtime/stores/mysql-run-store.js'
import { RunManager } from './runtime/run-manager.js'
import { A2APolicy } from './a2a/a2a-policy.js'
import { A2ARouter } from './a2a/a2a-router.js'
import { A2AClient } from './a2a/a2a-client.js'
import { createLocalAgentAdapter } from './a2a/local-agent-adapter.js'
import { VercelAIModelClient } from './ai/model-client/vercel-ai-model-client.js'
import { SupervisorAgent } from './ai/agents/supervisor.agent.js'
import { ResearchAgent } from './ai/agents/research.agent.js'
import { SummaryAgent } from './ai/agents/summary.agent.js'
import {
  SUPERVISOR_AGENT_ID,
  RESEARCH_AGENT_ID,
  SUMMARY_AGENT_ID,
} from './ai/agents/agent-ids.js'
import { AgentsService } from './features/agents/agents.service.js'
import { ArtifactsService } from './features/artifacts/artifacts.service.js'
import { logger } from './shared/observability/logger.js'
import { env } from './shared/config/env.js'
import type { RunStore } from './runtime/stores/run-store.js'
import { MySQLArtifactStore } from './artifacts/artifact-store.mysql.js'
import { MemoryArtifactStore } from './artifacts/artifact-store.memory.js'
import type { ArtifactStore } from './artifacts/artifact-store.js'

// ============================================================
// 应用依赖容器 — 初始化并组装所有核心组件
// ============================================================

export type AppContainer = {
  runManager: RunManager
  a2aClient: A2AClient
  a2aRouter: A2ARouter
  a2aPolicy: A2APolicy
  store: RunStore
  artifactStore: ArtifactStore
  agentsService: AgentsService
  artifactsService: ArtifactsService
}

function createStore(): RunStore {
  if (env.DATABASE_URL) {
    logger.info('[Container] Using MySQLRunStore')
    return new MySQLRunStore()
  }
  logger.warn('[Container] DATABASE_URL not set, falling back to MemoryRunStore')
  return new MemoryRunStore()
}

function createArtifactStore(): ArtifactStore {
  if (env.DATABASE_URL) {
    return new MySQLArtifactStore()
  }
  return new MemoryArtifactStore()
}

export function createContainer(): AppContainer {
  logger.info('[Container] Initializing application dependencies')

  // ─── 存储层（根据环境自动选择）───────────────────────────
  const store = createStore()
  const artifactStore = createArtifactStore()

  // ─── ModelClient ─────────────────────────────────────────
  const modelClient = new VercelAIModelClient()

  // ─── A2A 层 ──────────────────────────────────────────────
  const a2aPolicy = new A2APolicy()
  // 注册允许的调用关系
  a2aPolicy.allow(SUPERVISOR_AGENT_ID, [RESEARCH_AGENT_ID, SUMMARY_AGENT_ID])

  const a2aRouter = new A2ARouter()
  const a2aClient = new A2AClient(store, a2aPolicy, a2aRouter)

  // ─── 专业 Agent 注册 ─────────────────────────────────────
  // ResearchAgent 现在需要 artifactStore（用于写入 research_report Artifact）
  const researchAgent = new ResearchAgent(modelClient, store, artifactStore)
  const summaryAgent = new SummaryAgent(modelClient, store, artifactStore)

  a2aRouter.register(createLocalAgentAdapter(researchAgent))
  a2aRouter.register(createLocalAgentAdapter(summaryAgent))

  // ─── SupervisorAgent ─────────────────────────────────────
  const supervisorAgent = new SupervisorAgent(modelClient, a2aClient, store)

  // ─── RunManager ──────────────────────────────────────────
  const runManager = new RunManager(store, {
    agentId: SUPERVISOR_AGENT_ID,
    execute: (input, ctx) => supervisorAgent.execute(input as Parameters<typeof supervisorAgent.execute>[0], ctx),
  })

  logger.info('[Container] All dependencies initialized', {
    agents: a2aRouter.listAgentIds(),
    storeType: env.DATABASE_URL ? 'mysql' : 'memory',
  })

  const agentsService = new AgentsService(a2aRouter)
  const artifactsService = new ArtifactsService(artifactStore)

  return { runManager, a2aClient, a2aRouter, a2aPolicy, store, artifactStore, agentsService, artifactsService }
}

// 单例容器（在整个应用生命周期中共享）
export const container = createContainer()

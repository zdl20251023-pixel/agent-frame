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
import { NlToHandAgent } from './ai/agents/nl-to-hand.agent.js'
import { AgentExecutorRouter } from './ai/agents/agent-executor-router.js'
import {
  SUPERVISOR_AGENT_ID,
  RESEARCH_AGENT_ID,
  SUMMARY_AGENT_ID,
  NL_TO_HAND_AGENT_ID,
} from './ai/agents/agent-ids.js'
import {
  OutlineAgent,
  WritingAgent,
  ReviewAgent,
  OUTLINE_AGENT_ID,
  WRITING_AGENT_ID,
  REVIEW_AGENT_ID,
} from './plugins/creative-writing/index.js'
import { AgentsService } from './features/agents/agents.service.js'
import { ArtifactsService } from './features/artifacts/artifacts.service.js'
import { WorkflowRunner } from './workflow/workflow-runner.js'
import { WorkflowRegistry } from './workflow/workflow-registry.js'
import { MemoryWorkflowStore, MySQLWorkflowStore } from './workflow/workflow-store.js'
import type { WorkflowStore } from './workflow/workflow-store.js'
import { ArtifactVersionManager } from './artifacts/artifact-version.js'
import { humanGate } from './workflow/human-gate.js'
import type { HumanGateManager } from './workflow/human-gate.js'
import { logger } from './shared/observability/logger.js'
import { env } from './shared/config/env.js'
import type { RunStore } from './runtime/stores/run-store.js'
import { MySQLArtifactStore } from './artifacts/artifact-store.mysql.js'
import { MemoryArtifactStore } from './artifacts/artifact-store.memory.js'
import type { ArtifactStore } from './artifacts/artifact-store.js'
import { ProjectsService } from './features/projects/projects.service.js'
import { MySQLMemoryStore } from './memory/memory-store.mysql.js'
import { MemoryMemoryStore } from './memory/memory-store.memory.js'
import { MemoryRetriever } from './memory/memory-retriever.js'
import type { MemoryStore } from './memory/memory.types.js'
import { AgentTaskWorker } from './queues/agent-task.worker.js'
import { SessionsRepository } from './features/sessions/sessions.repository.js'
import { SessionSummaryService } from './features/sessions/session-summary.service.js'

// ============================================================
// 应用依赖容器 — 初始化并组装所有核心组件
// ============================================================

// Workflow 专用 Agent ID（不注册到 A2APolicy 的"发起方"白名单中会被拦截，此处允许）
const WORKFLOW_RUNNER_AGENT_ID = 'workflow-runner'

export type AppContainer = {
  runManager: RunManager
  a2aClient: A2AClient
  a2aRouter: A2ARouter
  a2aPolicy: A2APolicy
  store: RunStore
  artifactStore: ArtifactStore
  agentsService: AgentsService
  artifactsService: ArtifactsService
  workflowRunner: WorkflowRunner
  workflowRegistry: WorkflowRegistry
  workflowStore: WorkflowStore
  humanGate: HumanGateManager
  artifactVersionManager: ArtifactVersionManager
  projectsService: ProjectsService
  memoryStore: MemoryStore
  memoryRetriever: MemoryRetriever
  agentTaskWorker: AgentTaskWorker
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

  // ─── Memory 层（根据环境选择 MySQL / 内存）────────────────
  const memoryStore: MemoryStore = env.DATABASE_URL
    ? new MySQLMemoryStore()
    : new MemoryMemoryStore()
  const memoryRetriever = new MemoryRetriever(memoryStore)

  // ─── ModelClient ─────────────────────────────────────────
  const modelClient = new VercelAIModelClient()

  // ─── A2A 层 ──────────────────────────────────────────────
  const a2aPolicy = new A2APolicy()
  // A2A 权限：Supervisor 可调度核心专业 Agent 和创意写作 Agent
  a2aPolicy.allow(SUPERVISOR_AGENT_ID, [
    RESEARCH_AGENT_ID,
    SUMMARY_AGENT_ID,
    NL_TO_HAND_AGENT_ID,
    OUTLINE_AGENT_ID,
    WRITING_AGENT_ID,
    REVIEW_AGENT_ID,
  ])
  // WorkflowRunner 可以调用所有已注册 Agent
  a2aPolicy.allow(WORKFLOW_RUNNER_AGENT_ID, [
    RESEARCH_AGENT_ID,
    SUMMARY_AGENT_ID,
    OUTLINE_AGENT_ID,
    WRITING_AGENT_ID,
    REVIEW_AGENT_ID,
  ])

  const a2aRouter = new A2ARouter()
  const a2aClient = new A2AClient(store, a2aPolicy, a2aRouter)

  // ─── 专业 Agent 注册（核心 + 创意写作）────────────────────
  const researchAgent = new ResearchAgent(modelClient, store, artifactStore)
  const summaryAgent = new SummaryAgent(modelClient, store, artifactStore)
  const nlToHandAgent = new NlToHandAgent(store, artifactStore)
  const outlineAgent = new OutlineAgent(modelClient, store, artifactStore)
  const writingAgent = new WritingAgent(modelClient, store, artifactStore)
  const reviewAgent = new ReviewAgent(modelClient, store, artifactStore)

  a2aRouter.register(createLocalAgentAdapter(researchAgent))
  a2aRouter.register(createLocalAgentAdapter(summaryAgent))
  a2aRouter.register(createLocalAgentAdapter(nlToHandAgent))
  a2aRouter.register(createLocalAgentAdapter(outlineAgent))
  a2aRouter.register(createLocalAgentAdapter(writingAgent))
  a2aRouter.register(createLocalAgentAdapter(reviewAgent))

  // ─── SupervisorAgent ─────────────────────────────────────
  const supervisorAgent = new SupervisorAgent(modelClient, a2aClient, store, memoryRetriever, memoryStore)
  const executorRouter = new AgentExecutorRouter(SUPERVISOR_AGENT_ID)
    .register({
      agentId: SUPERVISOR_AGENT_ID,
      execute: (input, ctx) => supervisorAgent.execute(input as Parameters<typeof supervisorAgent.execute>[0], ctx),
    })
    .register({
      agentId: NL_TO_HAND_AGENT_ID,
      execute: (input, ctx) => nlToHandAgent.execute(input as Parameters<typeof nlToHandAgent.execute>[0], ctx),
    })

  // ─── 会话摘要服务 ─────────────────────────────────────────
  const sessionsRepository = new SessionsRepository()
  const sessionSummaryService = new SessionSummaryService(sessionsRepository, modelClient)

  // ─── RunManager ──────────────────────────────────────────
  const runManager = new RunManager(store, {
    agentId: executorRouter.agentId,
    execute: (input, ctx) => executorRouter.execute(input, ctx),
  }, sessionSummaryService)

  // ─── Workflow 层 ─────────────────────────────────────────
  const workflowStore = env.DATABASE_URL ? new MySQLWorkflowStore() : new MemoryWorkflowStore()
  const workflowRegistry = new WorkflowRegistry()
  const workflowRunner = new WorkflowRunner(a2aClient, workflowStore, store)

  // ─── Artifact 版本管理 ────────────────────────────────────
  const artifactVersionManager = new ArtifactVersionManager(artifactStore)

  // ─── Service 层 ──────────────────────────────────────
  const agentsService = new AgentsService(a2aRouter)
  const artifactsService = new ArtifactsService(artifactStore)

  // ─── Project Service ─────────────────────────────────
  const projectsService = new ProjectsService()

  // ─── AgentTask Worker（异步 A2A 任务消费者）────────────────
  const agentTaskWorker = new AgentTaskWorker(store, a2aRouter, {
    pollIntervalMs: 2000,
    batchSize: 2,
    // 只有 MySQL 模式下才启动 Worker（内存模式无持久化）
    enabled: !!env.DATABASE_URL,
  })
  agentTaskWorker.start()

  logger.info('[Container] All dependencies initialized', {
    agents: a2aRouter.listAgentIds(),
    storeType: env.DATABASE_URL ? 'mysql' : 'memory',
  })

  return {
    runManager,
    a2aClient,
    a2aRouter,
    a2aPolicy,
    store,
    artifactStore,
    agentsService,
    artifactsService,
    workflowRunner,
    workflowRegistry,
    workflowStore,
    humanGate,
    artifactVersionManager,
    projectsService,
    memoryStore,
    memoryRetriever,
    agentTaskWorker,
  }
}

// 单例容器（在整个应用生命周期中共享）
export const container = createContainer()

import { MemoryRunStore } from './runtime/stores/memory-run-store.js'
import { MySQLRunStore } from './runtime/stores/mysql-run-store.js'
import { RunManager } from './runtime/run-manager.js'
import { A2APolicy } from './a2a/a2a-policy.js'
import { A2ARouter } from './a2a/a2a-router.js'
import { A2AClient } from './a2a/a2a-client.js'
import { createLocalAgentAdapter } from './a2a/local-agent-adapter.js'
import { VercelAIModelClient } from './ai/model-client/vercel-ai-model-client.js'
import { SupervisorAgent } from './ai/agents/supervisor.agent.js'
import { AgentExecutorRouter } from './ai/agents/agent-executor-router.js'
import {
  SUPERVISOR_AGENT_ID,
  RESEARCH_AGENT_ID,
  SUMMARY_AGENT_ID,
  NL_TO_HAND_AGENT_ID,
} from './ai/agents/agent-ids.js'
import {
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
import { ToolInvocationRecoveryWorker } from './runtime/tool-invocation-recovery.worker.js'
import { RunRecoveryWorker } from './runtime/run-recovery.worker.js'
import { NlToHandRepairWorker } from './features/agent-tools/nl-to-hand-repair.worker.js'
import { pluginRegistry } from './plugins/plugin-registry.js'
import { registerBuiltinPlugins } from './plugins/builtin-plugins.js'
import { CapabilityRouter } from './capabilities/capability-router.js'
import type { AgentAssemblyDeps } from './plugins/plugin-runtime.types.js'
import type { AgentExecutor } from './runtime/run-manager.js'
import './runtime/tool-replay.registry.js'

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
  toolInvocationRecoveryWorker: ToolInvocationRecoveryWorker
  runRecoveryWorker: RunRecoveryWorker
  nlToHandRepairWorker: NlToHandRepairWorker
  capabilityRouter: CapabilityRouter
  pluginRegistry: typeof pluginRegistry
}

function createStore(): RunStore {
  if (env.DATABASE_URL) {
    logger.info('[Container] Using MySQLRunStore')
    return new MySQLRunStore()
  }
  if (env.isProd && !env.ALLOW_MEMORY_STORE) {
    throw new Error('[Container] DATABASE_URL is required in production. Refusing MemoryRunStore.')
  }
  logger.warn('[Container] Using MemoryRunStore — not suitable for production')
  return new MemoryRunStore()
}

function createArtifactStore(): ArtifactStore {
  return env.DATABASE_URL ? new MySQLArtifactStore() : new MemoryArtifactStore()
}

function registerA2AAgents(
  a2aRouter: A2ARouter,
  executors: Map<string, AgentExecutor>,
): void {
  for (const def of pluginRegistry.listA2AAgentRuntimeDefinitions()) {
    const executor = executors.get(def.id)
    if (!executor) continue
    a2aRouter.register(createLocalAgentAdapter({
      agentId: executor.agentId,
      execute: (input, ctx) => executor.execute(input, ctx),
    } as Parameters<typeof createLocalAgentAdapter>[0]))
  }
}

export function createContainer(): AppContainer {
  logger.info('[Container] Initializing application dependencies')
  registerBuiltinPlugins()

  const store = createStore()
  const artifactStore = createArtifactStore()
  const sessionsRepository = new SessionsRepository()
  const memoryStore: MemoryStore = env.DATABASE_URL ? new MySQLMemoryStore() : new MemoryMemoryStore()
  const memoryRetriever = new MemoryRetriever(memoryStore)
  const modelClient = new VercelAIModelClient()

  const capabilityRouter = new CapabilityRouter()
  capabilityRouter.setCapabilityHints(pluginRegistry.listCapabilityHints())

  const a2aPolicy = A2APolicy.fromPlugins(pluginRegistry.listA2APolicies())
  a2aPolicy.allow(SUPERVISOR_AGENT_ID, [
    RESEARCH_AGENT_ID, SUMMARY_AGENT_ID, NL_TO_HAND_AGENT_ID,
    OUTLINE_AGENT_ID, WRITING_AGENT_ID, REVIEW_AGENT_ID,
  ])
  a2aPolicy.allow(WORKFLOW_RUNNER_AGENT_ID, [
    RESEARCH_AGENT_ID, SUMMARY_AGENT_ID,
    OUTLINE_AGENT_ID, WRITING_AGENT_ID, REVIEW_AGENT_ID,
  ])

  const a2aRouter = new A2ARouter()
  const a2aClient = new A2AClient(store, a2aPolicy, a2aRouter)

  const assemblyDeps: AgentAssemblyDeps = {
    modelClient, store, artifactStore, a2aClient, memoryRetriever, memoryStore, sessionsRepository,
  }

  const executorMap = new Map<string, AgentExecutor>()
  for (const def of pluginRegistry.listAgentRuntimeDefinitions()) {
    executorMap.set(def.id, def.factory(assemblyDeps))
  }
  registerA2AAgents(a2aRouter, executorMap)

  const supervisorAgent = new SupervisorAgent(modelClient, a2aClient, store, memoryRetriever, memoryStore)
  const executorRouter = new AgentExecutorRouter(SUPERVISOR_AGENT_ID)
    .register({
      agentId: SUPERVISOR_AGENT_ID,
      execute: (input, ctx) => supervisorAgent.execute(input as Parameters<typeof supervisorAgent.execute>[0], ctx),
    })

  for (const def of pluginRegistry.listEntryAgentRuntimeDefinitions()) {
    const executor = executorMap.get(def.id)
    if (executor) executorRouter.register(executor)
  }

  const sessionSummaryService = new SessionSummaryService(sessionsRepository, modelClient)
  const runManager = new RunManager(store, {
    agentId: executorRouter.agentId,
    execute: (input, ctx) => executorRouter.execute(input, ctx),
  }, sessionSummaryService)

  const workflowStore = env.DATABASE_URL ? new MySQLWorkflowStore() : new MemoryWorkflowStore()
  const workflowRegistry = new WorkflowRegistry()
  for (const workflowRuntime of pluginRegistry.listWorkflowRuntimes()) {
    workflowRegistry.register(workflowRuntime.definition)
  }
  const workflowRunner = new WorkflowRunner(a2aClient, workflowStore, store)

  const agentTaskWorker = new AgentTaskWorker(store, a2aRouter, {
    pollIntervalMs: 2000, batchSize: 2, enabled: !!env.DATABASE_URL,
  })
  agentTaskWorker.start()

  const nlToHandRepairWorker = new NlToHandRepairWorker(store, artifactStore, sessionsRepository, {
    pollIntervalMs: 3000, batchSize: 1, enabled: !!env.DATABASE_URL,
  })
  nlToHandRepairWorker.start()

  const toolInvocationRecoveryWorker = new ToolInvocationRecoveryWorker(store, artifactStore, {
    enabled: !!env.DATABASE_URL, pollIntervalMs: 30000, staleAfterMs: 120000, batchSize: 20,
  })
  toolInvocationRecoveryWorker.start()

  const runRecoveryWorker = new RunRecoveryWorker(store, toolInvocationRecoveryWorker, {
    enabled: !!env.DATABASE_URL, pollIntervalMs: 30000, staleAfterMs: 120000, batchSize: 20,
    resumeRun: async (runId) => {
      const run = await store.getRun(runId)
      return run ? runManager.resumeRun(run) : false
    },
  })
  runRecoveryWorker.start()

  logger.info('[Container] All dependencies initialized', {
    agents: a2aRouter.listAgentIds(),
    entryAgents: executorRouter.listAgentIds(),
    storeType: env.DATABASE_URL ? 'mysql' : 'memory',
  })

  return {
    runManager, a2aClient, a2aRouter, a2aPolicy, store, artifactStore,
    agentsService: new AgentsService(a2aRouter),
    artifactsService: new ArtifactsService(artifactStore),
    workflowRunner, workflowRegistry, workflowStore, humanGate,
    artifactVersionManager: new ArtifactVersionManager(artifactStore),
    projectsService: new ProjectsService(),
    memoryStore, memoryRetriever, agentTaskWorker,
    toolInvocationRecoveryWorker, runRecoveryWorker, nlToHandRepairWorker,
    capabilityRouter, pluginRegistry,
  }
}

export const container = createContainer()

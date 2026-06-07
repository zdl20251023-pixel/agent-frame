import type {
  AgentPlugin,
  PluginContext,
  PluginAgentDefinition,
  ToolDefinition,
  WorkflowDefinition,
  ArtifactTypeDefinition,
} from './plugin.types.js'
import type { CapabilityHints } from '@agent-frame/shared'
import type {
  PluginAgentRuntimeDefinition,
  PluginWorkflowRuntimeDefinition,
} from './plugin-runtime.types.js'
import { logger } from '../shared/observability/logger.js'
import { toolRegistry } from '../ai/tools/tool-factory.js'

// ============================================================
// plugins/plugin-context.ts — 完整 PluginContext 实现
//
// 设计依据：FRAMEWORK_DESIGN §12 plugins/ 插件注册层
//
// PluginContext 是每个插件注册时拿到的"安全上下文"
// - 它隔离插件与核心注册表，让插件只能注册，不能查询或修改其他插件数据
// - 每个 Plugin 得到自己独立的 PluginContext 实例
// - PluginContextFactory 负责构建 PluginContext 并绑定到 PluginRegistry 的内部存储
//
// 扩展能力（相对于原来 plugin.types.ts 中的类型定义）：
// - 支持 onBeforeRunStart / onAfterRunComplete 生命周期钩子（框架预留）
// - 支持 setMetadata 写入插件自己的元数据（便于 GET /plugins 展示）
// ============================================================

/** 插件可扩展的生命周期钩子（框架调用，MVP 阶段预留接口）*/
export type PluginLifecycleHooks = {
  /** 在 Run 开始执行之前调用（可用于注入 Memory、Context 等）*/
  onBeforeRunStart?: (runId: string, agentId: string) => void | Promise<void>
  /** 在 Run 完成后调用（可用于归档、触发后续任务等）*/
  onAfterRunComplete?: (runId: string, agentId: string, status: string) => void | Promise<void>
}

/** 完整 PluginContext：插件注册时的唯一操作入口 */
export type FullPluginContext = PluginContext & {
  /** 注册生命周期钩子（MVP 阶段框架预留，暂不强制调用）*/
  registerLifecycleHooks?: (hooks: PluginLifecycleHooks) => void
  /** 读取当前插件 ID（供插件内部使用）*/
  getPluginId: () => string
  /** 在日志中打印插件消息（自动带上 pluginId 上下文）*/
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void
}

/** 注册结果的内部存储（由 PluginContextFactory 管理）*/
export type PluginRegistrations = {
  agents: Map<string, PluginAgentDefinition>
  agentRuntimes: Map<string, PluginAgentRuntimeDefinition>
  capabilityHints: Map<string, CapabilityHints>
  tools: Map<string, ToolDefinition>
  workflows: Map<string, WorkflowDefinition>
  workflowRuntimes: Map<string, PluginWorkflowRuntimeDefinition>
  artifactTypes: Map<string, ArtifactTypeDefinition>
  lifecycleHooks: Map<string, PluginLifecycleHooks>
}

/**
 * PluginContextFactory — 为每个插件创建独立的 FullPluginContext
 *
 * 工厂每次 build() 调用返回新的 PluginContext 实例。
 * 所有注册操作写入传入的共享 PluginRegistrations 对象。
 */
export class PluginContextFactory {
  constructor(private readonly store: PluginRegistrations) {}

  build(plugin: AgentPlugin): FullPluginContext {
    const pluginId = plugin.id
    const store = this.store

    return {
      getPluginId: () => pluginId,

      log: (level, message) => {
        logger[level](`[Plugin:${pluginId}] ${message}`)
      },

      registerAgent: (agent: PluginAgentDefinition) => {
        if (store.agents.has(agent.id)) {
          logger.warn('[PluginContext] Agent already registered', { agentId: agent.id, pluginId })
          return
        }
        store.agents.set(agent.id, agent)
        logger.info('[PluginContext] Agent registered', { agentId: agent.id, pluginId })
      },

      registerAgentRuntime: (runtime: PluginAgentRuntimeDefinition) => {
        if (store.agentRuntimes.has(runtime.id)) {
          logger.warn('[PluginContext] Agent runtime already registered', { agentId: runtime.id, pluginId })
          return
        }
        store.agentRuntimes.set(runtime.id, runtime)
        if (runtime.capabilityHints) {
          store.capabilityHints.set(runtime.id, runtime.capabilityHints)
        }
        logger.info('[PluginContext] Agent runtime registered', { agentId: runtime.id, pluginId })
      },

      registerCapabilityHints: (hints: CapabilityHints) => {
        store.capabilityHints.set(hints.agentId, hints)
        logger.info('[PluginContext] Capability hints registered', { agentId: hints.agentId, pluginId })
      },

      registerTool: (tool: ToolDefinition) => {
        if (store.tools.has(tool.id)) {
          logger.warn('[PluginContext] Tool already registered', { toolId: tool.id, pluginId })
          return
        }
        store.tools.set(tool.id, tool)
        if (tool.runtimeFactory) {
          toolRegistry.register(tool.id, tool.runtimeFactory)
          logger.info('[PluginContext] Tool runtime registered', { toolId: tool.id, pluginId })
        }
        logger.info('[PluginContext] Tool registered', { toolId: tool.id, pluginId })
      },

      registerWorkflow: (workflow: WorkflowDefinition) => {
        if (store.workflows.has(workflow.id)) {
          logger.warn('[PluginContext] Workflow already registered', {
            workflowId: workflow.id,
            pluginId,
          })
          return
        }
        store.workflows.set(workflow.id, workflow)
        store.workflowRuntimes.set(workflow.id, {
          id: workflow.id,
          definition: workflow,
        })
        logger.info('[PluginContext] Workflow registered', { workflowId: workflow.id, pluginId })
      },

      registerWorkflowRuntime: (runtime: PluginWorkflowRuntimeDefinition) => {
        if (store.workflowRuntimes.has(runtime.id)) {
          logger.warn('[PluginContext] Workflow runtime already registered', {
            workflowId: runtime.id,
            pluginId,
          })
          return
        }
        store.workflowRuntimes.set(runtime.id, runtime)
        store.workflows.set(runtime.definition.id, runtime.definition)
        logger.info('[PluginContext] Workflow runtime registered', {
          workflowId: runtime.id,
          pluginId,
        })
      },

      registerArtifactType: (type: ArtifactTypeDefinition) => {
        if (store.artifactTypes.has(type.id)) {
          logger.warn('[PluginContext] ArtifactType already registered', {
            typeId: type.id,
            pluginId,
          })
          return
        }
        store.artifactTypes.set(type.id, type)
        logger.info('[PluginContext] ArtifactType registered', { typeId: type.id, pluginId })
      },

      registerLifecycleHooks: (hooks: PluginLifecycleHooks) => {
        store.lifecycleHooks.set(pluginId, hooks)
        logger.debug('[PluginContext] Lifecycle hooks registered', { pluginId })
      },
    }
  }
}

import type { AgentPlugin, PluginContext, ToolDefinition, WorkflowDefinition, ArtifactTypeDefinition } from './plugin.types.js'
import type { AgentDefinition } from '@agent-frame/shared'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// PluginRegistry — 插件注册和查询
// MVP 阶段内置插件手动注册，未来可支持动态加载
// ============================================================

export class PluginRegistry {
  private plugins = new Map<string, AgentPlugin>()
  private agents = new Map<string, AgentDefinition>()
  private tools = new Map<string, ToolDefinition>()
  private workflows = new Map<string, WorkflowDefinition>()
  private artifactTypes = new Map<string, ArtifactTypeDefinition>()

  register(plugin: AgentPlugin): this {
    if (this.plugins.has(plugin.id)) {
      logger.warn('[PluginRegistry] Plugin already registered, skipping', { pluginId: plugin.id })
      return this
    }

    const ctx: PluginContext = {
      registerAgent: (agent) => {
        this.agents.set(agent.id, agent)
        logger.debug('[PluginRegistry] Agent registered', { agentId: agent.id })
      },
      registerTool: (tool) => {
        this.tools.set(tool.id, tool)
        logger.debug('[PluginRegistry] Tool registered', { toolId: tool.id })
      },
      registerWorkflow: (workflow) => {
        this.workflows.set(workflow.id, workflow)
        logger.debug('[PluginRegistry] Workflow registered', { workflowId: workflow.id })
      },
      registerArtifactType: (type) => {
        this.artifactTypes.set(type.id, type)
        logger.debug('[PluginRegistry] ArtifactType registered', { typeId: type.id })
      },
    }

    plugin.register(ctx)
    this.plugins.set(plugin.id, plugin)
    logger.info('[PluginRegistry] Plugin registered', { pluginId: plugin.id, name: plugin.name })
    return this
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id)
  }

  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values())
  }

  listPlugins(): AgentPlugin[] {
    return Array.from(this.plugins.values())
  }
}

/** 全局 PluginRegistry 单例 */
export const pluginRegistry = new PluginRegistry()

import type { AgentPlugin, PluginAgentDefinition, ToolDefinition, WorkflowDefinition, ArtifactTypeDefinition } from './plugin.types.js'
import { logger } from '../shared/observability/logger.js'
import { PluginContextFactory, type PluginRegistrations } from './plugin-context.js'

// ============================================================
// plugins/plugin-registry.ts — 插件注册和查询（升级版）
//
// 设计依据：FRAMEWORK_DESIGN §12 plugins/ 插件注册层
//
// 升级内容（相对于原来简单版本）：
// - 使用 PluginContextFactory 构建每个插件的独立 FullPluginContext
// - 内部共享 PluginRegistrations 存储（一个 Map 结构）
// - 新增 listTools / listWorkflows / listArtifactTypes 查询方法
// - 新增 getPlugin() 查询单个插件元数据
// - 新增生命周期钩子调用入口（callBeforeRunStart / callAfterRunComplete）
// ============================================================

export class PluginRegistry {
  private plugins = new Map<string, AgentPlugin>()

  // 共享注册存储，由 PluginContextFactory 写入
  private readonly store: PluginRegistrations = {
    agents: new Map<string, PluginAgentDefinition>(),
    tools: new Map<string, ToolDefinition>(),
    workflows: new Map<string, WorkflowDefinition>(),
    artifactTypes: new Map<string, ArtifactTypeDefinition>(),
    lifecycleHooks: new Map(),
  }

  private readonly contextFactory = new PluginContextFactory(this.store)

  /** 注册插件（幂等：同 ID 只注册一次）*/
  register(plugin: AgentPlugin): this {
    if (this.plugins.has(plugin.id)) {
      logger.warn('[PluginRegistry] Plugin already registered, skipping', { pluginId: plugin.id })
      return this
    }

    const ctx = this.contextFactory.build(plugin)
    plugin.register(ctx)
    this.plugins.set(plugin.id, plugin)

    logger.info('[PluginRegistry] Plugin registered', { pluginId: plugin.id, name: plugin.name })
    return this
  }

  // ─── Agent 查询 ────────────────────────────────────────────

  getAgent(id: string): PluginAgentDefinition | undefined {
    return this.store.agents.get(id)
  }

  listAgents(): PluginAgentDefinition[] {
    return Array.from(this.store.agents.values())
  }

  hasAgent(id: string): boolean {
    return this.store.agents.has(id)
  }

  // ─── Tool 查询 ─────────────────────────────────────────────

  getTool(id: string): ToolDefinition | undefined {
    return this.store.tools.get(id)
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.store.tools.values())
  }

  // ─── Workflow 查询 ─────────────────────────────────────────

  getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.store.workflows.get(id)
  }

  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.store.workflows.values())
  }

  // ─── ArtifactType 查询 ─────────────────────────────────────

  getArtifactType(id: string): ArtifactTypeDefinition | undefined {
    return this.store.artifactTypes.get(id)
  }

  listArtifactTypes(): ArtifactTypeDefinition[] {
    return Array.from(this.store.artifactTypes.values())
  }

  // ─── Plugin 查询 ───────────────────────────────────────────

  getPlugin(id: string): AgentPlugin | undefined {
    return this.plugins.get(id)
  }

  listPlugins(): AgentPlugin[] {
    return Array.from(this.plugins.values())
  }

  // ─── 生命周期钩子调用 ──────────────────────────────────────

  /** 触发所有插件的 onBeforeRunStart 钩子（非阻塞，仅 fire-and-forget）*/
  async callBeforeRunStart(runId: string, agentId: string): Promise<void> {
    for (const [pluginId, hooks] of this.store.lifecycleHooks.entries()) {
      if (hooks.onBeforeRunStart) {
        try {
          await hooks.onBeforeRunStart(runId, agentId)
        } catch {
          logger.warn('[PluginRegistry] onBeforeRunStart hook failed', {
            pluginId,
            runId,
            agentId,
            errorCode: 'HOOK_ERROR',
          })
        }
      }
    }
  }

  /** 触发所有插件的 onAfterRunComplete 钩子（非阻塞）*/
  async callAfterRunComplete(runId: string, agentId: string, status: string): Promise<void> {
    for (const [pluginId, hooks] of this.store.lifecycleHooks.entries()) {
      if (hooks.onAfterRunComplete) {
        try {
          await hooks.onAfterRunComplete(runId, agentId, status)
        } catch {
          logger.warn('[PluginRegistry] onAfterRunComplete hook failed', {
            pluginId,
            runId,
            agentId,
            errorCode: 'HOOK_ERROR',
          })
        }
      }
    }
  }

  /** 摘要信息（供 /plugins 端点使用）*/
  summary() {
    return {
      pluginCount: this.plugins.size,
      agentCount: this.store.agents.size,
      toolCount: this.store.tools.size,
      workflowCount: this.store.workflows.size,
      artifactTypeCount: this.store.artifactTypes.size,
    }
  }
}

/** 全局 PluginRegistry 单例 */
export const pluginRegistry = new PluginRegistry()

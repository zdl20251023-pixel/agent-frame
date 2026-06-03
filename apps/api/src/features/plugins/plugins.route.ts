import { Elysia, t } from 'elysia'
import { pluginRegistry } from '../../plugins/plugin-registry.js'
import { isAppError } from '../../shared/errors/app-error.js'

// ============================================================
// features/plugins/ — Plugin 查询 API
//
// 设计依据：FRAMEWORK_DESIGN §12 plugins/ 插件注册层
//
// 路由：
// GET /plugins                      — 列出所有已注册插件（含摘要）
// GET /plugins/agents               — 列出所有通过插件注册的 Agent 定义
// GET /plugins/tools                — 列出所有注册的 Tool 定义
// GET /plugins/workflows            — 列出所有注册的 Workflow 模板
// GET /plugins/artifact-types       — 列出所有注册的 Artifact 类型定义
// GET /plugins/:pluginId            — 查询单个插件详情
// ============================================================

export const pluginsRoute = new Elysia({ prefix: '/plugins' })

  // GET /plugins — 插件列表 + 摘要
  .get('/', () => ({
    ...pluginRegistry.summary(),
    plugins: pluginRegistry.listPlugins().map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
    })),
  }))

  // GET /plugins/agents — 通过插件注册的所有 Agent 定义
  .get('/agents', () => ({
    agents: pluginRegistry.listAgents(),
    total: pluginRegistry.listAgents().length,
  }))

  // GET /plugins/tools — 工具列表
  .get('/tools', () => ({
    tools: pluginRegistry.listTools(),
    total: pluginRegistry.listTools().length,
  }))

  // GET /plugins/workflows — Workflow 模板列表
  .get('/workflows', () => ({
    workflows: pluginRegistry.listWorkflows(),
    total: pluginRegistry.listWorkflows().length,
  }))

  // GET /plugins/artifact-types — Artifact 类型列表
  .get('/artifact-types', () => ({
    artifactTypes: pluginRegistry.listArtifactTypes(),
    total: pluginRegistry.listArtifactTypes().length,
  }))

  // GET /plugins/:pluginId — 单个插件详情
  .get(
    '/:pluginId',
    ({ params, set }) => {
      const plugin = pluginRegistry.getPlugin(params.pluginId)
      if (!plugin) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Plugin not found: ${params.pluginId}` }
      }
      return {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
      }
    },
    { params: t.Object({ pluginId: t.String() }) },
  )

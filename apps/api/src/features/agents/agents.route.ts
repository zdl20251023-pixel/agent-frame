import { Elysia, t } from 'elysia'
import { container } from '../../container.js'

// ============================================================
// Agents Feature — Agent 列表和能力查询 API
// 通过 AgentsService 统一查询，不直接访问 A2ARouter
// ============================================================

export const agentsRoute = new Elysia({ prefix: '/agents' })

  // GET /agents — 列出所有 Agent（含注册状态）
  .get('/', () => ({
    agents: container.agentsService.listAgents(),
  }))

  // GET /agents/:agentId — 查询 Agent 详情（含 capability）
  .get(
    '/:agentId',
    ({ params, set }) => {
      const agent = container.agentsService.getAgent(params.agentId)
      if (!agent) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Agent not found: ${params.agentId}` }
      }
      return agent
    },
    {
      params: t.Object({ agentId: t.String() }),
    },
  )

  // GET /agents/:agentId/capability — 仅返回能力描述
  .get(
    '/:agentId/capability',
    ({ params, set }) => {
      const capability = container.agentsService.getCapability(params.agentId)
      if (!capability) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `Agent not found: ${params.agentId}` }
      }
      return capability
    },
    {
      params: t.Object({ agentId: t.String() }),
    },
  )

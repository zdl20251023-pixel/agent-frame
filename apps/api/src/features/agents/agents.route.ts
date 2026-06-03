import { Elysia } from 'elysia'
import { A2A_CALL_MODES, ARTIFACT_TYPES } from '@agent-frame/shared'
import { container } from '../../container.js'
import { RESEARCH_AGENT_ID } from '../../ai/agents/research.agent.js'
import { SUMMARY_AGENT_ID } from '../../ai/agents/summary.agent.js'
import { SUPERVISOR_AGENT_ID } from '../../ai/agents/supervisor.agent.js'

// ============================================================
// Agents Feature — Agent 列表和能力查询
// ============================================================

const AGENT_DEFINITIONS = [
  {
    id: SUPERVISOR_AGENT_ID,
    name: 'Supervisor Agent',
    description: '调度 Agent，负责分析任务并调用专业 Agent',
    capability: {
      id: SUPERVISOR_AGENT_ID,
      name: 'Task Dispatch',
      description: '分析用户任务，调度合适的专业 Agent 协作完成',
      supportedModes: [A2A_CALL_MODES.SYNC],
      costLevel: 'medium',
      maxRuntimeMs: 120000,
    },
  },
  {
    id: RESEARCH_AGENT_ID,
    name: 'Research Agent',
    description: '专业研究分析 Agent，负责信息检索和深度分析',
    capability: {
      id: RESEARCH_AGENT_ID,
      name: 'Research & Analysis',
      description: '对给定问题进行深度研究和分析',
      supportedModes: [A2A_CALL_MODES.SYNC],
      costLevel: 'medium',
      maxRuntimeMs: 60000,
      inputArtifactTypes: [],
      outputArtifactTypes: [ARTIFACT_TYPES.RESEARCH_REPORT],
    },
  },
  {
    id: SUMMARY_AGENT_ID,
    name: 'Summary Agent',
    description: '内容总结 Agent，将长文本浓缩为简洁摘要',
    capability: {
      id: SUMMARY_AGENT_ID,
      name: 'Content Summarization',
      description: '将给定内容总结为简洁摘要',
      supportedModes: [A2A_CALL_MODES.SYNC],
      costLevel: 'low',
      maxRuntimeMs: 30000,
    },
  },
]

export const agentsRoute = new Elysia({ prefix: '/agents' })
  .get('/', () => ({
    agents: AGENT_DEFINITIONS.map(({ id, name, description }) => ({ id, name, description })),
  }))
  .get('/:agentId', ({ params, set }) => {
    const agent = AGENT_DEFINITIONS.find((a) => a.id === params.agentId)
    if (!agent) {
      set.status = 404
      return { code: 'NOT_FOUND', message: `Agent not found: ${params.agentId}` }
    }
    return agent
  })
  .get('/:agentId/capability', ({ params, set }) => {
    const agent = AGENT_DEFINITIONS.find((a) => a.id === params.agentId)
    if (!agent) {
      set.status = 404
      return { code: 'NOT_FOUND', message: `Agent not found: ${params.agentId}` }
    }
    return agent.capability
  })

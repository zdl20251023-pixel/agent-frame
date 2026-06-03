import type { A2ARouter } from '../../a2a/a2a-router.js'
import { A2A_CALL_MODES, ARTIFACT_TYPES } from '@agent-frame/shared'
import {
  SUPERVISOR_AGENT_ID,
  RESEARCH_AGENT_ID,
  SUMMARY_AGENT_ID,
} from '../../ai/agents/agent-ids.js'

// ============================================================
// AgentsService — Agent 能力查询服务
//
// 设计决策：
// - 静态定义每个 Agent 的 capability 元数据（id、name、描述、支持模式等）
// - 动态检查 a2aRouter 确认该 Agent 是否已注册（可被调用）
// - 后续 Plugin 注册 Agent 后，service 会自动包含它们
// ============================================================

export type AgentSummary = {
  id: string
  name: string
  description: string
  registered: boolean
}

export type AgentCapability = {
  id: string
  name: string
  description: string
  supportedModes: string[]
  costLevel: 'low' | 'medium' | 'high'
  riskLevel?: 'low' | 'medium' | 'high'
  maxRuntimeMs: number
  inputArtifactTypes?: string[]
  outputArtifactTypes?: string[]
  permissions?: string[]
}

export type AgentDetail = {
  id: string
  name: string
  description: string
  registered: boolean
  capability: AgentCapability
}

/** 静态 Agent 元数据注册表 */
const AGENT_METADATA: Record<string, Omit<AgentDetail, 'registered'>> = {
  [SUPERVISOR_AGENT_ID]: {
    id: SUPERVISOR_AGENT_ID,
    name: 'Supervisor Agent',
    description: '调度 Agent，负责分析任务、拆解子任务、调用专业 Agent 并汇总最终结果',
    capability: {
      id: SUPERVISOR_AGENT_ID,
      name: 'Task Dispatch',
      description: '分析用户任务，调度合适的专业 Agent 协作完成',
      supportedModes: [A2A_CALL_MODES.SYNC],
      costLevel: 'medium',
      riskLevel: 'low',
      maxRuntimeMs: 120000,
      permissions: [],
    },
  },
  [RESEARCH_AGENT_ID]: {
    id: RESEARCH_AGENT_ID,
    name: 'Research Agent',
    description: '专业研究分析 Agent，对给定问题进行深度研究和信息检索，结果写入 Artifact',
    capability: {
      id: RESEARCH_AGENT_ID,
      name: 'Research & Analysis',
      description: '对给定问题进行深度研究和分析，产出 research_report Artifact',
      supportedModes: [A2A_CALL_MODES.SYNC],
      costLevel: 'medium',
      riskLevel: 'low',
      maxRuntimeMs: 60000,
      inputArtifactTypes: [],
      outputArtifactTypes: [ARTIFACT_TYPES.RESEARCH_REPORT],
      permissions: [],
    },
  },
  [SUMMARY_AGENT_ID]: {
    id: SUMMARY_AGENT_ID,
    name: 'Summary Agent',
    description: '内容总结 Agent，将长文本浓缩为简洁摘要，结果写入 Artifact',
    capability: {
      id: SUMMARY_AGENT_ID,
      name: 'Content Summarization',
      description: '将给定内容总结为简洁摘要，产出 summary Artifact',
      supportedModes: [A2A_CALL_MODES.SYNC],
      costLevel: 'low',
      riskLevel: 'low',
      maxRuntimeMs: 30000,
      outputArtifactTypes: [ARTIFACT_TYPES.SUMMARY],
      permissions: [],
    },
  },
}

export class AgentsService {
  constructor(private readonly router: A2ARouter) {}

  /**
   * 列出所有已知 Agent（静态元数据 + 动态注册状态）
   */
  listAgents(): AgentSummary[] {
    return Object.values(AGENT_METADATA).map((meta) => ({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      registered: this.router.has(meta.id),
    }))
  }

  /**
   * 查询单个 Agent 详情，包含 capability
   */
  getAgent(agentId: string): AgentDetail | null {
    const meta = AGENT_METADATA[agentId]
    if (!meta) return null
    return {
      ...meta,
      registered: this.router.has(agentId),
    }
  }

  /**
   * 查询 Agent Capability（供 A2A 路由和前端展示）
   */
  getCapability(agentId: string): AgentCapability | null {
    const meta = AGENT_METADATA[agentId]
    return meta?.capability ?? null
  }

  /**
   * 检查 Agent 是否已注册且可调用
   */
  isRegistered(agentId: string): boolean {
    return this.router.has(agentId)
  }
}

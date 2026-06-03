import { get } from '../../lib/http.ts'

// ──────────────────────────────────────────────────────────
// agents.api.ts — 前端 Agent 查询 API 客户端
// 对应后端 GET /agents/* 和 GET /plugins/*
// ──────────────────────────────────────────────────────────

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

export type AgentDetail = AgentSummary & {
  capability: AgentCapability
}

export type PluginInfo = {
  id: string
  name: string
  description?: string
}

export type PluginAgentDef = {
  id: string
  name: string
  description: string
  supportedModes: string[]
  costLevel: 'low' | 'medium' | 'high'
  riskLevel?: 'low' | 'medium' | 'high'
  maxRuntimeMs: number
  outputArtifactTypes?: string[]
}

export type PluginWorkflow = {
  id: string
  name: string
  description?: string
  stages: Array<{
    id: string
    name: string
    agentId?: string
    mode: string
    timeoutMs?: number
  }>
}

export async function listAgents(): Promise<{ agents: AgentSummary[] }> {
  return get('/agents')
}

export async function getAgent(agentId: string): Promise<AgentDetail> {
  return get(`/agents/${agentId}`)
}

export async function listPlugins(): Promise<{
  pluginCount: number
  agentCount: number
  toolCount: number
  workflowCount: number
  artifactTypeCount: number
  plugins: PluginInfo[]
}> {
  return get('/plugins')
}

export async function listPluginAgents(): Promise<{ agents: PluginAgentDef[]; total: number }> {
  return get('/plugins/agents')
}

export async function listPluginWorkflows(): Promise<{
  workflows: PluginWorkflow[]
  total: number
}> {
  return get('/plugins/workflows')
}

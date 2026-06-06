import { useState, useEffect } from 'react'
import type { AgentSummary, PluginInfo, PluginAgentDef, PluginWorkflow } from './agents.api.ts'
import { listAgents, listPlugins, listPluginAgents, listPluginWorkflows } from './agents.api.ts'

// ──────────────────────────────────────────────────────────
// useAgents — 加载 Agent 列表和插件摘要
// ──────────────────────────────────────────────────────────

export type AgentPageData = {
  agents: AgentSummary[]
  pluginSummary: {
    pluginCount: number
    agentCount: number
    toolCount: number
    workflowCount: number
    artifactTypeCount: number
    plugins: PluginInfo[]
  } | null
  pluginAgents: PluginAgentDef[]
  pluginWorkflows: PluginWorkflow[]
  loading: boolean
  error: string | null
}

export function useAgents(): AgentPageData {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [pluginSummary, setPluginSummary] = useState<AgentPageData['pluginSummary']>(null)
  const [pluginAgents, setPluginAgents] = useState<PluginAgentDef[]>([])
  const [pluginWorkflows, setPluginWorkflows] = useState<PluginWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [agentsRes, pluginsRes, agentDefsRes, workflowsRes] = await Promise.all([
          listAgents(),
          listPlugins(),
          listPluginAgents(),
          listPluginWorkflows(),
        ])
        setAgents(agentsRes.agents)
        setPluginSummary(pluginsRes)
        setPluginAgents(agentDefsRes.agents)
        setPluginWorkflows(workflowsRes.workflows)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return { agents, pluginSummary, pluginAgents, pluginWorkflows, loading, error }
}

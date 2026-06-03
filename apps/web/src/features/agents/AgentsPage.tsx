import { useState } from 'react'
import { useAgents } from './useAgents.ts'
import type { AgentSummary, PluginAgentDef, PluginWorkflow } from './agents.api.ts'

// ──────────────────────────────────────────────────────────
// AgentsPage — Agent 列表与能力展示页
// 对应 PERFECTION_PLAN §5.3 (P1)
// ──────────────────────────────────────────────────────────

const COST_COLOR: Record<string, string> = {
  low: '#34d399',
  medium: '#fbbf24',
  high: '#f87171',
}

const COST_LABEL: Record<string, string> = {
  low: '低成本',
  medium: '中等',
  high: '高成本',
}

function AgentCard({ agent, def }: { agent: AgentSummary; def?: PluginAgentDef }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="agent-card">
      <div className="agent-card__header" onClick={() => setExpanded(!expanded)}>
        <div className="agent-card__title-row">
          <div className="agent-card__avatar">
            {agent.name.slice(0, 1)}
          </div>
          <div className="agent-card__meta">
            <div className="agent-card__name">{agent.name}</div>
            <div className="agent-card__id">{agent.id}</div>
          </div>
        </div>
        <div className="agent-card__badges">
          {agent.registered ? (
            <span className="badge badge--green">● 运行中</span>
          ) : (
            <span className="badge badge--gray">○ 未注册</span>
          )}
          {def && (
            <span
              className="badge"
              style={{ color: COST_COLOR[def.costLevel], borderColor: `${COST_COLOR[def.costLevel]}33` }}
            >
              {COST_LABEL[def.costLevel]}
            </span>
          )}
          <span className="agent-card__chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      <p className="agent-card__description">{agent.description}</p>

      {expanded && def && (
        <div className="agent-card__detail">
          <div className="agent-card__detail-grid">
            <div className="agent-detail-item">
              <span className="agent-detail-label">支持模式</span>
              <div className="agent-detail-tags">
                {def.supportedModes.map((m) => (
                  <span key={m} className="tag">{m}</span>
                ))}
              </div>
            </div>
            <div className="agent-detail-item">
              <span className="agent-detail-label">超时限制</span>
              <span className="agent-detail-value">{(def.maxRuntimeMs / 1000).toFixed(0)}s</span>
            </div>
            {def.riskLevel && (
              <div className="agent-detail-item">
                <span className="agent-detail-label">风险等级</span>
                <span className="agent-detail-value">{def.riskLevel}</span>
              </div>
            )}
            {def.outputArtifactTypes && def.outputArtifactTypes.length > 0 && (
              <div className="agent-detail-item">
                <span className="agent-detail-label">输出 Artifact</span>
                <div className="agent-detail-tags">
                  {def.outputArtifactTypes.map((t) => (
                    <span key={t} className="tag tag--blue">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function WorkflowCard({ workflow }: { workflow: PluginWorkflow }) {
  return (
    <div className="workflow-card">
      <div className="workflow-card__header">
        <div className="workflow-card__name">{workflow.name}</div>
        <span className="badge badge--blue">{workflow.stages.length} 阶段</span>
      </div>
      {workflow.description && (
        <p className="workflow-card__desc">{workflow.description}</p>
      )}
      <div className="workflow-stages">
        {workflow.stages.map((stage, i) => (
          <div key={stage.id} className="workflow-stage">
            <div className="workflow-stage__index">{i + 1}</div>
            <div className="workflow-stage__info">
              <span className="workflow-stage__name">{stage.name}</span>
              {stage.agentId && (
                <span className="workflow-stage__agent">{stage.agentId}</span>
              )}
            </div>
            <span className={`workflow-stage__mode mode--${stage.mode}`}>
              {stage.mode}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AgentsPage() {
  const { agents, pluginSummary, pluginAgents, pluginWorkflows, loading, error } = useAgents()
  const [activeTab, setActiveTab] = useState<'agents' | 'workflows' | 'plugins'>('agents')

  if (loading) {
    return (
      <div className="agents-page__loading">
        <div className="spinner" />
        加载 Agent 信息...
      </div>
    )
  }

  if (error) {
    return (
      <div className="agents-page__error">
        <span>⚠ 加载失败</span>
        <p>{error}</p>
      </div>
    )
  }

  // 合并运行时 agent 信息和 plugin 定义
  const defMap = new Map(pluginAgents.map((a) => [a.id, a]))

  return (
    <div className="agents-page">
      <div className="agents-page__header">
        <div className="agents-page__title-row">
          <h1 className="agents-page__title">Agent 能力中心</h1>
          <p className="agents-page__subtitle">管理和查看所有已注册的 Agent、Workflow 和插件</p>
        </div>

        {/* 摘要统计卡片 */}
        {pluginSummary && (
          <div className="agent-stats-row">
            <div className="agent-stat-card">
              <div className="agent-stat-card__value">{pluginSummary.agentCount}</div>
              <div className="agent-stat-card__label">Agent</div>
            </div>
            <div className="agent-stat-card">
              <div className="agent-stat-card__value">{pluginSummary.toolCount}</div>
              <div className="agent-stat-card__label">工具</div>
            </div>
            <div className="agent-stat-card">
              <div className="agent-stat-card__value">{pluginSummary.workflowCount}</div>
              <div className="agent-stat-card__label">Workflow</div>
            </div>
            <div className="agent-stat-card">
              <div className="agent-stat-card__value">{pluginSummary.pluginCount}</div>
              <div className="agent-stat-card__label">插件</div>
            </div>
          </div>
        )}
      </div>

      {/* 选项卡 */}
      <div className="agents-tabs">
        {(['agents', 'workflows', 'plugins'] as const).map((tab) => (
          <button
            key={tab}
            className={`agents-tab ${activeTab === tab ? 'agents-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'agents' ? `Agent (${agents.length})` :
             tab === 'workflows' ? `Workflow (${pluginWorkflows.length})` :
             `插件 (${pluginSummary?.pluginCount ?? 0})`}
          </button>
        ))}
      </div>

      {/* Agent 列表 */}
      {activeTab === 'agents' && (
        <div className="agents-grid">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} def={defMap.get(agent.id)} />
          ))}
        </div>
      )}

      {/* Workflow 模板列表 */}
      {activeTab === 'workflows' && (
        <div className="workflows-grid">
          {pluginWorkflows.length === 0 ? (
            <div className="agents-empty">暂无 Workflow 模板</div>
          ) : (
            pluginWorkflows.map((wf) => <WorkflowCard key={wf.id} workflow={wf} />)
          )}
        </div>
      )}

      {/* 插件列表 */}
      {activeTab === 'plugins' && (
        <div className="plugins-list">
          {pluginSummary?.plugins.map((p) => (
            <div key={p.id} className="plugin-item">
              <div className="plugin-item__header">
                <span className="plugin-item__icon">🧩</span>
                <span className="plugin-item__name">{p.name}</span>
                <span className="plugin-item__id">{p.id}</span>
              </div>
              {p.description && <p className="plugin-item__desc">{p.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

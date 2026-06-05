import type { AgentPlugin } from './plugin.types.js'
import { A2A_CALL_MODES, ARTIFACT_TYPES } from '@agent-frame/shared'
import {
  SUPERVISOR_AGENT_ID,
  RESEARCH_AGENT_ID,
  SUMMARY_AGENT_ID,
} from '../ai/agents/agent-ids.js'
import { pluginRegistry } from './plugin-registry.js'
import { creativeWritingPlugin } from './creative-writing/index.js'

// ============================================================
// plugins/builtin-plugins.ts — 内置 Agent 插件注册
//
// 设计依据：FRAMEWORK_DESIGN §12 plugins/ 插件注册层
//   "builtin-plugins.ts — 内置插件列表，MVP 可注册基础 Agent"
//
// 职责：
// - 将核心 Agent（Supervisor、Research、Summary）注册到 PluginRegistry
// - 每个 Agent 以标准 AgentPlugin 格式注册，便于未来动态加载
// - 同时注册内置 Workflow 模板和 Artifact 类型定义
//
// 注意：
// - builtin-plugins.ts 只负责注册"定义"（元数据），不负责实例化 Agent
// - Agent 实例由 container.ts 中的 A2ARouter 管理
// - 两者共用相同的 agentId，但职责不同（定义 vs 执行）
// ============================================================

// ─── 内置核心 Plugin ──────────────────────────────────────────

const supervisorPlugin: AgentPlugin = {
  id: 'builtin-supervisor',
  name: '核心调度插件',
  description: '注册 Supervisor Agent 及其工具能力，提供任务拆解和多 Agent 协调能力',
  register(ctx) {
    ctx.registerAgent({
      id: SUPERVISOR_AGENT_ID,
      name: 'Supervisor Agent',
      description: '调度 Agent，负责分析任务、拆解子任务、调用专业 Agent 并汇总最终结果',
      supportedModes: [A2A_CALL_MODES.SYNC],
      maxRuntimeMs: 120000,
      costLevel: 'medium',
    })

    ctx.registerTool({
      id: 'dispatch-task',
      name: 'Dispatch Task',
      description: '将任务分发给指定的专业 Agent',
      parameters: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: '目标 Agent ID' },
          task: { type: 'string', description: '任务描述' },
        },
        required: ['agentId', 'task'],
      },
    })

    ctx.log('info', 'Supervisor plugin registered')
  },
}

const researchPlugin: AgentPlugin = {
  id: 'builtin-research',
  name: '研究分析插件',
  description: '注册 Research Agent，提供深度研究和信息检索能力，产出 research_report Artifact',
  register(ctx) {
    ctx.registerAgent({
      id: RESEARCH_AGENT_ID,
      name: 'Research Agent',
      description: '专业研究分析 Agent，对给定问题进行深度研究和信息检索',
      supportedModes: [A2A_CALL_MODES.SYNC],
      maxRuntimeMs: 60000,
      costLevel: 'medium',
      inputArtifactTypes: [],
      outputArtifactTypes: [ARTIFACT_TYPES.RESEARCH_REPORT],
    })

    ctx.registerArtifactType({
      id: ARTIFACT_TYPES.RESEARCH_REPORT,
      name: 'Research Report',
      description: '由 Research Agent 产出的深度研究报告，包含摘要、关键发现和信息来源',
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          findings: { type: 'array', items: { type: 'string' } },
          sources: { type: 'array', items: { type: 'string' } },
        },
      },
    })

    ctx.log('info', 'Research plugin registered')
  },
}

const summaryPlugin: AgentPlugin = {
  id: 'builtin-summary',
  name: '内容总结插件',
  description: '注册 Summary Agent，提供长文本浓缩摘要能力，产出 summary Artifact',
  register(ctx) {
    ctx.registerAgent({
      id: SUMMARY_AGENT_ID,
      name: 'Summary Agent',
      description: '内容总结 Agent，将长文本浓缩为简洁摘要',
      supportedModes: [A2A_CALL_MODES.SYNC],
      maxRuntimeMs: 30000,
      costLevel: 'low',
      outputArtifactTypes: [ARTIFACT_TYPES.SUMMARY],
    })

    ctx.registerArtifactType({
      id: ARTIFACT_TYPES.SUMMARY,
      name: 'Summary',
      description: '由 Summary Agent 产出的内容摘要，浓缩关键信息',
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          wordCount: { type: 'number' },
        },
      },
    })

    ctx.log('info', 'Summary plugin registered')
  },
}

/** 内置 Workflow 模板插件 — 定义可复用的 Workflow */
const builtinWorkflowsPlugin: AgentPlugin = {
  id: 'builtin-workflows',
  name: '内置 Workflow 模板',
  description: '注册内置 Workflow 模板，包含研究报告、内容创作等常见流程',
  register(ctx) {
    ctx.registerWorkflow({
      id: 'research-and-summarize',
      name: '研究 + 总结',
      description: '先由 Research Agent 深度研究，再由 Summary Agent 总结为简洁报告',
      stages: [
        {
          id: 'research',
          name: '深度研究',
          agentId: RESEARCH_AGENT_ID,
          mode: 'sync',
          timeoutMs: 60000,
        },
        {
          id: 'summarize',
          name: '总结提炼',
          agentId: SUMMARY_AGENT_ID,
          mode: 'sync',
          timeoutMs: 30000,
        },
      ],
    })

    ctx.registerWorkflow({
      id: 'human-review',
      name: '人工审核流程',
      description: '由 Agent 完成初稿，再经人工审核确认后发布',
      stages: [
        {
          id: 'draft',
          name: '生成初稿',
          agentId: RESEARCH_AGENT_ID,
          mode: 'sync',
          timeoutMs: 60000,
        },
        {
          id: 'review',
          name: '人工审核',
          mode: 'manual',
        },
      ],
    })

    ctx.log('info', 'Builtin workflows registered')
  },
}

// ─── 批量注册 ──────────────────────────────────────────────────

/**
 * 注册所有内置插件到全局 PluginRegistry
 * 在 container.ts 或应用启动时调用
 */
export function registerBuiltinPlugins(): void {
  pluginRegistry
    .register(supervisorPlugin)
    .register(researchPlugin)
    .register(summaryPlugin)
    .register(builtinWorkflowsPlugin)
    .register(creativeWritingPlugin)
}

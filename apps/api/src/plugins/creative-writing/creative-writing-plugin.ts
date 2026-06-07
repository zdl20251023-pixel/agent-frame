import type { AgentPlugin } from '../plugin.types.js'
import { A2A_CALL_MODES, ARTIFACT_TYPES } from '@agent-frame/shared'
import {
  outlineAgentRuntime,
  writingAgentRuntime,
  reviewAgentRuntime,
} from '../builtin-agent-runtimes.js'
import {
  OUTLINE_AGENT_ID,
  WRITING_AGENT_ID,
  REVIEW_AGENT_ID,
} from './agent-ids.js'

// ============================================================
// creative-writing-plugin.ts — 创意写作业务模板插件
//
// 阶段 5.6 - 第一个业务模板插件
//
// 注册内容：
// 1. 三个专业 Agent：OutlineAgent, WritingAgent, ReviewAgent
// 2. 三种 Artifact 类型：outline / draft / creative_work
// 3. 一个完整 Workflow：creative-writing（三阶段流水线）
// 4. 一个人工审核变体：creative-writing-with-review
//
// 规则：
// - 只注册"定义"（元数据），Agent 实例由 container.ts 管理
// - 不依赖 runtime / a2a 层，只使用 PluginContext 接口
// ============================================================

export const creativeWritingPlugin: AgentPlugin = {
  id: 'creative-writing',
  name: '创意写作插件',
  description: '提供完整的 AI 辅助创意写作流程：大纲规划 → 正文展开 → 润色修订',

  register(ctx) {
    // ── Agent 注册 ───────────────────────────────────────────

    ctx.registerAgent({
      id: OUTLINE_AGENT_ID,
      name: 'Outline Agent',
      description: '根据主题和风格要求，生成清晰有层次的内容大纲',
      supportedModes: [A2A_CALL_MODES.SYNC],
      maxRuntimeMs: 30000,
      costLevel: 'low',
      outputArtifactTypes: [ARTIFACT_TYPES.OUTLINE],
    })
    ctx.registerAgentRuntime(outlineAgentRuntime)

    ctx.registerAgent({
      id: WRITING_AGENT_ID,
      name: 'Writing Agent',
      description: '根据大纲逐节展开流畅、生动的正文内容',
      supportedModes: [A2A_CALL_MODES.SYNC],
      maxRuntimeMs: 120000,
      costLevel: 'medium',
      inputArtifactTypes: [ARTIFACT_TYPES.OUTLINE],
      outputArtifactTypes: [ARTIFACT_TYPES.DRAFT],
    })
    ctx.registerAgentRuntime(writingAgentRuntime)

    ctx.registerAgent({
      id: REVIEW_AGENT_ID,
      name: 'Review Agent',
      description: '对初稿进行语言润色和结构优化，输出高质量成品',
      supportedModes: [A2A_CALL_MODES.SYNC],
      maxRuntimeMs: 60000,
      costLevel: 'medium',
      inputArtifactTypes: [ARTIFACT_TYPES.DRAFT],
      outputArtifactTypes: [ARTIFACT_TYPES.CREATIVE_WORK],
    })
    ctx.registerAgentRuntime(reviewAgentRuntime)

    // ── Artifact 类型注册 ─────────────────────────────────────

    ctx.registerArtifactType({
      id: ARTIFACT_TYPES.OUTLINE,
      name: 'Content Outline',
      description: '由 OutlineAgent 生成的结构化内容大纲，含标题、章节和关键要点',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subtitle: { type: 'string' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                keyPoints: { type: 'array', items: { type: 'string' } },
                targetWords: { type: 'number' },
              },
            },
          },
        },
      },
    })

    ctx.registerArtifactType({
      id: ARTIFACT_TYPES.DRAFT,
      name: 'Writing Draft',
      description: '由 WritingAgent 生成的完整初稿，按大纲逐节展开',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          fullDraft: { type: 'string' },
          wordCount: { type: 'number' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
        },
      },
    })

    ctx.registerArtifactType({
      id: ARTIFACT_TYPES.CREATIVE_WORK,
      name: 'Creative Work',
      description: '由 ReviewAgent 修订后的高质量创意写作成品',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          finalWork: { type: 'string' },
          wordCount: { type: 'number' },
          draftArtifactId: { type: 'string' },
        },
      },
    })

    // ── Workflow 注册 ────────────────────────────────────────

    ctx.registerWorkflow({
      id: 'creative-writing',
      name: '创意写作流水线',
      description: '完整的 AI 辅助写作流程：大纲规划 → 正文展开 → 润色修订',
      stages: [
        {
          id: 'outline',
          name: '大纲规划',
          agentId: OUTLINE_AGENT_ID,
          mode: 'sync',
          timeoutMs: 30000,
        },
        {
          id: 'writing',
          name: '正文展开',
          agentId: WRITING_AGENT_ID,
          mode: 'sync',
          timeoutMs: 120000,
        },
        {
          id: 'review',
          name: '润色修订',
          agentId: REVIEW_AGENT_ID,
          mode: 'sync',
          timeoutMs: 60000,
        },
      ],
    })

    ctx.registerWorkflow({
      id: 'creative-writing-with-review',
      name: '创意写作（含人工审核）',
      description: '在润色修订后加入人工审核环节，适合对输出质量要求较高的场景',
      stages: [
        {
          id: 'outline',
          name: '大纲规划',
          agentId: OUTLINE_AGENT_ID,
          mode: 'sync',
          timeoutMs: 30000,
        },
        {
          id: 'writing',
          name: '正文展开',
          agentId: WRITING_AGENT_ID,
          mode: 'sync',
          timeoutMs: 120000,
        },
        {
          id: 'review',
          name: '润色修订',
          agentId: REVIEW_AGENT_ID,
          mode: 'sync',
          timeoutMs: 60000,
        },
        {
          id: 'human-review',
          name: '人工审核',
          agentId: 'human-gate',
          mode: 'manual',
        },
      ],
    })

    ctx.log('info', 'Creative writing plugin registered')
  },
}

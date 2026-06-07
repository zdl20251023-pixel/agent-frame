import type { PluginAgentRuntimeDefinition } from './plugin-runtime.types.js'
import { ResearchAgent } from '../ai/agents/research.agent.js'
import { SummaryAgent } from '../ai/agents/summary.agent.js'
import { NlToHandAgent } from '../ai/agents/nl-to-hand.agent.js'
import {
  RESEARCH_AGENT_ID,
  SUMMARY_AGENT_ID,
  NL_TO_HAND_AGENT_ID,
} from '../ai/agents/agent-ids.js'
import {
  OUTLINE_AGENT_ID,
  WRITING_AGENT_ID,
  REVIEW_AGENT_ID,
} from './creative-writing/agent-ids.js'
import { OutlineAgent } from './creative-writing/outline.agent.js'
import { WritingAgent } from './creative-writing/writing.agent.js'
import { ReviewAgent } from './creative-writing/review.agent.js'
import { BUILTIN_NL_TO_HAND_HINTS } from '../capabilities/capability-router.js'

// ============================================================
// 内置 Agent Runtime 注册 — 供 Plugin 在 register() 中引用
// ============================================================

export const researchAgentRuntime: PluginAgentRuntimeDefinition = {
  id: RESEARCH_AGENT_ID,
  registerA2A: true,
  factory: (deps) => {
    const agent = new ResearchAgent(deps.modelClient, deps.store, deps.artifactStore)
    return {
      agentId: RESEARCH_AGENT_ID,
      execute: (input, ctx) => agent.execute(input as Parameters<typeof agent.execute>[0], ctx),
    }
  },
}

export const summaryAgentRuntime: PluginAgentRuntimeDefinition = {
  id: SUMMARY_AGENT_ID,
  registerA2A: true,
  factory: (deps) => {
    const agent = new SummaryAgent(deps.modelClient, deps.store, deps.artifactStore)
    return {
      agentId: SUMMARY_AGENT_ID,
      execute: (input, ctx) => agent.execute(input as Parameters<typeof agent.execute>[0], ctx),
    }
  },
}

export const nlToHandAgentRuntime: PluginAgentRuntimeDefinition = {
  id: NL_TO_HAND_AGENT_ID,
  isEntryAgent: true,
  registerA2A: true,
  capabilityHints: BUILTIN_NL_TO_HAND_HINTS,
  factory: (deps) => {
    const agent = new NlToHandAgent(
      deps.modelClient,
      deps.store,
      deps.artifactStore,
      deps.sessionsRepository,
    )
    return {
      agentId: NL_TO_HAND_AGENT_ID,
      execute: (input, ctx) => agent.execute(input as Parameters<typeof agent.execute>[0], ctx),
    }
  },
}

export const outlineAgentRuntime: PluginAgentRuntimeDefinition = {
  id: OUTLINE_AGENT_ID,
  registerA2A: true,
  factory: (deps) => {
    const agent = new OutlineAgent(deps.modelClient, deps.store, deps.artifactStore)
    return {
      agentId: OUTLINE_AGENT_ID,
      execute: (input, ctx) => agent.execute(input as Parameters<typeof agent.execute>[0], ctx),
    }
  },
}

export const writingAgentRuntime: PluginAgentRuntimeDefinition = {
  id: WRITING_AGENT_ID,
  registerA2A: true,
  factory: (deps) => {
    const agent = new WritingAgent(deps.modelClient, deps.store, deps.artifactStore)
    return {
      agentId: WRITING_AGENT_ID,
      execute: (input, ctx) => agent.execute(input as Parameters<typeof agent.execute>[0], ctx),
    }
  },
}

export const reviewAgentRuntime: PluginAgentRuntimeDefinition = {
  id: REVIEW_AGENT_ID,
  registerA2A: true,
  factory: (deps) => {
    const agent = new ReviewAgent(deps.modelClient, deps.store, deps.artifactStore)
    return {
      agentId: REVIEW_AGENT_ID,
      execute: (input, ctx) => agent.execute(input as Parameters<typeof agent.execute>[0], ctx),
    }
  },
}

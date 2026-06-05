// ============================================================
// plugins/creative-writing/index.ts — 公共出口
// ============================================================

export { creativeWritingPlugin } from './creative-writing-plugin.js'
export { OutlineAgent, OUTLINE_AGENT_ID } from './outline.agent.js'
export { WritingAgent, WRITING_AGENT_ID } from './writing.agent.js'
export { ReviewAgent, REVIEW_AGENT_ID } from './review.agent.js'
export type { OutlinePayload, OutlineOutput } from './outline.agent.js'
export type { WritingPayload, WritingOutput } from './writing.agent.js'
export type { ReviewPayload, ReviewOutput } from './review.agent.js'

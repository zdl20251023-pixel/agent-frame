// ============================================================
// Prompt 模板统一管理
// 原则：Prompt 集中维护，方便 A/B 测试、版本迭代和复用
//
// 融合增强（阶段 7）：
// - 在文件末尾初始化 PromptProvider 单例，注册所有 prompt
// - Agent 可通过 promptProvider.get(PROMPT_NAMES.xxx) 获取带 hash 的 prompt
// - 保持对旧字符串导出的完全兼容（不破坏现有 Agent 代码）
// ============================================================

import { promptProvider, PROMPT_NAMES } from './prompt-provider.js'

// ─── Supervisor Agent Prompts ────────────────────────────────

export const SUPERVISOR_PLAN_SYSTEM = `你是一个任务调度专家。
分析用户请求，决定是否需要调用专业 Agent，以 JSON 格式回答：
{
  "needsResearch": true/false,     // 是否需要研究分析
  "needsSummary": true/false,      // 研究后是否需要总结
  "researchQuery": "...",          // 如果需要研究，具体查询内容
  "directAnswer": "..."            // 如果不需要专业Agent，直接回答
}`

export const SUPERVISOR_ANSWER_SYSTEM = `你是一个智能助手，请根据研究结果给用户一个友好、清晰的最终回答。`

export function supervisorAnswerPrompt(userMessage: string, researchFindings: string): string {
  return `用户问题：${userMessage}\n\n研究结果：\n${researchFindings}\n\n请给出最终回答：`
}

export function supervisorPlanPrompt(message: string): string {
  return `用户请求：${message}`
}

// ─── Research Agent Prompts ───────────────────────────────────

export const RESEARCH_SYSTEM = `你是一个专业的研究分析师。
你的任务是根据用户的查询问题，提供详尽、准确、有条理的研究分析报告。
输出格式：清晰分段，包含关键发现和具体信息。`

export function researchPrompt(query: string): string {
  return `请研究以下问题并提供详细分析：\n\n${query}`
}

// ─── Summary Agent Prompts ────────────────────────────────────

export const SUMMARY_SYSTEM = `你是一位专业的内容编辑。
请将以下长文本浓缩成简洁、完整的摘要，保留核心要点，去除冗余细节。
摘要长度：原文的 20%-30%，以清晰的中文呈现。`

export function summaryPrompt(content: string): string {
  return `请对以下内容进行总结：\n\n${content}`
}

// ─── 初始化 PromptProvider 单例（阶段 7 融合增强）───────────────
// 注册所有 prompt，Agent 通过 promptProvider.get(name) 获取带 hash 的 prompt

promptProvider.registerAll([
  {
    name: PROMPT_NAMES.SUPERVISOR_PLAN_SYSTEM,
    version: '1.0.0',
    content: SUPERVISOR_PLAN_SYSTEM,
  },
  {
    name: PROMPT_NAMES.SUPERVISOR_ANSWER_SYSTEM,
    version: '1.0.0',
    content: SUPERVISOR_ANSWER_SYSTEM,
  },
  {
    name: PROMPT_NAMES.RESEARCH_SYSTEM,
    version: '1.0.0',
    content: RESEARCH_SYSTEM,
  },
  {
    name: PROMPT_NAMES.SUMMARY_SYSTEM,
    version: '1.0.0',
    content: SUMMARY_SYSTEM,
  },
])

// 导出 PromptProvider 供 Agent 使用（可选，Agent 可继续用字符串方式）
export { promptProvider, PROMPT_NAMES } from './prompt-provider.js'

import type { AgentEvent } from '@agent-frame/shared'

// ============================================================
// 会话上下文工具函数 — 提取消息、截断、格式化
// ============================================================

/** 上下文字符预算（MVP 用字符近似 token） */
export const CONTEXT_BUDGET = {
  totalChars: 8000,
  maxRecentTurns: 5,
  maxUserMsgChars: 1000,
  maxAssistantChars: 1500,
  maxSessionSummaryChars: 2000,
  maxArtifactRefs: 10,
  maxArtifactSummaryChars: 200,
  longContentThreshold: 1500,
} as const

/**
 * 从 Run input 提取用户消息文本。
 */
export function extractUserMessage(input: unknown): string {
  if (input && typeof input === 'object' && input !== null && 'message' in input) {
    const msg = (input as { message?: unknown }).message
    if (typeof msg === 'string') return msg
  }
  return typeof input === 'string' ? input : ''
}

/**
 * 从 events / output 提取助手最终回答（不含中间过程事件）。
 */
export function buildAssistantText(events: AgentEvent[], output: unknown): string {
  const deltas = events
    .filter((e): e is Extract<AgentEvent, { type: 'message.delta' }> => e.type === 'message.delta')
    .map((e) => e.delta)
    .join('')
  if (deltas) return deltas
  if (output && typeof output === 'object' && output !== null && 'answer' in output) {
    return String((output as { answer?: unknown }).answer ?? '')
  }
  return ''
}

/**
 * 截断文本；长内容保留首尾片段并标注省略。
 */
export function truncateForContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  if (maxChars <= 20) return text.slice(0, maxChars)

  const threshold = CONTEXT_BUDGET.longContentThreshold
  if (text.length > threshold && maxChars >= 120) {
    const head = Math.floor((maxChars - 30) / 2)
    const tail = maxChars - 30 - head
    return `${text.slice(0, head)} …[内容已截断]… ${text.slice(-tail)}`
  }
  return `${text.slice(0, maxChars - 3)}...`
}

/**
 * 将对话轮次格式化为 prompt 文本块。
 */
export function formatTurnsBlock(turns: { userMessage: string; assistantText: string }[]): string {
  if (turns.length === 0) return ''
  const lines = turns.flatMap((turn) => {
    const block: string[] = []
    if (turn.userMessage) block.push(`用户：${turn.userMessage}`)
    if (turn.assistantText) block.push(`助手：${turn.assistantText}`)
    return block
  })
  return `以下是最近对话：\n${lines.join('\n')}`
}

/**
 * 将滚动摘要格式化为 prompt 文本块。
 */
export function formatSummaryBlock(summary: string): string {
  if (!summary.trim()) return ''
  return `以下是更早的对话摘要：\n${summary.trim()}`
}

/**
 * 将 Artifact 引用格式化为 prompt 文本块。
 */
export function formatArtifactRefsBlock(
  refs: { artifactId: string; type: string; title?: string; summary?: string }[],
): string {
  if (refs.length === 0) return ''
  const lines = refs.map((ref) => {
    const title = ref.title ?? ref.type
    const summary = ref.summary ? ` — ${ref.summary}` : ''
    return `- [${ref.type}] ${title} (id=${ref.artifactId})${summary}`
  })
  return `相关产物引用（不含正文，需要时可按需读取）：\n${lines.join('\n')}`
}

/**
 * 在总预算内组装 prompt 文本：优先保留最近对话，其次摘要，最后产物引用。
 */
export function assemblePromptWithinBudget(parts: {
  summary?: string
  turnsBlock: string
  artifactBlock: string
  totalBudget: number
}): { promptText: string; usedChars: number } {
  const sections: string[] = []
  let used = 0

  const tryAdd = (section: string) => {
    if (!section.trim()) return
    const next = used + section.length + (sections.length > 0 ? 2 : 0)
    if (next <= parts.totalBudget) {
      sections.push(section)
      used = next
    }
  }

  // 优先级：最近对话 > 旧摘要 > 产物引用
  tryAdd(parts.turnsBlock)

  if (parts.summary) {
    let summaryText = formatSummaryBlock(parts.summary)
    const remaining = parts.totalBudget - used - 2
    if (summaryText.length > remaining && remaining > 0) {
      summaryText = formatSummaryBlock(truncateForContext(parts.summary, remaining - 20))
    }
    tryAdd(summaryText)
  }

  if (parts.artifactBlock) {
    const remaining = parts.totalBudget - used - 2
    if (remaining > 0) {
      const trimmed =
        parts.artifactBlock.length > remaining
          ? `${parts.artifactBlock.slice(0, remaining - 3)}...`
          : parts.artifactBlock
      tryAdd(trimmed)
    }
  }

  const promptText = sections.join('\n\n')
  return { promptText, usedChars: promptText.length }
}

// ============================================================
// repair.ts — 结构化输出修复 Prompt 生成器
//
// 当第一次 generateObject 输出的 JSON 不符合 Zod schema 时，
// 根据校验失败原因生成修复 prompt，让模型按正确结构重新输出。
// ============================================================

import type { ZodError } from 'zod'

export type RepairPromptInput = {
  /** 原始任务 prompt */
  originalPrompt: string
  /** 模型上一次输出的原始 JSON 字符串 */
  rawOutput: string | undefined
  /** Zod 校验失败的错误对象 */
  zodError: ZodError
  /** 当前是第几次尝试（从 1 开始）*/
  attempt: number
}

/**
 * buildRepairPrompt — 根据 Zod 校验错误构造修复 prompt
 *
 * 修复 prompt 的策略：
 * 1. 展示上一次的输出（帮助模型理解当前格式）
 * 2. 列出具体字段错误（路径 + 期望类型）
 * 3. 要求模型只输出修正后的 JSON，不加任何解释
 */
export function buildRepairPrompt(input: RepairPromptInput): string {
  const { originalPrompt, rawOutput, zodError, attempt } = input

  // 格式化 Zod 错误列表（最多展示 10 个，避免 prompt 过长）
  const errorLines = zodError.issues
    .slice(0, 10)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      return `  - 字段 "${path}": ${issue.message}`
    })
    .join('\n')

  const previousOutputSection = rawOutput
    ? `\n上一次输出（格式错误）：\n\`\`\`json\n${rawOutput.slice(0, 2000)}\n\`\`\``
    : '\n（上一次输出为空或解析失败）'

  return [
    `原始任务：${originalPrompt}`,
    '',
    `【第 ${attempt} 次修复】上一次输出的 JSON 结构不符合要求，请根据以下错误修正后重新输出：`,
    '',
    '字段错误列表：',
    errorLines,
    '',
    previousOutputSection,
    '',
    '请严格按照要求的 JSON 结构重新输出，不要加任何解释、代码块标记或多余文字，只输出纯 JSON 对象：',
  ].join('\n')
}

import { describe, expect, test } from 'bun:test'
import {
  assemblePromptWithinBudget,
  extractUserMessage,
  formatTurnsBlock,
  truncateForContext,
} from '../src/features/sessions/conversation-context.utils.js'

describe('conversation-context.utils', () => {
  test('extractUserMessage 从 input.message 提取', () => {
    expect(extractUserMessage({ message: '你好' })).toBe('你好')
  })

  test('truncateForContext 超长文本会被截断', () => {
    const long = 'a'.repeat(2000)
    const result = truncateForContext(long, 200)
    expect(result.length).toBeLessThanOrEqual(200)
    expect(result).toContain('截断')
  })

  test('formatTurnsBlock 格式化最近对话', () => {
    const block = formatTurnsBlock([
      { userMessage: '写情书', assistantText: '你是我眼中的风景' },
    ])
    expect(block).toContain('用户：写情书')
    expect(block).toContain('助手：你是我眼中的风景')
  })

  test('assemblePromptWithinBudget 优先保留最近对话', () => {
    const turnsBlock = formatTurnsBlock([
      { userMessage: '再写一封', assistantText: '好的' },
    ])
    const { promptText, usedChars } = assemblePromptWithinBudget({
      summary: 'x'.repeat(5000),
      turnsBlock,
      artifactBlock: '',
      totalBudget: 200,
    })
    expect(promptText).toContain('再写一封')
    expect(usedChars).toBeLessThanOrEqual(200)
  })
})

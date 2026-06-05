// ============================================================
// 单元测试：StructuredOutputPipeline + repair
// 注：直接 import zod 在 bun test monorepo 模式下可能解析失败
// 改为从 src 子路径导入，通过 pipeline 的行为间接测试 zod 校验
// ============================================================

import { describe, it, expect } from 'bun:test'
import { executeWithRetry } from '../../../src/ai/structured-output/pipeline.js'
import { buildRepairPrompt } from '../../../src/ai/structured-output/repair.js'
import type { ModelClient } from '../../../src/ai/model-client/model-client.js'
import type { GenerateObjectInput } from '../../../src/ai/model-client/model-client.types.js'

// ─── 备选：通过 pipeline 内部行为测试（无需直接 import zod）

// ─── Mock ModelClient ─────────────────────────────────────────

function makeMockModelClient(responses: unknown[]): ModelClient {
  let callCount = 0
  return {
    generate: async () => ({ text: '' }),
    stream: async function* () {},
    generateObject: async <T>(_input: GenerateObjectInput): Promise<T> => {
      const response = responses[callCount++]
      if (response instanceof Error) throw response
      return response as T
    },
    embed: async () => ({ embeddings: [] }),
  }
}

// ─── 简单 Passthrough Schema（无需 zod）─────────────────────

// 实现一个轻量级 ZodType-compatible schema 用于测试，避免 zod 依赖
function makePassThroughSchema() {
  return {
    safeParse: (data: unknown) => {
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>
        if (typeof obj.name === 'string' && typeof obj.age === 'number') {
          return { success: true as const, data: obj as { name: string; age: number } }
        }
      }
      return {
        success: false as const,
        error: {
          message: 'name must be string, age must be number',
          issues: [
            { path: ['name'], message: 'Expected string' },
            { path: ['age'], message: 'Expected number' },
          ],
        },
      }
    },
  } as any
}

// ─── 测试套件 ─────────────────────────────────────────────────

describe('StructuredOutputPipeline - executeWithRetry', () => {
  const schema = makePassThroughSchema()

  const baseInput: GenerateObjectInput = {
    model: 'fast.chat',
    prompt: 'Generate person info',
    schema,
  }

  it('首次成功时返回 success:true，attempts:1', async () => {
    const mc = makeMockModelClient([{ name: 'Alice', age: 30 }])
    const result = await executeWithRetry(mc, baseInput, schema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Alice')
      expect(result.data.age).toBe(30)
      expect(result.attempts).toBe(1)
    }
  })

  it('第一次返回错误 schema，第二次修复成功', async () => {
    const mc = makeMockModelClient([
      { name: 'Bob', age: 'thirty' },  // age 类型错误
      { name: 'Bob', age: 30 },        // 修复后正确
    ])
    const result = await executeWithRetry(mc, baseInput, schema, { maxAttempts: 3 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.age).toBe(30)
      expect(result.attempts).toBe(2)
    }
  })

  it('超过 maxAttempts 次后返回 success:false', async () => {
    const mc = makeMockModelClient([
      { name: 123 },   // 错误
      { age: 'bad' },  // 错误
      { foo: 'bar' },  // 错误
    ])
    const result = await executeWithRetry(mc, baseInput, schema, { maxAttempts: 3 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.attempts).toBe(3)
      expect(result.error).toContain('after 3 attempts')
    }
  })

  it('模型调用抛出异常时返回 success:false', async () => {
    const mc = makeMockModelClient([new Error('Model unavailable')])
    const result = await executeWithRetry(mc, baseInput, schema, { maxAttempts: 1 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Model call failed')
    }
  })

  it('maxAttempts 默认为 3 次', async () => {
    const mc = makeMockModelClient([null, null, null])
    const result = await executeWithRetry(mc, baseInput, schema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.attempts).toBe(3)
    }
  })
})

describe('buildRepairPrompt', () => {
  const mockZodError = {
    message: 'Validation failed',
    issues: [
      { path: ['name'], message: 'Expected string, received number' },
      { path: ['age'], message: 'Expected number, received string' },
    ],
  }

  it('包含原始 prompt', () => {
    const prompt = buildRepairPrompt({
      originalPrompt: 'Generate user info',
      rawOutput: '{"name":123}',
      zodError: mockZodError as any,
      attempt: 2,
    })
    expect(prompt).toContain('Generate user info')
  })

  it('包含字段错误路径', () => {
    const prompt = buildRepairPrompt({
      originalPrompt: 'test prompt',
      rawOutput: undefined,
      zodError: mockZodError as any,
      attempt: 1,
    })
    expect(prompt).toContain('name')
    expect(prompt).toContain('age')
  })

  it('包含上次输出内容', () => {
    const prompt = buildRepairPrompt({
      originalPrompt: 'test',
      rawOutput: '{"name":123,"age":"bad"}',
      zodError: mockZodError as any,
      attempt: 2,
    })
    expect(prompt).toContain('{"name":123,"age":"bad"}')
  })

  it('上次输出为 undefined 时不崩溃且返回有效字符串', () => {
    const prompt = buildRepairPrompt({
      originalPrompt: 'test',
      rawOutput: undefined,
      zodError: mockZodError as any,
      attempt: 1,
    })
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(10)
  })

  it('包含当前尝试次数', () => {
    const prompt = buildRepairPrompt({
      originalPrompt: 'test',
      rawOutput: undefined,
      zodError: mockZodError as any,
      attempt: 3,
    })
    expect(prompt).toContain('3')
  })
})

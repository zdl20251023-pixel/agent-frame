// ============================================================
// 单元测试：SchemaSanitizer
// ============================================================

import { describe, it, expect } from 'bun:test'
import {
  sanitizeSchema,
  sanitizeForGemini,
  sanitizeForAnthropic,
} from '../../../src/integrations/mcp/schema-sanitizer.js'

describe('SchemaSanitizer', () => {
  // ── additionalProperties 移除 ────────────────────────────

  it('移除顶层 additionalProperties', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false,
    }
    const result = sanitizeSchema(schema, { removeAdditionalProperties: true })
    expect('additionalProperties' in result).toBe(false)
    expect(result.properties?.name.type).toBe('string')
  })

  it('不移除 additionalProperties（选项关闭时）', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
    }
    const result = sanitizeSchema(schema, { removeAdditionalProperties: false })
    expect('additionalProperties' in result).toBe(true)
  })

  // ── 顶层元字段移除 ───────────────────────────────────────

  it('移除 $schema 字段', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {},
    }
    const result = sanitizeSchema(schema)
    expect('$schema' in result).toBe(false)
  })

  it('移除 $id 字段', () => {
    const schema = { $id: 'my-schema', type: 'string' }
    const result = sanitizeSchema(schema)
    expect('$id' in result).toBe(false)
  })

  it('移除 examples 字段', () => {
    const schema = { type: 'string', examples: ['foo', 'bar'] }
    const result = sanitizeSchema(schema)
    expect('examples' in result).toBe(false)
  })

  // ── 递归处理 properties ──────────────────────────────────

  it('递归移除 properties 中的不兼容字段', () => {
    const schema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          examples: ['Alice'],
          deprecated: true,
          description: '姓名',
        },
      },
    }
    const result = sanitizeSchema(schema)
    const nameProp = result.properties!.name
    expect('examples' in nameProp).toBe(false)
    expect('deprecated' in nameProp).toBe(false)
    expect(nameProp.description).toBe('姓名')  // 保留
    expect(nameProp.type).toBe('string')       // 保留
  })

  // ── 递归处理 items ───────────────────────────────────────

  it('递归处理 items 中的 schema', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        $schema: 'draft-07',
      },
    }
    const result = sanitizeSchema(schema, { removeAdditionalProperties: true })
    const items = result.items as Record<string, unknown>
    expect('additionalProperties' in items).toBe(false)
    expect('$schema' in items).toBe(false)
  })

  // ── sanitizeForGemini ────────────────────────────────────

  it('sanitizeForGemini 移除 additionalProperties', () => {
    const schema = {
      type: 'object',
      properties: { x: { type: 'number' } },
      additionalProperties: true,
    }
    const result = sanitizeForGemini(schema as any)
    expect('additionalProperties' in result).toBe(false)
  })

  // ── sanitizeForAnthropic ─────────────────────────────────

  it('sanitizeForAnthropic 移除 additionalProperties', () => {
    const schema = {
      type: 'object',
      additionalProperties: {},
    }
    const result = sanitizeForAnthropic(schema as any)
    expect('additionalProperties' in result).toBe(false)
  })

  // ── 不修改原对象 ──────────────────────────────────────────

  it('不修改传入的原始 schema 对象', () => {
    const original = {
      type: 'object',
      additionalProperties: false,
      $schema: 'draft-07',
    }
    sanitizeSchema(original as any)
    expect('additionalProperties' in original).toBe(true)
    expect('$schema' in original).toBe(true)
  })

  // ── oneOf / anyOf / allOf 递归处理 ───────────────────────

  it('递归处理 anyOf 中的 schema', () => {
    const schema = {
      anyOf: [
        { type: 'string', $schema: 'draft-07' },
        { type: 'number', additionalProperties: false },
      ],
    }
    const result = sanitizeSchema(schema as any, { removeAdditionalProperties: true })
    expect('$schema' in (result.anyOf![0] as object)).toBe(false)
    expect('additionalProperties' in (result.anyOf![1] as object)).toBe(false)
  })
})

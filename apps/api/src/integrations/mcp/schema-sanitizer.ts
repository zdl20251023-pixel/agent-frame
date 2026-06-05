// ============================================================
// SchemaSanitizer — MCP Tool Schema 兼容处理器
//
// 背景：
// - MCP Server 提供的工具 schema 可能使用 JSON Schema 的完整规范
// - Gemini、Anthropic 等 provider 不支持 JSON Schema 中的部分字段
//   （如 additionalProperties、$schema、$id、oneOf 等）
// - 本模块在将 MCP schema 传给 AI SDK 前，移除不兼容字段
//
// 规则：
// - 只在 integrations/mcp/ 内使用，不向 Agent 或 ai/model-client 扩散
// - 保守处理：只移除已知不兼容字段，不改变 schema 语义
// ============================================================

// ─── 需要移除的顶层字段 ─────────────────────────────────────────

const TOP_LEVEL_REMOVE_KEYS = new Set([
  '$schema',
  '$id',
  '$comment',
  'id',
  'title',            // 部分 provider 不支持
  'examples',
  'if',
  'then',
  'else',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contains',
  'minContains',
  'maxContains',
  'deprecated',
  'readOnly',
  'writeOnly',
])

// ─── 属性级别需要移除的字段 ────────────────────────────────────

const PROPERTY_REMOVE_KEYS = new Set([
  '$schema',
  '$id',
  '$comment',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
  'if',
  'then',
  'else',
])

// ─── Schema 类型定义 ──────────────────────────────────────────

type JsonSchemaObject = {
  type?: string | string[]
  properties?: Record<string, JsonSchemaObject>
  items?: JsonSchemaObject | JsonSchemaObject[]
  additionalProperties?: boolean | JsonSchemaObject
  required?: string[]
  oneOf?: JsonSchemaObject[]
  anyOf?: JsonSchemaObject[]
  allOf?: JsonSchemaObject[]
  [key: string]: unknown
}

// ─── 核心清洁函数 ─────────────────────────────────────────────

/**
 * sanitizeForGemini — 移除 Gemini 不支持的 JSON Schema 字段
 *
 * 已知 Gemini 限制：
 * - 不支持 additionalProperties（必须移除）
 * - 不支持 oneOf（部分版本）
 * - 不支持 $schema / $id 等元字段
 */
export function sanitizeForGemini(schema: JsonSchemaObject): JsonSchemaObject {
  return sanitizeSchema(schema, {
    removeAdditionalProperties: true,
    removeOneOf: false,          // Gemini 新版支持 oneOf，保守不删
    targetProvider: 'gemini',
  })
}

/**
 * sanitizeForAnthropic — 移除 Anthropic 不支持的 JSON Schema 字段
 */
export function sanitizeForAnthropic(schema: JsonSchemaObject): JsonSchemaObject {
  return sanitizeSchema(schema, {
    removeAdditionalProperties: true,
    removeOneOf: false,
    targetProvider: 'anthropic',
  })
}

/**
 * sanitizeSchema — 通用 schema 清洁函数
 */
export function sanitizeSchema(
  schema: JsonSchemaObject,
  options: {
    removeAdditionalProperties?: boolean
    removeOneOf?: boolean
    targetProvider?: string
  } = {},
): JsonSchemaObject {
  const { removeAdditionalProperties = true } = options

  // 深拷贝，避免修改原对象
  const cleaned = deepClone(schema)

  return cleanNode(cleaned, { removeAdditionalProperties })
}

function cleanNode(
  node: JsonSchemaObject,
  opts: { removeAdditionalProperties: boolean },
): JsonSchemaObject {
  if (typeof node !== 'object' || node === null) return node

  // 移除顶层不兼容字段
  for (const key of TOP_LEVEL_REMOVE_KEYS) {
    delete node[key]
  }

  // 移除 additionalProperties
  if (opts.removeAdditionalProperties && 'additionalProperties' in node) {
    delete node.additionalProperties
  }

  // 递归处理 properties
  if (node.properties && typeof node.properties === 'object') {
    for (const [propKey, propVal] of Object.entries(node.properties)) {
      if (typeof propVal === 'object' && propVal !== null) {
        // 移除属性级别不兼容字段
        for (const key of PROPERTY_REMOVE_KEYS) {
          delete (propVal as Record<string, unknown>)[key]
        }
        node.properties[propKey] = cleanNode(propVal as JsonSchemaObject, opts)
      }
    }
  }

  // 递归处理 items
  if (node.items) {
    if (Array.isArray(node.items)) {
      node.items = node.items.map((item) => cleanNode(item, opts))
    } else if (typeof node.items === 'object') {
      node.items = cleanNode(node.items as JsonSchemaObject, opts)
    }
  }

  // 递归处理组合关键字
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (Array.isArray(node[key])) {
      node[key] = (node[key] as JsonSchemaObject[]).map((s) => cleanNode(s, opts))
    }
  }

  return node
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

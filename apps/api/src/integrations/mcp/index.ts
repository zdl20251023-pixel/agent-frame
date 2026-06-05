// ============================================================
// integrations/mcp/index.ts — 公共出口
// ============================================================

export { MockMCPAdapter, defaultMCPAdapter } from './mcp-adapter.js'
export type { IMCPAdapter, MCPToolInfo } from './mcp-adapter.js'
export { sanitizeSchema, sanitizeForGemini, sanitizeForAnthropic } from './schema-sanitizer.js'

// ============================================================
// LLM Eval 共享类型定义
// ============================================================

/** 路由用例期望 */
export type RoutingExpected = {
  routeType: 'agent' | 'ask_clarification'
  routeAgentId?: string
  source?: 'explicit' | 'heuristic' | 'default'
  minConfidence?: number
  maxConfidence?: number
}

/** 路由用例 */
export type RoutingCase = {
  id: string
  input: string
  requestedAgentId?: string
  expected: RoutingExpected
}

/** Golden 用例期望 */
export type GoldenExpected = {
  routeAgentId?: string
  mustCallTool: boolean
  mustBeValid?: boolean
  mustCreateArtifact?: boolean
  players?: number
  heroCards?: string
  heroPosition?: string
  schemaMustPass?: boolean
}

/** Golden 用例 */
export type GoldenCase = {
  id: string
  input: string
  requestedAgentId?: string
  expected: GoldenExpected
  /** FakeModel 使用的确定性 tool 输入；缺省时按 mustCallTool 决定是否调用工具 */
  fixture?: {
    mustCallTool?: boolean
    game_hand?: unknown
    fixtureRef?: string
    textDelta?: string
  }
}

/** Patch 用例期望 */
export type PatchExpected = {
  mustCallTool: boolean
  preservedFields: string[]
  changedFields: string[]
  mustBeValid?: boolean
}

/** Patch 用例 */
export type PatchCase = {
  id: string
  input: string
  /** 内联基础牌谱，或与 baseHandRef 二选一 */
  baseHand?: unknown
  /** 引用 BUILTIN_FIXTURES 中的预置手牌作为 patch 基础 */
  baseHandRef?: string
  expected: PatchExpected
  fixture?: {
    game_hand?: unknown
    fixtureRef?: string
    mustCallTool?: boolean
  }
}

/** 单条用例执行结果 */
export type CaseResult = {
  id: string
  suite: 'routing' | 'golden' | 'patch'
  passed: boolean
  durationMs: number
  checks: Record<string, boolean>
  errors: string[]
  details?: Record<string, unknown>
}

/** 聚合指标 */
export type EvalMetrics = {
  route_accuracy: number
  tool_call_rate: number
  schema_success_rate: number
  validation_success_rate: number
  artifact_success_rate: number
  patch_preservation_rate: number
  totalCases: number
  passedCases: number
  failedCases: number
  durationMs: number
}

/** 完整评测报告 */
export type EvalReport = {
  runAt: string
  modelMode: 'fake' | 'real'
  metrics: EvalMetrics
  caseResults: CaseResult[]
  thresholdViolations: string[]
}

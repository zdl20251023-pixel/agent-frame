// ============================================================
// LLM Eval 质量门禁阈值
// 来源：docs/nl_to_hand/chatgpt002.md Issue 2 — Phase 2 质量门禁
// ============================================================

/** 单条指标的门禁配置 */
export type MetricThreshold = {
  /** 指标名称 */
  name: string
  /** 最低通过率（0–1），低于此值视为未达标 */
  minRate: number
  /** 发布阻断线（0–1），低于此值在 --fail-on-regression 时阻断 */
  blockRate: number
}

/** PR CI（FakeModel）门禁阈值 */
export const CI_THRESHOLDS: Record<string, MetricThreshold> = {
  route_accuracy: { name: 'route_accuracy', minRate: 0.9, blockRate: 0.85 },
  tool_call_rate: { name: 'tool_call_rate', minRate: 0.95, blockRate: 0.9 },
  schema_success_rate: { name: 'schema_success_rate', minRate: 0.8, blockRate: 0.7 },
  validation_success_rate: { name: 'validation_success_rate', minRate: 0.8, blockRate: 0.7 },
  patch_preservation_rate: { name: 'patch_preservation_rate', minRate: 0.75, blockRate: 0.65 },
  artifact_success_rate: { name: 'artifact_success_rate', minRate: 0.95, blockRate: 0.9 },
}

/** Nightly（真实模型）期望阈值 — 仅用于报告参考，不用于 PR 阻断 */
export const NIGHTLY_THRESHOLDS: Record<string, MetricThreshold> = {
  route_accuracy: { name: 'route_accuracy', minRate: 0.95, blockRate: 0.85 },
  tool_call_rate: { name: 'tool_call_rate', minRate: 0.98, blockRate: 0.9 },
  schema_success_rate: { name: 'schema_success_rate', minRate: 0.9, blockRate: 0.7 },
  validation_success_rate: { name: 'validation_success_rate', minRate: 0.9, blockRate: 0.7 },
  patch_preservation_rate: { name: 'patch_preservation_rate', minRate: 0.9, blockRate: 0.65 },
  artifact_success_rate: { name: 'artifact_success_rate', minRate: 0.99, blockRate: 0.9 },
}

/**
 * 根据运行模式选择适用的门禁阈值集。
 *
 * @param modelMode - fake（PR CI）或 real（Nightly）
 */
export function getThresholds(modelMode: 'fake' | 'real'): Record<string, MetricThreshold> {
  return modelMode === 'fake' ? CI_THRESHOLDS : NIGHTLY_THRESHOLDS
}

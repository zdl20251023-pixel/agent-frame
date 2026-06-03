// ============================================================
// 所有 Step type 字面量常量
// 避免前后端各自硬编码字符串
// ============================================================

export const STEP_TYPES = {
  MODEL_CALL: 'model_call',
  TOOL_CALL: 'tool_call',
  AGENT_CALL: 'agent_call',
  ARTIFACT_CREATE: 'artifact_create',
  WORKFLOW_STAGE: 'workflow_stage',
} as const

export type StepType = typeof STEP_TYPES[keyof typeof STEP_TYPES]

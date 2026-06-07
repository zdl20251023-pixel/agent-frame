// ============================================================
// 所有 Step type 字面量常量
// 避免前后端各自硬编码字符串
// ============================================================

export const STEP_TYPES = {
  MODEL_CALL: 'model_call',          // 模型调用步骤
  TOOL_CALL: 'tool_call',            // 工具调用步骤
  AGENT_CALL: 'agent_call',          // A2A Agent 调用步骤
  ARTIFACT_CREATE: 'artifact_create', // Artifact 创建或写入步骤
  WORKFLOW_STAGE: 'workflow_stage',  // Workflow 阶段执行步骤
} as const

export type StepType = typeof STEP_TYPES[keyof typeof STEP_TYPES]

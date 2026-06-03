// ============================================================
// Workflow 共享类型定义
// 前后端共用，前端可据此渲染 Workflow 进度
// ============================================================

import type { WorkflowStatus, WorkflowStageStatus, WorkflowStageMode } from '../constants/workflow-constants.js'

// ─── Workflow 定义（静态声明）─────────────────────────────────

export type WorkflowDefinition = {
  id: string
  name: string
  description?: string
  /** Stage 按顺序执行 */
  stages: WorkflowStage[]
  /** 最大重试次数（全局默认，可被 Stage 覆盖） */
  maxRetries?: number
  /** 全局超时（ms） */
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

export type WorkflowStage = {
  id: string
  name: string
  description?: string
  /** 调用的 Agent ID */
  agentId: string
  /** 执行模式：sync / async / manual（人工节点） */
  mode: WorkflowStageMode
  /** Stage 超时（ms），覆盖全局设置 */
  timeoutMs?: number
  /** 最大重试次数（覆盖全局设置） */
  maxRetries?: number
  /** 重试退避基础时间（ms），默认 1000 */
  retryBackoffMs?: number
  /** 期望输入的 Artifact 类型（可选，用于验证） */
  requiredInputArtifactTypes?: string[]
  /** 产出的 Artifact 类型（用于展示） */
  outputArtifactTypes?: string[]
  /** 额外传入 Agent 的静态参数 */
  staticInput?: Record<string, unknown>
  /** 跳过条件（表达式占位，后续版本实现） */
  skipIf?: string
}

// ─── WorkflowRun（运行实例）────────────────────────────────────

export type WorkflowRun = {
  id: string
  /** 关联的主 Run ID（每个 Stage 执行共享同一个 Run） */
  runId: string
  workflowId: string
  status: WorkflowStatus
  currentStageId?: string
  /** 各 Stage 执行状态 */
  stageResults: WorkflowStageResult[]
  /** 等待人工节点时，记录等待的 stageId */
  waitingHumanStageId?: string
  error?: { code: string; message: string }
  createdAt: string
  updatedAt: string
}

export type WorkflowStageResult = {
  stageId: string
  stageName: string
  status: WorkflowStageStatus
  /** A2A 调用产生的 stepId */
  stepId?: string
  output?: unknown
  error?: { code: string; message: string }
  retryCount: number
  startedAt?: string
  completedAt?: string
}

// ─── 人工节点 ──────────────────────────────────────────────────

export type HumanGateRequest = {
  workflowRunId: string
  stageId: string
  /** 人工审核需要查看的上下文（前序 Stage 产出摘要等） */
  context: {
    previousOutputs: { stageId: string; outputPreview: string }[]
    message?: string
  }
  requestedAt: string
}

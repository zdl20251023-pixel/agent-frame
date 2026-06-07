// ============================================================
// Workflow 共享类型定义
// 前后端共用，前端可据此渲染 Workflow 进度
// ============================================================

import type { WorkflowStatus, WorkflowStageStatus, WorkflowStageMode } from '../constants/workflow-constants.js'

// ─── Workflow 定义（静态声明）─────────────────────────────────

export type WorkflowDefinition = {
  id: string          // Workflow 唯一 ID
  name: string        // Workflow 展示名称
  description?: string // Workflow 描述
  stages: WorkflowStage[]            // 按顺序执行的 Stage 列表
  maxRetries?: number                // 最大重试次数（全局默认，可被 Stage 覆盖）
  timeoutMs?: number                 // 全局超时时间（毫秒）
  metadata?: Record<string, unknown> // Workflow 扩展元数据
}

export type WorkflowStage = {
  id: string          // Stage 唯一 ID
  name: string        // Stage 展示名称
  description?: string // Stage 描述
  agentId: string                    // 调用的 Agent ID
  mode: WorkflowStageMode            // 执行模式：sync / async / manual
  timeoutMs?: number                 // Stage 超时时间（毫秒），覆盖全局设置
  maxRetries?: number                // 最大重试次数，覆盖全局设置
  retryBackoffMs?: number            // 重试退避基础时间（毫秒）
  requiredInputArtifactTypes?: string[] // 期望输入的 Artifact 类型
  outputArtifactTypes?: string[]     // 产出的 Artifact 类型
  staticInput?: Record<string, unknown> // 额外传入 Agent 的静态参数
  skipIf?: string                    // 跳过条件表达式占位
}

// ─── WorkflowRun（运行实例）────────────────────────────────────

export type WorkflowRun = {
  id: string                         // WorkflowRun 唯一 ID
  runId: string                      // 关联主 Run ID
  workflowId: string                 // 对应 WorkflowDefinition ID
  status: WorkflowStatus             // WorkflowRun 当前状态
  currentStageId?: string            // 当前正在执行的 Stage ID
  stageResults: WorkflowStageResult[] // 各 Stage 执行结果
  waitingHumanStageId?: string       // 等待人工节点时的 Stage ID
  error?: {                         // WorkflowRun 失败信息
    code: string                    // 错误码
    message: string                 // 错误说明
  }
  createdAt: string                  // 创建时间（ISO 8601）
  updatedAt: string                  // 更新时间（ISO 8601）
}

export type WorkflowStageResult = {
  stageId: string                    // Stage ID
  stageName: string                  // Stage 名称
  status: WorkflowStageStatus        // Stage 当前状态
  stepId?: string                    // A2A 调用产生的 Step ID
  output?: unknown                   // Stage 输出
  error?: {                         // Stage 失败信息
    code: string                    // 错误码
    message: string                 // 错误说明
  }
  retryCount: number                 // 已重试次数
  startedAt?: string                 // 开始时间（ISO 8601）
  completedAt?: string               // 完成时间（ISO 8601）
}

// ─── 人工节点 ──────────────────────────────────────────────────

export type HumanGateRequest = {
  workflowRunId: string              // WorkflowRun ID
  stageId: string                    // 等待人工审批的 Stage ID
  context: {                           // 人工审核需要查看的上下文
    previousOutputs: {              // 前序 Stage 输出摘要项
      stageId: string               // 前序 Stage ID
      outputPreview: string         // 前序 Stage 输出摘要
    }[]                             // 前序 Stage 输出摘要列表
    message?: string              // 展示给审核人的提示信息
  }
  requestedAt: string                // 发起人工审批时间（ISO 8601）
}

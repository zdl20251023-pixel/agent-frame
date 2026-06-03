// ============================================================
// Artifact 核心模型
// ============================================================

export type Artifact = {
  id: string
  runId: string
  projectId?: string
  workflowRunId?: string    // 预留：所属 WorkflowRun
  workflowStageId?: string  // 预留：所属 WorkflowStage
  type: string              // 产物类型：report | outline | script | code | ...
  title?: string
  currentVersionId?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

import type { ArtifactReviewStatus } from '../constants/artifact-constants.js'

export type ArtifactVersion = {
  id: string
  artifactId: string
  version: number            // 从 1 开始递增
  content: unknown           // 实际内容（JSON 序列化存储）
  createdByRunId: string
  createdByStepId?: string
  createdByAgentId?: string
  parentVersionId?: string
  reviewStatus?: ArtifactReviewStatus

  diffSummary?: string       // 相对上一版本的变更摘要
  createdAt: string
}

// 跨 Agent 传递产物引用（避免直接传大对象）
export type ArtifactRef = {
  artifactId: string
  versionId?: string        // 不传则读 currentVersionId
  type: string
  title?: string
}

// Agent 写入 Artifact 时使用
export type ArtifactWriteInput = {
  type: string
  title?: string
  content: unknown
  metadata?: Record<string, unknown>
}

// ============================================================
// Artifact 核心模型
// ============================================================

export type Artifact = {
  id: string                  // Artifact 唯一 ID
  runId: string               // 创建该 Artifact 的 Run ID
  projectId?: string          // 所属项目 ID
  workflowRunId?: string    // 预留：所属 WorkflowRun
  workflowStageId?: string  // 预留：所属 WorkflowStage
  type: string              // 产物类型：report | outline | script | code | ...
  title?: string             // 产物标题
  currentVersionId?: string  // 当前生效版本 ID
  metadata?: Record<string, unknown> // 业务扩展元数据
  createdAt: string          // 创建时间（ISO 8601）
  updatedAt: string          // 更新时间（ISO 8601）
}

import type { ArtifactReviewStatus } from '../constants/artifact-constants.js'

export type ArtifactVersion = {
  id: string                  // ArtifactVersion 唯一 ID
  artifactId: string          // 所属 Artifact ID
  version: number            // 从 1 开始递增
  content: unknown           // 实际内容（JSON 序列化存储）
  createdByRunId: string     // 创建该版本的 Run ID
  createdByStepId?: string   // 创建该版本的 Step ID
  createdByAgentId?: string  // 创建该版本的 Agent ID
  parentVersionId?: string   // 上一版本 ID，用于版本链路追踪
  reviewStatus?: ArtifactReviewStatus // 版本审核状态

  diffSummary?: string       // 相对上一版本的变更摘要
  createdAt: string          // 创建时间（ISO 8601）
}

// 跨 Agent 传递产物引用（避免直接传大对象）
export type ArtifactRef = {
  artifactId: string         // Artifact ID
  versionId?: string        // 不传则读 currentVersionId
  type: string               // Artifact 类型
  title?: string             // Artifact 标题
}

// Agent 写入 Artifact 时使用
export type ArtifactWriteInput = {
  type: string                       // 要写入的 Artifact 类型
  title?: string                     // Artifact 标题
  content: unknown                   // Artifact 内容
  metadata?: Record<string, unknown> // 业务扩展元数据
}

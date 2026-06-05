// ============================================================
// Artifact 类型常量
// ============================================================

export const ARTIFACT_TYPES = {
  SUMMARY: 'summary',
  RESEARCH_REPORT: 'research_report',
  // ─── 创意写作插件（阶段 5.6）────────────────────────────────
  OUTLINE: 'outline',                 // 大纲（OutlineAgent 输出）
  DRAFT: 'draft',                     // 初稿（WritingAgent 输出）
  CREATIVE_WORK: 'creative_work',     // 最终成品（经 ReviewAgent 修订）
} as const

export type ArtifactType = typeof ARTIFACT_TYPES[keyof typeof ARTIFACT_TYPES]

export const ARTIFACT_REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type ArtifactReviewStatus = typeof ARTIFACT_REVIEW_STATUS[keyof typeof ARTIFACT_REVIEW_STATUS]


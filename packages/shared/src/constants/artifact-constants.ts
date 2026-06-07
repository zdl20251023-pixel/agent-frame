// ============================================================
// Artifact 类型常量
// ============================================================

export const ARTIFACT_TYPES = {
  SUMMARY: 'summary',                   // 摘要类产物（SummaryAgent 输出）
  RESEARCH_REPORT: 'research_report',   // 研究报告类产物（ResearchAgent 输出）
  HAND_HISTORY: 'hand_history',         // 扑克牌谱结构化产物（NlToHandAgent 输出）
  // ─── 创意写作插件（阶段 5.6）────────────────────────────────
  OUTLINE: 'outline',                 // 大纲（OutlineAgent 输出）
  DRAFT: 'draft',                     // 初稿（WritingAgent 输出）
  CREATIVE_WORK: 'creative_work',     // 最终成品（经 ReviewAgent 修订）
} as const

export type ArtifactType = typeof ARTIFACT_TYPES[keyof typeof ARTIFACT_TYPES]

export const ARTIFACT_REVIEW_STATUS = {
  PENDING: 'pending',    // 待审核
  APPROVED: 'approved',  // 审核通过
  REJECTED: 'rejected',  // 审核拒绝
} as const

export type ArtifactReviewStatus = typeof ARTIFACT_REVIEW_STATUS[keyof typeof ARTIFACT_REVIEW_STATUS]


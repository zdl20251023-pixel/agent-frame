// ============================================================
// Artifact 类型常量
// ============================================================

export const ARTIFACT_TYPES = {
  SUMMARY: 'summary',
  RESEARCH_REPORT: 'research_report',
} as const

export type ArtifactType = typeof ARTIFACT_TYPES[keyof typeof ARTIFACT_TYPES]

export const ARTIFACT_REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type ArtifactReviewStatus = typeof ARTIFACT_REVIEW_STATUS[keyof typeof ARTIFACT_REVIEW_STATUS]


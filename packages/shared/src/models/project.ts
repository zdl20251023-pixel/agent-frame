// ============================================================
// Project — 长期项目容器类型
// 对应 FRAMEWORK_DESIGN §20.3 Project 数据模型
//
// 设计原则：
// - Project 是用户的长期任务空间（一部小说、一个调研项目、一套自动化任务）
// - Run、Artifact、Memory 都可通过 projectId 归属到 Project
// - MVP 阶段只做 CRUD + 关联查询，不做复杂权限体系
// ============================================================

/** 项目类型 */
export type ProjectType = 'general' | 'creative' | 'research' | 'automation'

/** 项目实体 */
export type Project = {
  id: string
  name: string
  /** 项目类型，例如 general、creative、research、automation */
  type: ProjectType
  /** 项目所有者用户 ID */
  ownerId: string
  description?: string
  /** 扩展元数据：标签、默认 Agent、业务配置等 */
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type CreateProjectInput = {
  name: string
  type?: ProjectType
  description?: string
  metadata?: Record<string, unknown>
}

export type UpdateProjectInput = {
  name?: string
  description?: string
  metadata?: Record<string, unknown>
}

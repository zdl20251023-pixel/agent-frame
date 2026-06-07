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
  id: string          // Project 唯一 ID
  name: string        // 项目名称
  type: ProjectType    // 项目类型，例如 general、creative、research、automation
  ownerId: string      // 项目所有者用户 ID
  description?: string // 项目描述
  metadata?: Record<string, unknown> // 扩展元数据：标签、默认 Agent、业务配置等
  createdAt: string   // 创建时间（ISO 8601）
  updatedAt: string   // 更新时间（ISO 8601）
}

export type CreateProjectInput = {
  name: string                       // 项目名称
  type?: ProjectType                 // 项目类型，默认由服务端决定
  description?: string               // 项目描述
  metadata?: Record<string, unknown> // 扩展元数据
}

export type UpdateProjectInput = {
  name?: string                      // 新项目名称
  description?: string               // 新项目描述
  metadata?: Record<string, unknown> // 新扩展元数据
}

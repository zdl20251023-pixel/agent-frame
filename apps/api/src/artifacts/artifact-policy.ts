// ============================================================
// ArtifactPolicy — 产物访问权限策略
//
// MVP 版本：
// - 产物默认对同一 Run 的用户可见
// - 后续引入 Project 后，可扩展到 project 维度
//
// 设计：
// - ArtifactPolicy 是一个纯函数策略对象，不依赖数据库
// - 复杂场景（ACL 表、动态权限）在此扩展，不影响上层 Service
// ============================================================

export type ArtifactVisibility = 'run' | 'project' | 'public'

export type ArtifactAccessContext = {
  userId?: string
  runId?: string
  projectId?: string
}

export type ArtifactMeta = {
  runId: string
  projectId?: string
  visibility?: ArtifactVisibility
}

export class ArtifactPolicy {
  /**
   * 判断用户是否可读取该 Artifact
   *
   * MVP 规则：
   * - 同 runId 的请求可读
   * - visibility === 'public' 任何人可读
   * - visibility === 'project' 同 projectId 可读（projectId 必须匹配）
   */
  canRead(artifact: ArtifactMeta, context: ArtifactAccessContext): boolean {
    const visibility = artifact.visibility ?? 'run'

    if (visibility === 'public') return true

    if (visibility === 'run') {
      return context.runId === artifact.runId
    }

    if (visibility === 'project') {
      return (
        !!artifact.projectId &&
        !!context.projectId &&
        artifact.projectId === context.projectId
      )
    }

    return false
  }

  /**
   * 判断用户是否可写入（创建新版本）
   * MVP：只有同 runId 的请求可写
   */
  canWrite(artifact: ArtifactMeta, context: ArtifactAccessContext): boolean {
    return context.runId === artifact.runId
  }
}

/** 默认全局策略实例（MVP：宽松模式，同 runId 即可访问）*/
export const artifactPolicy = new ArtifactPolicy()

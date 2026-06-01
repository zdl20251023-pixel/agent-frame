import type { AgentEvent } from '@agent-frame/shared'
import { now } from '../shared/utils/id.js'

// ============================================================
// Artifact 事件构造函数
// 原则：先提交 MySQL 事务，再调用这些函数 emit 事件
// ============================================================

export function artifactCreatedEvent(params: {
  runId: string
  artifactId: string
  artifactType: string
  title?: string
}): Extract<AgentEvent, { type: 'artifact.created' }> {
  return {
    type: 'artifact.created',
    runId: params.runId,
    artifactId: params.artifactId,
    artifactType: params.artifactType,
    title: params.title,
    timestamp: now(),
  }
}

export function artifactVersionCreatedEvent(params: {
  runId: string
  artifactId: string
  versionId: string
  version: number
}): Extract<AgentEvent, { type: 'artifact.version.created' }> {
  return {
    type: 'artifact.version.created',
    runId: params.runId,
    artifactId: params.artifactId,
    versionId: params.versionId,
    version: params.version,
    timestamp: now(),
  }
}

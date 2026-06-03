import type { WorkflowDefinition } from '@agent-frame/shared'
import { AppError } from '../shared/errors/app-error.js'
import { logger } from '../shared/observability/logger.js'

// ============================================================
// WorkflowRegistry — Workflow 定义注册表
//
// 职责：
// - 注册 WorkflowDefinition（代码声明或动态加载）
// - 提供根据 ID 查询的能力
// - 后续可支持从数据库加载持久化的 WorkflowDefinition
// ============================================================

export class WorkflowRegistry {
  private definitions = new Map<string, WorkflowDefinition>()

  register(definition: WorkflowDefinition): this {
    if (this.definitions.has(definition.id)) {
      logger.warn('[WorkflowRegistry] Overwriting existing workflow definition', {
        workflowId: definition.id,
      })
    }
    this.definitions.set(definition.id, definition)
    logger.debug('[WorkflowRegistry] Workflow registered', {
      workflowId: definition.id,
      stageCount: definition.stages.length,
    })
    return this
  }

  get(workflowId: string): WorkflowDefinition {
    const def = this.definitions.get(workflowId)
    if (!def) {
      throw new AppError('NOT_FOUND', `Workflow definition not found: ${workflowId}`, {
        statusCode: 404,
      })
    }
    return def
  }

  has(workflowId: string): boolean {
    return this.definitions.has(workflowId)
  }

  list(): WorkflowDefinition[] {
    return [...this.definitions.values()]
  }
}

import { WORKFLOW_STATUS } from '@agent-frame/shared'
import type { WorkflowStore } from './workflow-store.js'
import { now } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'
import { AppError } from '../shared/errors/app-error.js'

// ============================================================
// HumanGate — 人工节点管理器
//
// 职责：
// - 当 Stage.mode === 'manual' 时，挂起 WorkflowRun 等待审核
// - 提供 approve / reject 接口供外部（API/前端）触发
// - 通过 Promise resolve/reject 将决策结果传回 StageExecutor
// ============================================================

type GatePendingEntry = {
  workflowRunId: string
  stageId: string
  resolve: (decision: 'approved') => void
  reject: (reason: Error) => void
  requestedAt: string
}

export class HumanGateManager {
  /** workflowRunId:stageId -> pending gate */
  private pending = new Map<string, GatePendingEntry>()

  private key(workflowRunId: string, stageId: string): string {
    return `${workflowRunId}:${stageId}`
  }

  /**
   * 挂起当前 Stage 执行，等待人工决策。
   * 返回 Promise，resolve => 继续执行，reject => 跳过或失败。
   */
  async waitForApproval(
    workflowRunId: string,
    stageId: string,
    store: WorkflowStore,
    signal?: AbortSignal,
  ): Promise<void> {
    const k = this.key(workflowRunId, stageId)
    if (this.pending.has(k)) {
      throw new AppError('INTERNAL_ERROR', `Human gate already waiting for ${k}`)
    }

    await store.updateStatus(workflowRunId, WORKFLOW_STATUS.WAITING_HUMAN, {
      waitingHumanStageId: stageId,
    })

    logger.info('[HumanGate] Waiting for human approval', { workflowRunId, stageId })

    return new Promise<void>((resolve, reject) => {
      const entry: GatePendingEntry = {
        workflowRunId,
        stageId,
        resolve: () => resolve(),
        reject,
        requestedAt: now(),
      }
      this.pending.set(k, entry)

      // 如果 AbortSignal 触发（Run 取消），自动 reject
      signal?.addEventListener('abort', () => {
        this.pending.delete(k)
        reject(new DOMException('WorkflowRun cancelled', 'AbortError'))
      }, { once: true })
    })
  }

  /**
   * 审核通过，恢复 Stage 执行
   */
  async approve(workflowRunId: string, stageId: string, store: WorkflowStore): Promise<void> {
    const k = this.key(workflowRunId, stageId)
    const entry = this.pending.get(k)
    if (!entry) {
      throw new AppError('NOT_FOUND', `No pending human gate for ${k}`, { statusCode: 404 })
    }
    this.pending.delete(k)
    await store.updateStatus(workflowRunId, WORKFLOW_STATUS.RUNNING, {
      waitingHumanStageId: undefined,
    })
    logger.info('[HumanGate] Approved', { workflowRunId, stageId })
    entry.resolve('approved')
  }

  /**
   * 审核拒绝，Stage 失败并传播到 WorkflowRunner
   */
  async reject(workflowRunId: string, stageId: string, reason: string, store: WorkflowStore): Promise<void> {
    const k = this.key(workflowRunId, stageId)
    const entry = this.pending.get(k)
    if (!entry) {
      throw new AppError('NOT_FOUND', `No pending human gate for ${k}`, { statusCode: 404 })
    }
    this.pending.delete(k)
    await store.updateStatus(workflowRunId, WORKFLOW_STATUS.RUNNING)
    logger.info('[HumanGate] Rejected', { workflowRunId, stageId, reason })
    entry.reject(new AppError('WORKFLOW_STAGE_FAILED', `Human gate rejected: ${reason}`))
  }

  /**
   * 查询当前所有等待审核的节点
   */
  listPending(): Array<{ workflowRunId: string; stageId: string; requestedAt: string }> {
    return [...this.pending.values()].map(({ workflowRunId, stageId, requestedAt }) => ({
      workflowRunId,
      stageId,
      requestedAt,
    }))
  }
}

/** 全局单例，供 WorkflowRunner 和 API route 共享 */
export const humanGate = new HumanGateManager()

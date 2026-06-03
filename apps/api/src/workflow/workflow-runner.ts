import type { WorkflowDefinition } from '@agent-frame/shared'
import { WORKFLOW_STATUS, EVENT_TYPES } from '@agent-frame/shared'
import type { A2AClient } from '../a2a/a2a-client.js'
import type { RunStore } from '../runtime/stores/run-store.js'
import type { RunContext } from '../runtime/run-manager.js'
import type { WorkflowStore } from './workflow-store.js'
import { StageExecutor } from './stage-executor.js'
import { createRetryPolicy } from './retry-policy.js'
import { RunEventEmitter } from '../runtime/event-emitter.js'
import { now } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'
import { AppError } from '../shared/errors/app-error.js'

// ============================================================
// WorkflowRunner — 按 Stage 顺序编排执行
//
// 职责：
// 1. 创建 WorkflowRun 记录
// 2. 按顺序调用 StageExecutor 执行每个 Stage
// 3. 将前序 Stage 输出传递给后续 Stage
// 4. 发布 workflow.started / workflow.completed / workflow.failed 事件
// 5. Stage 失败时按策略停止或继续（MVP：失败即停）
// ============================================================

export class WorkflowRunner {
  private stageExecutor: StageExecutor
  private emitter: RunEventEmitter

  constructor(
    private a2aClient: A2AClient,
    private workflowStore: WorkflowStore,
    private runStore: RunStore,
  ) {
    this.stageExecutor = new StageExecutor(a2aClient, workflowStore, runStore)
    this.emitter = new RunEventEmitter(runStore)
  }

  /**
   * 创建 WorkflowRun 并异步执行（不阻塞 HTTP 请求）
   */
  async startWorkflowRun(
    definition: WorkflowDefinition,
    context: RunContext,
  ): Promise<string> {
    const { runId, traceId } = context
    const log = logger.child({ runId, traceId, workflowId: definition.id })

    const workflowRun = await this.workflowStore.createWorkflowRun({
      workflowId: definition.id,
      runId,
      stageIds: definition.stages.map((s) => s.id),
      stageNames: definition.stages.map((s) => s.name),
    })

    log.info('[WorkflowRunner] WorkflowRun created', { workflowRunId: workflowRun.id })

    // 异步执行，不阻塞
    this.executeWorkflow(definition, workflowRun.id, context).catch(() => {
      logger.error('[WorkflowRunner] Uncaught workflow error', {
        runId,
        workflowRunId: workflowRun.id,
        errorCode: 'INTERNAL_ERROR',
      })
    })

    return workflowRun.id
  }

  private async executeWorkflow(
    definition: WorkflowDefinition,
    workflowRunId: string,
    context: RunContext,
  ): Promise<void> {
    const { runId, traceId } = context
    const log = logger.child({ runId, traceId, workflowId: definition.id, workflowRunId })

    await this.workflowStore.updateStatus(workflowRunId, WORKFLOW_STATUS.RUNNING)

    await this.emitter.emit({
      type: EVENT_TYPES.WORKFLOW_STARTED,
      runId,
      workflowId: definition.id,
      workflowRunId,
      timestamp: now(),
    } as any)

    log.info('[WorkflowRunner] Workflow execution started')

    const previousOutputs: { stageId: string; output: unknown }[] = []

    try {
      for (const stage of definition.stages) {
        if (context.signal.aborted) {
          throw new AppError('RUN_CANCELLED', 'WorkflowRun cancelled')
        }

        // 每个 Stage 的重试策略：Stage 级配置 > Workflow 级配置 > 默认
        const retryPolicy = createRetryPolicy({
          maxRetries: stage.maxRetries ?? definition.maxRetries,
          retryBackoffMs: stage.retryBackoffMs,
        })

        const result = await this.stageExecutor.execute({
          workflowRunId,
          stage,
          previousOutputs,
          context,
          retryPolicy,
        })

        if (result.status === 'completed') {
          previousOutputs.push({ stageId: stage.id, output: result.output })
        } else {
          // Stage 失败 → Workflow 失败（MVP：fail-fast 策略）
          throw new AppError(
            'WORKFLOW_STAGE_FAILED',
            `Stage "${stage.name}" failed: ${result.error?.message ?? 'unknown'}`,
          )
        }
      }

      // 全部 Stage 完成
      await this.workflowStore.updateStatus(workflowRunId, WORKFLOW_STATUS.COMPLETED)
      await this.emitter.emit({
        type: EVENT_TYPES.WORKFLOW_COMPLETED,
        runId,
        workflowId: definition.id,
        workflowRunId,
        timestamp: now(),
      } as any)

      log.info('[WorkflowRunner] Workflow completed successfully', {
        stageCount: definition.stages.length,
      })
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      const appErr = err instanceof AppError ? err : new AppError('WORKFLOW_STAGE_FAILED', String(err))

      if (isAbort) {
        await this.workflowStore.updateStatus(workflowRunId, WORKFLOW_STATUS.CANCELLED)
        await this.emitter.emit({
          type: EVENT_TYPES.WORKFLOW_CANCELLED,
          runId,
          workflowId: definition.id,
          workflowRunId,
          timestamp: now(),
        } as any)
        log.info('[WorkflowRunner] Workflow cancelled')
      } else {
        await this.workflowStore.updateStatus(workflowRunId, WORKFLOW_STATUS.FAILED, {
          error: { code: appErr.code, message: appErr.message },
        })
        await this.emitter.emit({
          type: EVENT_TYPES.WORKFLOW_FAILED,
          runId,
          workflowId: definition.id,
          workflowRunId,
          error: { code: appErr.code, message: appErr.message },
          timestamp: now(),
        } as any)
        log.error('[WorkflowRunner] Workflow failed', { errorCode: appErr.code })
      }
    }
  }
}

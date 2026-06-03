import type { WorkflowStage, WorkflowStageResult } from '@agent-frame/shared'
import { WORKFLOW_STAGE_STATUS, WORKFLOW_STAGE_MODE, EVENT_TYPES } from '@agent-frame/shared'
import type { A2AClient } from '../a2a/a2a-client.js'
import type { RunContext } from '../runtime/run-manager.js'
import type { WorkflowStore } from './workflow-store.js'
import { RetryPolicy } from './retry-policy.js'
import { humanGate } from './human-gate.js'
import { RunEventEmitter } from '../runtime/event-emitter.js'
import type { RunStore } from '../runtime/stores/run-store.js'
import { A2A_CALL_MODES, A2A_STATUSES } from '@agent-frame/shared'
import { now } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'
import { AppError } from '../shared/errors/app-error.js'

// ============================================================
// StageExecutor — 单个 Stage 的执行控制器
//
// 职责：
// 1. 根据 stage.mode 决定执行方式（sync / manual）
// 2. 通过 A2AClient 调用目标 Agent
// 3. 执行重试策略
// 4. 发布 workflow.stage.* 事件
// 5. 更新 WorkflowStore 中的 stageResult
// ============================================================

export type StageExecutorInput = {
  workflowRunId: string
  stage: WorkflowStage
  /** 前序 Stage 的产出（供当前 Stage 作为输入上下文）*/
  previousOutputs: { stageId: string; output: unknown }[]
  context: RunContext
  retryPolicy: RetryPolicy
}

export class StageExecutor {
  private emitter: RunEventEmitter

  constructor(
    private a2aClient: A2AClient,
    private workflowStore: WorkflowStore,
    runStore: RunStore,
  ) {
    this.emitter = new RunEventEmitter(runStore)
  }

  async execute(input: StageExecutorInput): Promise<WorkflowStageResult> {
    const { workflowRunId, stage, previousOutputs, context, retryPolicy } = input
    const { runId, traceId } = context
    const log = logger.child({ runId, traceId, stageId: stage.id, agentId: stage.agentId })

    // 初始化 stageResult
    const stageResult: WorkflowStageResult = {
      stageId: stage.id,
      stageName: stage.name,
      status: WORKFLOW_STAGE_STATUS.RUNNING,
      retryCount: 0,
      startedAt: now(),
    }
    await this.workflowStore.upsertStageResult(workflowRunId, stageResult)

    // 发出 stage.started 事件
    await this.emitter.emit({
      type: EVENT_TYPES.WORKFLOW_STAGE_STARTED,
      runId,
      stageId: stage.id,
      stageName: stage.name,
      agentId: stage.agentId,
      timestamp: now(),
    } as any)

    log.info('[StageExecutor] Stage started')

    // 人工节点：等待外部审批
    if (stage.mode === WORKFLOW_STAGE_MODE.MANUAL) {
      return this.executeManualStage(workflowRunId, stage, stageResult, context)
    }

    // 自动执行（sync）
    return this.executeAutoStage(workflowRunId, stage, previousOutputs, stageResult, context, retryPolicy)
  }

  private async executeManualStage(
    workflowRunId: string,
    stage: WorkflowStage,
    stageResult: WorkflowStageResult,
    context: RunContext,
  ): Promise<WorkflowStageResult> {
    const { runId } = context
    const log = logger.child({ runId, stageId: stage.id })

    // 发出 human_gate.waiting 事件
    await this.emitter.emit({
      type: EVENT_TYPES.WORKFLOW_HUMAN_GATE_WAITING,
      runId,
      stageId: stage.id,
      stageName: stage.name,
      timestamp: now(),
    } as any)

    try {
      await humanGate.waitForApproval(workflowRunId, stage.id, this.workflowStore, context.signal)

      // 审批通过后继续执行 Agent（如果配置了 agentId）
      await this.emitter.emit({
        type: EVENT_TYPES.WORKFLOW_HUMAN_GATE_APPROVED,
        runId,
        stageId: stage.id,
        timestamp: now(),
      } as any)

      stageResult.status = WORKFLOW_STAGE_STATUS.COMPLETED
      stageResult.completedAt = now()
      log.info('[StageExecutor] Manual stage approved and completed')
    } catch (err) {
      const appErr = err instanceof AppError ? err : new AppError('WORKFLOW_STAGE_FAILED', String(err))
      stageResult.status = WORKFLOW_STAGE_STATUS.FAILED
      stageResult.error = { code: appErr.code, message: appErr.message }
      stageResult.completedAt = now()
      await this.emitter.emit({
        type: EVENT_TYPES.WORKFLOW_STAGE_FAILED,
        runId,
        stageId: stage.id,
        error: stageResult.error,
        timestamp: now(),
      } as any)
    }

    await this.workflowStore.upsertStageResult(workflowRunId, stageResult)
    return stageResult
  }

  private async executeAutoStage(
    workflowRunId: string,
    stage: WorkflowStage,
    previousOutputs: { stageId: string; output: unknown }[],
    stageResult: WorkflowStageResult,
    context: RunContext,
    retryPolicy: RetryPolicy,
  ): Promise<WorkflowStageResult> {
    const { runId, traceId } = context
    const log = logger.child({ runId, stageId: stage.id, agentId: stage.agentId })

    const stageInput = {
      ...stage.staticInput,
      previousOutputs: previousOutputs.map((p) => ({
        stageId: p.stageId,
        output: p.output,
      })),
    }

    let lastError: AppError | undefined

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      if (attempt > 0) {
        stageResult.retryCount = attempt
        stageResult.status = WORKFLOW_STAGE_STATUS.RETRYING
        await this.workflowStore.upsertStageResult(workflowRunId, stageResult)
        log.info('[StageExecutor] Retrying stage', { attempt })
        await retryPolicy.wait(attempt - 1, context.signal)
      }

      try {
        const response = await this.a2aClient.callSync(
          {
            runId,
            traceId,
            fromAgentId: 'workflow-runner',
            toAgentId: stage.agentId,
            mode: A2A_CALL_MODES.SYNC,
            input: stageInput,
            timeoutMs: stage.timeoutMs ?? 60_000,
          },
          context,
        )

        if (response.status === A2A_STATUSES.COMPLETED) {
          stageResult.status = WORKFLOW_STAGE_STATUS.COMPLETED
          stageResult.output = response.output
          stageResult.completedAt = now()
          await this.workflowStore.upsertStageResult(workflowRunId, stageResult)

          await this.emitter.emit({
            type: EVENT_TYPES.WORKFLOW_STAGE_COMPLETED,
            runId,
            stageId: stage.id,
            stageName: stage.name,
            agentId: stage.agentId,
            timestamp: now(),
          } as any)

          log.info('[StageExecutor] Stage completed', { attempt })
          return stageResult
        }

        // Agent 返回 failed
        lastError = new AppError(
          'WORKFLOW_STAGE_FAILED',
          `Agent ${stage.agentId} returned failed: ${JSON.stringify(response.error)}`,
        )
      } catch (err) {
        lastError = err instanceof AppError ? err : new AppError('WORKFLOW_STAGE_FAILED', String(err))
        log.warn('[StageExecutor] Stage attempt failed', { attempt, errorCode: lastError.code })
      }
    }

    // 所有重试耗尽
    stageResult.status = WORKFLOW_STAGE_STATUS.FAILED
    stageResult.error = { code: lastError!.code, message: lastError!.message }
    stageResult.completedAt = now()
    await this.workflowStore.upsertStageResult(workflowRunId, stageResult)

    await this.emitter.emit({
      type: EVENT_TYPES.WORKFLOW_STAGE_FAILED,
      runId,
      stageId: stage.id,
      error: stageResult.error,
      timestamp: now(),
    } as any)

    log.error('[StageExecutor] Stage failed after all retries', { errorCode: lastError!.code })
    return stageResult
  }
}

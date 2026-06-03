import { Elysia, t } from 'elysia'
import { container } from '../../container.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'
import { logger } from '../../shared/observability/logger.js'
import { generateRunId, generateTraceId } from '../../shared/utils/id.js'
import { cancellationManager } from '../../runtime/cancellation.js'

// ============================================================
// Workflows Feature — HTTP API
//
// 路由：
// GET  /workflows                — 列出所有已注册的 Workflow 定义
// GET  /workflows/:workflowId    — 查询指定 Workflow 定义
// POST /workflows/:workflowId/runs — 启动一个 WorkflowRun
// GET  /workflows/runs/:runId    — 查询 WorkflowRun 状态（按 runId）
// POST /workflows/runs/:workflowRunId/stages/:stageId/approve — 人工节点审批通过
// POST /workflows/runs/:workflowRunId/stages/:stageId/reject  — 人工节点审批拒绝
// ============================================================

export const workflowsRoute = new Elysia({ prefix: '/workflows' })
  .use(requireAuthPlugin)

  // GET /workflows — 列出所有已注册的 Workflow 定义
  .get('/', ({ }) => {
    const workflows = container.workflowRegistry.list()
    return {
      workflows: workflows.map(({ id, name, description, stages }) => ({
        id,
        name,
        description,
        stageCount: stages.length,
        stages: stages.map(({ id: stageId, name: stageName, agentId, mode }) => ({
          id: stageId,
          name: stageName,
          agentId,
          mode,
        })),
      })),
    }
  })

  // GET /workflows/:workflowId — 查询 Workflow 定义详情
  .get(
    '/:workflowId',
    ({ params, set }) => {
      try {
        const def = container.workflowRegistry.get(params.workflowId)
        return def
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    { params: t.Object({ workflowId: t.String() }) },
  )

  // POST /workflows/:workflowId/runs — 启动 WorkflowRun
  .post(
    '/:workflowId/runs',
    async ({ authUser, params, body, set }) => {
      try {
        const definition = container.workflowRegistry.get(params.workflowId)

        // 为 WorkflowRun 创建一个独立的 RunContext
        const runId = generateRunId()
        const traceId = generateTraceId()
        const signal = cancellationManager.create(runId)

        const context = {
          runId,
          traceId,
          userId: authUser!.id,
          signal,
          depth: 0,
          callCount: 0,
          totalCostUsd: 0,
        }

        const workflowRunId = await container.workflowRunner.startWorkflowRun(definition, context)

        set.status = 201
        return {
          workflowRunId,
          runId,
          workflowId: params.workflowId,
          status: 'pending',
          message: 'WorkflowRun started',
        }
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        logger.error('[workflows.route] Failed to start workflow run', { errorCode: 'INTERNAL_ERROR' })
        set.status = 500
        return { code: 'INTERNAL_ERROR', message: 'Failed to start workflow run' }
      }
    },
    {
      params: t.Object({ workflowId: t.String() }),
      body: t.Object({
        input: t.Optional(t.Any()),
        projectId: t.Optional(t.String()),
      }),
    },
  )

  // GET /workflows/runs/:runId — 按 runId 查询 WorkflowRun 状态
  .get(
    '/runs/:runId',
    async ({ params, set }) => {
      const workflowRun = await container.workflowStore.getWorkflowRunByRunId(params.runId)
      if (!workflowRun) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `WorkflowRun not found for runId: ${params.runId}` }
      }
      return workflowRun
    },
    { params: t.Object({ runId: t.String() }) },
  )

  // POST /workflows/runs/:workflowRunId/stages/:stageId/approve — 人工节点审批通过
  .post(
    '/runs/:workflowRunId/stages/:stageId/approve',
    async ({ params, set }) => {
      try {
        await container.humanGate.approve(
          params.workflowRunId,
          params.stageId,
          container.workflowStore,
        )
        return { ok: true, message: 'Stage approved, workflow resuming' }
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    {
      params: t.Object({
        workflowRunId: t.String(),
        stageId: t.String(),
      }),
    },
  )

  // POST /workflows/runs/:workflowRunId/stages/:stageId/reject — 人工节点审批拒绝
  .post(
    '/runs/:workflowRunId/stages/:stageId/reject',
    async ({ params, body, set }) => {
      try {
        await container.humanGate.reject(
          params.workflowRunId,
          params.stageId,
          body.reason ?? 'Rejected by reviewer',
          container.workflowStore,
        )
        return { ok: true, message: 'Stage rejected, workflow will fail' }
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    {
      params: t.Object({
        workflowRunId: t.String(),
        stageId: t.String(),
      }),
      body: t.Object({
        reason: t.Optional(t.String()),
      }),
    },
  )

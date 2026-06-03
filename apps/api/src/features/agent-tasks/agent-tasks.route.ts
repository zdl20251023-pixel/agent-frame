import { Elysia, t } from 'elysia'
import { agentTaskStore } from '../../queues/agent-task.store.js'
import { container } from '../../container.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { AppError } from '../../shared/errors/app-error.js'

// ============================================================
// AgentTask 查询 API — 供前端恢复异步 A2A 子任务状态
// ============================================================

async function assertParentRunAccess(parentRunId: string, userId: string): Promise<void> {
  const run = await container.store.getRun(parentRunId)
  if (!run || run.userId !== userId) {
    throw new AppError('NOT_FOUND', 'Agent task not found', { statusCode: 404 })
  }
}

export const agentTasksRoute = new Elysia({ prefix: '/agent-tasks' })
  .use(requireAuthPlugin)
  .get(
    '/:taskId',
    async ({ authUser, params, set }) => {
      const task = await agentTaskStore.findById(params.taskId)
      if (!task) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `AgentTask not found: ${params.taskId}` }
      }
      await assertParentRunAccess(task.parentRunId, authUser!.id)
      return { task }
    },
    { params: t.Object({ taskId: t.String() }) },
  )
  .get(
    '/by-child-run/:childRunId',
    async ({ authUser, params, set }) => {
      const task = await agentTaskStore.findByChildRunId(params.childRunId)
      if (!task) {
        set.status = 404
        return { code: 'NOT_FOUND', message: `AgentTask not found for childRunId: ${params.childRunId}` }
      }
      await assertParentRunAccess(task.parentRunId, authUser!.id)
      return { task }
    },
    { params: t.Object({ childRunId: t.String() }) },
  )

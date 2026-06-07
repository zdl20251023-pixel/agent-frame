import { Elysia, t } from 'elysia'
import { container } from '../../container.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'
import { sessionsService } from '../sessions/sessions.service.js'
import { ConversationContextBuilder } from '../sessions/conversation-context.builder.js'
import { SessionsRepository } from '../sessions/sessions.repository.js'
import { RunsService } from '../runs/runs.service.js'

// ============================================================
// ToolInvocations Feature — ToolInvocation 查询入口
// ============================================================

sessionsService.setRunStore(container.store)

const runsService = new RunsService(
  container.runManager,
  container.store,
  container.artifactStore,
  sessionsService,
  new ConversationContextBuilder(container.store, container.artifactStore, new SessionsRepository()),
  container.capabilityRouter,
)

export const toolInvocationsRoute = new Elysia({ prefix: '/tool-invocations' })
  .use(requireAuthPlugin)
  .get(
    '/:invocationId',
    async ({ authUser, params, set }) => {
      try {
        const toolInvocation = await runsService.getToolInvocation(params.invocationId, authUser!.id)
        return { toolInvocation }
      } catch (err) {
        if (isAppError(err)) {
          set.status = err.statusCode
          return err.toJSON()
        }
        throw err
      }
    },
    { params: t.Object({ invocationId: t.String() }) },
  )

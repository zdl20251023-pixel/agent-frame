import type { Run } from '@agent-frame/shared'
import type { ConversationContext } from '@agent-frame/shared'
import type { RunManager } from '../../runtime/run-manager.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import type { SessionsService } from '../sessions/sessions.service.js'
import type { ConversationContextBuilder } from '../sessions/conversation-context.builder.js'
import { AppError } from '../../shared/errors/app-error.js'

// ============================================================
// RunsService — Runs 功能业务逻辑层
// route 只做 HTTP 入口/出口，业务逻辑集中在 service
// ============================================================

export type CreateRunParams = {
  input: unknown
  agentId?: string
  userId: string
  projectId?: string
  sessionId?: string
}

export type CreateRunResult = {
  runId: string
  traceId: string
  status: string
  sessionId: string
  createdAt: string
}

export class RunsService {
  constructor(
    private runManager: RunManager,
    private store: RunStore,
    private artifactStore: ArtifactStore,
    private sessionsService: SessionsService,
    private conversationContextBuilder: ConversationContextBuilder,
  ) {}

  async createRun(params: CreateRunParams): Promise<CreateRunResult> {
    const { userId, input } = params

    // 1. 解析或创建 Session
    const sessionId = await this.sessionsService.resolveSessionId(userId, params.sessionId)

    // 2. 构建预算内会话上下文（不含当前 Run，仅历史）
    const currentMessage = this.extractMessage(input)
    let conversationContext: ConversationContext | undefined
    try {
      conversationContext = await this.conversationContextBuilder.build({
        sessionId,
        userId,
        currentMessage,
      })
    } catch {
      // 上下文构建失败不阻塞 Run，降级为无历史
      conversationContext = undefined
    }

    // 3. 创建 Run
    const run = await this.runManager.createRun({
      input,
      agentId: params.agentId,
      userId,
      projectId: params.projectId,
      sessionId,
      conversationContext,
    })

    // 4. 更新 Session 活跃时间和标题
    await this.sessionsService.touchSession(sessionId)
    const message = this.extractMessage(input)
    if (message) {
      await this.sessionsService.maybeSetTitleFromMessage(sessionId, userId, message)
    }

    return {
      runId: run.id,
      traceId: run.traceId,
      status: run.status,
      sessionId,
      createdAt: run.createdAt,
    }
  }

  async getRun(runId: string, userId: string): Promise<Run> {
    await this.assertRunAccess(runId, userId)
    const run = await this.runManager.getRun(runId)
    if (!run) throw new AppError('NOT_FOUND', `Run not found: ${runId}`, { statusCode: 404 })
    return run
  }

  async listRuns(userId: string, limit: number) {
    return this.store.listRunsByUser(userId, limit)
  }

  async getSteps(runId: string, userId: string) {
    await this.assertRunAccess(runId, userId)
    return this.store.listSteps(runId)
  }

  async getEvents(runId: string, userId: string) {
    await this.assertRunAccess(runId, userId)
    return this.store.listEvents(runId)
  }

  async cancelRun(runId: string, userId: string): Promise<boolean> {
    await this.assertRunAccess(runId, userId)
    return this.runManager.cancelRun(runId)
  }

  async getArtifacts(runId: string, userId: string) {
    await this.assertRunAccess(runId, userId)
    return this.artifactStore.listArtifactsByRun(runId)
  }

  async assertRunAccess(runId: string, userId: string): Promise<void> {
    await this.sessionsService.assertRunOwnedByUser(runId, userId)
  }

  private extractMessage(input: unknown): string {
    if (input && typeof input === 'object' && input !== null && 'message' in input) {
      const msg = (input as { message?: unknown }).message
      if (typeof msg === 'string') return msg
    }
    return ''
  }
}

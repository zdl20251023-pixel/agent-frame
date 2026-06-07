import type { Run, ToolInvocation } from '@agent-frame/shared'
import type { ConversationContext } from '@agent-frame/shared'
import type { RunManager } from '../../runtime/run-manager.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import type { SessionsService } from '../sessions/sessions.service.js'
import type { ConversationContextBuilder } from '../sessions/conversation-context.builder.js'
import { AppError } from '../../shared/errors/app-error.js'
import {
  capabilityRouter,
  type CapabilityRouteResult,
  type CapabilityRouter,
} from '../../capabilities/capability-router.js'
import { capabilityRouteDecisionStore } from '../../capabilities/capability-route-decision.store.js'
import { SUPERVISOR_AGENT_ID } from '../../ai/agents/agent-ids.js'

// ============================================================
// RunsService — Runs 功能业务逻辑层
// ============================================================

export type CreateRunParams = {
  input: unknown
  agentId?: string
  userId: string
  projectId?: string
  sessionId?: string
  idempotencyKey?: string
  /** 用户确认澄清后选择的目标 Agent */
  confirmedAgentId?: string
}

export type CreateRunResult = {
  runId: string
  traceId: string
  status: string
  sessionId: string
  createdAt: string
  resolvedAgentId?: string
  capabilityRoute?: CapabilityRouteResult
}

export class RunsService {
  constructor(
    private runManager: RunManager,
    private store: RunStore,
    private artifactStore: ArtifactStore,
    private sessionsService: SessionsService,
    private conversationContextBuilder: ConversationContextBuilder,
    private router: CapabilityRouter = capabilityRouter,
  ) {}

  async createRun(params: CreateRunParams): Promise<CreateRunResult> {
    const { userId, input } = params

    if (params.idempotencyKey) {
      const existing = await this.store.getRunByIdempotencyKey(params.idempotencyKey, userId)
      if (existing) {
        return {
          runId: existing.id,
          traceId: existing.traceId,
          status: existing.status,
          sessionId: existing.sessionId ?? '',
          createdAt: existing.createdAt,
          resolvedAgentId: existing.agentId,
        }
      }
    }

    const sessionId = await this.sessionsService.resolveSessionId(userId, params.sessionId)

    const currentMessage = this.extractMessage(input)
    let conversationContext: ConversationContext | undefined
    try {
      conversationContext = await this.conversationContextBuilder.build({
        sessionId,
        userId,
        currentMessage,
      })
    } catch {
      conversationContext = undefined
    }

    const route = this.router.resolve({
      input,
      requestedAgentId: params.confirmedAgentId ?? params.agentId,
    })

    await capabilityRouteDecisionStore.persist({
      sessionId,
      userId,
      input,
      requestedAgentId: params.agentId,
      route,
    })

    if (route.type === 'ask_clarification' && !params.confirmedAgentId) {
      throw new AppError(
        'CAPABILITY_CLARIFICATION_REQUIRED',
        route.question,
        {
          statusCode: 422,
          details: {
            clarificationQuestion: route.question,
            confidence: route.confidence,
            reason: route.reason,
            candidateAgentId: route.candidateAgentId,
          },
        },
      )
    }

    const resolvedAgentId = route.type === 'agent' ? route.agentId : SUPERVISOR_AGENT_ID
    const routedInput = this.attachCapabilityRoute(input, route)

    const run = await this.runManager.createRun({
      input: routedInput,
      agentId: resolvedAgentId,
      userId,
      projectId: params.projectId,
      sessionId,
      conversationContext,
      idempotencyKey: params.idempotencyKey,
    })

    await capabilityRouteDecisionStore.persist({
      runId: run.id,
      sessionId,
      userId,
      input,
      requestedAgentId: params.agentId,
      route: { ...route, type: 'agent', agentId: resolvedAgentId } as CapabilityRouteResult,
    })

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
      resolvedAgentId,
      capabilityRoute: route,
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

  async getStoredEvents(runId: string, userId: string, afterEventId?: number) {
    await this.assertRunAccess(runId, userId)
    if (afterEventId !== undefined && afterEventId > 0) {
      return this.store.listEventsAfter(runId, afterEventId)
    }
    return this.store.listStoredEvents(runId)
  }

  async cancelRun(runId: string, userId: string): Promise<boolean> {
    await this.assertRunAccess(runId, userId)
    return this.runManager.cancelRun(runId)
  }

  async getArtifacts(runId: string, userId: string) {
    await this.assertRunAccess(runId, userId)
    return this.artifactStore.listArtifactsByRun(runId)
  }

  async getToolInvocations(runId: string, userId: string): Promise<ToolInvocation[]> {
    await this.assertRunAccess(runId, userId)
    return this.store.listToolInvocations(runId)
  }

  async getToolInvocation(invocationId: string, userId: string): Promise<ToolInvocation> {
    const invocation = await this.store.getToolInvocation(invocationId)
    if (!invocation) {
      throw new AppError('NOT_FOUND', `ToolInvocation not found: ${invocationId}`, { statusCode: 404 })
    }
    await this.assertRunAccess(invocation.runId, userId)
    return invocation
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

  private attachCapabilityRoute(input: unknown, route: CapabilityRouteResult): unknown {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input
    return {
      ...input,
      capabilityRoute: {
        type: route.type,
        agentId: route.type === 'agent' ? route.agentId : undefined,
        confidence: route.confidence,
        reason: route.reason,
        source: route.type === 'agent' ? route.source : undefined,
        question: route.type === 'ask_clarification' ? route.question : undefined,
      },
    }
  }
}

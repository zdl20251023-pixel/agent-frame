import type {
  ConversationArtifactRef,
  ConversationContext,
  ConversationTurn,
} from '@agent-frame/shared'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import type { SessionsRepository } from './sessions.repository.js'
import {
  assemblePromptWithinBudget,
  buildAssistantText,
  CONTEXT_BUDGET,
  extractUserMessage,
  formatArtifactRefsBlock,
  formatTurnsBlock,
  truncateForContext,
} from './conversation-context.utils.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// ConversationContextBuilder — 按预算构建会话上下文
//
// 原则：
// - 只加载用户/助手最终文本，不加载 message.delta 流、tool 输出、event JSON
// - 最近 N 轮保留原文（截断）；更早历史只用滚动摘要
// - Artifact 只放引用与短摘要，不加载正文
// ============================================================

export type BuildConversationContextInput = {
  sessionId: string
  userId: string
  /** 当前轮用户输入（单独传入，不包含在历史 runs 中） */
  currentMessage?: string
}

export class ConversationContextBuilder {
  constructor(
    private runStore: RunStore,
    private artifactStore: ArtifactStore,
    private sessionsRepo: SessionsRepository,
  ) {}

  /**
   * 为即将创建的 Run 构建预算内会话上下文。
   */
  async build(input: BuildConversationContextInput): Promise<ConversationContext> {
    const { sessionId, userId } = input

    const [runs, sessionSummary] = await Promise.all([
      this.runStore.listRunsBySession(sessionId, userId),
      this.sessionsRepo.getConversationSummary(sessionId),
    ])

    // 只取已完成/有输出的历史 Run（排除正在创建的）
    const completedRuns = runs.filter(
      (run) => run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled',
    )

    const allTurns: ConversationTurn[] = []
    for (const run of completedRuns) {
      const events = await this.runStore.listEvents(run.id)
      const userMessage = extractUserMessage(run.input)
      const assistantText = buildAssistantText(events, run.output)
      if (!userMessage && !assistantText) continue
      allTurns.push({ runId: run.id, userMessage, assistantText })
    }

    const recentRaw = allTurns.slice(-CONTEXT_BUDGET.maxRecentTurns)
    const recentTurns: ConversationTurn[] = recentRaw.map((turn) => ({
      runId: turn.runId,
      userMessage: truncateForContext(turn.userMessage, CONTEXT_BUDGET.maxUserMsgChars),
      assistantText: truncateForContext(turn.assistantText, CONTEXT_BUDGET.maxAssistantChars),
    }))

    const trimmedSummary = sessionSummary
      ? truncateForContext(sessionSummary, CONTEXT_BUDGET.maxSessionSummaryChars)
      : undefined

    const artifactRefs = await this.collectArtifactRefs(
      completedRuns.slice(-CONTEXT_BUDGET.maxRecentTurns).map((r) => r.id),
    )

    const turnsBlock = formatTurnsBlock(recentTurns)
    const artifactBlock = formatArtifactRefsBlock(artifactRefs)
    const { promptText, usedChars } = assemblePromptWithinBudget({
      summary: trimmedSummary,
      turnsBlock,
      artifactBlock,
      totalBudget: CONTEXT_BUDGET.totalChars,
    })

    logger.debug('[ConversationContextBuilder] Context built', {
      sessionId,
      turnCount: recentTurns.length,
      artifactRefCount: artifactRefs.length,
      usedChars,
      hasSummary: Boolean(trimmedSummary),
    })

    return {
      promptText,
      recentTurns,
      sessionSummary: trimmedSummary,
      artifactRefs,
      usedChars,
    }
  }

  /**
   * 收集最近 Run 的 Artifact 轻量引用（不含正文）。
   */
  private async collectArtifactRefs(runIds: string[]): Promise<ConversationArtifactRef[]> {
    const refs: ConversationArtifactRef[] = []

    for (const runId of runIds) {
      const artifacts = await this.artifactStore.listArtifactsByRun(runId)
      for (const artifact of artifacts) {
        refs.push({
          artifactId: artifact.id,
          runId: artifact.runId,
          type: artifact.type,
          title: artifact.title,
          summary: artifact.metadata && typeof artifact.metadata === 'object' && 'summary' in artifact.metadata
            ? truncateForContext(String((artifact.metadata as Record<string, unknown>).summary), CONTEXT_BUDGET.maxArtifactSummaryChars)
            : undefined,
        })
      }
    }

    return refs.slice(-CONTEXT_BUDGET.maxArtifactRefs)
  }
}

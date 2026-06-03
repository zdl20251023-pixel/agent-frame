import type { ModelClient } from '../../ai/model-client/model-client.js'
import type { SessionsRepository } from './sessions.repository.js'
import { truncateForContext, CONTEXT_BUDGET } from './conversation-context.utils.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// SessionSummaryService — 会话滚动摘要更新
//
// Run 完成后异步更新 chat_sessions.metadata.conversationSummary，
// 避免把全部历史原文塞进后续 prompt。
// ============================================================

export type UpdateSessionSummaryInput = {
  sessionId: string
  userId: string
  userMessage: string
  assistantText: string
}

export class SessionSummaryService {
  constructor(
    private repo: SessionsRepository,
    private modelClient: ModelClient,
  ) {}

  /**
   * 异步调度摘要更新，不阻塞 Run 主流程。
   */
  scheduleUpdate(input: UpdateSessionSummaryInput): void {
    void this.updateSummary(input).catch((err) => {
      logger.warn('[SessionSummaryService] Summary update failed', {
        sessionId: input.sessionId,
        errorCode: 'SESSION_SUMMARY_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    })
  }

  /**
   * 合并上一版摘要与本轮对话，生成新的滚动摘要。
   */
  async updateSummary(input: UpdateSessionSummaryInput): Promise<void> {
    const { sessionId, userMessage, assistantText } = input
    if (!userMessage.trim() && !assistantText.trim()) return

    const previous = await this.repo.getConversationSummary(sessionId)
    const answerPreview = truncateForContext(assistantText, 800)
    const questionPreview = truncateForContext(userMessage, 400)

    // 无模型时退化为简单拼接
    if (!previous) {
      const initial = `用户：${questionPreview}\n助手：${answerPreview}`
      await this.repo.updateConversationSummary(
        sessionId,
        truncateForContext(initial, CONTEXT_BUDGET.maxSessionSummaryChars),
      )
      return
    }

    try {
      const result = await this.modelClient.generate({
        model: 'fast.chat',
        system:
          '你是会话摘要助手。将旧摘要与新的一轮对话合并为简洁中文摘要，保留关键事实、用户偏好与任务进展。不要逐字复制长内容，控制在 1500 字以内。',
        prompt: `旧摘要：\n${previous}\n\n新一轮：\n用户：${questionPreview}\n助手：${answerPreview}\n\n请输出合并后的新摘要：`,
        metadata: { purpose: 'session_summary' },
      })
      const merged = truncateForContext(
        result.text.trim() || `${previous}\n用户：${questionPreview}\n助手：${answerPreview}`,
        CONTEXT_BUDGET.maxSessionSummaryChars,
      )
      await this.repo.updateConversationSummary(sessionId, merged)
      logger.debug('[SessionSummaryService] Summary updated', { sessionId, length: merged.length })
    } catch {
      // 模型失败时退化为追加式摘要
      const fallback = truncateForContext(
        `${previous}\n用户：${questionPreview}\n助手：${answerPreview}`,
        CONTEXT_BUDGET.maxSessionSummaryChars,
      )
      await this.repo.updateConversationSummary(sessionId, fallback)
    }
  }
}

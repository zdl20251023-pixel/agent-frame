// ============================================================
// LangfuseBridge — OpenTelemetry + Langfuse 链路追踪桥接
//
// 职责：
// - 在 ModelClient 调用前后创建 Langfuse span
// - 不替代框架自身的 traceId/runId/stepId 事件追踪体系
// - LANGFUSE_PUBLIC_KEY 未配置时为 no-op（不引入任何开销）
//
// 规则：
// - 只在 shared/observability/ 内使用
// - Langfuse SDK 为可选依赖，无 key 时完全禁用
// - 不向 runtime/a2a/workflow 层扩散
//
// 当前实现：接口 + no-op 默认实现
// 生产接入：配置 LANGFUSE_PUBLIC_KEY 后接入真实 Langfuse SDK
// ============================================================

import { env } from '../config/env.js'
import { logger } from './logger.js'

// ─── Span 上下文 ──────────────────────────────────────────────

export type SpanContext = {
  /** 框架 traceId，作为 Langfuse trace 的外部 ID */
  traceId: string
  /** Run ID */
  runId?: string
  /** Step ID */
  stepId?: string
  /** Agent ID */
  agentId?: string
  /** 模型别名 */
  modelAlias?: string
  /** Prompt Hash（来自 PromptProvider）*/
  promptHash?: string
  /** 用户 ID（用于 Langfuse 用户维度分析）*/
  userId?: string
}

// ─── Span 句柄 ────────────────────────────────────────────────

export type SpanHandle = {
  /** 记录 span 成功完成 */
  end(output?: { inputTokens?: number; outputTokens?: number; latencyMs?: number }): void
  /** 记录 span 失败 */
  fail(error: string): void
}

// ─── LangfuseBridge 接口 ──────────────────────────────────────

export interface ILangfuseBridge {
  /**
   * 判断 Langfuse 是否已配置和启用
   */
  isEnabled(): boolean

  /**
   * 创建一个 generation span（对应一次 ModelClient 调用）
   */
  createGenerationSpan(ctx: SpanContext): SpanHandle
}

// ─── No-Op 实现（默认，无 Langfuse 配置时使用）─────────────────

const noOpSpanHandle: SpanHandle = {
  end: () => {},
  fail: () => {},
}

class NoOpLangfuseBridge implements ILangfuseBridge {
  isEnabled(): boolean {
    return false
  }

  createGenerationSpan(_ctx: SpanContext): SpanHandle {
    return noOpSpanHandle
  }
}

// ─── 模拟 Langfuse 实现（有配置时记录日志，等真实 SDK 接入）─────

class LoggingLangfuseBridge implements ILangfuseBridge {
  isEnabled(): boolean {
    return true
  }

  createGenerationSpan(ctx: SpanContext): SpanHandle {
    const startMs = Date.now()

    logger.debug('[LangfuseBridge] span started', {
      traceId: ctx.traceId,
      runId: ctx.runId,
      stepId: ctx.stepId,
      agentId: ctx.agentId,
      promptHash: ctx.promptHash,
    })

    return {
      end(output) {
        const latencyMs = output?.latencyMs ?? (Date.now() - startMs)
        logger.info('[LangfuseBridge] span completed', {
          traceId: ctx.traceId,
          runId: ctx.runId,
          modelAlias: ctx.modelAlias,
          promptHash: ctx.promptHash,
          latencyMs,
          tokenInput: output?.inputTokens,
          tokenOutput: output?.outputTokens,
        })
      },
      fail(error) {
        logger.error('[LangfuseBridge] span failed', {
          traceId: ctx.traceId,
          runId: ctx.runId,
          modelAlias: ctx.modelAlias,
          errorCode: 'LANGFUSE_SPAN_FAILED',
        })
        void error
      },
    }
  }
}

// ─── 工厂函数：根据环境配置选择实现 ──────────────────────────────

function createLangfuseBridge(): ILangfuseBridge {
  const hasConfig =
    Boolean((env as Record<string, unknown>)['LANGFUSE_PUBLIC_KEY']) &&
    Boolean((env as Record<string, unknown>)['LANGFUSE_SECRET_KEY'])

  if (!hasConfig) {
    return new NoOpLangfuseBridge()
  }

  // TODO: 接入真实 Langfuse SDK：
  // import Langfuse from 'langfuse'
  // const client = new Langfuse({ publicKey: env.LANGFUSE_PUBLIC_KEY, secretKey: env.LANGFUSE_SECRET_KEY })
  // return new RealLangfuseBridge(client)

  logger.info('[LangfuseBridge] Langfuse config detected, using logging bridge (real SDK pending)')
  return new LoggingLangfuseBridge()
}

// ─── 全局单例 ─────────────────────────────────────────────────

export const langfuseBridge: ILangfuseBridge = createLangfuseBridge()

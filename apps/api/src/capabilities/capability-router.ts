import type { CapabilityHints } from '@agent-frame/shared'
import {
  NL_TO_HAND_AGENT_ID,
  SUPERVISOR_AGENT_ID,
} from '../ai/agents/agent-ids.js'
import { metrics } from '../shared/observability/metrics.js'

// ============================================================
// CapabilityRouter — 入口能力路由（插件化 + 治理）
//
// 路由优先级：
// 1. 显式 agentId → 直接返回
// 2. 聚合 Plugin capabilityHints 评分
// 3. 高置信 → 路由到专业 Agent
// 4. 中置信 → ask_clarification（强制澄清，禁止 silent fallback）
// 5. 低置信 → default supervisor
// ============================================================

export type CapabilityRouteResult =
  | {
      type: 'agent'
      agentId: string
      confidence: number
      reason: string
      source: 'explicit' | 'heuristic' | 'plugin' | 'default'
    }
  | {
      type: 'ask_clarification'
      question: string
      confidence: number
      reason: string
      candidateAgentId?: string
    }

export type CapabilityRouterInput = {
  input: unknown
  requestedAgentId?: string
}

const HIGH_CONFIDENCE_THRESHOLD = 0.72
const CLARIFICATION_THRESHOLD = 0.42

/** 内置 nl_to_hand 能力提示（插件注册后会被 Plugin hints 覆盖/合并） */
export const BUILTIN_NL_TO_HAND_HINTS: CapabilityHints = {
  agentId: NL_TO_HAND_AGENT_ID,
  strongPatterns: [
    '牌谱', '德州', '德扑', '手牌', '公共牌', '翻牌', '转牌', '河牌',
    '\\bflop\\b', '\\bturn\\b', '\\briver\\b', '\\bpreflop\\b', '\\bhero\\b',
    '\\bUTG\\b|\\bHJ\\b|\\bCO\\b|\\bBTN\\b|\\bSB\\b|\\bBB\\b',
    'open\\s*到|open\\s*raise',
    '3bet|4bet|c-bet|check|call|raise|fold|all-?in',
  ],
  weakPatterns: [
    'AK|AQ|AJ|KQ|AA|KK|QQ|JJ',
    '同花|不同花|口袋对子',
    '盲注|大盲|小盲|前注',
    '\\b\\d+\\s*\\/\\s*\\d+\\b',
    '下注|加注|跟注|弃牌|过牌',
  ],
  boostPatterns: ['转成?牌谱|生成牌谱|标准牌谱|复盘.*牌局'],
  penaltyPatterns: ['\\bturn\\b|\\briver\\b'],
  examples: ['6人桌，1/2，Hero UTG AhAs open到6，后面都弃牌'],
  negativeExamples: ['今天天气怎么样', '帮我写一首诗'],
}

export class CapabilityRouter {
  private hints: CapabilityHints[] = [BUILTIN_NL_TO_HAND_HINTS]

  /** 从 PluginRegistry 注入能力提示 */
  setCapabilityHints(hints: CapabilityHints[]): void {
    this.hints = hints.length > 0 ? hints : [BUILTIN_NL_TO_HAND_HINTS]
  }

  resolve(input: CapabilityRouterInput): CapabilityRouteResult {
    const requested = input.requestedAgentId?.trim()
    if (requested && requested !== SUPERVISOR_AGENT_ID) {
      metrics.capabilityRouteTotal.inc({ result: 'explicit', agentId: requested })
      return {
        type: 'agent',
        agentId: requested,
        confidence: 1,
        reason: '请求显式指定专业 Agent，能力路由不覆盖。',
        source: 'explicit',
      }
    }

    const message = extractMessage(input.input)
    const scored = this.scoreAllHints(message)
    const best = scored[0]

    if (best && best.score >= (best.hints.minScore ?? HIGH_CONFIDENCE_THRESHOLD)) {
      metrics.capabilityRouteTotal.inc({ result: 'routed', agentId: best.hints.agentId })
      return {
        type: 'agent',
        agentId: best.hints.agentId,
        confidence: best.score,
        reason: `检测到高置信能力意图，路由到 ${best.hints.agentId}。`,
        source: best.hints.agentId === NL_TO_HAND_AGENT_ID ? 'heuristic' : 'plugin',
      }
    }

    if (best && best.score >= CLARIFICATION_THRESHOLD) {
      metrics.capabilityRouteTotal.inc({ result: 'clarification', agentId: best.hints.agentId })
      return {
        type: 'ask_clarification',
        confidence: best.score,
        reason: '检测到可能的专业能力意图，但信息不足或上下文歧义较高。',
        question: best.hints.agentId === NL_TO_HAND_AGENT_ID
          ? '你是想把这手德州扑克牌局转换成标准牌谱吗？'
          : `你是想使用 ${best.hints.agentId} 相关能力吗？`,
        candidateAgentId: best.hints.agentId,
      }
    }

    metrics.capabilityRouteTotal.inc({ result: 'default', agentId: SUPERVISOR_AGENT_ID })
    return {
      type: 'agent',
      agentId: requested || SUPERVISOR_AGENT_ID,
      confidence: best ? 1 - best.score : 1,
      reason: '未检测到明确专业能力意图，使用默认通用 Agent。',
      source: requested ? 'explicit' : 'default',
    }
  }

  private scoreAllHints(message: string): Array<{ hints: CapabilityHints; score: number }> {
    return this.hints
      .map((hints) => ({ hints, score: scoreCapabilityHints(message, hints) }))
      .sort((a, b) => b.score - a.score)
  }
}

export function extractMessage(input: unknown): string {
  if (typeof input === 'string') return input
  if (input && typeof input === 'object' && 'message' in input) {
    const msg = (input as { message?: unknown }).message
    return typeof msg === 'string' ? msg : ''
  }
  return ''
}

export function scoreCapabilityHints(message: string, hints: CapabilityHints): number {
  const text = message.trim()
  if (!text) return 0

  const strong = countPatternMatches(text, hints.strongPatterns ?? [])
  const weak = countPatternMatches(text, hints.weakPatterns ?? [])
  const boost = countPatternMatches(text, hints.boostPatterns ?? [])
  const penalty = countPatternMatches(text, hints.penaltyPatterns ?? [])

  const hasActionLine = /(open|raise|call|fold|check|bet|all-?in|加注|跟注|弃牌|过牌|下注)/i.test(text)
  const hasPositionOrBlind = /(UTG|HJ|CO|BTN|SB|BB|盲注|大盲|小盲|\d+\s*\/\s*\d+)/i.test(text)

  let score = Math.min(1, strong * 0.22 + weak * 0.1 + boost * 0.25)
  if (hasActionLine && hasPositionOrBlind) score += 0.2
  if (penalty > 0 && !hasActionLine && !hasPositionOrBlind) score -= 0.25 * penalty

  for (const neg of hints.negativeExamples ?? []) {
    if (text.includes(neg)) score -= 0.3
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(2))))
}

/** @deprecated 兼容旧测试 */
export function scorePokerIntent(message: string): number {
  return scoreCapabilityHints(message, BUILTIN_NL_TO_HAND_HINTS)
}

function countPatternMatches(text: string, patterns: string[]): number {
  return patterns.reduce((count, pattern) => {
    try {
      return count + (new RegExp(pattern, 'i').test(text) ? 1 : 0)
    } catch {
      return count + (text.includes(pattern) ? 1 : 0)
    }
  }, 0)
}

export const capabilityRouter = new CapabilityRouter()

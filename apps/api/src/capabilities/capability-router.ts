import {
  NL_TO_HAND_AGENT_ID,
  SUPERVISOR_AGENT_ID,
} from '../ai/agents/agent-ids.js'

// ============================================================
// CapabilityRouter — 入口能力路由
//
// 职责：
// - 在 Run 创建前根据用户输入选择最合适的入口 Agent。
// - 不把能力识别逻辑塞进 SupervisorAgent，避免调度 Agent 膨胀。
// - 显式专业 agentId 优先；默认 supervisor 入口允许被高置信能力规则改派。
// ============================================================

export type CapabilityRouteResult =
  | {
      type: 'agent'
      agentId: string
      confidence: number
      reason: string
      source: 'explicit' | 'heuristic' | 'default'
    }
  | {
      type: 'ask_clarification'
      question: string
      confidence: number
      reason: string
    }

export type CapabilityRouterInput = {
  input: unknown
  requestedAgentId?: string
}

const HIGH_CONFIDENCE_THRESHOLD = 0.72
const CLARIFICATION_THRESHOLD = 0.42

const POKER_STRONG_PATTERNS = [
  /牌谱/,
  /德州/,
  /德扑/,
  /手牌/,
  /公共牌/,
  /翻牌|转牌|河牌/,
  /\bflop\b/i,
  /\bturn\b/i,
  /\briver\b/i,
  /\bpreflop\b/i,
  /\bhero\b/i,
  /\bUTG\b|\bHJ\b|\bCO\b|\bBTN\b|\bSB\b|\bBB\b/i,
  /open\s*到|open\s*raise/i,
  /3bet|4bet|c-bet|check|call|raise|fold|all-?in/i,
]

const POKER_WEAK_PATTERNS = [
  /AK|AQ|AJ|KQ|AA|KK|QQ|JJ/,
  /同花|不同花|口袋对子/,
  /盲注|大盲|小盲|前注/,
  /\b\d+\s*\/\s*\d+\b/,
  /下注|加注|跟注|弃牌|过牌/,
]

export class CapabilityRouter {
  /**
   * 根据输入和请求的 agentId 解析入口能力。
   *
   * 规则：
   * - 明确指定非默认 Agent 时完全尊重用户选择。
   * - 未指定或默认 supervisor 时，允许高置信牌局描述自动路由到 nl-to-hand-agent。
   * - 低置信牌局意图返回 ask_clarification，当前调用方可选择降级到 supervisor。
   */
  resolve(input: CapabilityRouterInput): CapabilityRouteResult {
    const requested = input.requestedAgentId?.trim()
    if (requested && requested !== SUPERVISOR_AGENT_ID) {
      return {
        type: 'agent',
        agentId: requested,
        confidence: 1,
        reason: '请求显式指定专业 Agent，能力路由不覆盖。',
        source: 'explicit',
      }
    }

    const message = extractMessage(input.input)
    const pokerScore = scorePokerIntent(message)
    if (pokerScore >= HIGH_CONFIDENCE_THRESHOLD) {
      return {
        type: 'agent',
        agentId: NL_TO_HAND_AGENT_ID,
        confidence: pokerScore,
        reason: '检测到高置信德州扑克牌局描述，自动路由到自然语言转牌谱 Agent。',
        source: 'heuristic',
      }
    }

    if (pokerScore >= CLARIFICATION_THRESHOLD) {
      return {
        type: 'ask_clarification',
        confidence: pokerScore,
        reason: '检测到可能的牌局描述，但信息不足或上下文歧义较高。',
        question: '你是想把这手德州扑克牌局转换成标准牌谱吗？',
      }
    }

    return {
      type: 'agent',
      agentId: requested || SUPERVISOR_AGENT_ID,
      confidence: 1 - pokerScore,
      reason: '未检测到明确专业能力意图，使用默认通用 Agent。',
      source: requested ? 'explicit' : 'default',
    }
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

export function scorePokerIntent(message: string): number {
  const text = message.trim()
  if (!text) return 0

  const strongMatches = countMatches(text, POKER_STRONG_PATTERNS)
  const weakMatches = countMatches(text, POKER_WEAK_PATTERNS)
  const hasActionLine = /(open|raise|call|fold|check|bet|all-?in|加注|跟注|弃牌|过牌|下注)/i.test(text)
  const hasPositionOrBlind = /(UTG|HJ|CO|BTN|SB|BB|盲注|大盲|小盲|\d+\s*\/\s*\d+)/i.test(text)

  let score = Math.min(1, strongMatches * 0.22 + weakMatches * 0.1)
  if (hasActionLine && hasPositionOrBlind) score += 0.2
  if (/转成?牌谱|生成牌谱|标准牌谱|复盘.*牌局/.test(text)) score += 0.25
  if (/\bturn\b|\briver\b/i.test(text) && !hasActionLine && !hasPositionOrBlind) score -= 0.25

  return Math.max(0, Math.min(1, Number(score.toFixed(2))))
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0)
}

export const capabilityRouter = new CapabilityRouter()

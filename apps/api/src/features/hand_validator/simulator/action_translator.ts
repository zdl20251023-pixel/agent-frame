/**
 * 牌谱校验引擎 —— 动作翻译器
 *
 * 职责：将 latest_hand 格式的单条 action 翻译为状态机可识别的数据结构：
 *   - 玩家动作（seat_no >= 0）→ game_server_oper_action_post_body_Type
 *   - 公共牌动作（seat_no === -1）→ card_Type[]
 *
 * 关键约束：
 *   - raise / bet 的 chips 取 action.amount（加注到的总额，executePlayerAction 按总额处理）
 *   - call / check / fold / allin 的 chips 传 0（executePlayerAction 内部自动推导正确金额）
 *   - sequenceId 必须从 table.currentBetSequenceId **实时读取**，不可缓存，
 *     isCanOperAction 会严格比对序列号
 *   - isAI=true 确保不触发 game_emitter.hero_oper_action 事件
 */

import type { LatestHandType } from '../../agent-tools/tool_nl_to_hand'
import type { card_Type, table_Type } from '../core/game_types.js'
import { bet_Type } from '../core/game_types.js'
import type { game_server_oper_action_post_body_Type } from './types.js'
import { parseBoardStr } from './sim_table_builder'

/** latest_hand actions 中单条动作的类型别名 */
export type HandActionItem = LatestHandType['actions'][number]

// ── 映射表与集合 ────────────────────────────────────────────────────────────────

/** 玩家动作字符串 → bet_Type 枚举映射 */
export const ACTION_TO_BET_TYPE: Readonly<Record<string, bet_Type>> = {
  fold: bet_Type.fold,
  check: bet_Type.check,
  call: bet_Type.call,
  allin: bet_Type.allin,
  bet: bet_Type.bet,
  raise: bet_Type.raise,
}

/**
 * 需要传入 chips 金额的动作集合：
 *   raise → chips = 加注后总额
 *   bet   → chips = 下注额
 * 其余动作传 0，executePlayerAction 会自行推导
 */
export const NEEDS_AMOUNT_ACTIONS = new Set<string>(['raise', 'bet'])

// ── 翻译结果类型 ────────────────────────────────────────────────────────────────

/** 翻译结果：玩家动作 */
export interface PlayerTranslateResult {
  type: 'player'
  operData: game_server_oper_action_post_body_Type
}

/** 翻译结果：公共牌 */
export interface BoardTranslateResult {
  type: 'board'
  /** 解析后的牌对象数组（flop=3张 / turn=1张 / river=1张） */
  cards: card_Type[]
}

/** 翻译结果：失败 */
export interface FailTranslateResult {
  type: 'fail'
  reason: string
}

/** 所有翻译结果类型的联合 */
export type TranslateResult = PlayerTranslateResult | BoardTranslateResult | FailTranslateResult

// ── 翻译函数 ─────────────────────────────────────────────────────────────────────

/**
 * 翻译玩家动作 → game_server_oper_action_post_body_Type
 *
 * @param action latest_hand 中的单条玩家动作（seat_no >= 0）
 * @param table  当前模拟桌状态（读取 tableId / cardId / currentBetSequenceId）
 * @returns PlayerTranslateResult 或 FailTranslateResult
 */
export function translatePlayerAction(
  action: HandActionItem,
  table: table_Type
): PlayerTranslateResult | FailTranslateResult {
  const betType = ACTION_TO_BET_TYPE[action.action]
  if (betType === undefined) {
    return {
      type: 'fail',
      reason: `未知玩家动作类型: "${action.action}"，合法值: ${Object.keys(ACTION_TO_BET_TYPE).join('/')}`,
    }
  }

  // raise / bet 传入 chips 金额；其他动作传 0，由 executePlayerAction 推导
  const chips = NEEDS_AMOUNT_ACTIONS.has(action.action) ? action.amount : 0

  // 根据座位号查找玩家 uid（满足 game_server_oper_action_post_body_Type.uid 字段）
  const uid = table.playerList.find((p) => p.seatIdx === action.seat_no)?.id ?? 0

  const operData = {
    uid,
    tableId: table.tableId,
    cardId: table.cardId,
    seatIdx: action.seat_no,
    betType,
    chips,
    // sequenceId 必须实时从 table 读取，isCanOperAction 会严格比对
    sequenceId: table.currentBetSequenceId,
    isAI: true,
  } as game_server_oper_action_post_body_Type

  return { type: 'player', operData }
}

/**
 * 翻译公共牌动作字符串 → card_Type[]
 *
 * @param boardStr 紧凑公共牌字符串，例 "4cAcQc"（flop）或 "5d"（turn/river）
 * @returns BoardTranslateResult 或 FailTranslateResult
 */
export function translateBoardAction(boardStr: string): BoardTranslateResult | FailTranslateResult {
  const cards = parseBoardStr(boardStr)
  if (cards.length === 0) {
    return {
      type: 'fail',
      reason: `无法解析公共牌字符串: "${boardStr}"，格式应为紧凑牌写法，例如 "4cAcQc" 或 "5d"`,
    }
  }
  return { type: 'board', cards }
}

/**
 * 统一翻译入口：根据 seat_no 自动判断动作类型并委托对应子函数
 *
 * @param action latest_hand 中的单条 action
 * @param table  当前模拟桌状态
 * @returns TranslateResult
 */
export function translateAction(action: HandActionItem, table: table_Type): TranslateResult {
  if (action.seat_no === -1) {
    return translateBoardAction(action.action)
  }
  return translatePlayerAction(action, table)
}

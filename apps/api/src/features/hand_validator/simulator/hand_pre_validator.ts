/**
 * 牌谱校验引擎 Layer 2 —— 语义预校验
 *
 * 职责：在进入 Layer 3（动态推演）之前，执行低成本的语义检查:
 *   1. 所有出现的牌（手牌 + 公共牌）不重复
 *   2. dealer_seat / sb_seat / bb_seat 都在玩家列表中
 *   3. 玩家 seat_no 不重复
 *   4. 公共牌动作（seat_no=-1）的出现顺序合法（flop=3张，turn=1张，river=1张）
 *   5. 玩家动作类型为合法字符串
 *   6. result.players 数量与 players 一致
 *
 * 无副作用，纯函数，可单独单测。
 */

import type { LatestHandType } from '../../agent-tools/tool_nl_to_hand'
import { buildErr, buildOk, HandValidationErrorCode, type HandValidationResult } from './types'

/** 位置映射, 2-10人局 */
const POSITION_MAPPING: Record<number, string[]> = {
  2: ['BTN', 'SB', 'BB', 'SB/BTN'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO'],
  10: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'UTG3', 'LJ', 'HJ', 'CO'],
}

/** 合法的玩家动作类型集合 */
const VALID_PLAYER_ACTIONS = new Set(['raise', 'bet', 'call', 'check', 'fold', 'allin'])

/**
 * 基于 players 的真实座位、dealer_seat 和 POSITION_MAPPING 计算每个 seat 的期望 position_tag
 * - 2人局：强制使用 SB/BTN + BB
 * - 3-10人局：按 POSITION_MAPPING[count]，从 dealer_seat 开始顺时针映射
 */
function buildExpectedPositionTagBySeat(
  players: LatestHandType['players'],
  dealerSeat: number
): Map<number, string> | null {
  const seatOrder = players.map((p) => p.seat_no).sort((a, b) => a - b)

  const dealerIdx = seatOrder.indexOf(dealerSeat)
  if (dealerIdx < 0) {
    return null
  }

  const orderedSeats = [...seatOrder.slice(dealerIdx), ...seatOrder.slice(0, dealerIdx)]
  const count = players.length
  const mapping = POSITION_MAPPING[count]
  if (!mapping) {
    return null
  }

  const tags = count === 2 ? ['SB/BTN', 'BB'] : mapping
  if (tags.length !== count) {
    return null
  }

  const expectedBySeat = new Map<number, string>()
  for (let i = 0; i < orderedSeats.length; i++) {
    const seat = orderedSeats[i]
    const tag = tags[i]
    if (seat === undefined || !tag) {
      return null
    }
    expectedBySeat.set(seat, tag)
  }
  return expectedBySeat
}

/**
 * 将紧凑牌字符串解析成 {rank, suit} 数组
 * 例：'4cAcQc' → [{rank:'4',suit:'c'},{rank:'A',suit:'c'},{rank:'Q',suit:'c'}]
 * @param str 紧凑牌字符串，每张牌占2个字符
 * @returns 解析结果，如果字符串长度为奇数则忽略最后一个字符
 */
function parseCardPairs(str: string): Array<{ rank: string; suit: string }> {
  const result: Array<{ rank: string; suit: string }> = []
  for (let i = 0; i + 1 < str.length; i += 2) {
    result.push({ rank: str[i], suit: str[i + 1] })
  }
  return result
}

/**
 * Layer 2：语义预校验
 * @param gameHand 待校验牌谱对象（已通过 Zod Schema 校验）
 * @returns 校验结果
 */
export function validateHandSemantics(gameHand: LatestHandType): HandValidationResult {
  // ── 1. 所有牌面唯一性 ────────────────────────────────────────────────────
  const cardSet = new Set<string>()

  // 手牌
  for (const player of gameHand.players) {
    if (!player.hole_card_list) {
      continue
    }
    const pairs = parseCardPairs(player.hole_card_list)
    for (const c of pairs) {
      const key = `${c.rank}${c.suit}`
      if (cardSet.has(key)) {
        return buildErr(
          HandValidationErrorCode.SEMANTIC_INVALID,
          `牌面重复: ${key} 出现在 seat=${player.seat_no} 的 hole_card_list 中，已在其他地方出现过`
        )
      }
      cardSet.add(key)
    }
  }

  // 公共牌（通过 actions 中 seat_no === -1 的动作）
  for (let i = 0; i < gameHand.actions.length; i++) {
    const action = gameHand.actions[i]
    if (action.seat_no !== -1) {
      continue
    }
    const pairs = parseCardPairs(action.action)
    for (const c of pairs) {
      const key = `${c.rank}${c.suit}`
      if (cardSet.has(key)) {
        return buildErr(
          HandValidationErrorCode.SEMANTIC_INVALID,
          `牌面重复: ${key} 出现在 step=${i} 的公共牌 "${action.action}" 中，已在其他地方出现过`,
          i
        )
      }
      cardSet.add(key)
    }
  }

  // ── 2. 玩家 seat_no 不重复 ───────────────────────────────────────────────
  const seatSet = new Set<number>()
  for (const player of gameHand.players) {
    if (seatSet.has(player.seat_no)) {
      return buildErr(
        HandValidationErrorCode.SEMANTIC_INVALID,
        `玩家 seat_no=${player.seat_no} 重复`
      )
    }
    seatSet.add(player.seat_no)
  }

  // ── 3. dealer/sb/bb 座位必须在玩家列表中 ─────────────────────────────────
  const keySeats: Array<{ label: string; no: number }> = [
    { label: 'dealer_seat', no: gameHand.dealer_seat },
    { label: 'sb_seat', no: gameHand.sb_seat },
    { label: 'bb_seat', no: gameHand.bb_seat },
  ]
  for (const { label, no } of keySeats) {
    if (!seatSet.has(no)) {
      return buildErr(HandValidationErrorCode.SEMANTIC_INVALID, `${label}=${no} 不在玩家列表中`)
    }
  }

  // straddle 座位（若有）
  const straddleSeat = gameHand.straddle_seat ?? -1
  if (straddleSeat >= 0 && !seatSet.has(straddleSeat)) {
    return buildErr(
      HandValidationErrorCode.SEMANTIC_INVALID,
      `straddle_seat=${straddleSeat} 不在玩家列表中`
    )
  }

  // ── 3.5 position_tag 与 POSITION_MAPPING 强一致性校验 ─────────────────────
  const expectedTagBySeat = buildExpectedPositionTagBySeat(gameHand.players, gameHand.dealer_seat)
  if (!expectedTagBySeat) {
    return buildErr(
      HandValidationErrorCode.SEMANTIC_INVALID,
      `无法根据玩家人数(${gameHand.players.length})和 dealer_seat=${gameHand.dealer_seat} 建立 position_tag 映射`
    )
  }
  for (const p of gameHand.players) {
    const expectedTag = expectedTagBySeat.get(p.seat_no)
    if (!expectedTag) {
      return buildErr(
        HandValidationErrorCode.SEMANTIC_INVALID,
        `seat_no=${p.seat_no} 缺少 position_tag 期望映射`
      )
    }
    if (p.position_tag !== expectedTag) {
      return buildErr(
        HandValidationErrorCode.SEMANTIC_INVALID,
        `seat_no=${p.seat_no} 的 position_tag 不匹配: 期望=${expectedTag}, 实际=${p.position_tag}`
      )
    }
  }

  // ── 4. 公共牌动作顺序合法 ────────────────────────────────────────────────
  // board_count: 0=preflop, 1=flop, 2=turn, 3=river
  let boardCount = 0
  const EXPECTED_CARD_COUNT: Record<number, number> = { 1: 3, 2: 1, 3: 1 }
  const BOARD_NAMES: Record<number, string> = { 1: '翻牌(flop)', 2: '转牌(turn)', 3: '河牌(river)' }

  for (let i = 0; i < gameHand.actions.length; i++) {
    const action = gameHand.actions[i]
    if (action.seat_no === -1) {
      // 公共牌动作
      boardCount++
      if (boardCount > 3) {
        return buildErr(
          HandValidationErrorCode.SEMANTIC_INVALID,
          `公共牌动作出现第 ${boardCount} 次，超过最多3次（flop/turn/river）`,
          i
        )
      }
      const pairs = parseCardPairs(action.action)
      const expected = EXPECTED_CARD_COUNT[boardCount]
      if (pairs.length !== expected) {
        return buildErr(
          HandValidationErrorCode.SEMANTIC_INVALID,
          `${BOARD_NAMES[boardCount]} 公共牌必须恰好 ${expected} 张，实际 ${pairs.length} 张: "${action.action}"`,
          i
        )
      }
    } else {
      // 玩家动作
      if (!VALID_PLAYER_ACTIONS.has(action.action)) {
        return buildErr(
          HandValidationErrorCode.SEMANTIC_INVALID,
          `未知玩家动作类型: "${action.action}"，合法值: ${[...VALID_PLAYER_ACTIONS].join('/')}`,
          i,
          action.action,
          action.seat_no
        )
      }
      if (!seatSet.has(action.seat_no)) {
        return buildErr(
          HandValidationErrorCode.SEMANTIC_INVALID,
          `action seat_no=${action.seat_no} 不在玩家列表中`,
          i,
          action.action,
          action.seat_no
        )
      }
    }
  }

  // ── 5. result.players 数量一致 ───────────────────────────────────────────
  if (gameHand.result.players.length !== gameHand.players.length) {
    return buildErr(
      HandValidationErrorCode.SEMANTIC_INVALID,
      `result.players 数量(${gameHand.result.players.length}) 与 players 数量(${gameHand.players.length}) 不一致`
    )
  }

  return buildOk()
}

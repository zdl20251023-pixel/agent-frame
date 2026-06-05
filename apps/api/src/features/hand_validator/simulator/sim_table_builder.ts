/**
 * 牌谱校验引擎 —— 模拟桌构造器
 *
 * 职责：根据 LatestHandType 牌谱对象构建一个完整初始化的 table_Type 对象，
 * 包括：
 *   - 基础字段（tableId / cardId / bb / sb / ante / 座位配置）
 *   - 玩家列表（isAI=true，不触发 hero_oper_action emitter）
 *   - 发放前注（ante）并记录到 streetBets
 *   - 下盲注（SB / BB）并记录到 streetBets / curBet / pot
 *
 * 返回 { table, totalChips }:
 *   totalChips = 所有玩家初始筹码之和（含前注前），用于结算守恒性校验
 */

import type { LatestHandType } from '../../agent-tools/tool_nl_to_hand'
import { getCardValue, getDefaultTableInfo } from '../utils/sim_utils'
import {
  type card_Type,
  type player_Type,
  type table_Type,
  table_state_Type,
} from '../core/game_types.js'

/** 唯一表 ID 计数器（避免多局并发冲突） */
let _simTableCounter = 0

/**
 * 将紧凑手牌字符串解析为 card_Type 数组
 * @param holdCardsStr 例 "AhKd" → [{rank:'A',suit:'h',value:14},{rank:'K',suit:'d',value:13}]
 * @returns card_Type 数组；字符串为空或格式不对时返回 []
 */
export function parseHoldCardsStr(holdCardsStr: string): card_Type[] {
  if (!holdCardsStr || holdCardsStr.length < 2) {
    return []
  }
  const cards: card_Type[] = []
  for (let i = 0; i + 1 < holdCardsStr.length; i += 2) {
    const rank = holdCardsStr[i]
    const suit = holdCardsStr[i + 1]
    if (!rank || !suit) {
      continue
    }
    cards.push({ rank, suit, value: getCardValue(rank) })
  }
  return cards
}

/**
 * 将公共牌紧凑字符串解析为 card_Type 数组
 * @param boardStr 例 "4cAcQc" → 3张
 * @returns card_Type 数组
 */
export function parseBoardStr(boardStr: string): card_Type[] {
  return parseHoldCardsStr(boardStr)
}

/**
 * 构建模拟桌
 * @param gameHand 牌谱对象（已通过 Layer1/Layer2 校验）
 * @returns { table, totalChips } 或 null（构建失败时）
 *
 * 注意：
 *   - 所有玩家均标记为 isAI=true，确保 executePlayerAction 不会触发 hero_oper_action 事件
 *   - 超时判断被禁用（betBeyondTime=0, curBetStartTime=0）
 */
export function buildSimTable(
  gameHand: LatestHandType
): { table: table_Type; totalChips: number } | null {
  try {
    const tableNo = ++_simTableCounter
    const table = getDefaultTableInfo(`sim_${tableNo}`)

    // ── 基础字段 ─────────────────────────────────────────────────────────────
    table.tableId = gameHand.roomid || `sim_table_${tableNo}`
    table.cardId = gameHand.gameuuid || `sim_card_${tableNo}`
    table.bb = gameHand.big_blind
    table.sb = gameHand.big_blind / 2
    table.ante = gameHand.ante ?? 0
    table.btnSeatIdx = gameHand.dealer_seat
    table.sbSeatIdx = gameHand.sb_seat
    table.bbSeatIdx = gameHand.bb_seat
    table.isStraddle = (gameHand.straddle_seat ?? -1) >= 0
    table.seatCount = gameHand.players.length
    table.state = table_state_Type.preflop
    // 禁用超时检测：curBetStartTime=0 / betBeyondTime=0
    table.betBeyondTime = 0
    table.curBetStartTime = 0
    table.isAutoStartGame = true

    // ── 玩家列表 ─────────────────────────────────────────────────────────────
    let totalChips = 0
    table.playerList = gameHand.players.map((p): player_Type => {
      totalChips += p.stack
      return {
        id: p.id,
        name: p.name || `P${p.seat_no}`,
        isHero: false,
        isAI: true, // 全部标为 AI，避免触发 hero_oper_action emitter
        seatIdx: p.seat_no,
        seatName: '',
        fixInitChips: p.stack,
        chips: p.stack,
        initChips: p.stack,
        winChips: 0,
        addChips: 0,
        totalPendingChips: 0,
        curBet: 0,
        holdCards: parseHoldCardsStr(p.hole_card_list),
        isFold: false,
        isAllin: false,
        isActive: true,
        hasActed: false,
        canOnlyCallOrFold: false,
        handRank: 0,
        handDescription: '',
        isWinner: false,
        handCompareValues: [],
      }
    })

    // ── 发放前注（ante） ──────────────────────────────────────────────────────
    if (table.ante > 0) {
      for (const p of table.playerList) {
        const actualAnte = Math.min(table.ante, p.chips)
        if (actualAnte <= 0) {
          continue
        }
        p.chips -= actualAnte
        table.pot += actualAnte
        const key = String(p.seatIdx)
        table.streetBets[key] = (table.streetBets[key] ?? 0) + actualAnte
        if (p.chips === 0) {
          p.isAllin = true
        }
      }
    }

    // ── 下盲注 SB ────────────────────────────────────────────────────────────
    const sbPlayer = table.playerList.find((p) => p.seatIdx === table.sbSeatIdx)
    if (!sbPlayer) {
      console.error(`buildSimTable: 找不到 SB 玩家 seat=${table.sbSeatIdx}`)
      return null
    }
    const sbAmount = Math.min(table.sb, sbPlayer.chips)
    sbPlayer.chips -= sbAmount
    sbPlayer.curBet = sbAmount
    table.pot += sbAmount
    {
      const key = String(sbPlayer.seatIdx)
      table.streetBets[key] = (table.streetBets[key] ?? 0) + sbAmount
    }
    if (sbPlayer.chips === 0) {
      sbPlayer.isAllin = true
    }

    // ── 下盲注 BB ────────────────────────────────────────────────────────────
    const bbPlayer = table.playerList.find((p) => p.seatIdx === table.bbSeatIdx)
    if (!bbPlayer) {
      console.error(`buildSimTable: 找不到 BB 玩家 seat=${table.bbSeatIdx}`)
      return null
    }
    const bbAmount = Math.min(table.bb, bbPlayer.chips)
    bbPlayer.chips -= bbAmount
    bbPlayer.curBet = bbAmount
    table.pot += bbAmount
    table.currentMaxBet = bbAmount
    // BB 盲注被视为本轮的最小"加注"增量，用于后续 min-raise 计算
    table.lastRaiseInc = bbAmount
    {
      const key = String(bbPlayer.seatIdx)
      table.streetBets[key] = (table.streetBets[key] ?? 0) + bbAmount
    }
    if (bbPlayer.chips === 0) {
      bbPlayer.isAllin = true
    }

    // ── 初始序列号（用于 isCanOperAction sequenceId 校验） ───────────────────
    table.currentBetSequenceId = 0
    table.currentPlayerIndex = -1

    return { table, totalChips }
  } catch (e) {
    console.error('buildSimTable exception:', e)
    return null
  }
}

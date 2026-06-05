/**
 * 牌谱校验引擎 —— 结算校验器 Layer 4
 *
 * 职责：
 *   1. 合并未归并的 streetBets → contributions，重建 pots
 *   2. 对到达摊牌的玩家进行手牌评估（evaluateHand）
 *   3. 调用 resolveShowdownTimeline 计算分配时间线
 *   4. 按时间线更新玩家 chips（模拟 payout 阶段）
 *   5. 校验筹码守恒性：sum(final chips) ≈ totalInitChips（允许 ±1 取整误差）
 *   6. 逐一比对 game_hand.result.players[*].stack 与计算值
 *      ⚡ 新增：stack=0 时跳过比对，视为"委托引擎计算"，自动填充引擎值
 *
 * 无副作用（读/写 table 对象），纯函数化。
 */

import type { LatestHandType } from '../../agent-tools/tool_nl_to_hand'
import { evaluateHand } from '../utils/hand_evaluator'
import type { table_Type } from '../core/game_types.js'
import { mergeStreetToContributions, rebuildPots, resolveShowdownTimeline } from '../core/pot_manager'
import {
  buildDiagnosticErr,
  buildErr,
  buildOk,
  HandValidationErrorCode,
  type HandValidationResult,
} from './types'

/** 允许的结算误差（筹码取整） */
const CHIPS_TOLERANCE = 1

/**
 * Layer 4：结算校验
 *
 * @param table 经过完整 Layer 3 推演后的 table 对象
 * @param gameHand 原始牌谱（用于获取 result.players，可能被原地 mutate 填充引擎值）
 * @param totalInitChips 所有玩家初始筹码之和（buildSimTable 返回）
 * @returns 校验结果
 *
 * ⚡ 结算填充规则：
 *   - 若 result.players[i].stack === 0，视为"委托引擎计算"，自动填充引擎推演后的正确值
 *   - 若 result.players[i].stack !== 0，则与引擎值比对，偏差超出 CHIPS_TOLERANCE 时报 SETTLEMENT_MISMATCH
 */
export function validateSettlement(
  table: table_Type,
  gameHand: LatestHandType,
  totalInitChips: number
): HandValidationResult {
  // ── 1. 合并最后一条街的下注到累计贡献，重建边池 ─────────────────────────
  mergeStreetToContributions(table)
  rebuildPots(table)

  // ── 2. 对到达摊牌（≥2 个未弃牌活跃玩家）的玩家进行手牌评估 ─────────────
  const activePlayers = table.playerList.filter((p) => p.isActive && !p.isFold)
  if (activePlayers.length >= 2 && table.board.length >= 3) {
    for (const p of activePlayers) {
      if (!p.holdCards || p.holdCards.length !== 2) {
        continue
      }
      const allCards = [...p.holdCards, ...table.board]
      const details = evaluateHand(allCards)
      if (details) {
        p.handRank = details.rank
        p.handDescription = details.description
        p.handCompareValues = details.compareValues
      }
    }
  }

  // ── 3. 计算结算时间线 ─────────────────────────────────────────────────────
  const timeline = resolveShowdownTimeline(table)
  table.settlementTimeline = timeline

  // ── 4. 按时间线派奖（更新玩家 chips） ─────────────────────────────────────
  for (const step of timeline) {
    for (const dist of step.distributions) {
      const player = table.playerList.find((p) => p.seatIdx === dist.seatIdx)
      if (player) {
        player.chips += dist.amount
      }
    }
  }

  // ── 5. 筹码守恒性校验 ─────────────────────────────────────────────────────
  const finalTotal = table.playerList.reduce((sum, p) => sum + p.chips, 0)
  if (Math.abs(finalTotal - totalInitChips) > CHIPS_TOLERANCE) {
    return buildErr(
      HandValidationErrorCode.CHIPS_CONSERVATION,
      `筹码总量不守恒: 初始=${totalInitChips}, 结算后=${finalTotal}, 差值=${finalTotal - totalInitChips}`
    )
  }

  // ── 6. 逐一比对 result.players ────────────────────────────────────────────
  // ⚡ stack=0 → 委托引擎自动填充（不报错，直接写入正确值）
  // ⚡ stack≠0 → 与引擎值比对，不符则返回详细 SETTLEMENT_MISMATCH 诊断报告
  for (const rp of gameHand.result.players) {
    const simPlayer = table.playerList.find((p) => p.seatIdx === rp.seat_no)
    if (!simPlayer) {
      return buildErr(
        HandValidationErrorCode.SETTLEMENT_MISMATCH,
        `result.players 中 seat_no=${rp.seat_no} 在玩家列表中找不到对应玩家`
      )
    }

    if (rp.stack === 0) {
      // ⚡ 委托引擎模式：自动填充正确值（原地 mutate，调用方可直接使用 gameHand.result）
      rp.stack = simPlayer.chips
      continue
    }

    if (Math.abs(simPlayer.chips - rp.stack) > CHIPS_TOLERANCE) {
      // 计算投入明细（用于诊断报告）
      const initStack = simPlayer.initChips ?? simPlayer.fixInitChips ?? 0
      const totalBet = initStack - simPlayer.chips + (simPlayer.winChips ?? 0)

      // 找到该玩家的赢取金额（从 timeline 归总）
      let winAmount = 0
      for (const step of timeline) {
        for (const dist of step.distributions) {
          if (dist.seatIdx === rp.seat_no) {
            winAmount += dist.amount
          }
        }
      }

      const engineValue = simPlayer.chips

      return buildDiagnosticErr(
        HandValidationErrorCode.SETTLEMENT_MISMATCH,
        `seat=${rp.seat_no} 结算不匹配。` +
        `你填写的 result.stack=${rp.stack}，引擎通过回放计算的正确值=${engineValue}。` +
        `该玩家初始筹码=${initStack}，总投入约=${totalBet}，赢取=${winAmount}。`,
        {
          street: 'river',
          fixPath: `result.players[seat_no=${rp.seat_no}].stack`,
          suggestion: `将 result.players 中 seat_no=${rp.seat_no} 的 stack 改为 ${engineValue}。` +
            `或将所有 result.players[*].stack 改为 0，让引擎自动计算所有结算值。`,
        }
      )
    }
  }

  return buildOk()
}

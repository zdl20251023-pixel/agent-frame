/**
 * 牌谱校验引擎 —— 总入口 simulateHand
 *
 * 四层校验流水线：
 *   Layer 1  (调用方)  Zod Schema 结构校验
 *   Layer 2  (本模块)  语义预校验（hand_pre_validator）
 *   Layer 3  (本模块)  动态推演（StreetManager：isCanOperAction + executePlayerAction）
 *   Layer 4  (本模块)  结算校验（settlement_validator：resolveShowdownTimeline + 守恒）
 *
 * 设计原则（方案 D 扩展版）：
 *   - 零副作用：不启动 XState Actor，不访问任何持久化/网络资源
 *   - 纯函数复用：直接调用 player_action.ts 中导出的三个核心函数
 *   - 全 AI 玩家：避免触发 game_emitter.hero_oper_action 事件
 *   - 超时禁用：betBeyondTime=0，curBetStartTime=0
 */

import type { LatestHandType } from '../../agent-tools/tool_nl_to_hand'
import { validateHandSemantics } from './hand_pre_validator'
import { buildSimTable } from './sim_table_builder'
import { StreetManager } from './street_manager'
import { validateSettlement } from './settlement_validator'
import { buildErr, buildOk, HandValidationErrorCode, type HandValidationResult } from './types'

/**
 * 对一份牌谱对象执行完整的四层校验
 *
 * @param gameHand 已通过 Zod Schema 校验的牌谱对象
 * @returns HandValidationResult
 *   - ok=true  : 牌谱合法
 *   - ok=false : 不合法，message 字段包含详细原因，step 指向出错的 actions 下标
 *
 * 可能的错误码：
 *   SEMANTIC_INVALID     —— Layer 2 语义预校验失败
 *   TABLE_BUILD_FAILED   —— 模拟桌初始化失败（座位/盲注配置异常）
 *   EVENT_TRANSLATE_FAILED —— 动作类型未知或公共牌格式非法（action_translator 返回）
 *   STREET_INVALID       —— 公共牌时机错误或轮次流转逻辑错误
 *   MACHINE_REJECTED     —— 引擎拒绝该玩家动作（下注额度/类型/顺序不合法）
 *   SETTLEMENT_MISMATCH  —— 结算金额与 result 字段不匹配
 *   CHIPS_CONSERVATION   —— 结算后筹码总量不守恒
 *   MACHINE_EXCEPTION    —— 运行时异常
 */
export function simulateHand(gameHand: LatestHandType): HandValidationResult {
  try {
    // ── Layer 2：语义预校验 ──────────────────────────────────────────────────
    const preResult = validateHandSemantics(gameHand)
    if (!preResult.ok) {
      return preResult
    }

    // ── 构建模拟桌 ──────────────────────────────────────────────────────────
    const built = buildSimTable(gameHand)
    if (!built) {
      return buildErr(
        HandValidationErrorCode.TABLE_BUILD_FAILED,
        '模拟桌构建失败：请检查玩家列表、盲注配置及 dealer/sb/bb 座位是否正确'
      )
    }
    const { table, totalChips } = built

    // ── Layer 3：动态推演 ────────────────────────────────────────────────────
    const manager = new StreetManager(table)

    for (let step = 0; step < gameHand.actions.length; step++) {
      const action = gameHand.actions[step]
      if (!action) {
        return buildErr(HandValidationErrorCode.MACHINE_EXCEPTION, `actions[${step}] 不存在`)
      }
      const result =
        action.seat_no === -1
          ? manager.applyBoard(action.action, step)
          : manager.applyPlayerAction(action, step)

      if (!result.ok) {
        return result
      }
    }

    // ── Layer 4：结算校验（仅牌局正常结束时执行） ────────────────────────────
    if (!manager.isHandEnded()) {
      return buildOk()
    }
    return validateSettlement(table, gameHand, totalChips)
  } catch (e) {
    return buildErr(
      HandValidationErrorCode.MACHINE_EXCEPTION,
      `运行时异常: ${e instanceof Error ? e.message : String(e)}`
    )
  }
}

// 重新导出常用类型，方便调用方
export type { HandValidationResult }
export { HandValidationErrorCode } from './types'
export { buildOk, buildErr }

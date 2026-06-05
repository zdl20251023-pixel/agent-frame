/**
 * 牌谱校验引擎 Layer 3 —— 动态推演管理器（StreetManager）
 *
 * 职责：
 *   - 管理 preflop / flop / turn / river 四个街道的状态转换
 *   - 复用 isCanOperAction / executePlayerAction / isCurRoundActionComplete 三个纯函数
 *   - 处理玩家动作（applyPlayerAction）和公共牌（applyBoard）
 *   - 街道切换：mergeStreetToContributions → rebuildPots → 发牌 → 重置轮次状态 → 设置首个行动者
 *
 * 关键约束（零 Mock）：
 *   - 所有玩家 isAI=true，executePlayerAction 内的 game_emitter 不会被触发
 *   - betBeyondTime=0 / curBetStartTime=0，超时判断永不触发
 *   - simSeqId 与 table.currentBetSequenceId 严格同步，保证 sequenceId 校验通过
 */

import { type table_Type, table_state_Type } from '../core/game_types.js'
import { getMinBetValue, getMinRaiseValue } from '../utils/sim_utils'
import { mergeStreetToContributions, rebuildPots } from '../core/pot_manager'
import type { SimTableEventOperAction } from './types'
import {
  executePlayerAction,
  getWaitOperList,
  isCanOperAction,
  isCurRoundActionComplete,
  type PlayerActionContext,
} from '../core/player_rules'
import {
  translateBoardAction,
  translatePlayerAction,
  type HandActionItem,
} from './action_translator'
import {
  buildDiagnosticErr,
  buildErr,
  buildOk,
  HandValidationErrorCode,
  OPER_CODE_HUMAN_MAP,
  SIM_HTTP_RSP_FLAG,
  type HandValidationResult,
  type StreetPhase,
  type TableSnapshot,
  type ValidationDiagnostics,
} from './types'

/**
 * 从 table 当前状态构建桌面快照（用于诊断报告）
 * @param table 牌桌对象（推演进行中的状态）
 * @param bb 大盲注额（用于推导最小下注/加注）
 * @returns 桌面快照对象
 */
function buildTableSnapshot(table: table_Type, bb?: number): TableSnapshot {
  const bigBlind = bb ?? table.bb ?? 2

  // 计算最小下注和最小加注（复用 getMinBetValue / getMinRaiseValue）
  let minBet: number | undefined
  let minRaise: number | undefined
  let maxRaise: number | undefined

  const maxBet = table.currentMaxBet ?? 0

  try {
    if (maxBet === 0) {
      // 当前无人下注，计算最小 bet 额
      minBet = getMinBetValue(table)
    } else {
      // 已有人下注，计算最小 raise 到的总额
      const lastRaiseInc = Math.max(table.lastRaiseInc ?? 0, getMinRaiseValue(table))
      const currentPlayer = table.playerList.find(
        (p) => p.seatIdx === table.currentPlayerIndex
      )
      const curBet = currentPlayer?.curBet ?? 0
      const remain = currentPlayer?.chips ?? 0
      minRaise = maxBet + lastRaiseInc // 加注到的总额下限
      maxRaise = remain + curBet       // 加注到的总额上限（全下）
    }
  } catch {
    // 忽略计算失败，不影响主流程
    minBet = bigBlind
  }

  const activePlayers = table.playerList
    .filter((p) => p.isActive)
    .map((p) => ({
      seat: p.seatIdx,
      chips: p.chips,
      curBet: p.curBet ?? 0,
      isFold: p.isFold,
      isAllin: p.isAllin,
    }))

  return {
    pot: table.pot ?? 0,
    currentMaxBet: maxBet,
    minBet,
    minRaise,
    maxRaise,
    activePlayers,
  }
}

/**
 * 将 isCanOperAction 返回的内部错误码翻译成人话，并生成修复建议
 * @param code 内部错误码字符串
 * @param action 动作类型（raise/bet/call/check/fold/allin）
 * @param amount 提交的金额
 * @param snapshot 桌面快照
 * @param seat 出错座位
 * @param step actions 下标
 * @returns { reason, suggestion, fixPath }
 */
function translateOperError(
  code: string,
  _action: string,
  amount: number,
  snapshot: TableSnapshot,
  seat: number,
  step: number
): { reason: string; suggestion: string; fixPath: string } {
  const human = OPER_CODE_HUMAN_MAP[code] ?? `引擎拒绝: ${code}`
  const player = snapshot.activePlayers.find((p) => p.seat === seat)
  const remain = player?.chips ?? 0
  const fixPath = `actions[${step}].amount`

  // 根据错误码提供针对性建议
  if (code === 'ERR_INVALID_OPER_RAISE') {
    const minR = snapshot.minRaise ?? snapshot.currentMaxBet * 2
    const maxR = snapshot.maxRaise ?? remain + (player?.curBet ?? 0)
    return {
      reason: `${human}：提交 amount=${amount}，最小加注到 ${minR}，最大加注到 ${maxR}`,
      suggestion: `将 amount 改为 ${minR}（最小合法加注额），或改为 ${maxR}（全下）`,
      fixPath,
    }
  }

  if (code === 'ERR_INVALID_OPER_BET') {
    const minB = snapshot.minBet ?? 2
    const maxB = remain
    if (snapshot.currentMaxBet > 0) {
      return {
        reason: `${human}：场上已有下注（maxBet=${snapshot.currentMaxBet}），postflop 后续行动应使用 raise 而非 bet`,
        suggestion: `将 action 改为 raise，并将 amount 设为合法的加注总额（最小 ${snapshot.minRaise ?? snapshot.currentMaxBet * 2}）`,
        fixPath: `actions[${step}].action`,
      }
    }
    return {
      reason: `${human}：提交 amount=${amount}，最小下注 ${minB}，最大下注 ${maxB}`,
      suggestion: `将 amount 改为 ${minB}（最小合法下注额）`,
      fixPath,
    }
  }

  if (code === 'ERR_INVALID_OPER_CHECK') {
    return {
      reason: `${human}：当前 maxBet=${snapshot.currentMaxBet}，场上有人下注，不能直接过牌`,
      suggestion: `将 action 改为 call（跟注）或 fold（弃牌），或 raise（加注）`,
      fixPath: `actions[${step}].action`,
    }
  }

  if (code === 'ERR_NOT_CURRENT_SEAT' || code === 'ERR_INVALID_OPER_TYPE') {
    return {
      reason: `${human}：seat=${seat} 不是当前应行动的玩家，当前轮次玩家应按顺序依次行动`,
      suggestion: `检查行动顺序：确认 seat=${seat} 是否轮到行动，注意不能跳过中间还未行动的玩家`,
      fixPath: `actions[${step}].seat_no`,
    }
  }

  if (code === 'ERR_ALREADY_ALLIN') {
    return {
      reason: `${human}：seat=${seat} 已全下，不能再有行动记录`,
      suggestion: `删除 actions[${step}] 这条记录，全下玩家后续不再出现在 actions 中`,
      fixPath: `actions[${step}]`,
    }
  }

  // 通用降级
  return {
    reason: human,
    suggestion: `检查 actions[${step}] 的 action 类型和 amount 是否符合当前局面`,
    fixPath,
  }
}

/**
 * Layer 3 核心：街道推推演管理器
 *
 * 用法：
 *   const mgr = new StreetManager(table)
 *   for (const action of gameHand.actions) {
 *     const result = action.seat_no === -1
 *       ? mgr.applyBoard(action.action, step)
 *       : mgr.applyPlayerAction(action, step)
 *     if (!result.ok) return result
 *   }
 */
export class StreetManager {
  private readonly table: table_Type
  private currentStreet: Exclude<StreetPhase, 'showdown'> = 'preflop'
  /** 本地序列号计数器，与 table.currentBetSequenceId 严格同步 */
  private simSeqId = 0

  constructor(table: table_Type) {
    this.table = table
    this._initPreflopAction()
  }

  // ─── 公共接口 ───────────────────────────────────────────────────────────────

  /**
   * 应用一个玩家动作（fold / check / call / bet / raise / allin）
   * @param action 行动记录（seat_no != -1）
   * @param step   该动作在 actions 数组中的下标（用于错误定位）
   * @returns 校验结果
   */
  applyPlayerAction(action: HandActionItem, step: number): HandValidationResult {
    // ① 不允许在轮次已结束后继续出现玩家动作
    const ctx = this._makeContext()
    if (isCurRoundActionComplete(ctx)) {
      return buildErr(
        HandValidationErrorCode.STREET_INVALID,
        `当前${this.currentStreet}下注轮已完成，不应再出现玩家动作`,
        step,
        action.action,
        action.seat_no
      )
    }

    // ② 通过 action_translator 翻译动作（映射 betType + 构建 operData）
    const translated = translatePlayerAction(action, this.table)
    if (translated.type === 'fail') {
      return buildErr(
        HandValidationErrorCode.EVENT_TRANSLATE_FAILED,
        translated.reason,
        step,
        action.action,
        action.seat_no
      )
    }
    const { operData } = translated

    // ③ 构建事件对象
    const event: SimTableEventOperAction = {
      type: 'oper_action',
      data: operData,
      httpRspFlag: SIM_HTTP_RSP_FLAG,
    }

    // ④ 合法性校验（含座位/sequenceId/betType/chips 等完整业务校验）
    // 先采集桌面快照（在 isCanOperAction 之前，确保状态未被修改）
    const snapshot = buildTableSnapshot(this.table)
    const canResult = isCanOperAction(ctx, event)

    if (!canResult.ok) {
      // 将内部错误码翻译为人话 + 提供具体修复建议
      const { reason, suggestion, fixPath } = translateOperError(
        canResult.code,
        action.action,
        action.amount,
        snapshot,
        action.seat_no,
        step
      )

      // 构建行动顺序诊断（若是座位顺序错误，给出期望座位）
      const diagnostics: ValidationDiagnostics = {
        street: this.currentStreet,
        tableSnapshot: snapshot,
        suggestion,
        fixPath,
      }

      // 若是座位不匹配错误，补充期望座位信息
      if (
        (canResult.code as string) === 'ERR_NOT_CURRENT_SEAT' ||
        (canResult.code as string) === 'ERR_INVALID_OPER_TYPE'
      ) {
        diagnostics.expectedSeat = this.table.currentPlayerIndex
        diagnostics.actualSeat = action.seat_no
        diagnostics.suggestion =
          `在 actions[${step}] 之前，确保 seat=${this.table.currentPlayerIndex} 已完成其行动（fold/check/call 等）。` +
          `若 seat=${this.table.currentPlayerIndex} 应 fold，请插入 {"action":"fold","seat_no":${this.table.currentPlayerIndex},"amount":0}`
        diagnostics.fixPath = `actions[${step}].seat_no`
      }

      return buildDiagnosticErr(
        HandValidationErrorCode.MACHINE_REJECTED,
        reason,
        diagnostics,
        step,
        action.action,
        action.seat_no
      )
    }

    // ⑤ 执行动作（更新 table 状态：chips / curBet / pot / hasActed 等）
    executePlayerAction(ctx, operData)

    // ⑥ 推进到下一个行动者（若本轮已结束则不推进）
    this._advanceToNextPlayer()

    return buildOk()
  }

  /**
   * 应用一个公共牌动作（发翻牌 / 转牌 / 河牌）
   * @param boardStr 紧凑公共牌字符串，例 "4cAcQc"（flop）或 "5d"（turn / river）
   * @param step     该动作在 actions 数组中的下标（用于错误定位）
   * @returns 校验结果
   */
  applyBoard(boardStr: string, step: number): HandValidationResult {
    // ① 发公共牌前，要求当前轮次已经结束
    const ctx = this._makeContext()
    if (!isCurRoundActionComplete(ctx)) {
      // 找出还未完成行动的玩家，加入修复建议
      const pendingPlayers = this.table.playerList
        .filter((p) => p.isActive && !p.isFold && !p.isAllin && !p.hasActed)
        .map((p) => p.seatIdx)
      const pendingStr = pendingPlayers.length > 0
        ? `（还需行动的玩家：seat=${pendingPlayers.join(', ')}）`
        : ''

      return buildErr(
        HandValidationErrorCode.STREET_INVALID,
        `当前${this.currentStreet}下注轮尚未结束，不应出现公共牌动作${pendingStr}。` +
        `请在公共牌之前补全所有玩家的行动。`,
        step
      )
    }

    // ② 通过 action_translator 解析公共牌字符串 → card_Type[]
    const boardResult = translateBoardAction(boardStr)
    if (boardResult.type === 'fail') {
      return buildErr(HandValidationErrorCode.EVENT_TRANSLATE_FAILED, boardResult.reason, step)
    }
    const { cards } = boardResult

    // ③ 判断即将进入的街道（根据当前街道 + 牌数校验一致性）
    type NextStreet = 'flop' | 'turn' | 'river'
    let nextStreet: NextStreet
    if (this.currentStreet === 'preflop' && cards.length === 3) {
      nextStreet = 'flop'
    } else if (this.currentStreet === 'flop' && cards.length === 1) {
      nextStreet = 'turn'
    } else if (this.currentStreet === 'turn' && cards.length === 1) {
      nextStreet = 'river'
    } else {
      return buildErr(
        HandValidationErrorCode.STREET_INVALID,
        `公共牌时机错误: 当前街道=${this.currentStreet}, 收到 ${cards.length} 张公共牌（` +
        `preflop→flop 需3张，flop→turn 需1张，turn→river 需1张）`,
        step
      )
    }

    // ④ 街道切换：合并下注→重建边池→发牌→重置轮次状态
    mergeStreetToContributions(this.table)
    rebuildPots(this.table)
    this.table.board.push(...cards)
    this._resetRoundState(nextStreet)

    return buildOk()
  }

  /**
   * 获取当前街道阶段
   * @returns 当前街道（'preflop' | 'flop' | 'turn' | 'river'）
   */
  getCurrentStreet(): Exclude<StreetPhase, 'showdown'> {
    return this.currentStreet
  }

  /**
   * 判断当前下注轮是否已经结束
   * 可用于外部检查是否可以切换街道或进入结算
   * @returns true=当前轮次已完成（所有活跃玩家已行动且下注额度一致）
   */
  isCurrentRoundComplete(): boolean {
    return isCurRoundActionComplete(this._makeContext())
  }

  /**
   * 判断牌局是否已正常结束（可进入结算阶段）
   *
   * 三种终止情形（任意一条满足即视为结束）：
   *   1. 弃牌胜出：仅剩 ≤1 个未弃牌活跃玩家
   *   2. River 完结：当前街道为 river 且本轮下注已闭合
   *   3. 全员 All-in：所有未弃牌活跃玩家均已 all-in，且本轮已闭合（无需再行动）
   *
   * @returns true=牌局已结束（应执行 Layer4 结算校验），false=牌局进行中（跳过结算校验）
   */
  isHandEnded(): boolean {
    const activePlayers = this.table.playerList.filter((p) => p.isActive && !p.isFold)

    // 情形 1：只剩 0 或 1 人未弃牌（弃牌胜出）
    if (activePlayers.length <= 1) {
      return true
    }

    const roundComplete = isCurRoundActionComplete(this._makeContext())

    // 情形 2：River 下注轮已完整闭合
    if (this.currentStreet === 'river' && roundComplete) {
      return true
    }

    // 情形 3：所有未弃牌活跃玩家已 all-in，且本轮无剩余行动（全员 all-in 跑牌）
    const canActPlayers = activePlayers.filter((p) => !p.isAllin && p.chips > 0)
    if (canActPlayers.length === 0 && roundComplete) {
      return true
    }

    return false
  }

  /** 获取当前街道（getter 形式，与 getCurrentStreet 等价，保留兼容性） */
  get street(): Exclude<StreetPhase, 'showdown'> {
    return this.currentStreet
  }

  // ─── 私有方法 ───────────────────────────────────────────────────────────────

  /**
   * 构建 PlayerActionContext（满足 isCanOperAction / executePlayerAction 的上下文签名）
   */
  private _makeContext(): PlayerActionContext {
    const stage =
      this.currentStreet === 'preflop' ||
      this.currentStreet === 'flop' ||
      this.currentStreet === 'turn' ||
      this.currentStreet === 'river'
        ? this.currentStreet
        : ('preflop' as const)
    return {
      getTable: () => this.table,
      getHttpRspFlag: () => SIM_HTTP_RSP_FLAG,
      shouldEnterShowdown: false,
      stage,
    }
  }

  /**
   * 初始化翻牌前首个行动玩家（UTG = BB 之后第一个活跃玩家）
   */
  private _initPreflopAction(): void {
    const firstActor = this._findNextActiveSeatAfter(this.table.bbSeatIdx)
    this.table.currentPlayerIndex = firstActor ?? this.table.bbSeatIdx
    this.table.currentBetSequenceId = ++this.simSeqId
    this.table.curBetStartTime = 0
    this.table.currentOperList = getWaitOperList(this.table)
  }

  /**
   * 玩家动作结束后，推进 currentPlayerIndex 到下一个行动者
   * 如果当前轮次已结束（isCurRoundActionComplete = true），则不推进
   */
  private _advanceToNextPlayer(): void {
    const ctx = this._makeContext()
    if (isCurRoundActionComplete(ctx)) { return }

    const next = this._findNextActiveSeatAfter(this.table.currentPlayerIndex)
    if (next === null) { return }

    this.table.currentPlayerIndex = next
    this.table.currentBetSequenceId = ++this.simSeqId
    this.table.curBetStartTime = 0
    this.table.currentOperList = getWaitOperList(this.table)
  }

  /**
   * 街道切换时重置轮次状态（curBet / hasActed / maxBet 等）
   * 翻牌后的行动顺序从 BTN 之后（SB 位）开始
   * @param newStreet 即将进入的街道
   */
  private _resetRoundState(newStreet: 'flop' | 'turn' | 'river'): void {
    // 重置每轮下注相关字段
    this.table.streetBets = {}
    this.table.currentMaxBet = 0
    this.table.lastRaiseInc = 0
    this.table.isHaveRaise = false
    this.table.aggressorIdx = -1

    // 重置所有活跃未弃牌玩家的本轮状态
    for (const p of this.table.playerList) {
      if (!p.isActive || p.isFold) { continue }
      p.curBet = 0
      p.hasActed = false
      p.canOnlyCallOrFold = false
    }

    // 更新当前街道及 table.state
    this.currentStreet = newStreet
    switch (newStreet) {
      case 'flop':
        this.table.state = table_state_Type.flop
        break
      case 'turn':
        this.table.state = table_state_Type.turn
        break
      case 'river':
        this.table.state = table_state_Type.river
        break
    }

    // 翻牌后行动从 BTN 之后（SB 方向）开始
    const firstActor = this._findNextActiveSeatAfter(this.table.btnSeatIdx)
    if (firstActor !== null) {
      this.table.currentPlayerIndex = firstActor
      this.table.currentBetSequenceId = ++this.simSeqId
      this.table.curBetStartTime = 0
      this.table.currentOperList = getWaitOperList(this.table)
    } else {
      // 所有人都已 all-in 或弃牌，后续直接走结算
      this.table.currentPlayerIndex = -1
    }
  }

  /**
   * 从指定座位号之后，顺时针找到下一个可行动玩家的座位号
   * 可行动      = isActive && !isFold（含 all-in，因为 isCurRoundActionComplete 会处理 all-in 判断）
   * 仅用于确定「下一位」，实际合法性由 isCanOperAction 校验
   * @param afterSeatIdx 当前座位号
   * @returns 下一个可行动座位号，或 null（无可行动玩家）
   */
  private _findNextActiveSeatAfter(afterSeatIdx: number): number | null {
    // 只找活跃且未弃牌且有筹码的玩家（all-in 玩家不需要行动）
    const actionable = this.table.playerList
      .filter((p) => p.isActive && !p.isFold && !p.isAllin && p.chips > 0)
      .sort((a, b) => a.seatIdx - b.seatIdx)

    if (actionable.length === 0) { return null }

    // 优先取 seatIdx > afterSeatIdx 的最小座位
    const after = actionable.filter((p) => p.seatIdx > afterSeatIdx)
    if (after.length > 0) { return after[0]?.seatIdx ?? null }

    // 环绕：取最小座位
    return actionable[0]?.seatIdx ?? null
  }
}

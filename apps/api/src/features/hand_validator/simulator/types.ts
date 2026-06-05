/**
 * 牌谱校验引擎 —— 公共类型定义
 * 被 hand_pre_validator / sim_table_builder / street_manager / settlement_validator 等子模块复用
 */

import type { ApiType, HttpRspFlag, bet_Type } from '../core/game_types.js'

export interface game_server_oper_action_post_body_Type {
  uid: number
  tableId: string
  cardId: string
  seatIdx: number
  isAI: boolean
  betType: bet_Type
  chips: number
  sequenceId?: number
}

/** 街道阶段（preflop/flop/turn/river/showdown） */
export type StreetPhase = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

/** 桌面快照（出错时捕获的当前状态摘要，供 AI 诊断使用） */
export type TableSnapshot = {
  pot: number
  currentMaxBet: number
  /** 最小加注到（raise 场景） */
  minRaise?: number
  /** 最大加注到（通常为玩家剩余筹码 + curBet） */
  maxRaise?: number
  /** 最小下注额（bet 场景，postflop 无人下注时） */
  minBet?: number
  /** 当前局内活跃玩家摘要 */
  activePlayers: Array<{
    seat: number
    chips: number
    curBet: number
    isFold: boolean
    isAllin: boolean
  }>
}

/** 诊断信息（附带在 HandValidationResult 上，供 AI 定向修复使用） */
export type ValidationDiagnostics = {
  /** 出错时所处的街道 */
  street: Exclude<StreetPhase, 'showdown'>
  /** 期望行动的座位号（顺序错误时使用） */
  expectedSeat?: number
  /** 实际提交行动的座位号（顺序错误时使用） */
  actualSeat?: number
  /** 出错时的桌面快照 */
  tableSnapshot?: TableSnapshot
  /** 修复建议（直接告知 AI 应如何修改字段） */
  suggestion?: string
  /** JSON 路径（精确告知应修改哪个字段，格式：actions[N].amount） */
  fixPath?: string
}

/** 校验结果 */
export type HandValidationResult = {
  ok: boolean
  message: string
  code: HandValidationErrorCode
  /** 出错的 actions 数组下标（0-based），方便定位 */
  step?: number
  /** 诊断信息（仅 ok=false 时存在，供调试/AI 定向修复使用） */
  diagnostics?: ValidationDiagnostics
}

/** 错误码枚举 */
export enum HandValidationErrorCode {
  /** 校验通过 */
  OK = 'OK',
  /** Zod Schema 不合法（由调用方在 execute 之前处理） */
  SCHEMA_INVALID = 'SCHEMA_INVALID',
  /** 语义层不合法：牌面重复、座位冲突、公共牌数量错误等 */
  SEMANTIC_INVALID = 'SEMANTIC_INVALID',
  /** 模拟桌构建失败：玩家找不到、盲注配置异常等 */
  TABLE_BUILD_FAILED = 'TABLE_BUILD_FAILED',
  /** 引擎层拒绝：isCanOperAction 返回 ok=false */
  MACHINE_REJECTED = 'MACHINE_REJECTED',
  /** 街道流转错误：公共牌时机不对、多余玩家动作等 */
  STREET_INVALID = 'STREET_INVALID',
  /** 结算金额与 result 字段不匹配 */
  SETTLEMENT_MISMATCH = 'SETTLEMENT_MISMATCH',
  /** 结算后筹码总量不守恒 */
  CHIPS_CONSERVATION = 'CHIPS_CONSERVATION',
  /** 动作翻译失败：未知玩家动作类型或公共牌格式错误（由 action_translator 返回） */
  EVENT_TRANSLATE_FAILED = 'EVENT_TRANSLATE_FAILED',
  /** 运行时异常（未预期错误） */
  MACHINE_EXCEPTION = 'MACHINE_EXCEPTION',
}

/**
 * 内部错误码 → 人话翻译
 * 对应 isCanOperAction 返回 of EnumOperActionCode 字符串
 */
export const OPER_CODE_HUMAN_MAP: Record<string, string> = {
  ERR_ALREADY_ALLIN: '该玩家已全下，不能继续行动',
  ERR_INVALID_OPER_TYPE: '当前局面不允许此操作类型',
  ERR_INVALID_OPER_CHECK: '当前有人下注，不能过牌（check）',
  ERR_INVALID_OPER_CALL: '无法跟注：当前无需跟注，或玩家筹码为 0',
  ERR_INVALID_OPER_ALL_IN: '无法全下：玩家筹码已为 0',
  ERR_INVALID_OPER_RAISE: '加注金额不合法：不满足最小加注要求',
  ERR_INVALID_OPER_BET: '下注金额不合法：当前已有人下注（应用 raise），或下注额低于最小下注',
  ERR_INVALID_OPER_UNKNOWN: '未知操作类型',
  ERR_TIMEOUT: '行动超时',
  ERR_NOT_CURRENT_SEAT: '不是该座位的行动轮次',
  ERR_PLAYER_INVALID: '玩家无效（不在局、已弃牌等）',
  ERR_CARD_OR_TABLE: '牌局ID或牌桌ID不匹配',
  ERR_EVENT_DATA_EMPTY: '事件数据为空',
}

/**
 * 构建合法结果
 * @returns ok=true 的校验结果
 */
export function buildOk(): HandValidationResult {
  return { ok: true, message: '合法', code: HandValidationErrorCode.OK }
}

/**
 * 构建不合法结果（简单版，向后兼容）
 * @param code 错误码
 * @param reason 原因描述
 * @param step 出错的 actions 下标
 * @param action 出错的动作字符串
 * @param seat 出错的座位号
 * @returns ok=false 的校验结果
 */
export function buildErr(
  code: HandValidationErrorCode,
  reason: string,
  step?: number,
  action?: string,
  seat?: number
): HandValidationResult {
  const parts: string[] = [`code=${code}`]
  if (step !== undefined) { parts.push(`step=${step}`) }
  if (action !== undefined) { parts.push(`action=${action}`) }
  if (seat !== undefined) { parts.push(`seat=${seat}`) }
  parts.push(`reason=${reason}`)
  return {
    ok: false,
    message: `不合法: ${parts.join(', ')}`,
    code,
    step,
  }
}

/**
 * 构建结构化诊断错误报告（增强版，供 AI 定向修复使用）
 */
export function buildDiagnosticErr(
  code: HandValidationErrorCode,
  reason: string,
  diagnostics: ValidationDiagnostics,
  step?: number,
  action?: string,
  seat?: number
): HandValidationResult {
  const lines: string[] = ['不合法']
  lines.push(`[错误码] ${code}`)

  // 出错位置行
  if (step !== undefined) {
    const streetInfo = diagnostics.street ? `第 ${diagnostics.street} 轮` : ''
    const seatInfo = seat !== undefined ? ` seat=${seat} 的` : ''
    const actionInfo = action ? ` ${action} 动作` : ''
    lines.push(`[出错位置] actions[${step}] —${streetInfo}${seatInfo}${actionInfo}`)
  }

  lines.push(`[错误原因] ${reason}`)

  // 桌面快照行
  if (diagnostics.tableSnapshot) {
    const snap = diagnostics.tableSnapshot
    const snapParts: string[] = [
      `pot=${snap.pot}`,
      `currentMaxBet=${snap.currentMaxBet}`,
    ]
    if (snap.minRaise !== undefined) { snapParts.push(`minRaise=${snap.minRaise}`) }
    if (snap.maxRaise !== undefined) { snapParts.push(`maxRaise=${snap.maxRaise}`) }
    if (snap.minBet !== undefined) { snapParts.push(`minBet=${snap.minBet}`) }
    if (seat !== undefined) {
      const player = snap.activePlayers.find((p) => p.seat === seat)
      if (player) { snapParts.push(`seat=${seat}剩余筹码=${player.chips}`) }
    }
    lines.push(`[桌面快照] ${snapParts.join(', ')}`)
  }

  // 行动顺序错误时，显示期望座位
  if (diagnostics.expectedSeat !== undefined && diagnostics.actualSeat !== undefined) {
    lines.push(
      `[行动顺序] 当前应由 seat=${diagnostics.expectedSeat} 行动，但收到 seat=${diagnostics.actualSeat} 的动作`
    )
  }

  // 修复建议行（含 fix_path，供 AI 精确定位并修复）
  if (diagnostics.suggestion || diagnostics.fixPath) {
    const fixParts: string[] = []
    if (diagnostics.fixPath) { fixParts.push(`fix_path=${diagnostics.fixPath}`) }
    if (diagnostics.suggestion) { fixParts.push(`fix=${diagnostics.suggestion}`) }
    lines.push(`[修复建议] ${fixParts.join(' | ')}`)
  }

  return {
    ok: false,
    message: lines.join('\n'),
    code,
    step,
    diagnostics,
  }
}

/**
 * 模拟器专用的 HttpRspFlag 占位符
 * 仅用于满足接口签名，不会触发实际网络/日志副作用
 */
export const SIM_HTTP_RSP_FLAG: HttpRspFlag = {
  uid: 0,
  apiType: 'simulator' as unknown as ApiType,
  tableId: 'sim',
  actionId: 'sim',
  reqStartTime: 0,
}

// 内联 TableEventOperAction 核心定义以消除 types.ts 的外部 XState 动作依赖
export interface SimTableEventOperAction {
  type: 'oper_action'
  data: game_server_oper_action_post_body_Type
  httpRspFlag: HttpRspFlag
}

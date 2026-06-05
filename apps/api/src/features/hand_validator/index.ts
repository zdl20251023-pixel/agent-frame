import { LatestHandSchema, type LatestHandType } from '../agent-tools/tool_nl_to_hand'
import { simulateHand, type HandValidationResult, HandValidationErrorCode } from './simulator/hand_simulator'

/**
 * 校验牌谱的主入口函数。
 * 首先对传入的 JSON 数据执行 Zod schema 结构性校验，如果校验通过，则执行模拟推演校验。
 * 
 * @param json 待校验的牌谱 JSON 数据
 * @returns 校验结果对象 HandValidationResult
 */
export function validateHandHistory(json: unknown): HandValidationResult {
  const parseResult = LatestHandSchema.safeParse(json)
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0]
    const path = firstError ? firstError.path.join('.') : 'root'
    const message = firstError ? firstError.message : '未知 Schema 校验错误'
    return {
      ok: false,
      code: HandValidationErrorCode.SCHEMA_INVALID,
      message:
        `不合法\n[错误码] SCHEMA_INVALID\n[出错位置] ${path}\n` +
        `[错误原因] ${message}\n` +
        `[修复建议] fix_path=${path} | fix=检查并修正该字段的值和格式`,
    }
  }

  return simulateHand(parseResult.data)
}

// 重新导出类型与 Schema 供外界参考使用
export { LatestHandSchema, type LatestHandType }
export { HandValidationErrorCode, type HandValidationResult } from './simulator/hand_simulator'
export { type PotSettlementStep } from './core/pot_manager'

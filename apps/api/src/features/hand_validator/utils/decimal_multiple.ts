export class DecimalMultiple {
  /** 放大倍数 - 支持0.1精度，所以乘以10 */
  private static multiple: number = 10

  /** 精度容差 - 用于浮点数比较 */
  private static readonly EPSILON = 1e-10

  /**
   * 获取放大后的数值
   * 将小数转换为整数，解决浮点数精度问题
   * @param value 原始数值（支持0.1精度）
   * @returns 放大后的整数值
   * @example
   * getMultipleNumber(0.3) => 3
   * getMultipleNumber(0.2999999) => 3 (修复浮点数精度问题)
   * getMultipleNumber(1.5) => 15
   */
  static getMultipleNumber(value: number): number {
    // 1. 输入验证
    if (!Number.isFinite(value)) {
      throw new Error(`无效的数值: ${value}`)
    }

    // 2. 处理负数
    const isNegative = value < 0
    const absValue = Math.abs(value)

    // 3. 放大并四舍五入到最接近的整数
    // 使用 Math.round 解决 0.2999999 的问题
    const multiplied = absValue * DecimalMultiple.multiple
    const rounded = Math.round(multiplied)

    // 4. 验证精度：确保原始值是0.1的倍数
    const backConverted = rounded / DecimalMultiple.multiple
    const diff = Math.abs(backConverted - absValue)

    if (diff > DecimalMultiple.EPSILON) {
      throw new Error(`数值精度错误: ${value}，只支持0.1的倍数。` + `建议值: ${backConverted}`)
    }

    // 5. 返回带符号的结果
    return isNegative ? -rounded : rounded
  }

  /**
   * 返回缩小后的数值
   * 将整数转换回小数
   * @param value 放大后的整数值
   * @returns 原始小数值
   * @example
   * getNormalNumber(3) => 0.3
   * getNormalNumber(15) => 1.5
   */
  static getNormalNumber(value: number): number {
    // 输入验证
    if (!Number.isInteger(value)) {
      throw new Error(`输入必须是整数: ${value}`)
    }

    const result = value / DecimalMultiple.multiple

    // 确保结果精度正确（保留1位小数）
    return Math.round(result * 10) / 10
  }

  /**
   * 验证数值是否符合0.1精度要求
   * @param value 待验证的数值
   * @returns 是否符合精度要求
   */
  static isValidPrecision(value: number): boolean {
    try {
      DecimalMultiple.getMultipleNumber(value)
      return true
    } catch {
      return false
    }
  }

  /**
   * 安全的加法运算
   * @param a 第一个数值
   * @param b 第二个数值
   * @returns 相加结果
   */
  static safeAdd(a: number, b: number): number {
    const intA = DecimalMultiple.getMultipleNumber(a)
    const intB = DecimalMultiple.getMultipleNumber(b)
    return DecimalMultiple.getNormalNumber(intA + intB)
  }

  /**
   * 安全的减法运算
   * @param a 被减数
   * @param b 减数
   * @returns 相减结果
   */
  static safeSubtract(a: number, b: number): number {
    const intA = DecimalMultiple.getMultipleNumber(a)
    const intB = DecimalMultiple.getMultipleNumber(b)
    return DecimalMultiple.getNormalNumber(intA - intB)
  }

  /**
   * 安全的乘法运算
   * @param value 数值
   * @param factor 乘数因子
   * @returns 相乘结果
   */
  static safeMultiply(value: number, factor: number): number {
    const intValue = DecimalMultiple.getMultipleNumber(value)
    const result = Math.round(intValue * factor)
    return DecimalMultiple.getNormalNumber(result)
  }

  /**
   * 安全的除法运算（返回商和余数）
   * @param dividend 被除数
   * @param divisor 除数
   * @returns {quotient: 商, remainder: 余数}
   */
  static safeDivide(dividend: number, divisor: number): { quotient: number; remainder: number } {
    if (divisor === 0) {
      throw new Error('除数不能为0')
    }

    const intDividend = DecimalMultiple.getMultipleNumber(dividend)
    const quotientInt = Math.floor(intDividend / divisor)
    const remainderInt = intDividend % divisor

    return {
      quotient: DecimalMultiple.getNormalNumber(quotientInt),
      remainder: DecimalMultiple.getNormalNumber(remainderInt),
    }
  }

  /**
   * 比较两个数值是否相等
   * @param a 第一个数值
   * @param b 第二个数值
   * @returns 是否相等
   */
  static equals(a: number, b: number): boolean {
    const intA = DecimalMultiple.getMultipleNumber(a)
    const intB = DecimalMultiple.getMultipleNumber(b)
    return intA === intB
  }

  /**
   * 格式化数值显示（保留1位小数）
   * @param value 数值
   * @returns 格式化后的字符串
   */
  static format(value: number): string {
    return DecimalMultiple.getNormalNumber(DecimalMultiple.getMultipleNumber(value)).toFixed(1)
  }
}

// ============================================================
// JSON Reporter — 输出机器可读的评测报告
// ============================================================

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { EvalReport } from '../types.js'

/**
 * 将评测报告写入 JSON 文件。
 *
 * @param report - 完整评测报告
 * @param outputDir - 输出目录
 * @returns 写入的文件路径
 */
export async function writeJsonReport(report: EvalReport, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true })
  const filename = `nl-to-hand-eval-${report.modelMode}-${Date.now()}.json`
  const filePath = join(outputDir, filename)
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf8')
  return filePath
}

/**
 * 将评测报告序列化为 JSON 字符串（stdout 用）。
 */
export function formatJsonReport(report: EvalReport): string {
  return JSON.stringify(report, null, 2)
}

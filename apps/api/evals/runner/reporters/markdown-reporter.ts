// ============================================================
// Markdown Reporter — 输出人类可读的评测报告
// ============================================================

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { EvalReport } from '../types.js'
import type { MetricThreshold } from '../thresholds.js'

/**
 * 将评测报告格式化为 Markdown 文本。
 */
export function formatMarkdownReport(
  report: EvalReport,
  thresholds: Record<string, MetricThreshold>,
): string {
  const lines: string[] = [
    '# NL to Hand LLM Eval Report',
    '',
    `| 字段 | 值 |`,
    `|------|-----|`,
    `| 运行时间 | ${report.runAt} |`,
    `| 模型模式 | ${report.modelMode} |`,
    `| 总用例 | ${report.metrics.totalCases} |`,
    `| 通过 | ${report.metrics.passedCases} |`,
    `| 失败 | ${report.metrics.failedCases} |`,
    `| 耗时 | ${report.metrics.durationMs}ms |`,
    '',
    '## 核心指标',
    '',
    '| 指标 | 实际值 | 门禁 (min) | 阻断线 | 状态 |',
    '|------|--------|-----------|--------|------|',
  ]

  const metricRows: Array<[string, number]> = [
    ['route_accuracy', report.metrics.route_accuracy],
    ['tool_call_rate', report.metrics.tool_call_rate],
    ['schema_success_rate', report.metrics.schema_success_rate],
    ['validation_success_rate', report.metrics.validation_success_rate],
    ['artifact_success_rate', report.metrics.artifact_success_rate],
    ['patch_preservation_rate', report.metrics.patch_preservation_rate],
  ]

  for (const [name, value] of metricRows) {
    const threshold = thresholds[name]
    const pct = `${(value * 100).toFixed(1)}%`
    const minPct = threshold ? `${(threshold.minRate * 100).toFixed(0)}%` : '—'
    const blockPct = threshold ? `${(threshold.blockRate * 100).toFixed(0)}%` : '—'
    const status = threshold
      ? value >= threshold.minRate
        ? '✅ PASS'
        : value >= threshold.blockRate
          ? '⚠️ WARN'
          : '❌ FAIL'
      : '—'
    lines.push(`| ${name} | ${pct} | ${minPct} | ${blockPct} | ${status} |`)
  }

  if (report.thresholdViolations.length > 0) {
    lines.push('', '## 门禁违规', '')
    for (const violation of report.thresholdViolations) {
      lines.push(`- ${violation}`)
    }
  }

  const failed = report.caseResults.filter((item) => !item.passed)
  if (failed.length > 0) {
    lines.push('', '## 失败用例', '')
    for (const item of failed) {
      lines.push(`### ${item.suite}/${item.id}`, '')
      lines.push(`- 耗时: ${item.durationMs}ms`)
      if (item.errors.length > 0) {
        lines.push('- 错误:')
        for (const err of item.errors) {
          lines.push(`  - ${err}`)
        }
      }
      const failedChecks = Object.entries(item.checks).filter(([, ok]) => !ok)
      if (failedChecks.length > 0) {
        lines.push('- 未通过检查:')
        for (const [check] of failedChecks) {
          lines.push(`  - ${check}`)
        }
      }
      lines.push('')
    }
  }

  lines.push('', '## 全部用例摘要', '', '| Suite | ID | 结果 | 耗时 |', '|-------|-----|------|------|')
  for (const item of report.caseResults) {
    lines.push(`| ${item.suite} | ${item.id} | ${item.passed ? 'PASS' : 'FAIL'} | ${item.durationMs}ms |`)
  }

  return lines.join('\n')
}

/**
 * 将 Markdown 报告写入文件。
 */
export async function writeMarkdownReport(
  report: EvalReport,
  thresholds: Record<string, MetricThreshold>,
  outputDir: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true })
  const filename = `nl-to-hand-eval-${report.modelMode}-${Date.now()}.md`
  const filePath = join(outputDir, filename)
  await writeFile(filePath, formatMarkdownReport(report, thresholds), 'utf8')
  return filePath
}

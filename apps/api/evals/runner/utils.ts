// ============================================================
// Eval 工具函数
// ============================================================

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url))
export const EVALS_ROOT = join(RUNNER_DIR, '..')
export const NL_TO_HAND_DIR = join(EVALS_ROOT, 'nl_to_hand')

/**
 * 读取 JSONL 文件并解析为对象数组。
 *
 * @param filePath - JSONL 文件绝对路径
 */
export async function loadJsonl<T>(filePath: string): Promise<T[]> {
  const raw = await readFile(filePath, 'utf8')
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`Invalid JSONL at ${filePath}:${index + 1}: ${message}`, { cause: err })
      }
    })
}

/**
 * 按路径表达式读取嵌套字段，支持 players[3].hole_card_list 语法。
 *
 * @param obj - 根对象
 * @param path - 点分路径，数组下标用 [n] 表示
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let current: unknown = obj
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * 深比较两个值是否相等（JSON 语义）。
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 等待 Run 进入终态。
 */
export async function waitForRun(
  store: { getRun: (id: string) => Promise<{ status: string } | null> },
  runId: string,
  timeoutMs = 30_000,
): Promise<{ status: string; output?: unknown }> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const run = await store.getRun(runId)
    if (run && run.status !== 'queued' && run.status !== 'running') {
      return run as { status: string; output?: unknown }
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Run did not finish within ${timeoutMs}ms: ${runId}`)
}

/**
 * 解析 CLI 参数。
 */
export function parseArgs(argv: string[]): {
  model: 'fake' | 'real'
  failOnRegression: boolean
  outputDir?: string
} {
  let model: 'fake' | 'real' = 'fake'
  let failOnRegression = false
  let outputDir: string | undefined

  for (const arg of argv) {
    if (arg === '--model=fake' || arg === '--model fake') model = 'fake'
    if (arg === '--model=real' || arg === '--model real') model = 'real'
    if (arg === '--fail-on-regression') failOnRegression = true
    if (arg.startsWith('--output=')) outputDir = arg.slice('--output='.length)
  }

  return { model, failOnRegression, outputDir }
}

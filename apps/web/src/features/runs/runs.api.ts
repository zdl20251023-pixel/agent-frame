import { del } from '../../lib/http.ts'

// ============================================================
// Runs API — 前端 Run 操作封装
// ============================================================

/**
 * 中断正在运行的 Run。
 *
 * @param runId - 需要中断的 Run ID。
 * @returns 后端返回的取消结果。
 */
export async function cancelRun(runId: string): Promise<{ success: boolean; runId: string }> {
  return del(`/runs/${runId}`)
}


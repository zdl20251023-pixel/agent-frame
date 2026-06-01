// ============================================================
// CancellationManager — 管理 AbortController 和取消信号
// ============================================================

export class CancellationManager {
  private controllers = new Map<string, AbortController>()

  create(runId: string): AbortSignal {
    const controller = new AbortController()
    this.controllers.set(runId, controller)
    return controller.signal
  }

  cancel(runId: string, reason?: string): boolean {
    const controller = this.controllers.get(runId)
    if (!controller) return false
    controller.abort(reason ?? 'cancelled')
    this.controllers.delete(runId)
    return true
  }

  cleanup(runId: string): void {
    this.controllers.delete(runId)
  }

  isActive(runId: string): boolean {
    return this.controllers.has(runId)
  }
}

export const cancellationManager = new CancellationManager()

// ============================================================
// shared/observability/metrics.ts — 轻量指标采集
//
// 设计依据：FRAMEWORK_DESIGN §0.6 模块职责边界
//   "shared/observability — 日志、指标、trace 上报"
//
// MVP 阶段不引入 Prometheus / OpenTelemetry 等重型方案
// 使用进程内累加计数器 + 定期打印结构化日志
// 后续可以无缝替换为 Prometheus client 或 OTEL SDK
//
// 采集指标：
// - http_requests_total：HTTP 请求总数（按 method + status）
// - runs_total：Run 创建总数（按 status）
// - a2a_calls_total：A2A 调用总数（按 from_agent + to_agent）
// - model_calls_total：ModelClient 调用总数
// - model_tokens_total：Token 使用累计
// - artifacts_created_total：Artifact 创建总数
// ============================================================

type MetricLabels = Record<string, string | number>

class Counter {
  private counts: Map<string, number> = new Map()

  /** 增加计数 */
  inc(labels: MetricLabels = {}, value = 1): void {
    const key = this.serializeKey(labels)
    this.counts.set(key, (this.counts.get(key) ?? 0) + value)
  }

  /** 获取某 label 组合的计数 */
  get(labels: MetricLabels = {}): number {
    return this.counts.get(this.serializeKey(labels)) ?? 0
  }

  /** 导出所有计数（供日志打印和 /metrics 端点使用）*/
  export(): Record<string, number> {
    return Object.fromEntries(this.counts.entries())
  }

  private serializeKey(labels: MetricLabels): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',')
  }
}

class Gauge {
  private value = 0

  set(v: number) { this.value = v }
  inc(v = 1) { this.value += v }
  dec(v = 1) { this.value -= v }
  get() { return this.value }
}

// ─── 注册全局指标 ──────────────────────────────────────────

export const metrics = {
  httpRequests: new Counter(),
  runsTotal: new Counter(),
  a2aCallsTotal: new Counter(),
  modelCallsTotal: new Counter(),
  modelTokensTotal: new Counter(),
  artifactsCreated: new Counter(),
  activeRuns: new Gauge(),      // 当前正在执行的 Run 数
  activeSseConnections: new Gauge(),  // 当前活跃 SSE 连接数
  activeWsConnections: new Gauge(),   // 当前活跃 WebSocket 连接数
  capabilityRouteTotal: new Counter(),
  nlToHandValidationSuccessRate: new Gauge(),
  nlToHandToolCallRate: new Gauge(),
}

// ─── 指标快照（供 GET /metrics 端点使用）───────────────────

export type MetricsSnapshot = {
  timestamp: string
  httpRequests: Record<string, number>
  runsTotal: Record<string, number>
  a2aCallsTotal: Record<string, number>
  modelCallsTotal: Record<string, number>
  modelTokensTotal: Record<string, number>
  artifactsCreated: Record<string, number>
  activeRuns: number
  activeSseConnections: number
  activeWsConnections: number
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return {
    timestamp: new Date().toISOString(),
    httpRequests: metrics.httpRequests.export(),
    runsTotal: metrics.runsTotal.export(),
    a2aCallsTotal: metrics.a2aCallsTotal.export(),
    modelCallsTotal: metrics.modelCallsTotal.export(),
    modelTokensTotal: metrics.modelTokensTotal.export(),
    artifactsCreated: metrics.artifactsCreated.export(),
    activeRuns: metrics.activeRuns.get(),
    activeSseConnections: metrics.activeSseConnections.get(),
    activeWsConnections: metrics.activeWsConnections.get(),
  }
}

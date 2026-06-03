// ============================================================
// ai/tools/ — Agent 内部工具定义
//
// 规则：
// - Tool 是确定性能力（查询、搜索、计算、文件处理等）
// - Tool 不等于 Agent：Agent 有独立身份、状态和 trace
// - Agent 内部可以使用 Tool，但 Agent 调用 Agent 必须走 A2AClient
//
// MVP 阶段工具示例（待实现）：
// - web-search.tool.ts — 网络搜索
// - calculator.tool.ts — 数学计算
// - code-executor.tool.ts — 代码执行（沙箱）
// ============================================================

export {}

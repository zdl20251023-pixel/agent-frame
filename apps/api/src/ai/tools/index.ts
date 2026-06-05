// ============================================================
// ai/tools/index.ts — Agent 内部工具定义
//
// 规则：
// - Tool 是确定性能力（查询、搜索、计算、文件处理等）
// - Tool 不等于 Agent：Agent 有独立身份、状态和 trace
// - Agent 内部可以使用 Tool，但 Agent 调用 Agent 必须走 A2AClient
//
// 融合增强（阶段 7）：
// - 导出 ToolFactory、ToolRegistry 和内置工具工厂
// - 真实工具可参考 echoToolFactory 模式实现
//
// 待实现的真实工具示例：
// - web-search.tool.ts — 网络搜索
// - calculator.tool.ts — 数学计算
// - code-executor.tool.ts — 代码执行（沙箱）
// ============================================================

export {
  ToolRegistry,
  toolRegistry,
  echoToolFactory,
} from './tool-factory.js'

export type {
  ToolFactory,
  ToolFactoryContext,
} from './tool-factory.js'

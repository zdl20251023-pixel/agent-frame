// ============================================================
// AppErrorCode — 统一错误码定义
// 前后端共享，放在 packages/shared 以便前端可以稳定识别错误
// ============================================================

export type AppErrorCode =
  // ─── HTTP / 通用 ──────────────────────────────────────────
  | 'BAD_REQUEST'             // 请求参数错误
  | 'UNAUTHORIZED'            // 未认证
  | 'FORBIDDEN'               // 已认证但无权限
  | 'NOT_FOUND'               // 资源不存在
  | 'RATE_LIMIT'              // 触发限流
  | 'BUDGET_EXCEEDED'         // 超出 token 或成本预算
  | 'INTERNAL_ERROR'          // 未分类内部错误

  // ─── Run / Step ───────────────────────────────────────────
  | 'RUN_TIMEOUT'             // Run 执行超时
  | 'RUN_CANCELLED'           // Run 被取消

  // ─── Agent / A2A ──────────────────────────────────────────
  | 'AGENT_NOT_FOUND'         // 目标 Agent 不存在
  | 'AGENT_CALL_DENIED'       // A2A Policy 拒绝调用
  | 'AGENT_CALL_TIMEOUT'      // Agent 调用超时
  | 'AGENT_CALL_FAILED'       // Agent 调用失败
  | 'AGENT_MODE_NOT_SUPPORTED' // Agent 不支持该调用模式
  | 'A2A_ASYNC_NOT_IMPLEMENTED' // A2A 异步模式尚未实现

  // ─── Tool / Model ─────────────────────────────────────────
  | 'TOOL_CALL_FAILED'        // Tool 调用失败
  | 'MODEL_CALL_FAILED'       // 模型调用失败
  | 'MODEL_TIMEOUT'           // 模型调用超时

  // ─── Artifact ─────────────────────────────────────────────
  | 'ARTIFACT_SAVE_FAILED'    // Artifact 保存失败
  | 'OUTPUT_VALIDATION_FAILED' // Agent 输出校验失败

  // ─── Workflow（后续扩展）─────────────────────────────────
  | 'WORKFLOW_STAGE_FAILED'   // Workflow 阶段失败

/** HTTP 状态码映射（前端可据此处理 HTTP 响应） */
export const ERROR_HTTP_STATUS: Partial<Record<AppErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMIT: 429,
  BUDGET_EXCEEDED: 402,
  INTERNAL_ERROR: 500,
  MODEL_CALL_FAILED: 502,
  AGENT_CALL_TIMEOUT: 504,
  RUN_TIMEOUT: 504,
} as const

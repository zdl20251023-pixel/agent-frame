import type { A2ACallMode } from '../constants/a2a-constants.js'
import { A2A_CALL_MODES, A2A_STATUSES } from '../constants/a2a-constants.js'

export type A2ARequest = {
  runId: string                         // 所属 Run ID，用于把 A2A 调用挂回主执行链路
  traceId: string                       // 链路追踪 ID，用于跨 Agent 串联日志和事件
  parentStepId?: string                 // 父 Step ID，用于表达 A2A 调用树
  fromAgentId: string                   // 发起调用的 Agent ID
  toAgentId: string                     // 目标 Agent ID
  mode: A2ACallMode                     // 调用模式：同步、异步或流式
  input: unknown                        // 传递给目标 Agent 的输入载荷
  timeoutMs?: number                    // 本次 A2A 调用的超时时间（毫秒）
  idempotencyKey?: string               // 幂等键，用于避免重复创建相同子任务
  metadata?: Record<string, unknown>    // 扩展元数据，用于透传业务或观测信息
}

export type A2AResponse =
  | {
      mode: typeof A2A_CALL_MODES.SYNC                              // 同步调用响应
      status: typeof A2A_STATUSES.COMPLETED | typeof A2A_STATUSES.FAILED // 同步调用终态
      output?: unknown                                              // 目标 Agent 返回的输出
      error?: A2AError                                              // 调用失败时的错误信息
      latencyMs: number                                             // 调用耗时（毫秒）
      usage?: {                                                   // token 和成本用量统计
        inputTokens?: number                                        // 输入 token 数
        outputTokens?: number                                       // 输出 token 数
        estimatedCostUsd?: number                                   // 预估调用成本（美元）
      }
    }
  | {
      mode: typeof A2A_CALL_MODES.ASYNC     // 异步调用响应
      status: typeof A2A_STATUSES.ACCEPTED  // 异步任务已被接受
      taskId: string                        // 异步 AgentTask ID
      childRunId: string                    // 异步子 Run ID
      eventsUrl?: string                    // 异步事件订阅地址
    }
  | {
      mode: typeof A2A_CALL_MODES.STREAM     // 流式调用响应
      status: typeof A2A_STATUSES.STREAMING  // 流式任务正在输出
      streamId: string                       // 流式事件通道 ID
      childRunId: string                     // 流式子 Run ID
    }


export type A2AError = {
  code: string                       // 机器可识别错误码
  message: string                    // 面向开发者或用户的错误说明
  retryable?: boolean                // 是否允许调用方重试
  details?: Record<string, unknown>  // 附加错误上下文
}

export type A2APolicyRule = {
  fromAgentId: string          // 发起方 Agent ID
  toAgentId: string            // 被调用方 Agent ID
  allowed: boolean             // 是否允许该调用关系
  maxDepth: number             // 单次 Run 内允许的最大 A2A 调用深度
  maxCallsPerRun: number       // 单次 Run 内允许的最大调用次数
  timeoutMs: number            // 该调用关系的默认超时时间（毫秒）
  maxInputTokens?: number      // 允许传入的最大输入 token 数
  maxOutputTokens?: number     // 允许产出的最大输出 token 数
  requiresApproval?: boolean   // 是否需要人工审批后才能调用
}

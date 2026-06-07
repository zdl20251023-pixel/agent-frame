import { EVENT_TYPES } from '../constants/event-types.js'

// ============================================================
// AgentEvent：所有 Run 相关事件的联合类型
// 前后端共享，必须从 @agent-frame/shared 引用，不能各自定义
// ============================================================

export type AgentEvent =
  // ─── Run 生命周期事件 ─────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.RUN_STARTED // Run 开始事件类型
      runId: string                        // Run ID
      agentId?: string                     // 执行 Run 的 Agent ID
      timestamp: string                    // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.RUN_COMPLETED // Run 完成事件类型
      runId: string                          // Run ID
      agentId?: string                       // 执行 Run 的 Agent ID
      timestamp: string                      // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.RUN_FAILED // Run 失败事件类型
      runId: string                       // Run ID
      agentId?: string                    // 执行 Run 的 Agent ID
      reason?: string                     // 失败原因
      errorCode?: string                  // 失败错误码
      timestamp: string                   // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.RUN_CANCELLED // Run 取消事件类型
      runId: string                          // Run ID
      reason?: string                        // 取消原因
      timestamp: string                      // 事件时间（ISO 8601）
    }

  // ─── 消息流事件 ──────────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.MESSAGE_DELTA // 消息增量事件类型
      runId: string                          // Run ID
      agentId: string                        // 输出消息的 Agent ID
      delta: string                          // 本次增量文本
      timestamp: string                      // 事件时间（ISO 8601）
    }

  // ─── Tool 调用事件 ────────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.TOOL_CALL // Tool 调用开始事件类型
      runId: string                      // Run ID
      stepId?: string                    // 关联 Step ID
      toolInvocationId?: string          // 关联 ToolInvocation ID
      agentId: string                    // 发起工具调用的 Agent ID
      toolName: string                   // 工具名称
      input: unknown                     // 工具输入预览
      timestamp: string                  // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.TOOL_RESULT // Tool 调用结果事件类型
      runId: string                        // Run ID
      stepId?: string                      // 关联 Step ID
      toolInvocationId?: string            // 关联 ToolInvocation ID
      agentId: string                      // 发起工具调用的 Agent ID
      toolName: string                     // 工具名称
      output: unknown                      // 工具输出预览
      timestamp: string                    // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.TOOL_INVOCATION_UPDATED // ToolInvocation 更新事件类型
      runId: string                                    // Run ID
      sessionId?: string                               // 会话 ID
      toolInvocationId: string                         // ToolInvocation ID
      status: string                                   // 最新工具调用状态
      phase: string                                    // 最新工具执行阶段
      artifactRef?: string                             // 关联 Artifact ID
      taskRef?: string                                 // 关联 AgentTask ID
      timestamp: string                                // 事件时间（ISO 8601）
    }

  // ─── AgentTask 异步任务事件 ───────────────────────────────
  | {
      type: typeof EVENT_TYPES.AGENT_TASK_STARTED // AgentTask 开始事件类型
      runId: string                               // 父 Run ID
      sessionId?: string                          // 会话 ID
      taskId: string                              // AgentTask ID
      toAgentId: string                           // 目标 Agent ID
      retryCount?: number                         // 当前重试次数
      timestamp: string                           // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.AGENT_TASK_COMPLETED // AgentTask 完成事件类型
      runId: string                                 // 父 Run ID
      sessionId?: string                            // 会话 ID
      taskId: string                                // AgentTask ID
      toAgentId: string                             // 目标 Agent ID
      outputPreview?: string                        // 输出摘要
      timestamp: string                             // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.AGENT_TASK_FAILED // AgentTask 失败事件类型
      runId: string                              // 父 Run ID
      sessionId?: string                         // 会话 ID
      taskId: string                             // AgentTask ID
      toAgentId: string                          // 目标 Agent ID
      error: {                                  // 失败错误信息
        code: string                            // 错误码
        message: string                         // 错误说明
      }
      retryCount?: number                        // 当前重试次数
      timestamp: string                          // 事件时间（ISO 8601）
    }

  // ─── A2A 同步调用事件 ─────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_STARTED // A2A 调用开始事件类型
      runId: string                               // Run ID
      traceId: string                             // 链路追踪 ID
      stepId?: string                             // A2A 调用 Step ID
      parentStepId?: string                       // 父 Step ID
      fromAgentId: string                         // 发起调用的 Agent ID
      toAgentId: string                           // 目标 Agent ID
      inputPreview?: string                       // 输入摘要
      timestamp: string                           // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_COMPLETED // A2A 调用完成事件类型
      runId: string                                 // Run ID
      traceId: string                               // 链路追踪 ID
      stepId?: string                               // A2A 调用 Step ID
      fromAgentId: string                           // 发起调用的 Agent ID
      toAgentId: string                             // 目标 Agent ID
      outputPreview?: string                        // 输出摘要
      latencyMs: number                             // 调用耗时（毫秒）
      timestamp: string                             // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_FAILED // A2A 调用失败事件类型
      runId: string                              // Run ID
      traceId: string                            // 链路追踪 ID
      stepId?: string                            // A2A 调用 Step ID
      fromAgentId: string                        // 发起调用的 Agent ID
      toAgentId: string                          // 目标 Agent ID
      error: {                                  // 失败错误信息
        code: string                            // 错误码
        message: string                         // 错误说明
      }
      timestamp: string                          // 事件时间（ISO 8601）
    }

  // ─── A2A 异步事件（预留，MVP 不发出）────────────────────
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_QUEUED // A2A 异步调用入队事件类型
      runId: string                              // 父 Run ID
      childRunId: string                         // 子 Run ID
      taskId: string                             // AgentTask ID
      fromAgentId: string                        // 发起调用的 Agent ID
      toAgentId: string                          // 目标 Agent ID
      timestamp: string                          // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_PROGRESS // A2A 异步调用进度事件类型
      runId: string                                // 父 Run ID
      childRunId: string                           // 子 Run ID
      taskId: string                               // AgentTask ID
      progress?: number                            // 进度百分比或阶段进度
      message?: string                             // 进度说明
      timestamp: string                            // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_CANCELLED // A2A 异步调用取消事件类型
      runId: string                                 // 父 Run ID
      childRunId: string                            // 子 Run ID
      taskId: string                                // AgentTask ID
      reason?: string                               // 取消原因
      timestamp: string                             // 事件时间（ISO 8601）
    }

  // ─── Artifact 事件 ────────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.ARTIFACT_CREATED // Artifact 创建事件类型
      runId: string                             // 创建 Artifact 的 Run ID
      artifactId: string                        // Artifact ID
      artifactType: string                      // Artifact 类型
      title?: string                            // Artifact 标题
      timestamp: string                         // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.ARTIFACT_VERSION_CREATED // Artifact 版本创建事件类型
      runId: string                                     // 创建版本的 Run ID
      sessionId?: string                                // 会话 ID
      artifactId: string                                // Artifact ID
      versionId: string                                 // ArtifactVersion ID
      version: number                                   // 版本号
      diffSummary?: string                              // 相对上一版本的变更摘要
      timestamp: string                                 // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.ARTIFACT_REPAIR_COMPLETED // Artifact 修复完成事件类型
      runId: string                                      // 触发修复的 Run ID
      sessionId?: string                                 // 会话 ID
      artifactId: string                                 // Artifact ID
      versionId: string                                  // 修复后版本 ID
      version: number                                    // 修复后版本号
      success: boolean                                   // 修复是否成功
      diffSummary?: string                               // 修复变更摘要
      timestamp: string                                  // 事件时间（ISO 8601）
    }

  // ─── Workflow 事件 ────────────────────────────────────────
  | {
      type: // Workflow 生命周期事件类型
        | typeof EVENT_TYPES.WORKFLOW_STARTED
        | typeof EVENT_TYPES.WORKFLOW_COMPLETED
        | typeof EVENT_TYPES.WORKFLOW_CANCELLED
      runId: string              // 关联 Run ID
      workflowRunId?: string     // WorkflowRun ID
      workflowId?: string        // WorkflowDefinition ID
      timestamp: string          // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.WORKFLOW_FAILED // Workflow 失败事件类型
      runId: string                            // 关联 Run ID
      workflowRunId?: string                   // WorkflowRun ID
      workflowId?: string                      // WorkflowDefinition ID
      error?: {                                // 失败错误信息
        code: string                           // 错误码
        message: string                        // 错误说明
      }
      timestamp: string                        // 事件时间（ISO 8601）
    }
  | {
      type: // Workflow Stage 普通事件类型
        | typeof EVENT_TYPES.WORKFLOW_STAGE_STARTED
        | typeof EVENT_TYPES.WORKFLOW_STAGE_COMPLETED
        | typeof EVENT_TYPES.WORKFLOW_STAGE_SKIPPED
      runId: string      // 关联 Run ID
      stageId: string    // Stage ID
      stageName?: string // Stage 名称
      agentId?: string   // Stage 调用的 Agent ID
      timestamp: string  // 事件时间（ISO 8601）
    }
  | {
      type: typeof EVENT_TYPES.WORKFLOW_STAGE_FAILED // Workflow Stage 失败事件类型
      runId: string                                  // 关联 Run ID
      stageId: string                                // Stage ID
      stageName?: string                             // Stage 名称
      agentId?: string                               // Stage 调用的 Agent ID
      error?: {                                      // 失败错误信息
        code: string                                 // 错误码
        message: string                              // 错误说明
      }
      timestamp: string                              // 事件时间（ISO 8601）
    }
  | {
      type: // Workflow 人工节点事件类型
        | typeof EVENT_TYPES.WORKFLOW_HUMAN_GATE_WAITING
        | typeof EVENT_TYPES.WORKFLOW_HUMAN_GATE_APPROVED
        | typeof EVENT_TYPES.WORKFLOW_HUMAN_GATE_REJECTED
      runId: string      // 关联 Run ID
      stageId: string    // 人工节点 Stage ID
      stageName?: string // Stage 名称
      reason?: string    // 审批原因或拒绝原因
      timestamp: string  // 事件时间（ISO 8601）
    }

// 判断是否为终态事件（用于 SSE 关闭连接）
export function isTerminalEvent(event: AgentEvent): boolean {
  return (
    event.type === EVENT_TYPES.RUN_COMPLETED ||
    event.type === EVENT_TYPES.RUN_FAILED ||
    event.type === EVENT_TYPES.RUN_CANCELLED
  )
}

// 提取事件的 runId
export function getRunId(event: AgentEvent): string {
  return event.runId
}

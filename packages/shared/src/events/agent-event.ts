import { EVENT_TYPES } from '../constants/event-types.js'

// ============================================================
// AgentEvent：所有 Run 相关事件的联合类型
// 前后端共享，必须从 @agent-frame/shared 引用，不能各自定义
// ============================================================

export type AgentEvent =
  // ─── Run 生命周期事件 ─────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.RUN_STARTED
      runId: string
      agentId?: string
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.RUN_COMPLETED
      runId: string
      agentId?: string
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.RUN_FAILED
      runId: string
      agentId?: string
      reason?: string
      errorCode?: string
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.RUN_CANCELLED
      runId: string
      reason?: string
      timestamp: string
    }

  // ─── 消息流事件 ──────────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.MESSAGE_DELTA
      runId: string
      agentId: string
      delta: string
      timestamp: string
    }

  // ─── Tool 调用事件 ────────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.TOOL_CALL
      runId: string
      stepId?: string
      toolInvocationId?: string
      agentId: string
      toolName: string
      input: unknown
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.TOOL_RESULT
      runId: string
      stepId?: string
      toolInvocationId?: string
      agentId: string
      toolName: string
      output: unknown
      timestamp: string
    }

  // ─── A2A 同步调用事件 ─────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_STARTED
      runId: string
      traceId: string
      stepId?: string
      parentStepId?: string
      fromAgentId: string
      toAgentId: string
      inputPreview?: string
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_COMPLETED
      runId: string
      traceId: string
      stepId?: string
      fromAgentId: string
      toAgentId: string
      outputPreview?: string
      latencyMs: number
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_FAILED
      runId: string
      traceId: string
      stepId?: string
      fromAgentId: string
      toAgentId: string
      error: { code: string; message: string }
      timestamp: string
    }

  // ─── A2A 异步事件（预留，MVP 不发出）────────────────────
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_QUEUED
      runId: string
      childRunId: string
      taskId: string
      fromAgentId: string
      toAgentId: string
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_PROGRESS
      runId: string
      childRunId: string
      taskId: string
      progress?: number
      message?: string
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.AGENT_CALL_CANCELLED
      runId: string
      childRunId: string
      taskId: string
      reason?: string
      timestamp: string
    }

  // ─── Artifact 事件 ────────────────────────────────────────
  | {
      type: typeof EVENT_TYPES.ARTIFACT_CREATED
      runId: string
      artifactId: string
      artifactType: string
      title?: string
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.ARTIFACT_VERSION_CREATED
      runId: string
      artifactId: string
      versionId: string
      version: number
      timestamp: string
    }

  // ─── Workflow 事件 ────────────────────────────────────────
  | {
      type:
        | typeof EVENT_TYPES.WORKFLOW_STARTED
        | typeof EVENT_TYPES.WORKFLOW_COMPLETED
        | typeof EVENT_TYPES.WORKFLOW_CANCELLED
      runId: string
      workflowRunId?: string
      workflowId?: string
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.WORKFLOW_FAILED
      runId: string
      workflowRunId?: string
      workflowId?: string
      error?: { code: string; message: string }
      timestamp: string
    }
  | {
      type:
        | typeof EVENT_TYPES.WORKFLOW_STAGE_STARTED
        | typeof EVENT_TYPES.WORKFLOW_STAGE_COMPLETED
        | typeof EVENT_TYPES.WORKFLOW_STAGE_SKIPPED
      runId: string
      stageId: string
      stageName?: string
      agentId?: string
      timestamp: string
    }
  | {
      type: typeof EVENT_TYPES.WORKFLOW_STAGE_FAILED
      runId: string
      stageId: string
      stageName?: string
      agentId?: string
      error?: { code: string; message: string }
      timestamp: string
    }
  | {
      type:
        | typeof EVENT_TYPES.WORKFLOW_HUMAN_GATE_WAITING
        | typeof EVENT_TYPES.WORKFLOW_HUMAN_GATE_APPROVED
        | typeof EVENT_TYPES.WORKFLOW_HUMAN_GATE_REJECTED
      runId: string
      stageId: string
      stageName?: string
      reason?: string
      timestamp: string
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

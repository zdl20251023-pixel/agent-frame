// ============================================================
// AgentEvent：所有 Run 相关事件的联合类型
// 前后端共享，必须从 @agent-frame/shared 引用，不能各自定义
// ============================================================

export type AgentEvent =
  // ─── Run 生命周期事件 ─────────────────────────────────────
  | {
      type: 'run.started'
      runId: string
      agentId?: string
      timestamp: string
    }
  | {
      type: 'run.completed'
      runId: string
      agentId?: string
      timestamp: string
    }
  | {
      type: 'run.failed'
      runId: string
      agentId?: string
      reason?: string
      errorCode?: string
      timestamp: string
    }
  | {
      type: 'run.cancelled'
      runId: string
      reason?: string
      timestamp: string
    }

  // ─── 消息流事件 ──────────────────────────────────────────
  | {
      type: 'message.delta'
      runId: string
      agentId: string
      delta: string
      timestamp: string
    }

  // ─── Tool 调用事件 ────────────────────────────────────────
  | {
      type: 'tool.call'
      runId: string
      stepId?: string
      agentId: string
      toolName: string
      input: unknown
      timestamp: string
    }
  | {
      type: 'tool.result'
      runId: string
      stepId?: string
      agentId: string
      toolName: string
      output: unknown
      timestamp: string
    }

  // ─── A2A 同步调用事件 ─────────────────────────────────────
  | {
      type: 'agent.call.started'
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
      type: 'agent.call.completed'
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
      type: 'agent.call.failed'
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
      type: 'agent.call.queued'
      runId: string
      childRunId: string
      taskId: string
      fromAgentId: string
      toAgentId: string
      timestamp: string
    }
  | {
      type: 'agent.call.progress'
      runId: string
      childRunId: string
      taskId: string
      progress?: number
      message?: string
      timestamp: string
    }
  | {
      type: 'agent.call.cancelled'
      runId: string
      childRunId: string
      taskId: string
      reason?: string
      timestamp: string
    }

  // ─── Artifact 事件 ────────────────────────────────────────
  | {
      type: 'artifact.created'
      runId: string
      artifactId: string
      artifactType: string
      title?: string
      timestamp: string
    }
  | {
      type: 'artifact.version.created'
      runId: string
      artifactId: string
      versionId: string
      version: number
      timestamp: string
    }

// 判断是否为终态事件（用于 SSE 关闭连接）
export function isTerminalEvent(event: AgentEvent): boolean {
  return (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  )
}

// 提取事件的 runId
export function getRunId(event: AgentEvent): string {
  return event.runId
}

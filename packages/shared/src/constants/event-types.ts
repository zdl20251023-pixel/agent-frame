// ============================================================
// 所有事件 type 字面量常量
// 避免前后端各自硬编码字符串
// ============================================================

export const EVENT_TYPES = {
  // Run
  RUN_STARTED: 'run.started',      // Run 已创建并开始执行
  RUN_COMPLETED: 'run.completed',  // Run 成功完成
  RUN_FAILED: 'run.failed',        // Run 执行失败
  RUN_CANCELLED: 'run.cancelled',  // Run 被取消

  // Message
  MESSAGE_DELTA: 'message.delta',  // 模型或 Agent 的增量文本输出

  // Tool
  TOOL_CALL: 'tool.call',                              // Tool 调用开始
  TOOL_RESULT: 'tool.result',                          // Tool 调用返回结果
  TOOL_INVOCATION_UPDATED: 'tool.invocation.updated',  // ToolInvocation 状态或阶段更新

  // AgentTask（异步任务）
  AGENT_TASK_STARTED: 'agent.task.started',      // 异步 AgentTask 开始执行
  AGENT_TASK_COMPLETED: 'agent.task.completed',  // 异步 AgentTask 成功完成
  AGENT_TASK_FAILED: 'agent.task.failed',        // 异步 AgentTask 执行失败

  // Artifact 扩展
  ARTIFACT_REPAIR_COMPLETED: 'artifact.repair.completed',  // Artifact 后台修复完成

  // A2A
  AGENT_CALL_STARTED: 'agent.call.started',        // A2A 调用开始
  AGENT_CALL_COMPLETED: 'agent.call.completed',    // A2A 调用完成
  AGENT_CALL_FAILED: 'agent.call.failed',          // A2A 调用失败
  AGENT_CALL_QUEUED: 'agent.call.queued',          // A2A 异步调用已入队
  AGENT_CALL_PROGRESS: 'agent.call.progress',      // A2A 异步调用进度更新
  AGENT_CALL_CANCELLED: 'agent.call.cancelled',    // A2A 调用被取消

  // Artifact
  ARTIFACT_CREATED: 'artifact.created',                  // Artifact 首次创建
  ARTIFACT_VERSION_CREATED: 'artifact.version.created',  // Artifact 新版本创建

  // Workflow
  WORKFLOW_STARTED: 'workflow.started',                          // WorkflowRun 开始
  WORKFLOW_COMPLETED: 'workflow.completed',                      // WorkflowRun 成功完成
  WORKFLOW_FAILED: 'workflow.failed',                            // WorkflowRun 执行失败
  WORKFLOW_CANCELLED: 'workflow.cancelled',                      // WorkflowRun 被取消
  WORKFLOW_STAGE_STARTED: 'workflow.stage.started',              // Workflow 阶段开始
  WORKFLOW_STAGE_COMPLETED: 'workflow.stage.completed',          // Workflow 阶段完成
  WORKFLOW_STAGE_FAILED: 'workflow.stage.failed',                // Workflow 阶段失败
  WORKFLOW_STAGE_SKIPPED: 'workflow.stage.skipped',              // Workflow 阶段被跳过
  WORKFLOW_HUMAN_GATE_WAITING: 'workflow.human_gate.waiting',    // Workflow 等待人工审批
  WORKFLOW_HUMAN_GATE_APPROVED: 'workflow.human_gate.approved',  // 人工审批通过
  WORKFLOW_HUMAN_GATE_REJECTED: 'workflow.human_gate.rejected',  // 人工审批拒绝
} as const

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES]

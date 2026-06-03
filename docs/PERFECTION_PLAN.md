# Agent Frame 功能完善计划

> 本文档基于 [FRAMEWORK_DESIGN.md](./FRAMEWORK_DESIGN.md) 设计目标与当前 MVP 实现，梳理后续所有待完善功能，并给出分阶段优先级排序。
>
> 更新日期：2026-06-03  
> 当前阶段：**阶段 6 生产化与规模化（已完成）**

---

## 📋 任务进度总览

> 快速查看所有待办项的完成状态。详细实现说明见后续各章节。
>
> **图例**：✅ 已完成 │ 🚧 进行中 │ ❌ 未开始

### 阶段 1 — A2A MVP 扫尾（P0 / P1）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 1.1 | Token Usage 正确落库（inputTokens / outputTokens）| P0 | ✅ | 2026-06-03 |
| 1.2 | `artifact_versions.created_by_step_id` 赋值 | P0 | ✅ | 2026-06-03 |
| 1.3 | `a2a/a2a-events.ts` 事件构造函数独立 | P1 | ✅ | 2026-06-03 |
| 1.4 | `AppErrorCode` 迁移到 `packages/shared` 前后端共享 | P1 | ✅ | 2026-06-03 |
| 1.5 | `features/agents/agents.service.ts` 动态 Agent 查询服务 | P1 | ✅ | 2026-06-03 |
| 1.6 | `features/artifacts/artifacts.service.ts` Service 层补全 | P1 | ✅ | 2026-06-03 |

### 阶段 2 — Artifact 完善 + Workflow 轻量 MVP（P2）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 2.1 | `artifacts/artifact-version.ts` 版本管理独立模块 | P2 | ✅ | 2026-06-03 |
| 2.2 | `artifacts/artifact-policy.ts` 产物访问权限策略 | P2 | ✅ | 2026-06-03 |
| 2.3 | 前端 `features/artifacts/` 产物预览页面 | P2 | ✅ | 2026-06-03 |
| 2.4 | `workflow/workflow-definition.ts` 类型定义 | P2 | ✅ | 2026-06-03 |
| 2.5 | `workflow/workflow-runner.ts` 轻量 Runner | P2 | ✅ | 2026-06-03 |
| 2.6 | `workflow/stage-executor.ts` 单阶段执行 | P2 | ✅ | 2026-06-03 |
| 2.7 | `workflow/workflow-store.ts` 状态存储（内存 MVP） | P2 | ✅ | 2026-06-03 |
| 2.8 | `workflow/retry-policy.ts` 阶段重试策略 | P2 | ✅ | 2026-06-03 |
| 2.9 | `workflow/human-gate.ts` 人工节点接口预留 | P2 | ✅ | 2026-06-03 |
| 2.10 | `packages/shared` Workflow 事件类型常量 | P2 | ✅ | 2026-06-03 |
| 2.11 | Workflow API（`GET /workflows`、`POST /workflows/:id/runs`）| P2 | ✅ | 2026-06-03 |
| 2.12 | `a2a/remote-agent-adapter.ts` 远程 Agent HTTP 适配器 | P2 | ✅ | 2026-06-03 |

### 阶段 3 — Project + Memory + Session 完善（P2）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 3.1 | `features/projects/` Project CRUD API | P2 | ✅ | 2026-06-03 |
| 3.2 | `shared/db/schema.ts` 新增 `projects` 表 | P2 | ✅ | 2026-06-03 |
| 3.3 | `packages/shared/models/project.ts` 共享类型 | P2 | ✅ | 2026-06-03 |
| 3.4 | `memory/memory-store.mysql.ts` MySQL 持久化 | P2 | ✅ | 2026-06-03 |
| 3.5 | `memory/memory-retriever.ts` 记忆召回 | P2 | ✅ | 2026-06-03 |
| 3.6 | `memory/memory-policy.ts` 记忆写入策略 | P3 | ✅ | 2026-06-03 |
| 3.7 | `features/sessions/` 完整消息归档 + Run 归属查询 | P2 | ✅ | 2026-06-03 |

### 阶段 4 — 可观测性、安全与生产化（P2 / P3）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 4.1 | `shared/observability/tracing.ts` traceId 贯穿链路追踪 | P2 | ✅ | 2026-06-03 |
| 4.2 | `features/usage/` Token / 成本统计 API | P2 | ✅ | 2026-06-03 |
| 4.3 | `features/auth/` 完整 JWT 认证 | P2 | ✅ | 2026-06-03 |
| 4.4 | `shared/middlewares/rate-limit.middleware.ts` 请求限流 | P3 | ✅ | 2026-06-03 |
| 4.5 | `shared/realtime/ws.hub.ts` WebSocket 多 Run 订阅 | P2 | ✅ | 2026-06-03 |
| 4.6 | `shared/observability/metrics.ts` 指标采集 | P3 | ✅ | 2026-06-03 |

### 阶段 5 — Plugin 扩展（P3）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 5.1 | `plugins/plugin-context.ts` 完整 PluginContext 实现 | P3 | ✅ | 2026-06-03 |
| 5.2 | `plugins/builtin-plugins.ts` 内置 Agent 插件注册 | P3 | ✅ | 2026-06-03 |
| 5.3 | 前端 `features/agents/` Agent 列表与能力展示页 | P1 | ✅ | 2026-06-03 |
| 5.4 | 前端 `features/workflows/` Workflow 进度展示页 | P3 | ✅ | 2026-06-03 |

### 阶段 6 — 生产化与规模化（P3）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 6.1 | Redis EventBus（替换内存 EventBus，支持多实例）| P3 | ✅ | 2026-06-03 |
| 6.2 | A2A 异步模式 `startAsync()` + Worker | P3 | ✅ | 2026-06-03 |
| 6.3 | `runtime/scheduler.ts` 并发控制 + 优先级队列 | P3 | ✅ | 2026-06-03 |
| 6.4 | E2E 测试 + GitHub Actions CI/CD | P3 | ✅ | 2026-06-03 |
| 6.5 | Docker 部署支持 | P3 | ✅ | 2026-06-03 |

---

## 一、当前 MVP 实现状态


### 1.1 已完成模块 ✅

| 模块 | 实现状态 | 说明 |
|---|---|---|
| `runtime/run-manager.ts` | ✅ 完成 | Run 生命周期、状态流转、取消 |
| `runtime/step-manager.ts` | ✅ 完成 | Step 记录 |
| `runtime/event-emitter.ts` | ✅ 完成 | AgentEvent 发布，内存 EventBus |
| `runtime/cancellation.ts` | ✅ 完成 | AbortController 取消信号 |
| `runtime/stores/run-store.ts` | ✅ 完成 | RunStore 接口定义 |
| `runtime/stores/memory-run-store.ts` | ✅ 完成 | 内存实现 |
| `runtime/stores/mysql-run-store.ts` | ✅ 完成 | MySQL 持久化实现 |
| `a2a/a2a-client.ts` | ✅ 完成 | sync 同步调用 |
| `a2a/a2a-policy.ts` | ✅ 完成 | 白名单、最大深度、超时、调用次数 |
| `a2a/a2a-router.ts` | ✅ 完成 | 本地 Agent 路由 |
| `a2a/local-agent-adapter.ts` | ✅ 完成 | 本地 Agent 适配 |
| `ai/model-client/` | ✅ 完成 | ModelClient 接口 + VercelAIModelClient 实现 |
| `ai/agents/supervisor.agent.ts` | ✅ 完成 | 调度 Agent |
| `ai/agents/research.agent.ts` | ✅ 完成 | 研究专业 Agent |
| `ai/agents/summary.agent.ts` | ✅ 完成 | 总结专业 Agent |
| `ai/providers.ts` | ✅ 完成 | AI Provider 初始化 |
| `ai/models.ts` | ✅ 完成 | 模型别名、成本配置 |
| `artifacts/artifact-store.ts` | ✅ 完成 | ArtifactStore 接口 |
| `artifacts/artifact-store.memory.ts` | ✅ 完成 | 内存实现 |
| `artifacts/artifact-store.mysql.ts` | ✅ 完成 | MySQL 实现 |
| `artifacts/artifact-events.ts` | ✅ 完成 | artifact.created / version.created 事件 |
| `memory/memory.types.ts` | ✅ 完成 | MemoryItem 类型定义 |
| `memory/memory-store.memory.ts` | ✅ 完成 | 内存实现 |
| `plugins/plugin.types.ts` | ✅ 完成 | AgentPlugin、PluginContext 类型 |
| `plugins/plugin-registry.ts` | ✅ 完成 | 插件注册机制 |
| `features/runs/` | ✅ 完成 | Run CRUD API + SSE 事件订阅 |
| `features/artifacts/` | ✅ 部分完成 | 基础查询 Route（缺 Service 层） |
| `features/sessions/` | ✅ 部分完成 | 目录存在，功能待完善 |
| `features/auth/` | ✅ 部分完成 | 目录存在，mock 认证 |
| `shared/db/` | ✅ 完成 | MySQL 客户端、schema、migrations |
| `shared/realtime/event-bus.ts` | ✅ 完成 | 内存 EventBus |
| `shared/realtime/sse.handler.ts` | ✅ 完成 | SSE 推送封装 |
| `shared/errors/app-error.ts` | ✅ 完成 | 统一错误类 |
| `shared/observability/logger.ts` | ✅ 完成 | 结构化日志基础 |
| `packages/shared/constants/` | ✅ 完成 | 事件类型、Run/Step 状态、A2A 状态、Artifact 类型等常量 |
| Web `RunTimeline` | ✅ 完成 | 前端实时事件展示 |

### 1.2 缺失或待完善模块 ❌

| 模块 | 缺失内容 | 优先级 |
|---|---|---|
| `a2a/a2a-protocol.ts` | A2A 协议类型单独文件，当前散落在 client 内 | P1 |
| `a2a/a2a-events.ts` | A2A 事件构造函数和类型单独文件 | P1 |
| `a2a/remote-agent-adapter.ts` | 远程 Agent 适配器（HTTP）| P2 |
| `artifacts/artifact-policy.ts` | 产物访问权限、可见性策略 | P2 |
| `artifacts/artifact-version.ts` | 版本创建/查询/回滚独立模块 | P2 |
| `memory/memory-store.mysql.ts` | MySQL 持久化记忆存储 | P2 |
| `memory/memory-retriever.ts` | 记忆召回（按 scope/kind 检索）| P2 |
| `memory/memory-policy.ts` | 记忆写入策略 | P3 |
| `workflow/` | 工作流全套（定义、Runner、StageExecutor）| P2 |
| `features/agents/` | Agent 列表、能力查询 API | P1 |
| `features/artifacts/` | artifacts.service.ts 应用服务层 | P1 |
| `features/projects/` | Project CRUD API | P2 |
| `features/usage/` | Token / 成本统计 API | P2 |
| `shared/realtime/ws.hub.ts` | WebSocket 多 Run 订阅 | P2 |
| `shared/observability/tracing.ts` | 链路追踪（traceId 贯穿）| P2 |
| `shared/observability/metrics.ts` | 指标采集 | P3 |
| `shared/errors/error-codes.ts` | 独立错误码常量文件 | P1 |
| `packages/shared/` Workflow 类型 | WorkflowDefinition、WorkflowStage 类型 | P2 |
| Web `features/agents` | Agent 列表、能力展示页面 | P1 |
| Web `features/artifacts` | Artifact 产物预览页面 | P2 |
| Web `features/projects` | 项目管理页面 | P3 |
| Token Usage 统计落库 | `inputTokens`/`outputTokens` 当前为 0 | P1 |
| `artifact_versions.created_by_step_id` | 版本创建 stepId 未赋值 | P1 |

---

## 二、功能完善路线图

### 阶段 1（当前）：A2A MVP 扫尾 — **P1 优先完成**

> 目标：让 A2A 核心链路完整、事件可追踪、关键数据正确落库。

#### 1.1 Token Usage 统计修复

**问题**：当前 `model_calls` 表中 `input_tokens` / `output_tokens` 始终为 0；`artifact_versions` 表中 `created_by_step_id` 未赋值。

**任务**：
- [x] `ai/model-client/vercel-ai-model-client.ts`：修复 `stream()` finish part 中 usage 解析顺序（`usage ?? totalUsage`），修复 `model.failed` 事件类型使用常量
- [x] `ai/agents/research.agent.ts`：Artifact 写入时改用 `modelStep.id` 而非外部 `stepId`
- [x] `ai/agents/summary.agent.ts`：同上，Artifact 写入时改用 `modelStep.id`

#### 1.2 A2A 协议文件独立

**问题**：`A2ARequest`、`A2AResponse`、`A2ACallMode` 类型已在 `packages/shared/src/a2a/a2a-protocol.ts` 中定义，但事件构造逻辑散落在 `a2a-client.ts` 内部。

**任务**：
- [x] 新建 `apps/api/src/a2a/a2a-events.ts`：抽离 A2A 事件构造函数（`buildA2AStartedEvent`、`buildA2ACompletedEvent`、`buildA2AFailedEvent`）
- [x] 更新 `a2a-client.ts` 使用事件构造函数，移除内联事件对象拼接

#### 1.3 错误码常量独立

**问题**：`AppErrorCode` 类型定义在 `app-error.ts` 中，未单独成文件，不方便前端引用。

**任务**：
- [x] 新建 `packages/shared/src/constants/error-codes.ts`：独立 `AppErrorCode` 类型 + `ERROR_HTTP_STATUS` 映射
- [x] 更新 `packages/shared/src/constants/index.ts` 导出
- [x] 更新 `apps/api/src/shared/errors/app-error.ts`：从 `@agent-frame/shared` 导入，消除重复定义

#### 1.4 Agents API

**问题**：`features/agents/agents.route.ts` 原先硬编码静态 Agent 列表，缺少 Service 层，无法感知动态注册。

**任务**：
- [x] 新建 `features/agents/agents.service.ts`：`AgentsService` 结合静态元数据 + `A2ARouter` 动态注册状态
- [x] 更新 `features/agents/agents.route.ts`：通过 `container.agentsService` 查询，添加参数校验
- [x] 更新 `container.ts`：注入 `agentsService` 实例

#### 1.5 Artifacts Service 层

**问题**：`features/artifacts/artifacts.route.ts` 直接调用 `container.artifactStore`，违反分层原则。

**任务**：
- [x] 新建 `features/artifacts/artifacts.service.ts`：`ArtifactsService` 封装产物查询（含 Not Found 转 AppError）
- [x] 更新 `artifacts.route.ts`：通过 `container.artifactsService` 查询，移除直接 Store 访问
- [x] 更新 `container.ts`：注入 `artifactsService` 实例

---

### 阶段 2：Artifact 完善 + Workflow 轻量 MVP

> 目标：让产物管理完整，支持版本追踪；引入轻量工作流框架。

#### 2.1 Artifact 版本管理增强

- [ ] 新建 `artifacts/artifact-version.ts`：独立封装版本创建、查询、回滚逻辑
- [ ] 新建 `artifacts/artifact-policy.ts`：产物访问可见性策略（公开/私有/项目内）
- [ ] 前端 `features/artifacts/` 产物预览：展示产物内容、版本历史、关联 Run
- [ ] API `GET /artifacts/:artifactId/versions/:versionId` 完整实现

#### 2.2 Workflow 轻量 MVP

**设计参考**：`FRAMEWORK_DESIGN.md §10 workflow/`

- [ ] 新建 `apps/api/src/workflow/workflow-definition.ts`：`WorkflowDefinition`、`WorkflowStage` 类型
- [ ] 新建 `apps/api/src/workflow/workflow-runner.ts`：按 Stage 顺序执行，发布 `workflow.stage.*` 事件
- [ ] 新建 `apps/api/src/workflow/stage-executor.ts`：单 Stage 执行，内部通过 A2AClient 调用 Agent
- [ ] 新建 `apps/api/src/workflow/workflow-store.ts`：WorkflowRun 状态存储（MVP 内存）
- [ ] 新建 `apps/api/src/workflow/retry-policy.ts`：Stage 重试策略（最大次数 + 退避）
- [ ] 新建 `apps/api/src/workflow/human-gate.ts`：人工节点接口预留（`status: 'waiting_human'`）
- [ ] `packages/shared/src/workflow/`：WorkflowDefinition / WorkflowStage / WorkflowEvent 共享类型
- [ ] `packages/shared/src/constants/`：新增 `WORKFLOW_STATUSES`、`WORKFLOW_EVENT_TYPES` 常量
- [ ] `features/` 新增 Workflow API：`GET /workflows`、`POST /workflows/:workflowId/runs`

#### 2.3 远程 Agent 适配器

- [ ] 新建 `a2a/remote-agent-adapter.ts`：通过 HTTP 调用远程 Agent（MVP 可只定义接口，不实现）
- [ ] `a2a-router.ts` 支持根据 Agent 配置决定走本地适配器还是远程适配器

---

### 阶段 3：Project + Memory + Session 完善

> 目标：支持长期项目上下文、多 Run 归属、记忆召回。

#### 3.1 Project 管理

- [ ] 新建 `features/projects/projects.route.ts`：`POST /projects`、`GET /projects`、`GET /projects/:projectId`、`GET /projects/:projectId/runs`、`GET /projects/:projectId/artifacts`
- [ ] 新建 `features/projects/projects.service.ts`：项目 CRUD 应用服务
- [ ] `shared/db/schema.ts`：新增 `projects` 表
- [ ] `packages/shared/src/models/`：`Project` 类型共享
- [ ] `runId` 关联 `projectId`：Run、Artifact 均可归属到 Project
- [ ] 前端 `features/projects/` 项目列表页（MVP 可简单展示）

#### 3.2 Memory 完善

- [ ] 新建 `memory/memory-store.mysql.ts`：记忆 MySQL 持久化（复用 `shared/db`）
- [ ] 新建 `memory/memory-retriever.ts`：按 `scope` + `scopeId` + `kind` 召回记忆
- [ ] 新建 `memory/memory-policy.ts`：控制哪些记忆可写入（来源过滤、长度限制、人审标记）
- [ ] `packages/shared/src/memory/`：`MemoryItem`、`MemoryScope` 共享类型
- [ ] Agent 执行后可选写入候选记忆（不自动写入，走 MemoryPolicy）
- [ ] `features/memory/`（后置）：记忆查询、召回历史 API

#### 3.3 Session 完善

- [ ] `features/sessions/`：完整实现消息归档、Run 归属查询
- [ ] `shared/db/schema.ts`：完善 `sessions`、`messages` 表结构
- [ ] 前端 `features/sessions/`：历史对话列表（可后置）

---

### 阶段 4：可观测性、安全与生产化

> 目标：完整 Trace、Usage 统计、限流、认证、成本监控。

#### 4.1 链路追踪

- [ ] 新建 `shared/observability/tracing.ts`：`traceId` 贯穿 HTTP 请求 → Run → Step → ModelCall → A2A 调用 → 事件
- [ ] 所有日志携带 `{traceId, runId, stepId, agentId}` 结构化上下文
- [ ] 可选接入 OpenTelemetry（后置）

#### 4.2 Token / 成本统计 Usage

- [ ] 新建 `features/usage/usage.route.ts`：`GET /usage?runId=&agentId=&dateRange=`
- [ ] 新建 `features/usage/usage.service.ts`：聚合 `model_calls` 表数据
- [ ] `shared/db/schema.ts`：`model_calls` 表完善 `cost_usd`、`finish_reason` 字段
- [ ] 前端统计面板（可后置）

#### 4.3 认证与权限

- [ ] `features/auth/`：完整 JWT 认证（或 API Key 模式）
- [ ] `shared/middlewares/auth.middleware.ts`：注入 `userId`、`roles`
- [ ] `a2a-policy.ts`：策略支持 `userId` 维度控制
- [ ] 后续接多租户（`tenantId`）时，通过 Policy 扩展

#### 4.4 限流与安全

- [ ] `shared/middlewares/rate-limit.middleware.ts`：按用户/IP 限制高成本 Agent 请求
- [ ] `a2a-policy.ts`：`costBudget` 预算检查实际生效（当前仅接口预留）

#### 4.5 WebSocket 多 Run 订阅

- [ ] 新建 `shared/realtime/ws.hub.ts`：WebSocket 连接管理、多 Run 房间订阅
- [ ] `event-bus.ts` 支持广播到 WebSocket（当前仅 SSE）
- [ ] 前端 SSE 升级为 WebSocket（可渐进式）

---

### 阶段 5：Plugin 扩展 + 业务模板

> 目标：第一个业务插件落地，验证插件注册机制。

#### 5.1 Plugin 机制完善

- [ ] `plugins/plugin-context.ts`：实现完整 `PluginContext`（`registerAgent`、`registerTool`、`registerWorkflow`、`registerArtifactType`）
- [ ] `plugins/builtin-plugins.ts`：内置基础 Agent 插件注册示例
- [ ] `container.ts`：在启动时统一调用 `PluginRegistry.loadAll()`

#### 5.2 第一个业务模板插件（可选）

以内容创作为例（仅框架层，不做具体业务）：

- [ ] 新建 `apps/api/src/plugins/creative-writing/creative-writing.plugin.ts`：
  - 注册 `outline-agent`、`writing-agent`、`review-agent`
  - 注册 `creative-outline-workflow`（Idea → Outline → Review → Export）
  - 注册 `outline`、`script`、`review-report` 等 ArtifactType

#### 5.3 Workflow 可视化前端

- [ ] 前端 `features/workflows/`：Workflow 列表、当前 Stage 进度展示（MVP 简单文字展示即可）
- [ ] 前端 `WorkflowTimeline` 组件：展示 `workflow.stage.*` 事件

---

### 阶段 6：生产化与规模化

> 目标：稳定上线、多实例、长任务支持。

#### 6.1 Redis 事件广播

- [ ] `shared/realtime/event-bus.ts`：支持 Redis Pub/Sub 模式（多实例部署时替换内存 EventBus）
- [ ] 环境变量 `REDIS_URL` 注入后自动切换

#### 6.2 A2A 异步模式

- [ ] `a2a/a2a-client.ts`：`startAsync()` 方法实现（当前只有 `callSync`）
- [ ] 新建异步 Worker（可独立进程或 BullMQ）
- [ ] `packages/shared/src/constants/`：新增 `A2A_ASYNC_STATUSES`（queued / running / completed / failed）
- [ ] 前端通过 `childRunId` 订阅子任务进度

#### 6.3 长任务与 Scheduler

- [ ] `runtime/scheduler.ts`：当前仅接口，实现并发控制、优先级队列
- [ ] 对接 Temporal（长任务和强恢复需求时引入，当前不做）

#### 6.4 E2E 测试与 CI/CD

- [ ] `tests/e2e/`：补充端到端测试（chat 流程、A2A 调用、Artifact 生成）
- [ ] GitHub Actions CI：自动运行 `bun test`、类型检查、lint
- [ ] Docker 部署支持

---

## 三、各模块完善优先级汇总

| 优先级 | 模块/功能 | 所属阶段 |
|---|---|---|
| 🔴 P0（立即修） | Token Usage 数据正确落库 | 阶段 1 |
| 🔴 P0（立即修） | `artifact_versions.created_by_step_id` 赋值 | 阶段 1 |
| 🟠 P1 | A2A 协议/事件文件独立 | 阶段 1 |
| 🟠 P1 | 错误码常量独立 + 共享 | 阶段 1 |
| 🟠 P1 | Agents 列表/能力 API | 阶段 1 |
| 🟠 P1 | Artifacts Service 层补全 | 阶段 1 |
| 🟡 P2 | Workflow 轻量 MVP | 阶段 2 |
| 🟡 P2 | Artifact 版本管理增强 | 阶段 2 |
| 🟡 P2 | Remote Agent Adapter | 阶段 2 |
| 🟡 P2 | Project 管理 | 阶段 3 |
| 🟡 P2 | Memory MySQL + 召回 | 阶段 3 |
| 🟡 P2 | Session 完善 | 阶段 3 |
| 🟡 P2 | 链路追踪（traceId 贯穿）| 阶段 4 |
| 🟡 P2 | Usage 统计 API | 阶段 4 |
| 🟡 P2 | JWT 认证 | 阶段 4 |
| 🟡 P2 | WebSocket 多 Run 订阅 | 阶段 4 |
| 🟢 P3 | Plugin 机制完善 + 业务模板 | 阶段 5 |
| 🟢 P3 | Redis EventBus | 阶段 6 |
| 🟢 P3 | A2A 异步模式 | 阶段 6 |
| 🟢 P3 | 限流/预算实际生效 | 阶段 4 |
| 🟢 P3 | E2E 测试 + CI/CD | 阶段 6 |
| 🟢 P3 | OpenTelemetry | 阶段 4 |

---

## 四、前端功能完善计划

| 功能 | 当前状态 | 目标状态 | 优先级 |
|---|---|---|---|
| `RunTimeline` 事件展示 | ✅ 基本完成 | 增加 `workflow.*`、`artifact.*` 事件卡片 | P2 |
| Agent 列表页 | ❌ 缺失 | 展示注册 Agent 列表、能力描述 | P1 |
| Artifact 预览页 | ❌ 缺失 | 产物内容、版本历史、关联 Run | P2 |
| Project 列表页 | ❌ 缺失 | 项目创建、Run 归属查询 | P3 |
| Usage 统计面板 | ❌ 缺失 | Token / 成本图表 | P3 |
| Session 历史 | ❌ 缺失 | 历史对话归档 | P3 |
| Workflow 进度页 | ❌ 缺失 | 当前阶段、阶段产物展示 | P2 |

---

## 五、数据库 Schema 待补充

| 表 | 当前状态 | 待完善 |
|---|---|---|
| `runs` | ✅ 完成 | 补充 `project_id` 字段 |
| `steps` | ✅ 完成 | — |
| `run_events` | ✅ 完成 | — |
| `model_calls` | ✅ 完成 | 确保 `input_tokens`/`output_tokens`/`cost_usd` 正确写入 |
| `artifacts` | ✅ 完成 | 补充 `project_id` 字段 |
| `artifact_versions` | ✅ 完成 | 确保 `created_by_step_id` 正确写入 |
| `projects` | ❌ 缺失 | 新建 `projects` 表 |
| `sessions` | ❌ 未完善 | 完善 `sessions`、`messages` 表结构 |
| `memories` | ❌ 缺失 | 新建 `memories` 表（scope、scopeId、kind、content、metadata）|
| `workflow_runs` | ❌ 缺失 | 新建 `workflow_runs`、`workflow_stage_runs` 表 |
| `usage` | ❌ 缺失（依赖 model_calls）| 视图或聚合表，按 Run/Agent/User 统计 token 和成本 |

---

## 六、packages/shared 待完善

| 模块 | 当前状态 | 待完善 |
|---|---|---|
| `constants/event-types.ts` | ✅ 完成 | 补充 `workflow.*` 事件类型常量 |
| `constants/run-constants.ts` | ✅ 完成 | — |
| `constants/a2a-constants.ts` | ✅ 完成 | 补充 `A2A_ASYNC_STATUSES` |
| `constants/artifact-constants.ts` | ✅ 完成 | — |
| `constants/memory-constants.ts` | ✅ 完成 | — |
| `constants/error-codes.ts` | ❌ 缺失 | 新建，前后端共享 `AppErrorCode` |
| `a2a/a2a-request.ts` | ❌ 缺失 | 迁移 `A2ARequest`/`A2AResponse` 到共享包 |
| `workflow/workflow-definition.ts` | ❌ 缺失 | 新建 WorkflowDefinition / WorkflowStage 共享类型 |
| `models/project.ts` | ❌ 缺失 | 新建 Project 共享类型 |
| `models/memory.ts` | ❌ 缺失（已在 API 内）| 迁移到共享包 |

---

## 七、设计约束与开发原则（执行期间须遵守）

1. **禁止魔法字符串**：所有事件类型、状态值必须使用 `packages/shared/src/constants/` 中定义的常量，不得内联字符串。
2. **ModelClient 隔离**：Vercel AI SDK 只出现在 `apps/api/src/ai/` 内，不扩散到 runtime / a2a / workflow。
3. **A2A 必须走 A2AClient**：Agent 间调用不得直接 import，必须通过 `a2a-client.ts`。
4. **Artifact 优于 Message**：结构化产物写入 Artifact，不塞进聊天消息。
5. **Memory 写入必须有策略**：不允许自动写入所有模型输出，必须经过 `MemoryPolicy`。
6. **关键日志须带上下文 ID**：所有日志必须携带 `traceId`、`runId`、`agentId`。
7. **分层严格**：route 不写业务逻辑，service 不写 SQL，store 不写 HTTP。
8. **类型共享优先**：前后端共同理解的类型放 `packages/shared`，不重复定义。

---

> 本文档会随项目进展持续更新。每完成一个阶段，对应条目标记 ✅ 并记录完成日期。

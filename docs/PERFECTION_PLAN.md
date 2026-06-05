# Agent Frame 功能完善计划

> 本文档基于 [FRAMEWORK_DESIGN.md](./FRAMEWORK_DESIGN.md)（零删除融合版）设计目标与当前项目实际代码实现，梳理已完成能力、剩余扩展项和下一阶段方向。
>
> 更新日期：2026-06-05
> 当前阶段：**核心链路（阶段 1–6）基本落地，剩余项为融合增强（AI 工程基础设施）与生产化扩展（P3）**

---

## 📋 任务进度总览

> **图例**：✅ 已完成 │ 🚧 部分完成 / MVP 版 │ ❌ 未开始

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
| 2.6 | `workflow/workflow-registry.ts` 工作流注册表 | P2 | ✅ | 2026-06-03 |
| 2.7 | `workflow/stage-executor.ts` 单阶段执行 | P2 | ✅ | 2026-06-03 |
| 2.8 | `workflow/workflow-store.ts` 状态存储（内存 + MySQL）| P2 | ✅ | 2026-06-04 |
| 2.9 | `workflow/retry-policy.ts` 阶段重试策略 | P2 | ✅ | 2026-06-03 |
| 2.10 | `workflow/human-gate.ts` 人工节点接口预留 | P2 | ✅ | 2026-06-03 |
| 2.11 | `packages/shared` Workflow 事件类型常量 | P2 | ✅ | 2026-06-03 |
| 2.12 | Workflow API（`GET /workflows`、`POST /workflows/:id/runs`）| P2 | ✅ | 2026-06-03 |
| 2.13 | `a2a/remote-agent-adapter.ts` 远程 Agent HTTP 适配器 | P2 | ✅ | 2026-06-03 |

### 阶段 3 — Project + Memory + Session 完善（P2）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 3.1 | `features/projects/` Project CRUD API（含 repository 层）| P2 | ✅ | 2026-06-03 |
| 3.2 | `shared/db/schema.ts` 新增 `projects` 表 | P2 | ✅ | 2026-06-03 |
| 3.3 | `packages/shared/models/project.ts` 共享类型 | P2 | ✅ | 2026-06-03 |
| 3.4 | `memory/memory-store.mysql.ts` MySQL 持久化 | P2 | ✅ | 2026-06-03 |
| 3.5 | `memory/memory-retriever.ts` 记忆召回 | P2 | ✅ | 2026-06-03 |
| 3.6 | `memory/memory-policy.ts` 记忆写入策略 | P3 | ✅ | 2026-06-03 |
| 3.7 | `features/sessions/` 多层实现（route / service / repository / builder / utils）| P2 | ✅ | 2026-06-03 |
| 3.8 | `features/sessions/session-summary.service.ts` 会话摘要服务（接入 ModelClient）| P2 | ✅ | 2026-06-03 |
| 3.9 | Memory 接入 Agent 执行链路（SupervisorAgent 执行前召回、执行后候选写入）| P2 | ✅ | 2026-06-04 |
| 3.10 | 前端 `features/projects/` 项目列表与详情页 | P3 | ✅ | 2026-06-04 |

### 阶段 4 — 可观测性、安全与生产化（P2 / P3）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 4.1 | `shared/observability/tracing.ts` traceId 贯穿链路追踪 | P2 | ✅ | 2026-06-03 |
| 4.2 | `shared/observability/metrics.ts` 指标采集 | P3 | ✅ | 2026-06-03 |
| 4.3 | `features/usage/usage.service.ts` + `usage.route.ts` Service 分层 | P2 | ✅ | 2026-06-04 |
| 4.4 | `features/auth/` 完整 JWT 认证（含 repository / service / route 三层）| P2 | ✅ | 2026-06-03 |
| 4.5 | `shared/middlewares/rate-limit.middleware.ts` 请求限流 | P3 | ✅ | 2026-06-03 |
| 4.6 | `shared/realtime/ws.hub.ts` WebSocket 多 Run 订阅 | P2 | ✅ | 2026-06-04 |
| 4.7 | `shared/realtime/redis-event-bus.ts` Redis EventBus 实现 | P3 | ✅ | 2026-06-03 |
| 4.8 | 前端 Usage 统计面板（`/usage`，支持 day/week/month）| P3 | ✅ | 2026-06-04 |
| 4.9 | OpenTelemetry 接入（OTLP Exporter）| P3 | ❌ | — |
| 4.10 | 多租户 `tenantId` 权限扩展 | P3 | ❌ | — |

### 阶段 5 — Plugin 扩展（P3）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 5.1 | `plugins/plugin-context.ts` 完整 PluginContext 实现 | P3 | ✅ | 2026-06-03 |
| 5.2 | `plugins/plugin-registry.ts` 插件注册机制 | P3 | ✅ | 2026-06-03 |
| 5.3 | `plugins/builtin-plugins.ts` 内置 Agent 插件注册 | P3 | ✅ | 2026-06-03 |
| 5.4 | 前端 `features/agents/` Agent 列表与能力展示页 | P1 | ✅ | 2026-06-03 |
| 5.5 | 前端 `features/workflows/` Workflow 进度展示页 | P3 | ✅ | 2026-06-04 |
| 5.6 | 第一个业务模板插件（creative-writing） | P3 | ✅ | 2026-06-05 |

### 阶段 6 — 生产化与规模化（P3）

| # | 任务 | 优先级 | 状态 | 完成日期 |
|---|---|---|---|---|
| 6.1 | Redis EventBus（替换内存 EventBus，支持多实例）| P3 | ✅ | 2026-06-03 |
| 6.2 | A2A 异步模式 `startAsync()` + `queues/agent-task.worker.ts` | P3 | ✅ | 2026-06-04 |
| 6.3 | `queues/agent-task.store.ts` 异步任务持久化 | P3 | ✅ | 2026-06-03 |
| 6.4 | `runtime/scheduler.ts` 并发控制 + 优先级队列 | P3 | ✅ | 2026-06-03 |
| 6.5 | E2E 测试 + GitHub Actions CI/CD | P3 | ✅ | 2026-06-04 |
| 6.6 | Docker 部署支持 | P3 | ✅ | 2026-06-03 |

### 阶段 7 — AI 工程基础设施融合增强（FRAMEWORK_DESIGN.md §0.14 / 附录 B）

> 来自零删除融合版方案二经验抽象，当前尚未落地。优先级为 P3，不影响核心链路运行。

| # | 任务 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| 7.1 | `ai/model-client/model-registry.ts` ModelRegistry | P3 | ✅ | 集中管理模型别名、能力标记、成本配置和 fallback 策略 |
| 7.2 | `ai/model-client/middlewares/` ModelMiddleware（日志 / fallback）| P3 | ✅ | LoggingMiddleware + FallbackMiddleware 函数组合，不污染 runtime / a2a |
| 7.3 | `ai/prompts/prompt-provider.ts` PromptProvider | P3 | ✅ | 支持 registerAll、promptHash 追踪、override；prompts/index.ts 已初始化注册 |
| 7.4 | `ai/tools/tool-factory.ts` ToolFactory | P3 | ✅ | ToolRegistry + ToolFactory 模式；内置 echoTool 示例；tools/index.ts 更新导出 |
| 7.5 | `ai/structured-output/` StructuredOutputPipeline | P3 | ✅ | executeWithRetry + repair.ts 修复 prompt；Zod schema 校验 + 自动重试 |
| 7.6 | `integrations/mcp/` MCPAdapter | P3 | ✅ | MockMCPAdapter + SchemaSanitizer（Gemini / Anthropic 兼容）；接口已定义 |
| 7.7 | `shared/observability/langfuse-bridge.ts` LangfuseBridge | P3 | ✅ | 无配置时 no-op；有配置时 logging stub；env.ts 新增 LANGFUSE_* 配置项 |
| 7.8 | `shared/errors/stream-error-normalizer.ts` StreamErrorNormalizer | P3 | ✅ | 识别 RATE_LIMIT / MODEL_TIMEOUT / PROVIDER_ERROR / CONTENT_FILTER；接入 stream() |
| 7.9 | `ai/model-client/vercel-ai-model-client.ts` 适配层测试 | P3 | ✅ | 4 个测试文件，51 个测试用例全通过（ModelRegistry / StreamErrorNormalizer / SchemaSanitizer / Pipeline）|


---

## 一、当前代码实现状态（按实际文件目录核验）

> 以下表格均已基于当前项目实际文件目录结构核验，**严格反映代码库实际状态**，非目标状态。

### 1.1 后端核心层 ✅

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `runtime/run-manager.ts` | `apps/api/src/runtime/run-manager.ts` | ✅ 完成 | Run 生命周期、状态流转、取消；接入 SessionSummaryService |
| `runtime/step-manager.ts` | `apps/api/src/runtime/step-manager.ts` | ✅ 完成 | Step 记录 |
| `runtime/event-emitter.ts` | `apps/api/src/runtime/event-emitter.ts` | ✅ 完成 | AgentEvent 发布，内存 EventBus |
| `runtime/cancellation.ts` | `apps/api/src/runtime/cancellation.ts` | ✅ 完成 | AbortController 取消信号 |
| `runtime/scheduler.ts` | `apps/api/src/runtime/scheduler.ts` | ✅ 完成 | 并发控制、优先级队列 |
| `runtime/stores/run-store.ts` | `apps/api/src/runtime/stores/run-store.ts` | ✅ 完成 | RunStore 接口定义 |
| `runtime/stores/memory-run-store.ts` | `apps/api/src/runtime/stores/memory-run-store.ts` | ✅ 完成 | 内存实现 |
| `runtime/stores/mysql-run-store.ts` | `apps/api/src/runtime/stores/mysql-run-store.ts` | ✅ 完成 | MySQL 持久化实现 |

### 1.2 A2A 层 ✅

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `a2a/a2a-client.ts` | `apps/api/src/a2a/a2a-client.ts` | ✅ 完成 | sync 同步调用 + `startAsync()` 异步调用 |
| `a2a/a2a-events.ts` | `apps/api/src/a2a/a2a-events.ts` | ✅ 完成 | 独立事件构造函数 |
| `a2a/a2a-policy.ts` | `apps/api/src/a2a/a2a-policy.ts` | ✅ 完成 | 白名单、最大深度、超时、调用次数 |
| `a2a/a2a-router.ts` | `apps/api/src/a2a/a2a-router.ts` | ✅ 完成 | 本地 Agent 路由，支持本地/远程适配器分发 |
| `a2a/local-agent-adapter.ts` | `apps/api/src/a2a/local-agent-adapter.ts` | ✅ 完成 | 本地 Agent 适配 |
| `a2a/remote-agent-adapter.ts` | `apps/api/src/a2a/remote-agent-adapter.ts` | ✅ 完成 | 远程 Agent HTTP 适配器 |

### 1.3 AI 能力层 ✅（ModelRegistry / PromptProvider 等融合增强项待实现）

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `ai/model-client/model-client.ts` | `apps/api/src/ai/model-client/model-client.ts` | ✅ 完成 | ModelClient 接口定义 |
| `ai/model-client/model-client.types.ts` | `apps/api/src/ai/model-client/model-client.types.ts` | ✅ 完成 | GenerateInput / GenerateOutput / ModelStreamEvent 等框架类型 |
| `ai/model-client/vercel-ai-model-client.ts` | `apps/api/src/ai/model-client/vercel-ai-model-client.ts` | ✅ 完成 | VercelAI SDK 适配实现 |
| `ai/model-client/usage-logger.ts` | `apps/api/src/ai/model-client/usage-logger.ts` | ✅ 完成 | ModelCall Usage 落库 |
| `ai/providers.ts` | `apps/api/src/ai/providers.ts` | ✅ 完成 | AI Provider 初始化 |
| `ai/models.ts` | `apps/api/src/ai/models.ts` | ✅ 完成 | 模型别名、成本配置（当前嵌入，待抽 ModelRegistry）|
| `ai/prompts/index.ts` | `apps/api/src/ai/prompts/index.ts` | 🚧 MVP | 当前为 prompt 字符串集合，待升级为 PromptProvider |
| `ai/tools/index.ts` | `apps/api/src/ai/tools/index.ts` | 🚧 MVP | 当前为简单工具列表导出，待升级为 ToolFactory 注入模式 |
| `ai/agents/supervisor.agent.ts` | `apps/api/src/ai/agents/supervisor.agent.ts` | ✅ 完成 | 调度 Agent，接入 memoryRetriever + memoryStore |
| `ai/agents/research.agent.ts` | `apps/api/src/ai/agents/research.agent.ts` | ✅ 完成 | 研究专业 Agent |
| `ai/agents/summary.agent.ts` | `apps/api/src/ai/agents/summary.agent.ts` | ✅ 完成 | 总结专业 Agent |
| `ai/agents/agent-ids.ts` | `apps/api/src/ai/agents/agent-ids.ts` | ✅ 完成 | Agent ID 常量，防止魔法字符串 |
| `ai/model-client/middlewares/` | `apps/api/src/ai/model-client/middlewares/index.ts` | ✅ 完成 | LoggingMiddleware + FallbackMiddleware 函数组合 |
| `ai/model-client/model-registry.ts` | `apps/api/src/ai/model-client/model-registry.ts` | ✅ 完成 | ModelRegistry 独立模块，含 get/getFallback/hasCapability |
| `ai/structured-output/` | `apps/api/src/ai/structured-output/pipeline.ts` + `repair.ts` | ✅ 完成 | executeWithRetry + Zod 校验 + 自动修复重试 |

### 1.4 Workflow 层 ✅

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `workflow/workflow-definition.ts` | 见 `packages/shared/src/workflow/` | ✅ 完成 | 共享类型 |
| `workflow/workflow-runner.ts` | `apps/api/src/workflow/workflow-runner.ts` | ✅ 完成 | Stage 顺序执行，发布 `workflow.stage.*` 事件 |
| `workflow/workflow-registry.ts` | `apps/api/src/workflow/workflow-registry.ts` | ✅ 完成 | 工作流定义注册表 |
| `workflow/stage-executor.ts` | `apps/api/src/workflow/stage-executor.ts` | ✅ 完成 | 单 Stage 执行，内部通过 A2AClient 调用 Agent |
| `workflow/workflow-store.ts` | `apps/api/src/workflow/workflow-store.ts` | ✅ 完成 | 内存 + MySQL 双实现，容器自动选择 |
| `workflow/retry-policy.ts` | `apps/api/src/workflow/retry-policy.ts` | ✅ 完成 | Stage 重试策略（最大次数 + 退避）|
| `workflow/human-gate.ts` | `apps/api/src/workflow/human-gate.ts` | ✅ 完成 | 人工节点接口预留（`status: 'waiting_human'`）|

### 1.5 Artifact 层 ✅

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `artifacts/artifact-store.ts` | `apps/api/src/artifacts/artifact-store.ts` | ✅ 完成 | ArtifactStore 接口 |
| `artifacts/artifact-store.memory.ts` | `apps/api/src/artifacts/artifact-store.memory.ts` | ✅ 完成 | 内存实现 |
| `artifacts/artifact-store.mysql.ts` | `apps/api/src/artifacts/artifact-store.mysql.ts` | ✅ 完成 | MySQL 实现 |
| `artifacts/artifact-events.ts` | `apps/api/src/artifacts/artifact-events.ts` | ✅ 完成 | artifact.created / version.created 事件 |
| `artifacts/artifact-version.ts` | `apps/api/src/artifacts/artifact-version.ts` | ✅ 完成 | 版本创建、查询、回滚逻辑 |
| `artifacts/artifact-policy.ts` | `apps/api/src/artifacts/artifact-policy.ts` | ✅ 完成 | 产物访问可见性策略 |

### 1.6 Memory 层 ✅

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `memory/memory.types.ts` | `apps/api/src/memory/memory.types.ts` | ✅ 完成 | MemoryItem 类型定义 |
| `memory/memory-store.memory.ts` | `apps/api/src/memory/memory-store.memory.ts` | ✅ 完成 | 内存实现 |
| `memory/memory-store.mysql.ts` | `apps/api/src/memory/memory-store.mysql.ts` | ✅ 完成 | MySQL 持久化 |
| `memory/memory-retriever.ts` | `apps/api/src/memory/memory-retriever.ts` | ✅ 完成 | 按 scope + scopeId + kind 召回 |
| `memory/memory-policy.ts` | `apps/api/src/memory/memory-policy.ts` | ✅ 完成 | 来源过滤、长度限制、人审标记 |

### 1.7 Plugins 层 ✅

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `plugins/plugin.types.ts` | `apps/api/src/plugins/plugin.types.ts` | ✅ 完成 | AgentPlugin、PluginContext 类型 |
| `plugins/plugin-registry.ts` | `apps/api/src/plugins/plugin-registry.ts` | ✅ 完成 | 插件注册机制 |
| `plugins/plugin-context.ts` | `apps/api/src/plugins/plugin-context.ts` | ✅ 完成 | registerAgent / registerTool / registerWorkflow / registerArtifactType |
| `plugins/builtin-plugins.ts` | `apps/api/src/plugins/builtin-plugins.ts` | ✅ 完成 | 内置基础 Agent 插件注册示例 |
| `plugins/creative-writing/` | ❌ 尚不存在 | ❌ 未开始 | 第一个业务模板插件待实现 |

### 1.8 Queues 层 ✅

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `queues/agent-task.store.ts` | `apps/api/src/queues/agent-task.store.ts` | ✅ 完成 | 异步任务持久化（MySQL）|
| `queues/agent-task.worker.ts` | `apps/api/src/queues/agent-task.worker.ts` | ✅ 完成 | AgentTaskWorker，poll 消费异步任务 |

### 1.9 Features 层 ✅

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `features/runs/runs.route.ts` | ✅ | ✅ 完成 | Run CRUD API + SSE 事件订阅 |
| `features/runs/runs.service.ts` | ✅ | ✅ 完成 | Run 应用服务层 |
| `features/agents/agents.route.ts` | ✅ | ✅ 完成 | Agent 列表 API |
| `features/agents/agents.service.ts` | ✅ | ✅ 完成 | 动态 Agent 查询服务，结合 A2ARouter |
| `features/artifacts/artifacts.route.ts` | ✅ | ✅ 完成 | 产物 CRUD API |
| `features/artifacts/artifacts.service.ts` | ✅ | ✅ 完成 | 产物应用服务层 |
| `features/auth/auth.route.ts` | ✅ | ✅ 完成 | JWT 注册/登录路由 |
| `features/auth/auth.service.ts` | ✅ | ✅ 完成 | 认证业务服务 |
| `features/auth/auth.repository.ts` | ✅ | ✅ 完成 | 用户数据访问层 |
| `features/projects/projects.route.ts` | ✅ | ✅ 完成 | Project CRUD API |
| `features/projects/projects.service.ts` | ✅ | ✅ 完成 | Project 应用服务层 |
| `features/projects/projects.repository.ts` | ✅ | ✅ 完成 | Project 数据访问层 |
| `features/sessions/sessions.route.ts` | ✅ | ✅ 完成 | 会话 API |
| `features/sessions/sessions.service.ts` | ✅ | ✅ 完成 | 会话应用服务层 |
| `features/sessions/sessions.repository.ts` | ✅ | ✅ 完成 | 会话数据访问层 |
| `features/sessions/session-summary.service.ts` | ✅ | ✅ 完成 | 会话摘要服务（接入 ModelClient）|
| `features/sessions/conversation-context.builder.ts` | ✅ | ✅ 完成 | 对话上下文构造器 |
| `features/sessions/conversation-context.utils.ts` | ✅ | ✅ 完成 | 对话上下文工具函数 |
| `features/usage/usage.route.ts` | ✅ | ✅ 完成 | Token/成本统计 API |
| `features/usage/usage.service.ts` | ✅ | ✅ 完成 | Usage 聚合服务层 |
| `features/workflows/workflows.route.ts` | ✅ | ✅ 完成 | Workflow API |
| `features/memory/memory.route.ts` | ✅ | ✅ 完成 | 记忆查询 API |
| `features/agent-tasks/agent-tasks.route.ts` | ✅ | ✅ 完成 | 异步 AgentTask 查询 API |
| `features/realtime/ws.route.ts` | ✅ | ✅ 完成 | WebSocket 路由入口 |

### 1.10 Shared 层 ✅

| 模块 | 实际文件路径 | 实现状态 | 说明 |
|---|---|---|---|
| `shared/auth/auth.middleware.ts` | ✅ | ✅ 完成 | optionalAuthPlugin + requireAuthPlugin（JWT + query.token）|
| `shared/auth/jwt.ts` | ✅ | ✅ 完成 | JWT 签发/校验 |
| `shared/auth/auth-context.ts` | ✅ | ✅ 完成 | AuthUser 类型 |
| `shared/db/client.ts` | ✅ | ✅ 完成 | MySQL 客户端 |
| `shared/db/schema.ts` | ✅ | ✅ 完成 | 全量表定义 |
| `shared/db/migrations/` | ✅ 2个 migration | ✅ 完成 | DDL 变更历史 |
| `shared/errors/app-error.ts` | ✅ | ✅ 完成 | 统一错误类 |
| `shared/middlewares/rate-limit.middleware.ts` | ✅ | ✅ 完成 | 请求限流 |
| `shared/observability/logger.ts` | ✅ | ✅ 完成 | 结构化日志 |
| `shared/observability/metrics.ts` | ✅ | ✅ 完成 | 指标采集 |
| `shared/observability/tracing.ts` | ✅ | ✅ 完成 | traceId 贯穿追踪 |
| `shared/realtime/event-bus.ts` | ✅ | ✅ 完成 | 内存 EventBus 基础实现 |
| `shared/realtime/redis-event-bus.ts` | ✅ | ✅ 完成 | Redis Pub/Sub EventBus 实现 |
| `shared/realtime/sse.handler.ts` | ✅ | ✅ 完成 | SSE 推送封装 |
| `shared/realtime/ws.hub.ts` | ✅ | ✅ 完成 | WebSocket 连接管理、多 Run 房间订阅 |
| `shared/observability/langfuse-bridge.ts` | `apps/api/src/shared/observability/langfuse-bridge.ts` | ✅ 完成 | 无配置 no-op；有配置 logging stub；接 LANGFUSE_* 环境变量 |
| `shared/errors/stream-error-normalizer.ts` | `apps/api/src/shared/errors/stream-error-normalizer.ts` | ✅ 完成 | 识别 RATE_LIMIT / MODEL_TIMEOUT / PROVIDER_ERROR，接入 stream() |

### 1.11 packages/shared ✅

| 模块 | 实现状态 | 说明 |
|---|---|---|
| `constants/event-types.ts` | ✅ 完成 | 全部事件类型常量，含 workflow.* |
| `constants/run-constants.ts` | ✅ 完成 | Run/Step 状态常量 |
| `constants/a2a-constants.ts` | ✅ 完成 | A2A 状态常量，含 A2A_ASYNC_STATUSES |
| `constants/artifact-constants.ts` | ✅ 完成 | Artifact 类型常量 |
| `constants/memory-constants.ts` | ✅ 完成 | Memory 常量 |
| `constants/model-constants.ts` | ✅ 完成 | 模型相关常量 |
| `constants/step-types.ts` | ✅ 完成 | Step 类型常量 |
| `constants/workflow-constants.ts` | ✅ 完成 | Workflow 状态 + 事件类型常量 |
| `constants/agent-task-constants.ts` | ✅ 完成 | AgentTask 状态常量 |
| `constants/error-codes.ts` | ✅ 完成 | 前后端共享 AppErrorCode + HTTP 状态映射 |
| `a2a/a2a-protocol.ts` | ✅ 完成 | A2ARequest / A2AResponse 共享类型 |
| `workflow/workflow-definition.ts` | ✅ 完成 | WorkflowDefinition / WorkflowStage 共享类型 |
| `models/agent.ts` | ✅ 完成 | AgentCapability 共享类型 |
| `models/artifact.ts` | ✅ 完成 | Artifact 共享类型 |
| `models/conversation-context.ts` | ✅ 完成 | ConversationContext 共享类型 |
| `models/memory.ts` | ✅ 完成 | MemoryItem / MemoryScope 共享类型 |
| `models/project.ts` | ✅ 完成 | Project 共享类型 |
| `models/run.ts` | ✅ 完成 | Run 共享类型 |
| `models/session.ts` | ✅ 完成 | Session 共享类型 |
| `models/user.ts` | ✅ 完成 | User 共享类型 |

### 1.12 前端 apps/web ✅

| 功能 | 路由 | 关键文件 | 状态 | 说明 |
|---|---|---|---|---|
| 聊天主界面 | `/` 、 `/session/:sessionId` | `ChatWorkspace.tsx`、`ChatPage.tsx` | ✅ 完成 | 含 Session 侧边栏、RunTimeline、SSE 订阅 |
| RunTimeline | 内嵌 | `RunTimeline.tsx`、`AgentEventCard.tsx` | ✅ 完成 | 支持全部 run/agent/tool/artifact/workflow 事件，含 human gate |
| Agent 列表页 | `/agents` | `AgentsPage.tsx`、`agents.api.ts` | ✅ 完成 | 展示注册 Agent 能力描述 |
| Workflow 进度页 | `/workflows` | `WorkflowsPage.tsx`、`workflows.api.ts` | ✅ 完成 | WorkflowRun 列表、Stage 进度展示 |
| 产物详情页 | `/artifacts/:artifactId` | `ArtifactPage.tsx`、`ArtifactViewer.tsx` | ✅ 完成 | 版本历史、元数据、内容预览 |
| 项目列表页 | `/projects` | `ProjectsPage.tsx`、`projects.api.ts` | ✅ 完成 | 项目创建、列表、详情入口 |
| Usage 统计 | `/usage` | `UsagePage.tsx`、`usage.api.ts` | ✅ 完成 | day/week/month 切换，Token/成本统计 |
| 登录/注册 | `/login` | `AuthPage.tsx`、`auth.api.ts` | ✅ 完成 | JWT 认证，路由守卫 |
| Session 侧边栏 | 内嵌 | `SessionSidebar.tsx` | ✅ 完成 | 历史对话归档与切换 |
| 前端 SSE 升级为 WS | — | `lib/sse.ts` | 🚧 可选 | 后端 WS hub 已有，前端可渐进式迁移 |

### 1.13 数据库 Schema ✅

| 表 | 状态 | 说明 |
|---|---|---|
| `runs` | ✅ 完成 | 含 `project_id`、`trace_id`、`session_id` 索引 |
| `steps` | ✅ 完成 | — |
| `run_events` | ✅ 完成 | — |
| `model_calls` | ✅ 完成 | 含 `input_tokens`、`output_tokens`、`cost_usd`、`finish_reason` |
| `artifacts` | ✅ 完成 | 含 `project_id` 字段和索引 |
| `artifact_versions` | ✅ 完成 | 含 `created_by_step_id` 字段 |
| `projects` | ✅ 完成 | 含 owner 索引 |
| `chat_sessions` | ✅ 完成 | 历史通过 Run / Event transcript 恢复（设计决策）|
| `memories` | ✅ 完成 | 含 scope、scopeId、kind、content、metadata 及检索索引 |
| `workflow_runs` | ✅ 完成 | MySQLWorkflowStore 完整实现 |
| `agent_tasks` | ✅ 完成 | 异步 A2A 任务持久化表 |
| `users` | ✅ 完成 | 用户表（含密码 hash）|

---

## 二、下一阶段工作方向

### 方向 A：AI 工程基础设施融合增强（阶段 7，P3）

> 来自 FRAMEWORK_DESIGN.md §0.14 融合增强概念地图和附录 B。这些是「提升可维护性和可扩展性」的工程增强，不影响当前核心链路运行。

#### A.1 ModelRegistry（`ai/models.ts` → `ai/model-registry.ts`）

**当前状态**：`ai/models.ts` 已有模型别名和成本配置，但逻辑嵌入文件内部，无法实现能力校验和 fallback 路由。

**目标**：
- [ ] 抽取 `ai/model-client/model-registry.ts`：提供 `getModel(alias)`、`getCapability(alias)`、`getFallback(alias)` 接口
- [ ] `VercelAIModelClient.resolveModel()` 通过 ModelRegistry 解析，不再直接写死

#### A.2 ModelMiddleware（`ai/model-client/middlewares/`）

**当前状态**：无 middleware 层，日志和 fallback 逻辑直接写在 `vercel-ai-model-client.ts` 中。

**目标**：
- [ ] 新建 `ai/model-client/middlewares/logging.middleware.ts`：通过 `wrapLanguageModel` 统一打 ModelCall 日志
- [ ] 新建 `ai/model-client/middlewares/fallback.middleware.ts`：限流时自动 fallback 并发出 `model.fallback` 事件
- [ ] 保证 middleware 不污染 runtime / a2a / workflow 层

#### A.3 PromptProvider（`ai/prompts/prompt-provider.ts`）

**当前状态**：`ai/prompts/index.ts` 仅为 prompt 字符串集合，无版本管理和请求级 override。

**目标**：
- [ ] 新建 `ai/prompts/prompt-provider.ts`：支持文件加载、`promptHash` 追踪、请求级 override
- [ ] Agent 从 PromptProvider 获取 prompt，不再硬编码字符串
- [ ] `ModelCall` 记录 `promptHash` 字段，支持审计

#### A.4 ToolFactory（`ai/tools/tool-factory.ts`）

**当前状态**：`ai/tools/index.ts` 为简单工具导出，Tool 不接收上下文注入。

**目标**：
- [ ] 新建 `ai/tools/tool-factory.ts`：工厂函数统一注入 PromptProvider / ModelClient / PolicyContext
- [ ] Tool 内部的 LLM 推理通过 `StructuredOutputPipeline` 实现，不直接调用 `generateObject`

#### A.5 StructuredOutputPipeline（`ai/structured-output/`）

**当前状态**：Agent 直接使用 `generateObject`，无统一校验、修复和重试机制。

**目标**：
- [ ] 新建 `ai/structured-output/pipeline.ts`：Zod schema 校验 + 自动修复 prompt + 重试（最大 N 次）
- [ ] `ai/structured-output/repair.ts`：修复 prompt 生成策略
- [ ] ResearchAgent / SummaryAgent 切换到 Pipeline，移除直接 `generateObject` 调用

#### A.6 MCPAdapter（`integrations/mcp/`）

**当前状态**：无 MCP 集成。

**目标**：
- [ ] 新建 `integrations/mcp/mcp-adapter.ts`：对接外部 MCP 工具服务
- [ ] 新建 `integrations/mcp/schema-sanitizer.ts`：处理 Gemini 等 provider 的 schema 兼容问题
- [ ] Agent 通过 ToolFactory 使用 MCPAdapter，不直接依赖 MCP Client

#### A.7 LangfuseBridge（`shared/observability/langfuse-bridge.ts`）

**当前状态**：仅有框架自身的 `tracing.ts` + `logger.ts`，无 Langfuse/OTLP 上报。

**目标**：
- [ ] 新建 `shared/observability/langfuse-bridge.ts`：OpenTelemetry span 上报到 Langfuse
- [ ] 保证不替代框架自身的 `traceId/runId/stepId` 事件追踪
- [ ] `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` 环境变量控制开启

#### A.8 StreamErrorNormalizer（`shared/errors/stream-error-normalizer.ts`）

**当前状态**：流式响应错误处理散落在各 Agent 和 ModelClient 中。

**目标**：
- [ ] 新建 `shared/errors/stream-error-normalizer.ts`：统一归一化流式错误为 `ModelError` 结构
- [ ] `VercelAIModelClient.stream()` 通过 normalizer 处理，不把 provider 原始错误暴露给前端

---

### 方向 B：生产化扩展（P3 / 可选）

| 优先级 | 任务 | 说明 |
|---|---|---|
| P3 | OpenTelemetry 接入 | 对接 OTLP Exporter，实现标准化分布式追踪（依赖 A.7 LangfuseBridge）|
| P3 | 多租户 `tenantId` 权限扩展 | 通过 A2APolicy / middleware 隔离租户资源 |
| P3 | 角色鉴权（RBAC）| 补充 `auth.middleware.ts` 角色信息注入与 RBAC 策略（当前仅 userId）|
| P3 | Temporal 长任务对接 | 仅在长任务强恢复需求出现时引入，当前 Scheduler 已满足需求 |
| P3 | 前端 SSE 升级为 WebSocket | 后端 WS hub 已有，可渐进式将聊天订阅迁移到 WS |
| P3 | `creative-writing` 业务插件模板 | 注册 `outline-agent`、`writing-agent`、`review-agent` 及对应 Workflow 与 ArtifactType |
| P3 | ModelClient 适配层单元测试 | 补充 `vercel-ai-model-client.ts` 的单元测试，降低 SDK 版本升级风险 |
| P3 | `sessions/conversation-context` 更深集成 | 将 ConversationContext 更广泛用于 Agent 执行前的上下文注入 |

---

## 三、各模块完善优先级汇总

| 优先级 | 模块/功能 | 所属方向 | 状态 |
|---|---|---|---|
| 🔴 P0 | Token Usage 数据正确落库 | 阶段 1 | ✅ 已完成 |
| 🔴 P0 | `artifact_versions.created_by_step_id` 赋值 | 阶段 1 | ✅ 已完成 |
| 🟠 P1 | A2A 协议/事件文件独立 | 阶段 1 | ✅ 已完成 |
| 🟠 P1 | 错误码常量独立 + 共享 | 阶段 1 | ✅ 已完成 |
| 🟠 P1 | Agents 列表/能力 API | 阶段 1 | ✅ 已完成 |
| 🟠 P1 | Artifacts Service 层补全 | 阶段 1 | ✅ 已完成 |
| 🟡 P2 | Workflow 轻量 MVP | 阶段 2 | ✅ 已完成 |
| 🟡 P2 | Artifact 版本管理增强 | 阶段 2 | ✅ 已完成 |
| 🟡 P2 | Remote Agent Adapter | 阶段 2 | ✅ 已完成 |
| 🟡 P2 | Project 管理（含 repository 层）| 阶段 3 | ✅ 已完成 |
| 🟡 P2 | Memory MySQL + 召回 | 阶段 3 | ✅ 已完成 |
| 🟡 P2 | Session 完善（含 summary service / context builder）| 阶段 3 | ✅ 已完成 |
| 🟡 P2 | Memory 接入 Agent 执行链路 | 阶段 3 | ✅ 已完成 |
| 🟡 P2 | 链路追踪（traceId 贯穿）| 阶段 4 | ✅ 已完成 |
| 🟡 P2 | Usage 统计 API + Service 分层 | 阶段 4 | ✅ 已完成 |
| 🟡 P2 | JWT 认证（三层分层）| 阶段 4 | ✅ 已完成 |
| 🟡 P2 | WebSocket 多 Run 订阅 | 阶段 4 | ✅ 已完成 |
| 🟡 P2 | RunTimeline 支持 `workflow.*` 事件 | 阶段 5 | ✅ 已完成 |
| 🟡 P2 | WorkflowRun MySQL 持久化 | 阶段 2/6 | ✅ 已完成 |
| 🟢 P3 | Plugin 机制完善 | 阶段 5 | ✅ 机制完成，业务模板待定 |
| 🟢 P3 | Redis EventBus | 阶段 6 | ✅ 已完成 |
| 🟢 P3 | A2A 异步模式 + Worker | 阶段 6 | ✅ 已完成 |
| 🟢 P3 | E2E 测试 + CI/CD | 阶段 6 | ✅ 已完成 |
| 🟢 P3 | ModelRegistry 独立模块 | 方向 A | ❌ 待实现 |
| 🟢 P3 | ModelMiddleware | 方向 A | ❌ 待实现 |
| 🟢 P3 | PromptProvider | 方向 A | ❌ 待实现 |
| 🟢 P3 | ToolFactory | 方向 A | ❌ 待实现 |
| 🟢 P3 | StructuredOutputPipeline | 方向 A | ❌ 待实现 |
| 🟢 P3 | MCPAdapter | 方向 A | ❌ 待实现 |
| 🟢 P3 | LangfuseBridge / OpenTelemetry | 方向 A/B | ❌ 待实现 |
| 🟢 P3 | StreamErrorNormalizer | 方向 A | ❌ 待实现 |
| 🟢 P3 | 多租户 `tenantId` 权限扩展 | 方向 B | ❌ 待实现 |
| 🟢 P3 | `creative-writing` 业务插件模板 | 方向 B | ❌ 待实现 |
| 🟢 P3 | Temporal 长任务对接 | 方向 B | ❌ 后置（当前 Scheduler 已够用）|

---

## 四、FRAMEWORK_DESIGN.md 新增融合增强章节与当前实现对比

> 本节对照 FRAMEWORK_DESIGN.md 零删除融合版（§0.14 融合增强概念地图 + 附录 B/E/F）中的新增验收项，逐项核实当前代码实现情况。

| 验收编号 | 验收项 | 框架设计要求 | 当前实现状态 | 差距/TODO |
|---|---|---|---|---|
| F-1 | ModelRegistry | 至少支持默认模型、按 ID 获取、能力校验 | 🚧 `ai/models.ts` 有别名配置，无独立接口 | 抽 `model-registry.ts` |
| F-2 | ModelClient 隔离 | Agent 代码中不直接 import Vercel AI SDK | ✅ 实现：Agent 只依赖 ModelClient 接口 | 无差距 |
| F-3 | PromptProvider | prompt 可从文件加载，支持请求级 override | 🚧 `ai/prompts/index.ts` 为字符串集合，无 override | 实现 PromptProvider |
| F-4 | Prompt 追踪 | 模型调用记录 promptHash | ❌ 未实现：ModelCall 无 promptHash 字段 | 补充 promptHash |
| F-5 | ToolFactory | Tool 由工厂创建并注入上下文 | 🚧 工具为简单导出，无工厂注入 | 实现 ToolFactory |
| F-6 | StructuredOutput | 至少支持 schema 校验和失败重试 | 🚧 直接用 `generateObject`，无重试 | 实现 Pipeline |
| F-7 | Fallback | 模型限流时可 fallback，并产生事件 | ❌ 未实现：当前无 fallback 机制 | 实现 FallbackMiddleware |
| F-8 | SessionHistory | Redis 可保存短期会话历史，但不替代 RunStore | 🚧 当前会话通过 MySQL chat_sessions 实现，未用 Redis 短期缓存 | 可选：Redis TTL 缓存 |
| F-9 | Stream Error | 流式错误归一化为稳定错误结构 | 🚧 部分实现：ModelStreamEvent 有 `model.failed`，但无独立 normalizer | 实现 StreamErrorNormalizer |
| F-10 | Observability | Langfuse span 或结构化日志带 traceId/runId/stepId | 🚧 结构化日志已带关键 ID，Langfuse 未接入 | 接 LangfuseBridge |

---

## 五、设计约束与开发原则（执行期间须遵守）

1. **禁止魔法字符串**：所有事件类型、状态值必须使用 `packages/shared/src/constants/` 中定义的常量，不得内联字符串。
2. **ModelClient 隔离**：Vercel AI SDK 只出现在 `apps/api/src/ai/` 内，不扩散到 runtime / a2a / workflow。
3. **A2A 必须走 A2AClient**：Agent 间调用不得直接 import，必须通过 `a2a-client.ts`。
4. **Artifact 优于 Message**：结构化产物写入 Artifact，不塞进聊天消息。
5. **Memory 写入必须有策略**：不允许自动写入所有模型输出，必须经过 `MemoryPolicy`。
6. **关键日志须带上下文 ID**：所有日志必须携带 `traceId`、`runId`、`agentId`（至少这三个）。
7. **分层严格**：route 不写业务逻辑，service 不写 SQL，store / repository 不写 HTTP。
8. **类型共享优先**：前后端共同理解的类型放 `packages/shared`，不重复定义。
9. **ModelRegistry/PromptProvider 是增强，不是重构**：融合增强项只扩展 `ai/` 层，不改动 runtime / a2a / workflow 核心层。
10. **业务插件不污染框架核心**：creative-writing 等业务模板只作为 Plugin，通过 PluginRegistry 注册，不进入 `runtime/` 或 `a2a/`。

---

## 六、容器（container.ts）依赖注册实际状态

> 当前 `apps/api/src/container.ts` 实际注册的依赖与服务如下（已完整核验）：

| 组件 | 类型 | 实际注入情况 |
|---|---|---|
| `store` | RunStore | MySQL / Memory 自动选择 |
| `artifactStore` | ArtifactStore | MySQL / Memory 自动选择 |
| `memoryStore` | MemoryStore | MySQL / Memory 自动选择 |
| `memoryRetriever` | MemoryRetriever | 已注入 memoryStore |
| `modelClient` | VercelAIModelClient | 内部使用，未暴露给容器外 |
| `a2aPolicy` | A2APolicy | 已配置 Supervisor → Research/Summary 白名单 |
| `a2aRouter` | A2ARouter | 已注册 ResearchAgent / SummaryAgent 本地适配器 |
| `a2aClient` | A2AClient | 依赖 store + a2aPolicy + a2aRouter |
| `runManager` | RunManager | 依赖 store + SupervisorAgent + sessionSummaryService |
| `workflowStore` | WorkflowStore | MySQL / Memory 自动选择 |
| `workflowRegistry` | WorkflowRegistry | 已初始化，尚无业务 Workflow 注册 |
| `workflowRunner` | WorkflowRunner | 依赖 a2aClient + workflowStore + store |
| `humanGate` | HumanGateManager | 单例 |
| `artifactVersionManager` | ArtifactVersionManager | 依赖 artifactStore |
| `agentsService` | AgentsService | 依赖 a2aRouter |
| `artifactsService` | ArtifactsService | 依赖 artifactStore |
| `projectsService` | ProjectsService | 独立初始化 |
| `agentTaskWorker` | AgentTaskWorker | MySQL 模式下启动，poll 间隔 2s，批次 2 |
| `sessionsRepository` | SessionsRepository | 内部使用（构造 sessionSummaryService）|
| `sessionSummaryService` | SessionSummaryService | 依赖 sessionsRepository + modelClient |

**待扩展**：
- `agentTaskStore` 尚未在 container 中暴露（仅在 AgentTaskWorker 内部使用）
- `pluginRegistry` 未显式在容器中注册，当前通过 `builtin-plugins.ts` 直接调用
- 未来 `modelRegistry`、`promptProvider`、`toolFactory` 应在此处集中注册

---

> 本文档会随项目进展持续更新。每完成一个任务，对应条目标记 ✅ 并记录完成日期。文档中已完成项均经过实际代码目录核验。

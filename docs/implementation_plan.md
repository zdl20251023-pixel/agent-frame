# Agent Frame MVP — 可落地开发设计文档

> 基于 [FRAMEWORK_DESIGN.md](file:///e:/work/learn/agent-frame/FRAMEWORK_DESIGN.md) 提炼，聚焦 MVP 阶段最小可落地实现。
> 技术栈：**TypeScript + Bun + Elysia + Vercel AI SDK + React + Vite + MySQL 8.x**

---

## 1. MVP 范围与边界

### 1.1 MVP 必做（本文档覆盖范围）

| # | 能力 | 验收标准 |
|---|---|---|
| 1 | Monorepo 工程初始化 | `apps/web`、`apps/api`、`packages/shared` 可独立启动 |
| 2 | 共享事件 / 类型包 | 前后端引用同一份 `AgentEvent`、`A2ARequest` 等类型 |
| 3 | `POST /runs` | 能创建 `runId`，返回基础 Run 状态 |
| 4 | SSE 实时推送 | 前端能收到 `run.started`、`message.delta` |
| 5 | `ModelClient` 隔离层 | Agent 不直接依赖 Vercel AI SDK 类型 |
| 6 | `ChatAgent` / `SupervisorAgent` | 能通过模型流式回答 |
| 7 | A2A 同步调用 | Supervisor 能调用专业 Agent，事件全链路可见 |
| 8 | 前端 `RunTimeline` | 前端展示 AgentEvent 时间线 |
| 9 | MySQL `RunStore` | Run、Step、Event 可落库和查询 |
| 10 | 基础 `A2APolicy` | 最大深度、超时、调用白名单生效 |
| 11 | `Artifact` 基础写入 | Agent 输出可沉淀为 ArtifactVersion |
| 12 | 集成测试 | 覆盖 Run 创建、SSE、A2A、ModelClient、Artifact 写入 |

### 1.2 MVP 不做（明确后置）

| 后置内容 | 原因 |
|---|---|
| 复杂 Workflow Engine / Temporal | 当前只需要类型预留和轻量接口 |
| A2A 异步调用 + Queue/Worker | 接口预留，不实现队列 |
| Memory 自动写入 / 向量检索 | 接口预留，轻量实现 |
| 插件市场 / 动态安装 | 只做内部 PluginRegistry 注册接口 |
| 多租户 / 完整 RBAC | 先做 Agent 级调用策略 |
| Redis Pub/Sub 多实例广播 | 先用进程内 EventEmitter |
| 小说 / 短剧 / 短视频业务链路 | 未来插件接入 |
| WebSocket（多 Run 订阅）| 先 SSE，后续按需引入 |

---

## 2. 工程结构

### 2.1 Monorepo 顶层结构

```
agent-frame/
├─ apps/
│  ├─ web/                    # React + Vite 前端
│  └─ api/                    # Bun + Elysia 后端
├─ packages/
│  └─ shared/                 # 前后端共享协议、类型、schema、事件
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ docs/
├─ scripts/
├─ .env.example
├─ package.json               # Workspace 根，使用 bun workspaces
├─ tsconfig.json              # 根 TypeScript 配置
└─ bun.lockb
```

**包管理器**：Bun Workspaces（`bun install` 统一安装）

### 2.2 后端目录结构（`apps/api/src/`）

```
apps/api/src/
├─ server.ts                  # Bun 启动入口，监听端口
├─ app.ts                     # 创建 Elysia 实例，注册中间件、路由
├─ routes.ts                  # 聚合所有 feature routes
│
├─ features/                  # HTTP API 入口层（只处理协议，不写业务）
│  ├─ runs/
│  │  ├─ runs.route.ts        # POST /runs, GET /runs/:id, DELETE /runs/:id, GET /runs/:id/events
│  │  ├─ runs.service.ts      # 调用 runtime/run-manager
│  │  ├─ runs.schema.ts       # Elysia 请求/响应 schema
│  │  └─ runs.types.ts
│  ├─ agents/
│  │  ├─ agents.route.ts      # GET /agents, GET /agents/:id/capability
│  │  ├─ agents.service.ts
│  │  └─ agents.registry.ts   # Agent 注册表，对接 plugins 和 ai/agents
│  └─ artifacts/
│     ├─ artifacts.route.ts   # GET /artifacts/:id, GET /runs/:id/artifacts
│     ├─ artifacts.service.ts
│     └─ artifacts.schema.ts
│
├─ runtime/                   # Run 生命周期核心（不依赖 HTTP，不依赖 AI SDK）
│  ├─ run-manager.ts          # 创建/启动/取消/结束 Run，控制状态流转
│  ├─ step-manager.ts         # 管理 Run 内部 Step 记录
│  ├─ event-emitter.ts        # 发布标准 AgentEvent，供 SSE/日志订阅
│  ├─ scheduler.ts            # 单实例并发控制
│  ├─ cancellation.ts         # AbortController/取消信号管理
│  └─ stores/
│     ├─ run-store.ts         # RunStore 接口（不绑定存储）
│     ├─ memory-run-store.ts  # MVP 内存实现
│     └─ mysql-run-store.ts   # MySQL 持久化实现
│
├─ a2a/                       # Agent-to-Agent 协议层
│  ├─ a2a-protocol.ts         # A2ARequest / A2AResponse / A2ACallMode 类型
│  ├─ a2a-client.ts           # A2AClient 接口 + 本地实现
│  ├─ a2a-router.ts           # 根据 toAgentId 路由到本地/远程 Agent
│  ├─ a2a-policy.ts           # 调用权限、深度、预算、超时
│  ├─ a2a-events.ts           # A2A 相关事件定义和构造函数
│  ├─ local-agent-adapter.ts  # 将本地 Agent 适配为 A2A 可调用
│  └─ remote-agent-adapter.ts # 远程 Agent，MVP 空实现
│
├─ workflow/                  # Workflow 类型预留（MVP 只有接口和类型）
│  ├─ workflow-definition.ts  # WorkflowDefinition / WorkflowStage 类型
│  ├─ workflow-runner.ts      # WorkflowRunner 接口（MVP 不实现）
│  ├─ stage-executor.ts       # StageExecutor 接口（MVP 不实现）
│  └─ workflow-store.ts       # WorkflowStore 接口（MVP 不实现）
│
├─ artifacts/                 # Artifact 层
│  ├─ artifact.types.ts       # Artifact / ArtifactVersion / ArtifactRef 类型
│  ├─ artifact-store.ts       # ArtifactStore 接口
│  ├─ artifact-store.memory.ts# 内存实现（MVP 可选）
│  ├─ artifact-store.mysql.ts # MySQL 实现
│  ├─ artifact-version.ts     # 版本创建/查询逻辑
│  └─ artifact-events.ts      # artifact.created / artifact.version.created 事件
│
├─ plugins/                   # 插件注册接口（MVP 只有接口）
│  ├─ plugin.types.ts
│  └─ plugin-registry.ts
│
├─ memory/                    # 记忆层接口预留（MVP 轻量实现）
│  ├─ memory.types.ts
│  ├─ memory-store.ts
│  └─ memory-policy.ts
│
├─ ai/                        # AI 能力层（含 ModelClient 隔离）
│  ├─ model-client/
│  │  ├─ model-client.types.ts# GenerateInput/Output/StreamInput/ModelStreamEvent 等
│  │  ├─ model-client.ts      # ModelClient 接口定义
│  │  ├─ vercel-ai-model-client.ts # 基于 Vercel AI SDK 实现
│  │  └─ index.ts
│  ├─ providers.ts            # OpenAI/Anthropic/Google Provider 初始化
│  ├─ models.ts               # 模型别名、默认参数、成本配置
│  ├─ prompts/
│  │  ├─ supervisor.prompt.ts
│  │  └─ worker.prompt.ts
│  ├─ tools/
│  │  └─ example.tool.ts      # 示例 Tool（天气/搜索）
│  └─ agents/
│     ├─ supervisor.agent.ts  # 调度 Agent
│     ├─ worker.agent.ts      # 示例专业 Agent
│     └─ index.ts
│
├─ context/                   # 上下文构造器（MVP 基础实现）
│  ├─ context-builder.ts
│  └─ artifact-context-loader.ts
│
└─ shared/                    # 后端内部基础设施
   ├─ config/
   │  └─ env.ts               # 环境变量读取和校验
   ├─ db/
   │  ├─ client.ts            # MySQL 连接（Drizzle ORM）
   │  ├─ schema.ts            # 所有表定义
   │  └─ migrations/
   ├─ realtime/
   │  ├─ sse.handler.ts       # SSE 输出封装
   │  └─ event-bus.ts         # 进程内事件总线（MVP 用内存）
   ├─ middlewares/
   │  ├─ error.middleware.ts
   │  ├─ logger.middleware.ts
   │  └─ auth.middleware.ts   # MVP 简单 mock
   ├─ errors/
   │  ├─ app-error.ts
   │  └─ error-codes.ts
   ├─ observability/
   │  ├─ logger.ts            # 结构化日志（带 traceId/runId）
   │  └─ tracing.ts
   └─ utils/
      ├─ id.ts                # UUID/ULID 生成
      └─ stream.ts            # 流处理工具
```

### 2.3 前端目录结构（`apps/web/src/`）

```
apps/web/src/
├─ main.tsx
├─ App.tsx
├─ app/
│  ├─ router.tsx
│  └─ providers.tsx
├─ features/
│  ├─ chat/
│  │  ├─ ChatPage.tsx         # 主聊天页
│  │  ├─ MessageList.tsx
│  │  ├─ MessageInput.tsx
│  │  └─ chat.api.ts
│  ├─ runs/
│  │  ├─ RunTimeline.tsx      # Run 执行时间线
│  │  ├─ RunPanel.tsx         # Run 状态面板
│  │  ├─ AgentEventCard.tsx   # 单个事件展示组件
│  │  ├─ ArtifactPreview.tsx  # Artifact 内容预览
│  │  ├─ useRunEvents.ts      # SSE 订阅 Hook
│  │  └─ runs.api.ts
│  └─ agents/
│     ├─ AgentList.tsx
│     └─ agents.api.ts
├─ components/
│  ├─ layout/
│  │  └─ AppLayout.tsx
│  └─ ui/                     # 通用 UI 组件
├─ lib/
│  ├─ http.ts                 # fetch 封装
│  ├─ sse.ts                  # SSE 客户端封装
│  └─ utils.ts
└─ stores/
   └─ run.store.ts            # Zustand/Jotai，activeRunId、events cache
```

### 2.4 共享包结构（`packages/shared/src/`）

```
packages/shared/src/
├─ events/
│  ├─ agent-event.ts          # AgentEvent 联合类型（所有事件）
│  ├─ a2a-event.ts            # A2AEvent 类型
│  ├─ artifact-event.ts       # ArtifactEvent 类型
│  ├─ workflow-event.ts       # WorkflowEvent 类型（预留）
│  └─ index.ts
├─ a2a/
│  ├─ a2a-request.ts          # A2ARequest 类型
│  ├─ a2a-response.ts         # A2AResponse 联合类型
│  ├─ a2a-error.ts            # A2AError 类型
│  ├─ agent-capability.ts     # AgentCapability 类型
│  └─ index.ts
├─ models/
│  ├─ run.ts                  # Run / RunStatus 类型
│  ├─ step.ts                 # Step 类型
│  ├─ artifact.ts             # Artifact / ArtifactVersion / ArtifactRef 类型
│  ├─ agent.ts                # AgentDefinition 类型
│  ├─ memory.ts               # MemoryItem / MemoryScope 类型
│  └─ index.ts
├─ workflow/
│  ├─ workflow-definition.ts  # WorkflowDefinition / WorkflowStage 类型
│  └─ index.ts
├─ schemas/                   # Zod / TypeBox schema（供前后端复用）
├─ constants/
│  └─ event-types.ts          # 所有事件 type 字面量枚举
└─ index.ts
```

---

## 3. 核心数据模型

### 3.1 MySQL 表设计

#### `runs` 表

```sql
CREATE TABLE runs (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,   -- ULID/UUID
  trace_id      VARCHAR(36)  NOT NULL,
  user_id       VARCHAR(36)  NULL,
  project_id    VARCHAR(36)  NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'queued',
  -- 状态枚举: queued | running | completed | failed | cancelled
  input         JSON         NOT NULL,
  output        JSON         NULL,
  error         JSON         NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_status (status),
  INDEX idx_user_id (user_id),
  INDEX idx_trace_id (trace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### `steps` 表

```sql
CREATE TABLE steps (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  run_id          VARCHAR(36)  NOT NULL,
  parent_step_id  VARCHAR(36)  NULL,
  type            VARCHAR(30)  NOT NULL,
  -- 类型枚举: model_call | tool_call | agent_call | artifact_create
  status          VARCHAR(20)  NOT NULL DEFAULT 'running',
  agent_id        VARCHAR(100) NULL,
  from_agent_id   VARCHAR(100) NULL,
  to_agent_id     VARCHAR(100) NULL,
  input           JSON         NULL,
  output          JSON         NULL,
  error           JSON         NULL,
  started_at      DATETIME(3)  NOT NULL,
  ended_at        DATETIME(3)  NULL,
  INDEX idx_run_id (run_id),
  FOREIGN KEY (run_id) REFERENCES runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### `run_events` 表

```sql
CREATE TABLE run_events (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_id      VARCHAR(36)  NOT NULL,
  event_type  VARCHAR(60)  NOT NULL,
  event_data  JSON         NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_run_id (run_id),
  INDEX idx_event_type (event_type),
  FOREIGN KEY (run_id) REFERENCES runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### `artifacts` 表

```sql
CREATE TABLE artifacts (
  id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
  run_id              VARCHAR(36)  NOT NULL,
  project_id          VARCHAR(36)  NULL,
  workflow_run_id     VARCHAR(36)  NULL,
  workflow_stage_id   VARCHAR(100) NULL,
  type                VARCHAR(60)  NOT NULL,    -- script | report | outline | ...
  title               VARCHAR(255) NULL,
  current_version_id  VARCHAR(36)  NULL,
  metadata            JSON         NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_run_id (run_id),
  INDEX idx_project_id (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### `artifact_versions` 表

```sql
CREATE TABLE artifact_versions (
  id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
  artifact_id           VARCHAR(36)  NOT NULL,
  version               INT          NOT NULL DEFAULT 1,
  content               LONGTEXT     NOT NULL,   -- JSON 序列化后存储
  created_by_run_id     VARCHAR(36)  NOT NULL,
  created_by_step_id    VARCHAR(36)  NULL,
  created_by_agent_id   VARCHAR(100) NULL,
  parent_version_id     VARCHAR(36)  NULL,
  review_status         VARCHAR(20)  NULL,        -- pending | approved | rejected
  diff_summary          TEXT         NULL,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_artifact_id (artifact_id),
  UNIQUE KEY uq_artifact_version (artifact_id, version),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### `model_call_logs` 表（可观测性）

```sql
CREATE TABLE model_call_logs (
  id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trace_id         VARCHAR(36)  NOT NULL,
  run_id           VARCHAR(36)  NOT NULL,
  step_id          VARCHAR(36)  NULL,
  agent_id         VARCHAR(100) NULL,
  model_alias      VARCHAR(60)  NOT NULL,
  provider         VARCHAR(40)  NOT NULL,
  actual_model     VARCHAR(100) NOT NULL,
  input_tokens     INT          NULL,
  output_tokens    INT          NULL,
  total_tokens     INT          NULL,
  estimated_cost_usd DECIMAL(10,6) NULL,
  latency_ms       INT          NOT NULL,
  finish_reason    VARCHAR(30)  NULL,
  error_code       VARCHAR(60)  NULL,
  retry_count      INT          NOT NULL DEFAULT 0,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_run_id (run_id),
  INDEX idx_trace_id (trace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.2 核心 TypeScript 类型（`packages/shared`）

所有类型已在 `FRAMEWORK_DESIGN.md` 中定义，此处列出关键类型清单：

| 类型 | 文件 | 说明 |
|---|---|---|
| `Run` | `shared/models/run.ts` | 一次执行实例 |
| `Step` | `shared/models/step.ts` | Run 内部步骤 |
| `AgentEvent` | `shared/events/agent-event.ts` | 前后端共享事件联合类型 |
| `A2ARequest` | `shared/a2a/a2a-request.ts` | Agent 调用请求 |
| `A2AResponse` | `shared/a2a/a2a-response.ts` | Agent 调用响应（区分 sync/async/stream） |
| `A2ACallMode` | `shared/a2a/a2a-request.ts` | `'sync' \| 'async' \| 'stream'` |
| `AgentCapability` | `shared/a2a/agent-capability.ts` | Agent 能力描述 |
| `Artifact` | `shared/models/artifact.ts` | 产物（含 workflowRunId/StageId 预留字段） |
| `ArtifactVersion` | `shared/models/artifact.ts` | 产物版本（含审核状态字段） |
| `ArtifactRef` | `shared/models/artifact.ts` | 产物引用（跨 Agent 传递用） |
| `AgentInput<T>` | `shared/models/agent.ts` | 统一 Agent 输入结构 |
| `AgentOutput<T>` | `shared/models/agent.ts` | 统一 Agent 输出结构 |
| `MemoryItem` | `shared/models/memory.ts` | 记忆条目 |
| `WorkflowDefinition` | `shared/workflow/workflow-definition.ts` | Workflow 模板（预留） |

---

## 4. API 设计

### 4.1 Run API

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/runs` | 创建并启动一次 Run |
| `GET` | `/runs/:runId` | 查询 Run 状态和基础信息 |
| `GET` | `/runs/:runId/events` | SSE 订阅 Run 事件流 |
| `DELETE` | `/runs/:runId` | 取消运行中的 Run |
| `GET` | `/runs/:runId/artifacts` | 查询 Run 产出的所有 Artifact |

**POST /runs 请求体**：
```json
{
  "input": { "message": "帮我规划一次北京出差" },
  "agentId": "supervisor-agent",
  "sessionId": "optional-session-id",
  "projectId": "optional-project-id"
}
```

**POST /runs 响应**：
```json
{
  "runId": "01J...",
  "traceId": "trace-...",
  "status": "running",
  "createdAt": "2026-06-01T07:21:05Z"
}
```

### 4.2 Agent API

| Method | Path | 说明 |
|---|---|---|
| `GET` | `/agents` | 列出已注册 Agent 列表 |
| `GET` | `/agents/:agentId` | 查询 Agent 详情 |
| `GET` | `/agents/:agentId/capability` | 查询 Agent 能力描述 |

### 4.3 Artifact API

| Method | Path | 说明 |
|---|---|---|
| `GET` | `/artifacts/:artifactId` | 查询 Artifact 基础信息 |
| `GET` | `/artifacts/:artifactId/versions` | 查询版本列表 |
| `GET` | `/artifacts/:artifactId/versions/:versionId` | 查询特定版本内容 |

### 4.4 SSE 事件格式

```
GET /runs/:runId/events
Content-Type: text/event-stream

data: {"type":"run.started","runId":"...","timestamp":"..."}
data: {"type":"message.delta","runId":"...","agentId":"...","delta":"你好"}
data: {"type":"agent.call.started","runId":"...","fromAgentId":"...","toAgentId":"..."}
data: {"type":"agent.call.completed","runId":"...","latencyMs":800}
data: {"type":"artifact.created","runId":"...","artifactId":"...","artifactType":"report"}
data: {"type":"run.completed","runId":"..."}
```

---

## 5. 关键模块实现要点

### 5.1 `RunStore` 接口（`runtime/stores/run-store.ts`）

```typescript
interface RunStore {
  createRun(input: CreateRunInput): Promise<Run>
  getRun(runId: string): Promise<Run | null>
  updateRunStatus(runId: string, status: RunStatus, output?: unknown, error?: unknown): Promise<void>
  appendEvent(runId: string, event: AgentEvent): Promise<void>
  listEvents(runId: string): Promise<AgentEvent[]>
  createStep(step: CreateStepInput): Promise<Step>
  updateStep(stepId: string, update: UpdateStepInput): Promise<void>
}
```

MVP 先实现 `MemoryRunStore`（内存），再实现 `MySQLRunStore`（持久化）。

### 5.2 `EventEmitter`（`runtime/event-emitter.ts`）

- 进程内 Node.js `EventEmitter` 或 `EventTarget`。
- 每次调用 `emit(runId, event)` 时，同时：
  1. 广播给当前订阅该 `runId` 的所有 SSE 连接。
  2. 调用 `runStore.appendEvent()` 持久化。
- SSE 连接断开后自动清理订阅。

### 5.3 `ModelClient` 隔离（`ai/model-client/`）

- `ModelClient` 接口：`generate()` / `stream()` / `generateObject()` / `embed()`。
- `VercelAIModelClient` 实现：
  - `resolveModel(alias)` 将 `creative.medium` 解析为实际 provider model。
  - 所有输出必须转换为 `GenerateOutput` / `ModelStreamEvent`，绝不向外泄露 AI SDK 原生类型。
  - `raw` 字段只在 `ai/` 层内部保留，不向 `runtime`/`a2a` 扩散。
- **禁止**：`runtime/`、`a2a/`、`workflow/` 直接 `import { generateText } from 'ai'`。

### 5.4 `A2AClient` 实现（`a2a/a2a-client.ts`）

MVP 只实现 `callSync`，`startAsync` 和 `stream` 返回 `NOT_IMPLEMENTED` 错误：

```typescript
class LocalA2AClient implements A2AClient {
  async callSync(request: A2ARequest): Promise<A2AResponse> {
    // 1. A2APolicy.assertCanCall(request)
    // 2. emit agent.call.started
    // 3. A2ARouter.resolve(request.toAgentId)
    // 4. LocalAgentAdapter.execute(request)
    // 5. emit agent.call.completed / agent.call.failed
    // 6. 写入 Step 记录
    // 7. 返回 A2AResponse
  }

  async startAsync(_req: A2ARequest) {
    throw new AppError('A2A_ASYNC_NOT_IMPLEMENTED', 'Reserved for future versions.')
  }
}
```

### 5.5 `A2APolicy`（`a2a/a2a-policy.ts`）

MVP 最小规则检查：

```typescript
interface A2APolicyRule {
  fromAgentId: string
  toAgentId: string
  allowed: boolean
  maxDepth: number
  maxCallsPerRun: number
  timeoutMs: number
}

function assertCanCall(request: A2ARequest, context: PolicyContext): void {
  // 1. 检查 allowedAgents 白名单
  // 2. 检查当前调用深度 <= maxDepth（通过 context.currentDepth）
  // 3. 检查当前 run 调用次数 <= maxCallsPerRun
  // 4. 可选：检查 token 预算
  // 如果不满足，抛出 AppError('AGENT_CALL_DENIED')
}
```

默认从环境变量读取：
- `MAX_A2A_DEPTH=3`
- `MAX_AGENT_CALLS_PER_RUN=8`
- `DEFAULT_A2A_TIMEOUT_MS=30000`

### 5.6 `Artifact` 写入流程

```
Agent 生成结构化输出
  -> outputSchema 校验
  -> ArtifactStore.create({ runId, type, title })
  -> ArtifactVersionStore.create({ artifactId, content, createdByRunId, createdByStepId })
  -> ArtifactStore.updateCurrentVersionId(artifactId, versionId)
  -> 事务提交（以上三步同一个 MySQL 事务）
  -> 事务成功后 emit artifact.created / artifact.version.created
```

> [!IMPORTANT]
> **先提交事务，再推送 SSE 事件**，避免"前端看到成功事件但数据库未写入"。

### 5.7 `SupervisorAgent`（`ai/agents/supervisor.agent.ts`）

- 接收用户输入，分析任务。
- 决策是否需要调用专业 Agent：通过 `A2AClient.callSync()` 调用。
- **禁止**：直接 `import workerAgent from './worker.agent'` 调用，必须走 A2A。
- 汇总所有子 Agent 结果，构造最终回答。
- 可选将最终回答保存为 `Artifact`。

### 5.8 SSE Handler（`shared/realtime/sse.handler.ts`）

```typescript
// Elysia route 示例
app.get('/runs/:runId/events', ({ params, set }) => {
  set.headers['Content-Type'] = 'text/event-stream'
  set.headers['Cache-Control'] = 'no-cache'
  
  return new ReadableStream({
    start(controller) {
      const handler = (event: AgentEvent) => {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        if (isTerminalEvent(event)) controller.close()
      }
      eventBus.subscribe(params.runId, handler)
    },
    cancel() {
      eventBus.unsubscribe(params.runId, handler)
    }
  })
})
```

---

## 6. 事件协议（完整清单）

以下为 MVP 阶段必须实现的事件类型（在 `packages/shared/events/` 定义）：

### 6.1 Run 事件

| 事件类型 | 触发时机 |
|---|---|
| `run.started` | RunManager.createRun() 成功后 |
| `run.completed` | Run 正常结束 |
| `run.failed` | Run 异常失败 |
| `run.cancelled` | 用户主动取消 |

### 6.2 消息事件

| 事件类型 | 触发时机 |
|---|---|
| `message.delta` | 模型流式输出每个 token |

### 6.3 A2A 事件

| 事件类型 | 触发时机 |
|---|---|
| `agent.call.started` | A2AClient.callSync() 发起调用时 |
| `agent.call.completed` | Agent 执行成功返回时 |
| `agent.call.failed` | Agent 执行失败时 |
| `agent.call.queued` | （预留）异步调用入队 |
| `agent.call.progress` | （预留）异步调用进度 |
| `agent.call.cancelled` | （预留）异步调用取消 |

### 6.4 Tool 事件

| 事件类型 | 触发时机 |
|---|---|
| `tool.call` | Agent 发起 Tool 调用时 |
| `tool.result` | Tool 执行完成时 |

### 6.5 Artifact 事件

| 事件类型 | 触发时机 |
|---|---|
| `artifact.created` | Artifact 首次创建时 |
| `artifact.version.created` | 新版本写入时 |

---

## 7. 错误处理

### 7.1 统一 `AppError`

```typescript
// shared/errors/app-error.ts
class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public options?: {
      statusCode?: number
      retryable?: boolean
      details?: unknown
      cause?: unknown
    }
  ) { super(message) }
}
```

### 7.2 MVP 错误码清单

```typescript
type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RUN_TIMEOUT'
  | 'RUN_CANCELLED'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_CALL_DENIED'
  | 'AGENT_CALL_TIMEOUT'
  | 'AGENT_CALL_FAILED'
  | 'AGENT_MODE_NOT_SUPPORTED'
  | 'A2A_ASYNC_NOT_IMPLEMENTED'
  | 'TOOL_CALL_FAILED'
  | 'MODEL_CALL_FAILED'
  | 'MODEL_TIMEOUT'
  | 'RATE_LIMIT'
  | 'BUDGET_EXCEEDED'
  | 'ARTIFACT_SAVE_FAILED'
  | 'INTERNAL_ERROR'
```

### 7.3 错误 -> 事件映射

| 错误场景 | 处理方式 |
|---|---|
| A2A Policy 拒绝 | 抛 `AGENT_CALL_DENIED`，emit `agent.call.failed` |
| Agent 调用超时 | 抛 `AGENT_CALL_TIMEOUT`，emit `agent.call.failed` |
| 模型调用失败 | 抛 `MODEL_CALL_FAILED`，emit `run.failed` |
| Artifact 保存失败 | 事务回滚，抛 `ARTIFACT_SAVE_FAILED`，不推送事件 |
| Run 超时 | 触发取消，emit `run.failed`，原因 `RUN_TIMEOUT` |

---

## 8. 可观测性要求

### 8.1 结构化日志字段（`shared/observability/logger.ts`）

所有日志必须包含以下上下文字段（通过 AsyncLocalStorage 传播）：

```
traceId / runId / stepId / agentId / fromAgentId / toAgentId
eventType / latencyMs / tokenInput / tokenOutput / costUsd / errorCode
```

**禁止**使用 `console.log()` 打普通日志，必须使用结构化 logger。

### 8.2 模型调用必须记录到 `model_call_logs`

每次 `VercelAIModelClient` 调用成功或失败后，同步写入：
- `modelAlias / provider / actualModel`
- `inputTokens / outputTokens / estimatedCostUsd`
- `latencyMs / finishReason / errorCode / retryCount`

### 8.3 关键 ID 贯穿规则

| ID | 必须出现在 |
|---|---|
| `traceId` | HTTP 请求头、Run、Step、Model 调用、A2A、所有事件、所有日志 |
| `runId` | RunStore、AgentEvent、Artifact、SSE 事件、所有日志 |
| `stepId` | StepStore、Event、Error、Trace |
| `agentId` | Run、Step、Event、ModelCall |

---

## 9. 环境变量

```env
# 运行环境
NODE_ENV=development
PORT=3000

# 模型 Provider
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=

# 数据库
DATABASE_URL=mysql://user:pass@localhost:3306/agent_frame

# 跨域
WEB_ORIGIN=http://localhost:5173
API_BASE_URL=http://localhost:3000

# Run 控制
MAX_CONCURRENT_RUNS=5
RUN_TIMEOUT_MS=120000

# A2A 控制
MAX_AGENT_CALLS_PER_RUN=8
MAX_A2A_DEPTH=3
DEFAULT_A2A_TIMEOUT_MS=30000

# 可选（后置）
REDIS_URL=
```

---

## 10. 分阶段实现 Checklist

> 按此顺序实现，保证每个阶段都能端到端跑通。

### 阶段 0：工程初始化（Day 1）

- [ ] 初始化 Monorepo：`bun init`，配置 `workspaces`
- [ ] 创建 `apps/web`（Vite + React + TypeScript）
- [ ] 创建 `apps/api`（Bun + Elysia）
- [ ] 创建 `packages/shared`（纯 TypeScript 包）
- [ ] 配置路径别名 `@shared/*`、`@api/*`
- [ ] 配置根 `tsconfig.json`（`composite: true`，项目引用）
- [ ] 创建 `.env.example`，配置必要变量
- [ ] `bun run dev` 前后端能同时启动

### 阶段 1：共享类型和事件协议（Day 1~2）

- [ ] `packages/shared/events/agent-event.ts`：`AgentEvent` 联合类型
- [ ] `packages/shared/events/a2a-event.ts`：`A2AEvent`
- [ ] `packages/shared/events/artifact-event.ts`：`ArtifactEvent`
- [ ] `packages/shared/models/run.ts`：`Run`、`RunStatus`、`Step`
- [ ] `packages/shared/models/artifact.ts`：`Artifact`、`ArtifactVersion`、`ArtifactRef`
- [ ] `packages/shared/a2a/`：`A2ARequest`、`A2AResponse`、`A2ACallMode`、`AgentCapability`
- [ ] `packages/shared/models/agent.ts`：`AgentInput<T>`、`AgentOutput<T>`
- [ ] `packages/shared/constants/event-types.ts`：所有事件类型字面量
- [ ] 验证：`packages/shared` 可作为包被 `apps/api` 和 `apps/web` 引用

### 阶段 2：后端基础设施（Day 2~3）

- [ ] `shared/config/env.ts`：读取和校验必要环境变量
- [ ] `shared/db/client.ts`：Drizzle ORM MySQL 连接
- [ ] `shared/db/schema.ts`：`runs`、`steps`、`run_events`、`artifacts`、`artifact_versions`、`model_call_logs` 表定义
- [ ] 执行 migration，验证表结构
- [ ] `shared/errors/app-error.ts`：`AppError` 类和 `AppErrorCode`
- [ ] `shared/observability/logger.ts`：结构化日志（pino 或 consola）
- [ ] `shared/utils/id.ts`：ULID/UUID 生成工具
- [ ] `server.ts` 和 `app.ts`：Elysia 启动，注册错误中间件、日志中间件
- [ ] 验证：`POST /health` 返回 `{ ok: true }`

### 阶段 3：Runtime 层（Day 3~4）

- [ ] `runtime/stores/run-store.ts`：`RunStore` 接口
- [ ] `runtime/stores/memory-run-store.ts`：内存实现
- [ ] `runtime/stores/mysql-run-store.ts`：MySQL 实现（包括 `createRun`、`getRun`、`updateRunStatus`、`appendEvent`）
- [ ] `runtime/event-emitter.ts`：进程内事件总线
- [ ] `runtime/cancellation.ts`：`AbortController` 管理
- [ ] `runtime/step-manager.ts`：创建/更新 Step
- [ ] `runtime/run-manager.ts`：`createRun()`、`cancelRun()`、`getRunContext()` 实现
- [ ] 验证：单元测试 `RunManager` 创建 Run，验证状态流转和事件发布

### 阶段 4：`POST /runs` 和 SSE（Day 4~5）

- [ ] `features/runs/runs.schema.ts`：请求/响应 Elysia schema
- [ ] `features/runs/runs.service.ts`：调用 `RunManager.createRun()`
- [ ] `features/runs/runs.route.ts`：`POST /runs`、`GET /runs/:runId`、`DELETE /runs/:runId`
- [ ] `shared/realtime/sse.handler.ts`：SSE 流封装
- [ ] `features/runs/runs.route.ts`：`GET /runs/:runId/events` 接入 SSE
- [ ] 验证：`POST /runs` 返回 `runId`，`GET /runs/:runId/events` 能收到 `run.started`

### 阶段 5：ModelClient 和第一个 Agent（Day 5~6）

- [ ] `ai/model-client/model-client.types.ts`：`GenerateInput`、`GenerateOutput`、`StreamInput`、`ModelStreamEvent`、`TokenUsage`、`ModelError`
- [ ] `ai/model-client/model-client.ts`：`ModelClient` 接口
- [ ] `ai/providers.ts`：OpenAI/Anthropic Provider 初始化（仅在 `ai/` 层使用）
- [ ] `ai/models.ts`：模型别名映射（`creative.medium` -> `openai('gpt-4.1-mini')`）
- [ ] `ai/model-client/vercel-ai-model-client.ts`：实现 `generate()`、`stream()`、`generateObject()`
- [ ] `ai/agents/worker.agent.ts`：第一个专业 Agent，调用 `ModelClient.stream()`，发出 `message.delta`
- [ ] 验证：工具测试直接调用 `WorkerAgent.execute()`，能收到流式输出事件

### 阶段 6：A2A 同步调用（Day 6~7）

- [ ] `a2a/a2a-protocol.ts`：`A2ARequest`、`A2AResponse`、`A2AError` 类型（复用 shared 包）
- [ ] `a2a/a2a-policy.ts`：`A2APolicy`，默认规则从环境变量读取
- [ ] `a2a/local-agent-adapter.ts`：将 Agent 定义适配为 A2A 调用
- [ ] `a2a/a2a-router.ts`：根据 `toAgentId` 路由到本地 Agent
- [ ] `a2a/a2a-client.ts`：`LocalA2AClient.callSync()` 实现（含 Policy 检查、事件发布、Step 记录）
- [ ] `ai/agents/supervisor.agent.ts`：调用 `A2AClient.callSync()` 调用 WorkerAgent
- [ ] `runtime/run-manager.ts`：`createRun()` 后调用 SupervisorAgent
- [ ] 验证：`POST /runs` -> SSE 能收到 `agent.call.started`、`agent.call.completed`、`run.completed`

### 阶段 7：前端 RunTimeline（Day 7~8）

- [ ] `lib/sse.ts`：SSE 客户端封装（`useSSE` Hook 或工具函数）
- [ ] `lib/http.ts`：`fetch` 封装
- [ ] `features/runs/useRunEvents.ts`：订阅 SSE，维护本地事件列表
- [ ] `features/runs/AgentEventCard.tsx`：单个事件渲染（区分不同 type）
- [ ] `features/runs/RunTimeline.tsx`：按时间排列事件列表
- [ ] `features/chat/MessageInput.tsx` + `ChatPage.tsx`：提交输入 -> `POST /runs` -> 订阅 SSE
- [ ] 验证：浏览器发送任务，能看到完整的 RunTimeline（started -> agent call -> completed）

### 阶段 8：MySQL RunStore 完整实现（Day 8~9）

- [ ] 完善 `mysql-run-store.ts`：所有接口方法（含 `appendEvent`、`listEvents`）
- [ ] `RunManager` 切换为 `MySQLRunStore`
- [ ] 验证：重启服务后，查询历史 Run 状态和事件正确
- [ ] 验证：`GET /runs/:runId` 返回正确状态
- [ ] 验证：`GET /runs/:runId/events` 可回放历史事件（对已完成 Run）

### 阶段 9：Artifact 基础实现（Day 9~10）

- [ ] `artifacts/artifact.types.ts`：类型定义
- [ ] `artifacts/artifact-store.ts`：`ArtifactStore` 接口
- [ ] `artifacts/artifact-store.mysql.ts`：MySQL 实现（`create`、`createVersion`、`getById`）
- [ ] `artifacts/artifact-events.ts`：事件构造函数
- [ ] `ai/agents/worker.agent.ts`：生成结构化输出后，写入 Artifact
- [ ] `features/artifacts/artifacts.route.ts`：`GET /artifacts/:id`、`GET /runs/:runId/artifacts`
- [ ] `features/runs/ArtifactPreview.tsx`：前端展示 Artifact 内容
- [ ] 验证：Agent 产出的 Artifact 可查询，前端能渲染

### 阶段 10：基础 Policy 和集成测试（Day 10~12）

- [ ] 补全 `A2APolicy` 白名单配置（从配置文件或代码注册）
- [ ] 测试：非白名单 Agent 调用被拒绝，返回 `AGENT_CALL_DENIED`
- [ ] 测试：超过最大调用深度时，返回正确错误
- [ ] 测试：Agent 调用超时时，emit `agent.call.failed`
- [ ] `tests/integration/runs.integration.test.ts`
- [ ] `tests/integration/a2a.integration.test.ts`
- [ ] `tests/integration/artifacts.integration.test.ts`
- [ ] 验证：所有集成测试通过

---

## 11. 开发注意事项（常见误区防范）

| 误区 | 正确做法 |
|---|---|
| `route.ts` 里直接调用 Agent | route 只做入口，调用链：route -> service -> RunManager -> Agent |
| Agent 间直接 `import` 调用 | 必须走 `A2AClient.callSync()`，不能 `import workerAgent` |
| 直接把 Agent 伪装成 Tool | Tool = 确定性函数；Agent = 有身份/状态/Prompt 的执行单元 |
| `import { generateText } from 'ai'` 出现在 Agent/Runtime | 只允许在 `ai/model-client/vercel-ai-model-client.ts` 里出现 |
| 所有输出都塞进 message | 聊天文本放 `message.delta`，结构化结果放 `Artifact` |
| Memory 随意写入 | MVP 阶段先不做自动 Memory 写入，保留接口即可 |
| 前端自己定义事件类型 | 前端必须从 `packages/shared` 引用 `AgentEvent` 类型 |
| 一开始上完整 Workflow | MVP 只保留类型和接口，`workflow-runner.ts` 暂不实现 |
| `console.log()` 打日志 | 使用结构化 logger，必须带 `traceId`、`runId` 等 ID |
| 事务外推 SSE 事件 | 先提交 MySQL 事务，再 emit 事件推送前端 |

---

## 12. MVP 验收标准

完成以下所有验收项，MVP 即为通过：

| # | 验收项 | 验证方式 |
|---|---|---|
| 1 | `POST /runs` 能创建 run 并返回 `runId` | API 测试 |
| 2 | `GET /runs/:runId/events` SSE 能实时收到事件 | 浏览器 / `curl` 订阅 |
| 3 | 至少 1 个 SupervisorAgent + 2 个专业 Agent 注册 | `GET /agents` 返回列表 |
| 4 | SupervisorAgent 能通过 A2AClient 调用专业 Agent | 端到端 Run 测试 |
| 5 | 非白名单 A2A 调用被拒绝 | 单元/集成测试 |
| 6 | Agent 调用超时产生失败事件 | 集成测试（mock 超时） |
| 7 | A2A 调用深度超限被拒绝 | 集成测试 |
| 8 | run、step、agent.call 都有 started/completed/failed 事件 | 事件日志检查 |
| 9 | Agent 输出可保存为 Artifact，并可通过 API 查询 | `GET /artifacts/:id` |
| 10 | 前端 RunTimeline 展示完整执行过程 | 浏览器手动验证 |
| 11 | 失败时能定位 `runId`、`stepId`、`agentId`、`errorCode` | 日志检查 |
| 12 | 所有集成测试通过 | CI 绿 |

---

## 13. 开放问题（供确认）

> [!IMPORTANT]
> 以下问题影响具体实现选型，请确认后再开始相关模块开发。

1. **ORM 选型**：推荐 Drizzle ORM（轻量，类型安全，支持 MySQL）或 Prisma？Drizzle 与 Bun 兼容性更好。

2. **前端状态管理**：推荐 Zustand（轻量）还是 Jotai？或者暂时用 React `useState`/`useReducer`？

3. **模型 Provider 优先级**：MVP 阶段先只接 OpenAI，还是同时支持 OpenAI + Anthropic？

4. **Auth 方式**：MVP 是否需要真实鉴权？还是先用固定 userId（开发 mock）？

5. **示例专业 Agent**：推荐实现 2 个示例专业 Agent：`research-agent`（搜索/知识检索）和 `summary-agent`（总结归纳）。是否有其他业务更相关的示例 Agent？

6. **部署环境**：MVP 是否有容器化（Docker）要求？还是本地 `bun run dev` 验证即可？

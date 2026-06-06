# 结论

文档里列的 3 个问题**都是真问题**，但我不认为它们全部都是“框架层面最致命”的前三名。

我的判断是：

| 文档问题                        | 是否致命 | 我的判断                               |
| --------------------------- | ---: | ---------------------------------- |
| 入口分裂，通用聊天无法稳定触发专业能力         |   中高 | **对产品体验致命，但对框架生产化不是最致命**           |
| 同步链路中嵌套 LLM Tool，超时与可观测性风险高 |    高 | **是致命问题，但本质应上升为“缺少可恢复 Tool 执行契约”** |
| 会话上下文缺少结构化业务状态，多轮改牌谱漂移      |    高 | **是致命问题，判断准确**                     |

我认为当前更准确的“最致命 3 个问题”应该是：

1. **缺少可恢复、可重试、可幂等的 Tool / Step 执行契约**
2. **结构化业务状态不足，Artifact 还没有真正成为可编辑状态源**
3. **缺少 Run 级端到端测试与 LLM 业务评测体系**

文档中的“入口分裂”更像是**产品入口和能力发现问题**，重要，但在 MVP 阶段不是最致命的框架问题。因为当前已经有 `nl-to-hand-agent`、Tool Bridge、`hand_history` Artifact、前端牌谱模式，用户只要选对模式，链路理论上是可运行的。文档也明确说明当前项目已经从“业务工具未接线”推进到“专用 Agent + Tool Bridge + Artifact + 前端牌谱模式”的可运行形态。

---

# 当前阶段判断

当前项目处于：**MVP 已打通，正在向生产准备阶段过渡**。

原因是文档中已有这些能力：

* `RunManager` 管理 Run 生命周期；
* `AgentExecutorRouter` 按 `agentId` 分发；
* `ModelClient` 已支持 tools / maxSteps / stream tool events；
* `ToolRegistry` 已桥接 `nl_to_hand`；
* Artifact 已支持 Memory / MySQL 存储和版本；
* 前端已有通用聊天和牌谱生成模式；
* 前端也有 `nl_to_hand` 工具事件和 `hand_history` 面板。

所以现在的问题不是“能不能接通”，而是：

```txt
可演示链路
  → 稳定可恢复链路
  → 可多轮编辑链路
  → 可评测、可回归、可上线链路
```

---

# 一、文档里的 3 个“最致命问题”是否准确？

## 问题 1：入口分裂

### 我的判断

**不是框架层面最致命问题，但确实是产品体验层面的高优先级问题。**

文档说当前前端通过模式切换决定 `agentId`：通用聊天进 `supervisor-agent`，牌谱生成进 `nl-to-hand-agent`。如果用户在通用聊天里输入牌局描述，默认不会自动进入牌谱链路。这个判断是成立的。

但它不是我心中“框架最致命”的原因是：

1. **显式模式选择在 MVP 阶段是可接受的**
   牌谱生成本身是高结构化任务，让用户进入“牌谱模式”并不一定坏，反而可以降低误触发。

2. **自动路由不是免费能力**
   如果过早让 Supervisor 自动识别所有能力，会引入误判、Agent 膨胀、Prompt 污染和调试困难。

3. **真正阻断生产的是执行可靠性，不是入口选择**
   用户选错模式是体验问题；但如果 Run 执行中断、Tool 重试不幂等、Artifact 状态不一致，那是生产稳定性问题。

### 结论

入口统一要做，但不应该排在“框架最致命问题”第一位。

---

## 问题 2：同步链路中嵌套 LLM Tool

### 我的判断

**是致命问题，但文档描述得还不够底层。**

文档指出当前链路是：

```txt
外层 LLM stream
  → 调用 nl_to_hand tool
  → tool 内部 schema / autofix / simulateHand
  → 失败时 tool 内部再调用内层 LLM 修复
  → 外层 LLM 继续输出
```

并指出风险包括用户看到卡住、SSE 可能超时、内层修复失败后外层模型仍可能生成不可靠文本。这个判断非常准确。

但我会把这个问题重新定义为：

> 当前缺少一个可恢复、可重试、可观测、可幂等的 Tool Invocation 执行契约。

也就是说，问题不是“同步”本身，而是：

| 缺口                        | 后果               |
| ------------------------- | ---------------- |
| Tool 内部阶段没有持久化状态          | 中断后不知道执行到哪       |
| 内层 LLM 修复不是独立 Step        | Trace 粒度不够       |
| Tool 调用缺少 idempotency key | 重试可能重复写 Artifact |
| SSE 连接和后端任务生命周期耦合         | 前端断开可能影响感知       |
| 失败状态没有统一协议                | 外层模型可能继续幻觉输出     |

### 结论

这个问题应该保留在前三，但应该升级为“执行可靠性问题”，而不是只看成“同步超时问题”。

---

## 问题 3：会话上下文缺少结构化业务状态

### 我的判断

**这是最致命问题之一，文档判断准确。**

文档指出当前 `ConversationContextBuilder` 主要加载用户 / 助手最终文本，不加载 tool 输出，不加载 event JSON，Artifact 只放引用和短摘要。对于普通聊天这是合理的，但对牌谱编辑不够。用户后续说“把 flop 改成 Ac7d2s”时，系统需要上一轮完整 `game_hand`，否则容易重新推断、丢字段、改错座位或生成新牌谱。

这个问题非常关键，因为自然语言转牌谱不是一次性问答，而是：

```txt
结构化对象生成
  → 校验
  → 修正
  → 版本化
  → 多轮编辑
  → 再校验
```

如果没有结构化状态，系统会退化成“每轮重新猜一次 JSON”。

### 结论

这个问题必须保留在前三，而且优先级应该高于“入口分裂”。

---

# 二、我认为真正最致命的 3 个问题

## 致命问题 1：缺少可恢复、可重试、可幂等的 Tool / Step 执行契约

### 为什么这是第一致命问题

Agent 后端不是普通 HTTP 请求。一次 Run 里可能包含：

```txt
模型调用
  → Tool 调用
  → 确定性校验
  → 内层 LLM 修复
  → Artifact 写入
  → 前端事件推送
```

只要其中任意阶段失败，就会出现这些问题：

| 场景                 | 当前风险                  |
| ------------------ | --------------------- |
| SSE 中断             | 前端不知道后端是否还在跑          |
| Tool 超时            | Run 可能卡在中间状态          |
| 用户重试               | 可能重复调用模型、重复写 Artifact |
| 内层修复失败             | 外层模型可能继续输出不可信结果       |
| Artifact 写入成功但事件失败 | 前端状态和后端状态不一致          |

文档已经提到 `MAX_INTERNAL_ROUNDS = 1` 是为了避免 SSE 超时或卡死，这其实说明当前系统已经在用“限制轮次”规避架构问题，而不是从执行模型上解决。

### 更好的优化建议

不要只做 `tool.progress` 事件。应该引入**持久化 ToolInvocation 执行模型**。

建议最小数据结构：

```ts
type ToolInvocationStatus =
  | 'pending'
  | 'running'
  | 'waiting_repair'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'

type ToolInvocation = {
  id: string
  runId: string
  stepId: string
  toolName: string
  idempotencyKey: string

  status: ToolInvocationStatus
  phase:
    | 'pre_parse_autofix'
    | 'schema_validate'
    | 'simulate_hand'
    | 'inner_repair'
    | 'artifact_write'

  inputHash: string
  inputPreview: unknown
  outputRef?: string
  errorCode?: string
  errorMessage?: string

  startedAt?: Date
  heartbeatAt?: Date
  finishedAt?: Date
  retryCount: number
}
```

执行模型：

```txt
RunManager
  → StepManager.create("tool_call")
  → ToolInvocation.create(idempotencyKey)
  → phase: schema_validate
  → phase: simulate_hand
  → failed? create repair task
  → success? write Artifact
  → mark invocation succeeded
```

关键原则：

* **事件是投影，不是状态源**
  `AgentEvent` 可以给前端展示，但真正恢复要靠 `RunStep / ToolInvocation / ArtifactVersion`。

* **Artifact 写入必须幂等**
  同一个 `toolInvocationId` 不应该重复创建多个最终版本。

* **内层修复应成为子 Step 或异步 Task**
  不要藏在普通 Tool 函数内部。

---

## 致命问题 2：Artifact 还没有真正成为业务状态源

### 为什么这是第二致命问题

文档已经说 `hand_history` 不应该只是完成后展示的 Markdown 附件，而应该成为后续多轮编辑的状态锚点。这个方向是对的。

但当前设计还差一步：**Artifact 只是存了结果，不等于它已经成为“可编辑状态源”。**

真正的业务状态源需要支持：

| 能力                   | 当前缺口                         |
| -------------------- | ---------------------------- |
| 明确当前 active artifact | 用户下一轮修改时不知道基于哪个版本            |
| Patch 模式             | 用户说“改 turn”时不应该重建整手牌         |
| 版本冲突控制               | 多次编辑要知道基于哪个 version          |
| Draft 状态             | 校验失败也要能继续修                   |
| Provenance           | 要知道字段来自用户、LLM、autofix 还是内层修复 |
| Validation snapshot  | 每个版本要绑定当时的校验结果               |

### 更好的优化建议

新增 `hand_history` 的编辑协议，而不是只把完整 JSON 塞进 prompt。

建议设计三种操作：

```ts
type HandHistoryCommand =
  | {
      type: 'create_from_nl'
      rawText: string
    }
  | {
      type: 'patch_from_nl'
      artifactId: string
      baseVersionId: string
      patchText: string
    }
  | {
      type: 'replace_json'
      artifactId: string
      baseVersionId: string
      gameHand: unknown
    }
```

多轮修改流程：

```txt
用户：把 turn 改成 9h
  → 前端携带 activeHandHistoryArtifactId
  → 后端加载 baseVersion.gameHand
  → LLM 只生成 patch
  → applyPatch(baseGameHand, patch)
  → simulateHand(newGameHand)
  → 创建新 ArtifactVersion
```

推荐 Patch Schema：

```ts
type HandHistoryPatch = {
  baseArtifactId: string
  baseVersionId: string
  operations: Array<{
    op: 'set' | 'append' | 'remove' | 'replace'
    path: string
    value?: unknown
    reason?: string
  }>
}
```

不要让 LLM 每次重新生成完整 `game_hand`。完整重生成适合首轮，后续编辑应该优先走 patch。

---

## 致命问题 3：缺少 Run 级端到端测试与 LLM 业务评测体系

### 为什么我把它提升到前三

文档把测试补齐放在优化路线的第四项，提到已有 `autofix_pipeline`、`hand_validator`、`tool-bridge` 等测试，但还缺完整端到端测试。

我认为这应该升到“最致命问题”前三。

原因是自然语言转牌谱不是普通 CRUD，也不是纯确定性函数。它的质量由多个环节共同决定：

```txt
Prompt
  → 外层 LLM 构造 game_hand
  → Tool Schema
  → autofix
  → simulateHand
  → 内层修复
  → Artifact
  → 前端展示
```

只测 `hand_validator` 是不够的。因为真正上线会坏在这些地方：

| 可能出错点                | 单元测试是否能覆盖 |
| -------------------- | --------- |
| 外层模型不调用 tool         | 很难        |
| 调用了 tool 但参数结构偏移     | 部分        |
| Tool 成功但 Artifact 写错 | 需要集成测试    |
| 失败时没有追问用户            | 需要端到端测试   |
| Prompt 改动导致成功率下降     | 需要评测集     |
| 模型升级导致 JSON 结构漂移     | 需要回归评测    |

### 更好的优化建议

建立三层测试体系。

#### 第一层：确定性单元测试

已有的继续保留：

```txt
hand_validator.test.ts
autofix_pipeline.test.ts
tool-bridge.test.ts
```

#### 第二层：Run 级集成测试

用 FakeModelClient 模拟模型流事件：

```ts
test('nl-to-hand run creates valid hand_history artifact', async () => {
  const run = await createRun({
    agentId: 'nl-to-hand-agent',
    input: {
      message: '6人桌，盲注1/2，Hero UTG AhAs open到6，后面都弃牌'
    }
  })

  expect(run.events).toContainEvent('TOOL_CALL', { toolName: 'nl_to_hand' })
  expect(run.events).toContainEvent('TOOL_RESULT', { status: 'success' })
  expect(run.artifacts[0].type).toBe('hand_history')
  expect(run.artifacts[0].content.validation.status).toBe('valid')
})
```

#### 第三层：LLM 业务评测集

建立 `evals/nl_to_hand/golden_cases.jsonl`：

```json
{
  "id": "preflop_open_fold_6max_001",
  "input": "6人桌，1/2，Hero UTG AhAs open到6，后面都弃牌",
  "expected": {
    "players": 6,
    "heroCards": ["Ah", "As"],
    "mustBeValid": true,
    "streets": ["preflop"]
  }
}
```

评测指标：

| 指标                        | 目标                |
| ------------------------- | ----------------- |
| tool_call_rate            | 应接近 100%          |
| schema_parse_success_rate | 初期 > 80%，后续 > 95% |
| validation_success_rate   | 初期 > 70%，后续 > 90% |
| correction_success_rate   | 衡量内层修复            |
| ask_user_precision        | 缺信息时是否追问          |
| artifact_success_rate     | 成功 / draft 是否正确落库 |
| avg_latency               | 防止修复链路过慢          |
| token_cost_per_valid_hand | 成本控制              |

---

# 三、对文档优化建议的判断

## 1. “入口统一”建议是否合理？

### 判断

**方向合理，但短期方案不够稳。**

文档建议短期在 `SupervisorAgent` 规划阶段加入 `needsHandHistory` 分支，识别到扑克关键词后通过 A2A 调用 `nl-to-hand-agent`。这个方案能快速做，但我不建议把它作为长期方向。

### 不够合理的原因

| 问题               | 说明                                |
| ---------------- | --------------------------------- |
| 关键词识别容易误判        | “turn”“river”“hand” 在英文上下文里不一定是扑克 |
| Supervisor 会继续膨胀 | 每加一个专业能力都要改 Supervisor            |
| A2A 转发增加链路复杂度    | 本来可以直接 route，却变成 Agent 调 Agent    |
| 责任边界混乱           | Supervisor 同时做聊天、意图识别、能力路由、结果整合   |

### 更好的建议

新增独立的 `CapabilityRouter`，放在 `RunManager` 和 `AgentExecutorRouter` 之间，或作为 `runs.service` 的预处理。

```txt
POST /runs
  → CapabilityRouter.resolve(input, session)
  → agentId / workflowId / clarification
  → AgentExecutorRouter.execute()
```

示例：

```ts
type CapabilityRouteResult =
  | {
      type: 'agent'
      agentId: 'nl-to-hand-agent' | 'supervisor-agent'
      confidence: number
      reason: string
    }
  | {
      type: 'ask_clarification'
      question: string
    }
```

短期策略：

```txt
用户显式选择牌谱模式
  → 直接 nl-to-hand-agent

用户在通用聊天输入明显牌局
  → CapabilityRouter 高置信路由到 nl-to-hand-agent

低置信
  → 回复确认：“你是想把这手牌转成标准牌谱吗？”
```

这样比把逻辑塞进 `SupervisorAgent` 更干净。

---

## 2. “Tool 执行拆阶段”建议是否合理？

### 判断

**方向正确，但只做事件不够。**

文档建议把 Tool 内部阶段事件化，例如 `pre_parse_autofix`、`schema_validate`、`simulate_hand`、`inner_repair`。这对前端 Timeline 和耗时分析有价值。

### 不够合理的地方

事件化只能解决“看得见”，不能解决“恢复得了”。

如果只发事件，但没有持久化执行状态，系统依然不知道：

* 当前 Tool 是否还能继续；
* 哪一步失败；
* 能不能安全重试；
* 重试会不会重复写 Artifact；
* 前端断开后任务是否还应该继续。

### 更好的建议

把 `tool.progress` 设计成 `ToolInvocation.phase` 的状态变更。

```txt
ToolInvocation.status = running
ToolInvocation.phase = schema_validate
emit tool.progress

ToolInvocation.phase = simulate_hand
emit tool.progress

ToolInvocation.status = waiting_repair
create AgentTask
emit tool.waiting
```

也就是说：

```txt
状态先持久化
事件再广播
```

不要反过来。

---

## 3. “Artifact 从展示产物升级为业务状态”建议是否合理？

### 判断

**非常合理，是文档里最有价值的优化建议之一。**

文档建议 `hand_history` 不应只是 Markdown 附件，而应该成为后续多轮编辑的状态锚点，包括成功写新版本、draft 失败保留候选和错误路径、基于 ArtifactVersion 生成 patch。这个方向完全正确。

### 需要补强的地方

当前建议还需要加 4 个约束：

1. **必须有 active artifact 机制**
   Session 里要知道当前正在编辑哪个 `hand_history`。

2. **必须有 baseVersionId**
   Patch 必须声明基于哪个版本，避免并发编辑覆盖。

3. **必须有字段来源 provenance**
   区分字段来自用户原文、LLM 推断、autofix、内层修复。

4. **必须有 draft / valid 状态机**
   不合法牌谱也要能保存为 draft，方便继续修。

推荐状态机：

```txt
draft
  → validating
  → valid
  → invalid_needs_user_input
  → patched
  → archived
```

---

## 4. “测试补齐”建议是否合理？

### 判断

**合理，但优先级被低估。**

文档把测试补齐放在 4.4，我建议提升到 P0 / P1。因为 LLM 系统没有评测，任何 Prompt、模型、Schema、autofix 改动都可能悄悄破坏链路。

更好的测试路线：

```txt
P0: FakeModelClient 的 Run 级集成测试
P1: golden cases 业务评测集
P2: 真实模型 nightly eval
P3: 线上 trace 抽样回放
```

---

# 四、我建议的最终优化路线

## P0：先补生产可靠性，不急着做大 Router

```txt
1. ToolInvocation 持久化
2. Tool phase 状态机
3. idempotencyKey
4. Artifact 写入幂等
5. Run 级集成测试
```

原因：这些是稳定性的地基。

---

## P1：把 hand_history 做成真正业务状态

```txt
1. Session.activeHandHistoryArtifactId
2. ArtifactVersion baseVersionId
3. patch_from_nl 命令
4. draft / valid 状态机
5. HandHistoryPanel 支持“继续修改”
```

原因：自然语言转牌谱的核心价值不是一次生成，而是多轮修正出合法牌谱。

---

## P2：做能力路由，但不要塞进 Supervisor

```txt
1. CapabilityRouter.resolve()
2. 显式模式优先
3. 高置信自动路由
4. 低置信询问确认
5. 后续再接插件能力发现
```

原因：入口统一重要，但不要用 SupervisorAgent 承担所有能力分发。

---

## P3：再做异步修复 Worker

```txt
1. baseline 校验失败后判断是否需要异步修复
2. 快速返回 draft Artifact
3. AgentTaskWorker 执行 inner_repair
4. 完成后写新 ArtifactVersion
5. 通过 SSE / WebSocket 推送更新
```

原因：不是所有修复都要异步。简单牌局同步返回体验更好，复杂修复才异步化。

---

# 最终排序建议

| 排名 | 我认为的致命问题                            | 是否在原文中        | 处理优先级   |
| -: | ----------------------------------- | ------------- | ------- |
|  1 | 缺少可恢复、可重试、可幂等的 Tool / Step 执行契约     | 原文问题 2 的升级版   | P0      |
|  2 | Artifact 尚未成为结构化业务状态源，多轮 patch 能力不足 | 原文问题 3        | P0      |
|  3 | 缺少 Run 级 E2E 测试与 LLM 业务评测体系         | 原文 4.4 但未列入前三 | P0 / P1 |
|  4 | 通用入口无法自动触发专业能力                      | 原文问题 1        | P1      |
|  5 | Tool 内部阶段可观测性不足                     | 原文问题 2 的一部分   | P1      |

---

# 最终建议

文档整体判断方向是对的，但“最致命问题”的排序更偏**产品入口体验**，而不是**生产级 Agent 后端稳定性**。

我建议把当前优化重心从：

```txt
入口统一
  → Tool 拆阶段
  → Artifact 状态化
```

调整为：

```txt
执行可靠性
  → Artifact 状态化
  → E2E / Eval 质量门禁
  → 能力路由
```

这样更符合当前阶段：链路已经能跑，下一步最重要的是让它**可恢复、可验证、可持续迭代**。

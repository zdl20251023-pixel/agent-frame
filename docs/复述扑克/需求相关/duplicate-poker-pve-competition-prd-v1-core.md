# 同题竞技：复式德州扑克 PvE 比赛活动

围绕「后台配置 15 手牌局包、用户随机打 10 手、每手复式计分、活动中暂定排名、截止后最终排名、后台逐手逐决策点统计」设计的一份可评审、可落地、可打印的产品需求文档。

## 文档信息

- **版本**：v1.0 HTML 评审稿

- **日期**：2026-06-24

- **适用端**：App / Web / 管理后台

- **优先级**：P0 投资人需求专项

- **文档定位**：核心需求 + 数据/算法口径（已移除界面展示部分）

## 核心要点

- **第一目标**：让 PvE 也具备公平排名竞争感

- **关键配置**：牌局包 15 手，用户抽 10 手

- **关键反馈**：每手完成后立即出复式分

- **关键运营能力**：逐手、逐决策点统计学习数据

## 首版建议做「异步 PvE 同题竞技」，不是一开始做完整实时复式赛

每个用户独立进入 PvE 牌桌，系统从同一个活动牌局包中为用户分配一组可比较的手牌。用户在相同 hand_id 下扮演相同 Hero 位置、面对相同 AI 版本和相同初始条件；每手结束后按同题用户的相对表现给 0-100 复式分，活动截止后冻结最终排名。

- **1. 牌局包与活动分离**：牌局包是素材库，活动是一次比赛配置。一个 15 手牌局包可以复用于不同活动；活动决定打几手、哪些必选、是否随机、计分和复盘策略。

- **2. 用户抽 10 手必须持久化**：用户一旦 join，服务端生成并保存 hand_assignment。不能每次进入重新抽，不能依赖客户端随机。

- **3. 活动中只给暂定排名**：因为后续用户继续参与，分数和排名会变化。前台必须标记「暂定」，并展示样本量、更新时间和活动截止时间。

- **4. 后台统计按 hand_id 聚合**：虽然用户手牌顺序不同、抽到的组合不同，但计分、统计、复盘都以底层 hand_id 和 decision_node_id 为准。

> **公平性提醒：**「15 手里随机 10 手」会让不同用户面对的题目组合不同。若活动有全局主榜，必须做难度/标签平衡、每手归一化计分、最小样本量校验。更稳的 MVP 是「所有人同 10 手，只随机顺序」；如果投资人明确希望随机抽手，则建议配置 6-8 手必选 + 2-4 手按标签分层随机。

| 指标 | 含义 |
| --- | --- |
| 15 | 活动候选手牌数 hand_pack_total |
| 10 | 用户实际完成手数 play_hand_count |
| 0-100 | 每手复式得分区间 hand_score |
| T+0 | 单手结束即展示参考/暂定分 |

## 术语、角色与不可妥协的产品原则

这个功能同时是活动系统、PvE 对局系统、计分系统、教学数据系统。为了避免后续实现分裂，先统一核心概念。

### 关键术语

| 术语 | 定义 |
| --- | --- |
| 复式 PvE 活动 | 用户独立与 AI 对局，但在相同或等价手牌上和其他用户排名比较。 |
| 牌局包 Hand Pack | 活动候选手牌集合，例如 15 手，包含牌序、Hero 位置、AI 座位、盲注、栈深、标签等。 |
| 必选手 Required Hand | 每个参赛用户都必须打的手牌，用于保证活动核心考点一致。 |
| 可选池 Optional Pool | 除必选手外，用户按规则随机抽取的手牌集合。 |
| 展示顺序 Display Order | 用户实际看到并游玩的顺序。可随机，但不影响按 hand_id 计分。 |
| Raw Result | 本手净收益，建议单位 BB： ending_stack - starting_stack 。 |
| 复式得分 Hand Score | 将本手 Raw Result 与同 hand_id 的其他有效用户横向比较后的 0-100 分。 |
| Decision Node | 一次 Hero 决策点的规范化节点，用于统计正确率、动作分布、EV loss。 |

### 不可妥协原则

- **服务端权威**：发牌、隐藏牌、AI 动作、合法动作、结算与计分都以服务端为准。

- **每手独立重置**：每手从固定栈深开始，避免上一手输赢影响下一手策略空间。

- **先存分配再开局**：用户 join 时生成 hand_assignment，并持久化到 attempt，后续恢复不重新抽。

- **活动中防泄题**：不展示未来公共牌、AI 未亮手牌、其他用户完整打法和高手线。

- **暂定与最终分离**：活动期间排行榜是 current/provisional；截止结算后生成 final snapshot。

- **统计可追溯**：每个排名、每手得分、每个正确率都能回溯到 action_event 和 score_snapshot。

## 管理后台：复式比赛牌局包与活动配置

运营/教练在后台创建活动，选择一个 15 手牌局包，配置用户实际打 10 手、必选手、随机策略、计分模式、复盘开放策略和活动时间。后台发布前必须完成合法性、公平性、样本量和 AI 版本校验。

### 目标用户

- 运营：快速创建每日/每周复式挑战。

- 教练：配置特定主题手牌，例如 3bet pot、河牌 bluff catch、转牌压力。

- 管理员：审核活动公平性、发布、暂停、结算、导出数据。

### 核心需求

1. 后台可创建 **Hand Pack**，例如总计 15 手。

2. 后台可创建 **Activity**，配置每个用户实际打 **10 手**。

3. 支持设置 **必选手**，例如 H01、H04、H09、H12。必选手所有用户都会打。

4. 其余手牌从 optional pool 按策略抽取，支持纯随机和按标签/难度分层随机。

5. 支持每个用户展示顺序随机打乱，降低泄题价值。

6. 支持配置活动时间、可见范围、奖励、计分模式、复盘开放策略、排行榜可见策略。

7. 发布前后台展示校验结果：手牌合法性、AI 版本锁定、baseline 是否生成、预计每手样本量是否达标。

### 后台字段

| 字段 | 说明 | 建议 |
| --- | --- | --- |
| hand_pack_id | 选择牌局包 | 必填 |
| pack_total_hands | 候选手牌数 | 15 |
| play_hand_count | 用户实际打几手 | 10 |
| required_hand_ids | 所有用户必打 | 建议 6-8 手 |
| sampling_policy | 抽样策略 | stratified_by_tag 优先 |
| shuffle_policy | 顺序策略 | per_user_shuffle |
| scoring_mode | 计分模式 | matchpoint_v1 |
| reveal_policy | 复盘揭示策略 | competitive |

### 验收标准

- 当必选手数量大于 10 时，后台禁止发布。

- 当牌局包不足 10 手时，后台禁止发布。

- 当任一 optional hand 预计样本量低于阈值，后台给出强警告。

- 活动发布后，AI 策略版本、牌局包版本、计分模式不可直接修改；只能复制活动重新发布。

- 每次发布、暂停、取消、结算均写入 admin_audit_log。

### 核心配置模型

```text
{
 "activity_id": "act_w26_03",
 "hand_pack_id": "hp_2026_w26_a",
 "pack_total_hands": 15,
 "play_hand_count": 10,
 "required_hand_ids": ["H01", "H04", "H09", "H12"],
 "sampling_policy": "stratified_by_tag",
 "shuffle_policy": "per_user_shuffle",
 "scoring_mode": "matchpoint_v1",
 "min_human_cohort": 30,
 "ai_policy_version": "ai-nlhe-v3.2.1",
 "reveal_policy": "competitive"
}
```

### 发布前硬校验

```text
assert pack_total_hands >= play_hand_count
assert len(required_hand_ids) <= play_hand_count
assert required_hand_ids subset of hand_pack
assert all(hand.ai_policy_version == activity.ai_policy_version)
assert baseline_exists(hand_id) for every hand in hand_pack
assert no_duplicate_cards(hand.deck_order)
assert scoring_mode in allowed_modes
```

### 用户抽牌算法

```text
required = required_hand_ids
optional_pool = all_pack_hands - required
need = play_hand_count - len(required)

seed_select = sha256(activity_id + user_id + attempt_id + salt + "select")
selected_optional = sample(optional_pool, need, seed_select, sampling_policy)

seed_order = sha256(activity_id + user_id + attempt_id + salt + "order")
assigned_hands = shuffle(required + selected_optional, seed_order)

persist AttemptHandAssignment(
 attempt_id,
 hand_id,
 source = "required" | "optional",
 display_order,
 assignment_version
)
```

### 可选手预计样本量

```text
M = pack_total_hands - required_count
k = play_hand_count - required_count
P(optional hand selected) = k / M
expected_cohort_h = expected_participants * P(selected)

若 expected_cohort_h < min_human_cohort：
 后台提示「该手样本不足，统计和计分波动较大」
```

> **关键实现点：**随机不是为了让服务端每次进入都变，而是 join 时一次性分配、持久化、可审计。后续离开、刷新、换设备，都读取同一份 assignment。

## 用户参与：从 15 手中随机 10 手，并打乱顺序完成 PvE 对局

用户看到的是一个 10 手挑战，而不是后台完整 15 手牌局包。用户首次参与时，服务端为其分配 10 个 hand_id，并生成随机展示顺序。用户每完成一手，即进入本手结果页，获得净收益和复式得分。

### 入口与说明

- 首页 / 活动页展示「今日同题挑战」卡片。

- 卡片展示：活动名、10 手、预计时长、截止时间、当前参与人数、奖励或徽章。

- 首次进入说明页：本活动是同题 PvE，系统会和其他玩家比较同一手的结果。

- 说明页不应展示「牌局包共 15 手」等可能影响用户预期的后台细节；可展示「本次挑战共 10 手」。

### 开始挑战

1. 用户点击开始。

2. 服务端创建或返回唯一有效 `ParticipantAttempt`。

3. 服务端生成并保存 `AttemptHandAssignment`：10 个 hand_id + display_order。

4. 客户端拉取第 1 个 display_order 对应的可见牌局状态。

5. 用户与 AI 完成该手。

### 对局中展示

- 顶部展示第 X/10 手、活动截止时间、当前暂定分。

- 牌桌展示当前合法可见信息，不下发未来公共牌和 AI 隐藏手牌。

- 用户动作提交时带 `request_id`，服务端校验幂等。

- 任意时刻可以离开；回来时恢复到最后一个服务端确认状态。

### 单手结束页

- 必须展示本手净收益 Raw Result。

- 必须展示本手复式得分，样本不足时展示参考基线分。

- 必须展示「参考 / 暂定 / 最终」状态标签。

- 提供「下一手」「复盘本手」「暂时离开」三个动作。

### 验收标准

- 同一用户重复点击开始，不产生多个有效 attempt。

- 用户刷新页面后，10 手 assignment 不变。

- 完成一手后 2 秒内展示得分。

- 当前活动未截止时，完整隐藏牌和高手打法不开放。

### 参赛状态机

```text
not_joined
 - join -> registered
registered
 - assignment_created -> in_progress
in_progress
 - complete all 10 hands -> completed_pending_final
 - end_time reached with incomplete hands -> expired_incomplete
completed_pending_final
 - settlement done -> finalized
 - fraud review failed -> disqualified
```

### 单手状态机

```text
assigned
 - load visible state -> in_progress
in_progress
 - hero action submitted -> action_committed
 - hand finished -> result_pending
result_pending
 - score calculated -> scored
scored
 - reveal allowed -> reviewable
```

### Raw Result

```text
raw_delta_bb = (hero_ending_stack - hero_starting_stack) / big_blind

规则：
- 每手 hero_starting_stack 固定，例如 100BB
- 每手结束后下一手重新回到 100BB
- all-in、边池、平分底池按标准德扑结算
- raw_delta_bb 只代表本手结果，不带入下一手
```

### 每手复式得分：Matchpoint v1

```text
C = 同 activity_id + hand_id + hero_slot 的有效完成集合

wins_i = count(raw_i > raw_j, j in C, j != i)
ties_i = count(raw_i == raw_j, j in C, j != i)
hand_score_i = 100 * (wins_i + 0.5 * ties_i) / (|C| - 1)

样本不足：
if human_cohort_size < min_human_cohort:
 score_type = baseline_reference
else:
 score_type = human_provisional
```

### 前台展示规则

| 状态 | 展示 |
| --- | --- |
| 样本不足 | 复式得分 76.5（参考基线） |
| 活动进行中 | 复式得分 82.0（暂定） |
| 活动已结算 | 复式得分 81.4（最终） |

> **用户解释：**“同样这手牌，你比其他玩家赢得更多 / 亏得更少，因此本手得分更高。”不要在结果页直接展示复杂公式。

## 用户打完后：查看当下排名，但明确不是最终排名

用户完成 10 手后进入「完成页 + 当前排名页」。由于活动尚未截止，后续还会有用户完成，且每手相对分可能随 cohort 扩大而变化，所以必须把此处定义为 current/provisional leaderboard。

### 进入条件

- 用户完成本次活动分配的全部 10 手。

- `ParticipantAttempt.status = completed_pending_final`。

- 所有 10 个 `HandAttempt` 都已有 score_snapshot。

### 页面目标

1. 让用户立即获得完成感。

2. 告诉用户当前大概处于什么位置。

3. 清楚解释为什么不是最终排名。

4. 引导用户分享、复盘、等待最终结算或参与下一场。

### 展示内容

- 当前总分：例如 78.6，标记「暂定」。

- 当前排名：例如 126 / 1,248，标记「当前完成榜」。

- 当前超过百分比：例如超过 89% 已完成玩家。

- 每手分解：10 手的得分、净收益、样本量、是否参考基线。

- 分数说明：活动截止前，排名和暂定分可能变化。

- 榜单更新时间：例如 14:32:10。

### 榜单范围

| 榜单 | 参与对象 | 用途 |
| --- | --- | --- |
| 当前完成榜 | 已完成 10 手的用户 | 用户完成后的即时反馈 |
| 好友榜 | 好友中已完成用户 | 社交竞争 |
| 进行中榜 | 未完成用户 | 可选，不建议并入主排名 |
| 最终榜 | 截止前完成且未违规用户 | 活动结算后冻结 |

### 验收标准

- 当前排名页必须有「暂定」标签，不能使用「最终」文案。

- 展示参与样本量、榜单更新时间、距离截止时间。

- 若当前使用 baseline_reference 分，排名页必须提示“最终结算会按真人样本重算”。

- 分享卡在活动中不得包含具体牌面和隐藏信息。

### 活动总分

```text
assigned_hands_i = 用户 i 被分配的 10 个 hand_id

hand_score_i,h = score(activity_id, hand_id=h, attempt=i)
weight_h = activity_hand_weight[h] // MVP 默认 1

event_score_i = round(
 sum(weight_h * hand_score_i,h) / sum(weight_h),
 2
)
```

### 当前完成榜入榜条件

```text
attempt.status == completed_pending_final
AND completed_hand_count == play_hand_count
AND completed_at <= activity.end_time
AND fraud_status in [normal, pending_review]

排序：
1. event_score desc
2. raw_delta_total_bb desc
3. total_ev_loss_bb asc
4. completed_at asc // 仅作为低优先级 tie-breaker
```

### 为什么排名会变

```text
活动未截止时：
- 新用户完成同一 hand_id 后，会进入该手比较集合 C
- hand_score 是相对分，C 变化会导致 hand_score 轻微变化
- 用户自己的 event_score 也可能随每手 score 变化
- 因此 current_rank 不是最终排名
```

### ScoreSnapshot 字段

```text
{
 "attempt_id": "att_123",
 "hand_id": "H04",
 "raw_delta_bb": 18.5,
 "hand_score": 82.0,
 "score_type": "human_provisional",
 "cohort_size": 836,
 "formula_version": "matchpoint_v1",
 "calculated_at": "2026-06-24T14:32:10+08:00"
}
```

> **文案红线：**活动未截止前，不允许出现“最终排名”“已锁定”“保证第 X 名”等措辞。统一使用“当前排名”“暂定分”“活动截止后最终结算”。

## 比赛时间到了：最终排名结算、冻结与通知

活动到达 end_time 后，系统停止继续参赛和继续未完成手牌，进入 scoring/settlement 阶段。结算任务重新计算每个 hand_id 的最终 cohort、每手最终分、活动总分和最终榜单，并生成不可变的 final leaderboard snapshot。

### 截止行为

- 到达活动截止时间后，未 join 用户不能再参与。

- 已 join 但未完成 10 手的用户，不能继续未完成手牌。

- 已完成 10 手且 completed_at ≤ end_time 的用户进入最终结算候选。

- 可疑用户进入 pending_review；后台可在结算前确认是否剔除。

### 最终结算

1. 活动状态从 `running` 变为 `scoring`。

2. 锁定有效参赛用户集合。

3. 按 hand_id 重算所有最终 hand_score。

4. 按每个用户的 assigned_hands 聚合最终 event_score。

5. 按 tie-breaker 排序，生成 final leaderboard snapshot。

6. 活动状态变为 `finalized`。

7. 开放最终榜单、结算通知、完整复盘和后台统计最终口径。

### 最终榜单展示

- 最终排名、最终总分、超过百分比。

- 每手最终分解：hand_id、展示序号、raw_delta、hand_score、cohort_size。

- 奖励 / 徽章 / 学习权益。

- 完整复盘入口：活动结束后才展示隐藏牌和高分打法。

### 验收标准

- 最终结算任务可重复执行，但结果幂等。

- final snapshot 生成后不可被普通后台编辑覆盖。

- 任一用户最终排名可追溯到 10 个 hand_score 和原始 action_event。

- 结算失败时活动状态为 scoring_failed，后台可重试。

### 结算任务

```text
on activity.end_time:
 update activity.status = "scoring"
 eligible_attempts = attempts where:
 status == completed_pending_final
 completed_at <= end_time
 fraud_status != disqualified

 for each hand_id in hand_pack:
 cohort = hand_attempts where:
 hand_id == current hand
 attempt_id in eligible_attempts
 hand_status == scored
 recalculate final hand_score for cohort

 for each attempt in eligible_attempts:
 event_score = weighted_avg(final hand_score of assigned_hands)

 rows = sort_by(event_score desc, tie_breakers)
 create LeaderboardSnapshot(status="final")
 update activity.status = "finalized"
```

### Tie-breaker

```text
1. event_score desc
2. final_raw_delta_total_bb desc
3. total_ev_loss_bb asc
4. best_hand_score desc
5. completed_at asc
```

### 最终榜单快照

```text
{
 "leaderboard_snapshot_id": "lbs_final_001",
 "activity_id": "act_w26_03",
 "status": "final",
 "formula_version": "matchpoint_v1",
 "eligible_attempt_count": 1532,
 "generated_at": "2026-06-28T22:05:12+08:00",
 "checksum": "sha256:...",
 "rows_ref": "s3://.../leaderboard_final.json"
}
```

### 复盘开放策略

| 活动状态 | 复盘可见内容 |
| --- | --- |
| running | 只看自己的已知信息、已发生行动、本手基础反馈 |
| scoring | 榜单结算中，暂不开放隐藏信息 |
| finalized | 完整牌谱、AI 手牌、高分玩家常见线、GTO/AI 讲解 |

> **关键体验：**最终榜单不是实时查询结果，而是一个冻结快照。这样能避免用户反复刷新看到排名跳动，也便于后续申诉和审计。

## 管理后台：查看每一手牌的统计信息与决策点分析

后台不仅要看排行榜，还要把每一手变成教学资产：每个 hand_id 的选择人数、完成人数、平均分、分布、关键决策点正确率、动作分布、EV loss、不同水平用户的打法差异都要能看。

### 页面目标

- 运营判断活动质量：哪些手牌过难、过易、流失高、争议大。

- 教练沉淀内容：哪些决策点错误率高，适合做讲解或 Drill。

- 研发排查问题：AI 行为、结算、计分、复盘是否异常。

- 增长/产品分析：用户在哪里离开，哪些反馈驱动继续下一手。

### 每手概览指标

| 指标 | 含义 |
| --- | --- |
| assigned_count | 被分配到该 hand_id 的用户数。必选手应接近参与人数。 |
| started_count | 实际开始该手的用户数。 |
| completed_count | 完成该手并有结算结果的用户数。 |
| completion_rate | completed_count / started_count。 |
| avg_hand_score | 该手平均复式分，理论上接近 50，但抽样和过滤会有波动。 |
| raw_delta_distribution | 本手净收益分布，用于识别极端 cooler 或异常结算。 |
| avg_ev_loss | 用户在该手所有 Hero 决策点的平均 EV 损失。 |

### 决策点统计

- 按 `decision_node_id` 展示：街道、轮次、底池、Hero 位置、关键牌面、样本数。

- 正确率：基于 GTO/解算器/教练规则，按 EV loss 阈值判断。

- 动作分布：fold/check/call/bet/raise/all-in。

- 下注尺度分布：小注、中注、大注、超池、all-in。

- 分群对比：Top 10%、Bottom 30%、新手、老手、不同 VPIP/PFR 用户。

### 样本保护

- 节点样本数 n < 30 时，默认不展示百分比或标记低可信。

- 活动进行中，后台可看统计，但用户侧不开放会泄题的聚合分布。

- 支持导出 CSV/JSON 供教练制作课件。

### Decision Node 生成

```text
decision_node_id = hash(
 activity_id,
 hand_id,
 street,
 hero_position,
 public_cards_visible,
 action_sequence_canonical,
 pot_size_bucket,
 effective_stack_bucket,
 facing_action_type,
 facing_bet_size_bucket
)

说明：
- 只统计 Hero 实际触达的决策点
- 用户提前 fold 后，不进入后续街道节点分母
- 分支过多时按 canonical bucket 聚合
```

### 正确率定义

```text
recommended_actions = solver.get_recommended_actions(node)
user_action = normalize_action(action_event)
ev_loss_bb = max_ev(node) - ev(user_action)

is_correct = (
 user_action.action_class in recommended_actions
 AND ev_loss_bb <= threshold_bb
)

MVP threshold_bb 建议：
- preflop: 0.2BB
- postflop small pot: 0.5BB
- big pot / all-in node: 1.0BB 或按 pot% 动态阈值
```

### 节点统计

```text
reach_count = count(users reached node)
correct_count = count(is_correct)
correct_rate = correct_count / reach_count

action_distribution[action_class] = count(action_class) / reach_count
sizing_distribution[bucket] = count(size_bucket) / count(bet_or_raise)
avg_ev_loss = avg(ev_loss_bb)
p50_ev_loss, p90_ev_loss = percentile(ev_loss_bb, [50, 90])
```

### 后台查询示例

```text
GET /admin/activities/{activity_id}/hands/{hand_id}/stats
GET /admin/activities/{activity_id}/hands/{hand_id}/decision-nodes
GET /admin/activities/{activity_id}/decision-nodes/{node_id}/distribution
GET /admin/activities/{activity_id}/export?type=decision_events
```

> **不要把“正确率”做成绝对真理：**德扑存在混合策略和尺度连续性，前台可叫“推荐线匹配率 / EV 损失低于阈值比例”，后台再保留严格字段 `correct_rate`。

## 核心数据模型建议

数据模型要同时服务对局恢复、计分、榜单、复盘、后台统计和审计。下面是 MVP 建议的最小实体集合。

| 实体 | 关键字段 | 说明 |
| --- | --- | --- |
| ActivityEvent | id, name, status, start_time, end_time, scoring_mode, reveal_policy, hand_pack_id, play_hand_count | 一次复式 PvE 活动。 |
| HandPack | id, version, total_hands, ai_policy_version, checksum, baseline_cohort_id | 候选手牌素材集合，例如 15 手。 |
| HandDefinition | id, hand_pack_id, deck_order_ref, hero_slot, table_size, blinds, stack_bb, tags, difficulty | 单手牌定义。隐藏牌和牌序只在服务端可读。 |
| ActivityHandPolicy | activity_id, required_hand_ids, sampling_policy, shuffle_policy, weights_json | 活动使用牌局包的规则。 |
| ParticipantAttempt | id, activity_id, user_id, status, current_display_order, total_score, completed_at, fraud_status | 用户在某活动中的一次有效尝试。 |
| AttemptHandAssignment | attempt_id, hand_id, display_order, source, assignment_seed_ref | 用户抽到的 10 手及展示顺序。join 后不可变。 |
| HandAttempt | id, attempt_id, hand_id, status, raw_delta_bb, hand_score, score_type, started_at, completed_at | 用户打一手的实例。 |
| ActionEvent | id, hand_attempt_id, action_seq, actor, street, action_type, amount_bb, state_hash, request_id | 对局行为事件。必须幂等、可审计。 |
| GameSnapshot | id, hand_attempt_id, action_seq, visible_state_json, server_state_ref, created_at | 恢复和回顾用状态快照。 |
| ScoreSnapshot | id, activity_id, hand_id, hand_attempt_id, raw_delta_bb, score, score_type, cohort_size, formula_version | 每手得分快照。支持参考、暂定、最终。 |
| DecisionEvent | id, hand_attempt_id, decision_node_id, action_event_id, ev_loss_bb, is_correct, normalized_action | 后台统计和教学分析用。 |
| LeaderboardSnapshot | id, activity_id, status, version, generated_at, eligible_attempt_count, rows_ref, checksum | 当前榜和最终榜快照。 |

> **实现建议：**ActionEvent 与 GameSnapshot 要优先做扎实。它们不仅支撑“离开回来回顾进程”，也是所有计分争议、AI 复盘和后台统计的证据链。

## 用户端与后台接口建议

接口按“活动、参赛、对局动作、恢复、得分、排行榜、后台统计”拆分。下表是前后端评审可用的第一版接口范围。

### 用户侧 API

| API | 说明 |
| --- | --- |
| GET /activities | 活动列表，包含用户参与状态和继续入口。 |
| GET /activities/:id | 活动详情、规则、截止时间、当前参与人数。 |
| POST /activities/:id/join | 创建或返回当前有效 attempt；生成 hand assignment。 |
| GET /attempts/:id/resume | 恢复态：当前手、行动历史、进度、已完成手牌摘要。 |
| POST /hand-attempts/:id/actions | 提交动作，必须带 request_id，服务端校验合法动作。 |
| GET /hand-attempts/:id/result | 本手结果、raw_delta、hand_score、score_type、cohort_size。 |
| GET /attempts/:id/provisional-rank | 用户完成后查看当前排名。 |
| GET /activities/:id/leaderboard | 当前/最终榜单，根据活动状态返回。 |
| GET /hand-attempts/:id/replay | 复盘数据，受 reveal_policy 限制。 |

### 后台 API

| API | 说明 |
| --- | --- |
| POST /admin/hand-packs | 创建牌局包。 |
| POST /admin/hand-packs/:id/validate | 校验牌面、AI 版本、baseline、可复现性。 |
| POST /admin/activities | 创建活动草稿。 |
| PUT /admin/activities/:id/hand-policy | 配置必选手、抽样策略、打乱策略、权重。 |
| POST /admin/activities/:id/publish | 发布活动，执行硬校验。 |
| POST /admin/activities/:id/settle | 手动触发或重试最终结算。 |
| GET /admin/activities/:id/hand-stats | 每手概览统计。 |
| GET /admin/activities/:id/hands/:handId/decision-nodes | 某手所有决策点统计。 |
| GET /admin/activities/:id/audit | 参赛、计分、异常、后台操作审计。 |

## 关键异常与边界条件

这个模块最容易出问题的不是 UI，而是“随机分配、断线恢复、样本不足、计分重算、活动截止、统计口径”这些边界。

| 场景 | 处理规则 | 前台/后台表现 |
| --- | --- | --- |
| 用户 join 后立即退出 | attempt 和 assignment 已创建，回来继续第 1 手。 | 首页显示“继续挑战 0/10”。 |
| 用户动作提交后断网 | 服务端若已写 ActionEvent，重试 request_id 返回同一结果；未写则重新提交。 | 客户端以 resume 状态纠正 UI。 |
| Web 刷新 / App 被杀 | 读取最后一个 GameSnapshot 和 ActionEvent。 | 回到当前决策点或结果页。 |
| 活动截止时用户未完成 | 状态改为 expired_incomplete，不进最终主榜。 | 可看已完成手牌和说明，不能继续。 |
| 某 optional hand 样本不足 | 活动中使用 baseline_reference；最终若仍不足，后台标记低置信。 | 用户侧显示“参考分/样本较少”。 |
| AI 版本存在 bug | 已发布活动不热修；严重影响公平时取消或重赛。 | 后台记录原因，通知用户。 |
| 用户多设备同时打开 | 同一 attempt 只能有一个活动 session 提交动作；ActionEvent 以 request_id 幂等。 | 旧设备收到“状态已在其他设备更新”。 |
| 后台误改配置 | 发布后关键字段锁定；只能复制活动再发布。 | admin_audit_log 记录所有变更。 |
| 用户作弊/多账号 | fraud_status=pending_review，结算前可剔除。 | 最终榜单不展示 disqualified 用户。 |

## 总体验收标准

围绕投资人反复强调的两点“每手得分”和“任意离开后回顾进程”，再加上这次新增的后台配置、随机 10/15、当前/最终榜、后台统计，形成首版验收清单。

| 编号 | 验收项 | 通过标准 |
| --- | --- | --- |
| AC-01 | 后台配置 15/10 | 后台可选择 15 手牌局包，配置每人打 10 手，并设置必选手和抽样策略。 |
| AC-02 | 配置校验 | 必选手 > 10、牌局包不足 10、AI 版本不一致、baseline 缺失时不能发布。 |
| AC-03 | 用户随机分配 | 用户 join 后服务端生成 10 手 assignment，包含必选手和随机可选手，且刷新/恢复不变化。 |
| AC-04 | 顺序打乱 | 不同用户的 display_order 可以不同，但后台计分和统计仍按 hand_id 聚合。 |
| AC-05 | 每手得分 | 任一手完成后 2 秒内展示 raw_delta_bb 和 0-100 复式得分，并标记参考/暂定/最终。 |
| AC-06 | 任意离开恢复 | 在任意决策点、结果页、复盘页离开后，再进入可恢复活动进度、当前手牌进程和行动时间线。 |
| AC-07 | 当前排名 | 用户完成 10 手后可查看当前排名，明确标记“非最终排名”，展示样本量和更新时间。 |
| AC-08 | 最终排名 | 活动截止后系统重算并冻结 final leaderboard snapshot，用户收到最终排名和完整复盘入口。 |
| AC-09 | 后台每手统计 | 后台可查看每个 hand_id 的 assigned、started、completed、平均分、分布和流失。 |
| AC-10 | 决策点统计 | 后台可查看每个 decision_node 的正确率、动作分布、EV loss、样本数和分群对比。 |
| AC-11 | 防泄题 | 活动中用户侧不能获取未来牌面、AI 隐藏手牌、完整牌局包、其他用户完整打法。 |
| AC-12 | 审计可追溯 | 任一最终排名都能追溯到 assignment、hand_attempt、action_event、score_snapshot、leaderboard_snapshot。 |

## MVP 分期建议

为了尽快满足投资人评审，不建议首版把后台、风控、统计、教学讲解全部做满。可以按可演示、可小范围上线、可运营三个阶段推进。

- **Phase 0：演示原型**：固定 15 手牌局包；后台用配置文件；用户抽 10 手；每手 raw + baseline 分；内部榜。

- **Phase 1：MVP**：后台活动配置；必选手/随机手；每手得分；离开恢复；当前榜；最终榜。

- **Phase 2：统计后台**：每手统计、决策点正确率、动作分布、EV loss、导出和复盘素材。

- **Phase 3：运营化**：每日/周赛、好友榜、私房挑战、分享卡、徽章、风控增强。

- **Phase 4：高级复式**：多座位轮转、团队赛、IMP-like 计分、直播讲解和裁判工具。

## 审慎挑战：随机 10/15 是产品亮点，也可能是公平性坑点

这次需求中最值得提前和投资人确认的，不是 UI 长什么样，而是“用户是否必须拿到不同的 10 手”。因为只要每个人题目不同，全局排名就会被题目组合难度影响。

- **更公平方案**：所有用户打同一 10 手，只打乱顺序。这样完全同题，解释成本最低，也最符合“复式”的严格公平。

- **兼顾方案**：15 手包中 6-8 手必选，剩余 2-4 手按难度/标签分层随机。既有随机感，也能降低题目组合差异。

- **不推荐方案**：15 手纯随机抽 10 手。除非活动只做娱乐和练习，否则主榜争议会比较大，尤其样本量不足时。

- **对外表达**：用户侧不要讲复杂“复式比赛场”。建议叫“同题挑战”“策略挑战”“每日 10 手挑战”，分数页再解释相对排名。

> **建议在下次评审直接问投资人：**“你希望的是严格同题公平，还是希望每个用户从大牌局包中抽不同题目以降低泄题和提升新鲜感？”这两个目标不是完全一致的。如果目标是严格复式，随机应只用于顺序；如果目标是活动运营和防泄题，随机抽手可以做，但要接受公平性需要额外机制弥补。
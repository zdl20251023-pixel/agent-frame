# tableId 路由 Game 服调整方案

> 背景：K8s 环境下 Pod IP 动态变化，而游戏的 `tableId` 编码了建桌时的 Pod IP 并持久化至 MySQL，导致 Pod 重启后旧 `tableId` 永久失效、用户卡死。

---

## 一、现状痛点

当前 `tableId` 格式：`ipHex(8位) + portHex(4位) + "_" + snowflakeId`，例如：
```
0a2a00e80fa0_115147576394661893
└──────────┘
IP:Port 编码（建桌时 Pod IP，写入 MySQL 后永久固化）
```

问题链：
1. 复式比赛 `create_table` → 选 Game 服 → `randTableId()` 把当前 Pod IP 烧入 tableId → 写入 MySQL
2. Pod 重启 → 新 IP 分配 → 旧 IP 不再可达
3. 后续重连 / 操作 → 从 MySQL 读旧 tableId → decode 出旧 IP → RPC 超时或拒绝连接 → 用户永久卡死

**核心矛盾**：tableId 同时充当"业务持久标识"（不能变）和"物理路由地址"（因 Pod 重启而变），两者产生冲突。

---

## 方案一：K8s 基础设施层 — Service ClusterIP

**适用场景**：有 K8s 运维资源，愿意调整部署拓扑。

### 原理

K8s Service 的 ClusterIP 在 Service 对象存续期间永不改变。Pod 重启后 K8s 会自动将流量导向新 Pod，应用层对 IP 漂移零感知。

### 改造内容

**运维侧（K8s）**：
- 为每个 Game Pod 创建专属 Service（可通过 StatefulSet + Headless Service 实现每 Pod 固定 DNS，或直接创建 ClusterIP Service）
- 将 Service ClusterIP 以 `SERVICE_IP` 环境变量注入对应 Pod

**代码侧（1 行）**：

```typescript
// src/feature/game_server/session_manager.ts  L1764
// 修改前
const pod_ip: string = process.env.POD_IP || '127.0.0.1'
// 修改后
const pod_ip: string = process.env.SERVICE_IP || process.env.POD_IP || '127.0.0.1'
```

### 效果

```
建桌：tableId 编码 Service ClusterIP（稳定）
Pod 重启：ClusterIP 不变，K8s 自动导流到新 Pod
后续路由：decode tableId → ClusterIP → K8s 转发 → 新 Pod 接收 ✓
```

### 优劣

| 优点 | 缺点 |
|------|------|
| 代码改动仅 1 行 | 需要 K8s 运维配合配置 |
| tableId / 数据库无需任何变化 | ClusterIP 需要手动注入到 Pod env（K8s 不原生支持 fieldRef 获取 Service IP）|
| 从根本上解决问题，无任何 fallback 逻辑 | 强依赖 K8s 特性，本地开发需要模拟 |

---

## 方案二：业务层 — 客户端携带路由 Token

**适用场景**：不引入 K8s 改动，彻底消除每次 action 请求的 Redis 查询开销，追求更简洁的架构。

### 原理

将路由信息从「服务端存储 + 每次查询」改为「一次性下发给 Client + 后续携带」。建桌成功后，Web 服将当前 Game 服的 IP:port 打包为**服务端签名的 routeToken** 返回给 Client。Client 在每次操作请求中原样携带该 token，Web 服本地验签后直接路由，无需任何 Redis 查询。

> **核心变化**：无需维护路由表，路由职责从「服务端存储」转移到「Client 携带」；tableId 不再编码 IP，回归纯业务标识。

### tableId 格式调整

路由信息已完全转移到 routeToken，tableId 不再承担寻址职责，格式去掉 IP 前缀：

```
旧格式：0a2a00e80fa0_115147576394661893   ← IP:Port hex + snowflakeId
新格式：tableid_115147576394661893        ← "tableid_" 前缀 + snowflakeId
```

- 生成逻辑：`game_utils.ts` 中 `randTableId()` 改为 `"tableid_" + snowflakeId()`
- tableId 只作为业务主键，与任何物理 IP 完全解耦

### Redis 数据结构

只需 `game:serverList` 一张表，用于建桌和重建时选服：

| 项目 | 值 |
|------|-----|
| **Key** | `game:serverList`（固定，全局唯一）|
| **类型** | Hash（字段级 TTL，需 Redis 7.4+ `hsetex` 支持）|
| **Field** | JSON 字符串，格式：`{"ip":"10.42.0.232","port":4000}` |
| **Value** | 该 Game 服当前承载的桌子数 |
| **TTL** | 字段级 TTL = 15000ms，Game 服每 3 秒刷新一次 |
| **用途** | 仅用于建桌 / 重建时选服，不参与常规路由 |

```
game:serverList (Hash)
  field: '{"ip":"10.42.0.232","port":4000}'  →  value: "3"   TTL: 15s
  field: '{"ip":"10.42.0.150","port":4000}'  →  value: "5"   TTL: 15s
```

### routeToken 规格

```
routeToken = HMAC_JWT.sign(
  { ip: "10.42.0.232", port: 4000, tableId: "tableid_115147576394661893" },
  SERVER_SECRET
)
```

- 由 Web 服签发，Server Secret 存于服务端配置，Client 无法伪造
- token 内容客户端**无需解析**，原样透传即可（可对 payload 加密）
- token 不设过期时间，依赖 RPC 失败触发更新

```
输入：tableId + routeToken（Client 携带）
  ↓
JWT.verify(routeToken, SECRET)
  → 验签失败：返回 ERR_INVALID_TOKEN（Client 需重新发起 create_table）
  → 验签成功：解析 { ip, port }
  ↓
直接向 {ip, port} 发起 RPC（无 Redis 查询）
  → RPC 成功：正常响应
  → RPC 失败：返回 ERR_GAME_SERVER_UNAVAILABLE（Client 重新发起 create_table）
```

### 时序图（普通 AI 练习场）

> 以下时序图以**普通 AI 练习场建桌流程**为例，展示 routeToken 机制的核心工作方式。

#### 阶段一：Game 服启动与注册

> 心跳只维护 `game:serverList`，无路由表需要刷新。

```mermaid
sequenceDiagram
    autonumber
    participant Game
    participant Redis

    Game->>Redis: HSET game:serverList {IP:port} {tableCount}
    Note right of Game: Game 服启动，上报基本信息
    loop 心跳 (每 3 秒)
        Game->>Redis: hsetex game:serverList 刷新本字段 TTL (15秒)
    end
```

#### 阶段二：首次建桌 (create_table)

> 从 Redis 选服 → 生成新 tableId → RPC `create_table` → 生成并下发 routeToken。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant Redis
    participant Game

    Client->>Web: POST /create_table
    Web->>Redis: HGETALL game:serverList
    Redis-->>Web: 返回活跃 Game 服列表
    Web->>Web: 轮询选择一个 Game 服，生成 tableId = "tableid_" + snowflakeId

    Web->>Game: RPC create_table(tableId, ...)
    Game-->>Web: 返回 tableInfo

    Web->>Web: 生成 routeToken = JWT.sign({ip, port, tableId}, SECRET)
    Web-->>Client: { tableId, routeToken, tableInfo }
    Note over Client: 保存 routeToken，后续所有请求携带
```

#### 阶段三：玩家操作（正常情况）

> Client 携带 routeToken，Web 本地验签后直接路由，不查询任何 Redis。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant Game

    Client->>Web: 发送操作 (action, 携带 routeToken)
    Web->>Web: JWT.verify(routeToken) → 解析 {ip, port}
    Note over Web: 本地 CPU 验签，无网络开销
    Web->>Game: 根据 {ip, port} 直接发起 RPC
    Game-->>Web: 返回操作结果
    Web-->>Client: 响应客户端
```

#### 阶段四：Game 宕机后的操作失败

> RPC 超时直接确认宕机，直接向客户端报错。客户端自行重新进入建桌流程。
> ⚠️ Web 层需将以下情况**统一**映射为 `ERR_GAME_SERVER_UNAVAILABLE` 返回给客户端：TCP 连接拒绝/超时；Game 服返回业务层 `ERR_TABLE_NOT_FOUND`（进程原地重启/IP 复用导致内存丢失）。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant DeadGame as Game(已宕机)

    Client->>Web: 发送操作 (除 create_table 外的所有 action, 携带旧 routeToken)
    Web->>Web: JWT.verify(旧 routeToken) → 解析旧 {ip, port}
    Web->>DeadGame: 向旧 ip:port 发起 RPC
    DeadGame--xWeb: 连接拒绝 / 超时
    Web-->>Client: 返回错误 (ERR_GAME_SERVER_UNAVAILABLE)

    Note over Client,Web: 💡 客户端收到该错误后，直接走上方的【阶段二：首次建桌】流程来恢复状态并获取新 token
```

#### 阶段五：Game 进程原地重启（IP 不变，内存清空）

> K8s 在同一 Pod IP 原地拉起新进程后，旧 routeToken 中的 ip:port 网络可达，但桌子内存已丢失。Game 服会返回业务层错误 `ERR_TABLE_NOT_FOUND`。Web 层需将此等同于宕机处理，向客户端报 `ERR_GAME_SERVER_UNAVAILABLE`，触发客户端走 `create_table` 重建流程。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant RestartedGame as Game(原地重启，内存已清)

    Client->>Web: 发送操作 (action, 携带旧 routeToken)
    Web->>Web: JWT.verify(旧 routeToken) → 解析旧 {ip, port}
    Web->>RestartedGame: 向旧 ip:port 发起 RPC（网络可达）
    RestartedGame-->>Web: 返回业务错误 (ERR_TABLE_NOT_FOUND)
    Note over Web: ERR_TABLE_NOT_FOUND → 等同于宕机，统一向上抛
    Web-->>Client: 返回错误 (ERR_GAME_SERVER_UNAVAILABLE)

    Note over Client,Web: 💡 客户端走【阶段二：首次建桌】流程重建，沿用原 tableId 在新（或复活的）Game 服上重新建桌
```

#### 阶段六：选服时命中幽灵节点（create_table 内部重试）

> 建桌选服时，Redis 中仍存有一个刚宕机（< 15s）的 Game 服心跳记录。Web 选中后发起 `create_table` RPC 直接超时。Web 层须**在内部重试**：将该节点标记为失败，从列表中剔除后换选下一个健康节点，而不是把错误直接暴露给客户端。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant Redis
    participant DeadGame as Game(已宕机，心跳未过期)
    participant AliveGame as Game(健康节点)

    Client->>Web: POST /create_table
    Web->>Redis: HGETALL game:serverList
    Redis-->>Web: 返回节点列表（含幽灵节点）
    Web->>Web: 轮询选中幽灵节点

    Web->>DeadGame: RPC create_table(tableId, ...)
    DeadGame--xWeb: 连接超时

    Note over Web: 内部重试：标记该节点失败，从候选列表中剔除
    Web->>Web: 从剩余节点中选下一个

    Web->>AliveGame: RPC create_table(tableId, ...)
    AliveGame-->>Web: 建桌成功，返回 tableInfo

    Web->>Web: 生成 routeToken = JWT.sign({ip, port, tableId}, SECRET)
    Web-->>Client: { tableId, routeToken, tableInfo }
    Note over Client: 对客户端透明，感知不到内部重试
```

#### 阶段七：Game 重启后持久化恢复

> **前提**：tableId 已与 Game 服物理地址完全解耦，恢复时可调度到**任意**健康 Game 服，只需重新签发 routeToken 即可。持久化写入时机待定（暂以"每次牌桌状态变更时异步写入"为占位描述）。

##### 子流程 A：牌桌状态持久化写入

> Game 服每次状态变更后，异步将 table 快照写入 Redis（或 MySQL），供重建时使用。

```mermaid
sequenceDiagram
    autonumber
    participant Game
    participant Storage as Redis / MySQL

    Note over Game: 每次牌桌状态变更（发牌、玩家操作等）
    Game->>Storage: 异步写入快照
    Note right of Storage: Key: game:table:{tableId}<br/>Value: 序列化 table 快照 + 版本号<br/>TTL: 待定（按比赛时长设定）
```

##### 子流程 B：Game 重启后客户端触发恢复

> Game 服宕机或重启后，Client 收到 `ERR_GAME_SERVER_UNAVAILABLE`，携带原 tableId 发起 `create_table` 重建请求。Web 层从持久化存储加载快照，调度到任意健康 Game 服恢复状态，并签发新 routeToken。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant Redis
    participant Storage as Redis / MySQL
    participant OldGame as Game(已宕机/重启)
    participant NewGame as Game(任意健康节点)

    Client->>Web: 发送操作 (携带旧 routeToken)
    Web->>Web: JWT.verify(旧 routeToken) → 解析旧 {ip, port}
    Web->>OldGame: 向旧 ip:port 发起 RPC
    OldGame--xWeb: 连接超时 / ERR_TABLE_NOT_FOUND
    Web-->>Client: 返回错误 (ERR_GAME_SERVER_UNAVAILABLE)

    Note over Client: 收到错误，携带原 tableId 发起重建

    Client->>Web: POST /create_table (携带原 tableId)
    Web->>Storage: 查询 game:table:{tableId} 持久化快照
    Storage-->>Web: 返回 table 快照（savedState）

    Web->>Redis: HGETALL game:serverList
    Redis-->>Web: 返回活跃 Game 服列表
    Web->>Web: 选任意健康 Game 服（与原 Game 无关）

    Web->>NewGame: RPC create_table(tableId, savedState)
    Note right of NewGame: 从快照恢复内存 table 状态
    NewGame-->>Web: 恢复成功，返回 tableInfo

    Web->>Web: 签发新 routeToken = JWT.sign({ip_new, port_new, tableId}, SECRET)
    Web-->>Client: { tableId, routeToken(新), tableInfo }
    Note over Client: 保存新 routeToken，后续请求携带新 token
```

> **关键点**：
> - tableId 保持不变，业务连续性完整保留
> - 新 routeToken 中的 ip:port 指向新 Game 服，旧 token 自动作废
> - 选服策略与首次建桌完全相同，无需任何"桌子归属"信息
> - `create_table` RPC 增加可选参数 `savedState`：有值时走恢复路径，无值时走新建路径

### 时序图（复式比赛）

> 基于 `DuplicateMatchService.startHand() / resumeActivity()` 的实际代码逻辑，展示新路由方案下的各个场景。

#### 复式比赛路由机制总览

复式比赛中 Web 服存在**两类路由来源**，各司其职：

| 路由来源 | 适用场景 | 开销 |
|---------|---------|------|
| Client 携带的 `routeToken`（本地 JWT 验签） | `start_hand` 中，Web 向 Game 发 `is_have_table` / `get_table_wait_hero` / `next_game` RPC | 本地 CPU，零网络 |
| Redis `game:route:{tableId}`（存 ip:port） | `resumeActivity._checkTableExists`；以及宕机重建后更新路由 | 一次 Redis GET |

**关键不变量**：每次 `create_table` 成功后，必须**同时**完成两件事：
1. 写 Redis `game:route:{tableId}` = `{ip, port}`（服务端路由记录）
2. 向 Client 签发 `routeToken = JWT.sign({ip, port, tableId}, SECRET)`

两者始终保持一致，互为冗余。

---

#### 复式比赛场景一：首手建桌

> `entry.tableId == null`，需要选服并首次创建牌桌。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant Redis
    participant MySQL
    participant Game

    Client->>Web: POST /start_hand (activityId，无 routeToken)
    Web->>MySQL: findActivity + findUserEntry
    Note over Web: entry.tableId == null → 首手流程
    Web->>Redis: HGETALL game:serverList → 选一个健康 Game 服
    Web->>Web: tableId = "tableid_" + snowflakeId()（不含 IP）
    Web->>MySQL: UPDATE entry.tableId = tableId（固化，防重复创建）

    Web->>Game: RPC create_table(tableId, drillParams, maxHands)
    Game-->>Web: tableInfo（full 快照）

    Web->>Redis: SET game:route:{tableId} {ip, port}（写服务端路由）
    Web->>Web: routeToken = JWT.sign({ip, port, tableId}, SECRET)
    Web->>MySQL: INSERT hand_record（第一手记录）
    Web-->>Client: { tableId, routeToken, tableInfo, dataType:"full" }
    Note over Client: 保存 routeToken，后续所有请求携带
```

---

#### 复式比赛场景二：断线重连（手牌进行中）

> `entry.tableId != null`，Client 携带 `routeToken`，Game 正常存活，当前手未结束。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant MySQL
    participant Game

    Client->>Web: POST /start_hand (activityId, routeToken, isReconnect=true)
    Web->>MySQL: findUserEntry → entry.tableId 存在
    Web->>Web: JWT.verify(routeToken) → {ip, port}
    Web->>Game: RPC is_have_table(tableId)（用 routeToken 中 ip:port）
    Game-->>Web: exist = true

    Web->>Game: RPC get_table_wait_hero(tableId)（等 AI 处理完毕再返回稳定快照）
    Game-->>Web: tableInfo（state != "end"，手牌仍在进行中）

    Web->>MySQL: INSERT hand_record（幂等，已有则跳过）
    Web-->>Client: { tableId, routeToken(原样返回，不重新签发), tableInfo, dataType:"full" }
    Note over Client: Game 服未变，routeToken 无需更新
```

---

#### 复式比赛场景三：正常推进下一手（手牌已结束）

> `entry.tableId != null`，Game 存活，当前手 `state == "end"`，需要 `next_game` 注入新行动线。
> 包含**竞态修正**子逻辑：`max(Game.totalHands, MySQL.completedHandCount)` 确定正确的下一手。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant MySQL
    participant Game

    Client->>Web: POST /start_hand (activityId, routeToken, isReconnect=false)
    Web->>MySQL: findUserEntry → entry.tableId 存在
    Web->>Web: JWT.verify(routeToken) → {ip, port}
    Web->>Game: RPC is_have_table(tableId)
    Game-->>Web: exist = true

    Web->>Game: RPC get_table_wait_hero(tableId)
    Game-->>Web: tableInfo（state == "end"，Game.totalHands = N）

    Note over Web: 竞态修正：effectiveCompleted = max(Game.totalHands, MySQL.completedHandCount)<br/>若 Game 超前则用 Game.totalHands 重算 handId + drillParams

    Web->>MySQL: findHandById(correctedHandId) → 加载正确手的 drillInfo

    Web->>Game: RPC next_game(tableId, drillParams_corrected)
    Game-->>Web: tableInfo_next（增量快照）

    Web->>MySQL: INSERT hand_record（新一手记录，使用修正后的 orderNo/handId）
    Web-->>Client: { tableId, routeToken(不变), tableInfo_next, dataType:"incremental" }
    Note over Client: Game 服未变，routeToken 不需更新
```

---

#### 复式比赛场景四：宕机重建（Game 服已宕机）

> `entry.tableId != null`，`is_have_table` RPC 超时或拒绝连接，需要在新 Game 服上重建。
> **这是方案二下宕机恢复的核心场景：tableId 不变，路由切换到新 Game 服，重新签发 routeToken。**

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant Redis
    participant MySQL
    participant OldGame as Game(已宕机)
    participant NewGame as Game(新健康节点)

    Client->>Web: POST /start_hand (activityId, routeToken_old)
    Web->>MySQL: findUserEntry → entry.tableId, entry.completedHandCount
    Web->>Web: JWT.verify(routeToken_old) → 旧 {ip, port}

    Web->>OldGame: RPC is_have_table(tableId)（用旧 ip:port）
    OldGame--xWeb: 连接超时 / 拒绝连接
    Note over Web: tableAlive = false → 走宕机重建路径

    Web->>Redis: HGETALL game:serverList → 选新健康 Game 服（带内部重试逻辑）
    Web->>NewGame: RPC create_table(tableId, drillParams, initialTotalHands=completedHandCount)
    Note right of NewGame: initialTotalHands 确保 Game.totalHands 从正确偏移量开始<br/>防止 totalHands >= maxHands 的终止判断出错
    NewGame-->>Web: tableInfo（重建成功，full 快照）

    Web->>Redis: SET game:route:{tableId} {new_ip, new_port}（更新服务端路由记录）
    Web->>Web: routeToken_new = JWT.sign({new_ip, new_port, tableId}, SECRET)
    Web->>MySQL: INSERT hand_record（当前手记录）
    Web-->>Client: { tableId, routeToken(新), tableInfo, dataType:"full" }
    Note over Client: 保存新 routeToken，旧 token 自动作废
```

> ⚠️ **并发安全**：多名玩家同时触发宕机重建时，必须对 `tableId` 加分布式锁，防止同一张桌子被建到多个 Game 服上（脑裂）。锁粒度为 `tableId`，锁内只执行一次选服+建桌；后续请求等锁释放后直接读 `game:route:{tableId}` 返回已有路由。

---

#### 复式比赛场景五：resumeActivity（断线重连入口检测）

> Client 重新打开 App 时调用，无 routeToken 参与（纯元数据查询）。
> `_checkTableExists` 使用 Redis `game:route:{tableId}` 而非 routeToken 来路由 RPC。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Web
    participant Redis
    participant MySQL
    participant Game

    Client->>Web: GET /resume (activityId)
    Note over Web: resumeActivity 是元数据查询，不接受 routeToken
    Web->>MySQL: findUserEntry → entry.status / entry.tableId

    alt entry.status == 'completed'
        Web-->>Client: { status:'completed', totalWinLossBb, myRank }
    else entry.status == 'playing'
        Web->>MySQL: findPlayingHandRecord(entry.id)

        alt 无进行中 hand_record
            Web-->>Client: { status:'playing', tableExists:false }
            Note over Client: 调 start_hand 开新手（无 routeToken，走场景一）
        else 有进行中 hand_record
            Web->>Redis: GET game:route:{tableId} → {ip, port}（服务端路由查询）
            Web->>Game: RPC is_have_table(tableId)

            alt Game 响应 exist=true（正常断线）
                Web-->>Client: { status:'playing', tableId, tableExists:true }
                Note over Client: 已有 routeToken，调 start_hand(routeToken) 走场景二重连
            else Game 超时 / exist=false（宕机）
                Web-->>Client: { status:'playing', tableId, tableExists:false }
                Note over Client: 已有旧 routeToken，调 start_hand(routeToken_old) 走场景四重建
            end
        end
    end
```

---


### 改动范围

| 文件 | 改动内容 | 行数估计 |
|------|---------|---------|
| `game_utils.ts` `randTableId` | 改为生成 `tableid_{snowflakeId}` 格式，去掉 IP 编码 | ~3 行 |
| `game_utils.ts` `getGameServerInfoByTableId` | **删除**（不再从 tableId decode IP）；路由来源改为 routeToken 验签或 Redis 查询 | 删除 ~15 行 |
| `session_manager.ts` | 删除 `create_table` 后写旧路由逻辑；删除心跳中的路由表刷新 | 减少 ~15 行 |
| Web 层公共路由工具 | 新增 `signRouteToken(ip, port, tableId)`、`verifyRouteToken(token)` | ~15 行 |
| Web 层公共路由工具 | 新增 `writeRouteRecord(tableId, ip, port)`、`readRouteRecord(tableId)` — 读写 Redis `game:route:{tableId}` | ~10 行 |
| `duplicate-match/service.ts` `rpcCreateDuplicateMatchTable` | 移除 `getGameServerInfoByTableId` 调用；改为接收显式 `{ip, port}` 参数 | ~5 行 |
| `duplicate-match/service.ts` `rpcNextGameDuplicateMatch` | 同上 | ~5 行 |
| `duplicate-match/service.ts` `rpcGetTableWaitHero` | 同上 | ~5 行 |
| `duplicate-match/service.ts` `_checkTableExists` | 改为从 Redis `game:route:{tableId}` 读取 ip:port（供 `resumeActivity` 使用） | ~5 行 |
| `duplicate-match/service.ts` `startHand` | 接收客户端传入的 `routeToken`；`create_table` 成功后写 Redis 路由 + 签发新 token；宕机重建加分布式锁 | ~25 行 |
| API 响应结构 | `start_hand` 响应增加 `routeToken` 字段 | ~3 行 |
| Client 协议 | `start_hand` 请求增加 `routeToken?` 字段（首手为空，后续必填） | 协议变更 |

> ⚠️ **注意**：
> - 需要和客户端协调接口变更（新增 `routeToken` 字段）。
> - Redis `game:route:{tableId}` 的 TTL 需根据比赛时长设定，建议 `max(活动endTime, 当前时间) + 24h`。
> - `tableId` 级别的分布式锁（用于宕机重建并发保护）可复用项目现有分布式锁工具，见 `src/utils/AGENTS.md`。

### 优劣

| 优点 | 缺点 |
|------|------|
| Client 发起的 action 零 Redis 查询（本地验签） | 需要客户端配合携带 routeToken（接口变更）|
| tableId 与物理 IP 完全解耦，纯业务标识 | routeToken 需要签名机制，引入密钥管理 |
| 心跳逻辑简洁（只维护 serverList） | 内网 IP:port 经 JWT 传至客户端（建议加密 payload）|
| 宕机检测最直接（RPC 超时即确认） | 更换 Secret 时所有存量 token 立即失效，需 key rotation |
| 宕机重建可调度到任意健康 Game 服，无 Pod 归属约束 | 服务端主动 RPC（resumeActivity）仍需一次 Redis `game:route` 查询 |
| 双轨路由（routeToken + Redis game:route）互为冗余，单点失效不影响另一侧 | 宕机重建并发场景需分布式锁，引入额外复杂度 |

---

## 综合对比

| 维度 | 方案一（K8s Service ClusterIP）| 方案二（客户端携带路由 Token）|
|------|------|------|
| **tableId 格式** | 不变（依然含 IP 前缀）| **`tableid_{snowflakeId}`，去掉 IP 前缀** |
| **数据库迁移** | 不需要 | 不需要 |
| **代码改动量** | 极小（1行）| 中（~46行 + 客户端协议）|
| **K8s 运维改动** | 需要（配置 Service + env 注入）| 不需要 |
| **每次 action Redis 查询** | 无 | **无（本地验签）**|
| **路由准确性** | 最高（K8s 保障）| 高（依赖 RPC 超时）|
| **宕机检测速度** | 即时（K8s 探活）| 快（RPC 直接超时）|
| **路由表依赖** | 无 | **无（不需要路由表）**|
| **心跳维护复杂度** | 低 | **低（只有 serverList 一张表）**|
| **重建逻辑复杂度** | 无 | **低（一个场景）**|
| **客户端协议变更** | 无 | **需要（增加 routeToken 字段）**|
| **普通模式影响** | 无 | 无 |
| **长期可维护性** | 高 | 高 |
| **适用场景** | 有 K8s 运维资源 | 不动 K8s，追求零 Redis 路由查询 |

### 推荐策略

- **短期修复**（不动 K8s，可接受客户端改动）→ **方案二**，消除每次 action 的 Redis 开销，架构简洁
- **中长期根治**（有运维配合）→ **方案一**，代码改动最小，交给 K8s 基础设施保障

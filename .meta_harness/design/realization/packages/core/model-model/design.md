# model-model 实现设计

兑现两份 v1 数据契约（都是 candidate）：[`data.model-profile`](../../../../spec/data/model-profile/v1/contract.md)（下称 MP）、[`data.model-response`](../../../../spec/data/model-response/v1/contract.md)（MR）。
条款写成「MP S-14」这样；导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，复用：

- **JSON Schema**：`ajv` 8.20.0 的 Draft 2020-12 入口；两份 Schema 从 spec 原样复制进包、逐字节核对。MR 的 Schema 以 `allOf` 的 `if/then` 表达收场的条件关系（MR S-26），ajv 的 2020 入口支持。
- **包内依赖**：[message-model](../message-model/README.md)（`Modality`、块、`AssistantMessage`、`Usage`／`Cost`／`TrimSummary`、`RunId`／`AttemptId`／`ModelCallId`、金额的无损读写）、[tool-model](../tool-model/README.md)（MR 引 `data.loop-extension` 的 `FailureCause`）、identity-values、offer-expiry。**前两条在包级环上**（[MSG-1](../message-model/design.md#包级依赖成环)）。
- 拒绝值的判法沿用 [message-model 的写法](../message-model/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)；注意 MP 的次序里 **`malformed` 排第一**（MP S-25），MR 的 `malformed` 是剩余项——同一种写法，清单次序不同。
- **Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。模型档案目录（中心与据点两侧）、模型请求运行时、拓展件派发、模态投影各自 `import` | MP S-24「一次纯计算」；MR 没有操作 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**；提供者换代时没有在途事实在本模块里 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**。没有事件能越过租户或会话边界。带归属的值只有自建档案的 `scope`（`ScopeLayerIdentity`，带判别式）与响应体的凭据那一格；响应体**不带 `TenantId`**，归属靠承载它的条目（MR G-3），归写入方 | — |
| 存储 | **无**：档案行、撞名的唯一约束、在册状态的转移、响应体的「写下即不变」全归模型档案目录与模型请求运行时的存储 | MP S-23、MR S-25 |

### 装配给 vs 协议给：单机时本节点提供了什么

| 契约与行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| MP「引用解析」（不变，纯值相等） | `refMatches(ref, profile)`：精确匹配，官方支按路由名、自建支按（所在范围, 路由名）；**不跨层、不回退** | 「读不到」在跨进程后先是传输故障，映射成哪种失败归目录 |
| MP「表示层校验」（不变） | `judgeModelProfileDocument(kind, value)` | 在哪些边界调 |
| MP「自建引用的范围分量随请求到达」 | 类型：`ModelProfileRef` 按 `origin` 判别，自建支的 `scope` 是带判别式的 `ScopeLayerIdentity`，没有压平的写法 | 每一跳的传输格式原样承载 |
| MP 撞名、`updatedAt`、在册转移、不静默丢改；MR 全部八行（一次请求一条、三个时刻同源、首 token、发号、`ResponseId` 唯一、`late`、参数留痕、凭据不进响应体） | 无 | 模型档案目录与模型请求运行时 |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| MP [S-1](../../../../spec/data/model-profile/v1/contract.md#s-1-档案的身份所在范围与路由名)、[S-2](../../../../spec/data/model-profile/v1/contract.md#s-2-routename)、[S-4](../../../../spec/data/model-profile/v1/contract.md#s-4-profileorigin)～[S-9](../../../../spec/data/model-profile/v1/contract.md#s-9-inputconstraints)、[S-12](../../../../spec/data/model-profile/v1/contract.md#s-12-各属性何时定能不能改) 身份、路由名、来源、供应商、回退、两组模态、两个上限、输入约束、可变性 | 类型 `ModelProfile`、`RouteName`、`ProfileOrigin`、`ProviderName`、`InputConstraints`；两组模态取 message-model 的 `Modality`（**只有一份定义**） | 路由名逐码点比较，不折叠大小写 | V-1（examples）；「各属性能不能改」是写入方的纪律（目录） |
| MP [S-13](../../../../spec/data/model-profile/v1/contract.md#s-13-modelprofileref)、[S-14](../../../../spec/data/model-profile/v1/contract.md#s-14-引用只精确解析不跨层) 引用与精确解析 | 类型 `ModelProfileRef`；`refMatches(ref, profile)` | 纯值比较；三种收场（找到、查无此条、读不到）**由目录区分**，本函数只答「这一行是不是它」 | 规范场景「官方引用读一次、自建引用读一次、名字对所在范围不对」 |
| MP [S-15](../../../../spec/data/model-profile/v1/contract.md#s-15-modelrequestparameters-是一份词表)～[S-20](../../../../spec/data/model-profile/v1/contract.md#s-20-项与项名) 参数词表、取值域、缺席不补、档案输出上限、`extra`、项名 | 类型 `ModelRequestParameters`、`ReasoningEffort`；`parameterNames(params)`（统一项以成员名、`extra` 以键） | 缺席即不带：本模块**没有**任何补默认值的函数 | S-17 的规范场景归运行时（「出站请求体里没有这一项」） |
| MP [S-27](../../../../spec/data/model-profile/v1/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本)、[S-28](../../../../spec/data/model-profile/v1/contract.md#s-28-建档内容产生一条档案时给的那一份) 快照、建档内容 | 类型 `ModelProfileSnapshot`、`ModelProfileContent` | **快照没有校验入口**：MP S-24 的四种文档不含它，收的一方不重做校验；拷一份快照就是原样复制 | 规范场景「打开调用之后改档案、撤回档案，快照不变」归运行时 |
| MP [S-24](../../../../spec/data/model-profile/v1/contract.md#s-24-表示层校验是一次纯计算)～[S-26](../../../../spec/data/model-profile/v1/contract.md#s-26-表示层拒绝与判定分开) 纯计算、十个拒绝值、判定分开 | `judgeModelProfileDocument(kind, value)`，`kind` 是四种文档之一 | `malformed`（M1～M12）先判；其后九个按表；Schema 之外的一步是 `max_output_exceeds_profile`；`route_name_taken` **不在此**（判定，归目录） | V-1 的次序回归例（examples 第 6、10 节） |
| MR [S-4](../../../../spec/data/model-response/v1/contract.md#s-4-一次调用一次发出一条响应体)～[S-15](../../../../spec/data/model-response/v1/contract.md#s-15-故障的成因与原样状态码)、[S-17](../../../../spec/data/model-response/v1/contract.md#s-17-首-token-与时序)～[S-19](../../../../spec/data/model-response/v1/contract.md#s-19-用量与费用)、[S-35](../../../../spec/data/model-response/v1/contract.md#s-35-晚到的那一条) 响应体的成员 | 类型 `ModelResponse`、`ResponseId`（**家在本包**）、`Route`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment`、`ResponseOutcome`、`Failure`、`Timing`、`RawResponse` | 用量与费用的金额经 message-model 的 `ExactDecimal`，不经浮点 | V-1 |
| MR [S-26](../../../../spec/data/model-response/v1/contract.md#s-26-schema-的范围)～[S-28](../../../../spec/data/model-response/v1/contract.md#s-28-表示层拒绝与判定分开) Schema 范围、拒绝值、判定分开 | `judgeModelResponse(value)` | Schema（含 `if/then` 的收场条件）＋ S-27 列在 `malformed` 里的几种无专名的跨成员情形；**S-26「它不能约束的」那一串**（与「已出门」逐项相同、三个时刻先后、`late` 的判定……）要看同一次调用的别的记录，**不在本入口**，归写入方 | V-1；V-9、V-10 归模型请求运行时 |
| MR [S-16](../../../../spec/data/model-response/v1/contract.md#s-16-发出了的才有响应体)、[S-20](../../../../spec/data/model-response/v1/contract.md#s-20-上游原始响应留存)～[S-24](../../../../spec/data/model-response/v1/contract.md#s-24-一条响应体对应上游的一次请求) 写入纪律 | — | 不在本节点 | 模型请求运行时（V-2～V-8、V-11～V-14） |

### 副本定义的对齐放在本包

为避免契约互为依赖，几处定义在别的契约里有**逐字副本**：`ResponseId`（家在 MR S-6）在 `data.messages` 与 `data.call-accounts` 里各有一份，`SelectedBy`、`CredentialScope`、`ParameterAdjustment`（家在 MR S-10、S-9、S-11）在 `data.messages` 里各有一份。
包之间只能单向依赖：message-model 不能依赖本包，本包依赖 message-model——**所以对齐测试只能放在本包**：取 message-model 导出的两份 Schema 与本包的 MR Schema，逐项比较这些 `$defs` 逐字相同。

| | 不做对齐测试，靠评审 | 在 message-model 里比（反向依赖本包） | **在本包里比（本节点选）** |
|---|---|---|---|
| 可行 | 可行 | **成环**（它已经在环上，这只会加一条） | 可行：本包本来就依赖 message-model |
| 失败时 | 副本悄悄漂移，两个实现一个收一个拒 | — | CI 红，指出是哪一份 `$defs` 不同 |

**落选方（靠评审）的最强论证**：副本是规格层的事，契约的验证入口已把它们列成「对齐义务」，实现不必再核。**它输在**副本漂移的后果落在实现上（一边收一边拒），而逐字比较零成本。**本方弱点**：只核 Schema 片段，不核两边类型定义；TS 类型由各自 Schema 手写，两处类型的一致只能靠同一组正反实例。置信度：**高**。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks`、`data.messages`、`data.call-accounts` v1 | [message-model](../message-model/README.md)——**成环**（[MSG-1](../message-model/design.md#包级依赖成环)） | — | 划分定下之前没有可用的解析方式 |
| `data.loop-extension` v1（MR 的 `FailureCause`） | [tool-model](../tool-model/README.md)——**成环**（同上） | — | 同上 |
| `data.identity-values`、`data.offer-expiry` v1 | 已实现的 core 包 | 随包版本 | 静态 import |
| 被消费 | 模型档案目录、模型请求运行时、拓展件派发（`select_model`）、模态投影、message-model（`RouteName` 等，**成环的那一条**） | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

**没有配置项。**

## 状态、并发与失败映射

**无状态、无提交点、无并发。**失败映射：表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个）；`refMatches` 只答是否，**不把「不匹配」说成「查无此条」**——那是目录读一整格之后的结论。都不抛异常。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

MP 的验证入口里列为静态检查的几项（在册状态只有两条转移、持久形状保留 `origin` 判别式、档案上没有凭据）约束的是目录的写路径与存储形状；MR 的写入者检查（没有一处给响应体写三个「发不出去」成因、脱敏、无隐藏重试）约束的是模型请求运行时。本节点承载的只有：

| 检查 | 形式 | 现状 |
|---|---|---|
| 持久形状里 `ModelProfileRef` 保留 `origin` 判别式、`scope` 带判别式（MP S-13） | 类型：没有压平的字段组合可写 | 无 |
| 档案上没有凭据（MP S-22） | 类型：`ModelProfile` 没有能装凭据的成员；Schema 的成员集合闭合 | 无 |

## 实施缺口与消费者影响

两份契约的已知缺口（MP G-2、G-8～G-10，MR G-3～G-5、G-8～G-10）不重抄。本节点自己的缺口：

- **MDL-1 包级依赖成环**：本包与 message-model 双向（`data.messages` → `data.model-profile`，`data.model-response` → `data.messages`），与 tool-model 双向（`data.loop-extension` → `data.model-profile`，`data.model-response` → `data.loop-extension`）。见 [MSG-1](../message-model/design.md#包级依赖成环)。owner：主线。
- **MDL-2 副本对齐测试**：见[上节](#副本定义的对齐放在本包)。owner：本节点（义务，不是阻塞）。
- **跨节点交接**：`judgeModelResponse` 只判一条响应体本身；S-26「它不能约束的」那一串由模型请求运行时在写入时兑现，写进它的 verification。

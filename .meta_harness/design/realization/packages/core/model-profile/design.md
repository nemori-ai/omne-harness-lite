# model-profile 实现设计

契约：[`data.model-profile` v1](../../../../spec/data/model-profile/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)。
注意本契约的次序里 **`malformed`（M1～M12）排第一**（S-25），与别的数据契约「`malformed` 是剩余项」不同——同一种写法，清单次序不同。
`Modality` 取 [content-blocks](../content-blocks/README.md) 的那一份（`data.content-blocks/v1#S-6`，**只有一份定义**）。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。模型档案目录（中心与据点两侧）、模型请求运行时、拓展件派发、模态投影各自 `import` | S-24「一次纯计算」 |
| 服务键 | 无 | — |
| `inject` 关系 | **无** | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**。带归属的值只有自建档案的 `scope`（`ScopeLayerIdentity`，带判别式），谁读得到归目录的读面 | — |
| 存储 | **无**：档案行、撞名的唯一约束、在册状态的转移归模型档案目录的存储 | S-23 |

### 装配给 vs 协议给

[S-23](../../../../spec/data/model-profile/v1/contract.md#s-23-跨部署形态会变的判定) 那张表里，本节点只在三行出力：

| 行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| 引用解析（不变，纯值相等） | `refMatches(ref, profile)`：精确匹配，官方支按路由名、自建支按（所在范围, 路由名）；**不跨层、不回退** | 「读不到」在跨进程后先是传输故障，映射成哪种失败归目录 |
| 表示层校验（不变） | `judgeModelProfileDocument(kind, value)` | 在哪些边界调 |
| 自建引用的范围分量随请求到达 | 类型：`ModelProfileRef` 按 `origin` 判别，自建支的 `scope` 是带判别式的 `ScopeLayerIdentity`，没有压平的写法 | 每一跳的传输格式原样承载 |

撞名、`updatedAt`、在册转移、不静默丢改归目录与模型请求运行时。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/model-profile/v1/contract.md#s-1-档案的身份所在范围与路由名)、[S-2](../../../../spec/data/model-profile/v1/contract.md#s-2-routename)、[S-4](../../../../spec/data/model-profile/v1/contract.md#s-4-profileorigin)～[S-9](../../../../spec/data/model-profile/v1/contract.md#s-9-inputconstraints)、[S-12](../../../../spec/data/model-profile/v1/contract.md#s-12-各属性何时定能不能改) 身份、路由名、来源、供应商、回退、两组模态、两个上限、输入约束、可变性 | 类型 `ModelProfile`、`RouteName`、`ProfileOrigin`、`ProviderName`、`InputConstraints` | 路由名逐码点比较，不折叠大小写 | 验证入口 S-24、S-25 那一行（examples）；「各属性能不能改」是写入方的纪律（目录） |
| [S-13](../../../../spec/data/model-profile/v1/contract.md#s-13-modelprofileref)、[S-14](../../../../spec/data/model-profile/v1/contract.md#s-14-引用只精确解析不跨层) 引用与精确解析 | 类型 `ModelProfileRef`；`refMatches(ref, profile)` | 纯值比较；三种收场（找到、查无此条、读不到）**由目录区分**，本函数只答「这一行是不是它」 | S-14 规范场景的匹配那一半 |
| [S-15](../../../../spec/data/model-profile/v1/contract.md#s-15-modelrequestparameters-是一份词表)～[S-20](../../../../spec/data/model-profile/v1/contract.md#s-20-项与项名) 参数词表、取值域、缺席不补、档案输出上限、`extra`、项名 | 类型 `ModelRequestParameters`、`ReasoningEffort`；`parameterNames(params)`（统一项以成员名、`extra` 以键） | 缺席即不带：本模块**没有**任何补默认值的函数 | S-17 的规范场景归运行时（「出站请求体里没有这一项」） |
| [S-27](../../../../spec/data/model-profile/v1/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本)、[S-28](../../../../spec/data/model-profile/v1/contract.md#s-28-建档内容产生一条档案时给的那一份) 快照、建档内容 | 类型 `ModelProfileSnapshot`、`ModelProfileContent` | **快照没有校验入口**：S-24 的四种文档不含它，收的一方不重做校验；拷一份快照就是原样复制 | 规范场景「打开调用之后改档案、撤回档案，快照不变」归运行时 |
| [S-24](../../../../spec/data/model-profile/v1/contract.md#s-24-表示层校验是一次纯计算)～[S-26](../../../../spec/data/model-profile/v1/contract.md#s-26-表示层拒绝与判定分开) 纯计算、十个拒绝值、判定分开 | `judgeModelProfileDocument(kind, value)`，`kind` 是四种文档之一 | `malformed`（M1～M12）先判；其后九个按表；Schema 之外的一步是 `max_output_exceeds_profile`；`route_name_taken` **不在此**（判定，归目录） | 次序回归例（examples 第 6、10 节） |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks` v1（`Modality`）、`data.identity-values` v1、`data.offer-expiry` v1 | [content-blocks](../content-blocks/README.md)、已实现的 identity-values 与 offer-expiry | 随包版本 | 静态 import |
| 被消费 | messages（`RouteName` 等）、loop-extension（`select_model`）、model-response、模型档案目录、模型请求运行时、模态投影 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个）；`refMatches` 只答是否，**不把「不匹配」说成「查无此条」**——那是目录读一整格之后的结论。都不抛异常。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

契约验证入口里列为静态检查的几项（在册状态只有两条转移、持久形状保留 `origin` 判别式、档案上没有凭据）大多约束目录的写路径与存储形状。本节点承载的只有：

| 检查 | 形式 | 现状 |
|---|---|---|
| 持久形状里 `ModelProfileRef` 保留 `origin` 判别式、`scope` 带判别式（S-13） | 类型：没有压平的字段组合可写 | 无 |
| 档案上没有凭据（S-22） | 类型：`ModelProfile` 没有能装凭据的成员；Schema 的成员集合闭合 | 无 |

## 实施缺口与消费者影响

契约的已知缺口（第十节）不重抄。**本节点没有自己的缺口**；「三种收场不折叠」「撞名只比同一格」写进模型档案目录的 verification。

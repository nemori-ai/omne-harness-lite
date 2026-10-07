# call-accounts 实现设计

> 本批设计已接受（2026-09-26，D-062／D-065）。此状态不表示实现或实际验证完成。

契约：[`data.call-accounts` v2](../../../../spec/data/call-accounts/v2/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律为**已接受的设计**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)。
金额从 JSON 文本读入一律经 content-blocks 的[严格无损读写](../content-blocks/design.md#严格的无损-json-读写)（D-060 §八 M36「金额一律无损保留原文」）。**Cordis 版本**：采用 4.0.4（D-025）；本模块不依赖 Cordis。

## 公开面

**全部即公开函数面**（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）：不依赖 Cordis、会话、租户或存储，单独 `import` 即用；**没有 Cordis 服务面**（[下表](#cordis-原语本节点一样也不用)）。核对：[依赖表](#依赖作用域与绑定)只有本批纯模块、已实现的 identity-values 与 offer-expiry、`ajv`，不 import `@deepseek-ai/cordis`、`kernel-basis`、`storage`，不解析任何服务键。主要导出（候选名）：

| 导出 | 契约坐标 |
|---|---|
| 类型 `Usage`、`Cost`、`CostItem`、`ToolCallAccount`、`FrameAccount`、`TrimSummary`、`CostCorrection`；三个归属标识 `RunId`、`AttemptId`、`ModelCallId` | [S-4](../../../../spec/data/call-accounts/v2/contract.md#s-4-未知是一个值不是零也不是缺席)～[S-18](../../../../spec/data/call-accounts/v2/contract.md#s-18-原账不改)、[S-37](../../../../spec/data/call-accounts/v2/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) |
| `ExactDecimal.from(JsonNumber)`、`add`、`compare` | [S-5](../../../../spec/data/call-accounts/v2/contract.md#s-5-金额美元十进制不截断) |
| `effectiveCost(target, corrections)`、`summarize(group) → { knownSum, unknownCount } \| { failed }` | [S-22](../../../../spec/data/call-accounts/v2/contract.md#s-22-有效费用)～[S-24](../../../../spec/data/call-accounts/v2/contract.md#s-24-汇总不重复计) |
| `judgeAccountValue(kind, value) → { ok } \| { rejected }` | [S-27](../../../../spec/data/call-accounts/v2/contract.md#s-27-表示层拒绝值闭合)～[S-29](../../../../spec/data/call-accounts/v2/contract.md#s-29-判别式与枚举闭合) |

`prepareAccountGroup(input)` 先对全部完整模型费用/用量、工具账和补账表示准入，通过后才生成冻结的候选权威投影 `AccountGroup`。完整输入中的工具账可以有 `cost.total_usd` 和 `usage`；只是金额/用量求值内部投影不取它们。`summarize` 只收本准入函数产生的组，不在计算期间边验证边产生部分结果。

另有受限纯辅助面 `summarizeUsage(models)`：输入仅为只读 `ResponseId + Usage` 集合，逐值表示准入后对四字段求已知和/未知数，重复 `ResponseId` 明确失败且不去重。不接收工具账或补账，因此不额外施加货币补账失败门；不证明原完整账组合法或归组完整。S-23“同式”与九件事对完整组 token 失败的作用范围尚未唯一表达，该完整组读面政策留给G-10拥有者；本辅助面只兑现两种读法共同明确的用量计算。

**函数层不承诺**：一份账只落一次、补账找得到目标、镜像与权威同组、金额在每一跳都不丢位——它们只在承载记录的一侧、运行时与读面成立（[装配给 vs 协议给](#装配给-vs-协议给单机时本节点提供了什么)右列）；`summarize` 只对交进来的这一组给出结论。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**；消费者直接 `import` | S-1 |
| 服务键 | 无 | — |
| `inject` 关系 | **无** | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**。没有事件能越过租户或会话边界：账挂在承载它的记录上，归属由记录的条目给 | — |
| 存储 | **无**：汇总的结果不是账，不写回（S-18）；账与补账的落盘归承载记录的一侧 | S-23 九件事第 3 件 |

### 装配给 vs 协议给：单机时本节点提供了什么

[S-26](../../../../spec/data/call-accounts/v2/contract.md#s-26-装配给的保证-vs-协议须给的保证) 六行里，本节点只在第一行出力：

| 行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| 金额保住精确十进制 | `ExactDecimal` 与精确加法；读写经 content-blocks 的严格无损读写 | 每一跳都用它：存储、传输适配、跨进程（[content-blocks CB-2](../content-blocks/design.md#实施缺口与消费者影响)） |
| 一份账只落一次、补账的新旧可比、起止时刻同源、镜像与权威同组、补账找得到目标 | 无（汇总能把「重复的账」判成失败，但只在两份落进同一组时） | 承载记录的一侧、运行时、读面 |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-4](../../../../spec/data/call-accounts/v2/contract.md#s-4-未知是一个值不是零也不是缺席)～[S-18](../../../../spec/data/call-accounts/v2/contract.md#s-18-原账不改)、[S-37](../../../../spec/data/call-accounts/v2/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) 未知、金额、用量、费用、工具账、帧账、砍的汇总、补账、三个归属标识 | 类型 `Usage`、`Cost`、`CostItem`、`ToolCallAccount`、`FrameAccount`、`TrimSummary`、`CostCorrection`、`RunId`、`AttemptId`、`ModelCallId`；金额类型 `ExactDecimal`（不透明，内部是规范十进制串）；`"unknown"` 是一个值，类型上与数不相容 | `CostItem.service` 写一个 MCP 接入点时用 asset-model 的规范串 | V-1、V-2；`ResponseId` 是逐字副本，**家在 `data.model-response`**，对齐测试放在 [model-response](../model-response/design.md#副本定义的对齐放在依赖方) |
| [S-5](../../../../spec/data/call-accounts/v2/contract.md#s-5-金额美元十进制不截断) 金额精确（契约 G-9 交给实现） | `ExactDecimal.from(JsonNumber)`、`add`、`compare` | 读入时把 content-blocks 交出的 `number` 或 `LosslessNumber` 都换成十进制；加法用 `BigInt` 按两数小数位对齐后相加——`0.1 + 0.2` 得 `0.3`，不经二进制浮点；写出时按原精度，不截断、不补零 | 「会在丢位时失败的测试」即 G-9 的闭合条件（V-9 左列第一行） |
| [S-22](../../../../spec/data/call-accounts/v2/contract.md#s-22-有效费用)、[S-23](../../../../spec/data/call-accounts/v2/contract.md#s-23-汇总已知之和与未知笔数)、[S-24](../../../../spec/data/call-accounts/v2/contract.md#s-24-汇总不重复计) 有效费用与汇总 | `effectiveCost(target, corrections)`；`summarize(group) → { knownSum, unknownCount } \| { failed }` | 精确加法；三种明确失败（孤立补账、补账平局、重复的账）；先表示准入完整输入，再从冻结的内部权威投影取数；内部投影不带 `total_usd`、镜像笔与 `ToolCallAccount.usage` | V-5、V-6（examples 第 9 节手算）；三种失败**叫什么归读面的契约**（契约 G-10），本模块先以候选判别值交回（CA-1） |
| [S-27](../../../../spec/data/call-accounts/v2/contract.md#s-27-表示层拒绝值闭合)～[S-29](../../../../spec/data/call-accounts/v2/contract.md#s-29-判别式与枚举闭合) 五个拒绝值、六步次序、校验与判定分开 | `judgeAccountValue(kind, value)` | 结构那一半先于正负、正负先于来源、组合约束最后 | V-2；被拒的值不进汇总、也不当 `"unknown"` |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks` v2（`CallId`；严格无损读写） | [content-blocks](../content-blocks/README.md) | 随包版本 | 静态 import |
| `data.asset-model` v2（能力标识的规范串） | [asset-model](../asset-model/README.md) | 同上 | 同上 |
| `data.identity-values`、`data.offer-expiry` v1 | 已实现的 core 包 | 同上 | 同上 |
| 被消费 | messages、arrival-events、model-response、loop-extension、stream-assembly、两个运行时、拓展件 runner、会话资产注册表（可用性报告带 `attempt`，取本包的 `AttemptId`——D-060 §八 M46）、读面 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（D-060 §八 M41），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值 }`（五个之一）；汇总的明确失败 ⇒ `{ failed: 候选值 }`。两者类型不相容，**都不抛异常**；汇总遇到一个表示非法的输入值即以那个拒绝值收场，**不跳过它、不把它当 `"unknown"`**（S-23 九件事第 2 件）。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-4](../../../../spec/data/call-accounts/verification.md#静态检查义务)：SC-2、SC-3 的类型面在本节点（汇总入口的参数类型里没有 `total_usd` 与镜像笔；`cache_tokens`、`total_tokens` 不在任何导出类型里），规则形式**尚无**；SC-1（组装的输入类型）、SC-4（写原账的路径）落在组装与运行时节点。

## 实施缺口与消费者影响

契约的已知缺口（G-3～G-8、G-10、G-12）不重抄。本节点自己的缺口：

- **CA-1 汇总三种失败的名字**：`summarize` 的失败值用候选判别值；正式名字归按 Run 汇总的读面契约（契约 G-10）。受阻：读面。owner：主线。
- **精度的每一跳**：见 [content-blocks CB-2](../content-blocks/design.md#实施缺口与消费者影响)。

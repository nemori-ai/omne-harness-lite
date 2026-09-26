# messages 实现设计

> 本批设计已接受（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-045](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

契约：[`data.messages` v1](../../../../spec/data/messages/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律为**已接受的设计**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口（V-1 要求 `unevaluatedProperties`、`dependentRequired`），Schema 从 spec 原样复制进包并逐字节核对；
拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)；从 JSON 文本读消息（与运行时记录）一律经 content-blocks 的[严格无损读写](../content-blocks/design.md#严格的无损-json-读写)：契约 [S-37](../../../../spec/data/messages/v1/contract.md#s-37-规范表示) 的读写口径与 `data.content-blocks/v1#S-24` 同一条（[D-040 §八 M36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）——任何一层对象里重复的成员名 ⇒ `malformed`（读不出即拒，不挑一个再交给第一段判定），数无损、落盘与回读同一个十进制数。
`MessageId` 的词法候选与 `BlockId` 同一个（[那里的选择](../content-blocks/design.md#标识的词法沿用-identity-values-的生成器)）。**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 公开面

**全部即公开函数面**（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）：不依赖 Cordis、会话、租户或存储，单独 `import` 即用；**没有 Cordis 服务面**（[下表](#cordis-原语本节点一样也不用)）。核对：[依赖表](#依赖作用域与绑定)只有本批纯模块、已实现的 identity-values 与 offer-expiry、`ajv`，不 import `@deepseek-ai/cordis`、`kernel-basis`、`storage`，不解析任何服务键。主要导出（候选名）：

| 导出 | 契约坐标 |
|---|---|
| 判别联合 `Message`、五种运行时记录的类型；出门类型 `OutboundMessage` | [S-1](../../../../spec/data/messages/v1/contract.md#s-1-七种消息)～[S-27](../../../../spec/data/messages/v1/contract.md#s-27-compactionmessage-与它的名单)、[S-49](../../../../spec/data/messages/v1/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](../../../../spec/data/messages/v1/contract.md#s-50-调用终结的三支)；[S-34](../../../../spec/data/messages/v1/contract.md#s-34-四种直接对应)～[S-36](../../../../spec/data/messages/v1/contract.md#s-36-toolinternalmessage-不进请求) |
| `isReadable(ref, prefix)` | [S-28](../../../../spec/data/messages/v1/contract.md#s-28-此刻模型可读是算出来的) |
| `judgeCompactionList(c, prefix, inputs)` | [S-29](../../../../spec/data/messages/v1/contract.md#s-29-合法名单的判定) |
| `judgePairing(message, prefix)` | [S-32](../../../../spec/data/messages/v1/contract.md#s-32-会话日志里的配对与唯一) |
| `judgeMessage(value)`、`judgeMessageInLog(value, prefix)` | [S-37](../../../../spec/data/messages/v1/contract.md#s-37-规范表示)～[S-40](../../../../spec/data/messages/v1/contract.md#s-40-表示层拒绝不是判定也不修补) |

`prefix`（`LogPrefixView`）与 `inputs` 都是调用方交来的只读值，本模块不读日志：视图可以由会话日志的两种读（[`capability.session-log/v1`](../../../../spec/capabilities/session-log/v1/contract.md) [S-18](../../../../spec/capabilities/session-log/v1/contract.md#s-18-readbykey按读取键读)、[S-19](../../../../spec/capabilities/session-log/v1/contract.md#s-19-readsince从某个位置往后读)）拼成，也可以来自别的来源。
**函数层不承诺**：「本消息之前」唯一、名单合法性在追加点线性化、配对与唯一在日志里成立、`MessageId` 在会话日志内唯一——它们只在日志写入方成立（[装配给 vs 协议给](#装配给-vs-协议给单机时本节点提供了什么)右列，MSG-1）。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**；消费者直接 `import` | 契约「这份契约拥有什么」 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**；提供者换代时的在途事实只在写日志的一方与两个运行时里 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**。没有事件能越过租户或会话边界：消息不带租户（S-33），会话、租户、尝试的绑定在承载它的日志条目上（[第五节](../../../../spec/data/messages/v1/contract.md#五装配给与协议给)末行），归写日志的一方 | — |
| 存储 | **无**：本模块不读写日志；三项判定都收调用方给的只读视图 | — |

### 装配给 vs 协议给：单机时本节点提供了什么

[第五节](../../../../spec/data/messages/v1/contract.md#五装配给与协议给)七行里，本节点只在两行出力：

| 行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| `MessageId` 在会话日志内唯一 | 词法候选（沿用 `generateOpaqueIdentifier()`） | 铸号与唯一：会话唯一的日志写入方（MSG-1） |
| 表示层校验在每个接收边界重做 | `judgeMessage`、`judgeMessageInLog` 两个纯入口 | 在哪些边界调 |
| 「本消息之前」唯一、名单合法性在追加点线性化、配对与唯一、出门三条义务、条目绑定 | 无 | 日志写入方、传输适配 |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/messages/v1/contract.md#s-1-七种消息)～[S-27](../../../../spec/data/messages/v1/contract.md#s-27-compactionmessage-与它的名单)、[S-49](../../../../spec/data/messages/v1/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](../../../../spec/data/messages/v1/contract.md#s-50-调用终结的三支) 七种消息、底座、提醒的性质与来源、压缩名单、五种运行时记录 | 判别联合 `Message`、`ModelInvocationRecord` 等 43 个 `$defs` 的类型 | 值一律冻结 | V-1、V-3 |
| 逐字副本 `ResponseId`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment` | 类型（按本契约 Schema 里的副本写） | — | **家在 `data.model-response`**；对齐测试放在 [model-response](../model-response/design.md#副本定义的对齐放在依赖方)（它依赖本包，本包不依赖它） |
| [S-28](../../../../spec/data/messages/v1/contract.md#s-28-此刻模型可读是算出来的) 此刻模型可读 | `isReadable(ref, prefix: LogPrefixView)`；`LogPrefixView`（候选）是调用方给的只读视图：按标识找消息、找块、列出前缀里的压缩名单 | 纯函数：`path(b)` 上每块 `toModel` 为真，且没有任何名单点过 `path(b)` 里的块；**不缓存、不写下「当前可读集合」** | V-5（examples 第 11 节）；`Readable.als` 不是 formal task，不可绑定 |
| [S-29](../../../../spec/data/messages/v1/contract.md#s-29-合法名单的判定) 合法名单 | `judgeCompactionList(c, prefix, inputs)` → 合法，或 ③⑤⑥ 之一，或「判不了」 | ① ② 走表示层；③ 查前缀；⑤ 要「悬着的占位」与卡片 owner 的答复、⑥ 要「最近一次模型请求落在日志哪一处」，**都由调用方经 `inputs` 给**（参数不叫 `ctx`，免得读成 Cordis 的 Context）；缺输入时**不给「合法」**，交回「判不了」，由调用方按不合法处理 | V-4；⑤⑥ 的输入卡在契约 G-5、G-2 上（MSG-2） |
| [S-32](../../../../spec/data/messages/v1/contract.md#s-32-会话日志里的配对与唯一) 配对与唯一 | `judgePairing(message, prefix)` 只给判定 | 纯判定；**追加、幂等、去重不在本模块** | V-4 |
| [S-37](../../../../spec/data/messages/v1/contract.md#s-37-规范表示)～[S-40](../../../../spec/data/messages/v1/contract.md#s-40-表示层拒绝不是判定也不修补) 两段式拒绝值 | `judgeMessage(value)`（第一段，只看这一条）；`judgeMessageInLog(value, prefix)`（第一段通过后判 `compaction_forward_reference`）；从文本读的边界先 `readJsonStrict`，读不出即 `{ rejected: "malformed" }`（S-37，M36） | 第一段嵌入 content-blocks 的六个值、原名；`block_id_duplicate` 在整棵块树（含嵌套与派生表示）上查 | V-2；两个边界对同一坏输入给同一个值；examples 新加的重复成员名那几行 |
| [S-34](../../../../spec/data/messages/v1/contract.md#s-34-四种直接对应)～[S-36](../../../../spec/data/messages/v1/contract.md#s-36-toolinternalmessage-不进请求) 出门的三条义务 | 类型：`OutboundMessage`（候选）= `Message` 去掉 `ToolInternalMessage`；判别联合配穷尽检查（`never`） | 翻译本身在传输适配 | SC-5 的类型面：漏一种编译不过 |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks` v1 | [content-blocks](../content-blocks/README.md) | 随包版本 | 静态 import |
| `data.call-accounts` v1（`ModelCallId`、`AttemptId`） | [call-accounts](../call-accounts/README.md) | 同上 | 同上 |
| `data.model-profile` v1（`RouteName`、`ProviderName`、`ModelProfileRef`、参数词表、快照） | [model-profile](../model-profile/README.md) | 同上 | 同上 |
| `data.identity-values`、`data.offer-expiry` v1 | 已实现的 core 包 | 同上 | 同上 |
| 被消费 | model-response、loop-extension、connector、两个运行时、拓展件派发、模态投影、写日志的一方 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**失败映射只有两种，不混用：表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个）；判定得出的否定（名单不合法、配对不成立、「判不了」）⇒ 返回判定结果本身。两种返回类型不相容；**都不抛异常**。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-6](../../../../spec/data/messages/verification.md#静态检查义务) 约束的多是消费者；本节点承载的（都**尚无**）：

| 检查 | 形式 | 谁跑 |
|---|---|---|
| SC-3 不按 `createdAt` 排序比较 | `createdAt` 的类型不提供比较；规则（候选）扫比较与排序调用 | 消费者包 |
| SC-4 不写下「当前可读集合」 | 由构造：`isReadable` 是函数、不暴露集合；写日志一方的规则另立 | 日志写入方 |
| SC-5 翻译方每种消息都有落点 | 穷尽检查（`never`）让漏一种编译不过 | 模型请求运行时的传输适配 |
| SC-1、SC-2、SC-6 | 落在各消费者节点 | 各消费者 |

## 实施缺口与消费者影响

契约的已知缺口（G-1、G-2、G-5～G-7、G-11）不重抄。本节点自己的缺口：

- **MSG-1 `MessageId` 的铸号方**：词法候选已给；铸号与会话内唯一归写入方。**接口已定、真承接者未到**：[`capability.session-log/v1`](../../../../spec/capabilities/session-log/v1/contract.md) [S-3](../../../../spec/capabilities/session-log/v1/contract.md#s-3-本契约明确不承诺什么) 写明日志不铸 `MessageId`，写入方把它拼进判重键、由 [S-8](../../../../spec/capabilities/session-log/v1/contract.md#s-8-判重键) 按日志的耐久内容守「至多一条」；完整的会话日志契约与真提供者归 loop 与会话那一程（该契约 [G-1](../../../../spec/capabilities/session-log/v1/contract.md#十已知缺口)，即 [D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 的 C-1）。owner 主线。
- **MSG-2 名单判定的两项输入无家**：S-29 ⑤ 要卡片 owner 的答复（契约 G-5）、⑥ 要「最近一次模型请求落在日志哪一处」（契约 G-2：条目壳）。条目壳的最小成员与日志位置已由 `capability.session-log/v1` [S-6](../../../../spec/capabilities/session-log/v1/contract.md#s-6-条目与它的壳)、[S-7](../../../../spec/capabilities/session-log/v1/contract.md#s-7-日志位置与尾位置) 定（接口已定），壳的其余字段该契约本版不收（[S-2](../../../../spec/capabilities/session-log/v1/contract.md#s-2-本契约不拥有什么)，与本契约 G-2 同一件事），真承接者未到。本模块只能收这两样作参数、缺则「判不了」。受阻：PF-010 的压缩一侧（无契约）。owner：主线（下一程）。

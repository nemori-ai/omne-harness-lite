# 消息

**一份会话日志里的消息：七种各自是什么、带什么、谁感知得到、出门怎么办。**
提醒的来源是一张怎样的闭合表、说状态的要带什么；压缩名单长什么样、什么样的名单合法；
「此刻哪些块模型可读」怎样从日志里算出来；一次工具执行的真实结果落哪一种消息——以及一条消息不合形状时，拒绝值叫什么。

它是 core 三层（[D-035](../../../record/decisions/message-and-stream-baseline/README.md)）里**块之上的那一层共用数据契约**：
会话日志、上下文组装与压缩、流装配、工具运行时、模型请求运行时、入站受理与恢复对账都引用它的 `$defs` 名与成员名，**不各自复述一份**。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.messages, 1)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-041](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`（`acceptance` 指向 D-041 的 `acceptance.json`）。`family=data`、`topic=messages`、
  `contract_path=spec/data/messages/v1/contract.md`，`resources` 另含 `v1/messages.schema.json`、`v1/examples.md`、`v1/formal/README.md`、`v1/formal/Readable.als`；
  依赖五项：`data.content-blocks` v1（十六条，含 `S-20`）、`data.offer-expiry` v1（`S-22`）、`data.identity-values` v1（`S-11`、`S-31`）、`data.call-accounts` v1（`S-37`）、`data.model-profile` v1（`S-2`、`S-5`、`S-13`、`S-15`、`S-20`、`S-27`）。**登记在 [registry](../../../registry/README.md)，本行只作索引**
- **提供者/装配映射**：[packages/core/messages](../../../realization/packages/core/messages/README.md)；当前节点设计已由 D-042 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。消息被七类消费者共享，写两遍必然分叉；[`data.content-blocks` v1](../content-blocks/README.md) 把「哪种消息能装哪几类块」「能不能单独点名嵌套块」「`messageId` 的形状与唯一范围」「占位与真实结果各落哪种消息」明确交给了它 |
| 稳定身份 | `data.messages`，版本 1 |
| 适用范围 | 一个部署之内的一份会话日志；跨进程后要由协议重新兑现的，逐行列在[契约第五节](v1/contract.md#五装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有提交点、没有状态转移、没有自己的授权前提。消息怎样到达、怎样落盘、怎样被组装与压缩，归各自的契约；本契约定的是它们交换的那个值、以及「合法」与「此刻可读」这两个从日志算出来的判断 |
| 精确依赖 | `data.content-blocks` v1（块的全部定义，含 `#S-20` 能力标识的 `name`——拓展件的名字）、`data.offer-expiry` v1 `#S-22`（时刻）、`data.identity-values` v1 `#S-11`（「已出门」上凭据那一格的租户支）与 `#S-31`（不透明标识的散文，不 `$ref`）、`data.call-accounts` v1 `#S-37`（`ModelCallId`、`AttemptId`）、`data.model-profile` v1 `#S-2`／`#S-5`／`#S-13`／`#S-15`／`#S-19`／`#S-20`／`#S-27`（模型切换落下的那条记录的路由名；「已出门」的供应商、有效模型引用、请求参数、`extra` 不许空、两份参数清单的项名、档案快照）。`data.model-response` 是 `ResponseId` 的家、也是 `SelectedBy`／`CredentialScope`／`ParameterAdjustment`／`droppedParameters` 的原件，但它反向依赖本契约，**不登为依赖**：本契约按同一形状逐字自定义，对齐义务登在[验证入口](verification.md#对齐义务)——口径见 [registry「互引成环的登记口径」](../../../registry/README.md#covers) |
| 谁在等它 | 会话日志与条目壳、PF-010 组装与压缩、`capability.stream-assembly`、`data.model-response`、`data.loop-extension`、`data.connector`、`capability.tool-execution-runtime`、`capability.model-request-runtime` 与传输适配、PF-014 受理、PF-012 对账与循环守卫、卡片、runtime context。完整清单见[契约的消费者表](v1/contract.md#消费者)——**那里是唯一的一份** |
| 接受状态 | 已接受（D-041，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/messages.schema.json) |
| 一条消息长什么样、什么会被拒、拒绝值叫什么 | [v1 正反实例](v1/examples.md) |
| 此刻哪些块模型可读，怎么算 | [S-28](v1/contract.md#s-28-此刻模型可读是算出来的)与[实例第 11 节的五条消息](v1/examples.md#11-规范场景五条消息此刻哪些块模型可读) |
| 一份压缩名单合不合法 | [S-29](v1/contract.md#s-29-合法名单的判定)、[S-30](v1/contract.md#s-30-悬着的占位) |
| 真实结果该落工具消息还是提醒 | [S-12](v1/contract.md#s-12-真实结果落哪种消息只看有没有占位) |
| 翻译成某一家的请求时有哪些义务 | [第四节](v1/contract.md#四出门的三条义务) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#九已知缺口) |
| 结构模型检查了什么、没检查什么 | [formal 入口](v1/formal/README.md) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件五份：`contract.md`、`messages.schema.json`、`examples.md`、`formal/README.md`、`formal/Readable.als`——
**实例是规范工件，不是说明材料**：条款的边界有一半靠「什么被拒、拒绝值叫什么」说清楚。

**本包建了 `formal/`，只有 Alloy，没有 TLA+。**本契约没有状态转移；但「此刻模型可读」的派生规则与压缩名单的合法性是跨消息的结构性质，
在一份日志的所有前缀上是否同时成立，逐条读条款看不出来。模型的命令**不登记为 formal task**：`alloy exec` 的退出码与断言结果无关，登记了会得到一个永远通过的任务。
实际执行结果在[验证入口](verification.md#形式化工件)。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `data.messages` v1 的全部条款，[D-041](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

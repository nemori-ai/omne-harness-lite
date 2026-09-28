# 拓展点协议的数据半边

## v5 候选：完整快照与重试结论历史

当前已接受版本为 v4，以 registry 精确坐标为准。[v5 契约](v5/contract.md)、[Schema](v5/loop-extension.schema.json)与[实例](v5/examples.md)是 **candidate**，未接受、未冻结。本版精确采用 model-profile/v4、messages/v5 的完整输入限制快照，追加 S-42 失败结论的 `modelCallId` 与 S-43 完整有序 `retryConclusions`。13 种主体位置、权限、结论种类与回放规则保持；runtime/v6、runner/v4 须显式采用，其他消费者不自动升级。变化及实际检查见[验证入口](verification.md#v5-完整快照与重试结论历史)。以下 v4 及更早记录保留其发生时的范围。

## 当前采用与 v4 候选

当前已接受版本为 v3（D-068）。[v4 契约](v4/contract.md)、[Schema](v4/loop-extension.schema.json)与[实例](v4/examples.md)是 **candidate**，未接受、未冻结。v4 精确采用 model-profile/v3 和 messages/v4，使失败主体完整保留适配绑定；S-1～S-41、其余依赖、控制顺序和失败枚举保持原规则。runner/v3 与 model-request-runtime/v3 的升级仍为候选，其他消费者不自动切换。变化及证据见[验证入口](verification.md#v4-模型适配绑定闭包)；以下历史记录保留原版本范围。

**Agent Loop 上挂拓展件的那一套，交换的东西长什么样**——十一个位置与两个维度、干预力三档、
一件拓展件的声明、运行时交给它的输入、它交回的结论（封闭八种）、结论落日志的记录。

它与 runner 分开，因为两者的失效事件不同：**形状与合法组合**变了，所有拓展件作者、兼容层、状态转移表都要跟着改；
**瀑布怎么走、回放怎么跑**变了，只动 runner。操作那一半是 `capability.loop-extension-runner`。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.loop-extension, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`（`acceptance` 指向 D-061 的 `acceptance.json`）。`family=data`、`topic=loop-extension`、
  `contract_path=spec/data/loop-extension/v2/contract.md`，`resources` 另含同目录的 `loop-extension.schema.json` 与 `examples.md`；
  `dependencies` 列八项——两项已接受（`data.identity-values`、`data.offer-expiry`），六项是候选
  （`data.content-blocks`、`data.messages`、`data.model-profile`、`data.call-accounts`、`data.tool-definition`、`data.asset-model`），
  消费 clauses 按[契约头部的依赖表](v2/contract.md)登为条款号（2026-09-24 整批对齐由 `$defs` 名换成条款号）；`data.call-accounts` 那一项另含运行与执行尝试的标识 `RunId`、`AttemptId`（[验证入口「变化的影响」](verification.md#变化的影响)）
- **提供者/装配映射**：[packages/core/loop-extension](../../../realization/packages/core/loop-extension/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。拓展件作者（装配进来的与外部命令）、runner、状态转移表、系统自带五件、资产领域都读同一套位置、结论与记录；写两遍必然分叉 |
| 稳定身份 | `data.loop-extension`，版本 1 |
| 适用范围 | 一个部署之内、一个会话的日志上；跨进程后由协议重新兑现的那几条在[契约第十节](v2/contract.md#十装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有状态转移、没有提交点。有行为的是 runner |
| 精确依赖 | 八项，见[契约抬头](v2/contract.md)；两项已接受，六项是候选 |
| 谁在等它 | `capability.loop-extension-runner`、`capability.hooks-import`、`capability.tool-admission`、`capability.model-request-runtime`、`data.model-response` 与 `data.arrival-events`（`$ref` `FailureCause`）、PF-002 资产领域 |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 交换与存储表示 | [v1 Schema](v2/loop-extension.schema.json) |
| 一个声明、一条结论长什么样，什么会被拒 | [v1 正反实例](v2/examples.md)，含四个完整走查 |
| 一件拓展件此刻不在时怎么办 | [S-6 不可用处置的声明](v2/contract.md#s-6-声明的成员与类别)、[S-33](v2/contract.md#s-33-不可用与报错两分) |
| 一件拓展件推出哪几项设置与权限 | [S-40 属性项的推出规则](v2/contract.md#s-40-属性项的推出规则) |
| 一件拓展件以谁的租户身份做事、子进程落在哪个执行环境里 | [S-41 执行环境句柄](v2/contract.md#s-41-执行环境句柄)（读面在 `capability.loop-extension-runner` v2 S-50） |
| 某个位置能交回哪几种结论 | [档 × 结论](v2/contract.md#s-20-档与结论的合法组合)、[位置 × 结论](v2/contract.md#s-21-位置与结论的合法组合) |
| 我在写拓展件，要额外守什么 | [S-35 跨过一次等待只能带已落日志的东西](v2/contract.md#s-35-跨过一次等待只能带已落日志的东西) |
| 哪里在等裁决 | [已知缺口](v2/contract.md#十四已知缺口)：开着的是 G-1、G-4～G-6、G-15、G-16、G-18；其余已关闭，答案所在条款写在各行 |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v2/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`loop-extension.schema.json`、`examples.md`。

**本包不建 `formal/`**：两张合法组合表是有限结构，已在 Schema 里逐格写死、在 examples 末节逐格对照，
Alloy 只会重述它们；行为性质（回放一致、先落后算、同一次经过只跑一轮）的模型归 runner 能力。
理由全文在[契约第十六节](v2/contract.md#十六版本差异与规范工件)；已触发的义务在[验证入口](verification.md)，状态「未开始」。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `data.loop-extension` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

## 2026-09-26 D-068 当前 v3

`data.loop-extension · v3` 已接受并冻结，[精确契约](v3/contract.md) 的接受范围与32资源摘要见 [D-068](../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json)。本段为当前导航，以上旧版接受与验证记录保留原适用范围。新版推荐不自动升级消费者；八个core提供者须显式采用，24个外部消费者仍钉2。实现、公开旧Schema闭包及新组合证据尚待完成，不从规格接受推断通过。

2026-09-28：[D-099](../../../record/decisions/model-input-limit-consumer-contract-adoption/decision.md)在独立复评闭合后技术接受 v5；规范资源冻结。实现采用和验证另行交付，原文 candidate 是起草状态。

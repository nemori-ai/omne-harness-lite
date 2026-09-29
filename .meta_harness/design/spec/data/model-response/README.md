2026-09-29：[D-107](../../../record/decisions/model-input-usage-calibration-adoption/decision.md) 接受并冻结 v9 全45条/5资源；当前规范采用不等于真实调用/持久或实现验收。以下按原版本与日期读取。

2026-09-28：[D-104](../../../record/decisions/model-recovery-timing-adoption/decision.md) 接受本次恢复时序后继 v8 的全部规范资源；当前精确范围以该决定与 registry 为准。下文候选标签记录起草时状态，提供者迁移及真实恢复另验。

> **历史起草记录（当时状态）**：**2026-09-28 新候选**：[v6](v6/contract.md)（S-1～S-40）引用 MP4/MS5，新增待提交回复表示；未接受、未冻结。完整输入限制快照、持久根/待提交边界与证据见 [v6 验证说明](verification.md#2026-09-28-v6-候选验证)。当前已接受 v5 保持原采用。

2026-09-28：[D-100](../../../record/decisions/model-runtime-current-generation-adoption/decision.md) 接受当前后继 v7 全部规范资源；旧格式运行兼容承诺被取代，未表示实现完成。

**当前候选 `data.model-response/v7`**：[契约](v7/contract.md)与[变化及证据](verification.md#v7-发布前破坏性演进)。由已接受 v6 机械演进，只更新精确消费链并删除旧格式兼容过渡义务；当前代际在途与历史责任保持。未接受、未冻结；中央登记由本批唯一 owner 集成，旧冻结版本不改。下文既有进展按原版本和当时事件读取。


**2026-09-27 当前规范接受（D-090）**：[v5](v5/contract.md) 全38条／3资源已接受并冻结；core 显式 v5 提供者采用与旧根保持见 [决定](../../../record/decisions/model-headers-v5-adoption/decision.md)。真实采集、脱敏、交接与持久链仍待，规范内 candidate 标签按起草时间读取。

# 一次发出的完整模型响应体

**一次[模型调用](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)每向上游[发出](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send)一次，留下的那一条[模型响应体](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)**：
回复（若有）及它有没有成为消息、出错断时已交付而不成消息的部分、用量与费用、路由留痕（含实际发出的参数、改过的值与没发出去的项）、收场、故障成因与原样状态码、首 token 等时序、上游原始响应的留存引用、晚到与否。
**一次调用可能发出多次，每次一条**——试过又失败的那几次同样各是一条留痕。

**本契约只拥有「这条记录是什么、哪些组合合法」。**请求怎么发、三类事实怎么判、要不要重试、什么时候算试尽，
归模型请求运行时的能力契约；成因的名字归 `data.loop-extension`，账的形状归 `data.call-accounts`。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.model-response, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`，`family=data`、`topic=model-response`、
  `contract_path=spec/data/model-response/v2/contract.md`，`resources` 另含 `v2/model-response.schema.json` 与 `v2/examples.md`，`acceptance` 指向 D-061 的 `acceptance.json`。
  依赖七项，消费的条款以 catalog 为准、与[契约抬头的依赖表](v2/contract.md)一致：`data.call-accounts`、`data.content-blocks`、`data.messages`、`data.model-profile`、`data.loop-extension`（五份同批候选）、`data.offer-expiry`（`S-22`）、`data.identity-values`（`S-11`、`S-16`、`S-31`）
- **提供者/装配映射**：[packages/core/model-response](../../../realization/packages/core/model-response/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。响应体被写它的运行时、重试挂件、「调模型之后」的拓展件、可追溯组成、成本两层与排查共同读；**写两遍必然分叉**——尤其是收场与首 token 的那张判定表 |
| 稳定身份 | `data.model-response`，版本 1 |
| 适用范围 | 一次发出结束之后写下的那一条。**一次都没发出的调用没有响应体**（「发不出去」那一类、在待发出时就被中断的） |
| 为什么是 data 而不是 capability | 它没有操作：没有状态转移、没有提交点、没有自己的授权前提。**写它、读它、据它决定重试的那些动作**各有授权与失败，归各自的能力契约 |
| 精确依赖 | 七项，见[契约抬头](v2/contract.md)；其中五项是同批候选 |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 收场、回复及它有没有成为消息、已交付部分、故障与首 token 怎样组合才合法 | [S-13 条件关系表](v2/contract.md#s-13-收场与其余成员的条件关系) |
| 交换与存储表示 | [v1 Schema](v2/model-response.schema.json) |
| 一条响应体长什么样、什么会被拒、按 Run 怎么汇总 | [v1 正反实例](v2/examples.md) |
| 哪里在等裁决 | [已知缺口](v2/contract.md#七已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v2/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`model-response.schema.json`、`examples.md`——**实例是规范工件，不是说明材料**。

**本包不建 `formal/`。**理由：本契约没有状态转移；收场的条件关系是一张七行的有限判定表，
Schema 的条件约束逐格表达、正反实例逐格演示，在给定规模里找反例的结构模型只会与 Schema 同义。
同一次调用的响应体序列（[S-23](v2/contract.md#s-23-同一次调用的响应体序列)）是写它那一方的行为，需要行为模型时归模型请求运行时的能力契约，不在这里复制一份状态机。
本契约触发的证据义务是**规范场景与写入者的约束检查**，在[验证入口](verification.md)登记。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `data.model-response` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

## 2026-09-26 D-068 当前 v3

`data.model-response · v3` 已接受并冻结，[精确契约](v3/contract.md) 的接受范围与32资源摘要见 [D-068](../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json)。本段为当前导航，以上旧版接受与验证记录保留原适用范围。新版推荐不自动升级消费者；八个core提供者须显式采用，24个外部消费者仍钉2。实现、公开旧Schema闭包及新组合证据尚待完成，不从规格接受推断通过。

## 2026-09-27 v4 候选

[v4 契约](v4/contract.md)、[Schema](v4/model-response.schema.json) 与[规范实例](v4/examples.md) 增加完整模型适配绑定及上游实际执行方，缓存事实继续由既有 usage 承载。[v4 验证说明](verification.md#2026-09-27-v4-候选验证) 记录差异、证据义务与实际状态。本版为 candidate，依赖 model-profile/v3、messages/v4 候选；当前已接受版本仍是上述 v3，旧消费者不自动升级。

## 2026-09-27 v5 多值响应头候选

本轮基线是 [D-078 承接接受的 v4](../../../record/decisions/model-main-integration-coordination/acceptance.json)，上节候选措辞保留其历史范围。新增 [v5 完整契约](v5/contract.md)、[Schema](v5/model-response.schema.json) 与[规范实例](v5/examples.md)，坐标为 `(omne-harness-lite-design-2026-09-15, data.model-response, 5)`，仍为 **candidate，未接受、未冻结**。

v5 仅将 `raw.headers` 的值扩展为字符串或有序字符串数组，保存采得且脱敏后的值形状、数组顺序、重复和空值；其余 38 条约束的含义及七个精确依赖沿 v4。规范资源恰三份，无新操作、编号族或形式任务。catalog 新增候选坐标，covers 继承 28 条范围并保持 `reviewed: false`；不改变旧 accepted、frozen 或消费者精确采用。

[v5 验证说明](verification.md#2026-09-27-v5-多值响应头候选验证) 列出 MR5-H1～MR5-H6、产品 rev 继承边界及消费传播。真实运输事实交接、写前脱敏、同次追加和重开读取均未验证；MR5 Schema 通过不关闭运行时 G-31。完整响应的新读写链须由运行时、core 提供者、transport 与验收装配分别显式采用。

2026-09-28：[D-099](../../../record/decisions/model-input-limit-consumer-contract-adoption/decision.md)在独立复评闭合后技术接受 v6；规范资源冻结。实现采用和验证另行交付，原文 candidate 是起草状态。


## 2026-09-28 MR8 恢复时序候选

[v8 契约](v8/contract.md) 为 candidate，未接受、未冻结；只补已确认锚点的中断结算中实际 sentAt 不可用表示。当前采用不自动升级，证据与消费者责任见[验证入口](verification.md#恢复时序候选)。


## 2026-09-29 响应校准候选 v9

[v9 contract](v9/contract.md) · [验证义务](v9/verification.md)。新增增量输入计量事实及其消费；candidate，未接受、未冻结，不自动升级现有消费者。

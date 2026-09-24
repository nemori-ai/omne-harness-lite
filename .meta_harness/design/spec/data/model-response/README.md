# 一次发出的完整模型响应体

**一次[模型调用](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)每向上游[发出](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send)一次，留下的那一条[模型响应体](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)**：
回复（若有）及它有没有成为消息、出错断时已交付而不成消息的部分、用量与费用、路由留痕（含实际发出的参数、改过的值与没发出去的项）、收场、故障成因与原样状态码、首 token 等时序、上游原始响应的留存引用、晚到与否。
**一次调用可能发出多次，每次一条**——试过又失败的那几次同样各是一条留痕。

**本契约只拥有「这条记录是什么、哪些组合合法」。**请求怎么发、三类事实怎么判、要不要重试、什么时候算试尽，
归模型请求运行时的能力契约；成因的名字归 `data.loop-extension`，账的形状归 `data.call-accounts`。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.model-response, 1)`
- **状态**：`candidate`（2026-09-23 起草，此后按对齐与评审原地修订）——**未接受、未冻结**；接受前可原地修订，每次修订记在[验证入口「变化的影响」](verification.md#变化的影响)
- **catalog 映射**：已登记为 `candidate`，`family=data`、`topic=model-response`、
  `contract_path=spec/data/model-response/v1/contract.md`，`resources` 另含 `v1/model-response.schema.json` 与 `v1/examples.md`，`acceptance` 为 null。
  依赖七项，消费的条款以 catalog 为准、与[契约抬头的依赖表](v1/contract.md)一致：`data.call-accounts`、`data.content-blocks`、`data.messages`、`data.model-profile`、`data.loop-extension`（五份同批候选）、`data.offer-expiry`（`S-22`）、`data.identity-values`（`S-11`、`S-16`、`S-31`）
- **提供者/装配映射**：尚无。写它的是模型请求运行时（`capability.model-request-runtime`），其提供者设计未起草

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。响应体被写它的运行时、重试挂件、「调模型之后」的拓展件、可追溯组成、成本两层与排查共同读；**写两遍必然分叉**——尤其是收场与首 token 的那张判定表 |
| 稳定身份 | `data.model-response`，版本 1 |
| 适用范围 | 一次发出结束之后写下的那一条。**一次都没发出的调用没有响应体**（「发不出去」那一类、在待发出时就被中断的） |
| 为什么是 data 而不是 capability | 它没有操作：没有状态转移、没有提交点、没有自己的授权前提。**写它、读它、据它决定重试的那些动作**各有授权与失败，归各自的能力契约 |
| 精确依赖 | 七项，见[契约抬头](v1/contract.md)；其中五项是同批候选 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 收场、回复及它有没有成为消息、已交付部分、故障与首 token 怎样组合才合法 | [S-13 条件关系表](v1/contract.md#s-13-收场与其余成员的条件关系) |
| 交换与存储表示 | [v1 Schema](v1/model-response.schema.json) |
| 一条响应体长什么样、什么会被拒、按 Run 怎么汇总 | [v1 正反实例](v1/examples.md) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#七已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`model-response.schema.json`、`examples.md`——**实例是规范工件，不是说明材料**。

**本包不建 `formal/`。**理由：本契约没有状态转移；收场的条件关系是一张七行的有限判定表，
Schema 的条件约束逐格表达、正反实例逐格演示，在给定规模里找反例的结构模型只会与 Schema 同义。
同一次调用的响应体序列（[S-23](v1/contract.md#s-23-同一次调用的响应体序列)）是写它那一方的行为，需要行为模型时归模型请求运行时的能力契约，不在这里复制一份状态机。
本契约触发的证据义务是**规范场景与写入者的约束检查**，在[验证入口](verification.md)登记。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。

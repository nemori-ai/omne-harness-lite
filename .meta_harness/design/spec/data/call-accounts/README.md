# 一次调用的账

**一次模型调用或一次工具执行花了什么、产出多少**——用量、费用、一次执行里的逐笔费用、砍掉了多少增量、跑了多久，
以及拿不到的费用**事后怎么补**；外加从这些值求出「这次尝试／这个运行花了多少」的那条规则。

写它的有两方（模型调用一侧、工具执行一侧），读它的有到达语法、按运行汇总的读面与成本明细。
**「未知算不算零」这一条一处算错，整本账就错**，所以它有一个共同的家，其余契约引用它的值，不各自复制一份。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.call-accounts, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`（2026-09-23，`acceptance` 指向 D-061 的 `acceptance.json`）。`family=data`、`topic=call-accounts`、
  `contract_path=spec/data/call-accounts/v2/contract.md`，`resources` 另含 `spec/data/call-accounts/v2/call-accounts.schema.json`
  与 `spec/data/call-accounts/v2/examples.md`；依赖四项：`data.offer-expiry` v1（`S-22`）、`data.identity-values` v1（`S-5`、`S-11`、`S-17`、`S-31`）、`data.content-blocks` v2（`S-14`）、`data.asset-model` v2（`S-3`）。
  **登记在 registry，本行只作索引**
- **提供者/装配映射**：[packages/core/call-accounts](../../../realization/packages/core/call-accounts/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。模型调用一侧与工具执行一侧都要写账、到达语法与汇总的读面都要读账——**写两遍必然分叉**，而「未知不当零」「每笔钱只计一次」这两条一旦分叉，汇总就算错且没有报错 |
| 稳定身份 | `data.call-accounts`，版本 1 |
| 适用范围 | **一个部署之内。**本版单机，每条的领域语义在跨进程之后必须原样成立；哪些由装配给、哪些须由协议重新兑现，见[契约第六节](v2/contract.md#六装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有状态转移、没有提交点、没有自己的授权前提。有状态的是承载它的记录（`ModelResponse`、工具执行记录、补账），它们的写入归各自的契约；本契约唯一的求值是一个纯计算（[汇总](v2/contract.md#s-23-汇总已知之和与未知笔数)） |
| 精确依赖 | `data.offer-expiry` v2 的 `Instant`（S-22）；`data.identity-values` v2 的 `TenantId`（S-5）、`ScopeLayerIdentity`（S-11）、身份参数没有默认值（S-17）与不透明标识交换表示（S-31）；`data.content-blocks` v2 的 `CallId`（S-14）；`data.asset-model` v2 的能力标识规范串（S-3，接入点那一种 `service` 的写法）。**不依赖 `data.model-response`**：`ResponseId` 按同一散文自写形状，避免成环。**定义性引用，不登 catalog 依赖**：「一帧」的单位取 `data.arrival-events` v2 的 S-23 第 1 条，那份契约依赖本契约，登记会让依赖图成环；外部效果确定性的判据（`capability.tool-execution-runtime` v2 S-14）与每帧至多计一次（`capability.stream-assembly` v2 S-14）是**落点**，也不登。三处的复核登在[验证入口「对齐义务」](verification.md#对齐义务) |
| 谁在等它 | 同批第二波的 `data.arrival-events`（「记一次账」那一步的载荷）与 `capability.stream-assembly`；工具执行一侧与模型调用一侧的契约；按运行汇总的读面与成本明细。完整清单见[契约的消费者表](v2/contract.md#s-2-消费者) |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 交换与存储表示 | [v1 Schema](v2/call-accounts.schema.json) |
| 一个值长什么样、什么会被拒、得哪个拒绝值 | [v1 正反实例](v2/examples.md) |
| 「一个运行花了多少」怎么算，未知怎么传播 | [汇总的三条](v2/contract.md#五有效费用与汇总)，以及[逐项手算](v2/examples.md#9-手算汇总规则) |
| 哪里在等裁决 | [已知缺口](v2/contract.md#十已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v2/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`call-accounts.schema.json`、`examples.md`——
**实例是规范工件，不是说明材料**：五个拒绝值与它们的判定次序，一半靠「什么被拒、得哪一个」说清楚。

**本包不建 `formal/`。**理由：本契约**没有状态转移**，它的性质要么是单个值的形状与自洽，要么是一个纯计算的算术规则——
没有交错可被反驳，也没有需要在给定规模里找反例的结构关系。「一流一账」「缺账记未知」是**流与写入**的性质，
要检查它们的行为模型归 `capability.stream-assembly` 与承载记录的契约，**它们消费本契约的值定义，本契约不另造一份平行模型**。
[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务是正反实例校验、组合约束的边界测试、静态检查与规范场景，在[验证入口](verification.md)登记。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `data.call-accounts` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。


## v3 candidate（本批）

[v3完整规范](v3/contract.md)、[消费者影响](v3/consumer-impact.md)、[验证义务](v3/verification.md)。未接受、未冻结，不自动升级现有消费者。

## v4 ACK后继候选

[v4 contract](v4/contract.md) · [消费者影响](v4/consumer-impact.md) · [验证义务](v4/verification.md)。candidate，未接受；前驱v3接受状态不传递。ACK确认、真实处分与清理分别可见；本批证据未完成时不据目录存在宣称通过。

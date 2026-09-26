# 资产求值

**给定一个租户此刻在四格上的[资产持有](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)、
可选的会话格配值与一个组合根（一个 Agent Definition 的身份，加调用方从它正文读出的引用列表），算出这次装配实际用了哪些资产、每一项设置与权限取什么值、各来自哪一格、谁被滤掉以及为什么**；
另加一件：把工作区承载清单读成[工作区](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)那一格的持有。

它是[作用域求值](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)的四步——
资产求值 → 组装 → 投影 → 层级计算，[次序不可换](../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)——
**是一项纯计算**：不读存储、不记住任何东西、不产生外部效果。
持有与配值怎么被写归 `capability.asset-governance`，形状归 `data.asset-model`，注册表归 `capability.asset-registry`，
把结果装进会话归 PF-004 的契约（尚无）。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-evaluation, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`。`family=capabilities`、`topic=asset-evaluation`、
  `contract_path=spec/capabilities/asset-evaluation/v2/contract.md`，
  `resources` 另含 `v2/examples.md`、`v2/formal/Evaluation.als`、`v2/formal/README.md`；
  依赖五项：`data.identity-values` v1、`data.asset-model` v2、`data.mcp-endpoint` v2（连接目标是不是 stdio；逐动作执行权限的推出与动作集）、
  `data.tool-definition` v2（执行权限三档）、`data.loop-extension` v2（干预力三档、外部命令），
  消费 clauses 取自[契约 S-4 的被消费面表](v2/contract.md#s-4-依赖方向与被消费的面)；`capability.asset-transfer` 的分享判据是前提、不登（会成环，契约页首写明）
- **formal-tasks 映射**：**不登记**。`Evaluation.als` 的 runner `alloy exec` 退出码与断言结果无关，登记它只会得到一个永远通过的任务；
  理由与实际运行见[验证入口](verification.md#形式化工件)
- **提供者/装配映射**：[packages/core/asset-evaluation](../../../realization/packages/core/asset-evaluation/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。四步的次序、禁用与锁怎么合成、设置按资产覆盖与权限的界与挑选、工作区那一格在哪里不参与——这些规则只有一处定义，装配、注册表重填、设置页、准入判断都消费同一个结果；分散到各消费者就是四份各自漂移的求值 |
| 稳定身份 | `capability.asset-evaluation`，版本 1 |
| 适用范围 | 一个租户、一次求值的输入到结果；工作区承载清单到那一格持有的读入。**写入、存储、注册表、装配清单不在范围内** |
| 为什么是 capability 而不是 data | 它有两个操作，各有失败集合（`invalidInput`；求值另有 `compositionCycle`、`categoryUnsupported`）与闭合的判定结果（`filteredOut`、`unresolved`）；输入输出的值类型归 data 契约 |
| 精确依赖 | `data.identity-values` v1（身份值、成员资格、缺席即拒绝）；`data.asset-model` v2（持有、定义、属性声明与配值的形状，accepted）；`data.mcp-endpoint` v2（连接目标是不是 stdio、动作集与逐动作执行权限，accepted）；`data.tool-definition` v2、`data.loop-extension` v2（两种分档权限的档，accepted） |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 两个操作各自的输入、失败集合与缺席默认 | [契约第四节](v2/contract.md#四操作) |
| 四步各怎么求 | [契约第五节](v2/contract.md#五四步的求值规则) |
| 一次四格齐全的求值长什么样、每项值来自哪一格 | [规范场景](v2/examples.md) |
| 哪些性质由谁保护、前提是什么 | [契约第七节](v2/contract.md#七性质与前提) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-29](v2/contract.md#s-29-装配给的保证-vs-协议须给的保证) |
| 哪些条款映射到 Alloy 模型、模型盖不到什么 | [formal 入口](v2/formal/README.md) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |
| 我是消费者，我要的面在不在 | [契约第十二节](v2/contract.md#十二消费者核对) |
| 哪些事还没人裁 | [契约第十一节](v2/contract.md#十一已知缺口) |

## 版本包

`v2/` 是本契约的候选版本目录，含 `contract.md`、`examples.md` 与 `formal/`。

**本包建 Alloy，不建 TLA+**：禁用析取、锁截断、官方件下界、工作区滤权、团队资产不出那棵树都是**输入之间的结构关系**，
在给定规模内找反例正是 Alloy 的用法；本能力没有状态、没有交错、没有时间，行为模型会是一个只有一步的空状态机
（[契约 S-32](v2/contract.md#s-32-本版选用哪些形式工件)）。

**本包不建 Schema。**输入输出的值类型归 `data.asset-model` v2 与 `data.identity-values` v1，外壳用散文写清；
一旦某份组合契约把两个操作投影到进程外，线上形状归它。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `capability.asset-evaluation` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

## 2026-09-26 D-068 当前 v3

`capability.asset-evaluation · v3` 已接受并冻结，[精确契约](v3/contract.md) 的接受范围与32资源摘要见 [D-068](../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json)。本段为当前导航，以上旧版接受与验证记录保留原适用范围。新版推荐不自动升级消费者；八个core提供者须显式采用，24个外部消费者仍钉2。实现、公开旧Schema闭包及新组合证据尚待完成，不从规格接受推断通过。

# 资产治理

**资产怎样被做出来、被谁持有、在持有上配了什么值**——这三件事的写面，以及回答「现在是什么样」的读面。

它拥有[资产](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset--资产--asset)记录的创作、发布、提升与删除，
[官方件](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-official-asset--官方件--official-asset)的登记，
组织层与租户层的[资产持有](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)（加入、[移除](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-removal--资产移除--asset-removal)、[禁用](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)、启用、替换锁、[版本选用](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection)）
与[属性配值](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)（配值、清除、[项锁](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)），
以及 [PF-002 flows §四](../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)那张角色矩阵落成的「谁能做」。

**它不拥有求值**：锁、禁用与配值要到 `capability.asset-evaluation` v1 里才产生效果；本契约的写时守卫是提前拒绝，不是效果的权威。
**它不拥有数据形状**（`data.asset-model` v1）、复制与分享（`capability.asset-transfer` v1）、工作区那一级的持有（由承载目录读入）。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-governance, 1)`
- **状态**：`candidate`，2026-09-23 起草，2026-09-24 整批对齐；**未评审、未接受、未冻结**。候选期间语义改动直接落在 v1，每次改动记进[验证入口的「变化的影响」](verification.md#变化的影响)
- **需求 rev**：PF-001 rev 16、PF-002 rev 16、PF-003 rev 4（后者本批账本未列，取工作区当前值）
- **提供者／装配映射**：尚无

## catalog 映射

- **已登记**：`status = candidate`、`family = capabilities`、`topic = asset-governance`、
  `contract_path = spec/capabilities/asset-governance/v1/contract.md`、`resources` = `v1/contract.md`、`v1/examples.md`，`acceptance = null`。
- **依赖九项已登记**，clauses 取自[契约 S-4 的被消费面表](v1/contract.md#s-4-依赖方向与被消费的面)：
  - `data.identity-values · v1`：`S-3`、`S-5`、`S-6`、`S-8`、`S-10`、`S-11`、`S-12`、`S-16`～`S-21`、`S-23`、`S-26`、`S-27`、`S-29`～`S-34`、`CS-1`、`CS-2`、`CS-5`；
  - `data.offer-expiry · v1`：`S-6`、`S-19`；
  - `capability.organization-governance · v1`：`S-22`、`S-26`、`S-38`；
  - `data.asset-model · v1`：`S-1`～`S-16`、`S-18`～`S-23`、`S-36`（2026-09-24 整批对齐补登）；
  - 各类正文契约的两条规则与斜杠命令保留区（同日补登）：`data.tool-definition · v1` `S-16`、`S-31`；`data.skill-package · v1` `S-13`、`S-17`；`data.slash-command · v1` `S-3`、`S-4`、`S-6`、`S-11`；`data.mcp-endpoint · v1` `S-14`、`S-15`；`data.connector · v1` `S-11`。
  **不登** `capability.asset-transfer`：组合入口是它调本契约，同一次提交的约定引它的 S-18 只作指路。
- **covers**：PF-001／PF-002／PF-003 → 本契约，全部 `reviewed: false`（2026-09-23 起草时按设计依据登记，未经独立复核）。
- **formal-tasks**：不登记——本版不建形式工件（[契约 S-53](v1/contract.md#s-53-本版选用哪些形式工件)）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。创作、持有与配值被**同一套资格判定**与**同一批跨行守卫**绑在一起：替换锁要挡租户层的加入，项锁要挡租户层的配值，引用方要在移除与删除的同一提交里现求——拆开就得自造跨边界的提交协议 |
| 稳定身份 | `capability.asset-governance`，版本 1 |
| 适用范围 | 组织层与租户层的写面，出厂层只经官方件登记；**工作区那一级不经本契约**；求值、复制与分享、正文内部都不在 |
| 为什么是 capability 而不是 data | 每个写操作都有授权前置与失败模式，并有别人要调用的读面 |
| 精确依赖 | `data.identity-values` v1、`data.offer-expiry` v1、`capability.organization-governance` v1、`data.asset-model` v1、五份正文契约（见上） |
| 接受状态 | 候选，无接受依据 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 二十四个操作各自的前置、提交点、失败集合与缺席默认 | [契约第四节](v1/contract.md#四操作) |
| 十七个失败值与判定次序 | [契约 S-18](v1/contract.md#s-18-失败值闭合)、[S-19](v1/contract.md#s-19-判定次序) |
| 谁能做哪件事、每格出自哪里 | [契约 S-16](v1/contract.md#s-16-谁能做角色矩阵落成的四种资格)、[examples 第四节](v1/examples.md#四角色矩阵--操作) |
| 走一遍产品旅程与每个失败值的反例 | [examples](v1/examples.md) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-50](v1/contract.md#s-50-装配给的保证-vs-协议须给的保证) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |
| 我是消费者，我要的面在不在 | [契约第十三节](v1/contract.md#十三消费者核对) |
| 哪些事还没人裁 | [契约第十二节](v1/contract.md#十二已知缺口) |

## 版本包

`v1/` 是本契约的候选版本目录，含 `contract.md` 与 `examples.md`。

**本包不建 `formal/`，也不建 Schema**。三张状态机的每条转移都是一步守卫、一次提交，没有要行为模型才表达得出的交错；
串行化是存储给的前提，由并发演练取证；求值的结构性质归 `capability.asset-evaluation` v1 的模型。
数据形状全部归 `data.asset-model` v1 与 `data.identity-values` v1，[在这里再建一份就是第二份权威](v1/contract.md#s-53-本版选用哪些形式工件)。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

# 资产治理

**资产怎样被做出来、被谁持有、在持有上配了什么值**——这三件事的写面，以及回答「现在是什么样」的读面。

它拥有[资产](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset--资产--asset)记录的创作、发布、提升与删除，
[官方件](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-official-asset--官方件--official-asset)的登记，
组织层与租户层的[资产持有](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)（加入、[移除](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-removal--资产移除--asset-removal)、[禁用](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)、启用、替换锁、[版本选用](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection)）
与[属性配值](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)（配值、清除、[项锁](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)），
以及 [PF-002 flows §四](../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)那张角色矩阵落成的「谁能做」。

**它不拥有求值**：锁、禁用与配值要到 `capability.asset-evaluation` v2 里才产生效果；本契约的写时守卫是提前拒绝，不是效果的权威。
**它不拥有数据形状**（`data.asset-model` v2）、复制与分享（`capability.asset-transfer` v2）、工作区那一级的持有（由承载目录读入）。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-governance, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，D-061）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **需求 rev**：PF-001 rev 19、PF-002 rev 20、PF-003 rev 5（2026-09-24 按 changelog 逐条复核到当前，结论在[契约页首](v2/contract.md)）
- **提供者/装配映射**：[packages/assets/asset-governance](../../../realization/packages/assets/asset-governance/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## catalog 映射

- **已登记**：`status = accepted`、`family = capabilities`、`topic = asset-governance`、
  `contract_path = spec/capabilities/asset-governance/v2/contract.md`、`resources` = `v2/contract.md`、`v2/examples.md`，`acceptance` 指向 D-061 的 `acceptance.json`。
- **依赖十一项已登记**，clauses 取自[契约 S-4 的被消费面表](v2/contract.md#s-4-依赖方向与被消费的面)：
  - `data.identity-values · v2`：`S-3`、`S-5`、`S-6`、`S-8`、`S-10`、`S-11`、`S-12`、`S-16`～`S-21`、`S-23`、`S-26`、`S-27`、`S-29`～`S-34`（S-4 表里的 `CS-1`、`CS-2`、`CS-5` 是那份契约的消费者核对场景，不是条款，不登 clauses）；
  - `data.offer-expiry · v2`：`S-6`、`S-19`；
  - `capability.organization-governance · v2`：`S-22`、`S-26`、`S-38`；
  - `data.asset-model · v2`：`S-1`～`S-16`、`S-18`～`S-23`、`S-25`、`S-27`、`S-36`（2026-09-24 整批对齐补登；`S-27` 于 2026-09-25 修复波 1b 补登）；
  - 各类正文契约的两条规则与斜杠命令保留区（同日补登）：`data.tool-definition · v2` `S-16`、`S-31`；`data.skill-package · v2` `S-13`、`S-17`；`data.slash-command · v2` `S-3`、`S-4`、`S-6`、`S-11`；`data.mcp-endpoint · v2` `S-13`、`S-14`、`S-15`、`S-26`（`S-26` 修复波 1b 补登）；`data.connector · v2` `S-11`、`S-12`（两处 `S-13`／`S-12` 是凭据类项，2026-09-24 修订补登）；
  - `capability.asset-evaluation · v2`：`S-23`（界、挑选与分档，[S-38](v2/contract.md#s-38-assign-配值) 的写时守卫据它；2026-09-24 修订第二轮新增）。
  **不登** `capability.asset-transfer`：组合入口是它调本契约，同一次提交的约定、分享结束、`byAgent` 的来处引它的条款都只作指路（[契约 S-4](v2/contract.md#s-4-依赖方向与被消费的面) 末段）。
  - `data.loop-extension · v2`：`S-40`（属性项的推出规则；2026-09-24 独立评审第一轮新增，原 [G-5](v2/contract.md#十二已知缺口) 的那一格随之闭合）。
- **covers**：PF-001／PF-002／PF-003 → 本契约，全部 `reviewed: false`（2026-09-23 起草时按设计依据登记；独立评审第一轮核过条款指向，未经接受复核）。
- **formal-tasks**：不登记——本版不建形式工件（[契约 S-53](v2/contract.md#s-53-本版选用哪些形式工件)）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。创作、持有与配值被**同一套资格判定**与**同一批跨行守卫**绑在一起：替换锁要挡租户层的加入，项锁要挡租户层的配值，引用方要在移除与删除的同一提交里现求——拆开就得自造跨边界的提交协议 |
| 稳定身份 | `capability.asset-governance`，版本 1 |
| 适用范围 | 组织层与租户层的写面，出厂层只经官方件登记；**工作区那一级不经本契约**；求值、复制与分享、正文内部都不在 |
| 为什么是 capability 而不是 data | 每个写操作都有授权前置与失败模式，并有别人要调用的读面 |
| 精确依赖 | `data.identity-values` v1、`data.offer-expiry` v1、`capability.organization-governance` v1、`data.asset-model` v2、`capability.asset-evaluation` v2、六份正文契约（见上） |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 二十四个操作各自的前置、提交点、失败集合与缺席默认 | [契约第四节](v2/contract.md#四操作) |
| 十九个失败值与判定次序 | [契约 S-18](v2/contract.md#s-18-失败值闭合)、[S-19](v2/contract.md#s-19-判定次序) |
| 谁能做哪件事、每格出自哪里 | [契约 S-16](v2/contract.md#s-16-谁能做角色矩阵落成的四种资格)、[examples 第四节](v2/examples.md#四角色矩阵--操作) |
| 走一遍产品旅程与每个失败值的反例 | [examples](v2/examples.md) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-50](v2/contract.md#s-50-装配给的保证-vs-协议须给的保证) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |
| 我是消费者，我要的面在不在 | [契约第十三节](v2/contract.md#十三消费者核对) |
| 哪些事还没人裁 | [契约第十二节](v2/contract.md#十二已知缺口) |

## 版本包

`v2/` 是本契约的候选版本目录，含 `contract.md` 与 `examples.md`。

**本包不建 `formal/`，也不建 Schema**。三张状态机的每条转移都是一步守卫、一次提交，没有要行为模型才表达得出的交错；
串行化是存储给的前提，由并发演练取证；求值的结构性质归 `capability.asset-evaluation` v2 的模型。
数据形状全部归 `data.asset-model` v2 与 `data.identity-values` v1，[在这里再建一份就是第二份权威](v2/contract.md#s-53-本版选用哪些形式工件)。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `capability.asset-governance` v2 的全部条款，D-061 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

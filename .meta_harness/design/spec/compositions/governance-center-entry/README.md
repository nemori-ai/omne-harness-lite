# 治理中心入口

客户端 ↔ [治理中心](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)这条边在中心一侧的**整体性质与交接**：
一个到达中心的请求按什么次序被判（版本 → 认人 → 身份推导 → 补授权 → 办事）、四种入口答复怎样闭合、
交给领域操作的身份值从哪里推出来、领域的答复怎样变成线上的答复；外加公开体检、运维面、完整体检与治理中心标识。

**为什么它不能归任一单项能力**：判定次序与「判不了优先于无效」对**每一个**请求都一样，横跨
[`capability.account-identity`](../../capabilities/README.md)、[`capability.organization-governance`](../../capabilities/README.md)
与 [`composition.account-registration`](../account-registration/README.md) 三份契约；任何一份都只拥有自己那几个操作的失败集合，拥有不了整张映射。
**它不拥有任何治理语义**——那些仍在各自的契约里。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, composition.governance-center-entry, 1)`
- **状态**：`candidate`。主责产品依据 [PF-017](../../../product/PF-017-governance-center-as-deployable-application/README.md) rev 1 仍是 `draft`；它被接受之前本契约不进入接受。**未接受、未冻结，不得当作有效契约引用。**
- **catalog 映射**：已登记为 `candidate`，`acceptance` 为空。`family=compositions`、`topic=governance-center-entry`、
  `contract_path=spec/compositions/governance-center-entry/v1/contract.md`；`resources` 另含 Schema、`examples.md`、`formal/README.md`、
  `formal/EntryDecision.tla`、`formal/EntryDecision.cfg` 与七个 `formal/Validity_*.cfg`。
  依赖五项，全部 `rebase_relation: null`：`capability.account-identity` v1、`capability.organization-governance` v1、
  `composition.account-registration` v1、`data.identity-values` v1、`data.offer-expiry` v1（读邀约的返回引用它的 `OfferTiming`／`OfferState`）；
  消费 clauses 以[契约 S-2](v1/contract.md#s-2-参与方与精确承诺) 为准。
- **formal-tasks 映射**：登记一项 `governance-center-entry-v1-decision`（`EntryDecision.tla` ＋ `EntryDecision.cfg`）；七个否定配置不登记。执行结果见[验证入口](verification.md#实际执行)。
- **提供者／装配映射**：尚无。入口层的实现映射节点待立（候选位置 `realization/packages/tenancy/governance-center-entry`），
  承载装配是 [`realization/apps/tenancy-host`](../../../realization/apps/tenancy-host/README.md)（待修订）。
- **选择依据**：[提案 `governance-center-entry`](../../../record/proposals/governance-center-entry/README.md)。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。它拥有的是跨三份契约的判定次序、答复闭合与身份交接，不是任一方的操作语义 |
| 为什么进 compositions | 「每个请求先核版本、再认人、判不了就答不出、绝不说成无效」是整体性质，三个参与方各自都承诺不了 |
| 稳定身份 | `composition.governance-center-entry`，版本 1 |
| 适用范围 | 一个请求从到达中心起，到它得到答复为止；另含公开体检、运维面与治理中心标识。**客户端一侧**（标识比较、「问不到」的呈现、据点副本）不在范围内 |
| 参与方与版本 | 三份参与方契约与 `data.identity-values`、`data.offer-expiry` 两份 v1 **都已接受**；本契约只消费它们，不改它们 |
| 保护者是否明确 | 是。判定次序每一步的保护点写在 [S-10](v1/contract.md#s-10-判定次序)，失败映射写在 [S-14](v1/contract.md#s-14-失败映射)；跨进程之后谁兑现写在 [S-36](v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) |
| 未定的 | [已知缺口 G-1～G-7](v1/contract.md#十三已知缺口)，各有 owner |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [版本化契约](v1/contract.md) |
| 线上形状 | [Schema](v1/governance-center-entry.schema.json)、[正反实例](v1/examples.md) |
| 判定次序的形式模型、前提与未建模部分 | [formal 入口](v1/formal/README.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是候选版本目录。接受之后整体冻结，语义改动发布 v2，不原地改 v1；接受之前可原地修订，每次修订记进[验证入口的「变化的影响」](verification.md#变化的影响)。

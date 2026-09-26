# 资产复制与分享

**资产怎么在主体之间流动**：[资产复制](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)——
fork 一份、此后各走各的，按两条通则：**本人型**（同一个人的两个租户身份之间，发起即落地）与**组织型**（同一棵树上两个团队组织的组织级之间，目标超管确认才落地）；
[资产分享](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)——
给使用权、所有权不动、被动跟随，被分享方是一个组织或一个租户（组织内分享），本人型之外都要对方点头。确认之前的那份待确认件会过期；
分享结束之后关系又接上，**不复活**；分享方删除那份资产或把它提升到组织，分享随之结束。共守一条边界：**团队资产不出那棵隶属树**。

> **目录名 `asset-transfer` 是契约身份**，与 PF-003 包目录同名；
> 这个动作的正式名是「资产复制」，**「转移」是弃用说法**，正文一律不用。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-transfer, 1)`
- **状态**：`candidate`（2026-09-23 起草，2026-09-24 整批对齐，同日按 PF-003 rev 5 原地修订，同日第二轮修订，同日经独立评审第一轮（基线 `765b01dc`）并按[处置表](verification.md#独立评审)原地修订），**未接受、未冻结**
- **需求 rev**：PF-003 rev 5；相邻 PF-002 rev 20、PF-001 rev 17（2026-09-24 按 changelog 复核到当前，结论在[契约页首](v1/contract.md)）
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=asset-transfer`、
  `contract_path=spec/capabilities/asset-transfer/v1/contract.md`；`resources` 含契约、`examples.md`、`formal/` 下的模型、十六个配置与入口页；
  依赖五项（`capability.organization-governance` **v2**（第二轮由 v1 改钉：不复活要读 v2 新增的两个时刻）、`data.identity-values` v1、`data.offer-expiry` v1、`data.asset-model` v1、`capability.asset-governance` v1），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)（后两项 2026-09-24 整批对齐补登）
- **formal-tasks 映射**：三个任务——`asset-transfer-v1-transfer`（`Transfer.cfg`，复制那一组）、`asset-transfer-v1-share`（`Transfer_Share.cfg`，分享那一组）、`asset-transfer-v1-revival`（`Transfer_Revival.cfg`，不复活）。
  **十三个有效性核对配置不登记**：它们期望失败，与该清单的语义相反。执行结果在[验证入口](verification.md)（当前一次是 2026-09-24d，模型注释改动之后整组重跑）
- **不登记但须回头核对的读者**（登记会成环）：`capability.asset-evaluation` v1 的 PRE-2 读 [S-9](v1/contract.md#s-9-分享此刻是否生效)；`capability.asset-governance` v1 的 S-27／S-28 ④⑧ 替 [S-52](v1/contract.md#s-52-分享方删除资产或所有权易手分享随之结束) 写下结束——见[契约第十二节](v1/contract.md#十二消费者核对)
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。两类待确认件与分享记录的生命周期、方向与落点矩阵、复制血缘的判定、边界在三个时点的守卫、分享不复活——**它们被「确认是一次提交」绑在一起**：过期重判、边界与资格的再判、落地、终结记录必须同时成立 |
| 为什么是 capability 而不是 data | 每个写操作都有授权前置、结构性禁止与失败集合，还有被求值消费的一条判定（[S-9](v1/contract.md#s-9-分享此刻是否生效)） |
| 为什么不并进资产治理 | 那份拥有「一个范围里怎么创作、持有、配值」；本契约拥有「东西怎么在主体之间流动」——[PF-003 与 PF-002 的分界](../../../product/PF-003-asset-transfer-and-sharing/README.md#关系)按**改动它的原因**划：流动的方向或语义变，是这里变 |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → 组织治理、身份值、过期语义、资产形状、资产治理；组输入的一方按 [S-9](v1/contract.md#s-9-分享此刻是否生效) 的判据现读本契约的分享记录 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 十二个操作各自的前置、提交点、失败集合与缺席默认 | [契约第四节](v1/contract.md#四操作) |
| 谁的东西能到哪一层、是哪一种、要谁点头 | [契约 S-49](v1/contract.md#s-49-方向与落点矩阵逐格) |
| 「团队资产不出那棵树」在哪几处挡住 | [契约 S-12](v1/contract.md#s-12-流转边界团队资产不出那棵树) |
| 隶属解除之后分享为什么不靠事件失效、为什么不复活 | [契约 S-9](v1/contract.md#s-9-分享此刻是否生效)、[S-31](v1/contract.md#s-31-隶属解除分享在使用时失效不靠事件) |
| 分享方删除那份资产、或把它提升到组织之后，分享怎样 | [契约 S-52](v1/contract.md#s-52-分享方删除资产或所有权易手分享随之结束)（资产治理那两次提交一并写本契约的分享记录，不读本契约的判定） |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-34](v1/contract.md#s-34-装配给的保证-vs-协议须给的保证) |
| 走通的路径与每个失败值的反例 | [examples](v1/examples.md) |
| 哪些条款映射到模型、模型盖不到什么 | [formal 入口](v1/formal/README.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十一节](v1/contract.md#十一已知缺口) |

## 版本包

`v1/` 含 `contract.md`、`examples.md` 与 `formal/`。**不建 Schema**：线上形状归把这些操作送过进程边界的那份 composition，
值类型引用 `data.asset-model`、`data.identity-values`、`data.offer-expiry`。
**建 `formal/`**：确认的读写之间、发起与确认之间、确认与使用之间、断开与重建之间都有交错，每条保护都配了一个去掉它就被反驳的核对。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

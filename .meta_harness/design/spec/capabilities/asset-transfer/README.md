# 资产复制与分享

**资产怎么跨组织流动**：[资产复制](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)——
同一个人两个租户身份之间 fork 一份、此后各走各的；[资产分享](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)——
组织之间给使用权、所有权不动、被动跟随。两个动作都要对方确认，确认之前的那份待确认件会过期；
两者共守一条边界：**团队资产不出那棵隶属树**。

> **目录名 `asset-transfer` 是施工账本定的契约身份**，与 PF-003 包目录同名；
> 这个动作的正式名是「资产复制」，**「转移」是弃用说法**，正文一律不用。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-transfer, 1)`
- **状态**：`candidate`（2026-09-23 起草），**未经独立评审、未接受、未冻结**
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=asset-transfer`、
  `contract_path=spec/capabilities/asset-transfer/v1/contract.md`；`resources` 含契约、`examples.md`、`formal/` 下的模型、七个配置与入口页；
  依赖三项（`capability.organization-governance` v1、`data.identity-values` v1、`data.offer-expiry` v1），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)。
  **另两项依赖尚未登记**：`data.asset-model` v1 与 `capability.asset-governance` v1 与本契约并行起草，
  本分支的 catalog 里还没有它们的坐标（检查器拒绝未知坐标）——**合流对齐时补登**，消费面见 S-4 末两张表
- **formal-tasks 映射**：一个任务 `asset-transfer-v1-transfer`（`Transfer.tla` ＋ `Transfer.cfg`）。
  **六个有效性核对配置不登记**：它们期望失败，与该清单的语义相反。执行结果在[验证入口](verification.md)
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。两类待确认件与分享记录的生命周期、复制血缘的判定、边界在三个时点的守卫——**它们被「确认是一次提交」绑在一起**：过期重判、边界与资格的再判、落地、终结记录必须同时成立 |
| 为什么是 capability 而不是 data | 每个写操作都有授权前置、结构性禁止与失败集合，还有被求值消费的一条判定（[S-9](v1/contract.md#s-9-分享此刻是否生效)） |
| 为什么不并进资产治理 | 那份拥有「一个范围里怎么创作、持有、配值」；本契约拥有「东西怎么跨组织进来」——[PF-003 与 PF-002 的分界](../../../product/PF-003-asset-transfer-and-sharing/README.md#关系)按**改动它的原因**划：流动的方向或语义变，是这里变 |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → 组织治理、身份值、过期语义、资产形状、资产治理；求值读本契约 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 十一个操作各自的前置、提交点、失败集合与缺席默认 | [契约第四节](v1/contract.md#四操作) |
| 「团队资产不出那棵树」在哪几处挡住 | [契约 S-12](v1/contract.md#s-12-流转边界团队资产不出那棵树) |
| 隶属解除之后分享为什么不靠事件失效 | [契约 S-31](v1/contract.md#s-31-隶属解除分享在使用时失效不靠事件) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-34](v1/contract.md#s-34-装配给的保证-vs-协议须给的保证) |
| 走通的路径与每个失败值的反例 | [examples](v1/examples.md) |
| 哪些条款映射到模型、模型盖不到什么 | [formal 入口](v1/formal/README.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十一节](v1/contract.md#十一已知缺口) |

## 版本包

`v1/` 含 `contract.md`、`examples.md` 与 `formal/`。**不建 Schema**：线上形状归把这些操作送过进程边界的那份 composition，
值类型引用 `data.asset-model`、`data.identity-values`、`data.offer-expiry`。
**建 `formal/`**：确认的读写之间、发起与确认之间、确认与使用之间都有交错，每条保护都配了一个去掉它就被反驳的核对。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

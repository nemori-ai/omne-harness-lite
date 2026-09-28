# 模型档案目录

2026-09-28：[D-100](../../../record/decisions/model-runtime-current-generation-adoption/decision.md) 接受当前后继 v5 全部规范资源；旧格式运行兼容承诺被取代，未表示实现完成。

**当前候选 `capability.model-profile-directory/v5`**：[契约](v5/contract.md)与[变化及证据](verification.md#v5-发布前破坏性演进)。由已接受 v4 机械演进，只更新精确消费链并删除旧格式兼容过渡义务；当前代际在途与历史责任保持。未接受、未冻结；中央登记由本批唯一 owner 集成，旧冻结版本不改。下文既有进展按原版本和当时事件读取。


**系统里有哪些[模型档案](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)、各自在册还是已撤回，以及每个租户的[模型凭据](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)绑在哪**（组织那一层不持有凭据）。
它住在[治理中心](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)一侧：
组织超管与租户在这里建档、修订、撤回、恢复在册，租户配、换、解除自己那一把凭据；官方档案随系统发布的清单装入（撤回与恢复也只经清单）；
[会话据点](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)上的模型请求运行时从这里读档案、取凭据。

**它不拥有**档案记录的形状与路由名唯一的规则（已接受目录 v3 采用 `data.model-profile` v3；目录 v4 候选采用数据 v4）、合法目标集合与一次模型调用（`capability.model-request-runtime`）、
「这个范围允许哪几条档案」（`capability.asset-evaluation` v2），也不拥有凭据本体的保管（提供者设计）。**依赖方向是单向的：本契约 → 档案形状、身份值、组织治理（只取成员资格判定）**；
模型请求运行时消费本契约，本契约不消费它。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.model-profile-directory, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 accepted。`family=capabilities`、`topic=model-profile-directory`、
  `contract_path=spec/capabilities/model-profile-directory/v2/contract.md`，`resources` 另含 `v2/examples.md`；
  依赖五项，消费 clauses 取自[契约 S-4 的被消费面表](v2/contract.md#s-4-依赖方向与被消费的面)：
  `data.model-profile` v2、`data.identity-values` v1、`data.asset-model` v2、`data.offer-expiry` v1、`capability.organization-governance` v1
- **formal-tasks 映射**：无——本版不建 TLA+／Alloy，理由见[契约 S-24](v2/contract.md#s-24-本版选用哪些形式工件)
- **提供者/装配映射**：[packages/model/model-profile-directory](../../../realization/packages/model/model-profile-directory/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。
- **v3 适配绑定版本**：[契约](v3/contract.md)与[实例](v3/examples.md)，已接受并冻结；它不因 v4 候选出现自动支持新增输入限制表示。

- **当前已接受版本**：目录 v3，精确状态按 catalog 及 [D-078](../../../record/decisions/model-main-integration-coordination/decision.md)；上文 v2 接受记录保留历史范围。
- **新候选**：`capability.model-profile-directory` v4；[契约](v4/contract.md)、[实例](v4/examples.md)。PF-013 rev 14 / D-096，精确消费 data.model-profile v4 的完整 caps/facts，保留十操作及八失败值。状态 candidate，不自动升级任何消费者。

## 准入核对

- **独立责任**：档案登记与凭据绑定的写面带管理授权、住在中心；它的变化原因（管理员建档、系统发布、凭据轮换）与据点侧运行时（一次调用怎样发、怎样收场）不同，消费者也不同（交付面管理页、系统发布、据点运行时）。起草之初两者并在一份里，主线后来把它们拆开（[契约第十二节](v2/contract.md#十二版本差异与规范工件)）。
- **稳定身份与版本**：v2 已接受并冻结；v3 已接受；v4 是同一能力的演进候选，不自动升级消费者。
- **依赖**：v2 的五份依赖均已接受；v4 只将 `data.model-profile` 升至 v4 候选，其余精确版本与条款沿用。共享候选变化时重核，不把草稿并存当成已经共同接受。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 当前已接受版本精确承诺什么 | [v3 契约](v3/contract.md)与[实例](v3/examples.md) |
| 新候选的完整输入限制、事实、时标与旧行失败口径 | [v4 契约](v4/contract.md)与[实例](v4/examples.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |
| 还有哪些没定、等谁裁 | [v4 已知缺口](v4/contract.md#十已知缺口)，旧采用者仍查自己的冻结版本 |

## 版本包

`v2/`、`v3/` 已冻结，`v4/` 是演进候选。发布（接受并冻结）之后规范正文与实例不可原地覆盖，修改发布新版本；执行记录留在版本目录外（[验证入口](verification.md)）。本轮不新增 capability Schema 或平行注册状态机。

## 2026-09-26 版本接受

本次接受 `capability.model-profile-directory` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

2026-09-28：[D-099](../../../record/decisions/model-input-limit-consumer-contract-adoption/decision.md)在独立复评闭合后技术接受 v4；规范资源冻结。实现采用和验证另行交付，原文 candidate 是起草状态。

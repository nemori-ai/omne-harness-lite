# 模型档案目录

**系统里有哪些[模型档案](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)、各自在册还是已撤回，以及每个租户的[模型凭据](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)绑在哪**（组织那一层不持有凭据）。
它住在[治理中心](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)一侧：
组织超管与租户在这里建档、修订、撤回、恢复在册，租户配、换、解除自己那一把凭据；官方档案随系统发布的清单装入（撤回与恢复也只经清单）；
[会话据点](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)上的模型请求运行时从这里读档案、取凭据。

**它不拥有**档案记录的形状与路由名唯一的规则（`data.model-profile` v1）、合法目标集合与一次模型调用（`capability.model-request-runtime` v1）、
「这个范围允许哪几条档案」（`capability.asset-evaluation` v1），也不拥有凭据本体的保管（提供者设计）。**依赖方向是单向的：本契约 → 档案形状、身份值、组织治理（只取成员资格判定）**；
模型请求运行时消费本契约，本契约不消费它。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.model-profile-directory, 1)`
- **状态**：`candidate`（2026-09-23 起草；2026-09-24 经第一轮独立评审并按处置修订；2026-09-25 修复波 2 按第二轮独立复评原地改，处置表在[验证入口](verification.md#独立评审)；同日「公开面」修订波写明本版允许集合的来路、凭据本体改指保管方接口契约——[修订波](verification.md#修订波2026-09-25-公开面)）——未接受、未冻结
- **catalog 映射**：已登记为 candidate。`family=capabilities`、`topic=model-profile-directory`、
  `contract_path=spec/capabilities/model-profile-directory/v1/contract.md`，`resources` 另含 `v1/examples.md`；
  依赖五项，消费 clauses 取自[契约 S-4 的被消费面表](v1/contract.md#s-4-依赖方向与被消费的面)：
  `data.model-profile` v1、`data.identity-values` v1、`data.asset-model` v1、`data.offer-expiry` v1、`capability.organization-governance` v1
- **formal-tasks 映射**：无——本版不建 TLA+／Alloy，理由见[契约 S-24](v1/contract.md#s-24-本版选用哪些形式工件)
- **提供者／装配映射**：尚无

## 准入核对

- **独立责任**：档案登记与凭据绑定的写面带管理授权、住在中心；它的变化原因（管理员建档、系统发布、凭据轮换）与据点侧运行时（一次调用怎样发、怎样收场）不同，消费者也不同（交付面管理页、系统发布、据点运行时）。起草之初两者并在一份里，主线后来把它们拆开（[契约第十二节](v1/contract.md#十二版本差异与规范工件)）。
- **稳定身份与版本**：首版 v1，候选。
- **依赖**：三份已接受（`data.identity-values`、`data.offer-expiry`、`capability.organization-governance`），两份候选（`data.model-profile`、`data.asset-model`）——候选依赖改动时本契约须重核。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [版本化契约](v1/contract.md) |
| 每个操作走通是什么样、每个失败值的反例 | [规范实例](v1/examples.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |
| 还有哪些没定、等谁裁 | [已知缺口](v1/contract.md#十已知缺口) |

## 版本包

`v1/` 是候选版本目录。发布（接受并冻结）之后规范正文与实例不可原地覆盖，修改发布新版本；执行记录留在版本目录外（[验证入口](verification.md)）。

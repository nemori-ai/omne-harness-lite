# 系统要求的架构落实

[当前架构](README.md) · [上游要求正文](../requirements/README.md)

本页是投影和导航，确认范围只由所链接的要求正文维护。目录迁移与职责调整依据
[D-004](../decisions/D-004-requirements-foundation.md)，旧 ID 保留。

| ID 与正文 | 当前设计对应及缺口 |
|---|---|
| [SYS-IDENTITY](../requirements/system/constraints.md#sys-identity) | [系统定位](README.md#系统定位) |
| [SYS-KERNEL](../requirements/system/constraints.md#sys-kernel) | [内核边界](README.md#内核与自建边界)采用官方 Cordis 4.0.2；[D-006](../decisions/D-006-dsh-core-adoption.md)限定自有 fork 来源 |
| [SYS-DYNAMIC](../requirements/system/fully-dynamic-system.md) | [能力建模方法](../architecture-guide/modeling/capabilities.md)，完整达成判断待明确 |
| [SYS-SPEC](../requirements/system/constraints.md#sys-spec) | [规格与证据方法](../architecture-guide/assurance/specification.md)；已接受身份与精确版本归 [catalog](../../spec/catalog.json)，实现和验证范围分别核对 |
| [SYS-DEPLOY](../requirements/system/constraints.md#sys-deploy) | [部署设计方法](../architecture-guide/runtime/distribution.md)，具体边界待逐能力定义 |
| [SYS-TENANT](../requirements/system/constraints.md#sys-tenant) | [D-008](../decisions/D-008-core-capabilities.md)接受本批租户与动作授权契约；[租户提供者](../../packages/governance/tenant/design.md)与[授权提供者](../../packages/governance/authorization/design.md)说明当前映射，产品组合仍待验收 |
| [SYS-LLM](../requirements/system/constraints.md#sys-llm) | [D-008](../decisions/D-008-core-capabilities.md)接受本批模型/多模态及统一 OpenRouter 出口；[模型规格](../../spec/capabilities/model-execution/v1/contract.md)的真实提供者和请求组合仍待验收 |
| [SYS-OBSERVABILITY](../requirements/system/observability-and-logging.md) | [工程观测 v1](../../spec/capabilities/engineering-observation/v1/contract.md)约束事实、缺口与受治理读面；[D-010](../decisions/D-010-shared-diagnostics.md)固定 P1 日志/trace 实施选择。产品、跨进程/节点及完整读面仍待分阶段验证 |
| [SYS-EXPERIMENT](../requirements/system/constraints.md#sys-experiment) | [当前阶段](README.md#系统定位)，历史材料不构成实现兼容承诺 |

产品与其他目标覆盖见[当前架构](README.md#需求覆盖与缺口)。这些 ID 不替代精确
契约身份；说明、候选 Schema 或检查器均不能削弱要求。

## 治理与组织依据

| 既有 ID | 正文拥有者 |
|---|---|
| SYS-REUSE | [共享定义规则](../maintenance/organization.md#共享定义) |
| GOV-DECISION | [D-002](../decisions/D-002-decision-authority.md)，需求前提与适用性由 [D-004](../decisions/D-004-requirements-foundation.md) 补充；落实见[知识流转](../maintenance/knowledge-flow.md) |
| GOV-MODEL | [D-003](../decisions/D-003-defensive-evaluation.md) 与[评估体系](../evaluation/README.md) |

# 系统要求的架构落实

[当前架构](README.md) · [上游要求正文](../requirements/README.md)

本页是投影和导航，确认范围只由所链接的要求正文维护。目录迁移与职责调整依据
[D-004](../decisions/D-004-requirements-foundation.md)，旧 ID 保留。

| ID 与正文 | 当前设计对应及缺口 |
|---|---|
| [SYS-IDENTITY](../requirements/system/constraints.md#sys-identity) | [系统定位](README.md#系统定位) |
| [SYS-KERNEL](../requirements/system/constraints.md#sys-kernel) | [内核边界](README.md#内核与自建边界)，上游采用版本仍需固定 |
| [SYS-DYNAMIC](../requirements/system/fully-dynamic-system.md) | [能力建模方法](../architecture-guide/modeling/capabilities.md)，完整达成判断待明确 |
| [SYS-SPEC](../requirements/system/constraints.md#sys-spec) | [规格与证据方法](../architecture-guide/assurance/specification.md)，尚无已接受业务规格 |
| [SYS-DEPLOY](../requirements/system/constraints.md#sys-deploy) | [部署设计方法](../architecture-guide/runtime/distribution.md)，具体边界待逐能力定义 |
| [SYS-TENANT](../requirements/system/constraints.md#sys-tenant) | [租户候选](../proposals/tenant-contracts/README.md)，多组织协作要求归 PF-001 |
| [SYS-LLM](../requirements/system/constraints.md#sys-llm) | [模型候选](../proposals/model-contracts/README.md)，数据档案不证明请求兑现 |
| [SYS-OBSERVABILITY](../requirements/system/observability-and-logging.md) | 工程全链路可观测、关键日志及覆盖缺口的明确要求；跨异步/进程/节点和重建的关联、日志/指标/轨迹责任、受治理读面与验证尚缺完整设计，现有局部状态展示不能代替 |
| [SYS-EXPERIMENT](../requirements/system/constraints.md#sys-experiment) | [当前阶段](README.md#系统定位)，历史材料不构成实现兼容承诺 |

产品与其他目标覆盖见[当前架构](README.md#需求覆盖与缺口)。这些 ID 不替代精确
契约身份；说明、候选 Schema 或检查器均不能削弱要求。

## 治理与组织依据

| 既有 ID | 正文拥有者 |
|---|---|
| SYS-REUSE | [共享定义规则](../maintenance/organization.md#共享定义) |
| GOV-DECISION | [D-002](../decisions/D-002-decision-authority.md)，需求前提与适用性由 [D-004](../decisions/D-004-requirements-foundation.md) 补充；落实见[知识流转](../maintenance/knowledge-flow.md) |
| GOV-MODEL | [D-003](../decisions/D-003-defensive-evaluation.md) 与[评估体系](../evaluation/README.md) |

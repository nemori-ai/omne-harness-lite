# 账号建立与个人范围激活

本组合拥有受信 init 与后续 signup 共用的 Account→Tenant→激活完成条件和故障接续；不会把它们合并为同一能力。

- 契约坐标：`(omne-harness-lite-design-2026-09-15, composition.account-registration, 1)`。
- 采用状态：v1 候选，尚未登记 catalog、接受或冻结。
- 需求与决定：[PF-026.C1/C3/C5](../../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、[D-016](../../../decisions/account-identity/decision.md) 与接受统一创建语义的 [D-017](../../../decisions/personal-tenant-creation/decision.md)。
- 精确依赖：同 baseline `data.core-work@1` CD-01/02、`capability.account-identity@1` AI-01/02/02a/04/05/08、`capability.tenant-governance@1` TG-01/03、`composition.core-work-coordination@1` CC-03/06、`capability.durable-records@1` DR-01。均为候选；F 直读、T 单流与真实恢复符合性尚未验证。

## 按当前问题展开

| 问题 | 入口 |
|---|---|
| init/signup 共用链的状态与失败 | [v1 候选契约](v1/contract.md) |
| 可辨结果与反例 | [规范场景](v1/scenarios.md) |
| 现有模型的覆盖边界与前提 | [TLA+ 映射](v1/formal/README.md) |
| 形式化和真实组合的义务 | [验证范围](verification.md) |

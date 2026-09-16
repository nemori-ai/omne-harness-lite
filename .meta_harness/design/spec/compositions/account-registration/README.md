# 账号注册与个人租户交接

本组合拥有账号身份与 Tenant 两个事实权威之间的注册完成条件和故障接续；不会把它们合并为同一能力。

- 契约坐标：`(omne-harness-lite-design-2026-09-15, composition.account-registration, 1)`。
- 采用状态：v1 候选，尚未登记 catalog、接受或冻结。
- 需求与决定：[PF-026.C1/C3/C5](../../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、[D-016](../../../decisions/account-identity/decision.md) 与接受统一创建语义的 [D-017](../../../decisions/personal-tenant-creation/decision.md)。
- 精确依赖：同 baseline `data.core-work@1` CD-01/02、`capability.account-identity@1` AI-01/02/02a/04/05/06、`capability.tenant-governance@1` TG-01/02/03、`composition.core-work-coordination@1` CC-03/05/06、`capability.durable-records@1` DR-01。均为候选；受信导入、统一受限批次与真实恢复映射尚未验证，阻止本组合发布。

## 按当前问题展开

| 问题 | 入口 |
|---|---|
| 跨 owner 注册的状态、交接与失败 | [v1 候选契约](v1/contract.md) |
| 可辨结果与反例 | [规范场景](v1/scenarios.md) |
| 有限行为模型及前提 | [TLA+ 映射](v1/formal/README.md) |
| 形式化和真实组合的义务 | [验证范围](verification.md) |

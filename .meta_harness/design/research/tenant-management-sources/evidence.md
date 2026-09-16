# 租户管理与角色来源：证据记录

- 消费对象：TG/AU/BG 覆盖判断、条款 lineage 与 provider gap
- 源：`docs/research/tenant-management-sources.md`，固定提交 `e3573ca72d18bfe7ddd002df5025551b51eede46`，SHA-256 `2cdb7fb0c3586895d1f9e1fb3038daf4f19a18c1e127edd8e763e97858e2a436`
- 取得：P0 固定源清单逐字节核对；源页内外部链接固定 omne-next 提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`
- 实际观察：固定 omne-next 6263fed 的要求、源码与测试显示自然人身份和 tenant membership 分离，最高管理者保护与当前资格需显式维护。
- 支持范围：只支持源页列出的文档/源码/测试事实及其明确局限
- 不支持：新 baseline 接受、运行符合、跨版本全面等价、未执行实验或未列出的产品政策

## 当前事实、Draft 边界与反例

- PF-010 的持续责任是“谁在何 tenant 范围管理哪些对象及其生命周期语义”；PF-006 拥有设置/
  definition authorization 的实际求值与生效；PF-013 拥有 Session/Run 停止。管理入口不能
  冒充这些能力的状态 owner。
- 组织最高管理资格不授予私人 Session 内容、个人设备/外部账号同意、平台治理或租户外权限。
  草稿 discard、已发布 retire、移除 acquisition、撤销 entitlement 是不同操作，不能用统一 CRUD
  的 delete 合并。
- `user-settings-aggregate-projection.md` 是 **Draft**：其 CQRS/facade、字段 owner、UI/Agent 可编辑
  交集均未接受，不能阻止当前 Accepted 来源要求的直接管理入口，也不能授权 Agent 改任意用户事实。

## 可恢复坐标与状态

固定 `nemori-ai/omne-next@6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；下表路径相对于
该固定提交的 `omne_harness/`：

| 来源 | 状态 | 路径 / 定位 |
|---|---|---|
| membership/journey | Accepted · current | `requirements/capabilities/tenant-organization-tenant-and-membership-lifecycle.md`；`requirements/capabilities/first-party-agent-asset-and-custom-agent-management-journey.md`，Outcome/PORTAL/failure semantics |
| authoring/acquisition/entitlement | Accepted · current | `requirements/capabilities/agent-definition-authorized-agent-asset-authoring-and-immutable-release.md`；`requirements/capabilities/agent-definition-authorized-agent-asset-acquisition-and-version-selection.md`；`requirements/capabilities/tenant-effective-agent-asset-entitlement-lifecycle.md` |
| profiles/model selection/device consent | Accepted · current | `requirements/capabilities/blueprint-model-profile-as-one-fully-filled-form.md` AC-3～6；`requirements/capabilities/durable-session-model-selection-and-non-degrading-continuity.md` AC-1～3；`requirements/capabilities/resource-owner-consented-device-capability-use.md` AC-3～7 |
| settings aggregate | **Draft**，含 2026-08-04 对账 | `design_docs/cross-cutting/user-settings-aggregate-projection.md` §1～3；仅作范围核对 |

本轮未执行隔离、并发修改、重试或依赖影响测试，也未采用旧角色枚举、统一写 facade、数据库
或接口形式。Accepted 与 Draft 的区分只来自固定源页状态。

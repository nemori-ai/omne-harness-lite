# 个人租户创建协议统一候选

本提案比较首次部署 `init` 与后续账号注册如何共用 Tenant 的个人租户唯一 claim、提交、认回和恢复协议。用户已接受[统一机制的架构方向 D-017](../../decisions/personal-tenant-creation/decision.md)；[候选 B](alternatives.md#候选-b统一-global-personal-index推荐)中的 global index、流形状和提供者协议仍须独立设计与验证。

- 状态：统一创建语义已接受；具体索引/编码/交付机制仍为 candidate，无发布规格或实现可用声明。
- 选择对象：Tenant/CC/DR 对 personal tenant 创建的内部协议及受限混合批次权限；账号权威仍由 [D-016](../../decisions/account-identity/decision.md) 确定。
- 输入：[PF-026.C1/C3/C5](../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、D-016；同 baseline 候选 [AI-01/02/04/05](../../spec/capabilities/account-identity/v1/contract.md)、[ACR-03～06](../../spec/compositions/account-registration/v1/contract.md)、[TG-01](../../spec/capabilities/tenant-governance/v1/contract.md)、[DR-01～04](../../spec/capabilities/durable-records/v1/contract.md)、[CC-03/06](../../spec/compositions/core-work-coordination/v1/contract.md)。后续创建的 TG-01a 仅见待整合增量 `b47cd0e`，尚非当前 HUB 事实；上述规格仍为 candidate。

## 准入核对

Tenant 已拥有 personal tenant、唯一有效 owner 与个人唯一 claim；Account 候选定义了耐久 pending 身份与稳定 target，ACR 规定跨 owner 激活屏障。剩余选择是：首次 `init` 的三流 bootstrap 和后续注册的二流创建如何分配受信许可、共同状态与恢复责任。[三个候选](alternatives.md)分别使用双协议、统一 global index、按账号分区 claim，具有实际存储和权限差异。

## 阅读与消费

| 当前问题 | 入口 |
|---|---|
| 覆盖、性质、动作链与待闭合证明 | [设计正文](design.md) |
| 三候选及取舍 | [候选比较](alternatives.md) |
| 评审对象、状态和未决项 | [评审记录](review.md) |

D-017 要求 TG、CC、DR 候选规格及 Tenant/Records/Admission provider 映射以统一语义重写并验证；ACR 保留账号 active 的跨 owner 屏障。现有 DR/CC 候选尚未授权后续混合写，设计候选存在不构成实施许可。

# 个人租户创建协议统一候选

本提案比较首次部署 `init` 与后续账号注册如何共用 Tenant 的个人租户创建协议。用户已接受[统一机制 D-017](../../decisions/personal-tenant-creation/decision.md)；后续 [D-021](../../decisions/account-personal-local-creation/decision.md) 接受直接受信读取 F 与单目标流，取代本提案 global index、混合流和耐久导入的旧候选机制。下列比较保留为来源，不是当前实施入口。

- 状态：统一创建语义与后续单流边界已接受；本提案的 global index/混合流候选已被取代，无发布规格或实现可用声明。
- 原选择对象：Tenant/CC/DR 对 personal tenant 创建的内部协议及受限混合批次权限；账号权威仍由 [D-016](../../decisions/account-identity/decision.md) 确定。
- 输入：[PF-026.C1/C3/C5](../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、D-016；同 baseline 候选 [AI-01/02/04/05](../../spec/capabilities/account-identity/v1/contract.md)、[ACR-03～06](../../spec/compositions/account-registration/v1/contract.md)、[TG-01](../../spec/capabilities/tenant-governance/v1/contract.md)、[DR-01～04](../../spec/capabilities/durable-records/v1/contract.md)、[CC-03/06](../../spec/compositions/core-work-coordination/v1/contract.md)。后续创建的 TG-01a 仅见待整合增量 `b47cd0e`，尚非当前 HUB 事实；上述规格仍为 candidate。

## 原提案的准入核对

Tenant 已拥有 personal tenant、唯一有效 owner 与个人唯一 claim；Account 候选定义了耐久 pending 身份与稳定 target，ACR 规定跨 owner 激活屏障。本提案当时将首次 `init` 的三流 bootstrap 和后续注册的二流创建作为比较前提；[三个候选](alternatives.md)据此比较双协议、统一 global index、按账号分区 claim。D-021 已改变该机制前提，历史比较不能覆盖当前决定。

## 阅读与消费

| 当前问题 | 入口 |
|---|---|
| 覆盖、性质、动作链与待闭合证明 | [设计正文](design.md) |
| 三候选及取舍 | [候选比较](alternatives.md) |
| 评审对象、状态和未决项 | [评审记录](review.md) |

D-017 的统一语义由 D-021 的单目标流设计进一步确定；当前精确条款、模型和未验证边界沿[D-021](../../decisions/account-personal-local-creation/decision.md)及其规格展开。历史候选不构成实施许可。

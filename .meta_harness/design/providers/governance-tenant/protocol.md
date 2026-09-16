# Tenant 当前协议

本页提取来源设计中仍约束 TG 的当前协议；它是 candidate 施工输入。现有代码只有共享值、
严格 decoder 与纯 fold，`TenantHost`、Cordis plugin、身份适配和运行资格门尚未实现。

## 正向事实与 pending 交集

每个 owner 分别保存逻辑 root、耐久 root，以及按位置排列的全部未耐久 pending roots。
member、entitlement、grant 与 setting 的当前允许集合，取耐久正向依据与**所有** pending
root 所允许集合的交集。不能只比较最终逻辑 root 与耐久 root：撤销后又授予均在 pending
时，跳过中间 root 会让尚未耐久的正向权利提前生效。

撤销在逻辑位置立即封闭之后的准入；新增或扩大权利只有耐久后才可消费。来源缺失或无法
证明完整时返回 unavailable/complete=false，不把它解释为空集合或默认允许。重加入产生新
joinedRevision，旧 grant 不因 userId 相同复活。

首次 personal bootstrap 的逻辑排位只作为唯一初始化/claim 的冲突占位；资格读面
不得直接消费未耐久 `tenant.created` 的 owner/member。Tenant owner 门内核对初始化
前态（不是 JSONL 物理空文件）及 seed user，恢复以完整共同批次验证 bootstrap、
personal claim、created 的个人 tenantId、creator、唯一 owner/member 同一自然人；
单流 decoder 各自通过仍不足以开放。只有完整耐久发布后才让新增资格可读；
unknown、sync 失败和 blocked publication 均不开放。

## 与预算核算的边界

TG 拥有 tenant/member 以及 `budget.manage` 等管理资格，负责入口是否可用；它不拥有
SubscriptionLink 的本地关联、变更意图、结果或对账状态。BG 唯一保存这些状态，供应方仍
拥有实际订阅事实。跨能力操作必须在共同门中重读 TG 资格与 BG 修订。

# 账号到个人租户的单机创建边界

- 状态：候选 B 推荐；架构结构复核无阻断，精确规格和形式模型仍在修订。本包不自行接受或发布。
- 选择对象：首版单机中，独立 Account/Tenant 语义 owner 怎样共同实现首次 init 与后续注册的唯一个人租户，而不把一次旅程误作同一操作、也不预建分布式交付。
- 需求与已接受边界：[PF-026](../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、[单机与身份约束](../../requirements/system/constraints/requirements.md)、[D-016](../../decisions/account-identity/decision.md)、[D-017](../../decisions/personal-tenant-creation/decision.md)。
- 范围：现有能力覆盖、三项真实候选、一次真实动作链和恢复、Cordis 插件/提供者映射；不选具体认证库或宣称产品符合。

从[覆盖与动作链](design.md)理解需要保护的性质，再读[候选与取舍](alternatives.md)；独立[架构评审](review.md)只核结构，规格和模型另行评审。原[个人租户创建提案](../personal-tenant-creation/README.md)支持 D-017 的“统一”决定；其中 global index、混合流、导入证明仍是未接受的旧候选，不能作为本包的既定约束。

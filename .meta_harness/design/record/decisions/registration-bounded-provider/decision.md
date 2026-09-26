# D-043 · 注册组合与有界账号衔接

2026-09-25，主线在用户已授权治理CLI/TUI完整交付范围内作技术采用。依据[机制提案与评审](../../proposals/governance-production-mechanisms/review.md)、D040/D042及[AR2提供者候选](../../../realization/packages/tenancy/account-registration/v2-design.md)。

接受composition.account-registration v2 S1～36及登记的规范资源，采用AR2提供者增量。规格独立复审原三项阻断已闭合；末处旧组织读取及清扫强取消简述由作者按复审意见逐句修正。architecture-reviewer对节点hash `1eb3f3ee6df9ff2479a5f796dedb15673bcc3089f89d2af1e4e77c0d29577ac1`确认局部无阻断，未执行测试。

保留同一个注册组合责任、受限内部expired-record调用面、原凭证签发方/用途/AccountId绑定及信任配置。不是新增消费者资格或绕过AI3/IV1，不要求改冻结AI3。注册/清除仍分别独立提交，提交未知保持原失败结果但不推导无效果；成功交接才能产出依据。卸载先禁止新交接并等待完整在途Promise；已交出的普通步骤仍可能提交，旧代际不再续下一步。没有持久工作流状态。

Registration模型及三配置与v1逐字相同，只复用既有有限性质；不证明真实提交未知、信任配置或Promise排空。实施须保留无孤儿/不误激活/幂等断言，补真实提交后丢回执、暂停步骤卸载和快速换代验证。host有序关闭所需依赖、entry完整业务跟踪未验证前不能开放新版生产组合。entry2/HT2采用另行办理。

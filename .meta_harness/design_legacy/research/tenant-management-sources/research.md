# 租户管理与角色来源：结论与设计影响

- 问题：核对个人 owner、组织最高管理者、成员变更、管理范围及私人数据边界。
- 观察：固定 omne-next 6263fed 的要求、源码与测试显示自然人身份和 tenant membership 分离，最高管理者保护与当前资格需显式维护。
- 限制：源角色词汇和 API 不是本项目契约；超级管理员不自动取得私人 Session 正文、外部账号同意或平台全局权。

## 推断与采用

这些观察支持把租户治理、动作授权与预算核算保留为三个正交能力：TG 拥有 tenant/member/
definition/entitlement/acquisition，AU 拥有设置/grant/Action 判定，BG 拥有费用事实和预算暴露。
它们通过精确资格与共同准入组合；研究不接受候选规格，也不把旧实现当 provider 符合证据。

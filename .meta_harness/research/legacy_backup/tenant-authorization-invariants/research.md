# 租户与授权实现不变量：结论与设计影响

- 问题：核对旧系统的 tenant/membership/action guard 代码与反例，用于检验当前资格、拒绝优先和 TOCTOU 边界。
- 观察：固定 omne-next 6263fed 的源码/测试观察支持 tenant/user 双凭据、active membership、deny override 与 fence；观察不等于本项目接受政策。
- 限制：未启动旧产品，未验证完整 HITL、预算、分布式一致性或本项目 Cordis 组合；旧实现缺口不能证明能力语义不存在。

## 推断与采用

这些观察支持把租户治理、动作授权与预算核算保留为三个正交能力：TG 拥有 tenant/member/
definition/entitlement/acquisition，AU 拥有设置/grant/Action 判定，BG 拥有费用事实和预算暴露。
它们通过精确资格与共同准入组合；研究不接受候选规格，也不把旧实现当 provider 符合证据。

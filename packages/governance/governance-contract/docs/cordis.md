# Cordis 集成

## 集成入口

`@omne-harness/governance-contract/cordis` 拥有 GovernanceContributionsService 和唯一键 governanceContributions。提供者继承该 Service，不重复 provide 同键。应用通过 inject 使用它；注入可见性不授予注册或业务操作权限。

## 生命周期与清理

契约不注册资源或存储连接。具体提供者按 [GC-08](../SPEC.md#gc-08-精确撤除与重装配) 在 caller fiber 中登记单个关闭承担者。采用 IC-13 目录方式，不把未经声明的 ctx.provide 对象当生命周期证明。真实交错、依赖丢失和晚回执测试由提供者完成。

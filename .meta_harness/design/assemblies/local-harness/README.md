# 本机 harness 装配

本包维护 `apps/local-harness` 如何把选定提供者接成单机、可恢复的产品运行链。应用选择实例、配置和交接次序；账号、租户、Session、Run、Agent、工具、授权与预算的状态转移仍由各自能力或组合拥有。

- 来源：`apps/local-harness/design.md`，本次读取的 SHA-256 为 `a8b88dfa227d0447f4cef1d5ddc7cafc620c19f9ee1b4d549c0b82ca005d7eef`；其 `f98ac926` 装配映射曾被接受为**最小运行基线施工输入**，不是当前新谱系 v1 的实施或验证接受。
- 实际应用：`apps/local-harness/package.json` 已有 workspace 成员和真实存储/准入组合测试；目前没有应用 `src/`、启动入口或 Agent/Session/工具运行闭环。
- 设计基线：[D-007](../../decisions/runtime-composition/decision.md) 的独立状态权威、[D-016](../../decisions/account-identity/decision.md) 的账号身份边界、[D-017](../../decisions/personal-tenant-creation/decision.md) 的统一个人租户创建机制。后两项只接受架构方向，其细节规格与提供者仍是候选。
- 范围：一个本机部署从初始化、注册/登录、文本入队、唯一 Run、确定性 allow 工具调用、结果查询到恢复和退出的**目标装配**。完整模型驱动、HITL ask 和扩展平台不从此基线推定已交付。

`apps/` 和 `packages/` 路径是相对产品仓库根的源码定位符；文中实现现状可按产品源码提交 `74e3e48aa13b5c39c3b064537d2072dc2498b1d4` 复核，不是设计包内依赖。

## 准入与当前状态

实际应用、P1 提供者选择和受限组合证据已定位；其余提供者沿明确的候选映射接续。身份和首次初始化按 D-016/D-017 修订后，旧本机凭据映射及 bootstrap 专属协议不再是目标接口。当前只有 P1 存储/准入/诊断切片有真实组合证据；完整链的合同采用、提供者实现及端到端验证仍未闭合。

## 按问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 选哪些提供者，如何从启动走到结果及关闭 | [装配设计](design.md) |
| 哪些结果真实测过，旧来源如何对应新基线 | [验证、来源与差异](verification.md) |

返回[装配家族](../README.md)。

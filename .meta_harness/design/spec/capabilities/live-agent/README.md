# 活体 Agent 能力

本能力拥有 Session 对应活体实例的独占激活、精确代际、工作许可、装配绑定和资源退出。

- 契约坐标：`(omne-harness-lite-design-2026-09-15, capability.live-agent, 1)`
- 版本与采用状态：新谱系 v1 已登记候选；旧 v1 等价整理，独立评审完成，接受与冻结仍待 I 核对
- 精确依赖：`(omne-harness-lite-design-2026-09-15, data.agent-runtime-identity, 1)`，消费 ARI-1～ARI-5，同 baseline 直接依赖的 `rebase_relation:null`
- 谱系关系：legacy→new 的等价整理单独登记为 `f-identity-v1-equivalent-rebase`，不是上述依赖边
- 旧接受依据：`D-005`；不自动成为新坐标 acceptance
- 提供者映射：[core-agent](../../../providers/core-agent/README.md)

## 准入核对

活体占位与资源退出是一项可独立解释、可独立演化的能力维度；它不拥有长期 Session、Run、工具或授权政策。
其独立 Cordis 插件边界是 `AgentRegistryPlugin` 及私有实例插件，组合交接由 binding 契约拥有。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 语言无关行为 | [v1 契约](v1/contract.md) 与 [规范场景](v1/scenarios.md) |
| 并发、退出和进展模型 | [formal 映射](v1/formal/README.md) |
| 证据与实现缺口 | [验证与覆盖](verification.md) |

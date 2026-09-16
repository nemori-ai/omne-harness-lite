# Agent 运行时身份

`SessionRef` 与 `AgentRef` 的共享、可传输身份语义；行为和授权由消费能力拥有。

- 契约坐标：`(omne-harness-lite-design-2026-09-15, data.agent-runtime-identity, 1)`
- 版本与采用状态：新谱系 v1 已登记候选；旧 `omne-harness-lite-legacy-spec/data.agent-runtime-identity@1` 的等价整理，接受与冻结仍待 I 核对
- 旧接受依据：`D-005`；仅作为 lineage，不自动接受本坐标
- 提供者映射：[core-agent](../../../providers/core-agent/README.md)

## 准入核对

Session、活体实例、组合和后续 Run/工具消费者必须共享同一元组含义，因此 data family 准入成立。
本包不拥有 Session 生命周期、身份分配操作或授权政策。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 精确身份、相等与表示 | [v1 契约](v1/contract.md) 与 [Schema](v1/schema.json) |
| 证据范围、谱系和剩余义务 | [验证与覆盖](verification.md) |

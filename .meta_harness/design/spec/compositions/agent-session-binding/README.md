# Agent 与 Session 附着组合

本组合拥有活体 Registry、Session attachment、访问验证、Factory/驱动和资源提供者之间的共同发布与释放交接。

- 契约坐标：`(omne-harness-lite-design-2026-09-15, composition.agent-session-binding, 1)`
- 版本与采用状态：新谱系 v1 候选；旧 v1 等价整理，等待 I 登记、独立评审与冻结
- 精确依赖：`data.agent-runtime-identity@1` ARI-1～ARI-5、`capability.live-agent@1` AR-1～AR-16，均为新谱系 `equivalent-rebase`
- 旧接受依据：`D-007`；只作为 lineage
- 提供者映射：[core-agent](../../../providers/core-agent/README.md)

## 准入核对

发布时的共同撤销屏障、精确 attachment 及释放次序不能由 live-agent 或 Session 单方拥有，因此 composition family 准入成立。
本组合不新增长期数据结构，也不把调用顺序伪装成共同提交保证。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 提供者交接与整体性质 | [v1 契约](v1/contract.md) 与 [场景](v1/scenarios.md) |
| 并发与反例模型 | [formal 映射](v1/formal/README.md) |
| 证据和阻断项 | [验证与覆盖](verification.md) |

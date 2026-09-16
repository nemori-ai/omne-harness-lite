# Core Agent 插件提供者

本包把 `data.agent-runtime-identity@1`、`capability.live-agent@1` 与 `composition.agent-session-binding@1` 投影到 Cordis；它不拥有 Session/Run 语义。

- 设计对象：`packages/core/agent` 当前定向 fork 与公共协议起点，源设计 hash `39027eb...`
- 输入基线：三个新谱系 v1 候选、agent-runtime/dsh-core-adoption/runtime-composition proposals
- 当前范围：提供者设计可实施；AgentHost、目标 Registry 和真实共同门尚未实现，符合性未完成

## 准入核对

已有精确能力契约与明确源码落点，provider family 准入成立。源码存在只证明实现起点，不能升级为契约兑现。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 插件、服务、依赖、状态与撤除 | [设计正文](design.md) |
| 实际证据与阻断项 | [符合性验证](verification.md) |

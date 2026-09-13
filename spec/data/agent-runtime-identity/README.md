# Agent 运行时共享身份

身份与采用状态以 [catalog](../../catalog.json) 为准。精确版本为
[data.agent-runtime-identity v1](v1/contract.md)，结构见 [Schema](v1/schema.json)。
依据 [D-005](../../../docs/decisions/D-005-agent-runtime.md)；本轮设计、评审和
授权范围见[提案入口](../../../docs/proposals/agent-runtime/README.md)。

这份最小数据契约不接受完整租户候选或 Session 记录。实例引用能够传输不表示
它本身是授权凭据，也不意味着 RPC 已实现。数据样例检查及范围见
[运行时验证](../../capabilities/live-agent/verification.md)。

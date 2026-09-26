# minimal-runtime 格式化与支持件调查

固定 d79484d9 来源的函数行为与迁入限制；不是采用决定。

- 对象与最近核对：2026-09-26；Node24.18.0、TypeScript6.0.3；来源工作树只读。
- 消费者：[D-046](../../design/record/decisions/core-formatter-adoption/decision.md)、util两节点。
- 准入：实际源码、逐文件hash、严格类型检查与16项调用；没有重跑原Python或完整来源测试。

[研究正文](research.md)解释观察范围；[证据](evidence.md)定位输入和重放脚本。

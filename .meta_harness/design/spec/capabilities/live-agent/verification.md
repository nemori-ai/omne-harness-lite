# Live Agent v1 验证覆盖

| 条款/性质 | 规范对象 | 本轮结果 | 剩余责任 |
|---|---|---|---|
| AR-1～AR-17 | contract + scenarios | 链接、身份、条款和场景静态核对；旧正文等价重基；独立架构与规格评审无等价性阻断 | 已登记候选，当前消费者采用及冻结仍待核对 |
| 唯一占位、旧代际、退出、撤除的有限抽象 | Runtime TLA+/cfg | 新基线的 safety/progress 两项 TLC 通过，精确输入与日志见[形式证据](../../../evidence/formal-2026-09-16/README.md) | 不覆盖真实 IAM/attachment 共同门、可选贡献撤除或 provider 符合性 |
| 实际插件行为 | core-agent provider 映射 | 仅有定向 fork 与候选协议；没有 AgentHost/Registry 产品实现 | 实施和真实组合验证仍阻断“已兑现”声明 |

旧 baseline 的日志不冒充新运行；上列证据是在新设计路径按登记任务执行所得。

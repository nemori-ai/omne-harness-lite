# Agent/Session Binding v1 验证覆盖

| 条款/性质 | 规范对象 | 本轮结果 | 剩余责任 |
|---|---|---|---|
| CB-01～CB-14 | contract + scenarios | 依赖坐标与内部链接重基、静态核对通过；独立架构与规格评审无等价性阻断 | 已登记候选，当前消费者采用及冻结仍待核对 |
| 发布/撤销、过早释放、陈旧释放的有限抽象 | Binding TLA+/cfg | 新基线 safety 任务 TLC 通过，精确输入与日志见[形式证据](../../../evidence/formal-2026-09-16/README.md) | 不覆盖真实 IAM、存储、可选贡献撤除或 provider 共同门符合性 |
| 实际共同屏障 | provider design | 目前只有接口设计，Session provider 与 AgentHost 未实现 | 真实组合测试前不能声称符合性 |

旧交付 JSON 和旧 baseline 日志不冒充新运行；上列证据是在新设计路径按登记任务执行所得。

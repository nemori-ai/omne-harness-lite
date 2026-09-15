# Live Agent v1 验证覆盖

| 条款/性质 | 规范对象 | 本轮结果 | 剩余责任 |
|---|---|---|---|
| AR-1～AR-17 | contract + scenarios | 链接、身份、条款和场景静态核对；旧正文等价重基 | I 登记并冻结；spec-reviewer 核对表达与条款对应 |
| 唯一占位、旧代际、退出、撤除 | Runtime TLA+/cfg | formal task 已纳入 delta；环境缺 Java/TLC，未执行 | 后续在固定工具链运行；有限模型不替代 provider 符合性 |
| 实际插件行为 | core-agent provider 映射 | 仅有定向 fork 与候选协议；没有 AgentHost/Registry 产品实现 | 实施和真实组合验证仍阻断“已兑现”声明 |

旧 baseline 的模型日志、评审快照和交付日志均未迁入；它们只通过来源 hash 保持可恢复 provenance。

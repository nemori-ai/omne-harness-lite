# Agent/Session Binding v1 验证覆盖

| 条款/性质 | 规范对象 | 本轮结果 | 剩余责任 |
|---|---|---|---|
| CB-01～CB-14 | contract + scenarios | 依赖坐标与内部链接重基、静态核对通过 | I 合并 catalog/rebase/frozen 后才可采用 |
| 发布/撤销、过早释放、陈旧释放 | Binding TLA+/cfg | formal task 已登记到 delta；Java/TLC 不可用，未执行 | 固定工具链后运行反例与安全配置 |
| 实际共同屏障 | provider design | 目前只有接口设计，Session provider 与 AgentHost 未实现 | 真实组合测试前不能声称符合性 |

旧交付 JSON 和 docs/spec 日志绑定旧 baseline，本轮不迁入；source disposition 保留其 hash 和省略理由。

# Model 公共协作流程

共同协议由 [SPEC](../SPEC.md)规定，消费顺序见 [context](context.md)。本页连接流程拥有者，不复制状态机。

| 协作 | 行为与流程 |
| --- | --- |
| 档案选择、转换及准备 | [档案协议](../SPEC.md#档案与请求准备协议)、[组装流程](../../model/docs/flows.md#flow-md02) |
| 受理、物化及真实发出 | [调用协议](../SPEC.md#调用和各次真实发出)、[执行流程](../../model/docs/flows.md#flow-md03) |
| 控制、失联及恢复 | [恢复协议](../SPEC.md#换代恢复和耐久)、[控制流程](../../model/docs/flows.md#flow-md04) |
| 结果保管、处理和 ACK | [确认协议](../SPEC.md#ack-的前提与效果)、[保管流程](../../model/docs/flows.md#flow-md05) |
| 迟到费用 | [账目协议](../SPEC.md#真实费用和账目边界)、[费用流程](../../model/docs/flows.md#flow-md06) |

流程图中的内部协调者是 model 的实现选择。替代提供者须保留身份、顺序、未知结果及资源义务，无须复刻其内部模块。

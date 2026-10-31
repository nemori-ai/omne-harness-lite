# Model 公共协作流程

共同协议由 [SPEC](../SPEC.md)规定，消费顺序见 [context](context.md)。本页连接流程拥有者，不复制状态机。

| 协作 | 行为与流程 |
| --- | --- |
| 档案选择、转换及准备 | [档案协议](../SPEC.md#档案与请求准备协议)、[组装流程](../../model/docs/flows.md#flow-md02) |
| 封闭判断及受理 | [输入契约](../SPEC.md#封闭输入判断)、[纯 judge](../src/judge-request.ts)、[边界测试](../../model/tests/admit-boundary.spec.ts) |
| 受理、物化及真实发出 | [调用协议](../SPEC.md#调用和各次真实发出)、[执行流程](../../model/docs/flows.md#flow-md03) |
| 控制、失联及恢复 | [恢复协议](../SPEC.md#换代恢复和耐久)、[控制流程](../../model/docs/flows.md#flow-md04) |
| 结果保管、处理和 ACK | [确认协议](../SPEC.md#ack-的前提与效果)、[保管流程](../../model/docs/flows.md#flow-md05) |
| 迟到费用 | [账目协议](../SPEC.md#真实费用和账目边界)、[费用流程](../../model/docs/flows.md#flow-md06) |
| 新增结果推送与 saved 认回 | [冻结键和载荷](../SPEC.md#交付身份与冻结载荷)、[合取证据](../SPEC.md#saved-的合取事实与证据)、[未知认回](../SPEC.md#未知保存的认回)、[原 ACK](../SPEC.md#saved-到-ack-及清理) |
| 新增公共内容观察与目标查询 | [公共帧生命周期](../../../common/stream-arrival/README.md#public-observation-contract)、[Model 投影](../SPEC.md#model-投影及差分)、[current 权威边界](../SPEC.md#current-的权威含义) |

流程图中的内部协调者是 model 的实现选择。替代提供者须保留身份、顺序、未知结果及资源义务，无须复刻其内部模块。

新增两条流程是已采用协议的消费导航，尚无接收、观察或 current 实现。它们不替代现有分页、双路径 ACK 或完整快照观察。实际提供者和消费者迁移及验证归[交付边界](../SPEC.md#推送与公共观察的交付边界)。

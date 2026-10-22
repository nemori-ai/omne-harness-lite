# Session Cordis 定义的流程

本成员没有自己的业务流程或协议流程，所以本页不描述流程图。理由有两条：

1. 本成员只有服务定义。它不持有状态，不提交事实，不发出外部动作。每个流程里的步骤都由别的成员执行。
2. 服务定义自身的使用顺序只有一步：调用方插件声明依赖，服务提供者按该定义提供服务。这一步写在 [Cordis 说明](cordis.md)与[使用与定位](context.md)里，不需要流程图。

各类流程在下列拥有者处：

| 流程 | 拥有者 |
| --- | --- |
| 受理、推进、换代、控制、归档、历史读取的业务与数据流及失败分支 | [session-contract 的流程](../../session-contract/docs/flows/README.md) |
| 跨成员与跨邻域的协作顺序 | [组的协作入口](../../docs/key-flows.md) |
| 命令处理、提交与恢复扫描的机制步骤 | [session](../../session/README.md) |
| Service 的装载、依赖缺席与撤除、扫描者的绑定 | [session-cordis 的 Cordis 说明](../../session-cordis/docs/cordis.md) |
| 四个运行成员共同的生命周期与事件规则 | [运行契约集成](../../../../docs/architecture/runtime/runtime-contract-integration.md) |

本成员的生命周期表在 SPEC 的[生命周期](../SPEC.md#生命周期)一节。服务定义改变后，若这些拥有者的流程受影响，在对应拥有者处同步。

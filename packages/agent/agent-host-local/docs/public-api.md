# Agent 本地宿主公开入口

根入口提供 `createLocalModelReceiver(dependencies, state)` 与 `createModelReceiverState()`，类型与算法消费 [agent 公开入口](../../agent/docs/public-api.md#独立-model-接收入口)。宿主持有 state，组件重装配仍传同一对象；Agent runtime 不拥有它。

Tool 对应入口为 `createLocalToolReceiver(dependencies, state)` 和 `createToolReceiverState()`。类型与算法消费 [Tool 接收入口](../../agent/docs/public-api.md#独立-tool-接收入口)。依赖为同源 provider、access、targets 与租户容量；不使用 Model 专用账目出口。宿主持有状态和真实在途任务，实例停止不清除它们。工厂本身不登记 Cordis 服务或生产者接收路由，生产路由仍由装配者接线。

接收句柄提供 push、recover、retry、inspect。依赖必须显式传入，不创建默认放行资格、独立材料存储或吞账目出口。非耐久状态只支持同进程接续；完整行为由[本包 SPEC](../SPEC.md#独立结果接收组件)约束。

`@omne-harness/agent-host-local/cordis` 导出宿主插件 `agentHostPlugin`、插件工厂 `createAgentHostLocalPlugin`（入参类型 `AgentHostLocalPluginInput`）与配置类型 `AgentHostConfig`。`createAgentHostLocalPlugin({ measure? })` 返回与 `agentHostPlugin` 同名同 inject 同配置的插件，把 Agent 测量观察者交给宿主建出的每个 runtime，见 SPEC [测量事件](../SPEC.md#测量事件)。同一入口的 `toolRequests?` 把 R2-D36 的可信 Tool 请求供给者（`AgentDependencies['toolRequests']`）放进每个 runtime 的依赖，不传时 Tool 动作答 unavailable，见 SPEC [Tool 请求来源](../SPEC.md#tool-请求来源)。插件的装载、配置与服务面见 [Cordis 装配页](cordis.md#插件与入口)，实现范围与缺口见 [SPEC](../SPEC.md#宿主插件)。

接收工厂返回 `Outcome`：联合接收能力存在时为 `ok` 句柄；`received=null` 时为 `failure: { kind: 'unsupported' }`，不创建接收能力。

push 完成共同提交、材料核对及入队后返回 saved，出口未决不占用接收写槽。retry/recover 返回 Agent Reply，核当前资格并限制到一次捕获的原绑定集合；拒绝不返回 counts 或私有诊断。inspect 仅供宿主管理，不能作为租户查询。实际任务与出站驱动代由 state 托管，旧组件不能驱动后继待办。取消时最终资格尚未完成，维护返回无内容 maintenance-cancelled，实际出口任务继续到真实结束。

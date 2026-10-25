# Agent Cordis 定义的行为边界

公共定义及机制的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。本包已实现这些定义：`./cordis` 导出 18 个服务键与 Service、`Context` 与 `Events` 增补、目录服务和目录插件，根入口只导出三个类型。具体内容见 [Cordis 协议](docs/cordis.md)。`agentInstances` 的提供者是目录插件 `agentInstancesPlugin`，其他服务键的提供者与宿主插件尚未实现。领域操作沿 [agent-contract SPEC](../agent-contract/SPEC.md)，本包不另定治理语义。

## 唯一性

本包唯一拥有本域 Service、键、Context 与 Events 增补。定义不得依赖具体提供者或通过根入口加载框架绑定。

## 生命周期

`AgentClockService` 同形公开 `AgentClock.now` 与 `waitUntil`。它不自行取系统时间，也不把提供者的不可用读作成功。时间来源、失败与候选时刻的规则归 [Agent 时钟契约](../agent-contract/SPEC.md#时钟读取与等待)。

实例登记、条件撤除和旧 token 不删除后继的协议归本包；登记不授予业务推进资格。

## 实现与验证

具体插件归 [agent-host-local](../agent-host-local/README.md)。本包的测试在真实 Cordis 4.0.4 上验证唯一服务身份、类型增补、定义入口不引入提供者，以及目录的登记、取代、撤除、监听失败与跨租户规则，见[测试说明](tests/README.md)。这些测试用测试子类代替发布权威、主体资格核验和宿主，不证明真实提供者、跨进程行为或持久性。

## Tool 契约消费

服务键与公共 ExecutionControl 不因 Tool 普通 invoke 关联而改变。注入的 ToolRuntime 沿公开 invoke、queries、commands、instances 与 content 使用，acceptDecision 不因此成为普通 Agent 能力。AgentJournal 服务的 Tool 控制记录须保留原调用与返回操作引用，行为归 [Agent SPEC](../agent-contract/SPEC.md#tool-调用关联与控制引用)。引用失败及当前资格、附件租户、规范引用、原 operation 认回与新 target/stage 的判定顺序同属该 SPEC；服务注入不改变其顺序。服务定义不提供 A2/T0、生产材料保管或控制恢复的实现证明。

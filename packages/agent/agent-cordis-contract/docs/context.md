# Agent Cordis 定义：context

需要在 Cordis 中消费本域服务的插件安装本包。只使用领域值或纯接口的消费者安装 [agent-contract](../../agent-contract/README.md)，不需要安装本包。应用选择具体插件见 [agent-host-local](../../agent-host-local/README.md)。独立调用者和外部协调者两种消费位置见[纯契约的消费与系统定位](../../agent-contract/docs/context.md)。需要取得某个实例的 AgentRuntime 的消费插件，经本包的 `agentInstances` 键按租户和实例身份解析，不依赖 agent-host-local。

状态：设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。本包的服务定义与目录插件已实现，提供者与宿主插件尚未实现。以上是包边界与设计归属。

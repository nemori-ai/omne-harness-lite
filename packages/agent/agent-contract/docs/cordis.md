# Agent 纯契约与 Cordis

本包不导入 Cordis，不提供 `./cordis` 入口。独立消费者只安装本包。

需要框架服务定义的调用者从 [agent-cordis-contract/cordis](../../agent-cordis-contract/docs/cordis.md) 取得唯一键与 Service；应用另选 [agent-host-local](../../agent-host-local/docs/cordis.md) 的具体插件。后两者的设计已接受。agent-cordis-contract 的服务定义与目录插件已经实现，agent-host-local 仍是装配骨架，不能据此声称运行集成已实现。

生产者接收面的三个端口 `AgentJournalEntries`、`AgentAccountOutlet` 与没有活体 runtime 时使用的 `AgentExecutionControl`，在 agent-cordis-contract 有各自的键，见该页的[服务键与提供者](../../agent-cordis-contract/docs/cordis.md#服务键与提供者)。Tool 启动围栏的 `toolStartFence` 键归 Tool 的 Cordis 定义，本包只在类型上引用 Tool 根入口的名字。

需要某个实例的 AgentRuntime 的消费插件，经 agent-cordis-contract 的 `agentInstances` 键按租户和实例身份解析，不依赖 agent-host-local。该页没有为 AgentRuntime 定义键，原因见 [Cordis 页](../../agent-cordis-contract/docs/cordis.md#服务键与提供者)。

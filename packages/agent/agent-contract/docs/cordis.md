# Agent 纯契约与 Cordis

本包不导入 Cordis，不提供 `./cordis` 入口。独立消费者只安装本包。

需要框架服务定义的调用者从 [agent-cordis-contract/cordis](../../agent-cordis-contract/docs/cordis.md) 取得唯一键与 Service；应用另选 [agent-host-local](../../agent-host-local/docs/cordis.md) 的具体插件。后两者仍是候选定义与装配骨架，不能据此声称运行集成已实现。

需要某个实例的 AgentRuntime 的消费插件，经 agent-cordis-contract 的 `agentInstances` 键按租户和实例身份解析，不依赖 agent-host-local。该页没有为 AgentRuntime 定义键，原因见 [Cordis 页](../../agent-cordis-contract/docs/cordis.md#服务键与提供者)。

# tool-cordis-contract 消费与系统定位

编写 Cordis 插件的消费者依赖本包和 `tool-contract`：Agent、Session、HITL、执行环境与 Code 的提供者，以及 `tool-host-local`。不用 Cordis 的消费者只依赖 `tool-contract`。独立程序选择 `tool` 中的实现工厂。

本包的安装闭包含 Cordis 与 `tool-contract`，不含任何 Tool 实现。装配规则见 [cordis](cordis.md)。目录职责见 [README](README.md)。

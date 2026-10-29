# tool-cordis-contract 消费与系统定位

编写 Cordis 插件的消费者依赖本包和 `tool-contract`：发起协调者、消费方、决策方、执行环境与程序执行方的提供者，以及 `tool-host-local`。不用 Cordis 的消费者只依赖 `tool-contract`。独立程序选择 `tool` 中的实现工厂。

本包的安装闭包含 Cordis 与 `tool-contract`，不含任何 Tool 实现。装配规则见 [cordis](cordis.md)。目录职责见 [README](README.md)。

`ToolResidencyReaderService` (`toolResidencyReader`) 提供持有者、租户与 shape 的分页引用查询，见[服务定义](../src/cordis.ts)。

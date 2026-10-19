# Agent Cordis 定义：architecture

本包将 [agent-contract](../../agent-contract/README.md) 的操作契约绑定为 Cordis Service。具体提供者依赖定义，本包不依赖 [agent-host-local](../../agent-host-local/README.md) 或 [agent](../../agent/README.md)。实例登记机制按 [IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) 与唯一服务定义共置，不能由每个提供者各造一份目录。

本包的 `./cordis` 导出服务定义、键常量、Context 与 Events 增补和具体的目录插件。根入口不导入 Cordis。服务键、登记协议、事件和 IC-1 至 IC-19 的符合性映射只写在 [Cordis 页](cordis.md)。

状态：候选设计，未实现。以上是包边界与设计归属。

# Agent 通用实现的使用位置

本包供应用装配者或替代宿主选择实现。只消费领域接口的调用方安装 [agent-contract](../../agent-contract/README.md)，只消费 Cordis 服务定义的插件安装 [agent-cordis-contract](../../agent-cordis-contract/README.md)。

## 独立装配

工厂的设计见 [公开构造入口](public-api.md)，尚不能作为运行示例。调用者自行提供符合契约的依赖和配置；本包不暗建 Context、注册表或存储后端。独立调用者和外部协调者两种消费位置见[纯契约的消费与系统定位](../../agent-contract/docs/context.md)。

## 框架装配

[agent-host-local](../../agent-host-local/README.md) 将 Cordis 能力适配到纯依赖并管理插件生命周期。独立调用不需安装它。

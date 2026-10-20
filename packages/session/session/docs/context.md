# Session 通用实现的使用位置

本包供应用装配者或替代宿主选择实现。只消费领域接口的调用方安装 [session-contract](../../session-contract/README.md)，只消费 Cordis 服务定义的插件安装 [session-cordis-contract](../../session-cordis-contract/README.md)。

## 独立装配

候选工厂见 [公开构造入口](public-api.md)，尚不能作为运行示例。调用者自行提供符合契约的依赖和配置；本包不暗建 Context、注册表或存储后端。

## 框架装配

[session-cordis](../../session-cordis/README.md) 将 Cordis 能力适配到纯依赖并管理插件生命周期。独立调用不需安装它。

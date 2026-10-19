# Agent 具体装配的行为边界

本包已初始化，根入口及 `./cordis` 为空，具体插件尚未实现。领域行为消费 [agent-contract](../agent-contract/SPEC.md)，框架公共保证消费 [agent-cordis-contract](../agent-cordis-contract/SPEC.md)。

## 提供者责任

将 Cordis 依赖适配为通用工厂的纯端口，管理本包持有的服务与资源。计划撤除先完成业务交接，突然失去依赖保留未知和恢复责任，不宣称外部效果回滚。

Agent 本地宿主负责实例保留、协程托管和登记贡献。reserve 不授予推进资格。旧登记身份的撤除不得撤除后继登记。

## 验证

插件实现时验证 [装配协议](docs/cordis.md)、依赖撤除与恢复交接。骨架测试只检查当前导出，不代表运行验证。

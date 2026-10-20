# Session 具体装配的行为边界

本包已初始化，根入口及 `./cordis` 为空，具体插件尚未实现。领域行为消费 [session-contract](../session-contract/SPEC.md)，框架公共保证消费 [session-cordis-contract](../session-cordis-contract/SPEC.md)。

## 提供者责任

将 Cordis 依赖适配为通用工厂的纯端口，管理本包持有的服务与资源。计划撤除先完成业务交接，突然失去依赖保留未知和恢复责任，不宣称外部效果回滚。

Session 装配长期治理服务，不为每个 Session 或 Run 创建 runtime、根 Context 或实例目录。事务端口从外部注入，本包不选择数据库、不实现持久存储。

## 验证

插件实现时验证 [装配协议](docs/cordis.md)、依赖撤除与恢复交接。骨架测试只检查当前导出，不代表运行验证。

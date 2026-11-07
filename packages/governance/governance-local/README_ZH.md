# @omne-harness/governance-local

## 职责与状态

本地治理贡献、采用和查询提供者。普通工厂已组合五个应用方法、Identity资格保留及持久恢复；Cordis适配器把贡献清理绑定到调用方fiber。生产声明发行来源和当前事实适配仍待接通，完整跨域组合尚未验收。

## 使用

受信装配者从根入口导入 `governanceSqlMaterials`，把固定参与者、读取器和迁移交给SqlStorage。先构造 `createGovernanceLocalDestination` 并向Identity登记恢复路由，再调用 `createGovernanceLocal`。只有created结果公开服务与关闭方法。

Cordis使用 `./cordis` 的 `createGovernanceLocalPlugin`。配置沿用普通工厂的受信输入，但storage和identity由inject提供。observeClose接收首次pending和最终closed通知，见[集成说明](docs/cordis.md)。

## 契约

[本地规格](SPEC.md) 说明关系和材料行为。业务义务归 [治理契约](../governance-contract/SPEC.md)。

## 设计

[架构](docs/architecture.md) 说明 SQL 拥有者；[对象模型](docs/object-model.md) 说明租约与目标支持；[流程](docs/flows.md) 说明当前安装路径。

## 配置与运行

本包不创建数据库。租户写域、SQLite 运行预算和关闭由装配者提供。迁移与业务材料的受信目录不是客户端输入。普通关闭返回pending时，拥有者继续保留依赖并重试；Cordis适配器自动继续关闭。

## 验证

运行本成员 `typecheck`、`build` 和 `test:fast`。真实SQLite、Identity与Cordis4.0.4已有组合测试；生产来源、同提交消费与完整独立验收仍开放，见 [验证入口](verification/README.md)。

## 维护

保持 gc 表由单一拥有者写入，不读取外域私表。变更公开业务行为须同步契约、消费者及独立验证。

## 目录结构与文档职责

`src` 拥有关系和材料，`tests` 拥有可复跑检查，`docs` 说明架构。`SPEC.md` 拥有非类型行为，运行证据留任务 tmp。见 [索引](index.md)。

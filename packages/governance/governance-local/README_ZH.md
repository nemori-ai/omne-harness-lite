# @omne-harness/governance-local

## 职责与状态

本地治理贡献和采用提供者。当前已实现关系迁移及原操作、登记和撤除的私有事务写者，公开业务服务、当前事实和 Cordis 装配仍在开发，不能作为完整运行服务使用。

## 使用

受信装配者从根入口导入 `governanceSqlMigrations`，把固定迁移材料交给 SqlStorage。它不自动注册参与者，也不取得业务授权。

## 契约

[本地规格](SPEC.md) 说明关系和材料行为。业务义务归 [治理契约](../governance-contract/SPEC.md)。

## 设计

[架构](docs/architecture.md) 说明 SQL 拥有者；[对象模型](docs/object-model.md) 说明租约与目标支持；[流程](docs/flows.md) 说明当前安装路径。

## 配置与运行

本包不创建数据库。租户写域、SQLite 运行预算和关闭由装配者提供。迁移与业务材料的受信目录不是客户端输入。

## 验证

运行本成员 `typecheck`、`build` 和 `test:fast`。真实迁移、约束、重开及索引路径有测试，完整业务与生命周期尚未验收，见 [验证入口](verification/README.md)。

## 维护

保持 gc 表由单一拥有者写入，不读取外域私表。变更公开业务行为须同步契约、消费者及独立验证。

## 目录结构与文档职责

`src` 拥有关系和材料，`tests` 拥有可复跑检查，`docs` 说明架构。`SPEC.md` 拥有非类型行为，运行证据留任务 tmp。见 [索引](index.md)。

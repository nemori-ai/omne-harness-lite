# @omne-harness/schedule

公开协议由 [schedule-contract](../schedule-contract/README.md) 承接，Cordis 定义由 [schedule-cordis-contract](../schedule-cordis-contract/README.md) 承接。本成员实现无Cordis的规则计算、Schedule管理、预测和查询。单机持久化与装配归 [schedule-local](../schedule-local/README.md)，独立工具归 [schedule-tools](../schedule-tools/README.md)。

本成员版本为 `0.0.0`、private，[src/index.ts](src/index.ts)导出三个应用工厂和纯计算函数。Job接受、执行、扫描、通知及结果协调仍是后续目标，完整设计不表示这些能力已经实现。

## 使用与消费边界

先读[行为契约](SPEC.md)和[公开API索引](docs/public-api-design.md)。索引区分当前导出与后续Job接口。独立应用与适配入口使用相同授权及耐久操作规则。

createScheduleManagementApplication提供命令，createSchedulePredictionService提供日期预测和定义resolver，createScheduleQueryApplication提供读服务。每个工厂显式接收依赖。Cordis绑定与独立tools消费这些服务，允许方向见[组架构](../docs/architecture.md)。

## 契约与内部设计

[SPEC](SPEC.md)拥有可观察行为和验证义务，[内部设计](docs/internals.md)解释状态、持久化、恢复与生命周期，[关键流程](docs/key-flows.md)说明参与者、失败分支和责任移交。相邻拥有者从[组入口](../README.md)继续读取。

## 配置、运行与验证

Node >=24，ESM。工厂依赖类型从根入口导出。预测和查询要求显式预算及clock，管理要求当前授权、额度观察和耐久持久化。工厂不补默认授权或空历史。成员测试覆盖公开行为及依赖失败，外域使用符合性端口；真实SQLite和worker组合归schedule-local，生产跨域联调另行接受。

## 维护

同步行为、公开设计、流程、登记及双语 README。公开定义实现后成为类型唯一源。保留历史、原操作身份和明确 unknown，全部源验收义务见[完整映射](SPEC.md#来源与目标验收映射)。

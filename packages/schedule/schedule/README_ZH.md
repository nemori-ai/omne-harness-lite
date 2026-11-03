# @omne-harness/schedule

PACKAGE_TEMPLATE_DRAFT

公开协议由 [schedule-contract](../schedule-contract/README.md) 承接，Cordis 定义由 [schedule-cordis-contract](../schedule-cordis-contract/README.md) 承接。本成员保留无 Cordis 的领域与应用实现及其工厂配置，单机持久化与装配归 [schedule-local](../schedule-local/README.md)，独立工具归 [schedule-tools](../schedule-tools/README.md)。所有成员当前仍是初始化草稿。

本成员是真实 workspace 草稿，版本 `0.0.0`、private。`src/index.ts` 仍为 `export {}`，没有业务 API 或运行服务。2026-11-03 已确认完整目标设计；设计承诺不表示实现或运行验证完成。

## 使用与消费边界

先读[行为契约](SPEC.md)和[公开 API 设计](docs/public-api-design.md)。API 专题明确目标类型、命令、查询、错误、可信上下文和 ports，尚非真实导出，因此没有可运行的业务示例。独立应用调用、HTTP 和 Tool 使用相同授权及耐久操作规则。

目标根入口是纯领域函数与应用服务，不依赖 Cordis。Cordis 绑定与独立 tools 消费应用服务；允许方向见[组架构](../docs/architecture.md)。

## 契约与内部设计

[SPEC](SPEC.md)拥有可观察行为和验证义务，[内部设计](docs/internals.md)解释状态、持久化、恢复与生命周期，[关键流程](docs/key-flows.md)说明参与者、失败分支和责任移交。相邻拥有者从[组入口](../README.md)继续读取。

## 配置、运行与验证

本包没有已实现的 provider 或业务配置；目标配置不得减弱契约。现有 public-entry 测试只检查空导出。后续须按 SPEC 完成纯领域/契约、真实提供者集成、独立消费及完整装配端到端验证，这些是未验证义务，不能因暂未实现写成不适用。本次文档工作没有 Node24、ICU、真实存储故障、联网供应或工具装配验收结果。

## 维护

同步行为、公开设计、流程、登记及双语 README。公开定义实现后成为类型唯一源。保留历史、原操作身份和明确 unknown，全部源验收义务见[完整映射](SPEC.md#来源与目标验收映射)。

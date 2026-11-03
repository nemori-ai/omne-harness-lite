# @omne-harness/schedule-tools

[English](README.md)

把 Schedule 的公开命令与查询提供给 Tool 宿主。九个动作覆盖创建、修改、原操作查询、列表、单项、修订、历史、agenda 和 preview。业务服务通过依赖注入提供，本包不创建后端。

[公开入口](docs/public-api.md)列出作者、可信环境、固定结果详情和 Cordis 工厂。[SPEC](SPEC.md)规定恢复、预算与披露边界。参数和类型以源码为准。

宿主必须提供原 Tool 调用恢复、可信上下文、披露策略及固定结果读取，并把返回的 guard 接入通用读取链。写入结果保留原 locator，unknown 不自动重发。详情只读精确结果版本，续页密钥由宿主保管。

Node >=24，ESM。执行 `pnpm --filter @omne-harness/schedule-tools build`、`typecheck` 和 `test:fast`。测试包括真实 SQL 工具记录恢复与符合性业务提供者；不代表完整跨域生产装配已经完成。

[架构](docs/architecture.md)、[对象模型](docs/object-model.md)、[流程](docs/flows.md)、[消费关系](docs/context.md)和 [Cordis](docs/cordis.md)说明维护边界。完整导航见 [index.md](index.md)。

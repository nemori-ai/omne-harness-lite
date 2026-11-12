# 公开入口

根入口[src/index.ts](../src/index.ts)是唯一导出索引。DTO形状及约束以对应schema为准，本页不重复字段。

| 定义 | 源码 |
| --- | --- |
| 身份、可信上下文、时间和基础值 | [values.ts](../src/values.ts) |
| once、cron、rrule、position | [recurrence.ts](../src/recurrence.ts) |
| agent/program执行声明、提醒与来源 | [work.ts](../src/work.ts) |
| 完整定义、Binding及initial | [definition.ts](../src/definition.ts) |
| 管理命令、CAS和同意引用 | [commands.ts](../src/commands.ts) |
| 原操作地址、定位与JCS指纹 | [operation.ts](../src/operation.ts) |
| 候选来源与实际依据 | [candidates.ts](../src/candidates.ts) |
| Schedule、修订与当前资格读值 | [views.ts](../src/views.ts) |
| 执行历史引用 | [history.ts](../src/history.ts) |
| 结果、错误及原操作观察 | [results.ts](../src/results.ts) |
| 列表、预览、agenda与分页 | [queries.ts](../src/queries.ts) |
| ScheduleCommands和ScheduleQueries | [services.ts](../src/services.ts) |
| 可派生的JSON Schema | [json-schema.ts](../src/json-schema.ts) |

本包不提供Cordis或业务工厂。Job运行接口仍是[后续设计](../../schedule/docs/public-api-design.md)，不能从执行声明推断Job服务已经存在。

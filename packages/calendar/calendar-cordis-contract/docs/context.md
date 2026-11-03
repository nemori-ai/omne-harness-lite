# 使用与定位

## 使用方式

独立应用直接消费 calendar-contract 的服务类型即可。本机 Cordis 消费者从 `@omne-harness/calendar-cordis-contract/cordis` 导入 calendarQueryKey，在插件 inject 中声明后调用 ctx.calendarQuery。调用参数仍是受校验的可信上下文与公开输入。供应使用独立键，不随查询注入自动获得。

## 消费者与定位

calendar-local 提供两个本机 provider；calendar-tools 只注入查询定义，同时消费 Tool 的贡献依赖。定义测试核对服务键与继承关系。最终 harness、未来远程客户端与 Schedule 装配尚未接入。

依赖方向归[组架构](../../docs/architecture.md)，完整行为归 [SPEC](../SPEC.md)。

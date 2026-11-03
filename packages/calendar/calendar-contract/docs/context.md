# 使用与定位

## 使用方式

独立消费者可从 `@omne-harness/calendar-contract` 导入 calendarSnapshotSchema，对输入执行 safeParse；成功后把 data 交给 calendar 的纯计算。服务消费者实现或注入 CalendarQueries/CalendarSupply，不需要 Cordis。类型导入不提供当前资格，可信上下文仍由宿主生成。

## 消费者与定位

calendar 实现纯计算和应用，calendar-cordis-contract 用这些端口定义 Service，calendar-local 处理本机值，calendar-tools 校验参数和结果。持续用例从公开入口消费。本包不依赖 Schedule、Session 或 Agent；未来 HTTP/SDK 与 Schedule 的真实采用未交付。

依赖方向归[组架构](../../docs/architecture.md)，完整行为归 [SPEC](../SPEC.md)。

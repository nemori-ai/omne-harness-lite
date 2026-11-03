# 公开入口

`@omne-harness/calendar-tools` 的根入口当前没有业务导出。`./cordis` 已登记为独立入口，但尚无绑定导出。

目标责任为独立工具适配。工具参数与结果投影、可信调用上下文及工具贡献生命周期。通过 Cordis inject 消费服务定义，不依赖本地后端，也不承担业务规则。 方法及类型以未来实际公开源码为唯一形状源。现有[API 设计](../../calendar/docs/public-api-design.md)是实施输入，不是当前 API。不能从包名或导出路径推断业务已经实现。

工具动作范围、可信上下文与禁止暴露的系统入口见[工具边界](../../docs/reuse-plan.md#calendar-tools-提供什么)。实际方法和 schema 随实现维护，不把本文目标动作当作已注册能力。

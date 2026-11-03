# 公开入口

`@omne-harness/calendar-contract` 的根入口当前没有业务导出。本包不提供 `./cordis` 入口。

目标责任为纯公开契约。公共领域值、命令、查询、结果、错误和可替换服务端口。公共请求与回执必须可序列化，不携带 Context、连接、回调或运行时实例。 方法及类型以未来实际公开源码为唯一形状源。现有[API 设计](../../calendar/docs/public-api-design.md)是实施输入，不是当前 API。不能从包名或导出路径推断业务已经实现。

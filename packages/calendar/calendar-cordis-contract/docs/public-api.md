# 公开入口

`@omne-harness/calendar-cordis-contract` 的根入口当前没有业务导出。`./cordis` 已登记为独立入口，但尚无绑定导出。

目标责任为Cordis 服务定义。唯一 Service 定义、服务键与 Context 类型增补。服务方法消费纯契约，不引入业务实现或本地后端。 方法及类型以未来实际公开源码为唯一形状源。现有[API 设计](../../calendar/docs/public-api-design.md)是实施输入，不是当前 API。不能从包名或导出路径推断业务已经实现。

# Cordis 适用性

本成员实现无 Cordis 的纯计算与查询/供应应用，不提供 `./cordis`。唯一服务定义归 [calendar-cordis-contract](../../calendar-cordis-contract/docs/cordis.md)，本机提供者与供应运行器归 [calendar-local](../../calendar-local/docs/cordis.md)，Tool 贡献归 [calendar-tools](../../calendar-tools/docs/cordis.md)。独立宿主不装载这些绑定也可调用本成员。

工厂依赖是本机端口，不进入公共服务 DTO。Cordis 注入不授查询或供应资格，也不提供发布耐久、通知送达或效果撤销。生命周期与未完责任见[内部设计](internals.md#初始化停止与恢复)。

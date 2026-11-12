# 公开入口

根入口保持空。`@omne-harness/schedule-cordis-contract/cordis`导出ScheduleCommandsService、ScheduleQueriesService、scheduleCommandsKey和scheduleQueriesKey。完整形状归[src/cordis.ts](../src/cordis.ts)。

两个抽象Service分别实现纯契约的管理和查询接口，并扩充ctx.scheduleCommands及ctx.scheduleQueries。提供者继承本定义，消费者声明inject并调用ctx上的服务。注入只解决装配访问，业务授权仍由应用服务执行。

本包不创建SQL、worker或业务服务。Job与Subscriptions绑定尚未实现。方法签名沿schedule-contract，不复制本地后端对象；未来远端客户端也可以实现同一服务定义。

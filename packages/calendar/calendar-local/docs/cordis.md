# Cordis 集成

`./cordis` 分别导出 CalendarLocalQueryProvider 和 CalendarLocalSupplyProvider，继承唯一服务定义，不重复 provide。查询服务绑定 calendarQuery，供应服务绑定 calendarSupply。配置的精确形状由[公开源码](../src/cordis.ts)拥有，不放进公共服务 DTO。

查询配置借入 queries 或通过 owned.create 创建查询实例。供应配置借入 supply，或由 owned.create 创建供应应用，并可配置 runner。borrowed 关闭不停止借入应用；owned supply 关闭负责停止自己的 runner 或供应应用。底层 SQL 连接/Worker 仍由实际提供者拥有，不随 Calendar 关闭而销毁其他租户资源。

配置同步校验。runner 配置由根入口导出的 `src/runner/configuration.ts` 拥有，包含每周期可信 contextSupplier、完整 seed 输入或 null、稳定 initializationOperationKey/acknowledgementKey、phases、intervalMs、limit、drainTimeoutMs 和具名 observer。seed=null 仅支持已有库/只读模式，不声明完整默认发行。发行物须先完成三历种子可查询，再发出查询就绪；供应 provider 仅启动 runner 不能替宿主证明该就绪条件。

初始化逐个检查来源的排期结果。只要有来源返回 error，就保留初始化责任，并在下一周期用原 initializationOperationKey 重试。已经记录的网络探测失败仍有 nextDue，属于已建立计划，不因此阻塞其他来源。

关闭先拒绝新调用，再有界排空。drainTimeoutMs 耗尽后报告 inFlight=retained，清理失败与 observer 残留交回宿主，不虚报全部释放。持久运行、候选、发布回执和 outbox 保留，晚到结果归原操作。runner 清自己的 timer，重复 stop 认回同一次关闭结果。停止不回滚发布，不证明网络或通知已撤销。

必需依赖变化按[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)处理。装配注入不授查询/供应资格，也不扩大 SQL 的 L-1/L-4 或断电耐久保证。

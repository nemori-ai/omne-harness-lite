# Cordis 集成

本包的 `./cordis` 导出 `createScheduleLocalPlugin`。插件显式 inject `storageKey` 和 `calendarQueryKey`，构造本地应用并提供同组唯一的 ScheduleCommandsService 与 ScheduleQueriesService。配置只包含其余受信依赖，SQL和Calendar服务由ctx补入。缺少任一注入时不建立服务。

每次依赖恢复建立一个本地应用。撤除或卸载先停止新调用，再等待已接受调用完成，最后销毁本实例的计算worker。旧引用返回dependency_blocked。close不关闭借用的SQL或Calendar，不删除已保存的业务事实。部分初始化失败也等待本实例worker清理，清理错误与原错误一起保留。

`close()` 的Promise表示实际排空和worker退出。未结束的外部调用会使它保持待定，不能用卸载超时宣称业务已取消。进程退出后，未知写结果仍按原C01定位认回。真实宿主决定何时退出进程，并保留恢复依据。

共同规则沿[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。远程客户端未来也可实现同一服务定义，inject 不要求被调用业务和调用者位于同一进程。Cordis 不是跨进程传输协议，也不提供业务授权或耐久交付保证。

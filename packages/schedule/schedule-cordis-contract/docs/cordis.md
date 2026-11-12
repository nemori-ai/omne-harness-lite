# Cordis 集成

本包的 `./cordis` 唯一拥有 Service、服务键和 Context 类型增补。它依赖纯契约，不依赖通用实现或 -local 提供者。当前定义ScheduleCommandsService与ScheduleQueriesService，键分别为scheduleCommands和scheduleQueries。

共同规则沿[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。远程客户端未来也可实现同一服务定义，inject 不要求被调用业务和调用者位于同一进程。Cordis 不是跨进程传输协议，也不提供业务授权或耐久交付保证。

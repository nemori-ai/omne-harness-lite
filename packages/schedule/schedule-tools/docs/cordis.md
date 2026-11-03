# Cordis 集成

`./cordis` 导出 createScheduleToolsPlugin。它注入 ScheduleCommands、ScheduleQueries、Tool bindings 和 generations 的公开服务键，并通过 contributeTool 管理贡献。工具资产必须声明 schedule.read 和 schedule.write 两项能力；具体业务读写仍由 Schedule 服务判断。

宿主传入 ToolAuthorContext 与 ToolAuthorConfiguration。工具没有模型侧 construction 设置。工厂不创建 SQL 后端或 Schedule 业务实例，也不擅自提供可信恢复和披露策略。

依赖撤除由 Tool 贡献生命周期撤销本代贡献；恢复后重新注册。卸载不撤销已接受业务。共同规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。Cordis 负责进程内装配，不是跨进程传输协议，也不提供业务授权或耐久交付保证。

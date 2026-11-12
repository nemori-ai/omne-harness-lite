# Cordis 集成

`./cordis` 导出 createCalendarToolsPlugin 和 CalendarToolConfiguration。插件 inject calendarQueryKey、toolBindingsKey、toolGenerationsKey，调用 ctx.calendarQuery，经 Tool 的 contributeTool 作者协议注册自己的贡献。它不依赖 calendar 实现或 calendar-local。

宿主提供 ToolAuthorContext、真实 Tool 环境和输出保管配置。工具所需 capability 必须且只能是 calendar.read，动作只有 list/get/effective/resolve。createCalendarToolEnvironment 从每次 CallAccess 解析可信上下文，模型参数不能自报 tenant、actor、authContext 或供应配置。

完整判别结果、错误与依据交给现行 ToolOutputCustody/Offloader，Calendar 不建设详情存储或通用 detailRef/truncated 字段。超过 16 MiB 编码预算明确失败，分页保留 nextCursor，长结果读回受 Tool 的当前资格规则约束。

贡献 token、代际、调用与结果保管沿[现行 Tool 贡献协议](../../../tool/tool-cordis-contract/docs/cordis.md)。插件停止只撤自己的贡献，基础环境拥有准备与释放。必需依赖退出先关闭准入，未完调用按原身份保管；撤贡献不证明外部效果或旧调用已撤回。共同规则见[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。

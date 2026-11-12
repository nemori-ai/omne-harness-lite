# 使用与定位

## 使用方式

独立 Tool 作者宿主把 CalendarQueries 交给 createCalendarToolModule，再用 createCalendarToolEnvironment(base, resolver) 包装真实环境。resolver 依据每次 CallAccess 返回已校验的可信上下文；基础环境继续拥有资源准备与释放。单独创建 module 不会注册运行工具。

Cordis 宿主用 createCalendarToolsPlugin 接入 ToolAuthorContext，并配置真实 Tool 作者协议的环境/输出保管设施。插件依赖 calendarQueryKey、toolBindingsKey、toolGenerationsKey。所需 capability 必须且只能是 calendar.read。

## 消费者与定位

本域工具测试通过真实公开 Tool 作者接口装配，验证可信环境和结果传递。最终 harness 与外域 Tool 系统正式接线留待 M2 后，不从 fixture 推定已采用。未来 HTTP/SDK 不由本包提供，Schedule/Job 工具仍是 A2。

依赖方向归[组架构](../../docs/architecture.md)，完整行为归 [SPEC](../SPEC.md)。

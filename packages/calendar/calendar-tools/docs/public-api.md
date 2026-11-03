# 公开入口

## 导出入口

[根入口](../src/index.ts)导出 createCalendarToolModule、createCalendarToolEnvironment、CalendarToolContextResolver/CalendarToolEnvironment、calendarToolArgumentsSchema、calendarToolResultSchema 和 adoption。`./cordis` 导出 createCalendarToolsPlugin 及 CalendarToolConfiguration。

## 定义索引

[protocol.ts](../src/protocol.ts)拥有动作参数与结果 schema；[environment.ts](../src/environment.ts)拥有可信上下文 resolver；[author.ts](../src/author.ts)拥有作者模块；[cordis.ts](../src/cordis.ts)拥有贡献插件与配置。

动作仅 list/get/effective/resolve，能力仅 calendar.read。resolve 的五类计算沿 Calendar 定义，不复制算法。模型不能填写租户、actor、authContext、SQL、供应配置、seed 或 callback。

输出保留完整 kind、错误、计算依据与 nextCursor，交给现行 ToolOutputCustody/Offloader。Calendar 不定义 detailRef/truncated，也不建设详情仓。超过 16 MiB 编码上限明确失败，不返回裁剪成功。按当前资格读回与长结果托管由 Tool 拥有者负责。

工具边界和复用责任见[复用规划](../../docs/reuse-plan.md#calendar-tools-提供什么)。

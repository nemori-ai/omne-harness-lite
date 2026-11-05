# 日历约束下的日程预览

本例读取已发布的中国节假日种子，通过真实 Calendar、Schedule 应用服务和 Cordis 提供者计算候选时间。它只预览，不创建日程或 Job。

## 运行

在源码仓库根目录运行。需要 Node.js 24 及已安装的工作区依赖。

```sh
node --conditions=source --experimental-strip-types packages/schedule/schedule-local/examples/calendar-preview.ts packages/schedule/schedule-local/examples/calendar-preview.json
```

程序建立隔离 SQLite 数据库。输出中的 `database` 给出实际路径，退出时关闭数据库和工作线程。输入文件必须是 `SchedulePreviewRequest`，且 `source.kind` 为 `inline`。非法输入在创建数据库之前拒绝。

## 观察结果

默认输入表示上海时区每天 09:00，遇非工作日跳过。2026 年 2 月 14 日至 28 日应得到 6 个候选，分别是 14、24、25、26、27、28 日。14 日和 28 日是调休工作日。输出还包含被排除的日期及实际采用的日历版本。

`readOnly.before` 和 `readOnly.after` 显示日程行数。两者应一致。成功且完整时退出码为 0，业务错误为 1，计算未完成为 2。输入校验或运行异常也以非零退出。

复制 JSON 后可修改以下输入，再把副本路径传给命令。

- 把 `calendarOverlay.adjust` 改为 `nextWorkingDay`。假日候选顺延，落在同一时间的来源合并。2 月 24 日的候选应保留 10 个来源。
- 把 `binding` 改为 `{"kind":"followUserEnvironment"}`。本例使用固定的环境夹具，结果记录它的修订。
- 把日期改到已发布种子覆盖范围之外。应用应返回 `coverage_insufficient`，不能把没有数据当作没有候选。

## 验证边界

这是源码检出内的验收程序，复用测试装配，不是供部署应用直接导入的装配模块。`evidenceScope` 列出实际实现和夹具。

种子读取与哈希检查、Calendar 查询及 SQL、Schedule SQL、计算工作线程、应用服务和两域 Cordis 提供者均为真实实现。身份授权、设置环境、同意及配额守卫、提交依据守卫和空执行历史使用夹具。本例不能证明真实撤权协调、Tool runtime、在线供应刷新或 Job 执行已接通。

公开请求形状归 [schedule-contract](../../schedule-contract/README.md)。自动回归见 [seeded-calendar.spec.ts](../tests/assembly/seeded-calendar.spec.ts)。

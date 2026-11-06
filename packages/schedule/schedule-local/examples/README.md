# 日历约束下的日程预览与管理

本页提供预览与管理两个示例。`calendar-preview.ts` 读取已发布的中国节假日种子，通过真实 Calendar、Schedule 应用服务和 Cordis 提供者计算候选时间。该预览程序不创建日程或 Job。

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

## 通过真实工具宿主管理日程

[management.json](management.json) 提供可修改的设置、定义和命令顺序。[management.ts](management.ts) 先把设置写入真实 Settings SQL，再经 Calendar、Schedule 和 Tool host 调用公开服务。它比较直接预览与工具预览的结果，然后创建日程、查询原操作并执行管理命令。

```sh
pnpm -r --filter @omne-harness/schedule-local... --filter @omne-harness/calendar-local... run build
node --experimental-strip-types packages/schedule/schedule-local/examples/management.ts packages/schedule/schedule-local/examples/management.json
```

默认输入使用上海时区，每个工作日 09:00 提醒。固定演示时钟为 2026 年 11 月 4 日。预览应返回 11 月 5、6、9、10 日，对应 UTC 01:00。创建后依次暂停、恢复、停止，最终应只有一条日程、四条修订，状态为 `stopped`。程序不创建 Job，也不执行提醒。

输出保留每步真实工具返回、数据库路径及提供者清单。正常完成退出码为 0；预览不完整、业务拒绝或运行失败以非零退出。用户亲手验收需检查这些结果，自动测试不代填人工结论。

可复制输入文件做以下操作。

- 把 `commands` 设为空数组，观察创建后的 active 状态。
- 把 `initial` 改为 `{"kind":"draft","reason":"先审核再启用"}`，把第一条命令改为 `{"action":"promote","reason":null}`，再暂停、恢复或停止。
- 在暂停之前加入 `{"action":"update","patch":{"kind":"label","label":"新的标题"}}`，观察修订增加。程序用上一条成功结果的修订提交下一条命令。
- 将 `settings.timezone` 改为 `Asia/Tokyo`，保留中国日历。预览应返回 `environment_incoherent`，不得创建日程。
- 把日期设到已发布日历覆盖之外，观察 `coverage_insufficient`，不得用普通周末规则补结果。

本例使用真实 Identity 主体发行、成员资格、Settings 目录/命令、两个领域的 SQL 与 Cordis 服务，以及实际 Tool host、bindings、loader 和工具插件。Tool ledger 是真实实现，其 store 为内存测试提供者；不证明进程重启后的工具记录耐久性。领域权限、同意、额度和提交依据 guard，以及 Tool 的来源、启动许可、上下文恢复来源和输出保管均是明确的验收设施。

授权/HITL 可由消费者通过既有接口叠加，本例不提供该域实现。读取设置获得的修订不是后续写入的原子围栏。本例不证明生产授权、最终应用部署或 `toolRuntime.invoke` 已接通。组合验证见 [settings-management.spec.ts](../tests/assembly/settings-management.spec.ts) 和 [tool-host.spec.ts](../tests/assembly/tool-host.spec.ts)。

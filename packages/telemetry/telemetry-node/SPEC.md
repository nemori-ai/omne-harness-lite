# @omne-harness/telemetry-node 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/` 的公开定义，导航见 [docs/public-api.md](docs/public-api.md)。端口的共同规则（不抛错、字段与绑定校验、作用域、carrier、段、关闭报告的确认边界）归 [telemetry-contract 的 SPEC](../telemetry-contract/SPEC.md)。本文件只写本提供者自己承担的责任，条款编号为 TN。

## 范围与依据

本包是工程遥测的 Node 提供者。第一版只有本地出口：`log`、`event`、`metric` 与段记录写成 JSON Lines，不导出 OTel 链路与指标。它拥有：

- 运行时：校验、有界队列、本地出口、计数、限频摘要与关闭报告。
- 禁用实现。
- Cordis 日志桥（三态）。
- `./cordis` 下的两个插件工厂。
- 离线热点聚合：纯函数 `summarizeTelemetry` 与命令 `omne-telemetry-summary`（TN-11）。

状态：候选，第一版。设计依据是 [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md) 的 B 线：「[Cordis 承载与应用装配](../../../docs/rfcs/RFC-0013-engineering-telemetry.md#cordis-承载与应用装配)」「[计时记录与离线聚合](../../../docs/rfcs/RFC-0013-engineering-telemetry.md#计时记录与离线聚合)」「[资源预算](../../../docs/rfcs/RFC-0013-engineering-telemetry.md#资源预算)」。RFC-0013 还没有接受，所以本文件的全部条款都是候选范围。

本包不拥有下列事项：

- OTel traces 与 metrics、OTLP 与 `health()`。它们随 OTel 推迟，见 RFC-0013「后续」。
- 输出代的换代与管理面。它们是推迟项，见 RFC-0013「后续」。
- 应用装配、`telemetry` 行的配置 schema、关闭顺序与 stdout 的唯一写者。它们归 `apps/harness-server`。
- 各领域的事件定义与 facade。

## 结果与不变量

### TN-1 创建与选项

`createTelemetryRuntime(options)` 只在创建时校验一次选项：

- `budgets` 的六个成员都必填，必须是正整数。本包不给预算默认值，数值来自配置（IC-14）。
- `generation` 是 1 到 128 个可打印 ASCII 字符，不含空格。
- `instance` 必须是合法的 `OwnedRef`，规则沿用 `validateBinding`。
- 非法选项抛 `TypeError`。
- 运行时在创建时取得 `budgets` 与 `instance` 的拷贝。之后调用方修改原对象，不影响运行时。

`file` 出口在创建时打开文件。文件打不开时，创建抛 `Error`，消息含路径与错误码。运行时不改用其他出口，也不静默降级。

### TN-2 准入

每次端口操作同步完成，不抛错（TC-1）。一条记录按下面的次序判定，第一条不满足的规则决定结果：

1. 运行时已开始关闭：`dropped(closed)`。
2. 定义无效：`dropped(invalid)`。运行时用契约的 `defineEvent`、`defineMetric`、`defineSegment` 重新核对定义，所以手写的定义与 `define*` 的定义遵守同一套规则。冻结的定义按对象身份缓存核对结果。
3. 绑定或字段无效：`dropped(invalid)`。运行时先取输入的冻结拷贝，再用 `validateBinding` 与 `validateFields` 判定这份拷贝。被判定的就是被写出的。
4. 记录序列化后超过 `maxRecordBytes` 字节：`dropped(invalid)`。
5. 队列已有 `maxQueueItems` 条，或加入后超过 `maxQueueBytes` 字节：`dropped(capacity)`。
6. 其余：进入队列，答 `admitted`。

读取时抛错的输入答 `dropped(invalid)`。每个丢弃都按原因计数。

### TN-3 记录形状

运行时把每条记录作为一个 `TelemetryRecord` 对象交给出口，由出口序列化。共同成员如下：

- `kind` 恒为 `telemetry`。`time` 是 `clock.now()` 的 ISO 文本。
- `generation` 是选项的输出代。
- `owner`、`name`、`version` 取自定义。
- `scope` 是 `actingScopeCodec.encode(binding.scope)` 给出的 JSON 对象。
- `component`、`instance`、`work`、`attempt`、`call`、`adopted`、`links` 取自绑定快照。绑定里没有的成员不写。

各信号的附加成员：

| `signal`        | 附加成员                                            | 说明                                                        |
| --------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| `event`         | `level`、`fields`                                   | `level` 取自定义                                            |
| `metric`        | `value`、`fields`                                   | 第一版没有指标后端。每次 `record` 写一条，标签放在 `fields` |
| `segment-start` | `trace`、`span`                                     | `links` 是绑定的 links 加上 `startSegment` 选项的 links     |
| `segment-event` | `level`、`trace`、`span`、`fields`                  | `trace` 与 `span` 和段开始时相同                            |
| `segment-end`   | `trace`、`span`、`outcome`、`durationMs`            | `durationMs` 用 `clock.monotonicMs()` 计算                  |
| `log`           | `level`、`fields: { text }`，可有 `bootstrap: true` | 只由日志桥产生，见 TN-9                                     |

`log` 记录的 `owner` 是 `cordis`，`name` 是 `omne.cordis.log`，`version` 是 1，`scope` 是 `system`，`component` 是 logger 名，截断到 64 个字符。运行时准入的 `log` 记录带选项的 `generation` 与 `instance`，`text` 截断到 `maxLogTextLength` 个字符。日志桥自己写出的 `log` 记录不带 `generation` 与 `instance`。

`log` 记录是本提供者拥有的例外：自由文本只出现在 `log` 记录的 `text` 里，不经过领域字段 schema。其他信号的 `fields` 只来自 `validateFields` 接受的值（TC-3）。

### TN-4 排空与出口

准入不等待出口。运行时在后续的一轮事件循环（`setImmediate`）里排空队列，按准入次序写出。每条记录单独写出：一条记录失败，不影响同一批里的其他记录。

- `writer` 出口：运行时把记录对象交给应用的写函数。写函数返回，这条记录就到达 `local-sink` 边界。写函数抛错，这条记录计一次输出错误。
- `file` 出口：运行时用 Pino 10.4.0 的同步 destination（`pino.destination({ sync: true, minLength: 0, append: true })`）在文件末尾写一行 JSON。同步模式下，`write` 在返回之前完成 `fs.writeSync`。`write` 返回且没有发出 `error`，这条记录就到达 `local-sink` 边界。这个边界是操作系统接受了写入，不是 `fsync`。

运行时不重试失败的记录。

### TN-5 计数与限频摘要

运行时保有下列计数：准入数、各原因的丢弃数、输出错误数、队列长度、打开的段数（TC-7）。这些计数不经过本管线。

每次丢弃或输出错误之后，运行时可以调用一次 `summary(line)`。两次调用之间至少相隔 `summaryIntervalMs`（按 `clock.monotonicMs()` 计）。摘要是一行文本，含输出代与上面的计数。下列规则成立：

- 摘要从不进入队列，运行时从不调用 Cordis logger。
- `summary` 抛错时，运行时吞掉这个错误。计数仍进入关闭报告。
- 关闭开始之后不再写摘要。

### TN-6 段

- 打开的段不超过 `maxOpenSegments`。再开一个时，`startSegment` 答 `dropped(capacity)`。
- 每个段有新的 trace 与 span 身份，由 `randomBytes` 生成，`sampled` 恒为真。入站的 carrier 只进 `links`，不成为本段的 trace（TC-6）。
- `startSegment` 先生成身份，再占位置。`randomBytes` 抛出或返回错误长度时，答 `dropped(invalid)`，不占位置。
- 段的 `segment-start` 记录没有被准入时，段不打开，也不占位置。
- `end` 的第一次有效调用结束段，并释放它的位置。之后的调用返回第一次的结果（TC-14）。
- 从不结束的段一直占着位置。见[已知限制](#已知限制)。

### TN-7 关闭

`close(deadlineMs)` 按下面的次序进行：

1. 停止准入。之后的端口操作与 `ingestLog` 答 `dropped(closed)`。
2. 在 `clock.monotonicMs()` 到达期限之前，把队列同步排空到出口。
3. 队列排空时，结束出口并在剩余时间内等待确认。期限到达时，运行时不再等待，直接结束出口。
4. 返回 `CloseReport`。

报告的成员按下面的规则填写：

| 成员        | 规则                                                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admitted`  | 准入的记录数                                                                                                                                                                                                         |
| `droppedBy` | 准入时按原因丢弃的记录数，只列出非零的原因                                                                                                                                                                           |
| `dropped`   | `droppedBy` 的总和加上输出错误数。所以 `dropped` 减去 `droppedBy` 之和，就是准入后没有写出的记录数                                                                                                                   |
| `pending`   | 期限到达时仍在队列里的记录数。这些记录不写出                                                                                                                                                                         |
| `flush`     | 有 `pending` 时为 `deadline`；否则有过输出错误时为 `failed`；否则为 `completed-to-boundary`                                                                                                                          |
| `boundary`  | `flush` 为 `completed-to-boundary` 时为 `local-sink`。其他情况下，有记录到达过出口时为 `local-sink`，否则为 `none`                                                                                                   |
| `transport` | 期限到达时为 `unconfirmed`，从不写 `closed`。`writer` 出口排空后为 `closed`，因为运行时停止调用写函数，流归应用。`file` 出口在剩余时间内收到 `close` 事件为 `closed`，收到 `error` 为 `failed`，超时为 `unconfirmed` |

`close` 不拒绝。重复调用返回第一次调用的同一个 Promise。非有限或负的期限按 0 处理。

### TN-8 禁用实现

`createDisabledTelemetry()` 返回与运行时同形的对象。它是在场的提供者，不是缺席（IC-9）：

- 关闭之前，每次端口操作与 `ingestLog` 答 `dropped(disabled)`，并计入 `droppedBy.disabled`。
- 关闭之后，每次调用答 `dropped(closed)`，不再计数。
- 关闭报告：`generation` 是 `disabled`，`admitted` 是 0，`dropped` 等于 `droppedBy.disabled`，`flush` 是 `unconfirmed`，`boundary` 是 `none`，`transport` 是 `closed`。禁用实现没有写出任何记录，所以报告不声称任何边界。

### TN-9 Cordis 日志桥

`createCordisLogBridge` 的 exporter 导出到 WARN（Cordis 4.0.4 的级别 ERROR 0、INFO 1、WARN 2、DEBUG 3）。DEBUG 不导出。每条消息变为一条 `log` 记录（TN-3）。桥有三个状态：

| 状态   | 进入                                   | 路径                                         | 计数                                          |
| ------ | -------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| 引导   | 创建时                                 | 经 `write` 直接写出，并放进有界引导缓冲      | 缓冲满时 `bootstrapOverflow` 加一，消息仍写出 |
| 就绪   | `attach(runtime, { replayBootstrap })` | 交给 `runtime.ingestLog`，由运行时准入与计数 | 运行时的计数                                  |
| 关闭后 | `detach()`                             | 经 `write` 直接写出                          | 每条 `afterClose` 加一                        |

- `replayBootstrap` 为真时，`attach` 先把缓冲里的消息标 `bootstrap: true` 交给运行时。运行时的出口与 `write` 相同时，用 `false`，因为这些消息已经写过一次。`attach` 与 `detach` 都清空缓冲。
- 文本用 `Logger.format` 生成，并截断到 `maxTextLength` 个字符。格式化抛错时，文本是固定的 `<the log message did not format>`，`formatFailures` 加一。
- `write` 抛错时，`writeFailures` 加一，这条消息丢失。
- exporter 从不向记日志的一方抛错（IC-12）。

### TN-10 插件

- `createTelemetryNodePlugin({ runtime })` 返回插件类 `TelemetryNodePlugin`。`createDisabledTelemetryPlugin({ runtime })` 返回插件类 `DisabledTelemetryPlugin`，`runtime` 来自 `createDisabledTelemetry()`。两个类都继承 `@omne-harness/telemetry-cordis-contract/cordis` 的 `TelemetryService`，不另写键（IC-2）。
- 插件把 `runtime.port` 作为 `telemetry` 服务提供，不创建资源，`inject` 为空。
- 插件的 effect 只登记兜底关闭：fiber 结束时调用 `runtime.close(0)`。期限为 0，所以兜底不排空队列。应用已经关闭运行时时，`close` 返回已有的报告，兜底什么也不做。兜底不代替应用的显式关闭。

### TN-11 离线热点聚合

`summarizeTelemetry(lines, filter)` 是纯函数。它读一组 JSON 文本行，返回一份 `TelemetrySummary`。它不读文件，不写输出，不抛错。命令 `omne-telemetry-summary` 读一个文件或标准输入，按行交给这个函数，再打印报告。

每一行按下面的次序分类，第一条成立的规则决定结果：

1. 只含空白的行：跳过，不计数。
2. 不是 JSON，不是 JSON 对象，或 `kind` 不是字符串：计入 `skipped.invalid`。
3. `kind` 是 `telemetry` 以外的字符串（例如 `serve` 写的 `tree`、`row-state`）：计入 `skipped.otherKinds`。
4. `kind` 是 `telemetry`，但不符合 TN-3 的形状：计入 `skipped.invalid`。函数核对的成员是：`time` 能被 `Date.parse` 解析；`scope` 能被 `actingScopeCodec` 解析；`owner` 与 `name` 是字符串；`signal` 是 TN-3 的六种之一；段记录有字符串的 `trace` 与 `span`；`segment-end` 的 `outcome` 是三种结果之一，`durationMs` 是有限的非负数；`event`、`segment-event`、`log` 的 `level` 是四个级别之一。
5. 其余：有效记录。

跳过的行不中止聚合，其余行照常计入。有效记录再经过筛选。筛选只是读者侧的选择，不授予任何权限：

- `tenant`：只保留 `scope` 是这个租户的记录。`system` 的记录（包括全部 `log` 记录）不保留。命令行的 `--tenant` 取 legal-identity 的租户文本，即 `{"organization":…,"account":…}`。
- `from` 与 `to`：只保留 `from` ≤ `time` < `to` 的记录。

保留的记录按下面的规则进入报告：

| 成员         | 规则                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segments`   | `segment-end` 记录按 `(owner, name)` 分组。每组有条数、`ok`／`failure`／`unknown` 各自的条数，以及 `durationMs` 的 min、p50、p95、p99、max。按 p95 降序，p95 相同时按 owner 与 name 升序 |
| `events`     | `event` 与 `segment-event` 记录按 `(owner, name, level)` 计数。按条数降序                                                                                                                |
| `logs`       | `log` 记录按 `level` 计数，四个级别都列出                                                                                                                                                |
| `unfinished` | 有 `segment-start`、没有同一 `(trace, span)` 的 `segment-end` 的段数                                                                                                                     |
| `skipped`    | 上面第 2 至 4 条规则的计数。筛选去掉的记录不计入                                                                                                                                         |
| `window`     | 保留的记录中最早与最晚的 `time`，写成 ISO 文本。没有保留的记录时为 `null`                                                                                                                |

百分位用最近秩法：把一组时长升序排列，第 p 百分位是第 ⌈p × n ÷ 100⌉ 个值（秩从 1 开始），不插值。`metric` 记录是有效记录，但不进入本报告。

段的配对只看输入里的行。段在筛选窗口之内开始、在窗口之外结束时，它计为 `unfinished`。

命令行：

- `omne-telemetry-summary [--json] [--tenant <租户文本>] [--from <时间>] [--to <时间>] [<文件>]`。没有文件参数时读标准输入。
- `--json` 打印 `TelemetrySummary` 的 JSON。缺省打印人读的表格，段按 p95 降序。
- 用法错误（未知选项、多于一个文件、缺少选项值、租户文本或时间无法解析）：退出码 2，错误与用法写到 stderr，stdout 为空。
- 输入无法读取：退出码 1，原因写到 stderr，含文件路径。
- 其余：退出码 0。输入里的非法行不改变退出码，只进入 `skipped`。

报告只供运维者在本机使用。它含 owner、name 与时间，不含字段值与日志正文。报告不外传。

## 所有权、失败与生命周期

- 应用创建并持有运行时，负责显式关闭与关闭报告的去向。插件只借用 `runtime.port`。
- 一个运行时只有一次生命。关闭之后，它对一切调用答 `dropped(closed)`。插件被撤除时运行时随之关闭，所以重新装载插件需要新的运行时。
- `file` 出口的文件描述符归运行时，关闭时释放。`writer` 出口背后的流归应用。
- `admitted` 只表示本地准入。准入之后的输出错误进入计数与 `CloseReport`，不改变已经返回的 `Admission`。
- 段配对、准入计数与段的幂等结束只在同一进程内成立（IC-19）。
- 本包的失败只进入计数与限频摘要，不经 Cordis logger 回到本管线，没有递归。

## 已知限制

- `log` 记录的 `text` 是自由文本，可能含租户标识。D06 裁定之前，`log` 记录不外传。第一版只有本地出口（stdout、stderr、本地文件），满足这一点。
- 从不结束的段一直占着 `maxOpenSegments` 的位置。第一版没有实现段的最长存活期。
- `file` 出口的一次写入失败后，SonicBoom 保留没有写出的缓冲，并在下一次写入时先写它。所以计为输出错误的一条记录，之后可能仍出现在文件里。
- `local-sink` 边界不包含 `fsync`。进程崩溃后，操作系统已接受但没有落盘的内容可能丢失。

## 组合与验证

本包消费 `@omne-harness/telemetry-contract`（workspace 版本）、`@omne-harness/telemetry-cordis-contract`（workspace 版本，只在 `./cordis`）、`@omne-harness/legal-identity`（workspace 版本）、`@deepseek-ai/cordis` 4.0.4（catalog）与 `pino` 10.4.0（精确版本）。

| 条款                        | 持续验证                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| TN-1                        | `tests/runtime.spec.ts`「options」；`tests/file-outlet.spec.ts` 的打不开的文件                |
| TN-2、TN-3                  | `tests/runtime.spec.ts`：记录形状、无效字段与绑定、超长记录、代理对象、指标、秘密样式的输入   |
| TN-4                        | `tests/runtime.spec.ts`「outlet failures」；`tests/file-outlet.spec.ts` 的真实文件            |
| TN-5                        | `tests/runtime.spec.ts`：写函数持续抛错时的摘要条数与计数，摘要出口抛错                       |
| TN-6                        | `tests/runtime.spec.ts`「segments」                                                           |
| TN-7                        | `tests/runtime.spec.ts`「close」与「close at the deadline」；`tests/file-outlet.spec.ts`      |
| TN-8                        | `tests/disabled.spec.ts`                                                                      |
| TN-9                        | `tests/log-bridge.spec.ts`，用真实的 Cordis `Context` 与 logger                               |
| TN-10                       | `tests/cordis-entry.spec.ts`，用真实的 Cordis `Context`                                       |
| TN-11                       | `tests/summary.spec.ts`，含运行时真实写出的记录；`tests/summary-cli.spec.ts` 在进程内调用命令 |
| 根入口不依赖 Cordis（IC-4） | `tests/public-entry.spec.ts` 遍历构建产物的导入；`pnpm run lint:deps`                         |

未覆盖：应用装配、关闭顺序、stdout 的唯一写者与 `shutdown-result` 的最后一行，归 `apps/harness-server` 的测试。

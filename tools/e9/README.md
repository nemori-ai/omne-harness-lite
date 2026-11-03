# E9 长会话记录工具

本工具为 #979 r2 保存事件和逐轮记录，导出离线曲线，并执行中位数门和逐段增长门。DP1 C、墙钟余额、Linux fsync 首测和 DP2 B 采用 [Reduce 批复 R2-D17](https://github.com/nemori-ai/omne-harness-lite/issues/979#issuecomment-6576165103)。工具使用 Node 标准库，没有独立编译或类型检查入口。Node 版本沿项目 `engines.node`。

```sh
node tools/e9/cli.mjs run --root <检出绝对路径> --out <新归档目录> --adapter <本地适配模块绝对路径> --timeout-ms 1800000
node tools/e9/cli.mjs compare --before <前次归档> --after <本次归档>
node tools/e9/cli.mjs selftest --out <新自检目录>
node --test tools/e9/*.test.mjs
```

`run` 经目标检出的 `scripts/with-test-slot.mjs` 持有名额。`--timeout-ms` 是适配器总时限，默认 1800000 毫秒，从适配器进程开始执行时计时。排队不消耗该时限。适配器收到超时的 `abortSignal`，工具保存已有轮次并调用 `close()`。两秒后仍未退出时，父进程清理适配器进程树。

名额包装的上界按各段预算相加。队列采用 `OMNE_TEST_SLOT_MAX_WAIT_SECONDS`，默认仍是 7200 秒，再加一轮 `OMNE_TEST_SLOT_POLL_SECONDS`，默认 5 秒。后续预算包括两条 Git 元数据命令各 30 秒、适配器时限及 2 秒关闭余量、15 秒进程清理上界和 30 秒归档余量。无适配器的产品探针按服务端 60 秒及三条 CLI 各 30 秒计算执行预算。`wrapper.json` 保存各段预算和包装进程结果。队列耗尽记等件并退出 `3`，原始 `75` 留在进程记录。取消同样归档为等件，已有失败仍优先。包装超时或清理不完整记失败。

Windows 保留 `taskkill /PID /T /F`，记录命令结果，不把退出 `0` 称为全部后代已停止。POSIX 在 `spawn` 返回后、让出事件循环前，只读取一次根 PID 的启动身份。Linux 定向读取 `/proc/<pid>/stat`，其余 POSIX 使用 `ps -p <pid>`，命令上界为 1 秒。这次读取不枚举全机进程。读取失败或根不可见时保留未知，不能到停止时认领当时的 PID 使用者。

POSIX 仅在超时或取消时枚举和清理进程。Linux 从 `/proc` 读取全部可见进程的临时快照，其余 POSIX 使用 `ps`。工具沿已核验身份的父子关系发现后代，包括独立进程组的后代。发送 `SIGKILL` 前重新采集并核对启动身份，再观察终态。工具不发送 `SIGSTOP`，采集失败或预算耗尽不会遗留本工具冻结的进程。发现与终态观察共用 2 秒预算，最多保留 256 个已发现身份和 32 条错误，额外错误只计数。触及上限、采集失败或信号失败均记 `incomplete`。

正常测量期间，全机扫描频率为 0，没有进程追踪定时器。每个子进程只保留一份根身份或读取失败，不积累历史 PID 或错误，状态不随轮数增长。正常结束仍由适配器的 `close()` 释放其资源。清理结果逐项记录 `exited`、`zombie`、`running` 或 `unknown`。`observed-stopped` 只表示已观察进程均停止运行，僵尸仍等待系统回收。最后一次采集失败时，终态为 `unknown`。未观察后代始终记 `unknown`；已重新父化或在发现之后新建而未被观察的进程不在终态证明内。清理时根进程已不可见或启动身份改变也记 `incomplete`，不向复用根及其后代发送信号。

非 Linux 的 `ps` 启动身份只有秒级精度，同秒内的 PID 复用仍有识别限制。身份读取与信号发送也不是一个操作系统原子操作，工具不提供进程句柄级的隔离证明。这项清理不是操作系统级进程容器。退出、超时、取消和清理结果写入 `processes.json`。工具不能撤回外部模型或工具效果。

归档目录必须新建。已有归档拒绝覆盖。退出码为通过 `0`、已发现失败或输入损坏 `1`、命令参数错误 `2`、等件或不可比 `3`。`--threshold` 可显式设置正数阈值，归档记录 CLI 来源。缺省 1.5 的来源仍为 R2-D1 第 5 条初值。

## 适配器输入边界

适配模块由调用者显式选择。事件不能指定执行代码。模块必须导出 `workload` 和 `open(context)`。

```js
export const workload = {
  kind: 'product', // 合成输入必须写 synthetic。
  definition: '本次固定工作负载及观察方法的版本标识',
  modelDelayMs: 100,
  toolDelayMs: 100,
}

export async function open({ root, out, abortSignal }) {
  return {
    async nextRound(round) {
      // 只在该轮真实完成后返回该轮完整事件数组。
      return events
    },
    async close() {
      // 释放适配器创建的资源。
    },
  }
}
```

工具串行等待 `nextRound(round)`，最多 200 轮。`logCount` 达到 10000 后不再请求下一轮。HTTP 受理不能替代完成事件。适配器负责证明四段含义、完成关联、固定延迟实际执行和 fsync 观察来源。`close()` 失败独立进入诊断，不能覆盖更早错误。需要其他资源或外部效果时，由调用方提供授权。

事件 schema 为 1。每个事件包含 `schemaVersion: 1`、非空 `runId`、从 1 连续递增的 `round` 和 `eventKind`。一次运行的 `runId` 必须一致。时间事件使用有限非负 `startMs`、`endMs`，且 `endMs >= startMs`。

时间事件的 `clock` 是 `{ processId, clockId, generation }`，三个值均为非空字符串。它声明单调时钟及代次。工具不支持跨时钟换算。缺失或不合格的时钟产生未测量值。

| eventKind        | 额外字段和含义                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `round-complete` | 时间区间和累计实际日志条数 `logCount`。每轮恰好一条。                                                                                               |
| `stage`          | 时间区间和 `stage`。键为 `sessionIO`、`projectionInterpretation`、`requestAssembly`、`agentProgression`。重复调用用多条完整区间事件表达。           |
| `external-wait`  | 时间区间、`provider: 'model'` 或 `'tool'`、非空 `invocationId`、有限非负 `definedDelayMs`。每轮调用标识唯一。区间记录实际等待，不能用配置延迟代替。 |
| `fsync-count`    | 每轮至多一条总计数。含非负安全整数 `count`、`source`、非空 `traceRef`、非空 `roundAssociation`。最后两项分别指向原始观察及解释轮关联的证明。        |

`fsync-count.source` 只接受 `strace`、`provider-observer` 或 `synthetic`。前两者分别声明系统调用跟踪或真实提供者观察，调用者必须保留对应证据。它们不能表示逻辑提交次数。`synthetic` 仅可用于合成工作负载。缺少 fsync 事件时记未测量，不能把 Windows 计数写成 0。Linux 的真实 trace 和轮关联由联调 B 交付，本工具不安装跟踪器，也不从上层提交数推算系统调用数。

所有收到的事件先按原字段保存为 `events.jsonl`，每行一条。非法事件、重复完成或错轮输入不会静默丢弃，运行记失败。`progress.jsonl` 保存已验证轮次，异常后也保留。`adapter-result.json` 保留首错和关闭诊断。输入必须可用 JSON 表达。

## 成员事件的纯投影（R2-D133）

`projection.mjs` 导出 `projectRound(input)` 和 `projectSegmentInterval(input)`。
它们不读取时钟、文件或产品状态，不安装观察者，也不实现 `open()`。发行接线仍归 Reduce C1。
输入是可结构化克隆的数据。成员事件与 Model 辅助事件的来源以基线
`08dd1c9add2dca5037d8aca5015347fa79e7cfb0` 为准。Tool 辅助事件的来源以批次 E 的
`packages/tool/tool/tests/support/tool-measurement.ts`（提交 `e44fea864`）为准。

`projectRound` 接收下列字段：

| 字段                    | 含义                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runId`、`round`        | 整次测量的非空标识和1～200的轮号。不是 Session 的 Run ID。                                                                                                                                  |
| `session`、`sessionRun` | 该轮真实 Session/Run 身份，核对 Session 终态事件或读到的终态。                                                                                                                              |
| `roundStart`            | 调用者在轮开始处实际读取的 `{process, clock, generation, atMs}`，时间为单调毫秒。没有时不从最早的段推算。                                                                                   |
| `logCount`              | `{state:'measured',value,unit:'count',source}`，非负安全整数且来源非空；或保留调用者的未测量对象。数值必须来自实际累计 Session 日志条目，不能用 revision、storage commit 数或事件条数代替。 |
| `memberEvents`          | `{event,reading}`数组。event是 Session、Context、Agent 的原 `measure` 回调值；reading是同步收到该事件时的单调读数，形状同roundStart。                                                       |
| `modelEvents`           | L-MODEL `tests/support/model-measurement.ts` 的原事件数组：`stage-interval/model-request-preparation` 或 `external-wait-interval/model-fixed-delay`。                                       |
| `toolEvents`            | L-TOOL `tests/support/tool-measurement.ts` 的原事件数组：`external-wait-interval/tool-fixed-delay`，provider 为 `measured-fixed-delay-tool`。                                               |
| `requiresToolWait`      | 本轮实际调用了工具时声明 true。此时没有合格的工具等待就记诊断，不由模型等待顶替。                                                                                                           |
| `terminalObservation`   | 可选。`{session, run, source, reading}`：调用者读到的 Session 运行状态 `run`（`kind:'terminal'`，含 `terminal.run/outcome/evidence`）、读取来源和读取时刻。用途见下文 D7。                  |

采集者负责真正分轮、把执行身份关联到该 Run，并保证观察者不重入产品。
投影只核对给定的事实，不能证明没有漏收其他事件。Session目录读的session可以为null。
非null的Session段必须匹配输入session。Context/Agent的execution及operation/pass必须在同一span两端一致。
本函数不替产品证明一个execution属于哪个Run。

三类成员各有自己的span计数。配对键包含进程、时钟、代次、segment和span，不能只用数字span。
Session映射为sessionIO，Context映射为projectionInterpretation，Agent映射为agentProgression。
成功的model-request-preparation区间映射为requestAssembly，只代表该prepare调用的实际范围。
区间不相加，也不裁剪到轮区间。包含式段可能覆盖终态之后的答复收尾。
区间并集及最终判定继续由现有 `normalizeEvents` 和 `metrics.mjs` 执行。

### 轮终点的两个来源

首选来源是匹配 Session/Run 的 `round-complete` 成员事件，终点取它的回调时刻。
R2-D62 D7 记录了本波的已知限制：AD-02 提交的 Run 终态不发这个事件。
所以本波按 D7 的口径，允许用 `terminalObservation` 作轮终点。它对应 `lastTerminal()` 读到的终态。
读取时刻在真实终态之后，差值包含轮询间隔和这次读取本身。
因此它是终点的上界，会使 endToEnd 与 ownOverhead 偏大。轮询间隔固定时，这个偏差不随轮数增长。

两个来源都存在时，终点取成员事件，两者必须指向同一个 Run，否则记 `round-end-sources-disagree`。
两个来源都没有时，记 `round-completion-missing`。结果的 `roundEnd` 写明实际依据：
`session-round-complete` 或 `observed-terminal`。

下列条件全部成立，且本次没有投影诊断时，才发 schema 1 的轮完成：

- 终态结局为 `completed`。
- 终态的会话与 Run 和输入一致。
- 终态来源完整：成员事件要有 revision、entry、operation；读到的终态要有 evidence 和非空 source。
- 起点与终点同钟，终点不早于起点。
- logCount 已实测。

failed、cancelled、未知终态、缺起点或未测日志数均不补成功。不能以 HTTP 受理、Agent段结束或“已跑200轮”替代。

### 外部等待

Model等待只认 `measured-fixed-delay-model` 的成功事件，Tool等待只认 `measured-fixed-delay-tool` 的成功事件。
两者都使用actualStart/actualEnd，并核对它们与原start/end和elapsedMs一致。
definedDelay只作为配置事实保留，不用来制造实际耗时。
同一轮内，模型与工具的 invocationId 合在一起不得重复。等待必须处于轮的同进程/同钟/同代次区间内。
替身事件自己的logCount原样保留，但不拿它代替输入的Session累计日志数。

### 返回值

- `events`：已经可以表达的 schema 1 事件，可能只是部分段或等待。
- `origins`：输出事件对应的输入索引。
- `sources`：整个输入的独立快照，保留失败、取消、未测量状态及附加来源字段。
- `diagnostics`：重复/孤立/未闭合span、身份或时钟冲突、非成功来源和缺件。诊断非空时不输出轮完成。
- `roundEnd`：发出轮完成时的终点依据，否则为 null。

空diagnostics不是E9通过：仍可能缺少阶段、真实等待或fsync，现有归一器/判定器会分别记录未测量。
调用者必须处理diagnostics，不能丢掉它而把部分events直接作为完整轮交给 `nextRound`。
本模块不改窗口、阈值、fsync来源或原适配器协议。

`projectSegmentInterval` 的输入是 `{runId,round,segment,start,end,outcome,source}`。
segment只取session/context/agent，start/end形状同reading，成功结局为ok。它只转换已经录制的完整区间。
它不证明采集器的配对正确，也永不生成轮完成或日志数。可用来有限核对已有StageRecord。
旧 `w2-measure.ts` 原件只保存合并区间。不能从它恢复丢失的starts，也不能把其storage commit计数变成Session日志数。

## 按轮采集器（C1 的适配器用它）

`collector.mjs` 的 `createRoundCollector({runId, out?, clock?, drainMs?})` 把投影接到 `nextRound`。
它只收集和投影，不装配产品，不驱动输入，也不读 Session 状态。这些仍归 C1 适配器。

| 成员                                                                      | 交给谁、做什么                                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `measure`                                                                 | 作为 Session、Context、Agent 构造参数 `measure` 的观察者。同步记录，带采集者单调钟的读数，从不抛出，不调用产品。                        |
| `modelMeasurement`                                                        | 函数形式的 `measurement`，交给 `createMeasuredFixedDelayModel` 与 `measureModelPreparation`。上下文带采集者的钟，所以等待与轮区间同钟。 |
| `toolMeasurement`                                                         | 函数形式的 `measurement`，交给 `createMeasuredFixedDelayTool`。                                                                         |
| `beginRound(round)`                                                       | 读轮起点。轮次必须从 1 连续，上一轮未结束时拒绝。                                                                                       |
| `observeTerminal({session, run, source})`                                 | D7：调用者读到 Session 运行状态后立即调用，采集者记录读取时刻。                                                                         |
| `finishRound({session, sessionRun, logCount, requiresToolWait?, fsync?})` | 停止接收本轮新段，等本轮已开始的段收尾（最多 `drainMs`，缺省 5000），再投影。超时未收尾的段由投影记 `segment-end-missing`。             |
| `roundEvents(result)`                                                     | 诊断为空时返回完整 schema 1 数组，否则抛 `ProjectionError`。`nextRound` 返回它的结果。                                                  |
| `close()`                                                                 | 写出轮外事件。                                                                                                                          |

段归属规则：起点到达时有打开的轮，这个段就属于该轮，终点按 segment 与 span 找回同一轮。
轮外到达的事件，以及封轮后才到的事件，不并入任何轮，只进轮外记录。
`fsync` 是 `{count, source, traceRef, roundAssociation}`，只附在没有诊断的轮上。来源规则同 `fsync-count`。

给出 `out`（即 `open()` 收到的归档目录）时，采集者追加两份文件：

- `projection.jsonl`：每轮一行完整投影结果，含 `diagnostics`、`roundEnd`、`drain` 和 `sources`。
- `projection-strays.jsonl`：轮外事件。

采集者不写 `events.jsonl`。该文件仍由 worker 单写。

### C1 怎样使用

C1 适配器在 `open()` 里装配发行组合，把上面三个入口接到成员和替身上。每一轮按下面的顺序执行：

1. 调用 `beginRound(round)`。
2. 经入口提交本轮输入。
3. 轮询 Session 运行状态，直到出现新的 `run.terminal`。读到后立即调用 `observeTerminal`。
4. 读实际累计 Session 日志条目数，作为 `logCount`。
5. 调用 `finishRound`，再返回 `roundEvents(result)`。

运行与判定：

```sh
OMNE_TEST_SLOTS=1 OMNE_TEST_SLOT_DIR=<共同名额目录> \
  node tools/e9/cli.mjs run --root <检出绝对路径> --out <新归档目录> \
  --adapter <C1 适配器绝对路径> --timeout-ms 1800000
```

退出码与判定沿「测量与判定」：通过 `0`，失败或输入损坏 `1`，参数错误 `2`，等件 `3`。
总判定在 `summary.json`。逐轮投影诊断在 `projection.jsonl`，首个错误在 `adapter-result.json`。
同一归档可以用 `compare --before <归档> --after <归档>` 重算并核对原始记录。
Windows 上没有 fsync 来源，总判定只能是等件。fsync 的真实值由 Linux strace 首测给出（R2-D17）。

本目录的测试和 `run` 都不在准入里（R2-D141）。完整的 200 轮测量只在 C1 联调 B、波末收口和动到 Session 热路径的 PR 上运行。

测试入口：`node --test tools/e9/projection.test.mjs tools/e9/collector.test.mjs`。
负控覆盖跨成员同号span、错时钟/身份、失败与取消、日志未测、无真实终态、重复等待、
配置延迟冒充实际区间、工具等待缺失或形状不符、读到的终态不合格、终点来源不一致，以及排空超时和轮外事件。

## 测量与判定

轮区间和所有参与扣除的外部等待必须同进程、同 `clockId`、同 `generation`。等待区间必须落在轮区间内。缺失等待记录或时钟不匹配时，`ownOverhead` 未测量。工具先求等待区间并集，再从轮时间扣除，得到非负墙钟余额。该数值不是 CPU 工作量，并行本地计算可能与被扣除的等待重叠。

每段独立计算自己的区间并集，结果为 inclusive duration。重复区间和原时钟保留在逐轮 `intervals` 中。缺段不能补零。四段不相加冒充轮总值。每段固定样本跨轮必须具有相同进程、时钟和代次。阶段可使用自己的拥有进程，与轮区间的时钟不同。

逐轮 `endToEnd`、`ownOverhead`、四个 `stages`、`fsync` 使用以下形状。时间单位为 `ms`，fsync 单位为 `count`。

```json
{ "state": "measured", "value": 12.5, "unit": "ms", "source": "实际观察来源" }
```

```json
{ "state": "unmeasured", "reason": "实际缺测原因" }
```

中位数门使用第 11 至 30 轮和第 181 至 200 轮的 `ownOverhead`。后窗中位数除以前窗，结果不超过阈值时该门通过。缺窗、缺测、时钟代次改变、前窗中位数为零或数值超出有限范围时等件。

四段各自执行 DP2 B。固定第 11 至 200 轮分为 19 个连续十轮块。每块轮号中点为 x，耗时中位数为 y。OLS 同时满足以下条件时，该段失败。

- 斜率 b > 0。
- R² >= 0.95。
- b × 180 > 3 × 残差 MAD。

MAD 是残差相对残差中位数的绝对偏差中位数。常量方差为 0 时不增长。近零实测值使用同一规则。缺样本、缺测或时钟资格失败时等件。非法、非有限或负时间拒绝。统计量超出有限数值范围时等件。摘要保留每块中位数、斜率、R²、MAD 和预测增长。该门只判断 200 轮内的形状，不能证明复杂度或因果关系。

总判定汇总中位数门和四段门。任何已证实失败优先。缺轮、缺测或缺 fsync 不能通过。`selftest` 提供完整合法四段和合成 fsync，分别断言平稳通过、整体增长失败、单段增长失败、缺测及缺窗等件。单段增长负控的总中位数比值为 1，仍因逐段门失败。所有合成结果明确标记 `synthetic`，不构成产品 E9 结果。

## 归档与比较

归档有 `summary.json`、`rounds.jsonl`、`curves.svg` 和 `curves.html`。适配运行另有原始事件、进度、适配器诊断及进程记录。曲线无需网络，悬浮文本显示段名、轮次和绝对毫秒值。缺测不画点，原因保留在 JSONL。

方法元数据固定 `definitionId: e9-wall-residue-ols-r2-d17-v1` 和 `eventSchemaVersion: 1`。`compare` 重算摘要，核对原始记录，拒绝缺测或执行失败的档案。完整适配档案还回放原始事件，核对派生轮次。比较要求方法、阈值及来源、时钟资格、工作负载、平台、OS、Node、核数和名额状态可比。SHA 可以不同，结果列出两端完整 SHA。

## 当前限制

成员已有 `measure` 端口，Model 与 Tool 有固定延迟替身。本目录给出投影与按轮采集器。发行入口装配、驱动输入、读 Session 终态与累计日志条目数，仍由 Reduce 在 C1 适配器里完成。真实 A②/A③ 由联调 B 验证。按读到的终态定轮终点（D7）会使轮耗时偏大一个轮询间隔。Session 补上 AD-02 提交的终态事件后，应改回成员事件。

没有 `--adapter` 时仍走原产品探针。缺应用构建时等件。有构建时仅经真实 serve、SQLite 和公开 CLI 完成注册、登录与建会话，不发送模型或工具输入。它复用 `tools/joint-a/support.mjs` 的 `operatorLayer`。状态与登录文件放在归档目录，应只保存在本机任务证据区。该探针的等待状态不能用合成结果替换。

CLI 返回可信的 `basis-unavailable` 响应且退出码为 `4` 时，探针记录等件并保留原退出码。它表示采用依据不可用，不是已成功创建会话。零退出还必须具有 [CLI 结果对象](../../apps/cli/SPEC.md#命令结果与退出码)及对应操作的成功字段。注册核对账号、组织和租户，登录核对登录标识、签发时间和租户，建会话核对会话标识、认回标志和请求回显。成功字段沿[公开契约](../../packages/access/public-contract/SPEC.md)，登录结果不含证明或凭据。其他非成功响应、缺字段和无法解析的回复仍按探针失败记录。注册或登录未通过时不继续后续操作。

本目录不写产品埋点，不改装配，不将 E9 加入准入。Windows 原生 fsync、Linux 真实跟踪、观察扰动和完整产品闭环均不由合成自检证明。

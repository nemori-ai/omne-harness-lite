# e9

## 总体架构

e9 是长会话测量工具：它逐轮保存事件与记录，导出离线曲线，并执行中位数门与逐段增长门。它只用 Node 标准库，没有包清单，也没有编译或类型检查入口。Node 版本沿项目的 `engines.node`。

| 部分 | 入口 | 做什么 |
| --- | --- | --- |
| 命令行 | `cli.mjs`：`run`、`compare`、`selftest` | 跑一次测量、重算并比较两份归档、合成自检 |
| 判定 | `metrics.mjs` | 两道门与它们的数值形状，`evaluateSeries` 供别的测量复用 |
| 投影 | `projection.mjs`：`projectRound`、`projectSegmentInterval` | 把成员的测量事件翻成 schema 1 的事件 |
| 按轮采集器 | `collector.mjs`：`createRoundCollector` | 把投影接到适配器的 `nextRound` |
| 进程与归档 | `driver.mjs`、`posix-tree.mjs`、`archive.mjs` | 起适配器进程、清理进程树、写归档 |

命令的参数与退出码见 `node tools/e9/cli.mjs --help`。用例用 `node --test tools/e9/*.test.mjs` 跑，不在准入里。

## 领域边界

本工具拥有：事件 schema、两道门的判法、归档与比较的规则、按轮采集器的协议、适配器进程的清理语义。

本工具不拥有：

- 产品埋点与装配：发行入口装配、驱动输入、读 Session 终态与累计日志条目数，归调用方写的适配器。
- Linux 的真实 fsync 跟踪与轮关联：本工具不安装跟踪器，也不从上层提交数推算系统调用数。
- 外部模型或工具的效果：工具不能撤回它们。

消费者：`apps/harness-server/tests/long-session` 用 `evaluateSeries` 判每轮自身开销、进程内存与每轮新增磁盘。`packages/agent/agent-host-local` 的增长用例读 `metrics.mjs`。`tools/joint-b/e9-adapter.mjs` 是一个适配器。

## 心智模型

- 缺测就是缺测。缺段不补零，四段不相加冒充轮总值，缺测、缺窗或缺 fsync 的运行不能判通过。
- 合成结果明确标记 `synthetic`，不构成产品的测量结果。
- 两道门只判断 200 轮内的形状，不证明复杂度或因果关系。

## 应然设计

### 运行与退出码

- `run` 经目标检出的 `scripts/with-test-slot.mjs` 持有运行名额。排队不消耗 `--timeout-ms`。
- `--timeout-ms` 是适配器的总时限，缺省 1800000 毫秒，从适配器进程开始执行时计时。超时时适配器收到 `abortSignal`，工具保存已有轮次并调用 `close()`，两秒后仍未退出就清理适配器的进程树。
- 名额包装的上界按各段预算相加：排队上限加一轮轮询间隔，两条 Git 元数据命令各 30 秒，适配器时限加 2 秒关闭余量，15 秒进程清理上界与 30 秒归档余量。没有适配器的产品探针按服务端 60 秒与三条 CLI 各 30 秒计执行预算。`wrapper.json` 保存各段预算与包装进程的结果。
- 排队耗尽记等件，退出 3，原始的 75 留在进程记录里。取消同样归档为等件，已有失败优先。包装超时或清理不完整记失败。
- 退出码：通过 0，已发现失败或输入损坏 1，参数错误 2，等件或不可比 3。
- 归档目录必须新建，已有的拒绝覆盖。`--threshold` 显式设正数阈值，缺省 1.5，归档记录阈值的来源。

### 进程清理

- POSIX 在起进程后、让出事件循环前读一次根进程的启动身份（Linux 读 `/proc/<pid>/stat`，其余用 `ps -p`，上界 1 秒）。读不到时保留未知，到停止时不认领当时的 PID 使用者。
- 只在超时或取消时枚举与清理进程。沿已核验身份的父子关系发现后代，包括独立进程组的后代。发 `SIGKILL` 前重新核对启动身份。不发 `SIGSTOP`。
- 发现与终态观察共用 2 秒预算，最多保留 256 个已发现身份与 32 条错误。触及上限、采集失败或信号失败记 `incomplete`。根进程已不可见或启动身份改变也记 `incomplete`，不向复用的根及其后代发信号。
- 终态逐项记 `exited`、`zombie`、`running` 或 `unknown`。`observed-stopped` 只表示已观察的进程都停止运行。没观察到的后代记 `unknown`，不在终态证明之内。
- Windows 用 `taskkill /PID /T /F`，记录命令结果，不把退出 0 称为全部后代已停止。
- 正常测量期间不扫描全机进程，没有进程追踪定时器，状态不随轮数增长。
- 这项清理不是操作系统级的进程容器。非 Linux 的 `ps` 启动身份只有秒级精度，同秒内的 PID 复用仍可能认错。结果写进 `processes.json`。

### 适配器协议

适配模块由调用者显式选择，事件不能指定执行代码。模块导出 `workload` 与 `open({ root, out, abortSignal })`。

- `workload` 有 `kind`（产品写 `product`，合成写 `synthetic`）、`definition`（工作负载与观察方法的版本标识）、`modelDelayMs`、`toolDelayMs`。
- `open()` 返回带 `nextRound(round)` 与 `close()` 的对象，可带 `plannedRounds`（1 到 200 的整数，缺省 200，其他值记失败）。轮数少于 200 时后窗缺失，两道门记等件，总判定不能是通过。
- 工具串行等待 `nextRound(round)`，最多 200 轮。`nextRound` 只在该轮真实完成后返回该轮完整的事件数组。`logCount` 达到 10000 后不再请求下一轮。HTTP 受理不能替代完成事件。
- 适配器负责证明四段的含义、完成关联、固定延迟的实际执行与 fsync 观察的来源。`close()` 失败单独进诊断，不覆盖更早的错误。

### 事件 schema 1

每个事件有 `schemaVersion: 1`、非空 `runId`（一次运行内一致）、从 1 连续递增的 `round` 与 `eventKind`。时间事件有有限非负的 `startMs`、`endMs`（`endMs >= startMs`）与 `clock: { processId, clockId, generation }`（三个非空字符串）。工具不做跨时钟换算，缺失或不合格的时钟产生未测量值。

| eventKind | 额外字段 |
| --- | --- |
| `round-complete` | 时间区间与累计实际日志条数 `logCount`。每轮恰好一条 |
| `stage` | 时间区间与 `stage`：`sessionIO`、`projectionInterpretation`、`requestAssembly`、`agentProgression`。重复调用用多条完整区间表达 |
| `external-wait` | 时间区间、`provider`（`model` 或 `tool`）、每轮唯一的 `invocationId`、有限非负的 `definedDelayMs`。区间记实际等待，不能用配置的延迟代替 |
| `fsync-count` | 每轮至多一条：非负安全整数 `count`、`source`、非空 `traceRef` 与 `roundAssociation` |

- `fsync-count.source` 只接受 `strace`、`provider-observer` 或 `synthetic`。前两者要求调用者保留对应证据，不能表示逻辑提交次数。`synthetic` 只用于合成工作负载。缺 fsync 事件时记未测量，不能把计数写成 0。
- 收到的事件先原样存进 `events.jsonl`，每行一条，由 worker 单写。非法事件、重复完成或错轮输入不静默丢弃，运行记失败。`progress.jsonl` 保存已验证的轮次，异常后也保留。`adapter-result.json` 保留首个错误、关闭诊断与实际采用的计划轮数。

### 投影

`projectRound` 与 `projectSegmentInterval` 是纯函数：不读时钟、文件或产品状态，不安装观察者，不实现 `open()`。输入是可结构化克隆的数据。

- `projectRound` 的输入：`runId` 与 `round`（1 到 200，不是 Session 的 Run ID），`session` 与 `sessionRun`，`roundStart`（`{ process, clock, generation, atMs }`，没有时不从最早的段推算），`logCount`（实测的累计 Session 日志条目数，不能用 revision、存储提交数或事件条数代替），`memberEvents`（成员 `measure` 回调的原值与同步读数），`modelEvents`、`toolEvents`（固定延迟替身的原事件），`requiresToolWait`，可选的 `terminalObservation`。
- 三类成员各有自己的 span 计数。配对键包含进程、时钟、代次、segment 与 span。Session 映射为 `sessionIO`，Context 为 `projectionInterpretation`，Agent 为 `agentProgression`，成功的模型请求准备区间为 `requestAssembly`。区间不相加，也不裁剪到轮区间。
- 轮终点首选匹配 Session 与 Run 的 `round-complete` 成员事件。没有时可以用 `terminalObservation`（调用者读到终态的时刻），它是终点的上界，会让 `endToEnd` 与 `ownOverhead` 偏大一个轮询间隔，偏差不随轮数增长。两个来源都有时取成员事件，两者须指向同一个 Run，否则记 `round-end-sources-disagree`。都没有时记 `round-completion-missing`。结果的 `roundEnd` 写 `session-round-complete` 或 `observed-terminal`。
- 只在下列条件全部成立、且没有投影诊断时才发轮完成。failed、cancelled、未知终态、缺起点或日志数未测都不补成功。
  - 终态结局为 `completed`。
  - 终态的会话与 Run 与输入一致。
  - 终态来源完整：成员事件要有 revision、entry、operation，读到的终态要有 evidence 与非空的 source。
  - 起点与终点同钟，终点不早于起点。
  - `logCount` 已实测。
- 外部等待只认固定延迟替身的成功事件，用实际的起止，并核对与原起止和耗时一致。同一轮内模型与工具的 `invocationId` 合起来不重复。等待必须在轮的同进程、同钟、同代次区间内。
- 返回 `events`、`origins`、`sources`、`diagnostics`、`roundEnd`。诊断非空时不输出轮完成。空的诊断不等于通过。调用者必须处理诊断，不能把部分事件当完整的一轮交给 `nextRound`。
- `projectSegmentInterval` 只转换已经录制的完整区间，永不生成轮完成或日志数。

### 按轮采集器

`createRoundCollector({ runId, out?, clock?, drainMs? })` 只收集与投影，不装配产品，不驱动输入，不读 Session 状态。

| 成员 | 用途 |
| --- | --- |
| `measure` | 交给 Session、Context、Agent 的 `measure` 构造参数。同步记录，带采集者单调钟的读数，从不抛出，不调用产品 |
| `modelMeasurement`、`toolMeasurement` | 交给固定延迟的模型与工具替身，让等待与轮区间同钟 |
| `beginRound(round)` | 读轮起点。轮次从 1 连续，上一轮没结束时拒绝 |
| `observeTerminal({ session, run, source })` | 读到 Session 运行状态后立即调用，记录读取时刻 |
| `finishRound({ session, sessionRun, logCount, requiresToolWait?, fsync? })` | 停止接收本轮新段，等已开始的段收尾（至多 `drainMs`，缺省 5000），再投影。超时没收尾的段记 `segment-end-missing` |
| `roundEvents(result)` | 诊断为空时返回完整的 schema 1 数组，否则抛 `ProjectionError` |
| `close()` | 写出轮外事件 |

- 起点到达时有打开的轮，这一段就属于该轮。轮外到达与封轮后才到的事件不并入任何轮。`fsync` 只附在没有诊断的轮上。
- 给出 `out` 时追加 `projection.jsonl`（每轮一行完整投影结果）与 `projection-strays.jsonl`（轮外事件）。采集者不写 `events.jsonl`。
- 适配器每一轮的次序：`beginRound(round)`，交入本轮输入，轮询 Session 运行状态直到出现新的终态并立即 `observeTerminal`，读累计日志条目数，`finishRound`，返回 `roundEvents(result)`。

### 测量与判定

- 轮区间与所有参与扣除的外部等待必须同进程、同 `clockId`、同 `generation`，等待区间落在轮区间内。缺等待记录或时钟不匹配时 `ownOverhead` 未测量。工具先求等待区间的并集，再从轮时间扣除，得到非负的墙钟余额。它不是 CPU 工作量。
- 每段独立求区间并集，结果为 inclusive duration。每段的固定样本跨轮须有相同的进程、时钟与代次。
- 逐轮的 `endToEnd`、`ownOverhead`、四个 `stages` 与 `fsync` 是 `{ state: 'measured', value, unit, source }` 或 `{ state: 'unmeasured', reason }`。时间单位 `ms`，fsync 单位 `count`。
- 中位数门：第 181 到 200 轮的 `ownOverhead` 中位数除以第 11 到 30 轮的，不超过阈值时通过。缺窗、缺测、时钟代次改变、前窗中位数为零或数值超出有限范围时等件。
- 逐段增长门：每段把第 11 到 200 轮分成 19 个连续的十轮块，块的轮号中点为 x，耗时中位数为 y。OLS 同时满足斜率 b > 0、R² ≥ 0.95、b × 180 > 3 × 残差 MAD 时该段失败。MAD 是残差相对残差中位数的绝对偏差中位数。常量方差为 0 时不增长。缺样本、缺测或时钟资格失败时等件。非法、非有限或负时间拒绝。
- 总判定汇总中位数门与四段门，任何已证实的失败优先。
- `evaluateSeries(values, threshold)` 对任意一条 200 个每轮值的序列判同样的两道门。前窗中位数不为正、不足 200 个或含非有限值时记等件。
- `selftest` 用完整合法的四段与合成 fsync 断言：平稳通过、整体增长失败、单段增长失败、缺测与缺窗等件。

### 归档与比较

- 归档有 `summary.json`、`rounds.jsonl`、`curves.svg` 与 `curves.html`。适配运行另有原始事件、进度、适配器诊断与进程记录。曲线不需要网络，缺测不画点，原因留在 JSONL。
- 方法元数据固定 `definitionId: e9-wall-residue-ols-r2-d17-v1` 与 `eventSchemaVersion: 1`。
- `compare` 重算摘要，核对原始记录，拒绝缺测或执行失败的档案。完整的适配档案还回放原始事件、核对派生轮次。比较要求方法、阈值与来源、时钟资格、工作负载、平台、OS、Node、核数与名额状态可比，提交号可以不同。

### 没有适配器的产品探针

没有 `--adapter` 时走产品探针：缺应用构建时等件。有构建时经真实 serve、SQLite 与公开 CLI 完成注册、登录与建会话，不发模型或工具输入。它复用 `tools/joint-a/support.mjs` 的运维层。状态与登录文件放在归档目录里，只应留在本机的任务证据区。

- CLI 返回可信的 `basis-unavailable` 且退出 4 时记等件，保留原退出码。
- 零退出还须有 [CLI 结果对象](../../apps/cli/SPEC.md#命令结果与退出码)与对应操作的成功字段：注册核对账号、组织与租户，登录核对登录标识、签发时间与租户，建会话核对会话标识、认回标志与请求回显。其他非成功、缺字段与无法解析的回复记失败。注册或登录没通过时不继续。

## 原则与约束

- 本工具不写产品埋点，不改装配，不进准入。完整的 200 轮测量由需要它的联调与改动 Session 热路径的变更另行运行。
- Windows 没有 fsync 来源，完整测量在 Windows 上的总判定只能是等件。
- 投影与采集器不替产品证明一个 execution 属于哪个 Run，也不能证明没有漏收事件。

## 不变式

- 缺测、缺窗或缺 fsync 的运行，总判定不是通过。
- 合成的结果都带 `synthetic` 标记。
- 已有的归档目录不被覆盖。
- 非法事件不被静默丢弃。
- 清理时不向启动身份已改变的进程发信号。

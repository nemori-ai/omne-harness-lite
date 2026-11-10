# RetentionScope：保留作用域的单一归属与跨域断言

本目录的模型检查一个保留作用域在宿主适配器里的生命周期：预留留在创建它的获取自己的记录里，作用域记录只保存已接手的条目，作用域只有开放与已关闭两个状态，接手是唯一的跨域提交，以及创建者对自己预留的停止记账。规则归 `tool-host-local` [SPEC](../../../SPEC.md) 的「环境准备的租户调度」：预留与接手两段、关闭一段、收场事实一段与记录生灭表。停止答复与单一归属归执行环境契约的[停止](../../../../../execution/execution-environment-contract/SPEC.md#停止)第 3、5、7 项和[移交](../../../../../execution/execution-environment-contract/SPEC.md#移交)：已移交的键归保留范围，任一视图都能为它记 `stopped`；还没有移交的预留只有创建它的获取的视图能为它记账。模型只证明列出的有限状态，不证明实现。

账本域没有共同的修订顺序。作用域域保存一条作用域记录（键 `scope`）和按进程键的结束事实 `ended/<进程键>`。每个调用的获取域保存该调用的获取记录，其中有本获取的预留及其停止事实。每个参与者的操作分两步：读取一次并记住读到的域，再提交；提交只在断言的域未被别的提交改写时生效。模型里视图对每个断言的域保存一个新鲜标志，而不是修订号：任何对该域的提交清掉所有读过它的视图的标志，这正是修订断言失败的时刻。提交可以丢失（存储答 `unavailable`），是否重试由参与者自己的规则决定。重启丢弃全部内存视图，保留全部耐久域。模型里耐久记录从不删除。实现里获取记录随所属调用删除，但只在它的停止事实都已确认、且作用域不再持有它创建的条目之后（SPEC 的记录生灭一段），此后没有动作再读写这条记录，所以模型的结论不受影响。

## 1. 变量

| 变量 | 含义 |
| --- | --- |
| `scopeState` | `none`（没有记录）、`open`、`closed` |
| `entries[r]` | 资源 r 在作用域记录里的条目：`none`、`permitted`、`adopted`。`reserved` 只在负控 `reservation-in-scope` 下出现 |
| `ended` | 作用域域里有结束事实的进程集合 |
| `acqClosed[c]` | 调用 c 的获取是否已关闭 |
| `resv[r]` | 资源 r 在其创建者获取记录里的预留与停止事实：`none`、`planned`、`stopped` |
| `creator[r]` | 预留 r 的调用；预留前为 `Nil`。它随预留写入创建者的记录，作用域条目里的创建者引用也指向它 |
| `drained` | 以创建者获取自己名义停止的资源。它表示物理归属，不是账本记录 |
| `planView`、`takeView`、`stopView`、`creatorStopView`、`closeView`、`acqView` | 各参与者读取后的视图，`Nil` 表示没有读。字段 `scope`、`acq` 是所读作用域域和获取域的新鲜标志；`takeView` 另存读到的创建者是否已关闭，`acqView` 另存读到的已接手资源集合。重启时全部清空 |
| `lost`、`restarts` | 已丢失的提交数、已发生的重启数 |
| `everClosed`、`stoppedProcesses`、`takeCommits`、`takenFromClosed`、`creatorStopRecorded`、`creatorStopRefused` | 历史变量：作用域曾关闭；已确认停止的保留进程；每个资源的接手写入次数；在创建者获取已关闭时被接手的资源；创建者记下了自己预留停止的资源；创建者记停止被拒绝的资源。没有参与者读它们 |

## 2. 动作

| 动作 | 含义 |
| --- | --- |
| `PlanRead(c, r)`、`PlanCommit(r)` | 调用 c 的获取预留资源 r。按键读作用域记录，作用域已关闭时答 `closed`，不写。否则把预留写进 c 自己的获取记录，断言作用域域与自己的域未变。不写作用域 |
| `TakeRead(r)`、`TakeCommit(r, kind)` | 作用域接手 r：保留终端经 `permit`，保留进程经 `adopt`。唯一的跨域提交：写作用域记录，断言创建者获取域未变，核对创建者记录里有该键的预留、创建者仍开放、作用域仍开放。作用域已关闭或创建者获取已关闭时答 `closed`，提供者按契约移交第 3 项自己停止该进程（进入 `drained`） |
| `StopRead(r)`、`StopCommit(r)` | 作用域持有的条目停止被确认，作用域的任一视图都能记。提交删去条目；被接管的进程在同一次作用域提交里写入结束事实。创建者记录里该键的停止事实同时写成 `stopped` |
| `CreatorStopRead(r)`、`CreatorStopCommit(r)` | 创建者记下自己没人接手的预留已停止。它写自己的获取记录，断言作用域域与自己的域未变；作用域是否已关闭不影响它。接手在读与写之间落下时得到冲突并重读，重读后该键已被接手，创建者不再记它 |
| `CloseRead`、`CloseCommit` | 维护者把作用域标为已关闭。没有记录时提交创建已关闭的记录。已关闭的记录就是耐久的关闭信号 |
| `AcqCloseRead(c)`、`AcqCloseCommit(c)` | 调用 c 的获取关闭。读作用域记录得到自己哪些资源已被接手（`handedOver`），其余预留写成 `stopped` 并以自己名义停止。写自己的域，断言作用域域未变 |
| `Restart` | 清空全部视图。耐久域不变 |

停止查询不是动作。状态函数 `StopReply(r)` 只从耐久事实回答：作用域仍持有 r 时为停止中，有结束事实时答 `confirmed`，否则答 `notFound`。它对应契约停止第 3、5、7 项。

## 3. 假设与有限边界

- `Calls = {c1, c2}`，`Resources = {r1, r2}`，`MaxRestarts = 1`。安全配置 `MaxLost = 2`；进展配置 `MaxLost = 1`。每个资源至多预留一次。
- 安全配置对 `Calls` 与 `Resources` 使用对称归约（`SYMMETRY Symmetric`）。进展配置不用：TLC 的对称归约对时序性质不可靠。
- 丢失的提交视为没有写入。写入成功但答复丢失的情形由重试前的重读覆盖，没有单独建模。对已持有条目的重复 `adopt` 不写，也没有建模。
- 停止确认对创建者记录的写入与作用域提交在模型里是一个动作。实现里前者先落。两者之间崩溃只让创建者记录先于作用域说 `stopped`；没有参与者读被接手键在创建者记录里的停止事实（读取时由作用域推导 `handedOver`），所以折叠不少掉可观察的交错。
- 公平性只在 `Fair` 下成立：每个被作用域持有的资源的 `StopRead` 与 `StopCommit` 弱公平。这表示「每个被许可或接管的进程最终停止」。丢失有界，所以停止的重试最终落下。其他参与者不公平。`CHECK_DEADLOCK FALSE`。
- 不在模型里：原调用域的结算与接手对它的断言；租户隔离；许可的身份校验；`inspect` 与 `list`；`unconfirmed` 停止事实。它们由宿主测试守住。

## 4. 性质

| 名称 | 含义 | 出处 |
| --- | --- | --- |
| `NeverReopen` | 曾关闭的作用域始终处于已关闭 | SPEC：「作用域只有开放与已关闭两个状态，已关闭不回到开放」，「已关闭的记录就是耐久的关闭信号」 |
| `StopAnswer` | 已确认停止的保留进程的停止查询答 `confirmed`；从未被作用域接手的键答 `notFound` | 契约停止第 3、7 项；SPEC「收场事实」一段 |
| `CreatorStopAlwaysRecorded` | 创建者对自己未被接手的预留记停止从不被拒绝，无论作用域是否已关闭；记下之后创建者不再持有它 | SPEC：「创建者对自己预留的 `stopped` 写在自己的域里，不受作用域是否关闭影响」；契约移交「还没有移交的预留，只有创建它的获取的视图能为它记账」 |
| `NoDoubleOwner` | 一个资源不能既被作用域持有又被创建者以自己名义停止；每个资源至多一次接手写入 | SPEC「接手……断言创建者获取记录所在域……核对……创建者仍开放」；契约移交「同一个执行域会有两个归属方，或者一个都没有」与「重复 `adopt` 是幂等的，不再写」 |
| `ClosedAcquisitionNotTakenOver` | 已关闭的获取的预留不被接手 | SPEC 接手核对「创建者仍开放」 |
| `ScopeHoldsOnlyTakenOver` | 作用域记录只保存已接手的条目，每条对应创建者记录里一条未停止的预留 | SPEC：「作用域记录只保存作用域已接手的资源」；记录生灭表「作用域条目」行 |
| `EventuallyRemoved` | 被接手的条目在其进程停止后最终离开作用域记录（时序性质，`Fair` 下检查） | SPEC：「接手的条目活到停止被确认」；记录生灭表「停止被确认时移除」 |

正控 `positive` 检查前六条不变量，`progress` 在 `Fair` 下检查 `EventuallyRemoved`。两者在上述边界内都通过。SPEC 的单一归属正文在此边界内没有反例。

## 5. 负控

| 配置 | 去掉的规则 | 必须命中 |
| --- | --- | --- |
| `reservation-in-scope` | 前一版设计：预留写进作用域记录，作用域关闭时移除没人接手的预留，创建者记预留停止要经作用域 | `CreatorStopAlwaysRecorded` |
| `take-without-creator-assert` | 接手提交不断言创建者获取域，按读到的视图判定 | `NoDoubleOwner` |
| `reopen-after-close` | 接手提交不核对作用域已关闭，按视图把记录写成开放 | `NeverReopen` |
| `forget-end-fact` | 停止确认只删条目，不写结束事实 | `StopAnswer` |

`reservation-in-scope` 的配置不列 `ScopeHoldsOnlyTakenOver`：该负控把预留放进作用域，这条性质在第一次 `plan` 就命中，会盖住目标性质。

反例：

- `reservation-in-scope`：`PlanCommit` 把 r1 的预留写进作用域；`CloseCommit` 关闭作用域并移除这条预留；`CreatorStopCommit(r1)` 读到作用域已关闭、条目已不在，停止事实无处可写，`creatorStopRefused = {r1}`。
- `take-without-creator-assert`：`TakeRead(r1)` 读到 r1 有预留且创建者开放；`CreatorStopCommit(r1)` 在创建者自己的域里把 r1 记为 `stopped` 并以自己名义停止；`TakeCommit` 不断言创建者域，凭早先的视图写入 `permitted`。r1 同时被作用域持有（`entries[r1] = "permitted"`）和被创建者停止（`drained = {r1}`）。创建者获取仍开放，所以真正的后果是双重归属，不是 `ClosedAcquisitionNotTakenOver`。
- `reopen-after-close`：`CloseCommit` 关闭作用域；`TakeRead(r1)` 后 `TakeCommit` 不核对已关闭，写入 r1 的条目并把记录写成开放，`everClosed = TRUE` 而 `scopeState = "open"`。
- `forget-end-fact`：r1 被接管后 `StopCommit` 删去条目而不写结束事实；对 r1 的停止查询答 `notFound`。

## 6. 代码对应

实现在 `tool-host-local` 的 [environment-state.ts](../../../src/environment-state.ts) 与 [environment-resource-ledger.ts](../../../src/environment-resource-ledger.ts)，释放路径的获取关闭在 [execution-environment.ts](../../../src/execution-environment.ts)。下表按修改落地后的源码逐行核对。每个动作只有一条代码路径。

| 模型 | 代码 | 状态 |
| --- | --- | --- |
| `scopeState`、`entries` | `environment-state.ts` 的 `RetentionState`：`phase` 为 `open` 或 `closed`，`resources` 是已接手条目 `RetainedResourceFact`（资源、`taken` 为 `permitted` 或 `adopted`、停止事实、创建者引用）。没有记录对应 `none`。`decodeRetention` 只接受这两个 phase | 已核对 |
| `resv`、`creator` | 获取记录的 `reservations`（`Reservation`：资源与停止事实），在创建者的 `environment@<call>` 记录里。`withHandovers` 按作用域条目里创建者为本获取（`createdBy`）的键推导 `handedOver`；`withoutHandovers` 写回时保留获取自己存的停止事实 | 已核对 |
| `PlanCommit` | `createRetainedTerminalLedger` 的 `plan` 经 `update`：变更函数拿到同一次快照读到的作用域记录，由 `reserve` 决定，`phase` 为 `closed` 时答 `closed`，不写；否则把预留写进自己的获取记录。提交断言作用域域的修订号。不写作用域 | 已核对 |
| `TakeCommit` 的创建者域断言与三项核对 | `permit`、`adopt` 经视图的 `takeOver` 到状态存储的 `takeOver`：读作用域记录与创建者快照，决策 `takeDecision` 核对预留存在且为 `active`、创建者未关闭、作用域未关闭；`callAssertion` 断言原调用域；`commitScope` 断言 `acquisitionDomain` 的修订号，作用域写成 `open`。作用域已关闭、创建者已关闭或原调用已结算时答 `closed`。已接管的键再 `adopt` 答 `confirmed`，不写 | 已核对 |
| `StopCommit` 与结束事实 | `stopped(key, status)` 在作用域持有该键时进入 `stopHeld`：`confirmed` 先经 `update` 把创建者记录里该键的停止事实写成 `confirmed`（`stoppedKey`），再由 `stopRetained` 做一次 `commitScope`，删去条目，`adopted` 条目同时写 `ended/<key>`；`unconfirmed` 只改条目的停止事实 | 已核对 |
| `CreatorStopCommit` | `stopped` 在作用域不持有该键时进入 `stopOwn`：经 `update` 改自己记录里该预留的停止事实（`settledStop`），提交断言作用域域的修订号，不读作用域是否关闭。快照显示该键已 `handedOver`（读与写之间被接手）时不记，转入上一行的路径 | 已核对 |
| `StopReply` | `ended(key)` 经 `readEnded` 用 `readRecord` 读 `ended/<key>` 一条记录；提供者在 `execution-environment-host-local` 的 `host-retained-processes.ts` 按契约停止第 7 项换算为 `stop` 答复 | 已核对 |
| `CloseCommit` | 视图的 `close` 经 `closeRetention`：把作用域记录写成 `closed`，保留条目；没有记录时创建没有条目的已关闭记录；已关闭时不写 | 已核对 |
| `AcqCloseCommit` 的作用域断言 | `closedAcquisition`：`createEnvironmentResourceLedger` 的 `close` 与 `execution-environment.ts` 的 `settleRelease` 都经 `update` 写它，提交断言作用域域的修订号。未被接手的预留写成 `confirmed`，`handedOver` 的键保留获取自己存的停止事实 | 已核对 |
| `drained` | 获取关闭后的排空与 `adopt` 答 `closed` 后的停止，归执行环境提供者，不在这三个文件里 | 已核对 |
| 四个负控常量 | 没有代码对应 | — |

## 7. 运行与判读

使用 OpenJDK 21 与 TLC 1.7.4。通过 `--jar` 或 `TLA2TOOLS_JAR` 指定 JAR，摘要固定为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`，不匹配时拒绝运行。

```sh
export TLA2TOOLS_JAR=/path/to/tla2tools-1.7.4.jar
python3 packages/tool/tool-host-local/verification/models/retention-scope/check.py --out <输出目录>
```

可用 `--case positive` 选一个配置。脚本用一个 worker，每配置上限 600 秒，日志与汇总写到 `--out`，不写进本目录。本目录不保存执行结果。正控要求退出 0 且 TLC 明确完成检查。不变量负控要求退出 12 且唯一违反的不变量等于指定名称。时序负控要求退出 13、TLC 报告时序性质被违反，且该配置只列出指定的那一条 `PROPERTY`。超时、解析错误和其他非零退出均失败。

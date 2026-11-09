# RetentionScope：保留作用域的三态生命周期与跨域断言

本目录的模型检查一个保留作用域在宿主适配器里的生命周期：开放、已关闭、已释放三个状态，作用域记录、条目与结束事实的生灭，以及作用域域与获取域之间的两条断言。规则归 `tool-host-local` [SPEC](../../../SPEC.md) 的「环境准备的租户调度」：三态表、记录生灭表与两侧断言。停止答复归执行环境契约的[停止](../../../../../execution/execution-environment-contract/SPEC.md#停止)第 1 至 8 项。模型只证明列出的有限状态，不证明实现。

两个域没有共同的修订顺序。作用域域保存一条作用域记录（键 `scope`）和按进程键的结束事实 `ended/<进程键>`。每个调用的获取域保存该调用的获取记录。每个参与者的操作分两步：读取一次并记住读到的修订号，再提交；提交只在断言的修订号未变时生效。提交可以丢失（存储答 `unavailable`），是否重试由参与者自己的规则决定。重启丢弃全部内存视图，保留全部耐久域。

## 1. 变量

| 变量 | 含义 |
| --- | --- |
| `scopeRev` | 作用域域的修订号 |
| `scopeState` | `none`（没有记录）、`open`、`closed`、`released`（只剩关闭标记） |
| `entries[r]` | 资源 r 在作用域记录里的条目：`none`、`reserved`、`permitted`、`adopted` |
| `creator[r]` | 预留 r 的调用；首次预留前为 `Nil` |
| `ended` | 作用域域里有结束事实的进程集合 |
| `acqRev[c]`、`acqClosed[c]` | 调用 c 的获取域修订号；该获取是否已关闭 |
| `drained` | 创建者获取在关闭时以自己名义停止的资源。它表示物理归属，不是账本记录 |
| `planView`、`takeView`、`stopView`、`closeView`、`acqView` | 各参与者读取后记住的修订号，`Nil` 表示没有读。重启时全部清空 |
| `dropTried[c]` | 获取 c 关闭后那一次提前移除预留是否已经尝试 |
| `lost`、`restarts` | 已丢失的提交数、已发生的重启数 |
| `everClosed`、`reopened`、`stoppedProcesses`、`adoptCommits` | 历史变量：作用域曾关闭；关闭后又写入过 plan、permit 或 adopt；作用域当前寿命内已确认停止的保留进程；每个资源的 adopt 写入次数。没有参与者读它们 |

## 2. 动作

| 动作 | 含义 |
| --- | --- |
| `PlanRead(c, r)`、`PlanCommit(r)` | 调用 c 的获取预留资源 r。没有记录时提交创建开放的作用域记录。作用域已关闭或已释放时答 `closed`，不写 |
| `TakeRead(r)`、`TakeCommit(r, kind)` | 作用域接手 r：保留终端经 `permit`，保留进程经 `adopt`。只写作用域域，断言创建者的获取域修订号未变。作用域已关闭、已释放或创建者获取已关闭时答 `closed`，提供者按契约移交第 3 项自己停止该进程（进入 `drained`） |
| `StopRead(r)`、`StopCommit(r)` | 作用域持有的资源停止被确认。提交删去条目；被接管的进程在同一次提交里写入结束事实 |
| `CloseRead`、`CloseCommit` | 维护者关闭作用域。同一次提交移除所有从未被许可或接管的预留；不再持有条目时在同一次提交里进入已释放 |
| `AcqCloseRead(c)`、`AcqCloseCommit(c)` | 调用 c 的获取关闭。读取作用域里哪些自己创建的资源已被接手（`handedOver`），其余资源以自己名义停止。写自己的域，断言作用域域修订号未变 |
| `EarlyDrop(c)` | 已关闭的获取 c 提前移除自己创建、没人接手的预留。它是关闭之后的第二次提交，以作用域修订号为条件，丢失时不重试 |
| `Restart` | 清空全部视图，已关闭获取的提前移除不再发生。耐久域不变 |

释放不是单独的动作。`Commit` 对每次写入作用域记录的提交应用同一条结算规则：已关闭的作用域只保留被接手的条目，已关闭且不再持有条目的作用域在同一次提交里缩为关闭标记并删除全部结束事实。这对应 SPEC 三态表的「进入已释放与删除全部 `ended/*` 在同一次提交中完成」。

停止查询不是动作。状态函数 `StopReply(r)` 只从耐久事实回答：作用域仍持有 r 时为停止中，有结束事实时答 `confirmed`，否则答 `notFound`。它对应契约停止第 3、5、7 项。

## 3. 假设与有限边界

- `Calls = {c1, c2}`，`Resources = {r1, r2}`，`MaxLost = 2`，`MaxRestarts = 1`。每个资源至多预留一次。
- 丢失的提交视为没有写入。写入成功但答复丢失的情形由重试前的重读覆盖，没有单独建模。
- `EarlyDrop` 是一个原子动作。实现里它以读到的作用域修订号为提交条件，所以原子化不少掉与其他提交的交错。
- 公平性只在 `Fair` 下成立：每个被作用域持有的资源的 `StopRead` 与 `StopCommit` 弱公平。这表示「每个被许可或接管的进程最终停止」。丢失有界，所以停止的重试最终落下。其他参与者不公平。`CHECK_DEADLOCK FALSE`。
- 不在模型里：原调用域的结算与对它的断言；停止确认时写入创建者获取记录的停止事实；租户隔离；许可的身份校验；`inspect` 与 `list`；释放整域读的大小上限。它们由宿主测试守住。

## 4. 性质

| 名称 | 含义 | 出处 |
| --- | --- | --- |
| `NeverReopen` | 曾关闭的作用域不再处于开放，关闭后没有 plan、permit 或 adopt 写入 | SPEC：「作用域不会从已关闭或已释放回到开放」，三态表的 `plan`、`permit`、`adopt` 列 |
| `ReleasedShape` | 已释放时不持有条目，没有结束事实，记录仍在（关闭标记） | SPEC 三态表「已释放」行，「关闭标记永不删除」 |
| `ClosedShape` | 已关闭时只持有已被许可或接管的条目，至少一条 | SPEC 三态表「已关闭」行 |
| `StopAnswer` | 作用域存在期间，已确认停止的保留进程的停止查询答 `confirmed`；从未进入作用域的资源答 `notFound` | 契约停止第 3、7 项 |
| `ClosedAcquisitionNotAdopted` | 一个资源不能既被作用域接管，又被创建者获取在关闭时以自己名义停止 | SPEC「获取的变更与作用域的交接在两个域之间线性化」，契约移交「同一个执行域会有两个归属方」 |
| `NoDoubleAdopt` | 每个资源至多一次 adopt 写入 | 契约移交第 4 项 |
| `EventuallyReleased` | 已关闭的作用域最终进入已释放（时序性质，`Fair` 下检查） | SPEC「已关闭且不再持有条目」进入已释放 |

正控 `positive` 检查前六条不变量，`progress` 在 `Fair` 下检查 `EventuallyReleased`。两者在上述边界内都通过。SPEC 的三态正文在此边界内没有反例。

## 5. 负控

| 配置 | 去掉的规则 | 必须命中 |
| --- | --- | --- |
| `delete-marker-on-release` | 释放时删除作用域记录，不保留关闭标记 | `NeverReopen` |
| `drop-only-on-acquisition-close` | 作用域关闭不移除没人接手的预留，只靠创建者关闭后的提前移除 | `EventuallyReleased` |
| `acquisition-write-without-scope-assert` | 获取的关闭写入不断言作用域域修订号 | `ClosedAcquisitionNotAdopted` |
| `forget-end-fact` | 停止确认只删条目，不写结束事实 | `StopAnswer` |

反例：

- `delete-marker-on-release`：`CloseCommit` 关闭一个不持有条目的作用域，同一次提交进入已释放并删除记录；`PlanCommit` 读到没有记录，重新创建开放的作用域。
- `drop-only-on-acquisition-close`：两个获取各预留一个资源；`CloseCommit` 把作用域标为已关闭但保留两条预留；没有参与者停止预留，获取不再关闭或提前移除已丢失，作用域永远停在已关闭。
- `acquisition-write-without-scope-assert`：`TakeRead(r1)` 与 `AcqCloseRead(c1)` 都读到 r1 只是预留；`TakeCommit` 先提交，r1 被接管；`AcqCloseCommit(c1)` 凭早先读到的视图提交，把 r1 当作自己仍拥有的资源停止。r1 同时被作用域接管和被创建者停止。
- `forget-end-fact`：r1 被接管后 `StopCommit` 删去条目而不写结束事实；作用域仍存在，对 r1 的停止查询答 `notFound`。

## 6. 代码对应

实现在 `tool-host-local` 的 [environment-state.ts](../../../src/environment-state.ts) 与 [environment-resource-ledger.ts](../../../src/environment-resource-ledger.ts)。下表的每一行状态为待核对：实现正在按三态正文修改，核对以修改落地后的源码为准。

| 模型 | 代码 | 状态 |
| --- | --- | --- |
| `scopeState`、`entries` | `environment-state.ts` 的 `RetentionState`（`open`、`closed`、`released` 三个 phase）与 `RetainedResourceFact`；`scopeOwned`、`retentionEntries` | 待核对 |
| `Commit` 的结算规则 | `settledRetention`、`closedRetention`、`retentionAdvances`；`commitScope` 在进入已释放时整域读出并删除 `ended/*` | 待核对 |
| `PlanCommit`、`TakeCommit` 答 `closed` | `createRetainedTerminalLedger` 的 `plan`、`permit`、`adopt`：作用域 phase 不是 `open` 时答 `closed`；`commitRetention` 在原获取已关闭时答 `not-settled` | 待核对 |
| `TakeCommit` 的获取域断言 | `commitRetention` 以 `acquisitionDomain(address)` 的修订号为断言提交；`handOver` 另加 `callAssertion` 的原调用域断言 | 待核对 |
| `StopCommit` 与结束事实 | `createRetainedTerminalLedger` 的 `stopped(key, 'confirmed')`；`commitScope` 经 `endedBetween` 写 `endedRecordKey(key)` | 待核对 |
| `StopReply` | `readEnded` 与 `createRetainedTerminalLedger` 的 `ended(key)`；提供者按契约停止第 7 项换算为 `stop` 答复 | 待核对 |
| `CloseCommit` | `createRetainedTerminalLedger` 的 `close`，经 `closedRetention` 结算 | 待核对 |
| `AcqCloseCommit` 的作用域断言 | `createEnvironmentResourceLedger` 的 `close` 经 `update` 提交；`AcquisitionSnapshot.retention.revision` 作为写入的断言 | 待核对 |
| `EarlyDrop` | `dropReservations`：只在作用域开放时移除本创建者的未接手预留，非冲突失败不重试 | 待核对 |
| `drained` | 获取关闭后的排空，归执行环境提供者，不在这两个文件里 | 待核对 |
| 四个负控常量 | 没有代码对应 | — |

## 7. 运行与判读

使用 OpenJDK 21 与 TLC 1.7.4。通过 `--jar` 或 `TLA2TOOLS_JAR` 指定 JAR，摘要固定为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`，不匹配时拒绝运行。

```sh
export TLA2TOOLS_JAR=/path/to/tla2tools-1.7.4.jar
python3 packages/tool/tool-host-local/verification/models/retention-scope/check.py --out <输出目录>
```

可用 `--case positive` 选一个配置。脚本用一个 worker，每配置上限 600 秒，日志与汇总写到 `--out`，不写进本目录。本目录不保存执行结果。正控要求退出 0 且 TLC 明确完成检查。不变量负控要求退出 12 且唯一违反的不变量等于指定名称。时序负控要求退出 13、TLC 报告时序性质被违反，且该配置只列出指定的那一条 `PROPERTY`。超时、解析错误和其他非零退出均失败。

# verification/models

本目录承载两个 TLA+ 模型、它们的配置与运行脚本 [run.py](run.py)。[ConnectionTable.tla](ConnectionTable.tla) 是连接表的生命周期，描述 `src/internal/table.ts`、`build.ts`、`teardown.ts`、`late.ts`、`port.ts` 与 `entry.ts`。[Calls.tla](Calls.tla) 是调用口，描述 `src/calls.ts`、`src/tasks.ts`、`src/internal/in-flight.ts` 与 `src/internal/task-table.ts`，连接表在它里面只剩调用口读到的抽象。性质的定理陈述归 [SPEC.md「性质与证据」](../../SPEC.md#properties)。模型与实现、探索器之间的映射见 [../README.md](../README.md#动作映射)。

## 边界

TLC 对有限状态做穷举。本页的结论只在下表的上限与模型的抽象之内成立。模型通过不表示任意规模下正确，也不表示实现符合模型。本页不写「已证明」。

常量：

- `Keys`：连接键，每个键一个租户与一个持有。
- `Ensures`、`Releases`：每个键的 `ensure`、`release` 次数。`CloseAlls`：0 或 1。`Loses`：`lose` 的总次数。
- `Deviations`：端口调用除按契约答复以外还可以做什么：`fail`、`reject`、`unconfirmed`、`throw`。`Budget`：一条行为里偏离的总次数。挂起与迟到不占预算。端口被调用时同步抛出，模型按 `ask` 写成立即答复的 reject。
- `Bugs`：负控故意放进的缺陷。`{}` 是本包的代码。
- `Observe`：`TRUE` 时 `ev` 字段记下每个外部动作与同步抛出，供轨迹阅读。安全配置用 `VIEW View` 把它排除在指纹之外。活性配置取 `FALSE`，令 `ev` 保持常量。没有动作读 `ev`，所以这样合并状态不改变检查结果。

`Calls.tla` 的常量：

- `Keys`：`{"A", "B", "C", "D"}` 的子集，租户、主体与账户由模块里的 `Tenant`、`Principal`、`Account` 给出：A 是（租户 home、主体 alice、账户 main），B 是（away、mallory、main），C 是（home、bob、other），D 是（away、alice、main）。所以 A 与 B 差在租户和主体，A 与 C 差在主体和对端账户，A 与 D 只差租户（主体文本相同，都是 alice）。四个键与探索器的 A–D 对应；探索器另有键 E（alice 在同一租户的另一个对端账户），只用于 `task-collision` 场景，模型的四个键里没有两个同租户同主体的键，所以模型不覆盖任务键碰撞。
- `Callers`、`Invokes`、`Continues`：发 `invoke` 与 `continueWithInput` 的键，以及每个键的次数。每次调用都用关联键 `c`。`Cancellers`、`Cancels`：发 `cancel` 的键与次数。`Taskers`、`Tasks`：对任务 `t1` 发任务操作的键与次数。`Aborts`：调用方中止的总次数。`Drops`：丢失一条可用连接的总次数。`CloseAlls`：0 或 1。
- `Peer`：对端对已发出的调用答什么：`"complete"` 或 `"task"`（登记任务 `t1`）。
- `Deviations`：`fail`（关口拒绝、传输 `not-sent`、对端 `no-answer`、任务请求 `not-sent`）、`reject`、`throw`。`ensure` 的 `fail` 不占预算：它是建连失败或时限到期，不是端口偏离。挂起不占预算。
- `Bugs`：负控的缺陷，见配置表。

`Calls.tla` 的端口：`gate`（采用读取、资格核对、配值与清单读取合为一次）、`ensure`（连接表：`ok` 使键的连接可用，建连给下一个代际，复用保持代际；关停之后只答 `fail`）、`call`、`answer`（对端对已发出请求的应答）、`cancelReq`（在作用域里发出，无人等）、`task`（四个任务方法之一，受任务时限）。`gate`、`ensure` 与 `answer` 的等待受调用的停止信号：信号先到则调用答复，端口调用留着无人等。`closeAll` 之后开始的调用在占位之后、问关口之前就拒绝（S8，MC-16 第 3 步）；`gate` 与任务操作的 `task`（`gateW`、`tgateW`）在关口答 `ok` 之后读 `shut`，`closeAll` 落在等关口途中的调用与任务操作于是不再问 `ensure`。代码读 `shut` 的位置是每次等待之前与第 8 步（发出之前），两者对「关停之后不问端口」的可观察结果相同；第 8 步的读取模型按构造不覆盖（见 [../README.md](../README.md#状态映射)「`Calls.tla` 的抽象与范围上限」）。`lose` 在模型里立即生效，实现里拆除交作用域。传输的 `call` 在停止信号触发之后最终答复是前提（WF5）：`P14_BoundedAfterStop` 不把等在 `callW` 的调用算作卡住。

## 配置

| 配置                   | 种类                 | 键   | `ensure` | `release` | `closeAll` | `lose` | 偏离与预算                                  | 检查                                                                    |
| ---------------------- | -------------------- | ---- | -------- | --------- | ---------- | ------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| `valid-faults`         | 正控                 | A    | 1        | 1         | 1          | 1      | `fail`、`reject`、`unconfirmed`，1          | P1–P7 与 P8 T2 的全部不变式                                             |
| `valid-rebuild`        | 正控                 | A    | 2        | 0         | 1          | 0      | 无（端口可挂起、迟到）                      | 同上                                                                    |
| `valid-throws`         | 正控                 | A    | 1        | 0         | 1          | 0      | `throw`，1                                  | 同上                                                                    |
| `valid-two-keys`       | 正控                 | A、B | 各 1     | 0         | 1          | 0      | 无；不触发时限（`CONSTRAINT NoBoundFired`） | P1–P5 与 P7，P5 为主；P1 的关停之后一句、P6、P8 T2 在这里会空成立，不列 |
| `live`                 | 正控（活性）         | A    | 1        | 1         | 1          | 0      | `fail`、`reject`、`unconfirmed`，1          | `LiveSpec` 下的 `P8_EveryCallerAnswers`                                 |
| `probe-a1`             | 反定理的探针         | A    | 1        | 1         | 0          | 0      | 无                                          | `P8_BoundedClose`，须违反                                               |
| `probe-live-hang`      | 反定理的探针（活性） | A    | 1        | 1         | 1          | 0      | 无                                          | `HangSpec` 下的 `P8_EveryCallerAnswers`，须有时序反例                   |
| `bad-no-absorb-close`  | 负控                 | A    | 1        | 1         | 0          | 0      | `reject`，1                                 | 拆除不吸收 `close()` 的 reject。`P2_NoneHoldsNothing` 须违反            |
| `bad-forget-open`      | 负控                 | A    | 2        | 0         | 1          | 0      | 无                                          | 遗忘不要求已关闭。`P2_ForgetHoldsNothing` 须违反                        |
| `bad-forget-open-late` | 负控                 | A    | 1        | 0         | 0          | 0      | 无                                          | 同一缺陷，迟到答复让 `lost` 的条目离开表。`P6_LateInvisible` 须违反     |
| `bad-no-shut`          | 负控                 | A    | 1        | 0         | 1          | 0      | 无                                          | `closeAll` 不置关停。`P4_NoConnectAfterShut` 须违反                     |
| `bad-ok-after-shut`    | 负控                 | A    | 1        | 0         | 1          | 0      | 无                                          | 协商之后不核关停。`P4_NoOkAfterShut` 须违反                             |
| `bad-abandon-landed`   | 负控                 | A    | 1        | 0         | 1          | 0      | 无                                          | `closeAll` 也释放已交来进程的落点的句柄。`P1_ReleasedAfterStop` 须违反  |
| `bad-unbounded-wrap`   | 负控                 | A    | 1        | 0         | 0          | 0      | 无                                          | 失败的建连等收场与标记时不受时限。`P8_BoundedEnsure` 须违反             |

`valid-two-keys` 不触发时限，迟到路径只在一个键的配置里检查：不加这个约束时，两个键的状态空间相乘，TLC 运行 17 分钟仍未完成。各配置的时限上界相同、先建先到期；`P8_BoundedEnsure` 是 P8 T2 的全局形式，逐个 `ensure` 的形式归探索器（[../README.md](../README.md#状态映射)「模型的抽象」）。负控与探索器的变异的对应见 [../README.md](../README.md#两种证据能变红)。

`Calls.tla` 的配置。列「操作」写每个键的操作与次数：

| 配置                          | 种类         | 键      | 操作                                                      | `closeAll` | `drop` | 偏离与预算                   | 检查                                                                     |
| ----------------------------- | ------------ | ------- | --------------------------------------------------------- | ---------- | ------ | ---------------------------- | ------------------------------------------------------------------------ |
| `calls-valid`                 | 正控         | A       | `invoke` 1、`cancel` 1、中止 1                            | 1          | 1      | `fail`、`reject`、`throw`，1 | P9–P13 与 `P14_BoundedAfterStop` 的全部不变式                            |
| `calls-valid-twice`           | 正控         | A       | `invoke` 2、`cancel` 1                                    | 0          | 1      | 无                           | 同上，P11 为主                                                           |
| `calls-valid-continue`        | 正控         | A       | `invoke` 1、`continueWithInput` 1                         | 0          | 1      | 无                           | 同上                                                                     |
| `calls-valid-task`            | 正控         | A、C    | 各 `invoke` 1；A 的任务操作 1；对端答任务                 | 1          | 1      | 无                           | 同上，P12 的账户一句为主                                                 |
| `calls-valid-isolation`       | 正控         | A、C、D | A `invoke` 1；C、D 各 `cancel` 1 与任务操作 1；对端答任务 | 0          | 0      | 无                           | 同上，P12 为主                                                           |
| `calls-live`                  | 正控（活性） | A       | `invoke` 1、`cancel` 1、中止 1                            | 1          | 0      | `fail`、`reject`，1          | `LiveSpec` 下的 `P14_EveryCallAnswers`                                   |
| `calls-bad-send-despite-stop` | 负控         | A       | `invoke` 1、`cancel` 1                                    | 0          | 0      | 无                           | 发出前的等待不看停止信号，已取消的调用仍发出。`P9_NotSentNotSent` 须违反 |
| `calls-bad-gate-unstopped`    | 负控         | A       | `invoke` 1、`cancel` 1                                    | 0          | 0      | 无                           | 同一缺陷：已取消的调用等在挂起的关口后面。`P14_BoundedAfterStop` 须违反  |
| `calls-bad-cancel-twice`      | 负控         | A       | `invoke` 1、`cancel` 1                                    | 0          | 0      | 无                           | `cancelRequest` 调用两次。`P10_CancelOnce` 须违反                        |
| `calls-bad-no-release`        | 负控         | A       | `invoke` 1                                                | 0          | 0      | `fail`，1                    | 拒绝路径不归还占位。`P11_ReservationEnded` 须违反                        |
| `calls-bad-task-any-account`  | 负控         | A、C    | 各 `invoke` 1；A 的任务操作 1；对端答任务                 | 0          | 1      | 无                           | 任务操作复用另一账户的连接。`P12_Isolation` 须违反                       |
| `calls-bad-key-blind`         | 负控         | A、C    | A `invoke` 1；C `cancel` 1                                | 0          | 0      | 无                           | 在途表的键只按租户。`P12_Isolation` 须违反                               |
| `calls-bad-task-blind`        | 负控         | A、C    | A `invoke` 1；C 的任务操作 1；对端答任务                  | 0          | 0      | 无                           | 任务表的键只按租户。`P12_Isolation` 须违反                               |
| `calls-bad-send-after-shut`   | 负控         | A       | `invoke` 1                                                | 1          | 0      | 无                           | 关停之后调用不先拒绝、`ensure` 仍交出连接。`P13_NoSendAfterShut` 须违反  |
| `calls-bad-wait-answer`       | 负控（活性） | A       | `invoke` 1、`cancel` 1                                    | 0          | 0      | 无                           | 等应答不看停止信号。`LiveSpec` 下的 `P14_EveryCallAnswers` 须有时序反例  |

`LiveSpec` 的公平性是 WF1、WF2 与 WF4（SPEC P14 T1）：每个时限到期，每次端口调用最终按契约答复，停止信号已触发的请求的对端应答除外。所以负控 `calls-bad-wait-answer` 里对端不答那个应答，等它的调用永不答复；正控里调用不等它。 「答复与停止信号或关停落在同一轮」的交错（第 8 步与答复时的核对，服务层的变异 C63、C65、C68）在模型里没有负控：外部动作只在静止时到达，它们不会落在同一轮。

## 运行与判读

从仓库根经运行名额执行：

```sh
node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py [配置名 ...]
```

不带配置名时运行全部配置。`TLA2TOOLS_JAR` 指向 tla2tools（缺省 `/opt/tlaplus/tla2tools.jar`），`JAVA_BIN` 指定 java，`FORMAL_OUTPUT_DIR` 指定证据目录（缺省仓库 `tmp/formal/mcp-connection-table/runs/`），`FORMAL_WORKERS` 指定 TLC 的工作线程数（缺省 4）。脚本把每个配置的原始输出与 `summary.json`（jar、模型与配置的 SHA-256，状态数、深度、耗时、判读与反例的外部动作）写进证据目录。每个配置跑完后，脚本删除 TLC 的状态目录。

判读规则：

- 正控须退出 0，并输出 `Model checking completed. No error has been found.`。
- 反定理的探针与负控须退出非零，TLC 报告的被违反不变式恰好是配置表所列的那一条，并给出反例轨迹。时序配置须报告 `Temporal properties were violated.`。
- 退出码只在每个配置都符合判读时为 0。超时、解析失败、求值错误与未执行都不算通过。非零退出本身不算负控通过。

## 运行记录

运行环境：TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)，即 tla2tools v1.7.4 发行包里的 TLC，tla2tools.jar SHA-256 `936a262061c91469…`，4 个工作线程。两个模型与它们的 29 个配置在同一次运行里检查，读数取自修复轮 `w3-mcp-call-fix2` 的运行（下一段）：`ConnectionTable.tla` 的 SHA-256 `b14f3711fe731cc4…`（第 1 轮评审裁定 F2、F3 之后：落点从开始起就在途，关停开始之后的失败按关停收场），`Calls.tla` 的 SHA-256 `096a2c50ced5b2e2…`。

| 配置                   | 结论                                      | 不同状态数 | 生成状态数 | 深度 | 耗时    | 判读     |
| ---------------------- | ----------------------------------------- | ---------- | ---------- | ---- | ------- | -------- |
| `valid-faults`         | 完成，没有错误                            | 57316      | 72036      | 59   | 4.2 s   | 符合判读 |
| `valid-rebuild`        | 完成，没有错误                            | 1541306    | 2219825    | 92   | 164.4 s | 符合判读 |
| `valid-two-keys`       | 完成，没有错误                            | 2279460    | 3153840    | 88   | 229.1 s | 符合判读 |
| `valid-throws`         | 完成，没有错误                            | 4428       | 5469       | 52   | 1.8 s   | 符合判读 |
| `live`                 | 完成，没有错误                            | 51304      | 64445      | 59   | 7.3 s   | 符合判读 |
| `probe-a1`             | `P8_BoundedClose` 被违反                  | 599        | 895        | 29   | 1.4 s   | 符合判读 |
| `probe-live-hang`      | 时序性质被违反（`P8_EveryCallerAnswers`） | 9261       | 12138      |      | 2.4 s   | 符合判读 |
| `bad-no-absorb-close`  | `P2_NoneHoldsNothing` 被违反              | 1604       | 2075       | 32   | 1.7 s   | 符合判读 |
| `bad-forget-open`      | `P2_ForgetHoldsNothing` 被违反            | 43893      | 59928      | 47   | 4.1 s   | 符合判读 |
| `bad-forget-open-late` | `P6_LateInvisible` 被违反                 | 238        | 288        | 40   | 1.2 s   | 符合判读 |
| `bad-no-shut`          | `P4_NoConnectAfterShut` 被违反            | 92         | 95         | 18   | 1.2 s   | 符合判读 |
| `bad-ok-after-shut`    | `P4_NoOkAfterShut` 被违反                 | 413        | 578        | 29   | 1.2 s   | 符合判读 |
| `bad-abandon-landed`   | `P1_ReleasedAfterStop` 被违反             | 631        | 870        | 33   | 1.4 s   | 符合判读 |
| `bad-unbounded-wrap`   | `P8_BoundedEnsure` 被违反                 | 66         | 70         | 25   | 1.1 s   | 符合判读 |

运行于 2026-11-05（UTC 19:41 起），早于提交 `f34077cec`（2026-11-06 01:17 UTC）。两个 `.tla` 与 29 个 `.cfg` 的 SHA-256 与 `0b84a0bec` 上的文件逐个相同（运行的汇总记了每个配置的 SHA-256，本闭包在 `0b84a0bec` 的树上逐个核对过），所以读数对应 `0b84a0bec` 上的模型与配置。模型不读源码，实现与模型之间没有精化证明。`run.py` 退出码 0，29 个配置都符合判读，证据目录 `tmp/closures/w3-mcp-call/fix2/model/tlc/20261105T194113Z`，汇总 `tmp/closures/w3-mcp-call/fix2/model/tlc-all.log`（sha256 前 16 位 `e61f1a2f61787715`）。同一时段本机另有会话在运行，耗时偏长。深度是 TLC 状态图的深度，含内部步，所以比探索器调度的步数大。活性配置不报告深度。负控与探针的不同状态数随 TLC 的并行调度而略有不同，不是模型变化。

`Calls.tla` 的运行记录（同一次运行，模型 SHA-256 `096a2c50ced5b2e2…`，含 S8 的关停先判与关口之后读 `shut`）：

| 配置                          | 结论                                     | 不同状态数 | 生成状态数 | 深度 | 耗时  | 判读     |
| ----------------------------- | ---------------------------------------- | ---------- | ---------- | ---- | ----- | -------- |
| `calls-valid`                 | 完成，没有错误                           | 648        | 1179       | 16   | 1.2 s | 符合判读 |
| `calls-valid-twice`           | 完成，没有错误                           | 762        | 1003       | 24   | 1.3 s | 符合判读 |
| `calls-valid-continue`        | 完成，没有错误                           | 108        | 123        | 22   | 1.0 s | 符合判读 |
| `calls-valid-task`            | 完成，没有错误                           | 74906      | 116514     | 32   | 4.3 s | 符合判读 |
| `calls-valid-isolation`       | 完成，没有错误                           | 3621       | 4601       | 17   | 1.6 s | 符合判读 |
| `calls-live`                  | 完成，没有错误                           | 366        | 580        | 15   | 1.3 s | 符合判读 |
| `calls-bad-send-despite-stop` | `P9_NotSentNotSent` 被违反               | 45         | 48         | 13   | 1.0 s | 符合判读 |
| `calls-bad-gate-unstopped`    | `P14_BoundedAfterStop` 被违反            | 16         | 16         | 11   | 1.0 s | 符合判读 |
| `calls-bad-cancel-twice`      | `P10_CancelOnce` 被违反                  | 39         | 40         | 12   | 1.0 s | 符合判读 |
| `calls-bad-no-release`        | `P11_ReservationEnded` 被违反            | 19         | 20         | 11   | 1.0 s | 符合判读 |
| `calls-bad-task-any-account`  | `P12_Isolation` 被违反                   | 10030      | 12892      | 20   | 2.0 s | 符合判读 |
| `calls-bad-key-blind`         | `P12_Isolation` 被违反                   | 17         | 17         | 12   | 1.0 s | 符合判读 |
| `calls-bad-task-blind`        | `P12_Isolation` 被违反                   | 45         | 49         | 13   | 1.0 s | 符合判读 |
| `calls-bad-send-after-shut`   | `P13_NoSendAfterShut` 被违反             | 34         | 38         | 12   | 1.0 s | 符合判读 |
| `calls-bad-wait-answer`       | 时序性质被违反（`P14_EveryCallAnswers`） | 40         | 41         |      | 1.1 s | 符合判读 |

运行信息同上（15 个配置）。状态数比生命周期模型小得多：连接表在这里只剩可用、代际、丢失与关停，没有五项资源与拆除。基线 `7d91a330c` 上的记录（含当时的探针 `calls-probe-stop`，给出发现 F1 的最短反例）在 Git 历史。

负控的反例（外部动作）：

- `bad-ok-after-shut`：ensure、answer adoption ok、answer acquire ok、answer start ok、answer open ok、closeAll、answer discover ok。
- `bad-abandon-landed`：ensure、answer adoption ok、answer acquire ok、fire、fire、answer start ok（迟到）、closeAll。
- `bad-unbounded-wrap`：ensure、answer adoption ok、fire、fire；取凭据不答复，两个时限都到期之后建连仍在等失败后的收场。
- `bad-forget-open-late`：ensure、answer adoption ok、answer acquire ok、fire、fire、answer store ok、answer start ok（迟到）、answer stop ok、answer release ok；`lost` 的条目离开表，状态变成 `none`。

`Calls.tla` 的负控的反例（外部动作）：

- `calls-bad-send-despite-stop`：invoke A、answer gate ok、cancel A、answer ensure ok、answer call ok；占位期间已取消，建连的等待没有停下，调用仍发出。
- `calls-bad-gate-unstopped`：invoke A、cancel A；关口端口挂起，调用已取消而仍在等它，没有时限可等。同一缺陷在 `P14_BoundedAfterStop` 上的样子，也是基线上发现 F1(a) 的最短反例。
- `calls-bad-cancel-twice`：invoke A、answer gate ok、answer ensure ok、cancel A、answer call ok；放弃时发出第二次 `cancelRequest`。
- `calls-bad-no-release`：invoke A、answer gate fail；调用答复后占位仍在。
- `calls-bad-task-any-account`：invoke A、invoke C、两次 answer gate ok、两次 answer ensure ok、answer call ok、answer answer ok、task A；A 的任务操作用了 C 的连接（另一账户）。
- `calls-bad-key-blind`：invoke A、cancel C；C 的 `cancel` 停止了 A 的调用。
- `calls-bad-task-blind`：invoke A、answer gate ok、answer ensure ok、answer call ok、answer answer ok、task C；C 读到 A 的任务。
- `calls-bad-send-after-shut`：closeAll、invoke A、answer gate ok、answer ensure ok；关停之后仍问关口、`ensure` 仍交出连接，调用发出。
- `calls-bad-wait-answer`：invoke A、answer gate ok、answer ensure ok、cancel A、answer call ok；之后对端不答已停止请求的应答，调用永不答复（`Observe = FALSE`，轨迹不带动作名，次序从状态读出）。

## 本包事实

- 当前内容：连接表生命周期的模型与 14 份配置，调用口的模型与 15 份配置，运行脚本。
- 状态：见上面的运行记录与 [SPEC.md「性质与证据」](../../SPEC.md#properties)。这不是证明，也不表示实现符合模型。
- 负责人：本包的维护者。连接表或调用口的结构变化时，先改对应模型的动作，再重跑它的全部配置。

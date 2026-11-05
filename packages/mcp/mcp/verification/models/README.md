# verification/models

本目录承载连接表生命周期的 TLA+ 模型 [ConnectionTable.tla](ConnectionTable.tla)、它的配置与运行脚本 [run.py](run.py)。模型描述 `src/internal/table.ts`、`build.ts`、`teardown.ts`、`late.ts`、`port.ts` 与 `entry.ts`。性质的定理陈述归 [SPEC.md「性质与证据」](../../SPEC.md#properties)。模型与实现、探索器之间的映射见 [../README.md](../README.md#动作映射)。

## 边界

TLC 对有限状态做穷举。本页的结论只在下表的上限与模型的抽象之内成立。模型通过不表示任意规模下正确，也不表示实现符合模型。本页不写「已证明」。

常量：

- `Keys`：连接键，每个键一个租户与一个持有。
- `Ensures`、`Releases`：每个键的 `ensure`、`release` 次数。`CloseAlls`：0 或 1。`Loses`：`lose` 的总次数。
- `Deviations`：端口调用除按契约答复以外还可以做什么：`fail`、`reject`、`unconfirmed`、`throw`。`Budget`：一条行为里偏离的总次数。挂起与迟到不占预算。端口被调用时同步抛出，模型按 `ask` 写成立即答复的 reject。
- `Bugs`：负控故意放进的缺陷。`{}` 是本包的代码。
- `Observe`：`TRUE` 时 `ev` 字段记下每个外部动作与同步抛出，供轨迹阅读。安全配置用 `VIEW View` 把它排除在指纹之外。活性配置取 `FALSE`，令 `ev` 保持常量。没有动作读 `ev`，所以这样合并状态不改变检查结果。

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

运行环境：TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)，即 tla2tools v1.7.4 发行包里的 TLC，tla2tools.jar SHA-256 `936a262061c91469…`，6 个工作线程。模型 SHA-256 `b14f3711fe731cc4…`（第 1 轮评审裁定 F2、F3 之后：落点从开始起就在途，关停开始之后的失败按关停收场）。

| 配置                   | 结论                                      | 不同状态数 | 生成状态数 | 深度 | 耗时    | 判读     |
| ---------------------- | ----------------------------------------- | ---------- | ---------- | ---- | ------- | -------- |
| `valid-faults`         | 完成，没有错误                            | 57316      | 72036      | 59   | 5.2 s   | 符合判读 |
| `valid-rebuild`        | 完成，没有错误                            | 1541306    | 2219825    | 92   | 134.5 s | 符合判读 |
| `valid-two-keys`       | 完成，没有错误                            | 2279460    | 3153840    | 88   | 202.5 s | 符合判读 |
| `valid-throws`         | 完成，没有错误                            | 4428       | 5469       | 52   | 2.2 s   | 符合判读 |
| `live`                 | 完成，没有错误                            | 51304      | 64445      | 59   | 7.5 s   | 符合判读 |
| `probe-a1`             | `P8_BoundedClose` 被违反                  | 666        | 996        | 31   | 1.6 s   | 符合判读 |
| `probe-live-hang`      | 时序性质被违反（`P8_EveryCallerAnswers`） | 9261       | 12138      |      | 3.0 s   | 符合判读 |
| `bad-no-absorb-close`  | `P2_NoneHoldsNothing` 被违反              | 2048       | 2640       | 34   | 1.9 s   | 符合判读 |
| `bad-forget-open`      | `P2_ForgetHoldsNothing` 被违反            | 44252      | 60392      | 47   | 4.8 s   | 符合判读 |
| `bad-forget-open-late` | `P6_LateInvisible` 被违反                 | 240        | 290        | 41   | 1.5 s   | 符合判读 |
| `bad-no-shut`          | `P4_NoConnectAfterShut` 被违反            | 95         | 98         | 20   | 1.2 s   | 符合判读 |
| `bad-ok-after-shut`    | `P4_NoOkAfterShut` 被违反                 | 372        | 511        | 30   | 1.5 s   | 符合判读 |
| `bad-abandon-landed`   | `P1_ReleasedAfterStop` 被违反             | 785        | 1054       | 36   | 1.8 s   | 符合判读 |
| `bad-unbounded-wrap`   | `P8_BoundedEnsure` 被违反                 | 66         | 70         | 25   | 1.3 s   | 符合判读 |

运行于 2026-11-05（UTC 10:07 起），`run.py` 退出码 0，全部 14 个配置用时 11 分 11 秒，其中约 5 分钟在等运行名额；同一时段本机另有一个会话在跑差分变异，所以耗时偏长。深度是 TLC 状态图的深度，含内部步，所以比探索器调度的步数大。活性配置不报告深度。

负控的反例（外部动作）：

- `bad-ok-after-shut`：ensure、answer adoption ok、answer acquire ok、answer start ok、answer open ok、closeAll、answer discover ok。
- `bad-abandon-landed`：ensure、answer adoption ok、answer acquire ok、fire、fire、answer start ok（迟到）、closeAll。
- `bad-unbounded-wrap`：ensure、answer adoption ok、fire、fire；取凭据不答复，两个时限都到期之后建连仍在等失败后的收场。
- `bad-forget-open-late`：ensure、answer adoption ok、answer acquire ok、fire、fire、answer store ok、answer start ok（迟到）、answer stop ok、answer release ok；`lost` 的条目离开表，状态变成 `none`。

## 本包事实

- 当前内容：连接表生命周期的模型、14 份配置与运行脚本。
- 状态：见上面的运行记录与 [SPEC.md「性质与证据」](../../SPEC.md#properties)。这不是证明，也不表示实现符合模型。
- 负责人：本包的维护者。连接表的结构变化时，先改模型的对应动作，再重跑全部配置。

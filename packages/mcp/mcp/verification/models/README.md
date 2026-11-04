# verification/models

本目录承载连接表生命周期的 TLA+ 模型 [ConnectionTable.tla](ConnectionTable.tla)、它的配置与运行脚本 [run.py](run.py)。模型描述 1160e92c8 的 `src/internal/table.ts`、`build.ts`、`teardown.ts`、`late.ts` 与 `entry.ts`。性质的定理陈述归 [SPEC.md「性质与证据」](../../SPEC.md#properties)。模型与实现、探索器之间的映射见 [../README.md](../README.md#动作映射)。

## 边界

TLC 对有限状态做穷举。本页的结论只在下表的上限与模型的抽象之内成立。模型通过不表示任意规模下正确，也不表示实现符合模型。本页不写「已证明」。

常量：

- `Keys`：连接键，每个键一个租户与一个持有。
- `Ensures`、`Releases`：每个键的 `ensure`、`release` 次数。`CloseAlls`：0 或 1。`Loses`：`lose` 的总次数。
- `Deviations`：端口调用除按契约答复以外还可以做什么：`fail`、`reject`、`unconfirmed`、`throw`。`Budget`：一条行为里偏离的总次数。挂起与迟到不占预算。
- `Bugs`：负控故意打开的错误。`{}` 是 1160e92c8 的代码。
- `Observe`：`TRUE` 时 `ev` 字段记下每个外部动作与同步抛出，供轨迹阅读。安全配置用 `VIEW View` 把它排除在指纹之外。活性配置取 `FALSE`，令 `ev` 保持常量。没有动作读 `ev`，所以这样合并状态不改变检查结果。

## 配置

| 配置                  | 种类                 | 键   | `ensure` | `release` | `closeAll` | `lose` | 偏离与预算                                  | 检查                                                         |
| --------------------- | -------------------- | ---- | -------- | --------- | ---------- | ------ | ------------------------------------------- | ------------------------------------------------------------ |
| `valid-faults`        | 正控                 | A    | 1        | 1         | 1          | 1      | `fail`、`reject`、`unconfirmed`，1          | P1–P7 的全部不变式                                           |
| `valid-rebuild`       | 正控                 | A    | 2        | 0         | 1          | 0      | 无                                          | 同上                                                         |
| `valid-two-keys`      | 正控                 | A、B | 各 1     | 0         | 1          | 0      | 无；不触发时限（`CONSTRAINT NoBoundFired`） | 同上，P5 为主                                                |
| `valid-throws`        | 正控                 | A    | 1        | 0         | 1          | 0      | `throw`，1                                  | `P2_ForgetHoldsNothing`、P4、P5、P6                          |
| `live`                | 正控（活性）         | A    | 1        | 1         | 1          | 0      | `fail`、`reject`、`unconfirmed`，1          | `LiveSpec` 下的 `P8_EveryCallerAnswers`                      |
| `cex-b1`              | 已知反例             | A    | 1        | 0         | 1          | 0      | `throw`，1                                  | `P7_NoB1`，须违反                                            |
| `cex-n2`              | 已知反例             | 同上 |          |           |            |        |                                             | `P7_NoN2`，须违反                                            |
| `cex-n3`              | 已知反例             | 同上 |          |           |            |        |                                             | `P1_AtMostOnce`，须违反                                      |
| `cex-n3-shutdown`     | 已知反例             | 同上 |          |           |            |        |                                             | `P3_EveryProcessAsked`，须违反                               |
| `cex-p2`              | 已知反例             | A    | 1        | 0         | 1          | 0      | 无                                          | `P8_NoTeardownStall`，须违反                                 |
| `cex-n1`              | 已知反例             | 同上 |          |           |            |        |                                             | `P8_NoStoreStall`，须违反                                    |
| `probe-a1`            | 反定理的探针         | A    | 1        | 1         | 0          | 0      | 无                                          | `P8_BoundedClose`，须违反                                    |
| `probe-live-hang`     | 反定理的探针（活性） | A    | 1        | 1         | 1          | 0      | 无                                          | `HangSpec` 下的 `P8_EveryCallerAnswers`，须有时序反例        |
| `bad-no-absorb-close` | 负控                 | A    | 1        | 1         | 0          | 0      | `reject`，1                                 | 拆除不吸收 `close()` 的 reject。`P2_NoneHoldsNothing` 须违反 |
| `bad-forget-open`     | 负控                 | A    | 2        | 0         | 1          | 0      | 无                                          | 遗忘不要求已关闭。`P2_ForgetHoldsNothing` 须违反             |
| `bad-no-shut`         | 负控                 | A    | 1        | 0         | 1          | 0      | 无                                          | `closeAll` 不置关停。`P4_NoConnectAfterShut` 须违反          |

「同上」指与上一行相同的常量。`valid-two-keys` 不触发时限，迟到路径只在一个键的配置里检查：不加这个约束时，两个键的状态空间相乘，TLC 运行 17 分钟仍未完成。三个负控与探索器的变异同义，见 [../README.md](../README.md#探索器能变红)。修复一个已知反例之后，把它的 `cex-*` 配置改成正控，并改 `run.py` 的期望。

## 运行与判读

从仓库根经运行名额执行：

```sh
node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py [配置名 ...]
```

不带配置名时运行全部配置。`TLA2TOOLS_JAR` 指向 tla2tools（缺省 `/opt/tlaplus/tla2tools.jar`），`JAVA_BIN` 指定 java，`FORMAL_OUTPUT_DIR` 指定证据目录（缺省仓库 `tmp/formal/mcp-connection-table/runs/`），`FORMAL_WORKERS` 指定 TLC 的工作线程数（缺省 4）。脚本把每个配置的原始输出与 `summary.json`（jar、模型与配置的 SHA-256，状态数、深度、耗时、判读与反例的外部动作）写进证据目录。每个配置跑完后，脚本删除 TLC 的状态目录。

判读规则：

- 正控须退出 0，并输出 `Model checking completed. No error has been found.`。
- 已知反例、反定理的探针与负控须退出非零，TLC 报告的被违反不变式恰好是配置表所列的那一条，并给出反例轨迹。时序配置须报告 `Temporal properties were violated.`。
- 退出码只在每个配置都符合判读时为 0。超时、解析失败、求值错误与未执行都不算通过。非零退出本身不算负控通过。

## 运行记录

运行环境：TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)，tla2tools.jar SHA-256 `936a262061c91469…`，4 个工作线程。模型 SHA-256 `e0d9793b36c0f661…`。

| 配置                  | 结论                                      | 不同状态数 | 生成状态数 | 深度 | 耗时   | 判读     |
| --------------------- | ----------------------------------------- | ---------- | ---------- | ---- | ------ | -------- |
| `valid-faults`        | 完成，没有错误                            | 68911      | 90829      | 55   | 5.4 s  | 符合判读 |
| `valid-rebuild`       | 完成，没有错误                            | 725887     | 998517     | 88   | 88.0 s | 符合判读 |
| `valid-two-keys`      | 完成，没有错误                            | 546811     | 733121     | 76   | 86.9 s | 符合判读 |
| `valid-throws`        | 完成，没有错误                            | 4833       | 6202       | 54   | 2.4 s  | 符合判读 |
| `live`                | 完成，没有错误                            | 62569      | 82794      | 55   | 14.8 s | 符合判读 |
| `cex-b1`              | `P7_NoB1` 被违反                          | 824        | 933        | 31   | 1.7 s  | 符合判读 |
| `cex-n2`              | `P7_NoN2` 被违反                          | 168        | 178        | 24   | 1.5 s  | 符合判读 |
| `cex-n3`              | `P1_AtMostOnce` 被违反                    | 916        | 1027       | 31   | 1.6 s  | 符合判读 |
| `cex-n3-shutdown`     | `P3_EveryProcessAsked` 被违反             | 878        | 990        | 31   | 2.9 s  | 符合判读 |
| `cex-p2`              | `P8_NoTeardownStall` 被违反               | 167        | 180        | 28   | 2.1 s  | 符合判读 |
| `cex-n1`              | `P8_NoStoreStall` 被违反                  | 177        | 190        | 27   | 2.0 s  | 符合判读 |
| `probe-a1`            | `P8_BoundedClose` 被违反                  | 250        | 273        | 27   | 2.4 s  | 符合判读 |
| `probe-live-hang`     | 时序性质被违反（`P8_EveryCallerAnswers`） | 9361       | 12298      |      | 5.3 s  | 符合判读 |
| `bad-no-absorb-close` | `P2_NoneHoldsNothing` 被违反              | 1496       | 1677       | 31   | 2.0 s  | 符合判读 |
| `bad-forget-open`     | `P2_ForgetHoldsNothing` 被违反            | 54776      | 74734      | 47   | 6.1 s  | 符合判读 |
| `bad-no-shut`         | `P4_NoConnectAfterShut` 被违反            | 88         | 92         | 20   | 1.4 s  | 符合判读 |

运行于 2026-11-04（UTC 14:44 起），模型是提交 097492b97 的 `ConnectionTable.tla`，`run.py` 退出码 0。深度是 TLC 状态图的深度，含内部步，所以比探索器调度的步数大。活性配置不报告深度。运行时机器另有其他会话的负载，耗时只作参考。

## 本包事实

- 当前内容：连接表生命周期的模型、16 份配置与运行脚本。
- 状态：见上面的运行记录与 [SPEC.md「性质与证据」](../../SPEC.md#properties)。这不是证明，也不表示实现符合模型。
- 负责人：本包的维护者。连接表的结构变化时（例如改为结构化并发），先改模型的对应动作，再重跑全部配置。

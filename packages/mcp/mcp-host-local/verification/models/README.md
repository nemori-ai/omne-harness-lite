# verification/models

本目录承载会话请求生命周期的 TLA+ 模型 [TransportSession.tla](TransportSession.tla)、它的配置与运行脚本 [run.py](run.py)。模型描述 `src/session.ts` 的请求生命周期：登记、授权、发出、等应答、结算，以及 `signal` 与 `close()`。性质的定理陈述归 [SPEC.md「性质与证据」](../../SPEC.md#properties)。模型、实现与探索器之间的映射见 [../README.md](../README.md#动作映射)。

## 边界

TLC 对有限状态做穷举。本页的结论只在下表的上限与模型的抽象之内成立。模型通过不表示任意规模下正确，也不表示实现符合模型。本页不写「已证明」。模型省略的部分见 [../README.md](../README.md#状态映射)「模型的抽象」。

常量：

- `Reqs`：请求的集合；`Writes`：其中的写类请求（`tools/call`、`tasks/update`、`tasks/cancel`），不再发。
- `HasHandle`：`TRUE` 为带凭据句柄的 Streamable HTTP 材料。
- `MaxSends`：一个请求最多发出几次（读类再发一次，取 2）。
- `Bugs`：负控故意放进的缺陷；`{}` 是本包的代码。

## 配置

| 配置 | 种类 | `Reqs` | `Writes` | `HasHandle` | `Bugs` | 检查 |
| --- | --- | --- | --- | --- | --- | --- |
| `valid-close` | 正控 | r1、r2 | r2 | TRUE | — | V1–V6 的全部不变式 |
| `valid-signal` | 正控 | r1 | — | TRUE | — | 同上 |
| `valid-no-handle` | 正控 | r1 | — | FALSE | — | 同上 |
| `bad-resettle` | 负控 | r1 | — | TRUE | `resettle` | `V1_SettleOnce` 须违反 |
| `bad-cred-after-close` | 负控 | r1、r2 | — | TRUE | `cred-after-close` | `V2_NoCredentialAfterClose` 须违反 |
| `bad-report-twice` | 负控 | r1 | — | TRUE | `report-twice` | `V3_RejectAtMostOnce` 须违反 |
| `bad-signal-dead` | 负控 | r1 | — | TRUE | `signal-dead` | `V4_SignalBounded` 须违反 |
| `bad-close-after-line` | 负控 | r1 | — | TRUE | `close-after-line` | `V4_CloseBounded` 须违反 |
| `bad-resend` | 负控 | r1 | r1 | TRUE | `resend-any` | `V5_NoResendForCaller` 须违反 |
| `bad-close-not-sent` | 负控 | r1 | — | TRUE | `close-not-sent` | `V6_CloseThreePhases` 须违反 |

性质 V1–V6 与不变式名字、负控与探索器变异的对应见 [../README.md](../README.md#两种证据能变红)。编号与名字在 [SPEC.md](../../SPEC.md#properties)、[../README.md](../README.md) 与本页三处相同。

## 运行与判读

从仓库根经运行名额执行：

```sh
node scripts/with-test-slot.mjs python3 packages/mcp/mcp-host-local/verification/models/run.py [配置名 ...]
```

不带配置名时运行全部配置。`TLA2TOOLS_JAR` 指向 tla2tools（缺省 `/opt/tlaplus/tla2tools.jar`），`JAVA_BIN` 指定 java，`FORMAL_OUTPUT_DIR` 指定证据目录（缺省仓库 `tmp/closures/w3-mcp-host-formal/formal/`），`FORMAL_WORKERS` 指定 TLC 的工作线程数（缺省 4）。脚本把每个配置的原始输出与 `summary.json`（jar、模型与配置的 SHA-256，状态数、深度、耗时、判读）写进证据目录，跑完后删除 TLC 的状态目录。

判读规则：

- 正控须退出 0，并输出 `Model checking completed. No error has been found.`。
- 负控须退出非零，TLC 报告的被违反不变式恰好是配置表所列的那一条，并给出反例轨迹。
- 退出码只在每个配置都符合判读时为 0。超时、解析失败、求值错误与未执行都不算通过。非零退出本身不算负控通过。

## 运行记录

运行环境：TLC2 Version 2.19 of 08 August 2024（tla2tools v1.7.4，`tla2tools.jar` SHA-256 `936a262061c91469…`），3 个工作线程。模型 SHA-256 `2c1b2aca3c0a1236…`。

| 配置 | 结论 | 不同状态数 | 生成状态数 | 深度 | 耗时 | 判读 |
| --- | --- | --- | --- | --- | --- | --- |
| `valid-close` | 完成，没有错误 | 544 | 860 | 14 | 1.0 s | 符合判读 |
| `valid-signal` | 完成，没有错误 | 48 | 54 | 9 | 1.0 s | 符合判读 |
| `valid-no-handle` | 完成，没有错误 | 48 | 54 | 9 | 1.0 s | 符合判读 |
| `bad-resettle` | `V1_SettleOnce` 被违反 | 17 | 17 | 5 | 1.0 s | 符合判读 |
| `bad-cred-after-close` | `V2_NoCredentialAfterClose` 被违反 | 63 | 86 | 6 | 0.9 s | 符合判读 |
| `bad-report-twice` | `V3_RejectAtMostOnce` 被违反 | 11 | 11 | 5 | 0.9 s | 符合判读 |
| `bad-signal-dead` | `V4_SignalBounded` 被违反 | 19 | 20 | 6 | 1.0 s | 符合判读 |
| `bad-close-after-line` | `V4_CloseBounded` 被违反 | 16 | 16 | 5 | 0.9 s | 符合判读 |
| `bad-resend` | `V5_NoResendForCaller` 被违反 | 26 | 29 | 7 | 0.9 s | 符合判读 |
| `bad-close-not-sent` | `V6_CloseThreePhases` 被违反 | 46 | 52 | 9 | 1.0 s | 符合判读 |

运行于 2026-11-05（UTC 16:02 起），`run.py` 退出码 0，全部 10 个配置用时约 10 秒，另在运行名额上等了约 2 分钟（同一时段本机另一会话在跑覆盖率）。深度是 TLC 状态图的深度，含内部步。

## 本包事实

- 当前内容：会话请求生命周期的模型、10 份配置与运行脚本。
- 状态：见上面的运行记录与 [SPEC.md「性质与证据」](../../SPEC.md#properties)。这不是证明，也不表示实现符合模型。
- 负责人：本包的维护者。会话的结算次序或等待点变化时，先改模型的对应动作，再重跑全部配置。

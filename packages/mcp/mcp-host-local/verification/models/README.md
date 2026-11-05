# verification/models

本目录承载会话请求生命周期的 TLA+ 模型 [TransportSession.tla](TransportSession.tla)、它的配置与运行脚本 [run.py](run.py)。模型描述 `src/session.ts` 的请求生命周期：登记、授权、交给线路、等应答、结算，以及 `signal` 与 `close()`。性质的定理陈述归 [SPEC.md「性质与证据」](../../SPEC.md#properties)。模型、实现与探索器之间的映射见 [../README.md](../README.md#动作映射)。

## 边界

TLC 对有限状态做穷举。本页的结论只在下表的上限与模型的抽象之内成立。模型通过不表示任意规模下正确，也不表示实现符合模型。本页不写「已证明」。模型省略的部分见 [../README.md](../README.md#状态映射)「模型的抽象」。

常量：

- `Reqs`：请求的集合；`Writes`：其中的写类请求（`tools/call`、`tasks/update`、`tasks/cancel`），不再发。
- `HasHandle`：`TRUE` 为带凭据句柄的 Streamable HTTP 材料。
- `MaxSends`：一个请求最多发出几次（读类再发一次，取 2）。
- `Bugs`：负控故意放进的缺陷；`{}` 是本包的代码。

## 模型里的名字

每个请求有两样分开的东西：在途项与后台工作流。

- 在途项的相 `st[r]`：`init`（还没登记）、`auth`（已登记，还没交给线路：授权中）、`sent`（已交给线路）、`disc`（授权发现中）、`done`（已结算）。答复 `out[r]`：`none`、`result`、`abandoned`（`no-answer`，`abandoned`）、`notSent`（`not-sent`，`connection-unavailable`）、`authReq`（`not-sent`，`authorization-required`）、`broken`。
- 调用方的等待 `cw[r]`：`none`、`waiting`、`answered`。它是调用方对这个请求的最后一个等待：`call` 的 `answer`，或读写类操作的结果。结算放开它，别的事不放开它。
- 工作流的阶段 `wf[r]`：`none`、`auth`（等凭据句柄）、`line`（等线路的应答）、`disc`（等元数据取回）、`end`。端口在在途项结算之后才答复时，工作流丢弃答复：不发出、不调用句柄、不再结算。
- 快照，由有效动作写入，不变式只读它们：`cutAt[r]`（`signal` 或 `close()` 结算在途项时它所处的相；`init` 表示请求在 `close()` 之后或 `signal` 触发之后才开始，当场拒绝）、`firstOut[r]`（第一次结算的答复）、`settles[r]`（结算次数）、`credAtClose`（`close()` 被调用时凭据句柄的调用计数 `cred`）。
- 其余：`sends[r]`（发出次数）、`signalled`（信号已触发的请求）、`refusals`（带句柄的材料上，对尚未结算的请求的拒绝数）、`cred`（`authorize` 与 `reportRejection` 的调用计数）、`closed`、`closeDone`。

结算规则，`signal` 与 `close()` 相同：`auth` → `notSent`，`sent` → `abandoned`，`disc` → `authReq`。两者都当场结算，不等句柄、线路或发现。`close()` 在线路的 `close` 答复之后返回（`LineClosed`）。

## 配置

| 配置 | 种类 | `Reqs` | `Writes` | `HasHandle` | `Bugs` | 检查 |
| --- | --- | --- | --- | --- | --- | --- |
| `valid-close` | 正控 | r1、r2 | r2 | TRUE | — | V1–V6 的全部不变式 |
| `valid-signal` | 正控 | r1 | — | TRUE | — | 同上 |
| `valid-no-handle` | 正控 | r1 | — | FALSE | — | 同上 |
| `bad-resettle` | 负控 | r1 | — | TRUE | `resettle` | 迟到的应答再次结算已结算的请求。`V1_SettleOnce` 须违反 |
| `bad-cred-after-close` | 负控 | r1、r2 | — | TRUE | `cred-after-close` | `close()` 之后开始的请求仍调用 `authorize`。`V2_NoCredentialAfterClose` 须违反 |
| `bad-report-twice` | 负控 | r1 | — | TRUE | `report-twice` | 一次拒绝调用两次 `reportRejection`。`V3_RejectAtMostOnce` 须违反 |
| `bad-signal-dead` | 负控 | r1 | — | TRUE | `signal-dead` | `signal` 不结算在途项。`V4_SignalBounded` 须违反 |
| `bad-close-settles-after-line` | 负控 | r1 | — | TRUE | `close-settles-after-line` | `close()` 等线路关闭之后才结算在途项。`V4_CloseBounded` 须违反 |
| `bad-caller-waits-workflow-close` | 负控 | r1 | — | TRUE | `caller-waits-workflow` | 调用方跟着工作流等：`close()` 结算了在途项，调用方仍等挂起的凭据句柄。`V4_CloseBounded` 须违反 |
| `bad-caller-waits-workflow-signal` | 负控 | r1 | — | TRUE | `caller-waits-workflow` | 同一缺陷，`signal` 一侧。`V4_SignalBounded` 须违反 |
| `bad-resend` | 负控 | r1 | r1 | TRUE | `resend-any` | 写类请求在流断开后再发。`V5_NoResendForCaller` 须违反 |
| `bad-close-not-sent` | 负控 | r1 | — | TRUE | `close-not-sent` | `close()` 把已交给线路的请求答成 `notSent`。`V6_ByPhase` 须违反 |

端口挂起在每个配置里都可能：答复端口的动作不被选中，TLC 检查每个前缀。`bad-caller-waits-workflow-*` 的反例就是这样一条前缀：登记之后凭据句柄没有答复，`close()`（或 `signal`）结算了在途项，调用方仍在等。

性质 V1–V6 与不变式名字、负控与探索器变异的对应见 [../README.md](../README.md#两种证据能变红)。编号与名字在 [SPEC.md](../../SPEC.md#properties)、[../README.md](../README.md) 与本页三处相同。

## 有效动作的变异

缺陷注入（`Bugs`）之外，每条不变式至少有一个有效动作的变异让正控变红。变异写在 `run.py` 的 `MUTATIONS`：把模块里一段有效动作的原文换成缺陷，在模块的副本上运行 TLC，只查目标不变式，用基础配置的常量。原文须在模块里恰好出现一次，否则该变异判为未执行。本目录的模块不被改动。

| 变异 | 改了什么 | 基础配置 | 须变红的不变式 |
| --- | --- | --- | --- |
| `V1-close-resettles-done` | `close()` 把已结算的请求也当在途项再结算一次 | `valid-close` | `V1_SettleOnce` |
| `V1-late-answer-resettles` | 迟到的应答不核对在途项是否已结算，照样结算 | `valid-close` | `V1_SettleOnce` |
| `V2-begin-ignores-closed` | `Begin` 不核对 `closed`，`close()` 之后开始的请求走正常的授权路径 | `valid-close` | `V2_NoCredentialAfterClose` |
| `V2-late-refusal-reports` | 迟到的拒绝（在途项已由 `close()` 结算）仍调用 `reportRejection` | `valid-close` | `V2_NoCredentialAfterClose` |
| `V3-discovery-reports-again` | 发现结束时再调用一次 `reportRejection` | `valid-close` | `V3_RejectAtMostOnce` |
| `V3-report-without-handle` | 没有句柄的材料上也调用 `reportRejection` | `valid-no-handle` | `V3_RejectAtMostOnce` |
| `V4-close-keeps-caller` | `close()` 结算在途项，但不放开调用方的等待 | `valid-close` | `V4_CloseBounded` |
| `V4-close-waits-discovery` | `close()` 不结算授权发现中的请求（修订前的规则：等发现结束） | `valid-close` | `V4_CloseBounded` |
| `V4-signal-leaves-discovery` | `signal` 不结算授权发现中的请求（修订前的规则） | `valid-close` | `V4_SignalBounded` |
| `V5-write-resends` | 流断开后写类请求也再发 | `valid-close` | `V5_NoResendForCaller` |
| `V5-read-resends-twice` | 再发的上限差一，读类请求发三次 | `valid-signal` | `V5_NoResendForCaller` |
| `V6-close-auth-abandoned` | `close()` 把授权中的请求答成 `abandoned` | `valid-close` | `V6_ByPhase` |
| `V6-close-disc-not-sent` | `close()` 把授权发现中的请求答成 `notSent`（`connection-unavailable`） | `valid-close` | `V6_ByPhase` |
| `V6-signal-sent-not-sent` | `signal` 把已交给线路的请求答成 `notSent` | `valid-close` | `V6_ByPhase` |

## 运行与判读

从仓库根经运行名额执行：

```sh
node scripts/with-test-slot.mjs python3 packages/mcp/mcp-host-local/verification/models/run.py [配置名 ...]
node scripts/with-test-slot.mjs python3 packages/mcp/mcp-host-local/verification/models/run.py --mutations [变异名 ...]
```

不带名字时运行全部配置或全部变异。`TLA2TOOLS_JAR` 指向 tla2tools（缺省 `/opt/tlaplus/tla2tools.jar`），`JAVA_BIN` 指定 java，`FORMAL_OUTPUT_DIR` 指定证据目录（缺省仓库 `tmp/formal/mcp-host-local/runs/`），`FORMAL_WORKERS` 指定 TLC 的工作线程数（缺省 4）。脚本把每个配置的原始输出与 `summary.json`（jar、模型与配置的 SHA-256，状态数、深度、耗时、判读）写进证据目录；变异运行写 `mutations.json`，每个变异的模块副本与配置留在证据目录的 `mutant-<名字>/`。跑完后删除 TLC 的状态目录。

判读规则：

- 正控须退出 0，并输出 `Model checking completed. No error has been found.`。
- 负控与变异须退出非零，TLC 报告的被违反不变式恰好是表里所列的那一条，并给出反例轨迹。
- 退出码只在每个配置（或变异）都符合判读时为 0。超时、解析失败、求值错误、原文不唯一与未执行都不算通过。非零退出本身不算负控通过。

## 运行记录

运行环境：TLC2 Version 2.19 of 08 August 2024（tla2tools v1.7.4，`tla2tools.jar` SHA-256 `936a262061c91469…`），4 个工作线程。模型 SHA-256 `5090d212e86ec2d0…`。

| 配置 | 结论 | 不同状态数 | 生成状态数 | 深度 | 耗时 | 判读 |
| --- | --- | --- | --- | --- | --- | --- |
| `valid-close` | 完成，没有错误 | 2230 | 6148 | 15 | 1.2 s | 符合判读 |
| `valid-signal` | 完成，没有错误 | 107 | 186 | 10 | 1.0 s | 符合判读 |
| `valid-no-handle` | 完成，没有错误 | 107 | 186 | 10 | 1.0 s | 符合判读 |
| `bad-resettle` | `V1_SettleOnce` 被违反 | 70 | 93 | 7 | 0.9 s | 符合判读 |
| `bad-cred-after-close` | `V2_NoCredentialAfterClose` 被违反 | 78 | 103 | 5 | 1.0 s | 符合判读 |
| `bad-report-twice` | `V3_RejectAtMostOnce` 被违反 | 30 | 46 | 7 | 0.9 s | 符合判读 |
| `bad-signal-dead` | `V4_SignalBounded` 被违反 | 24 | 30 | 5 | 1.0 s | 符合判读 |
| `bad-close-settles-after-line` | `V4_CloseBounded` 被违反 | 30 | 33 | 5 | 1.0 s | 符合判读 |
| `bad-caller-waits-workflow-close` | `V4_CloseBounded` 被违反 | 27 | 32 | 5 | 0.9 s | 符合判读 |
| `bad-caller-waits-workflow-signal` | `V4_SignalBounded` 被违反 | 25 | 31 | 6 | 1.0 s | 符合判读 |
| `bad-resend` | `V5_NoResendForCaller` 被违反 | 58 | 100 | 8 | 1.0 s | 符合判读 |
| `bad-close-not-sent` | `V6_ByPhase` 被违反 | 75 | 106 | 7 | 0.9 s | 符合判读 |

运行于 2026-11-05（UTC 19:19），`run.py` 退出码 0，12 个配置用时约 12 秒。深度是 TLC 状态图的深度，含内部步。正控的状态数是完整穷举，两次运行相同。负控与变异的状态数是 TLC 找到第一条反例时的计数，随工作线程的调度在两次运行之间略有不同。

变异（同一环境，同一模型）：14 个变异各自只违反目标不变式，`run.py --mutations` 退出码 0，用时约 15 秒。每个变异的不同状态数在 30 到 292 之间，深度 4 到 10。

## 本包事实

- 当前内容：会话请求生命周期的模型、12 份配置、14 个有效动作的变异与运行脚本。
- 状态：见上面的运行记录与 [SPEC.md「性质与证据」](../../SPEC.md#properties)。这不是证明，也不表示实现符合模型。
- 负责人：本包的维护者。会话的结算次序或等待点变化时，先改模型的对应动作，再重跑全部配置与变异。

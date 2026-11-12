# 交入与停服交接的有限模型

[InputHandoverQuiesce.tla](InputHandoverQuiesce.tla) 检查一条输入的交入落在停服交接的任意时刻时，会不会丢，以及停用会不会因此排空不了。运行时有一个执行槽；驱动在内存里记着它上次读到的输入边界。有序停服先静默：驱动在已保存的等待上把执行交出去（`detach`），槽空闲，静默答已排空；进程停下、再启动，恢复把执行接回来（`attach`），起一个新驱动。会话一直在交入到达的输入。

Agent 契约要求：`submit` 不需要活体运行时、槽、恢复或挂接；它不自动恢复执行；活体只收到唤醒提示；没有活体时，后继的合法推进读同一个输入边界（Agent 契约「输入内容与水位线」）。

模型检查只说明有限范围内的设计性质。它不证明实现符合模型。

## 性质

| 性质（模型名） | 违背后果 | 条款 |
| --- | --- | --- |
| 已排空的答复是真的：没有驱动在跑，槽空闲（`DrainedHonest`） | 停服说排空了，其实还有执行占着槽，或者槽永远空不出来 | Agent 契约「交接与停用」；I6（整程包） |
| 到达的每条输入跨停服都被取走（`Delivered`） | 停服前后交入的输入没人取，Run 永远收不了场 | 线卡 #1216 第一件的性质 4 |
| 开始的静默终究答已排空（`Drains`） | 停服挂住 | Agent 契约「交接与停用」 |

## 有限范围

一个执行；`Inputs = {i1, i2}`；`MaxStops = 1`，进程至多停一次。输入的拒收不在本模型内，见[交入与收场](../input-handover-finish/README.md)。`Bug` 每个值去掉一条设计规则，`"none"` 是设计。公平性：交入、读、取走、终结、交接、排空、停止、启动、恢复都是弱公平。

## 配置

| 配置 | `Bug` | 预期 |
| --- | --- | --- |
| `positive.cfg` | `none` | 通过 |
| `negative-hint-only.cfg` | `hint-only`：驱动只靠唤醒提示得知新输入，接回来的驱动从它记得的边界开始，不读执行记录 | 违反 `Delivered`：脱挂期间交入的输入没有提示，也没人读到 |
| `negative-submit-reserves.cfg` | `submit-reserves`：没有活驱动时，交入像 `invoke` 一样预占执行槽 | 违反 `DrainedHonest` |

## 模型与代码的对应

| 模型 | 代码 |
| --- | --- |
| `Submit(i)` | `packages/agent/agent/src/submit.ts`：不碰执行槽；受理后给在跑的驱动一个提示（`provider.ts` 的驱动） |
| `Read` | 驱动每次进入等待时重读执行（`loop/wait.ts` 的 `waitForExecutionChange`，修订号变了就醒）；睡着时提示中止等待 |
| `Take` | 协调器的 I0：取水位线以内的输入 |
| `Detach`、`Drain` | `provider.ts` 的 `askHandover` 与 `drainStep` |
| `Resume` | `provider.ts` 的 `resume`：新协调器从执行记录读起 |
| `Stop`、`Start` | 进程退出与重启；会话的恢复扫描接回执行 |

## 复跑

在本目录用 TLC 逐份配置运行，预期写在 [expect.txt](expect.txt)：

```sh
java -cp "$TLA2TOOLS_JAR" tlc2.TLC -config positive.cfg InputHandoverQuiesce.tla
```

运行记录见 [formal-runs.md](../formal-runs.md#input-handover)。

## 未覆盖

- 接管（挂接仍活着时换代）。
- 会话侧交入的退避与扫描周期：模型只用公平性说「终究会再交」，不说多久。重启后补交的实际延迟由线卡 #1216 的 A7 在发行树上量。

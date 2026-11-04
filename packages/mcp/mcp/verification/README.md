# verification

本目录承载连接表生命周期的性质证据：TLA+ 模型、模型与实现之间的映射、运行命令与证据状态。性质 P1–P8 的定理陈述归 [SPEC.md「性质与证据」](../SPEC.md#properties)，本页不重复定理。对真实实现的有界穷举探索器在 [tests/model/](../tests/model/lifecycle.spec.ts)，它是本页第二种证据。

## 两种证据与各自范围

| 证据            | 是什么                                                                                                               | 能支持的结论                                                     | 不能支持的结论                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| TLA+ 模型与 TLC | [models/ConnectionTable.tla](models/ConnectionTable.tla)：1160e92c8 连接表的行为模型。TLC 穷举每个配置的全部可达状态 | 在配置的上限内，模型满足或违反所列性质                           | 实现符合模型、上限之外的规模、模型省略的部分         |
| 有界穷举探索器  | `tests/model/`：驱动真实的 `createConnectionTable`，端口是可编程替身。宽度优先枚举上限内的全部调度                   | 在场景的上限内，1160e92c8 的源码在所列可观察投影上满足或违反性质 | 真实传输、进程与存储，上限之外的调度，投影之外的状态 |

两种证据之间没有精化证明。对应关系由下面的映射与两边反例轨迹的逐条对照支持。

## 动作映射

一次事件循环的一轮是一个外部动作，之后的内部步一直运行到没有纤程可运行。模型把这叫 `Quiescent`。探索器在每次选择之后等一次 `setImmediate`，于是全部 promise 反应运行完，Node 也报告完未处理的拒绝。

| 模型动作（ConnectionTable.tla）                                                                                   | 探索器的调度选择（`tests/model/explore.ts`） | 实现（`src/internal/`）                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `EnsureCall(k)`                                                                                                   | `ensure A`                                   | `table.ts` `ensure` 的同步部分，含建临界区时限的 `AbortSignal.timeout` 与 `turns.inTurn`                                       |
| `TurnNext(k)`，`EnsureStep` 的 `begin`、`readW`、`loop`、`blockedW`、`joinedW`                                    | 选择之后的 `drain()`                         | `table.ts` `begin`、`readAgain`、`blockingOf`、`reuseOf`、`entryOf`；`turns.ts`                                                |
| `BuildStep` 的 `pretear` 至 `discW`，`failLose`、`failTearW`、`markW`，`shut`、`shutTearW`，`catch`、`catchTearW` | `drain()`                                    | `build.ts` `build`、`acquireCredential`、`materialOf`、`negotiate`、`failed`、`markLost`、`markCatalog`、`shutDown` 与 `catch` |
| `TearStep` 的 `tclose` 至 `trelW`                                                                                 | `drain()`                                    | `teardown.ts` `teardown`、`closeOrder`、`closeTransport`、`stopProcesses`、`stopOne`、`releaseHeld`                            |
| `CloseStep` 与 `Forget`                                                                                           | `drain()`                                    | `table.ts` `closeEntry`、`forget`；`entry.ts` `forgettable`                                                                    |
| `LateStep`（`relLate`、`closeLate`、`landLate`）与 `ReleaseLandingVoid`                                           | 迟到答复之后的 `drain()`                     | `late.ts` `releaseLate`、`closeLate`、`landLate`；`build.ts` 关停后的 `void releaseLanding`                                    |
| `Release(k)`                                                                                                      | `release A`                                  | `table.ts` `close`                                                                                                             |
| `CloseAll`（含 `AbandonAll`、`CloseEach`）                                                                        | `closeAll`                                   | `table.ts` `closeAll`；`teardown.ts` `abandonLandings`、`releaseLanding`                                                       |
| `Lose(o)`                                                                                                         | `lose eA1`                                   | `table.ts` `lose`；`build.ts` `markLost`                                                                                       |
| `Fire`                                                                                                            | `fire T(...)`：最早的时限到期                | `ensure` 或 `build` 的 `AbortSignal.timeout` 到期；`abort.ts` `untilAborted`                                                   |
| `Answer(c, a)`                                                                                                    | `answer <端口>:<对象> <答复>`                | 端口 promise 兑现或 reject；`abort.ts` `answerOf`、`untilAborted` 读取它                                                       |
| `CallOutcomes` 的抛出分支                                                                                         | 一步里第几次调用同步抛出（`Step.throws`）    | 端口方法在被调用时抛出                                                                                                         |

## 状态映射

| 模型变量                                       | 探索器观察                                                                                                                    | 实现                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `ents[e]`（`st`、`gen`）                       | `table.stateOf`、`table.current`                                                                                              | `Entry.connection`      |
| `ents[e]`（`tr`、`pr`、`cr`、`ling`、`lands`） | 替身账本：每个传输的 `close()` 次数、每个进程的 `stop()` 次数与最后答复、每个句柄的 `release()` 次数；`stateOf` 的 `residual` | `Entry` 的五项资源      |
| `tbl`、`deleted`                               | 不可直接观察，由 P2 的可观察形式间接观察                                                                                      | `table.ts` 的 `entries` |
| `calls`                                        | 待决的 `ScriptedPortCall`                                                                                                     | 端口返回的 promise      |
| `timers`、`fired`                              | 探索器的时限队列（先建先到期）                                                                                                | `AbortSignal.timeout`   |
| `fib` 中的客户调用                             | 操作的状态：等待、答复、reject                                                                                                | 调用方持有的 promise    |
| `bad.unhandled`                                | `process.on('unhandledRejection')`                                                                                            | Node 的未处理拒绝       |

两边的端口失败模型一一对应：答复、失败、reject、`unconfirmed`、同步抛出、挂起（永不选择答复）、迟到（先选 `fire` 再选答复）。

模型的抽象：

- 一次内部步是一个异步函数在两个 `await` 之间的同步部分。同一个键的纤程的内部步以任意次序交错，是微任务先进先出次序的超集。不同键的纤程不共享条目、轮次与资源，所以它们的内部步按键的固定次序运行（偏序约简）。
- 两个键的配置不触发时限，迟到路径只在一个键的配置里检查。
- 只建 stdio 与进程凭据，一个采用修订，一个对端账号。不建 HTTP、`degraded` 与 `settle`、资格、清单与发布、存储写入、关闭报告的范围值。

探索器的近似：

- 状态按投影去重：消费者可见的表、待决调用及其调用点（`src/` 的函数栈）、时限、账本与预算。投影不含 promise 的续体。用例「the projection」在 `throws` 场景上核对去重与不去重找到同一组违例及其最短深度。这项核对能检出粗化到只剩操作与预算的投影，检不出去掉待决调用这一项的投影：在 `throws` 场景里，两者找到同一组违例。
- 每次重放都核对路径与上一状态的投影。1160e92c8 上没有一次偏离，所以在这些调度下实现是确定的。

## 运行命令

在仓库根运行：

```sh
pnpm turbo run build typecheck test --filter=@omne-harness/mcp
node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py
```

第一条运行成员全部用例，含探索器的快层与慢层。只跑探索器时，在成员目录运行 `NO_COLOR=1 pnpm exec vitest run --mode fast tests/model/lifecycle.spec.ts`，慢层用 `--mode slow`。第二条运行 TLC 的全部配置，判读规则与配置表见 [models/README.md](models/README.md)。

## 证据状态

状态的词按 `docs/verification.md`「分别表述这六种状态」。每种状态对每条性质的结论在 [SPEC.md「性质与证据」](../SPEC.md#properties)。本节记录范围与运行。

探索器（1160e92c8 源码，Node v26.12.0，vitest 4.1.11）。运行时机器另有其他会话的负载（load average 约 10–16），耗时只作参考：

| 场景                                               | 上限                                                         | 偏离与预算                           | 状态数 | 重放数 | 最深调度                         | 耗时    | 层         |
| -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ | ------ | ------ | -------------------------------- | ------- | ---------- |
| `rebuild`                                          | 1 个键；2 次 `ensure`；`closeAll`                            | 无（端口可挂起、迟到）               | 3291   | 8705   | 23                               | 17.6 s  | 快         |
| `faults`                                           | 1 个键；`ensure`、`release`、`lose`、`closeAll` 各 1 次      | 失败、reject、`unconfirmed`，共 1 次 | 3028   | 7888   | 15                               | 9.7 s   | 快         |
| `throws`                                           | 1 个键；`ensure`、`closeAll` 各 1 次                         | 同步抛出，共 1 次                    | 307    | 608    | 12                               | 0.4 s   | 快         |
| `throws`，不去重                                   | 同上                                                         | 同上                                 | 5669   | 5669   | 13                               | 7.2 s   | 快         |
| `wide`                                             | 1 个键；2 次 `ensure`；`release`、`lose`、`closeAll` 各 1 次 | 无                                   | 37466  | 106132 | 26                               | 252.0 s | 慢         |
| `two-keys`                                         | 2 个租户、一个持有；各 1 次 `ensure`                         | 无                                   | 13501  | 36739  | 22                               | 104.4 s | 慢         |
| `wide-faults`（只为本记录运行，深度上限 10）       | 同 `wide`                                                    | 全部四种，共 1 次                    | 17852  | 42604  | 10（上限处 6939 个状态推到静止） | 48.8 s  | 不在用例中 |
| `two-keys-shutdown`（只为本记录运行，深度上限 10） | 2 个租户；各 1 次 `ensure`；`closeAll`                       | 同步抛出，共 1 次                    | 13788  | 27386  | 10（上限处 5726 个状态推到静止） | 34.0 s  | 不在用例中 |

「状态数」是去重后的投影数，「重放数」是从头重放的调度数。每个场景找到的违例都属于已知反例 B1、N2、N3、P2、N1，没有新的违例，也没有一次重放偏离。带深度上限的场景在上限处把状态推到静止（全部时限到期，再按契约答复全部端口，再 `closeAll`），并在途中核对。

TLC 的配置、上限与结果见 [models/README.md](models/README.md#运行记录)。

## 已知反例的最小轨迹

下表的「探索器」列是 `throws`、`rebuild` 与 `faults` 场景的最短调度，按步列出。`⇒` 后面是这一步里同步抛出的端口调用及其调用点。「TLC」列是对应 `cex-*` 或 `probe-*` 配置的反例，只列外部动作与同步抛出。

| 反例    | 性质   | 探索器的最短调度                                                                                                                                                                                                                                                                                                                                                             | TLC 的反例                                                                                                                                                                             |
| ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1      | P7     | `ensure A` → `answer adoption.endpoint:A ok` → `fire T(eA1)` → `answer credentials.acquire:A ok` → `fire T(bA1)`（落点超时，句柄随落点走，建连收场等存储） → `closeAll` ⇒ `credential.release hA1` 在 `releaseLanding < abandonLandings < closeAll` 抛出。`closeAll` 在等条目关闭，`abandoned` 没有处理器，成为未处理的拒绝                                                  | `cex-b1`：ensure、answer adoption ok、answer acquire ok、fire、fire、closeAll ⇒ throw release                                                                                          |
| N2      | P7     | `ensure A` → `answer adoption.endpoint:A ok` → `fire T(eA1)` → `fire T(bA1)` → `answer credentials.acquire:A ok`（迟到）⇒ `credential.release hA1` 在 `late.ts` 的 `releaseLate` 里抛出，成为未处理的拒绝                                                                                                                                                                    | `cex-n2`：ensure、answer adoption ok、fire、answer acquire ok、closeAll、fire ⇒ throw release（关停之后才超时的落点，`materialOf` 的 `void releaseLanding`）。两条都是 N2 的四条链之一 |
| N3      | P1     | `ensure A` → `answer adoption.endpoint:A ok` → `closeAll` → `answer credentials.acquire:A ok` ⇒ `credential.release hA1` 在 `releaseHeld < closeOrder < shutDown < build` 抛出。建连的 `catch` 再拆除一次，`hA1.release()` 被调用两次                                                                                                                                        | `cex-n3`：ensure、answer adoption ok、closeAll、answer acquire ok ⇒ throw release                                                                                                      |
| N3      | P1、P3 | `ensure A` → `answer adoption.endpoint:A ok` → `fire T(eA1)` → `answer credentials.acquire:A ok` → `answer landing.start:A ok` → `closeAll` → `answer transports.open:pA1 ok` → `answer transport.discover:tA1 ok` ⇒ `transport.close tA1` 在 `closeTransport < closeOrder < teardown < closeEntry < closeAll` 抛出 → `fire T(bA1)`。静止后 `hA1` 未释放，`pA1` 未被要求停止 | `cex-n3-shutdown`：ensure、answer adoption ok、answer acquire ok、answer start ok、answer open ok、answer discover ok、closeAll ⇒ throw close                                          |
| P2      | P8 T2  | `ensure A` → `answer adoption.endpoint:A ok` → `closeAll` → `fire T(eA1)` → `answer credentials.acquire:A ok`（关停，按准备失败拆除） → `fire T(bA1)`。全部时限已到期，`eA1` 仍等 `credential.release hA1`                                                                                                                                                                   | `cex-p2`：ensure、answer adoption ok、fire、closeAll、answer acquire ok、fire                                                                                                          |
| N1      | P8 T2  | `ensure A` → `answer adoption.endpoint:A ok` → `fire T(eA1)` → `fire T(bA1)`（取凭据超时，失败收场标记清单）。全部时限已到期，`eA1` 仍等 `store.read`                                                                                                                                                                                                                        | `cex-n1`：ensure、answer adoption ok、fire、fire                                                                                                                                       |
| A1 见证 | P8 A1  | `ensure A` → `answer adoption.endpoint:A ok` → `release A` → `fire T(eA1)` → `fire T(bA1)`。全部时限已到期，`rA1` 仍等在途建连的收场                                                                                                                                                                                                                                         | `probe-a1`：ensure、answer adoption ok、release A、fire、fire                                                                                                                          |

两边的调度可以差一个时限到期与一次答复的次序，或差一个关停，但属于同一个反例。N1、N3、A1 两边的调度相同。B1 与 P2 两边只差一次答复与一个时限到期的先后。N2 两边是四条链中不同的两条。

## 探索器能变红

每个变异只改一处源码，在快层上运行 `tests/model/lifecycle.spec.ts`，然后按字节还原源码并重建 `dist`。

| 变异（文件与位置）                                                                                                                                               | 变红的用例                                                                                 | 探索器给出的最短反例                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1：`src/internal/teardown.ts` `closeTransport`，`await answerOf(transport.close(), undefined)` 改为 `await transport.close()`（去掉拆除第一步对 reject 的吸收） | `faults` 的「explains every violation」与「P1–P7 hold」                                    | P2 可观察形式：`ensure A` → `answer adoption.endpoint:A ok` → `release A` → 答复取凭据、落点、打开、`discover` → `answer transport.close:tA1 reject`。之后 A 报 `none`，仍持有 `hA1`、`pA1`。另有 P1（`hA1` 从未释放）、P3（`pA1` 从未被要求停止）   |
| M2：`src/internal/entry.ts` `forgettable`，去掉 `state.kind === 'closed'`                                                                                        | `rebuild` 与 `faults` 的「explains every violation」与「P1–P7 hold」                       | `rebuild`：第一次建连的落点超时，第二次建连取凭据期间迟到的落点答复，`afterLanding` 把正在准备的条目遗忘。之后第二条连接的 `hA2`、`pA2`、`tA1` 无人收口（P1、P2、P3）。`faults`：迟到落点的答复把 `lost` 的条目遗忘，状态从 `lost` 变成 `none`（P6） |
| M3：`src/internal/table.ts` `closeAll`，去掉 `shut = true`                                                                                                       | `rebuild`、`faults`、`throws` 的「explains every violation」，及各自的 P1–P7 或 P4–P6 用例 | P4：`ensure A` → `closeAll` → `answer adoption.endpoint:A ok` → `answer credentials.acquire:A ok`，随后调用 `landing.start`                                                                                                                          |
| M4：`src/internal/late.ts` `landLate`，去掉对迟到进程的 `stopOne`                                                                                                | `rebuild`、`faults` 的两个用例与 `throws` 的「explains every violation」                   | P3：`ensure A` → `answer adoption.endpoint:A ok` → `fire T(eA1)` → `answer credentials.acquire:A ok` → `closeAll` → `fire T(bA1)` → `answer landing.start:A ok`（迟到）→ `answer store.read:A ok`。`closeAll` 答复时 `pA1` 从未被要求停止            |

每个变异的退出码都是 1。还原后源码与基线逐字节相同，`dist` 已重建。原始输出留任务 `tmp/`。

TLC 的三个负控与 M1、M2、M3 同义：`bad-no-absorb-close`、`bad-forget-open`、`bad-no-shut`，见 [models/README.md](models/README.md)。

## 未覆盖

- 真实传输、真实进程、真实对端与耐久存储：真实组合未验证。
- HTTP 端点、`degraded` 与 `settle`、换采用修订（不变式 6）、资格、`refresh` 的发布：两种证据都不覆盖，由既有用例承担。
- 上限之外的调度：例如一个键 3 次 `ensure`，或两种偏离同时出现。
- 模型与实现之间没有精化证明。

## 维护

修改连接表的源码、端口替身或性质时，同步更新 [ConnectionTable.tla](models/ConnectionTable.tla)、`tests/model/` 与本页的映射，再重跑两种证据。修复一个已知反例后，把它的预期失败用例改成通过用例，把对应的 `cex-*` 配置改成正控，并更新 SPEC.md「性质与证据」的状态。单次运行的原始输出留任务 `tmp/`，不进本目录。

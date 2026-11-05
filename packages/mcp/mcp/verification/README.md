# verification

本目录承载连接表生命周期的性质证据：TLA+ 模型、模型与实现之间的映射、运行命令与证据状态。性质 P1–P8 的定理陈述归 [SPEC.md「性质与证据」](../SPEC.md#properties)，本页不重复定理。对真实实现的有界穷举探索器在 [tests/model/](../tests/model/lifecycle.spec.ts)，它是本页第二种证据。

## 两种证据与各自范围

| 证据            | 是什么                                                                                                     | 能支持的结论                                               | 不能支持的结论                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| TLA+ 模型与 TLC | [models/ConnectionTable.tla](models/ConnectionTable.tla)：连接表的行为模型。TLC 穷举每个配置的全部可达状态 | 在配置的上限内，模型满足或违反所列性质                     | 实现符合模型、上限之外的规模、模型省略的部分         |
| 有界穷举探索器  | `tests/model/`：驱动真实的 `createConnectionTable`，端口是可编程替身。宽度优先枚举上限内的全部调度         | 在场景的上限内，本包的源码在所列可观察投影上满足或违反性质 | 真实传输、进程与存储，上限之外的调度，投影之外的状态 |

两种证据之间没有精化证明。对应关系由下面的映射，以及两边对同一类缺陷给出的反例的对照支持。

## 动作映射

一次事件循环的一轮是一个外部动作，之后的内部步一直运行到没有纤程可运行。模型把这叫 `Quiescent`。探索器在每次选择之后等一次 `setImmediate`，于是全部 promise 反应运行完，Node 也报告完未处理的拒绝。

| 模型动作（ConnectionTable.tla）                                                                      | 探索器的调度选择（`tests/model/explore.ts`）                               | 实现（`src/internal/`）                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EnsureCall(k)`                                                                                      | `ensure A`                                                                 | `table.ts` `ensure` 的同步部分，含经时限来源 `startBound` 建临界区时限与 `turns.inTurn`                                                                                                      |
| `TurnNext(k)`，`EnsureStep` 的 `begin`、`readW`、`loop`、`blockedW`、`joinedW`                       | 选择之后的 `drain()`                                                       | `table.ts` `begin`、`readAgain`、`blockingOf`、`reuseOf`、`entryOf`；`turns.ts`；`port.ts` `within`                                                                                          |
| `BuildStep` 的 `attempt` 至 `discW`，`failLose`、`failW`，`shut`、`shutTearW`，`catch`、`catchTearW` | `drain()`                                                                  | `build.ts` `build`、`acquireCredential`、`materialOf`、`negotiate`、`failed`、`shutDown` 与 `catch`；`entry.ts` `handOverToLanding`、`takeBackFromLanding`；`port.ts` `ask`、`within`        |
| `MarkStep`                                                                                           | `drain()`                                                                  | `build.ts` `markLost`、`markCatalog`                                                                                                                                                         |
| `TearStep` 的 `tclose` 至 `trelW`                                                                    | `drain()`                                                                  | `teardown.ts` `teardown`、`closeOrder`、`closeTransport`、`stopProcesses`、`stopOne`、`releaseHeld`                                                                                          |
| `CloseStep` 与 `Forget`                                                                              | `drain()`                                                                  | `table.ts` `closeEntry`、`forget`；`entry.ts` `forgettable`                                                                                                                                  |
| `LateStep`（`relLate`、`closeLate`、`landLate`）与 `ReleaseLandingVoid`                              | 迟到答复之后的 `drain()`                                                   | `late.ts` `releaseArrived`、`closeArrived`、`landArrived`；`build.ts` `landingOutlived`，关停之后的 `releaseLanding`                                                                         |
| `Release(k)`                                                                                         | `release A`                                                                | `table.ts` `close`                                                                                                                                                                           |
| `CloseAll`（含 `AbandonAll`、`CloseEach`）                                                           | `closeAll`                                                                 | `table.ts` `closeAll`；`teardown.ts` `abandonLandings`、`releaseLanding`                                                                                                                     |
| `Lose(o)`                                                                                            | `lose eA1`                                                                 | `table.ts` `lose`；`build.ts` `markLost`                                                                                                                                                     |
| `Fire`                                                                                               | `fire T(...)`：一个时限到期。`bounds` 场景可选任何一个，其余场景只选最早的 | `startBound` 给出的时限到期。模型的 `Fire` 只有临界区与建连两种时限；探索器另有加入时限；取页时限模型与探索器都不建。`port.ts` `within` 不再等，`onExpiry` 取得收口函数，工作交给 `scope.ts` |
| `Answer(c, a)`                                                                                       | `answer <端口>:<对象> <答复>`                                              | 端口 promise 兑现或 reject；`port.ts` `ask` 读取它                                                                                                                                           |
| `CallOutcomes` 的抛出分支：调用当即以 reject 答复                                                    | 一步里第几次调用同步抛出（`Step.throws`）                                  | 端口方法在被调用时抛出；`ask` 把它读成违约答复                                                                                                                                               |

## 状态映射

| 模型变量                                       | 探索器观察                                                                                                                                                  | 实现                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `ents[e]`（`st`、`gen`），`Visible`            | `table.stateOf`（去掉 `residual`）、`table.current`                                                                                                         | `Entry.connection`                         |
| `ents[e]`（`tr`、`pr`、`cr`、`ling`、`lands`） | 替身账本：每个传输的 `close()` 次数、每个进程的 `stop()` 次数与最后答复、每个句柄的 `release()` 次数与释放时携带它的进程有没有停止；`stateOf` 的 `residual` | `Entry` 的五项资源                         |
| `lands[l].landed`                              | 不可直接观察，由 P1 的 S9 次序间接观察                                                                                                                      | `Landing.landed`                           |
| `tbl`、`deleted`                               | 不可直接观察，由 P2 的可观察形式间接观察                                                                                                                    | `table.ts` 的 `entries`                    |
| `calls`（含 `lateBorn`）                       | 待决的 `ScriptedPortCall`，以及它是不是在处理迟到答复时发起的                                                                                               | 端口返回的 promise                         |
| `timers`、`fired`                              | 探索器注入的时限：每个时限记下它属于哪一次调用。`bounds` 场景任意次序到期，其余场景先建先到期                                                               | 时限来源 `startBound` 给出的 `AbortSignal` |
| `fib` 中的客户调用                             | 操作的状态：等待、答复、reject                                                                                                                              | 调用方持有的 promise                       |
| `lateTurn`、`seen`                             | 迟到答复前后两次 `observe()`                                                                                                                                | 无（只为 P6）                              |
| `bad`                                          | `process.on('unhandledRejection')`、操作的 reject 与账本的违例记录                                                                                          | Node 的未处理拒绝等                        |

两边的端口失败模型一一对应：答复、失败、reject、`unconfirmed`、同步抛出、挂起（永不选择答复）、迟到（先选 `fire` 再选答复）。

模型的抽象：

- 一次内部步是一个异步函数在两个 `await` 之间的同步部分。同一个键的纤程的内部步以任意次序交错，是微任务先进先出次序的超集。不同键的纤程不共享条目、轮次与资源，所以它们的内部步按键的固定次序运行（偏序约简）。
- 一次受时限的等待，在工作已结束且时限已到期时两种结局都探索（实现在时限已到期时直接答 `expired`）。
- 时限的上界相同，先建先到期。模型里排队的调用在队里不看自己的时限，加入的调用不另起自己的时限。模型检查的 P8 T2 是全局形式：全部时限都到期之后，没有 `ensure` 还在等。这两处省略不影响全局形式，因为全部时限到期时，它们所等的调用也已答复。逐个 `ensure` 的形式（自己的时限都到期就答复；正在等而一个自己的时限都没起，也算违例）只由探索器检查：每个场景都检查，`bounds` 场景另让上界不同的时限以任意次序到期。
- 键是抽象的：模型不建键怎样从租户、修订与对端账号推导。两个键的配置不触发时限，迟到路径只在一个键的配置里检查。
- 只建 stdio 与进程凭据，一个采用修订，一个对端账号。不建 HTTP、`degraded` 与 `settle`、资格、清单与发布、存储写入、关闭报告的范围值。

探索器的近似：

- 状态按投影去重：消费者可见的表、待决调用及其调用点（`src/` 的函数栈）与是否迟到、时限、账本与预算。投影不含 promise 的续体。用例「the projection」在 `throws` 场景上核对去重与不去重找到同一组违例及其最短深度。
- 每次重放都核对路径与上一状态的投影。本次运行没有一次偏离，所以在这些调度下实现是确定的。
- 每个键有自己的采用视图，所以几个键的采用修订相同：`two-keys` 的两个键只差租户，`two-accounts` 的两个键只差对端账号。只差对端账号时，两个键的 `stateOf` 是同一个（同租户同持有），所以 P2 的可观察形式在两个键都为 `none` 时才检查。

## 运行命令

在仓库根运行：

```sh
pnpm turbo run build typecheck test --filter=@omne-harness/mcp
node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py
```

第一条运行成员全部用例，含探索器的快层与慢层。只跑探索器时，在成员目录运行 `NO_COLOR=1 pnpm exec vitest run --mode fast tests/model/lifecycle.spec.ts`，慢层用 `--mode slow --typecheck.enabled=false`。第二条运行 TLC 的全部配置，判读规则与配置表见 [models/README.md](models/README.md)。

## 证据状态

状态的词按 `docs/verification.md`「分别表述这六种状态」。每种状态对每条性质的结论在 [SPEC.md「性质与证据」](../SPEC.md#properties)。本节记录范围与运行。

探索器（Node v26.12.0，2026-11-05，单线程；同一时段本机另有变异运行，耗时偏长）：

| 场景             | 上限                                                         | 偏离与预算                           | 状态数 | 重放数 | 最深调度 | 耗时    | 层  |
| ---------------- | ------------------------------------------------------------ | ------------------------------------ | ------ | ------ | -------- | ------- | --- |
| `rebuild`        | 1 个键；2 次 `ensure`；`closeAll`                            | 无（端口可挂起、迟到）               | 6128   | 18708  | 23       | 15.0 s  | 快  |
| `bounds`         | 同 `rebuild`；时限以任意次序到期                             | 无（端口可挂起、迟到）               | 17735  | 71810  | 23       | 50.8 s  | 慢  |
| `faults`         | 1 个键；`ensure`、`release`、`lose`、`closeAll` 各 1 次      | 失败、reject、`unconfirmed`，共 1 次 | 3146   | 8388   | 15       | 3.9 s   | 快  |
| `throws`         | 1 个键；`ensure`、`closeAll` 各 1 次                         | 同步抛出，共 1 次                    | 360    | 754    | 12       | 0.3 s   | 快  |
| `throws`，不去重 | 同上                                                         | 同上                                 | 6401   | 6401   | 13       | 3.4 s   | 快  |
| `wide`           | 1 个键；2 次 `ensure`；`release`、`lose`、`closeAll` 各 1 次 | 无                                   | 60950  | 194223 | 26       | 158.1 s | 慢  |
| `two-keys`       | 2 个只差租户的键；各 1 次 `ensure`                           | 无                                   | 13501  | 36739  | 22       | 34.8 s  | 慢  |
| `two-accounts`   | 2 个只差对端账号的键；各 1 次 `ensure`                       | 无                                   | 11027  | 29847  | 23       | 27.8 s  | 慢  |

「状态数」是去重后的投影数，「重放数」是从头重放的调度数。每个场景都没有违例，也没有一次重放偏离。有 `closeAll` 或 `release` 的场景都找到反定理 P8 A1 的见证（全部时限到期后关闭仍等挂起的端口）。

TLC 的配置、上限与结果见 [models/README.md](models/README.md#运行记录)。

## 两种证据能变红

除 P8 T1 外，每条性质至少在一边有能使它变红的缺陷；P8 T1 只有反定理的探针。模型一边是负控配置：在模型里放进一处缺陷，TLC 给出违反所列不变式的轨迹（[models/README.md](models/README.md#运行记录)）。P1、P2、P4、P6 与 P8 T2 有负控，P3、P5、P7 没有。探索器一边是源码变异：每个变异在源码里放进一处缺陷，运行所列用例与探索器的场景，然后按字节还原源码。

| 变异 | 源码                   | 缺陷                                             | 变红的用例                                      | 探索器报的性质               |
| ---- | ---------------------- | ------------------------------------------------ | ----------------------------------------------- | ---------------------------- |
| M1   | `internal/teardown.ts` | 关闭传输不经 `ask`                               | `teardown.spec.ts` 5 条                         | P1、P2、P3、P7               |
| M2   | `internal/entry.ts`    | 条目没关闭也能忘记                               | `entry.spec.ts` 1 条                            | P2、P3、P6                   |
| M3   | `internal/table.ts`    | `closeAll` 不记下关停                            | `shutdown.spec.ts` 5 条                         | P2、P3、P4                   |
| M4   | `internal/late.ts`     | 迟到的进程不停止                                 | `races.spec.ts` 3 条                            | P1、P2、P3                   |
| M5   | `internal/port.ts`     | `ask` 不吸收同步抛出                             | `port.spec.ts` 1 条，`port-breach.spec.ts` 3 条 | P1、P2、P3、P7               |
| M6   | `internal/build.ts`    | 建连失败后的收场不受时限                         | `ensure.spec.ts` 1 条                           | P8 T2                        |
| M7   | `internal/teardown.ts` | 关停也释放已交出进程的落点的句柄                 | `shutdown.spec.ts` 1 条                         | P1                           |
| M8   | `internal/build.ts`    | 协商成立后不再核关停                             | `shutdown.spec.ts` 1 条                         | P4                           |
| M9   | `internal/text.ts`     | 键的文本漏掉租户                                 | `ensure.spec.ts` 1 条                           | P5（慢层 `two-keys`）        |
| M10  | `internal/text.ts`     | 键的文本漏掉对端账号                             | `ensure.spec.ts` 1 条                           | P5（慢层 `two-accounts`）    |
| M12  | `internal/gate.ts`     | 读采用不经 `ask`                                 | `port-breach.spec.ts` 3 条                      | 未运行                       |
| M13  | `internal/table.ts`    | 临界区内重读采用不受时限                         | `races.spec.ts` 1 条                            | 未运行                       |
| M14  | `internal/table.ts`    | 等前一次拆除不受时限                             | `races.spec.ts` 2 条                            | 未运行                       |
| M15  | `internal/build.ts`    | 等落点不受时限                                   | `races.spec.ts` 5 条                            | 未运行                       |
| M16  | `internal/table.ts`    | 排队等临界区不受时限                             | `races.spec.ts` 1 条                            | P8 T2（`bounds`）            |
| M17  | `internal/table.ts`    | 加入的调用不受自己的时限                         | `races.spec.ts` 1 条                            | P8 T2（`rebuild`、`bounds`） |
| M18  | `internal/table.ts`    | 轮到时时限已到的调用仍读采用、建连               | `races.spec.ts` 1 条                            | 无                           |
| M19  | `internal/build.ts`    | 关停开始之后失败的建连仍标记清单                 | `shutdown.spec.ts` 1 条                         | 无                           |
| M20  | `internal/build.ts`    | 落点到时限才交给条目                             | `shutdown.spec.ts` 1 条                         | 无                           |
| M21  | `internal/build.ts`    | 标记的本包计算放在 `ask` 的闭包里                | `ensure.spec.ts` 1 条                           | 无                           |
| M22  | `internal/scope.ts`    | 作用域关闭之后的错误不交事后出口                 | `port.spec.ts` 1 条，`shutdown.spec.ts` 1 条    | 无                           |
| M23  | `internal/scope.ts`    | 作用域关闭时丢掉已记下的错误                     | `port.spec.ts` 2 条，`shutdown.spec.ts` 1 条    | 无                           |
| M24  | `internal/table.ts`    | 加入方到期的答复不是 `connect` 阶段              | `races.spec.ts` 1 条                            | 未运行                       |
| M25  | `discovery.ts`         | 取页时限的种类不是 `listing`                     | `races.spec.ts` 1 条                            | 未运行                       |
| M26  | `internal/table.ts`    | 排队到期的答复不是 `settings` 阶段               | `races.spec.ts` 5 条                            | 未运行                       |
| M27  | `internal/table.ts`    | 临界区时限到轮到时才起，排队的调用没有自己的时限 | `races.spec.ts` 2 条                            | P8 T2（`rebuild`）           |
| M28  | `internal/table.ts`    | 加入方把建连抛出的本包错误读成 `pending`         | `ensure.spec.ts` 1 条                           | 未运行                       |

27 个变异都有所列用例变红。编号里没有 M11。M12 到 M15 与 M24、M25、M26、M28 只运行了所列用例，没有运行探索器，所以性质一列写「未运行」。M27 只在 `rebuild` 场景上运行了探索器：正在等而一个自己的时限都没起的 `ensure` 算 P8 T2 违例，所以探索器报出它。M16、M17 在三个快场景 `rebuild`、`faults`、`throws` 与慢场景 `bounds` 上运行了探索器。M16 只在 `bounds` 场景变红：时限先建先到期时，占着临界区的调用的时限总是先到，排队的调用总在自己的时限之前轮到。M17 在 `rebuild` 场景也变红：加入的调用的临界区时限早于建连时限建立，所以先到期。M18 到 M23 在 `bounds`、`faults`、`throws` 三个场景上运行了探索器，都没有违例：多发一次端口调用、多写一次标记、晚一些释放句柄与本包错误的去向不违反 P1–P8 的可检查形式，探索器也不注入本包的错误。它们只由所列用例守住。每个变异的运行日志留在任务 `tmp/`，不进本目录。

TLC 负控与变异的对应：`bad-no-absorb-close` 与 M1，`bad-forget-open`、`bad-forget-open-late` 与 M2，`bad-no-shut` 与 M3，`bad-abandon-landed` 与 M7，`bad-unbounded-wrap` 与 M6，`bad-ok-after-shut` 与 M8。M5（`ask` 不吸收同步抛出）在模型里没有负控：模型按 `ask` 把抛出写成答复。M9、M10 在模型里没有负控：模型的键是抽象的。

## 未覆盖

- 真实传输、真实进程、真实对端与耐久存储：真实组合未验证。
- HTTP 端点、`degraded` 与 `settle`、换采用修订（不变式 6）、资格、`refresh` 的发布：两种证据都不覆盖，由既有用例承担。
- 上限之外的调度：例如一个键 3 次 `ensure`，或两种偏离同时出现。
- 模型与实现之间没有精化证明。

## 维护

修改连接表的源码、端口替身或性质时，同步更新 [ConnectionTable.tla](models/ConnectionTable.tla)、`tests/model/` 与本页的映射，再重跑两种证据。新加一条性质时，同时在模型里加一个负控、在探索器上做一个变异，证明两边都能变红。单次运行的原始输出留任务 `tmp/`，不进本目录。

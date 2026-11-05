# verification

本目录承载连接表生命周期与调用口的性质证据：TLA+ 模型、模型与实现之间的映射、运行命令与证据状态。性质 P1–P14 的定理陈述归 [SPEC.md「性质与证据」](../SPEC.md#properties)，本页不重复定理。对真实实现的有界穷举探索器在 [tests/model/](../tests/model/lifecycle.spec.ts)（生命周期场景）与 [tests/model/calls.spec.ts](../tests/model/calls.spec.ts)（调用口场景），它是本页第二种证据。

## 两种证据与各自范围

| 证据            | 是什么                                                                                                                                                                             | 能支持的结论                                               | 不能支持的结论                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| TLA+ 模型与 TLC | [models/ConnectionTable.tla](models/ConnectionTable.tla)：连接表的行为模型；[models/Calls.tla](models/Calls.tla)：调用口的行为模型，连接表只剩抽象。TLC 穷举每个配置的全部可达状态 | 在配置的上限内，模型满足或违反所列性质                     | 实现符合模型、上限之外的规模、模型省略的部分         |
| 有界穷举探索器  | `tests/model/`：驱动真实的 `createConnectionTable`，以及同一张表上真实的 `createCalls` 与 `createTasks`，端口是可编程替身。宽度优先枚举上限内的全部调度                            | 在场景的上限内，本包的源码在所列可观察投影上满足或违反性质 | 真实传输、进程与存储，上限之外的调度，投影之外的状态 |

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

调用口的映射（`Calls.tla`）。模型里 `gate` 一个端口代表关口的采用读取、资格核对、配值与清单读取；`ensure` 一个端口代表连接表的 `ensure`，它的内部步骤归生命周期模型。探索器两边都是真实的：

| 模型动作（Calls.tla）                                              | 探索器的调度选择（`tests/model/explore.ts`）                                            | 实现                                                                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Invoke(k)`、`Continue(k)`                                         | `invoke A`、`continue A`（代际取调用开始时 `current` 的，没有时取 1）                   | `calls.ts` `createCalls` 的 `invoke`、`continueWithInput`，`perform` 的同步部分                                                 |
| `CallStep` 的 `start`                                              | 同一步的 `drain()`                                                                      | `perform`：`isActionArgs`、`inFlight.reserve`、`stopOf`、`AbortSignal.any`                                                      |
| `Ask gate`、`gateW`                                                | `answer adoption.endpoint:A …`、`answer eligibility.check:A …`、`answer store.read:A …` | `guard.ts` `admitForUse`、`gate.ts` `admit`；`settings.ts` `prepareSettings`；`calls.ts` `knownActionOf`                        |
| `Ask ensure`、`ensW`（`ok` 使连接可用，`fail` 拒绝）               | 连接表的全部端口与时限，同生命周期的映射                                                | `calls.ts` `perform` 里 `within(table.ensure(…), request.signal, scope)`；`table.ts` `ensure`                                   |
| `AfterEnsure`：继续的代际核对、停止信号核对                        | `drain()`                                                                               | `perform` 的第 6、7、9 步（MC-16）                                                                                              |
| `Ask call`、`callW`（`ok` 发出、`fail` 是 `not-sent`、`reject`）   | `answer transport.call:tA1 ok                                                           | fail                                                                                                                            | reject`，或它同步抛出                                                      | `calls.ts` `sendOn`：`ask(() => transport.call(…))`、T5 的 `cancelled`、`lose`、`inFlight.release`                 |
| `MarkSent`                                                         | `drain()`，在途表计数视图记下 `markSent` 的答复                                         | `in-flight.ts` `markSent`；`calls.ts` `abandon`                                                                                 |
| `Ask answer`、`ansW`（`ok` 结局、`fail` 是 `no-answer`、`reject`） | `answer transport.answer:r1 ok                                                          | fail                                                                                                                            | reject`：对端对请求 `r1`的应答，场景决定`ok` 是完整结果还是任务            | `sendOn`：`waitAtMost(ask(() => answer, ABANDONED), stop)`、`classifyOutcome`、`lose`、`tasks.record`、`markEnded` |
| `Abandon`、`Ask cancelReq`、`abandonW`                             | `answer transport.cancelRequest:r1 ok                                                   | reject`                                                                                                                         | `calls.ts` `abandon`：`markEnded`，`ask(() => transport.cancelRequest(…))` |
| `Cancel(k)`                                                        | `cancel A`（A 的主体用关联键 `c`）                                                      | `calls.ts` `cancel`；`in-flight.ts` `cancel`                                                                                    |
| `Abort(i)`                                                         | `abort iA1`                                                                             | 调用方 `InvokeRequest.signal` 的 `AbortController.abort()`                                                                      |
| `TaskOp(k)`、`TaskStep` 的 `lookup`                                | `task A get                                                                             | result                                                                                                                          | input                                                                      | cancel`                                                                                                            | `tasks.ts` `createTasks` 的四个操作，`request`：`tasks.get` |
| `Reusable`、`SendTask`                                             | `drain()`                                                                               | `tasks.ts` `connectionOf`：`table.currentOf(…).find(账户相同)`、`isShut`、`admit`、`prepareSettings` 的账户比较、`table.ensure` |
| `Ask task`、`taskW`、任务时限的 `Fire`                             | `answer transport.getTask:t1 …` 等四个端口，`fire T(ktA1)`                              | `tasks.ts` `request`：`ask(() => send(on))`、`startBound(bound, 'task')`、`within`、`failureOf`、`losing`                       |
| `Drop(k)`                                                          | `drop A`：丢失 A 的当前连接                                                             | `table.ts` `lose` 于 `current(key)` 的连接；模型里立即生效，实现里等拆除（P8 A1）                                               |
| `CloseAll`                                                         | `closeAll`                                                                              | `table.ts` `closeAll`；模型只置关停并清空连接                                                                                   |

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

调用口的状态映射：

| 模型变量（Calls.tla）                                                         | 探索器观察                                                                                                                 | 实现                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `conn[k]`（`st`、`gen`）                                                      | `table.current(key)` 与它的代际                                                                                            | 连接表的条目                  |
| `inflight[slot]`（`phase`、`cancelled`、`stopFired`、`gen`、`fib`）           | 在途表的计数视图：每次 `reserve`、`markSent`、`markEnded`、`release` 的调用与答复，归属于发起它的操作（`ReservationView`） | `in-flight.ts` 的 `#entries`  |
| `tasks[slot]`（`account`、`owner`）                                           | `invoke` 答 `task` 结局的键（`tasksOf`）                                                                                   | `task-table.ts` 的 `#entries` |
| `reqs[r].cancels`                                                             | 账本 `requests`：传输交出的每个请求号与它收到的 `cancelRequest` 次数                                                       | 传输                          |
| `fib[i]` 的 `aborted`、`stopEarly`、`sends`、`sentOk`、`afterShut`、`cancels` | `OpView` 的 `aborted`、`stopped`、`stoppedBeforeSend`、`sends`、`sentOk`、`afterShut`、`cancelRequests`                    | 无（只为性质）                |
| `timers`、`fired`（任务时限）                                                 | 探索器注入的时限 `T(k<op>)`，起在任务请求发出之后，附到那次请求上                                                          | `startBound(bound, 'task')`   |

两边的端口失败模型一一对应：答复、失败、reject、`unconfirmed`、同步抛出、挂起（永不选择答复）、迟到（先选 `fire` 再选答复）。

模型的抽象：

- 一次内部步是一个异步函数在两个 `await` 之间的同步部分。同一个键的纤程的内部步以任意次序交错，是微任务先进先出次序的超集。不同键的纤程不共享条目、轮次与资源，所以它们的内部步按键的固定次序运行（偏序约简）。
- 一次受时限的等待，在工作已结束且时限已到期时两种结局都探索（实现在时限已到期时直接答 `expired`）。
- 时限的上界相同，先建先到期。模型里排队的调用在队里不看自己的时限，加入的调用不另起自己的时限。模型检查的 P8 T2 是全局形式：全部时限都到期之后，没有 `ensure` 还在等。这两处省略不影响全局形式，因为全部时限到期时，它们所等的调用也已答复。逐个 `ensure` 的形式（自己的时限都到期就答复；正在等而一个自己的时限都没起，也算违例）只由探索器检查：每个场景都检查，`bounds` 场景另让上界不同的时限以任意次序到期。
- 键是抽象的：模型不建键怎样从租户、修订与对端账号推导。两个键的配置不触发时限，迟到路径只在一个键的配置里检查。
- 只建 stdio 与进程凭据，一个采用修订，一个对端账号。不建 HTTP、`degraded` 与 `settle`、资格、清单与发布、存储写入、关闭报告的范围值。

`Calls.tla` 的抽象与范围上限：

- 连接表只剩每个键的「可用、代际」与关停。`ensure` 是一个端口：`ok` 使连接可用（建连给下一个代际，复用保持代际），`fail` 是任何拒绝或时限到期，关停之后只答 `fail`。它的内部步骤、时限与五项资源归生命周期模型；两个模型之间没有组合证明。
- 关口的采用读取、资格核对、配值与清单读取合为一个端口 `gate`。`lose` 立即生效，不等拆除；`closeAll` 只置关停并清空连接。所以模型里调用从不等拆除或关闭的端口，P8 A1 的那一类等待在模型里不出现，只在探索器里出现。
- 键、租户、主体与账户是常量表，不建它们怎样推导。关联键只有一个 `c`，任务只有一个 `t1`，每个键的调用与任务操作的次数是常量。
- 所有键的纤程以任意次序交错，没有偏序约简。
- 对端对已发出请求的应答是一个端口调用；它不能同步抛出。

探索器的近似：

- 状态按投影去重：消费者可见的表、待决调用及其调用点（`src/` 的函数栈）与是否迟到、时限、账本与预算。投影不含 promise 的续体。用例「the projection」在 `throws` 场景上核对去重与不去重找到同一组违例及其最短深度。
- 每次重放都核对路径与上一状态的投影。本次运行没有一次偏离，所以在这些调度下实现是确定的。
- 每个键有自己的采用视图，所以几个键的采用修订相同：`two-keys` 的两个键只差租户，`two-accounts` 的两个键只差对端账号。只差对端账号时，两个键的 `stateOf` 是同一个（同租户同持有），所以 P2 的可观察形式在两个键都为 `none` 时才检查。
- 调用口场景里，在途表是真实的 `InFlightCalls`，经一个只计数的子类观察（`reserve`、`markSent`、`markEnded`、`release` 各自调用 `super` 后报告给运行）；任务表是真实的 `TaskTable`。P11 读这个计数视图，其余性质只读操作的答复与端口账本。
- 调用口场景的存储持有一份清单（一个动作 `read`，没有输出 schema），所以 `lose` 的标记清单会写存储：`store.write` 是一个端口。生命周期场景的存储照旧答 `absent`，它们的状态数不变。
- `transport.answer` 是对端对已发出请求的应答，在探索器答复 `transport.call ok` 的那一步建立，归属于发出它的操作。任务请求的时限在请求发出之后才建立（MC-17 的参数次序），探索器把它附到那次请求上，所以任务端口的迟到答复也受 P6 检查。
- 「新建连接的账户变了」在探索器里不可达：每个键的凭据固定。它只由 `Calls.tla` 的负控 `calls-bad-task-any-account` 在复用一路覆盖，探索器的 `task-account` 场景覆盖同一路。

## 运行命令

在仓库根运行：

```sh
pnpm turbo run build typecheck test --filter=@omne-harness/mcp
node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py
```

第一条运行成员全部用例，含探索器的快层与慢层。只跑探索器时，在成员目录运行 `NO_COLOR=1 pnpm exec vitest run --mode fast tests/model/lifecycle.spec.ts`（调用口场景是 `tests/model/calls.spec.ts`），慢层用 `--mode slow --typecheck.enabled=false`。第二条运行 TLC 的全部配置（两个模型），判读规则与配置表见 [models/README.md](models/README.md)。

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

调用口的场景（`tests/model/calls.spec.ts`，同一环境，2026-11-05）。每个场景持有一份一个动作的清单，没有 `ensure`，调用自己建连；每个场景也照常检查 P1–P8：

| 场景             | 上限                                                                                            | 偏离与预算                      | 状态数 | 重放数 | 最深调度 | 耗时    | 层  | 结果           |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------------------------------- | ------ | ------ | -------- | ------- | --- | -------------- |
| `call`           | 1 个键；`invoke`、`cancel` 各 1 次                                                              | 无（端口可挂起、迟到）          | 257    | 442    | 16       | 1.2 s   | 快  | 有反例：F1     |
| `abort`          | 1 个键；`invoke` 1 次、调用方中止 1 次                                                          | 无                              | 142    | 229    | 16       | 0.4 s   | 快  | 有反例：F1     |
| `call-faults`    | 同 `call`                                                                                       | 失败、reject、同步抛出，共 1 次 | 908    | 2252   | 19       | 4.5 s   | 快  | 有反例：F1、F2 |
| `continue`       | 1 个键；`invoke`、`continueWithInput`、`drop` 各 1 次                                           | 无                              | 1078   | 2380   | 34       | 6.8 s   | 快  | 无反例         |
| `call-shutdown`  | 同 `call`，加 `closeAll`                                                                        | 无                              | 1039   | 2229   | 19       | 4.5 s   | 快  | 有反例：F1     |
| `foreign-cancel` | 3 个键（A、C、D）；A `invoke` 1 次；C、D 各 `cancel` 1 次                                       | 无                              | 731    | 1473   | 17       | 3.1 s   | 快  | 无反例         |
| `foreign-task`   | 2 个键（A、C）；A `invoke` 1 次（对端答任务）；C 的任务操作 1 次                                | 无                              | 200    | 361    | 16       | 0.9 s   | 快  | 无反例         |
| `call-twice`     | 1 个键；`invoke` 2 次（同一关联键）、`cancel` 1 次                                              | 无                              | 17815  | 52777  | 31       | 174.3 s | 慢  | 有反例：F1     |
| `task`           | 1 个键；`invoke` 1 次（对端答任务）、任务操作 1 次、`drop` 1 次、`closeAll`                     | 无                              | 2433   | 6273   | 34       | 37.3 s  | 慢  | 无反例         |
| `task-methods`   | 同 `task`，四个任务操作各 1 次，没有 `drop` 与 `closeAll`                                       | 无                              | 7775   | 33625  | 24       | 213.7 s | 慢  | 无反例         |
| `task-account`   | 2 个键（A、C）；C 的连接在前奏里建好；A `invoke` 1 次（对端答任务）、任务操作 1 次、`drop` 1 次 | 无                              | 5555   | 14666  | 35       | 45.5 s  | 慢  | 无反例         |

「前奏」是每次运行开始前走完的固定调度（`Scenario.prelude`），不参与分支。调用口场景的耗时在本机另有 TLC 或慢层场景同时运行时量得，偏长。

「有反例」的场景是本页「发现」一节的反例，不是探索器的失败：它们在所列上限内正常跑完。

TLC 的配置、上限与结果见 [models/README.md](models/README.md#运行记录)。

## 发现

探索器在调用口的实现上找到的反例。每条给违反的性质、最短调度与能复现它的场景。处置归调用口的修复轮（闭包 `w3-mcp-call`），本页不裁定。

- **F1 停止之后仍等无时限的端口（P14 T2 调用一句）**。`cancel` 或调用方中止之后，调用仍等下面的端口，它们既没有时限，也不看停止信号：
  - 关口的三个端口（`calls.ts` `perform` 第 3–5 步：`admitForUse`、`knownActionOf`）。最短调度：`invoke A`、`cancel A`（或 `abort iA1`），采用读取挂起；再各答一个端口，资格核对或清单读取挂起。场景 `call`、`abort`。
  - 传输的 `call`（`sendOn` 的 `ask(() => transport.call(…))`）：停止信号已触发而传输不答。场景 `call`。
  - `cancelRequest`（`abandon` 等它返回）。最短调度：建连成功，`cancel A`，`answer transport.call:tA1 ok`，`cancelRequest` 挂起。场景 `call`。
  - `not-sent` 或 `no-answer` 之后 `lose` 发起的拆除与标记清单（`sendOn` 等 `table.lose`）：`transport.close`、`process.stop`、`credential.release`、`store.write` 挂起。这是 P8 A1 的同类。场景 `call-faults`。

  TLA+ 的探针 `calls-probe-stop` 给出同一条最短反例（关口挂起）。P14 T1（静止时都已答复；模型里带 WF4 的活性）通过。

- **F2 被放弃的调用的应答没有人读（P7）**。占位期间 `cancel`，`transport.call` 答 `ok` 之后 `markSent` 答 `cancelled`，`abandon` 走 `cancelRequest`，而 `called.ok.answer` 从未被 `ask` 读取；它 reject（契约 T9 允许，服务应读成 `no-answer` `abandoned`）时成为未处理的拒绝，缺省模式下使宿主崩溃。最短调度：`invoke A`，建连的端口各答 `ok`，`cancel A`，`answer transport.call:tA1 ok`，`answer transport.answer:r1 reject`。场景 `call-faults`。等待分支（`waitAtMost(ask(() => answer, …), stop)`）没有这个问题：`ask` 先挂上处理。

M17（`markSent` 不看取消标记）在探索器与模型里都是等价变异：取消在占位期间到达时停止信号已经触发，`waitAtMost` 当即到期，同样走 `abandon`，`cancelRequest` 一次。外部动作只在静止时到达，所以「发出与登记之间」在探索器里没有可插入的点。

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

调用口的变异（闭包 `w3-mcp-call-model`，2026-11-05，在 `7d91a330c` 的源码上）：每个变异改源码一处，用探索器跑所列场景，比较变异前后的违例签名，然后按字节还原（`git checkout`，`git status` 干净）。「新增的签名」是基线（本页「发现」的 F1、F2）之外的违例；调度与日志留任务 `tmp/closures/w3-mcp-call-model/mutations/`：

| 变异 | 源码                     | 缺陷                                               | 场景             | 新增的签名（探索器报的性质）                                                                           | 最短反例的调度                                                            |
| ---- | ------------------------ | -------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| N1   | `calls.ts`               | 建连之后不核停止信号就发出（MC-16 第 9 步）        | `call`           | P9 `P9-sent-after-stop`                                                                                | 关口三答，`cancel A`，建连五答，`transport.call ok`：占位期间已取消仍发出 |
| N2   | `calls.ts`               | `abandon` 调用 `cancelRequest` 两次                | `call`           | P10 `P10-cancelled-twice`                                                                              | 建连后 `cancel A`，`transport.call ok`，`cancelRequest ok`                |
| N3   | `calls.ts`               | 拒绝的步骤不归还占位（`refused` 不 `release`）     | `call-faults`    | P11 `P11-answered-with-open-reservation`、`P11-reservation-left`；P12 `P12-stopped-foreign-call`       | `invoke A`，采用读取同步抛出：调用答复后占位仍在，之后的 `cancel` 停了它  |
| N3b  | `calls.ts`               | 发出前取消不标记结束（`cancelled` 不 `markEnded`） | `call`           | P11 同上两条                                                                                           | `invoke A`、`cancel A`、关口三答                                          |
| N4a  | `internal/in-flight.ts`  | 在途表的键去掉主体                                 | `foreign-cancel` | P12 `P12-stopped-foreign-call`                                                                         | `invoke A`、`cancel C`                                                    |
| N4d  | `internal/in-flight.ts`  | 在途表的键去掉租户                                 | `foreign-cancel` | P12 `P12-stopped-foreign-call`                                                                         | `invoke A`、`cancel D`                                                    |
| N4b  | `internal/task-table.ts` | 任务表的键去掉主体                                 | `foreign-task`   | P12 `P12-task-asked-port-for-nobody`、`P12-task-on-foreign-connection`、`P12-task-answered-nobody`；P5 | A 的调用答任务，`task C get`：C 读到 A 的任务，在 A 的传输上发请求        |
| N4c  | `tasks.ts`               | 复用连接不比对端账户                               | `task-account`   | P12 `P12-task-on-foreign-connection`；P5 `P5-crossing`                                                 | C 已连接，A 的调用答任务，`task A get`：请求发在 C 的传输上               |
| N5   | `internal/table.ts`      | `closeAll` 不记下关停（生命周期的 M3）             | `call-shutdown`  | P13 `P13-call-after-closeAll`、`P13-sent-after-closeAll`；P4、P1、P2、P3                               | `closeAll`、`invoke A`、关口与建连各答：关停之后发出并答「已发出」        |
| N6   | `calls.ts`               | 等应答只受调用方 `signal`，不受合成的停止信号      | `call`           | P14 `P14-stopped-waits[transport.answer]`（新的一类等待：取消之后仍等对端应答）                        | 建连后 `transport.call ok`，`cancel A`：对端不答时调用一直等              |
| M17  | `internal/in-flight.ts`  | `markSent` 不看取消标记                            | `call`           | 无：等价变异（停止信号已触发，`waitAtMost` 当即到期，同样 `abandon`）                                  | —                                                                         |

每条新性质至少一个变异变红：P9（N1）、P10（N2）、P11（N3、N3b）、P12（N4a–N4d）、P13（N5）、P14（N6，严格形式的新签名；T1 形式在探索器上没有变异能变红，由模型的 `calls-bad-wait-answer` 承担）。TLC 负控与调用口变异的对应：`calls-bad-send-despite-stop` 与 N1，`calls-bad-cancel-twice` 与 N2，`calls-bad-no-release` 与 N3，`calls-bad-key-blind` 与 N4a，`calls-bad-task-blind` 与 N4b，`calls-bad-task-any-account` 与 N4c，`calls-bad-send-after-shut` 与 N5，`calls-bad-wait-answer` 与 N6。

## 未覆盖

- 真实传输、真实进程、真实对端与耐久存储：真实组合未验证。
- HTTP 端点、`degraded` 与 `settle`、换采用修订（不变式 6）、资格、`refresh` 的发布：两种证据都不覆盖，由既有用例承担。
- 上限之外的调度：例如一个键 3 次 `ensure`，或两种偏离同时出现；调用口的场景每个主体一个关联键、一个任务。
- 调用口：HTTP 端点、输出 schema 与 `checkOutput`、`inputRequired` 结局与真实的继续、任务表与在途表跨重启、授权发现的 `not-sent`：两种证据都不覆盖，由既有用例承担。「新建连接的账户变了」只在模型里。
- `closeAll` 把放弃落点与关闭条目时的本包错误收进 `AggregateError` 的一路：端口经 `ask` 不会让这两步拒绝，只有本包自己的缺陷会走到这里，所以没有不往本包注入缺陷就能触发的用例。任务作用域记下的本包错误一路有用例（P7）。
- 模型与实现之间没有精化证明。

## 维护

修改连接表的源码、端口替身或性质时，同步更新 [ConnectionTable.tla](models/ConnectionTable.tla)、`tests/model/` 与本页的映射，再重跑两种证据。修改调用口（`calls.ts`、`tasks.ts`、`in-flight.ts`、`task-table.ts`）时同样对 [Calls.tla](models/Calls.tla) 与 `calls.spec.ts` 的场景做；探索器经 `InFlightCalls` 的子类观察在途表，它的方法签名变了，先改 `explore.ts` 的 `CountedInFlight`。新加一条性质时，同时在模型里加一个负控、在探索器上做一个变异，证明两边都能变红。单次运行的原始输出留任务 `tmp/`，不进本目录。

## 调用口闭包 `w3-mcp-call` 的变异记录

手工变异（2026-11-05，基线 `b2ba7dc89` 之上的闭包提交），每条改源码一处、跑所列用例、按字节还原；记录与日志在任务过程目录 `tmp/closures/w3-mcp-call/red/`。契约样本构造器的变异先重建契约 `dist` 再跑（用例经 `dist` 导入）。

| 编号 | 改了什么（文件与位置）                                                     | 哪条用例变红                                                                                                                     | 退出码 |
| ---- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M01  | `in-flight.ts` `reserve` 不查重                                            | `invoke.spec.ts`「step 1」                                                                                                       | 1      |
| M02  | `in-flight.ts` `release` 不删占位                                          | 「step 2: not adopted … free again」等 4 条                                                                                      | 1      |
| M03  | `calls.ts` 关口拒绝一律答 `unknown`                                        | 「step 2: blocked」                                                                                                              | 1      |
| M04  | `calls.ts` 配值拒绝一律答 `unknown`                                        | 「step 3」两条                                                                                                                   | 1      |
| M05  | `calls.ts` 不核动作可用性                                                  | 「step 4: … marked unavailable」                                                                                                 | 1      |
| M06  | `calls.ts` 不核摘要                                                        | 「step 4: definition-changed」                                                                                                   | 1      |
| M07  | `calls.ts` `effect-unknown` 原样交出                                       | 「step 5: … effect-unknown」                                                                                                     | 1      |
| M08  | `calls.ts` `not-sent` 不经 `table.lose`                                    | 「step 7」三条                                                                                                                   | 1      |
| M09  | `lost.ts` `session-ended` 记成 `stream-broken`                             | 「step 7: session-ended」                                                                                                        | 1      |
| M10  | `calls.ts` 不调用 `cancelRequest`                                          | 「step 8: the signal after the send」与 `cancel.spec.ts` 共 5 条                                                                 | 1      |
| M11  | `calls.ts` 发出前取消删除占位而不是结束                                    | 「signal before the send」「makes the call answer not sent」                                                                     | 1      |
| M12  | `calls.ts` 观察函数的错误不吞                                              | 「observer that throws」                                                                                                         | 1      |
| M13  | `calls.ts` 结局 `unknown` 不经 `table.lose`                                | 「unknown (stream-breaks)」「unknown (process-exits)」                                                                           | 1      |
| M14  | `calls.ts` 不把 `ports.checkOutput` 交给 `classifyOutcome`                 | 「declared output schema」                                                                                                       | 1      |
| M15  | `calls.ts` `task` 结局不登记                                               | `tasks.spec.ts` 15 条                                                                                                            | 1      |
| M16a | `in-flight.ts` 键文本去掉主体                                              | `cancel.spec.ts`「another principal」                                                                                            | 1      |
| M16b | `in-flight.ts` 键文本去掉租户                                              | `cancel.spec.ts`「another tenant」与 `in-flight.spec.ts` 两条                                                                    | 1      |
| M17  | `in-flight.ts` `markSent` 不看取消标记                                     | 存活：服务层由停止信号到期殊途同归（SPEC 未覆盖一节）；聚合由 `in-flight.spec.ts`「keeps a call reserved … from being sent」覆盖 | 0      |
| M18  | `in-flight.ts` `cancel` 对已发出的键不核当前代际                           | `in-flight.spec.ts`「generation has changed」                                                                                    | 1      |
| M19  | `calls.ts` `continueWithInput` 不核代际                                    | `continue.spec.ts`「changed generation」                                                                                         | 1      |
| M20  | `calls.ts` 请求不带 `continuation`                                         | 「completes on the same generation」「request state alone」                                                                      | 1      |
| M21a | `task-table.ts` 键文本去掉主体                                             | `tasks.spec.ts`「another principal」                                                                                             | 1      |
| M21b | `task-table.ts` 键文本去掉租户                                             | 「another tenant」（同主体文本的另一租户）                                                                                       | 1      |
| M22  | `tasks.ts` 不比较对端账号                                                  | 「another peer account」两条                                                                                                     | 1      |
| M23  | `tasks.ts` 不复用现有连接                                                  | 「reuses the existing connection」                                                                                               | 1      |
| M24  | `tasks.ts` 采用不可读也答 `no-connection`                                  | 「unreadable is unknown」                                                                                                        | 1      |
| M25  | `tasks.ts` 去掉关停检查                                                    | 「after closeAll」                                                                                                               | 1      |
| M26  | `tasks.ts` `no-answer` 子因改成 `abandoned`                                | 「no answer is effect-unknown」                                                                                                  | 1      |
| M27  | `tasks.ts` 任务请求不受时限                                                | 「bound cuts off」                                                                                                               | 1      |
| M28  | `tasks.ts` 表外任务也发请求                                                | 「task not in the table」「after closeAll」                                                                                      | 1      |
| M29  | `assembly.ts` 不读 `ports.clock`                                           | `mcp.spec.ts`「clock of the ports」                                                                                              | 1      |
| M30  | `tasks.ts` 资格非 `granted` 也建连                                         | 「eligibility granted」两条                                                                                                      | 1      |
| M31  | `calls.ts` 取消赛跑的 `not-sent` 不答 `cancelled`                          | `cancel.spec.ts`「races the send」                                                                                               | 1      |
| M32  | `table.ts` `isShut` 恒假                                                   | 「after closeAll」                                                                                                               | 1      |
| M33  | `calls.ts` `authorization-required` 改答 `connection-unavailable`          | 「refused for authorization」                                                                                                    | 1      |
| M34  | 契约 `testing-values.ts` `endpointRefOf` 缺省持有改为 `ws/`（重建 `dist`） | 契约 `testing-values.spec.ts`「endpointRefOf」                                                                                   | 1      |

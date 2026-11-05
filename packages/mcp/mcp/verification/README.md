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
| `CallStep` 的 `start`（关停之后直接 `Refused`） | 同一步的 `drain()` | `perform`：`checkRequest`、`inFlight.reserve(key, signal)`（交出调用唯一的停止信号）；`prepare` 开头的 `table.isShut()`（S8） |
| `Ask gate`、`gateW`（停止信号先到则 `cancelled`） | `answer adoption.endpoint:A …`、`answer eligibility.check:A …`、`answer store.read:A …` | `prepare`：`under(stop, () => admitForUse(…))`、`prepareSettings`、`under(stop, () => knownActionOf(…))` |
| `Ask ensure`、`ensW`（`ok` 使连接可用，`fail` 拒绝；停止信号先到则 `cancelled`） | 连接表的全部端口与时限，同生命周期的映射 | `prepare` 里 `under(stop, () => table.ensure(…))`；`table.ts` `ensure` |
| `AfterEnsure`：继续的代际核对 | `drain()` | `prepare` 的 `issuedOn` |
| `Ask call`、`callW`（`ok` 发出、`fail` 是 `not-sent`、`reject`） | `answer transport.call:tA1 ok|fail|reject`，或它同步抛出 | `perform`：`ask(() => transport.call(…))`、`notSentBy`（T5 的 `cancelled`，否则 `loseInScope`） |
| `MarkSent` | `drain()`，在途表计数视图记下 `markSent` | `in-flight.ts` `markSent(key, connection, generation)` |
| `Ask answer`、`ansW`（`ok` 结局、`fail` 是 `no-answer`、`reject`；停止信号先到则放弃） | `answer transport.answer:r1 ok|fail|reject`：对端对请求 `r1` 的应答，场景决定 `ok` 是完整结果还是任务 | `answerOf`：`waitAtMost(ask(() => answer, ABANDONED), on.stop)`、`outcomeOf`（`classifyOutcome`、`loseInScope`、`tasks.record`） |
| `Abandon`、`SpawnCancelReq`（无人等的待决调用） | `answer transport.cancelRequest:r1 ok|reject`，调用已答复 | `answerOf`：`scope.spawn(ask(() => transport.cancelRequest(…)))` |
| `Conclude`（`Cancelled`、`Refused`、`Ended`） | `drain()`，在途表计数视图记下 `conclude` | `perform` 的 `finally`：`inFlight.conclude(key, phase)` |
| `Cancel(k)` | `cancel A`（A 的主体用关联键 `c`） | `calls.ts` `cancel`；`in-flight.ts` `cancel` |
| `Abort(i)` | `abort iA1` | 调用方 `InvokeRequest.signal` 的 `AbortController.abort()` |
| `TaskOp(k)`、`TaskStep` 的 `lookup` | `task A get|result|input|cancel` | `tasks.ts` `createTasks` 的四个操作，`request`：`tasks.get`、`issuedAt` 核对 |
| `Reusable`、`SendTask` | `drain()` | `tasks.ts` `connectionOf`：`isShut`、`table.currentOf(…).find(账户相同)`、`built`（`decideForUse`、`prepareSettings` 的账户比较、`table.ensure`） |
| `Ask task`、`taskW`、任务时限的 `Fire` | `answer transport.getTask:t1 …` 等四个端口，`fire T(ktA1)` | `tasks.ts` `request`：`ask(() => send(on))`、`startBound(bound, 'task')`、`within`、`failureOf`（`loseInScope`） |
| `Drop(k)` | `drop A`：丢失 A 的当前连接 | `table.ts` `lose` 于 `current(key)` 的连接；模型里立即生效，实现里拆除在作用域继续 |
| `CloseAll` | `closeAll` | `table.ts` `closeAll`；模型只置关停并清空连接 |

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

| 模型变量（Calls.tla）                                                         | 探索器观察                                                                                                                                                                                     | 实现                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `conn[k]`（`st`、`gen`）                                                      | `table.current(key)` 与它的代际                                                                                                                                                                | 连接表的条目                  |
| `inflight[slot]`（`phase`、`stopFired`、`gen`、`fib`） | 在途表的计数视图：每次 `reserve`、`markSent`、`conclude` 的调用与答复，归属于发起它的操作（`ReservationView`）；键的身份由探索器按（租户、主体文本、关联键）给出，不读实现的键文本 | `in-flight.ts` 的 `#entries` |
| `tasks[slot]`（`account`、`owner`）                                           | `invoke` 答 `task` 结局的键（`tasksOf`）                                                                                                                                                       | `task-table.ts` 的 `#entries` |
| `reqs[r].cancels`                                                             | 账本 `requests`：传输交出的每个请求号与它收到的 `cancelRequest` 次数                                                                                                                           | 传输                          |
| `fib[i]` 的 `aborted`、`stopEarly`、`sends`、`sentOk`、`afterShut`、`cancels` | `OpView` 的 `aborted`、`stopped`、`stoppedBeforeSend`、`sends`、`sentOk`、`afterShut`、`cancelRequests`                                                                                        | 无（只为性质）                |
| `timers`、`fired`（任务时限）                                                 | 探索器注入的时限 `T(k<op>)`，起在任务请求发出之后，附到那次请求上                                                                                                                              | `startBound(bound, 'task')`   |

两边的端口失败模型一一对应：答复、失败、reject、`unconfirmed`、同步抛出、挂起（永不选择答复）、迟到（先选 `fire` 再选答复）。

模型的抽象：

- 一次内部步是一个异步函数在两个 `await` 之间的同步部分。同一个键的纤程的内部步以任意次序交错，是微任务先进先出次序的超集。不同键的纤程不共享条目、轮次与资源，所以它们的内部步按键的固定次序运行（偏序约简）。
- 一次受时限的等待，在工作已结束且时限已到期时两种结局都探索（实现在时限已到期时直接答 `expired`）。
- 时限的上界相同，先建先到期。模型里排队的调用在队里不看自己的时限，加入的调用不另起自己的时限。模型检查的 P8 T2 是全局形式：全部时限都到期之后，没有 `ensure` 还在等。这两处省略不影响全局形式，因为全部时限到期时，它们所等的调用也已答复。逐个 `ensure` 的形式（自己的时限都到期就答复；正在等而一个自己的时限都没起，也算违例）只由探索器检查：每个场景都检查，`bounds` 场景另让上界不同的时限以任意次序到期。
- 键是抽象的：模型不建键怎样从租户、修订与对端账号推导。两个键的配置不触发时限，迟到路径只在一个键的配置里检查。
- 只建 stdio 与进程凭据，一个采用修订，一个对端账号。不建 HTTP、`degraded` 与 `settle`、资格、清单与发布、存储写入、关闭报告的范围值。

`Calls.tla` 的抽象与范围上限：

- 连接表只剩每个键的「可用、代际」与关停。`ensure` 是一个端口：`ok` 使连接可用（建连给下一个代际，复用保持代际），`fail` 是任何拒绝或时限到期，关停之后只答 `fail`。它的内部步骤、时限与五项资源归生命周期模型；两个模型之间没有组合证明。
- 关口的采用读取、资格核对、配值与清单读取合为一个端口 `gate`。`lose` 立即生效，实现里拆除交作用域（`loseInScope`），两边都不让调用等它；`closeAll` 只置关停并清空连接。`cancelRequest` 在模型里是无人等的待决调用（`owner = 0`），对应 `scope.spawn`。
- 传输的 `call` 在停止信号触发之后最终答复是前提（WF5）：`P14_BoundedAfterStop` 不把等在 `callW` 的调用算作卡住；探索器同样不把只等自己 `transport.call` 的已停止调用算作违例。
- 键、租户、主体与账户是常量表，不建它们怎样推导。关联键只有一个 `c`，任务只有一个 `t1`，每个键的调用与任务操作的次数是常量。
- 所有键的纤程以任意次序交错，没有偏序约简。
- 对端对已发出请求的应答是一个端口调用；它不能同步抛出。

探索器的近似：

- 状态按投影去重：消费者可见的表、待决调用及其调用点（`src/` 的函数栈）与是否迟到、时限、账本与预算。投影不含 promise 的续体。用例「the projection」在 `throws` 场景上核对去重与不去重找到同一组违例及其最短深度。
- 每次重放都核对路径与上一状态的投影。本次运行没有一次偏离，所以在这些调度下实现是确定的。
- 每个键有自己的采用视图，所以几个键的采用修订相同：`two-keys` 的两个键只差租户，`two-accounts` 的两个键只差对端账号。只差对端账号时，两个键的 `stateOf` 是同一个（同租户同持有），所以 P2 的可观察形式在两个键都为 `none` 时才检查。
- 调用口场景里，在途表是真实的 `InFlightCalls`，经一个只计数的子类观察（`reserve`、`markSent`、`conclude` 各自调用 `super` 后报告给运行）；任务表是真实的 `TaskTable`。P11 读这个计数视图，其余性质只读操作的答复与端口账本。
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

调用口的场景（`tests/model/calls.spec.ts`，同一环境，2026-11-05，在合并头 `a446c2b9b` 的源码上，即调用口分支头 `2678b21b5` 含 S8 的关停先判；基线 `7d91a330c` 上同一组场景的反例在「发现」一节）。每个场景持有一份一个动作的清单，没有 `ensure`，调用自己建连；每个场景也照常检查 P1–P8：

| 场景             | 上限                                                                                            | 偏离与预算                      | 状态数 | 重放数 | 最深调度 | 耗时    | 层  | 结果           |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------------------------------- | ------ | ------ | -------- | ------- | --- | -------------- |
| `call` | 1 个键；`invoke`、`cancel` 各 1 次 | 无（端口可挂起、迟到） | 257 | 442 | 16 | 1.8 s | 快 | 无反例 |
| `abort` | 1 个键；`invoke` 1 次、调用方中止 1 次 | 无 | 142 | 229 | 16 | 0.7 s | 快 | 无反例 |
| `call-faults` | 同 `call` | 失败、reject、同步抛出，共 1 次 | 905 | 2249 | 19 | 7.0 s | 快 | 无反例 |
| `continue` | 1 个键；`invoke`、`continueWithInput`、`drop` 各 1 次 | 无 | 1078 | 2380 | 34 | 8.7 s | 快 | 无反例 |
| `call-shutdown` | 同 `call`，加 `closeAll` | 无 | 1026 | 2214 | 19 | 5.7 s | 快 | 无反例 |
| `foreign-cancel` | 3 个键（A、C、D）；A `invoke` 1 次；C、D 各 `cancel` 1 次 | 无 | 731 | 1473 | 17 | 3.0 s | 快 | 无反例 |
| `foreign-task` | 2 个键（A、C）；A `invoke` 1 次（对端答任务）；C 的任务操作 1 次 | 无 | 200 | 361 | 16 | 0.6 s | 快 | 无反例 |
| `call-twice` | 1 个键；`invoke` 2 次（同一关联键）、`cancel` 1 次 | 无 | 18139 | 53629 | 31 | 256.0 s | 慢 | 无反例 |
| `task` | 1 个键；`invoke` 1 次（对端答任务）、任务操作 1 次、`drop` 1 次、`closeAll` | 无 | 2421 | 6258 | 34 | 20.8 s | 慢 | 无反例 |
| `task-methods` | 同 `task`，四个任务操作各 1 次，没有 `drop` 与 `closeAll` | 无 | 7775 | 33625 | 24 | 116.1 s | 慢 | 无反例 |
| `task-account` | 2 个键（A、C）；C 的连接在前奏里建好；A `invoke` 1 次（对端答任务）、任务操作 1 次、`drop` 1 次 | 无 | 5555 | 14666 | 35 | 52.9 s | 慢 | 无反例 |

「前奏」是每次运行开始前走完的固定调度（`Scenario.prelude`），不参与分支。调用口场景的耗时在本机另有 TLC 或慢层场景同时运行时量得，偏长。

本表的读数来自包的 `test` 入口一次运行（快层与慢层同一进程，`VITEST_MAX_WORKERS=4`）；在合并头 `630d95dc7`（没有 S8 先判）上的一轮读数只在 `call-shutdown`（1039 状态、2229 重放）与 `task`（2433 状态、6273 重放）上不同，结论相同。别的工作树的负载不在本任务的掌握之内。

TLC 的配置、上限与结果见 [models/README.md](models/README.md#运行记录)。

## 发现

探索器在基线 `7d91a330c`（闭包 `w3-mcp-call` 交回的调用口）上找到的反例，与各自的处置。两条都已在合进本分支的调用口分支头 `1a143a4d4`（修复轮 `w3-mcp-call-fix1` 的 `1d158cba9`…`67b653a7f`，加 F1(d) 的修复 `1a143a4d4`；合并头 `630d95dc7`）上由探索器与 TLC 重跑确认消失，之后在含 S8 修复的 `2678b21b5`（合并头 `a446c2b9b`）上再跑一遍，结论不变：全部调用口场景没有违例，没有一条签名带 `transport.answer`；读数见上表与 [models/README.md](models/README.md#运行记录)。

- **F1 停止之后仍等无时限的端口（P14 T2 调用一句）**。`cancel` 或调用方中止之后，调用仍等下面的端口，它们既没有时限，也不看停止信号。最短调度 `invoke A`、`cancel A`（或 `abort iA1`），采用读取挂起。
  - (a) 关口的三个端口（旧 `perform` 第 3–5 步：`admitForUse`、`knownActionOf`）：已修，`prepare` 的每次等待经 `under(stop, …)`（修复轮 `0d7aeb133`）。
  - (b) 传输的 `call`：不算缺陷，是端口前提（卡拥有者裁定）。调用在传输报告「没有发出」之前不能答「未发出」；信号触发后 `call` 有界结束是传输按契约 T5 的义务，写成 WF5。P14 T2 的「无时限端口」集合不含它。
  - (c) `cancelRequest`（旧 `abandon` 等它返回）：已修，`answerOf` 以 `scope.spawn` 发出，不等（修复轮 `0d7aeb133`）。
  - (d) `not-sent` 或 `no-answer` 之后 `lose` 发起的拆除与标记清单（旧 `sendOn` 等 `table.lose`；P8 A1 的同类）：已修，调用与任务操作经 `loseInScope` 把拆除交给表的作用域，`discovery` 照旧等 `loseOn`（`1a143a4d4`）。
- **F2 被放弃的调用的应答没有人读（P7）**。占位期间 `cancel`，`transport.call` 答 `ok` 之后旧 `markSent` 答 `cancelled`，`abandon` 走 `cancelRequest`，而 `called.ok.answer` 从未被 `ask` 读取；它 reject（契约 T9 允许）时是未处理的拒绝。最短调度：`invoke A`，建连各答 `ok`，`cancel A`，`answer transport.call:tA1 ok`，`answer transport.answer:r1 reject`。已修：`markSent` 不再答 `cancelled`，`answerOf` 无论停止是否先到都经 `ask` 读 `answer`（修复轮 `0d7aeb133`）。

修复轮交给探索器的 C50（`under` 在等待答复之后不再核停止信号）：两种证据都表达不了。探索器与模型一次事件循环轮次只有一个外部动作，端口答复与停止信号不会落在同一轮里；答复到达后调用在下一次外部动作之前就已经跑完 `under`，停止信号不可能夹在中间。变异 C50 在探索器上运行过，没有新增的违例签名（见下表 N 序列）。守住它的是实现里那一行本身，没有变红的用例。第 1 轮的 M17（`markSent` 不看取消标记）在新结构下不存在：占位项没有取消标记，取消落在发出与登记之间时由停止信号在等应答时处理。


## 两种证据能变红

本页有三个变异序列，各自独立编号，号码不互指：生命周期的 M1–M28（闭包 `w3-mcp-lifecycle`，改连接表的源码，下表）；调用口服务层用例的 C01–C52（修复轮 `w3-mcp-call-fix1`，改调用口的源码，本页末「调用口闭包的变异记录」）；调用口探索器的 N1–N7 与 C50 的探索器重跑（闭包 `w3-mcp-call-model`，本节第二张表）。调用口第 1 轮（闭包 `w3-mcp-call`）曾用过的 M01–M34 已全部由 C 序列重跑或取代，本页不再引用；引用变异时带序列名。

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

27 个变异都有所列用例变红。生命周期序列里没有 M11。M12 到 M15 与 M24、M25、M26、M28 只运行了所列用例，没有运行探索器，所以性质一列写「未运行」。M27 只在 `rebuild` 场景上运行了探索器：正在等而一个自己的时限都没起的 `ensure` 算 P8 T2 违例，所以探索器报出它。M16、M17 在三个快场景 `rebuild`、`faults`、`throws` 与慢场景 `bounds` 上运行了探索器。M16 只在 `bounds` 场景变红：时限先建先到期时，占着临界区的调用的时限总是先到，排队的调用总在自己的时限之前轮到。M17 在 `rebuild` 场景也变红：加入的调用的临界区时限早于建连时限建立，所以先到期。M18 到 M23 在 `bounds`、`faults`、`throws` 三个场景上运行了探索器，都没有违例：多发一次端口调用、多写一次标记、晚一些释放句柄与本包错误的去向不违反 P1–P8 的可检查形式，探索器也不注入本包的错误。它们只由所列用例守住。每个变异的运行日志留在任务 `tmp/`，不进本目录。

TLC 负控与变异的对应：`bad-no-absorb-close` 与 M1，`bad-forget-open`、`bad-forget-open-late` 与 M2，`bad-no-shut` 与 M3，`bad-abandon-landed` 与 M7，`bad-unbounded-wrap` 与 M6，`bad-ok-after-shut` 与 M8。M5（`ask` 不吸收同步抛出）在模型里没有负控：模型按 `ask` 把抛出写成答复。M9、M10 在模型里没有负控：模型的键是抽象的。

调用口的变异 N 序列（闭包 `w3-mcp-call-model` 追加 1，2026-11-05，在合并头 `630d95dc7` 的源码上；S8 的修复 `2678b21b5` 只改 `prepare` 开头的关停先判，受它影响的 N5 与 C50 在合并头 `a446c2b9b` 上又跑了一遍，签名相同，记录在 `mutations/merged-s8/`）：每个变异改源码一处，用探索器跑所列场景，比较变异前后的违例签名（合并头上全部场景没有违例，所以下面的签名都是新增），然后按字节还原（`git checkout`，`git status` 干净）。调度、日志与签名留任务 `tmp/closures/w3-mcp-call-model/mutations/merged/`：

| 变异 | 源码 | 缺陷 | 场景 | 新增的签名（探索器报的性质） |
| --- | --- | --- | --- | --- |
| N1 | `calls.ts` | `under` 不等停止信号，直接做工作（关口、建连都不看停止） | `call` | P9 `P9-sent-after-stop`；P14 `P14-stopped-waits[adoption.endpoint]`、`[eligibility.check]`、`[store.read]` |
| N2 | `calls.ts` | 放弃时发出 `cancelRequest` 两次 | `call` | P10 `P10-cancelled-twice` |
| N3 | `calls.ts` | `perform` 的 `finally` 不 `conclude` | `call`、`call-faults` | P11 `P11-answered-with-open-reservation`、`P11-reservation-left`；P12 `P12-stopped-foreign-call`（占位留下，下一次同键调用被它挡住） |
| N3b | `calls.ts` | `perform` 的 `finally` `conclude` 两次 | `call` | P11 `P11-concluded-nothing` |
| N4a | `internal/in-flight.ts` | 在途表的键去掉主体 | `foreign-cancel` | P12 `P12-stopped-foreign-call` |
| N4d | `internal/in-flight.ts` | 在途表的键去掉租户 | `foreign-cancel` | P12 `P12-stopped-foreign-call` |
| N4b | `internal/task-table.ts` | 任务表的键去掉主体 | `foreign-task` | P12 `P12-task-asked-port-for-nobody`、`P12-task-on-foreign-connection`、`P12-task-answered-nobody`；P5 `P5-crossing` |
| N4c | `tasks.ts` | 复用连接不比对端账户 | `task-account` | P12 `P12-task-on-foreign-connection`；P5 `P5-crossing` |
| N5 | `internal/table.ts` | `closeAll` 不记下关停（生命周期的 M3） | `call-shutdown` | P13 `P13-call-after-closeAll`、`P13-sent-after-closeAll`；P4、P1、P2、P3 |
| N6 | `calls.ts` | 等应答只受调用方 `signal`，不受合成的停止信号 | `call` | P14 `P14-stopped-waits[transport.answer]` |
| N7 | `calls.ts` | 采用读取不经 `under`（基线上发现 F1(a) 的样子） | `call` | P14 `P14-stopped-waits[adoption.endpoint]`、`[eligibility.check]` |
| C50 | `calls.ts` | `under` 在等待答复之后不再核停止信号（修复轮交来的） | `call`、`call-faults` | 无：两种证据都表达不了它要的交错，见「发现」 |

每条新性质至少一个变异变红：P9（N1）、P10（N2）、P11（N3、N3b）、P12（N4a–N4d）、P13（N5）、P14 T2（N1、N6、N7）。P14 T1 在探索器上没有变异能变红（静止驱动把端口都答了），由模型的 `calls-bad-wait-answer` 承担。TLC 负控与 N 序列的对应：`calls-bad-send-despite-stop` 与 N1，`calls-bad-gate-unstopped` 与 N7，`calls-bad-cancel-twice` 与 N2，`calls-bad-no-release` 与 N3，`calls-bad-key-blind` 与 N4a，`calls-bad-task-blind` 与 N4b，`calls-bad-task-any-account` 与 N4c，`calls-bad-send-after-shut` 与 N5，`calls-bad-wait-answer` 与 N6。

## 未覆盖

- 真实传输、真实进程、真实对端与耐久存储：真实组合未验证。
- HTTP 端点、`degraded` 与 `settle`、换采用修订（不变式 6）、资格、`refresh` 的发布：两种证据都不覆盖，由既有用例承担。
- 上限之外的调度：例如一个键 3 次 `ensure`，或两种偏离同时出现；调用口的场景每个主体一个关联键、一个任务。
- 调用口：HTTP 端点、输出 schema 与 `checkOutput`、`inputRequired` 结局与真实的继续、任务表与在途表跨重启、授权发现的 `not-sent`：两种证据都不覆盖，由既有用例承担。「新建连接的账户变了」只在模型里。
- `closeAll` 把放弃落点与关闭条目时的本包错误收进 `AggregateError` 的一路：端口经 `ask` 不会让这两步拒绝，只有本包自己的缺陷会走到这里，所以没有不往本包注入缺陷就能触发的用例。任务作用域记下的本包错误一路有用例（P7）。
- 模型与实现之间没有精化证明。

## 维护

修改连接表的源码、端口替身或性质时，同步更新 [ConnectionTable.tla](models/ConnectionTable.tla)、`tests/model/` 与本页的映射，再重跑两种证据。修改调用口（`calls.ts`、`tasks.ts`、`in-flight.ts`、`task-table.ts`）时同样对 [Calls.tla](models/Calls.tla) 与 `calls.spec.ts` 的场景做；探索器经 `InFlightCalls` 的子类观察在途表，它的方法签名变了，先改 `explore.ts` 的 `CountedInFlight`。新加一条性质时，同时在模型里加一个负控、在探索器上做一个变异，证明两边都能变红。单次运行的原始输出留任务 `tmp/`，不进本目录。

## 调用口闭包的变异记录

手工变异的 C 序列（修复轮 `w3-mcp-call-fix1`，2026-11-05），与生命周期的 M1–M28 分开编号；第 1 轮的 M01–M34 全部由下表重跑或取代。每条改源码一处（C49 改两处），在最终 head `e510d444f` 上跑所列用例（快层，`--typecheck.enabled=false`），按字节还原；契约的变异先重建契约 `dist` 再跑，还原后再重建。记录、`summary.json` 与每条的日志在任务过程目录 `tmp/closures/w3-mcp-call/fix1/mutations/`，工具是同目录的 `mutate.py`。

| 编号 | 改了什么（文件与位置）                                                                                       | 哪条用例变红                                                                                                  | 退出码 | 运行时的 head |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------ | ------------- |
| C01  | `in-flight.ts` `reserve` 不查重                                                                              | `invoke.spec.ts`「step 2: a second call」                                                                     | 1      | `e510d444f`   |
| C02  | `in-flight.ts` `conclude` 对未取消的未发出调用不撤销占位而是结束                                             | `in-flight.spec.ts`「gives the place back」等 4 条（含 `continue.spec.ts` 两条）                              | 1      | `e510d444f`   |
| C03  | `calls.ts` 关口拒绝一律答 `unknown`                                                                          | 「step 3: not adopted」「step 3: an endpoint blocked」                                                        | 1      | `e510d444f`   |
| C04  | `calls.ts` 配值拒绝一律答 `unknown`                                                                          | 「step 4」两条                                                                                                | 1      | `e510d444f`   |
| C05  | `calls.ts` 不核动作可用性                                                                                    | 「step 5: … marked unavailable」「step 9: a call the transport could not send」                               | 1      | `e510d444f`   |
| C06  | `calls.ts` 不核摘要                                                                                          | 「step 5: definition-changed」                                                                                | 1      | `e510d444f`   |
| C07  | `calls.ts` `settings` 阶段的原因改答 `unknown`（映射表第 1、4 行）                                           | 「step 7: after closeAll」「step 7: a call that joins」                                                       | 1      | `e510d444f`   |
| C08  | `calls.ts` 建连阶段 `credential-unavailable`、`landing-unavailable` 改答 `connection-unavailable`（第 2 行） | 「step 7: a connection failure of the build」                                                                 | 1      | `e510d444f`   |
| C09  | `calls.ts` 建连阶段 `effect-unknown` 原样交出（第 3 行）                                                     | 「step 7: a discover that fails」                                                                             | 1      | `e510d444f`   |
| C10  | `calls.ts` 加入方到期（`catalog: 'pending'`）改答 `unknown`（第 4 行）                                       | 「step 7: a call that joins」                                                                                 | 1      | `e510d444f`   |
| C11  | `calls.ts` `not-sent` 不经 `table.lose`（第 5 行）                                                           | 「step 9」三条                                                                                                | 1      | `e510d444f`   |
| C12  | `lost.ts` `session-ended` 记成 `stream-broken`（第 5 行）                                                    | 「step 9: an ended legacy session」                                                                           | 1      | `e510d444f`   |
| C13  | `calls.ts` `authorization-required` 改答 `connection-unavailable`（第 6 行）                                 | 「step 9: a call refused for authorization」                                                                  | 1      | `e510d444f`   |
| C14  | `calls.ts` 结局 `unknown` 不经 `table.lose`（第 7 行）                                                       | 「unknown (stream-breaks)」「unknown (process-exits)」                                                        | 1      | `e510d444f`   |
| C15  | `calls.ts` 不调用 `cancelRequest`                                                                            | 「step 11: the signal after the send」与 `cancel.spec.ts` 共 7 条                                             | 1      | `e510d444f`   |
| C16  | `calls.ts` `cancelRequest` 改回 `await`（取消后等对端）                                                      | `cancel.spec.ts`「does not wait for cancelRequest」两条                                                       | 1      | `e510d444f`   |
| C17  | `calls.ts` 观察函数的错误不吞                                                                                | 「observer that throws」                                                                                      | 1      | `e510d444f`   |
| C18  | `in-flight.ts` `conclude` 对停止信号已触发的未发出调用撤销占位而不是结束                                     | `cancel.spec.ts`「makes the call answer not sent」「a cancel while the gate is asked」等 8 条                 | 1      | `e510d444f`   |
| C19  | `calls.ts` 单一出口：去掉 `finally` 的收口                                                                   | `invoke.spec.ts` 与 `cancel.spec.ts` 共 20 条                                                                 | 1      | `e510d444f`   |
| C20  | `calls.ts` 存储读取不经停止信号                                                                              | `cancel.spec.ts`「a store read that never answers」两条                                                       | 1      | `e510d444f`   |
| C21  | `calls.ts` `ensure` 不经停止信号（自裁 1）                                                                   | `cancel.spec.ts`「while the build is under way」两条                                                          | 1      | `e510d444f`   |
| C22  | `calls.ts` 发出代际改回视图的实时代际                                                                        | `invoke.spec.ts`「lost and rebuilt before call returns」                                                      | 1      | `e510d444f`   |
| C23  | 契约 `classify.ts` 去掉对 `checkOutput` 抛出的吸收（重建 `dist`）                                            | `invoke.spec.ts` 与 `tasks.spec.ts`「a checkOutput that throws」各 1 条                                       | 1      | `e510d444f`   |
| C24  | `calls.ts` 取消赛跑的 `not-sent` 仍转 `lost`                                                                 | `cancel.spec.ts`「races the send」                                                                            | 1      | `e510d444f`   |
| C25  | `calls.ts` `continueWithInput` 建连前不核代际                                                                | `continue.spec.ts`「changed generation」                                                                      | 1      | `e510d444f`   |
| C26  | `calls.ts` `continueWithInput` `ensure` 之后不再核代际                                                       | 「the build answers a later generation」                                                                      | 1      | `e510d444f`   |
| C27  | `calls.ts` 请求不带 `continuation`                                                                           | 「completes on the same generation」「request state alone」                                                   | 1      | `e510d444f`   |
| C28  | `calls.ts` 两个字段都缺的 `ContinueRequest` 也发出                                                           | 「neither the request state nor the input responses」                                                         | 1      | `e510d444f`   |
| C29  | `calls.ts` `task` 结局不登记                                                                                 | `tasks.spec.ts` 22 条                                                                                         | 1      | `e510d444f`   |
| C30a | `in-flight.ts` 键文本去掉主体                                                                                | `cancel.spec.ts`「another principal」                                                                         | 1      | `e510d444f`   |
| C30b | `in-flight.ts` 键文本去掉租户                                                                                | `cancel.spec.ts`「another tenant」与 `in-flight.spec.ts` 两条                                                 | 1      | `e510d444f`   |
| C31  | `in-flight.ts` `cancel` 对已发出的键不核当前代际                                                             | `in-flight.spec.ts`「generation has changed」「by the generation it was sent on」与 `invoke.spec.ts` 1 条     | 1      | `e510d444f`   |
| C32a | `task-table.ts` 键文本去掉主体                                                                               | `tasks.spec.ts`「another principal」等 2 条                                                                   | 1      | `e510d444f`   |
| C32b | `task-table.ts` 键文本去掉租户                                                                               | 「another tenant」（同主体文本的另一租户）                                                                    | 1      | `e510d444f`   |
| C33  | `tasks.ts` 不比较对端账号                                                                                    | 「another peer account」两条                                                                                  | 1      | `e510d444f`   |
| C34  | `tasks.ts` 不复用现有连接                                                                                    | 「reuses the existing connection」                                                                            | 1      | `e510d444f`   |
| C35  | `tasks.ts` 采用不可读也答 `no-connection`                                                                    | 「unreadable is unknown」                                                                                     | 1      | `e510d444f`   |
| C36  | `tasks.ts` 去掉关停检查                                                                                      | 「after closeAll」                                                                                            | 1      | `e510d444f`   |
| C37  | `tasks.ts` 先复用再判关停                                                                                    | 存活：等价变异。`closeAll` 在让出事件循环之前同步关闭每个条目，所以关停之后没有可复用的连接，两种次序不可区分 | 0      | `e510d444f`   |
| C38  | `tasks.ts` `no-answer` 子因改成 `abandoned`                                                                  | 「no answer is effect-unknown」                                                                               | 1      | `e510d444f`   |
| C39  | `tasks.ts` 任务请求不受时限                                                                                  | 「bound cuts off」                                                                                            | 1      | `e510d444f`   |
| C40  | `tasks.ts` 表外任务也发请求                                                                                  | 「task not in the table」等 3 条                                                                              | 1      | `e510d444f`   |
| C41  | `tasks.ts` 不核 `TaskRef.issuedAt`                                                                           | 「an issuedAt other than the recorded one」                                                                   | 1      | `e510d444f`   |
| C42  | `tasks.ts` 资格非 `granted` 也建连                                                                           | 「eligibility granted」等 3 条                                                                                | 1      | `e510d444f`   |
| C43  | `assembly.ts` 不读 `ports.clock`                                                                             | `mcp.spec.ts`「clock of the ports」                                                                           | 1      | `e510d444f`   |
| C44  | `table.ts` `isShut` 恒假                                                                                     | 「after closeAll」                                                                                            | 1      | `e510d444f`   |
| C45  | `tasks.ts` `no-answer` 后重发一次（任务不重发）                                                              | 「bound cuts off」（重发后在时限之外挂住，超时）                                                              | 1      | `e510d444f`   |
| C46  | `calls.ts` 发出后取消再发一次（发出后取消不重发）                                                            | `invoke.spec.ts`「step 11: … nothing is sent again」                                                          | 1      | `e510d444f`   |
| C47  | `calls.ts` 存储违约答 `action-unavailable`（自裁 6）                                                         | 「step 5: a catalog store that breaches」                                                                     | 1      | `e510d444f`   |
| C48  | `calls.ts` 已触发的停止信号仍起等待（自裁 2）                                                                | `cancel.spec.ts`「a signal that fired before the call starts no wait」                                        | 1      | `e510d444f`   |
| C49  | `tasks.ts` 分类放回 `ask` 的闭包，配合 C23 去掉契约的吸收                                                    | `tasks.spec.ts`「a checkOutput that throws」（答 `effect-unknown`）                                           | 1      | `e510d444f`   |
| C50  | `calls.ts` `under` 在等待答复之后不再核停止信号                                                              | 存活：答复与停止信号落在同一轮事件循环的交错没有服务层用例，交给 `w3-mcp-call-model` 的探索器负控（结果：表达不了，见「发现」与 N 序列表的 C50 行）             | 0      | `e510d444f`   |
| C51  | `tasks.ts` 任务请求 `not-sent` 答 `effect-unknown` 而不是 `ConnectionFailure`                                | `tasks.spec.ts`「a task request the transport could not send」「refused for authorization」                   | 1      | `da392b283`   |
| C52  | `calls.ts` T9 的 `call` 违约按未发出收口（占位撤销）                                                         | `invoke.spec.ts`「a call that breaches its contract (T9)」                                                    | 1      | `da392b283`   |

54 条（C30、C32 各两条）里 52 条变红，2 条存活（C37 等价，C50 交探索器）。第 1 轮的 M17（`markSent` 不看取消标记）在新结构下不存在：占位项没有 `cancelled` 字段，取消落在发出与登记之间时由停止信号在第 11 步到期处理（C15、C18 覆盖那条路）。 C51、C52 的 head `da392b283` 与 `e510d444f` 之间只有文档提交，`src/` 没有差异，`tests/` 只有 `tests/README.md`。

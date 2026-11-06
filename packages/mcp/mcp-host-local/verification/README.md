# verification

本目录承载会话请求生命周期的性质证据：TLA+ 模型、模型与实现之间的映射、运行命令与证据状态。性质 V1–V6 的定理陈述归 [SPEC.md「性质与证据」](../SPEC.md#properties)，本页不重复定理。对真实实现的有界穷举探索器在 [tests/model/](../tests/model/session-model.spec.ts)，它是本页第二种证据。

## 允许的内容

`models/` 下的形式模型、配置与运行脚本，`proofs/` 下的论证，以及说明文件。单次运行的原始输出留任务 tmp，不进本目录。

## 边界

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。本页的结论只在下表的上限与模型的抽象之内成立。模型通过不表示任意规模下正确，也不表示实现符合模型。本页不写「已证明」。

<a id="两种证据与各自范围"></a>

## 两种证据与各自范围

| 证据            | 是什么                                                                                                                                                   | 能支持的结论                                                             | 不能支持的结论                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 有界穷举探索器  | [tests/model/](../tests/model/session-model.spec.ts)：驱动真实的 `Session`，线路、凭据句柄、元数据取回与计时都是可编程替身。宽度优先枚举上限内的全部调度 | 在场景的上限内，本包的 `src/session.ts` 在所列可观察投影上满足或违反性质 | 真实线路、真实进程与对端，上限之外的调度，投影之外的状态，`stdio-line.ts` 与 `http-line.ts` 的内部次序 |
| TLA+ 模型与 TLC | [models/TransportSession.tla](models/TransportSession.tla)：会话请求生命周期的行为模型。TLC 穷举每个配置的全部可达状态                                   | 在配置的上限内，模型满足或违反所列性质                                   | 实现符合模型、上限之外的规模、模型省略的部分                                                           |

两种证据之间没有精化证明。对应关系由下面的映射，以及两边对同一类缺陷给出的反例的对照支持。

## 动作映射

一次事件循环的一轮是一个外部动作，之后的内部步一直运行到没有纤程可运行。探索器在每次选择之后等一次 `setImmediate`，于是全部 promise 反应运行完，Node 也报告完未处理的拒绝。模型把这叫静止（`Next` 的一步加上它的内部效果）。

模型把一个请求分成两样东西：在途项（相、答复、调用方的等待）与会话拥有的后台工作流（等句柄、等线路、等发现）。实现里，在途项是 `Pending`：它自己的 `answered`（结算，每个等待它的调用方只等它）与 `departed`（出发点，只有 `call` 等它），两者各兑现一次；工作流是 `Session.work` 启动的后台函数（`sendOut`、`refusalOf`、`enterDiscovery` 与 `enterSse` 里的授权与取回）。

| 模型动作（TransportSession.tla） | 探索器的调度选择（tests/model/explore.ts）                                      | 实现（src/session.ts，除非另注）                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Begin(r)`                       | `discover`、`call`、`list`、`update`（客户操作开始）                            | `begin`：传输不可用时返回空，调用方得 `not-sent`，不登记；否则登记 `Pending`，`call` 的 `signal` 经 `wireSignal` 接到它，再由 `work` 启动 `sendOut`（`authorize` → 组成 → `line.send`）。`call` 的 `signal` 已触发时在 `begin` 之前当场答 `not-sent` |
| `AuthDone(r)`                    | `answer credential.authorize ok`                                                | `authorize` 经 `callHandle` 调用句柄；`sendOut` 在它返回后核 `inFlight`，在途项已结算则丢弃，否则 `phase` 变 `sent` 并 `line.send`                                                                                                                   |
| `Answer(r)`                      | `answer line.send answer`、`answer <流> result`                                 | `dispatch` 与 `consume` 把交换翻成 `WireEvent`，`classify` 经契约的 `classifyWireEvent` 与 `concludeAnswer` 得结论，`settle` 兑现；已不在途的项由 `inFlight` 挡住                                                                                    |
| `Refuse(r)`                      | `answer line.send 401`、`answer line.send 403+scope`                            | `enterDiscovery`：`refusalOf` 起后台拒绝流（`reportRejection` 与 `startAuthorizationDiscovery` 的元数据取回），`phase` 变 `discovery`；在途项已结算则不进入                                                                                          |
| `Broken(r)`                      | `answer line.send aborted/5xx/empty`、`answer <流> break`、`event broken/ended` | 流断开的结论：读类经 `withOneResend` 再发一次（重新授权），写类答 `no-answer`；线路级的断开经 `die` 结算 `sent` 相的项（`streamGoneAnswerOf`），`authorizing` 相的项当场答 `not-sent`                                                                |
| `DiscDone(r)`                    | `answer fetchMetadata`（发现结束）                                              | `enterDiscovery` 里 `await refusal.done` 返回后 `settle`，答 `not-sent`（`authorization-required`）；在途项已结算则丢弃取到的内容                                                                                                                    |
| `Signal(r)`                      | `signal <op>`                                                                   | `wireSignal` 的监听调用 `stop(entry)`：中止该项的 `AbortController` 与应答流，按相 `settle`（`stopAnswerOf`），`call` 的等待随结算放开                                                                                                               |
| `Close`                          | `close`                                                                         | `close()`：标记 `closed`，对每个在途项调用 `stop`，`teardown.abort()`，然后 `this.closing = this.line.close()`；第二次调用得到同一个 `closing`                                                                                                       |
| `LineClosed`                     | `answer line.close ok`                                                          | `line.close()` 答复，`close()` 的 promise 兑现                                                                                                                                                                                                       |

`cancelRequest` 没有对应的模型动作：它当即返回，在模型的抽象之外（见下文）。

## 状态映射

| 模型变量                                               | 探索器观察                                                                                  | 实现                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `st[r]`、`out[r]`                                      | 操作的 `status` 与 `result`；待决端口调用的调用点推出的相（`phaseOf`）                      | 在途项的相与它的结算                                                                                      |
| `cw[r]`                                                | 调用方拿到的 promise 是否已结算（`call` 的结果与 `answer`、操作的结果；含 `cancelRequest`） | 调用方等的那个 promise：`Pending.answered`，`call` 另等 `Pending.departed`                                |
| `wf[r]`                                                | 待决端口调用的调用点                                                                        | 后台工作流所在的 `await`：`sendOut` 里的 `authorize` 与 `line.send`，`enterDiscovery` 里的 `refusal.done` |
| `sends[r]`                                             | 替身账本里该操作的请求号（`ledger.sent`、`op.requests`）                                    | 请求号的分配与写出                                                                                        |
| `refusals`、`cred`                                     | 探索器交付的 401/403-scope 数；账本的 `authorizations`、`rejections`                        | 凭据句柄的调用                                                                                            |
| `signalled`                                            | `op.signalled`                                                                              | 调用方传给 `call` 的 `signal`（`wireSignal` 的监听）                                                      |
| `closed`、`closeDone`                                  | `closeCalled`、`closeReturned`                                                              | `Session.closed`，`close()` 返回的 `closing` promise 兑现                                                 |
| `cutAt[r]`、`firstOut[r]`、`settles[r]`、`credAtClose` | 性质检查记下的相（`phasesAtSignal`、`phasesAtClose`）、首次结算值与关闭时的计数             | 无（只为性质；由有效动作写入，不是缺陷分支的标志）                                                        |

模型的抽象：

- 一次内部步是一个异步函数在两个 `await` 之间的同步部分。模型不展开一次端口答复内部的更细次序（例如应答头与应答体之间）。
- 线路、对端与真实协议抽象成会话据以得出结论的应答：结果、拒绝（401 或带 `insufficient_scope` 的 403）、流断开、没有应答。模型不建 stdio 与 HTTP 的具体线路、字节上界、退出窗口、旧 HTTP+SSE 的 endpoint 协商。
- 请求类只分读与写（`Writes`）：读在流断开后再发一次，写不再发。模型不建每种方法的具体归类（那归契约 T8 与它自己的证据）。
- 端口可以挂起：答复它的动作不被选中。`signal` 与 `close()` 不等挂起的线路、凭据端口或元数据取回，自己结算在途项并放开调用方。挂起的端口调用留在后台工作流里；它之后答复时，工作流丢弃答复。
- `cancelRequest`：它当即返回（契约 T5），没有可挂起的等待，模型不建它；探索器把它的 promise 算作调用方能看到的等待（V4）。
- 调用方的等待 `cw[r]` 是调用方对一个请求的最后一个等待：`call` 的 `answer`，或读写类操作的结果。`call` 自己的 promise 在出发点或结算时兑现，不晚于 `answer`，模型不单独建它。没有 `signal` 的操作对应 `Signal(r)` 不被选中的行为。
- 凭据句柄答失败或 reject（契约 T9）、线路的 `send` reject、`cancelRequest` 的通知与旧 HTTP+SSE 的回退 GET 不在模型里。

探索器的近似：

- 状态按投影去重：消费者可见的操作、待决端口调用及其调用点（`src/` 的函数栈）与上下文、线路事件账本、计时与预算。投影不含 promise 的续体。用例「the projection」在 `http-call` 场景上核对去重与不去重找到同一组违例及其最短深度。
- 每次重放都核对路径与上一状态的投影；本次运行没有一次偏离，所以在这些调度下实现是确定的。
- 三个端口的调用可以答 `hang`：凭据句柄的 `authorize` 与 `reportRejection`，元数据取回 `fetchMetadata`。挂起的调用不再属于可答集合，永不答复，但留在状态投影里（`hung`）；`hang` 与 `reject`、`fail` 一样计入场景的 `breaches` 预算。带 `signal` 的端口调用（线路的 `send`、`openGet`，元数据取回）在 `signal` 触发时当即收场，如 `line.ts` 所承诺；已答 `hang` 的调用除外。
- 探索器经内存线路驱动会话，不经 `stdio-line.ts` 与 `http-line.ts`：这两条线路的逐字节处置与写端次序由 `stdio.spec.ts`、`http.spec.ts`、`conformance.spec.ts` 承担，不在探索器的范围内。

## 探索器引擎与生命周期探索器的异同

本成员的引擎在 `tests/model/explore.ts` 内写，不从 `packages/mcp/mcp/tests/model/` 导入。与连接表生命周期的探索器（`packages/mcp/mcp/tests/model/explore.ts`）相同的部分：宽度优先枚举、按投影去重、每次选择之后 `setImmediate` 跑完反应、`maxDepth` 处把状态驱动到静止再核对、未处理拒绝经 `process.on('unhandledRejection')` 归到当前运行、重放时核对路径未偏离、违例按最短调度收集。不同的部分：被测对象是 `Session` 而不是连接表，端口是线路／凭据句柄／元数据／计时而不是 MCP 端口，动作是传输的客户操作与线路事件而不是 `ensure`/`release`/`closeAll`/`lose`，没有多键隔离一类的场景。两者的引擎骨架相同、端口与性质不同。把引擎抽成共用设施的事不在本成员内处理。

## 运行命令

在仓库根运行：

```sh
VITEST_MAX_WORKERS=3 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local
node scripts/with-test-slot.mjs python3 packages/mcp/mcp-host-local/verification/models/run.py
```

第一条运行成员全部用例，含探索器的快层与慢层。只跑探索器时，在成员目录运行 `NO_COLOR=1 pnpm exec vitest run --mode fast tests/model` 与 `NO_COLOR=1 pnpm exec vitest run --mode slow --typecheck.enabled=false tests/model`。第二条运行 TLC 的全部配置，判读规则与配置表见 [models/README.md](models/README.md)；加 `--mutations` 运行模型的有效动作变异（[models/README.md](models/README.md#有效动作的变异)）。

探索器的负控在成员目录运行 `node tests/model/mutate.ts`。可以带负控名，也可以加 `--out <目录>` 保留每个负控的输出。它按 [tests/model/mutants.ts](../tests/model/mutants.ts) 的表把缺陷放进 `src/`，运行指定用例，按字节还原源码，全部变红才退出 0。

## 证据状态

状态的词按 [docs/verification.md](../../../../docs/verification.md#分别表述这六种状态)「分别表述这六种状态」。每种状态对每条性质的结论在 [SPEC.md「性质与证据」](../SPEC.md#properties)。本节记录范围与运行。

探索器（Node v26.12.0，2026-11-06 UTC 01:57，本闭包基线 `06b98034d`，单线程测量，耗时只作量级）：

| 场景             | 上限                                                                                                                                                              | 状态数 | 重放数 | 最深调度 | 耗时   | 层  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | -------- | ------ | --- |
| `minimal`        | HTTP＋句柄；1 次 `call`（带 signal）；`close()`；`authorize` 可挂起（1 次端口违约）                                                                               | 31     | 40     | 5        | 0.01 s | 快  |
| `http-call`      | HTTP＋句柄；1 次 `call`（带 signal）、`close()`；各类拒绝与交换失败；`authorize` 可答失败，句柄的两个方法与元数据取回可 reject 或挂起；1 次线路故障、1 次端口违约 | 125    | 215    | 9        | 0.09 s | 快  |
| `http-peer`      | HTTP＋句柄；1 次 `call` 的应答流带对端 `ping`、`close()`                                                                                                          | 26     | 29     | 6        | 0.01 s | 快  |
| `http-bare`      | HTTP 无句柄；`call`、`listActions`、`close()`；401/403 无句柄可听                                                                                                 | 442    | 609    | 8        | 0.31 s | 快  |
| `stdio-call`     | stdio；`call`（带 signal）、`cancelRequest`、`close()`；共用流可结束或断开；1 次端口违约                                                                          | 191    | 309    | 8        | 0.08 s | 快  |
| `stdio-discover` | stdio；`discover`（探测时限可触发）、对端 `ping`、`close()`；1 次端口违约                                                                                         | 1905   | 3631   | 10       | 1.05 s | 快  |
| `http-resend`    | HTTP＋句柄；`listActions`、`updateTask`、`close()`；流断开或空 2xx 两次                                                                                           | 2927   | 4110   | 12       | 1.85 s | 慢  |
| `sse-fallback`   | HTTP＋句柄；只会旧 HTTP+SSE 的对端上 `discover`、`listActions`、`close()`                                                                                         | 4786   | 7110   | 17       | 5.04 s | 慢  |

「状态数」是去重后的投影数，「重放数」是从头重放的调度数。每个场景都没有违例，也没有一次重放偏离。上限的完整写法在 [tests/model/scenarios.ts](../tests/model/scenarios.ts)。

取数的做法：对 `scenarios.ts` 的每个场景调用 `explore(scenario)`（`tests/model/explore.ts`），读返回值的 `states`、`runs`、`depth` 与 `elapsedMs`。用例 `session-model.spec.ts` 只断言没有违例，不打印这些数。快层与慢层的用例在同一个提交上各通过一次：快层 8 条通过、3 条被慢层标签排除，慢层 3 条通过、8 条被快层标签排除。

TLC 的配置、上限与结果见 [models/README.md](models/README.md#运行记录)。

<a id="两种证据能变红"></a>

## 两种证据能变红

每条性质在两边都有能使它变红的缺陷。探索器一边是源码变异：[tests/model/mutants.ts](../tests/model/mutants.ts) 列出每个负控的缺陷、替换文本、用例与预期的变红原因，`node tests/model/mutate.ts` 把它放进 `src/`、运行用例、按字节还原源码。模型一边分两类：负控配置在模型里放进一处缺陷（`Bugs`），TLC 给出违反所列不变式的轨迹；有效动作的变异在模块的副本上改一段有效动作，正控配置的目标不变式变红（`run.py --mutations`）。第二类证明不变式量的是状态，不是缺陷分支里的标志。两类的表与运行记录见 [models/README.md](models/README.md#有效动作的变异)。

| 性质                | 探索器负控（缺陷 → 场景 → 变红的签名）                                                                                                                                                                                                                                                                                        | TLC 负控（缺陷注入）                                                                                                                                                                     | TLC 有效动作的变异（至少一个）                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| V1 恰好结算一次     | 手工变异：`sendOut` 去掉授权返回之后的 `inFlight` 核对 → `minimal` → `V1-line.send-after-settle`；未入 `mutants.ts`，见下文「V1 的探索器负控」                                                                                                                                                                                | `bad-resettle`（迟到的应答再次结算）                                                                                                                                                     | `V1-close-resettles-done`、`V1-late-answer-resettles`                             |
| V2 关闭之后不碰凭据 | `mV2-forgets-close`（`usable` 忽略 `closed`，且 `callHandle` 不核 `closed`，两处守卫）→ `http-bare`、`http-call` → `V2-authorize-after-close`                                                                                                                                                                                 | `bad-cred-after-close`（关闭之后开始的请求仍授权）                                                                                                                                       | `V2-begin-ignores-closed`、`V2-late-refusal-reports`（关闭之后迟到的拒绝仍报告）  |
| V3 拒绝至多一次     | `mV3-report-twice`（`reportRejection` 调两次）→ `http-call` → `V3-more-than-refusals`                                                                                                                                                                                                                                         | `bad-report-twice`（一次拒绝报告两次）                                                                                                                                                   | `V3-discovery-reports-again`、`V3-report-without-handle`                          |
| V4 有界             | `mV4-signal-dead`（`signal` 不停下在途项）→ `minimal` → `V4-unsettled-call`；`mV4-close-settles-after-line`（`close()` 先等线路再结算）→ `minimal` → `V4-unsettled-call`；`mV4-caller-follows-workflow`（调用方跟着工作流等：`begin` 等 `sendOut`，`once` 与 `call` 等 `begin`）→ `minimal` → `V4-unsettled-call-authorizing` | `bad-signal-dead`（`signal` 不结算）；`bad-close-settles-after-line`（`close()` 等线路关闭之后才结算）；`bad-caller-waits-workflow-close`、`-signal`（调用方跟着工作流等，凭据句柄挂起） | `V4-close-keeps-caller`、`V4-close-waits-discovery`、`V4-signal-leaves-discovery` |
| V5 不代调用方重发   | `mV5-resend-any`（写类也再发）→ `http-resend` → `V5-write-resent`                                                                                                                                                                                                                                                             | `bad-resend`（写类再发）                                                                                                                                                                 | `V5-write-resends`、`V5-read-resends-twice`                                       |
| V6 三相的去向       | `mV6-close-not-sent`（已交给线路的请求答 `not-sent`，不答 `abandoned`）→ `http-call` → `V6-sent`；`mV6-authorizing-abandoned`（授权中的请求答 `abandoned`）→ `minimal` → `V6-authorizing`                                                                                                                                     | `bad-close-not-sent`（已交给线路的请求答 `notSent`）                                                                                                                                     | `V6-close-auth-abandoned`、`V6-close-disc-not-sent`、`V6-signal-sent-not-sent`    |

`mutants.ts` 另有四个负控，证明线路用例能变红，不属于 V1–V6：`mStdio-writes-boolean`（重叠写的计数改回布尔）、`mStdio-no-cross-chunk-bound`（未换行部分不核上界）、`mStdio-failed-write-sent`（写被拒绝仍答 `sent`）、`mStdio-drops-tail`（EOF 处没有换行的尾行被丢弃）。各由 `tests/lines.spec.ts` 的一条用例捕获，见 [SPEC.md](../SPEC.md#h6) 的 H6 与 H8。

探索器的 `mV4-close-settles-after-line` 与模型的 `bad-close-settles-after-line` 注入的是同一个缺陷：`close()` 先等线路、后结算。两边的名字各自说明缺陷。

V2 的探索器负控要换两处：`usable` 对 `closed` 的核对，与 `callHandle` 对 `closed` 的核对。工作流每一步经 `usable` 核对，每个凭据调用又经 `callHandle` 核对。两层各自守住「关闭之后不碰凭据」。只去掉一层，另一层仍然成立，所以单点变异不会变红。

V1 的探索器负控：`Session.settle` 只在条目还在在途表里时兑现，兑现用 `Promise.withResolvers` 的 resolve，第二次调用没有作用。这一对守卫只拦「同一条目再被结算一次」。再结算一次没有端口调用，探索器的 V1 形式（为已结算的请求再调用端口）看不见它：手工去掉 `settle` 的表守卫（`if (!this.pending.delete(entry.id)) return` 改为不返回），探索器快层仍全绿。

能让探索器的 V1 变红的是工作流里的守卫。手工去掉 `sendOut` 在 `authorize` 返回之后的 `if (!this.inFlight(entry)) return`，授权返回时已结算的请求仍写到线路。`minimal`、`http-call`、`http-peer` 三个场景报 `V1-line.send-after-settle`，`minimal` 的调度是 `call / close / answer credential.authorize:handle ok`。这个变异是手工放入的，没有入 `mutants.ts`，`mutate.ts` 不复跑它。「再结算一次」本身由模型的 `settles` 计数覆盖（`bad-resettle` 与两个变异）。

模型不覆盖、由既有用例承担的两处：旧 HTTP+SSE 的 GET 收到 401 头、正文到齐前 `close()`，是一次端口答复内部的更细次序，由 `http.spec.ts` 承担；stdio 一行超过 16 MiB 的字节上界是 `stdio-line.ts` 的逐字节处置，探索器不经 stdio 线路，由 `stdio.spec.ts` 承担。见 [SPEC.md「性质与证据」](../SPEC.md#properties) 的未覆盖。

## 维护

修改会话的源码、端口替身或性质时，同步更新 [TransportSession.tla](models/TransportSession.tla)、`tests/model/` 与本页的映射，再重跑两种证据。新加一条性质时，同时在模型里加一个负控与一个有效动作的变异、在探索器上做一个变异（或说明为何只有一边能变红），证明能变红。单次运行的原始输出留任务 `tmp/`，不进本目录。

## 本包事实

- 当前内容：会话请求生命周期的 TLA+ 模型、12 份配置、14 个有效动作的变异、运行脚本，以及 `tests/model/` 的有界穷举探索器。
- 状态：见上面的运行记录与 [SPEC.md「性质与证据」](../SPEC.md#properties)。这不是证明，也不表示实现符合模型。
- 负责人：本包的维护者。会话的等待点或结算次序变化时，先改模型与探索器的对应动作，再重跑两种证据。

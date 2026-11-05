# verification

本目录承载会话请求生命周期的性质证据：TLA+ 模型、模型与实现之间的映射、运行命令与证据状态。性质 V1–V6 的定理陈述归 [SPEC.md「性质与证据」](../SPEC.md#properties)，本页不重复定理。对真实实现的有界穷举探索器在 [tests/model/](../tests/model/session-model.spec.ts)，它是本页第二种证据。

## 允许的内容

`models/` 下的形式模型、配置与运行脚本，`proofs/` 下的论证，以及说明文件。单次运行的原始输出留任务 tmp，不进本目录。

## 边界

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。本页的结论只在下表的上限与模型的抽象之内成立。模型通过不表示任意规模下正确，也不表示实现符合模型。本页不写「已证明」。

<a id="两种证据与各自范围"></a>

## 两种证据与各自范围

| 证据 | 是什么 | 能支持的结论 | 不能支持的结论 |
| --- | --- | --- | --- |
| 有界穷举探索器 | [tests/model/](../tests/model/session-model.spec.ts)：驱动真实的 `Session`，线路、凭据句柄、元数据取回与计时都是可编程替身。宽度优先枚举上限内的全部调度 | 在场景的上限内，本包的 `src/session.ts` 在所列可观察投影上满足或违反性质 | 真实线路、真实进程与对端，上限之外的调度，投影之外的状态，`stdio-line.ts` 与 `http-line.ts` 的内部次序 |
| TLA+ 模型与 TLC | [models/TransportSession.tla](models/TransportSession.tla)：会话请求生命周期的行为模型。TLC 穷举每个配置的全部可达状态 | 在配置的上限内，模型满足或违反所列性质 | 实现符合模型、上限之外的规模、模型省略的部分 |

两种证据之间没有精化证明。对应关系由下面的映射，以及两边对同一类缺陷给出的反例的对照支持。

## 动作映射

一次事件循环的一轮是一个外部动作，之后的内部步一直运行到没有纤程可运行。探索器在每次选择之后等一次 `setImmediate`，于是全部 promise 反应运行完，Node 也报告完未处理的拒绝。模型把这叫静止（`Next` 的一步加上它的内部效果）。

模型把一个请求分成两样东西：在途项（相、答复、调用方的等待）与会话拥有的后台工作流（等句柄、等线路、等发现）。实现一列按目标结构写：工作流入口、出发点、按相结算；函数名以 `w3-mcp-host-fix2` 交回为准，对齐由后面的闭包做。

| 模型动作（TransportSession.tla） | 探索器的调度选择（tests/model/explore.ts） | 实现（src/session.ts，除非另注） |
| --- | --- | --- |
| `Begin(r)` | `discover`、`call`、`list`、`update`（客户操作开始） | 登记在途项，经工作流入口启动后台工作流（授权 → 组成 → 写出）；关闭之后或 `signal` 已触发时当场答 `not-sent`，不起工作流 |
| `AuthDone(r)` | `answer credential.authorize ok`，之后 `dispatch` | 工作流在 `authorize` 返回后核 `usable`，把请求交给线路；在途项已结算时丢弃 |
| `Answer(r)` | `answer line.send answer`、`answer <流> result` | 应答分类后按在途项结算；已结算的在途项不再结算 |
| `Refuse(r)` | `answer line.send 401`、`answer line.send 403+scope` | 对尚未结算的在途项报告拒绝（`reportRejection`）并进入授权发现；已结算的不报告、不发现 |
| `Broken(r)` | `answer line.send aborted/5xx/empty`、`answer <流> break`、`event broken/ended` | 流断开的结论：读类再发一次（重新授权），写类答 `broken`；已结算的丢弃 |
| `DiscDone(r)` | `answer fetchMetadata`（发现结束） | 元数据取回返回后按在途项结算 `not-sent`（`authorization-required`）；已结算的丢弃取到的内容 |
| `Signal(r)` | `signal <op>` | 调用方的 `signal`：当场按相结算在途项，放开调用方的等待 |
| `Close` | `close` | `close()`：标记关闭，按相同步结算全部在途项，中止各控制器 |
| `LineClosed` | `close` 之后的 `drain` | 线路的 `close()` 答复，`close()` 返回 |

## 状态映射

| 模型变量 | 探索器观察 | 实现 |
| --- | --- | --- |
| `st[r]`、`out[r]` | 操作的 `status` 与 `result`；待决端口调用的调用点推出的相（`phaseOf`） | 在途项的相与它的结算 |
| `cw[r]` | 调用方拿到的 promise 是否已结算（`call` 的 `answer`、操作的结果） | 调用方等的那个 promise |
| `wf[r]` | 待决端口调用的调用点 | 后台工作流所在的 `await` |
| `sends[r]` | 替身账本里该操作的请求号（`ledger.sent`、`op.requests`） | 请求号的分配与写出 |
| `refusals`、`cred` | 探索器交付的 401/403-scope 数；账本的 `authorizations`、`rejections` | 凭据句柄的调用 |
| `signalled` | `op.signalled` | 调用方的 `AbortController` |
| `closed`、`closeDone` | `closeCalled`、`closeReturned` | `Session.closed`，`close()` 的 resolve |
| `cutAt[r]`、`firstOut[r]`、`settles[r]`、`credAtClose` | 性质检查记下的相、首次结算值与关闭时的计数 | 无（只为性质；由有效动作写入，不是缺陷分支的标志） |

模型的抽象：

- 一次内部步是一个异步函数在两个 `await` 之间的同步部分。模型不展开一次端口答复内部的更细次序（例如应答头与应答体之间）。
- 线路、对端与真实协议抽象成会话据以得出结论的应答：结果、拒绝（401 或带 `insufficient_scope` 的 403）、流断开、没有应答。模型不建 stdio 与 HTTP 的具体线路、字节上界、退出窗口、旧 HTTP+SSE 的 endpoint 协商。
- 请求类只分读与写（`Writes`）：读在流断开后再发一次，写不再发。模型不建每种方法的具体归类（那归契约 T8 与它自己的证据）。
- 端口可以挂起：答复它的动作不被选中。`signal` 与 `close()` 不等挂起的线路、凭据端口或元数据取回，自己结算在途项并放开调用方。挂起的端口调用留在后台工作流里；它之后答复时，工作流丢弃答复。
- 调用方的等待 `cw[r]` 是调用方对一个请求的最后一个等待：`call` 的 `answer`，或读写类操作的结果。`call` 自己的 promise 在出发点或结算时兑现，不晚于 `answer`，模型不单独建它。没有 `signal` 的操作对应 `Signal(r)` 不被选中的行为。
- 凭据句柄答失败或 reject（契约 T9）、线路的 `send` reject、`cancelRequest` 的通知与旧 HTTP+SSE 的回退 GET 不在模型里。

探索器的近似：

- 状态按投影去重：消费者可见的操作、待决端口调用及其调用点（`src/` 的函数栈）与上下文、线路事件账本、计时与预算。投影不含 promise 的续体。用例「the projection」在 `http-call` 场景上核对去重与不去重找到同一组违例及其最短深度。
- 每次重放都核对路径与上一状态的投影；本次运行没有一次偏离，所以在这些调度下实现是确定的。
- 探索器经内存线路驱动会话，不经 `stdio-line.ts` 与 `http-line.ts`：这两条线路的逐字节处置与写端次序由 `stdio.spec.ts`、`http.spec.ts`、`conformance.spec.ts` 承担，不在探索器的范围内。

## 探索器引擎与生命周期探索器的异同

本成员的引擎在 `tests/model/explore.ts` 内写，不从 `packages/mcp/mcp/tests/model/` 导入。与连接表生命周期的探索器（`packages/mcp/mcp/tests/model/explore.ts`）相同的部分：宽度优先枚举、按投影去重、每次选择之后 `setImmediate` 跑完反应、`maxDepth` 处把状态驱动到静止再核对、未处理拒绝经 `process.on('unhandledRejection')` 归到当前运行、重放时核对路径未偏离、违例按最短调度收集。不同的部分：被测对象是 `Session` 而不是连接表，端口是线路／凭据句柄／元数据／计时而不是 MCP 端口，动作是传输的客户操作与线路事件而不是 `ensure`/`release`/`closeAll`/`lose`，没有多键隔离一类的场景。两者的引擎骨架相同、端口与性质不同；是否抽成共用设施由派发者判断。

## 运行命令

在仓库根运行：

```sh
VITEST_MAX_WORKERS=3 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local
node scripts/with-test-slot.mjs python3 packages/mcp/mcp-host-local/verification/models/run.py
```

第一条运行成员全部用例，含探索器的快层与慢层。只跑探索器时，在成员目录运行 `NO_COLOR=1 pnpm exec vitest run --mode fast tests/model/session-model.spec.ts`，慢层用 `--mode slow --typecheck.enabled=false`。第二条运行 TLC 的全部配置，判读规则与配置表见 [models/README.md](models/README.md)。第二条加 `--mutations` 运行模型的有效动作变异（[models/README.md](models/README.md#有效动作的变异)）。

## 证据状态

状态的词按 [docs/verification.md](../../../../docs/verification.md#分别表述这六种状态)「分别表述这六种状态」。每种状态对每条性质的结论在 [SPEC.md「性质与证据」](../SPEC.md#properties)。本节记录范围与运行。

探索器（Node v26.12.0，2026-11-05，单线程测量，耗时只作量级）：

| 场景 | 上限 | 状态数 | 重放数 | 最深调度 | 耗时 | 层 |
| --- | --- | --- | --- | --- | --- | --- |
| `minimal` | HTTP＋句柄；1 次 `call`（带 signal）；`close()` | 29 | 35 | 5 | 0.05 s | 快 |
| `http-call` | HTTP＋句柄；1 次 `call`（带 signal）、`close()`；各类拒绝与交换失败，1 次端口违约 | 87 | 127 | 7 | 0.09 s | 快 |
| `http-peer` | HTTP＋句柄；1 次 `call` 的应答流带对端 `ping`、`close()` | 26 | 29 | 6 | 0.05 s | 快 |
| `http-bare` | HTTP 无句柄；`call`、`listActions`、`close()`；401/403 无句柄可听 | 442 | 609 | 8 | 0.3 s | 快 |
| `stdio-call` | stdio；`call`（带 signal）、`cancelRequest`、`close()`；共用流可结束或断开 | 182 | 294 | 8 | 0.15 s | 快 |
| `stdio-discover` | stdio；`discover`（探测时限可触发）、对端 `ping`、`close()` | 2035 | 3828 | 10 | 1.3 s | 快 |
| `http-resend` | HTTP＋句柄；`listActions`、`updateTask`、`close()`；流断开或空 2xx 两次 | 2927 | 4110 | 12 | 1.8 s | 慢 |
| `sse-fallback` | HTTP＋句柄；只会旧 HTTP+SSE 的对端上 `discover`、`listActions`、`close()` | 5146 | 7232 | 17 | 4.7 s | 慢 |

「状态数」是去重后的投影数，「重放数」是从头重放的调度数。每个场景都没有违例，也没有一次重放偏离。

TLC 的配置、上限与结果见 [models/README.md](models/README.md#运行记录)。

<a id="两种证据能变红"></a>

## 两种证据能变红

每条性质在两边都有能使它变红的缺陷。探索器一边是源码变异：在 `src/session.ts` 里放进一处缺陷，运行所列场景，探索器找到反例，然后按字节还原源码；变异的做法随 `tests/` 入库，名字与运行记录以 `w3-mcp-host-fix2` 交回为准。模型一边分两类：负控配置在模型里放进一处缺陷（`Bugs`），TLC 给出违反所列不变式的轨迹；有效动作的变异在模块的副本上改一段有效动作，正控配置的目标不变式变红（`run.py --mutations`）。第二类证明不变式量的是状态，不是缺陷分支里的标志。两类的表与运行记录见 [models/README.md](models/README.md#有效动作的变异)。

| 性质 | 探索器变异（源码 → 场景 → 反例性质） | TLC 负控（缺陷注入） | TLC 有效动作的变异（至少一个） |
| --- | --- | --- | --- |
| V1 恰好结算一次 | 无单点源码变异（结构上由 `Deferred` 的一次性与 `settle` 的删除双重保证；见下文） | `bad-resettle`（迟到的应答再次结算） | `V1-close-resettles-done`、`V1-late-answer-resettles` |
| V2 关闭之后不碰凭据 | `mV2-send-after-close`（`send` 不拒绝关闭后开始的请求）→ `http-resend` → `V2-authorize-after-close` | `bad-cred-after-close`（关闭之后开始的请求仍授权） | `V2-begin-ignores-closed`、`V2-late-refusal-reports`（关闭之后迟到的拒绝仍报告） |
| V3 拒绝至多一次 | `mV3-report-twice`（`reportRejection` 调两次）→ `http-call` → `V3-more-than-refusals` | `bad-report-twice`（一次拒绝报告两次） | `V3-discovery-reports-again`、`V3-report-without-handle` |
| V4 有界 | `mV4-signal-dead`（`signal` 不中止在途）→ `http-call` → `V4-unsettled-sent`；`mV4-close-after-line`（`close()` 先等线路再结算）→ `http-call` → `V4-close-after-line`；调用方跟着工作流等的变异与新的 V4 由 `w3-mcp-host-fix2` 交回 | `bad-signal-dead`（`signal` 不结算）；`bad-close-settles-after-line`（`close()` 等线路关闭之后才结算）；`bad-caller-waits-workflow-close`、`-signal`（调用方跟着工作流等，凭据句柄挂起） | `V4-close-keeps-caller`、`V4-close-waits-discovery`、`V4-signal-leaves-discovery` |
| V5 不代调用方重发 | `mV5-resend-any`（写类也再发）→ `http-resend` → `V5-write-resent` | `bad-resend`（写类再发） | `V5-write-resends`、`V5-read-resends-twice` |
| V6 三相的去向 | `mV6-close-not-sent`（`close()` 答 `not-sent` 而非 `abandoned`）→ `http-call` → `V6-sent` | `bad-close-not-sent`（已交给线路的请求答 `notSent`） | `V6-close-auth-abandoned`、`V6-close-disc-not-sent`、`V6-signal-sent-not-sent` |

探索器的 `mV4-close-after-line` 与模型的 `bad-close-settles-after-line` 注入的是同一个缺陷：`close()` 先等线路、后结算。两边的名字各自说明缺陷。

V1 的探索器负控说明：结算之后，`settle` 从在途表删除该项，`Deferred.resolve` 又拒绝第二次兑现，两处各自独立地保证「恰好一次」。要在探索器里让 V1 变红需要同时去掉这两处，不是一处源码变异。因此 V1 的负控放在 TLA+ 模型（`bad-resettle` 让一个已结算的请求再次结算；两个有效动作的变异分别让 `close()` 与迟到的应答再次结算）。探索器一侧保留 `callAfterSettled` 检查：若将来一处改动让一个已结算请求再被授权或再发请求，它会变红。

模型不覆盖、由既有用例承担的两处：旧 HTTP+SSE 的 GET 收到 401 头、正文到齐前 `close()`，是一次端口答复内部的更细次序，由 `http.spec.ts` 承担；stdio 一行超过 16 MiB 的字节上界是 `stdio-line.ts` 的逐字节处置，探索器不经 stdio 线路，由 `stdio.spec.ts` 承担。见 [SPEC.md「性质与证据」](../SPEC.md#properties) 的未覆盖。

## 维护

修改会话的源码、端口替身或性质时，同步更新 [TransportSession.tla](models/TransportSession.tla)、`tests/model/` 与本页的映射，再重跑两种证据。新加一条性质时，同时在模型里加一个负控与一个有效动作的变异、在探索器上做一个变异（或说明为何只有一边能变红），证明能变红。单次运行的原始输出留任务 `tmp/`，不进本目录。

## 本包事实

- 当前内容：会话请求生命周期的 TLA+ 模型、12 份配置、14 个有效动作的变异、运行脚本，以及 `tests/model/` 的有界穷举探索器。
- 状态：见上面的运行记录与 [SPEC.md「性质与证据」](../SPEC.md#properties)。这不是证明，也不表示实现符合模型。
- 负责人：本包的维护者。会话的等待点或结算次序变化时，先改模型与探索器的对应动作，再重跑两种证据。

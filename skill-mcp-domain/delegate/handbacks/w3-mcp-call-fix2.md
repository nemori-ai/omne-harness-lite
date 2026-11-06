# 闭包 w3-mcp-call-fix2 交回

## 1. 结论

做完。工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，分支 `PanQiWei/skill-mcp-w3-mcp-call`，基线 `5204d3799`，最终 head **`0b84a0bec`**，`git status` 干净，未推送。验收 1–9 全部达到；写范围外没有改动（除 `src/status.ts` 一行，见第 8 节）。期间两次被宿主限流中断，恢复后核对过工作树再接续，所有证据都在最终 head 或注明的提交上重跑。

加载的技能：ub-mode、pstack:typescript-best-practices、asd-ste100（写 SPEC 前）。

## 2. 提交（5 个，作者/提交者均为 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code` / `Agent-Role: developer`）

| 提交 | 内容 |
|---|---|
| `c9851cfe7` | 第 2 条的红灯用例（6 条在基线上红）+ 替身 `armedEligibility`、`countedReads` |
| `38eb40b92` | 结构整理（第 4–8 条）：占位句柄、`lose`/`markLost` 同步前缀入签名、一条规则一处、依赖类型各自声明、可读性；探索器计数视图改观察句柄；行为不变，原有用例原样通过 |
| `b3b806020` | 行为（第 1–3 条）：任务号跨账户碰撞转「有歧义」；关停之后不问端口（`under`、`refresh`、任务关口后再判）；第 8 步核停止信号。六条红灯转绿 |
| `f34077cec` | 守卫（第 11 条）、用例缺口（第 12 条）、两次微任务扫描及其带来的决定点收口（见第 8 节自定裁定 2、4）、探索器键 E 与 `task-collision`、`Calls.tla` 同步、成员 SPEC 与契约 S8 一句 |
| `0b84a0bec` | `lostOfOutcome` 圈复杂度从 8 回到 3（度量在 f34077cec 上报它 CRAP 12.1）；`sendOrder` 一句过时注释 |

`git diff --stat 5204d3799..HEAD`：29 files, +1073/−438。

## 3. 改了哪些文件

**src/**
- `calls.ts`：`CallsDependencies` 自己声明；`under` 只在等待前核停止信号与关停、交出 `STOPPED` 哨兵或 `fail(CONNECTION_UNAVAILABLE)`；`prepare`（步 3–7，入口 `isShut` 折进 `under`）；`connectionOf`（步 7，`ensure` 失败在闭包里映射）；`loseUnlessStopReply`（原 `notSentBy`）；`applyAnswer`（原 `outcomeOf`，上下文经 `classificationOf`，转 `lost` 经 `lostOfOutcome`）；`sendOrder`（步 3–12，第 8 步在同一段同步执行里核停止信号与关停，T9 用 `CALL_BREACHED` 哨兵并经句柄 `sent`）；`perform`（无 `let`，`try/finally` 一次 `place.conclude()`，答复时 `STOPPED ∨ (not-sent ∧ stop.aborted)` → `cancelled`，唯一一处）；`Sent` 去掉 `access`；`CONNECTION_UNAVAILABLE` 取 `entry.ts` 的。
- `tasks.ts`：`TasksDependencies` 自己声明；`failureOfEnsure` 的 connect 阶段经共用的 `connectionFailureOfBuild`；`built` 在关口之后再判 `isShut` → `NO_CONNECTION`；`request` 把 `'ambiguous'` 当表外；`asIs` 去掉无用参数（`read` 的参数序改为 `(answer, on)`）；`ensureOptionsOf`、`classificationOf` 共用。
- `invoker.ts`：`InvokerDependencies = CallsDependencies & TasksDependencies`。
- `discovery.ts`：`refresh` 先判关停再过关口；用 `ensureOptionsOf`。
- `internal/in-flight.ts`：`reserve` 交出 `Reservation { stop, sent, conclude }`，阶段只在表的 `Cell` 里；`markSent`、`conclude(key, phase)`、`CallPhase` 与 `TypeError` 守卫删除；`conclude` 幂等。
- `internal/task-table.ts`：`record` 碰撞转 `'ambiguous'`（`Ambiguous` 类型），`get` 交出 `TaskRecord | Ambiguous | undefined`。
- `internal/lost.ts`：`loseOn`/`loseInScope` 消费 `Losing`；新增 `connectionFailureOfBuild`、`lostOfOutcome`；本地常量删除。
- `internal/table.ts`：`lose` 改同步，返回 `Losing | 'not-current'`；新增 `ensureOptionsOf`。
- `internal/build.ts`：`markLost` 改同步，返回 `Losing { done }`；`failed` 用 `.done`。
- `internal/classification.ts`（新）：`classificationOf`。
- `internal/guard.ts`：`withdraws` 收 `GateDecision`，`decideForUse` 去掉只为类型存在的 `!== 'admitted'`（D 的 `guard.ts:57` 站点消失）。
- `status.ts`：随 `withdraws` 签名去掉一行 `decision.kind !== 'admitted' &&`（范围说明见第 8 节）。

**tests/**
- `unhandled.ts`（新，setup）+ `vitest.config.ts` 的 `setupFiles`。
- `in-flight.spec.ts` 按句柄改写（断言不放宽；被删的两条见第 8 节）；`invoke.spec.ts`（`shape`、`gateCalls`、step 3 两条、step 3 关停扫描、step 4 and 7 `connectBound`、step 9 首次调用无 `continuation`、step 12/13 标签）；`continue.spec.ts`（`shape`、关停落在关口途中、只带 `inputResponses`）；`cancel.spec.ts`（第 8 步扫描、答复时停止信号扫描、`session-ended` 仍转 lost）；`refresh.spec.ts`（关停后未采用接入点）；`tasks.spec.ts`（碰撞两条、关口等待时 `closeAll`、`settings` 两支、`invokeTask` 带关联键/代际）；`ensure.spec.ts`/`continue.spec.ts`/`invoke.spec.ts` 的 `table.lose` 调用改 `loseOn`。
- `doubles/stalls.ts`：`armedEligibility`、`adoptionBefore`；`doubles/ports.ts`：`countedReads`。
- `model/explore.ts`：`CountedInFlight` 观察句柄，`ReservationDesk.concluded(key)`，键 `E`，`lose`/`drop` 经 `loseOn`；`model/scenarios.ts`：`A_STARTED_TASK` 前奏与 `TASK_COLLISION`；`model/calls.spec.ts`：`task-collision`（慢层）。

**文档/模型**
- `SPEC.md`：MC-7、MC-12、MC-16（步 2、3、8–13、映射表第 1/3 行、变异列表）、MC-17（步 1、3、反例、变异列表）、偏离表（T5 例外）、「所有权」（句柄、作用域里的标记可晚于 `closeAll`、关停次序）、取消一段、已知限制（任务操作关口无界、`TaskRef` 不带账户）、「性质与证据」（P11 投影、P12 碰撞、P13）。
- `mcp-contract/SPEC.md` S8：只加一句「`closeAll` 之后，要连接的操作先判关停、不问端口，先于 S1 的采用核对；在途的操作在下一步之前判关停，答同样的结果；任务操作仍先按 S2 判发起者」。
- `verification/models/Calls.tla`：`gateW` 与 `tgateW` 在关口答 ok 之后读 `shut`。

过程产物：`tmp/closures/w3-mcp-call/fix2/{red,gates,model,mutations}/`。

## 4. 验收逐项（命令 → 退出码 → 尾部 → 日志 sha256 前 16 位）

**1.** `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp --filter=@omne-harness/mcp-contract`（head 0b84a0bec）：exit 0，`Tasks: 16 successful, 16 total`，mcp `445 passed (445)`，契约 `548 passed (548)`；`gates/turbo-0b84a0bec.log` `c0a4f3ebd87a18a9`（02:17）。`pnpm --filter @omne-harness/mcp run test:slow`：exit 0，`9 passed | 12 skipped (21)`，753 s；`gates/test-slow-0b84a0bec.log` `7ec61db14a428603`（02:30），末行 `exit=0`。

**2.** 红灯（`red/red-on-baseline.log` `768f0a9a66730521`，在基线源码上跑新用例，6 failed | 114 passed）：

| 用例 | 缺陷 | 基线上的读数 |
|---|---|---|
| tasks「a task id the peer gave again on another peer account makes the key ambiguous」 | 第二条记录覆盖第一条，`refA` 经账户 B 的连接发 `tasks/get` | `expected { ok: { status: 'working' } } to strictly equal { failure: { kind: 'unknown' } }` |
| invoke「step 3: after closeAll nothing is asked…」 | **基线上本来就绿**（基线在 `prepare` 入口已判关停）；补的是关口/存储/建连的端口次数断言。守住它的证据是变异 G9（删 `under` 等待前的关停读）→ 红 | — |
| invoke「step 3: closeAll while the call waits on the gate」 | 关停落在关口途中后又读了存储 | `expected 3 to be 2`（存储读取次数） |
| continue「closeAll while the continuation waits on the gate」 | 续调用答 `unknown` 而不是 `connection-unavailable` | `not-sent … to deeply equal …` |
| refresh「after closeAll: connection-unavailable before the gate」 | 先过关口，答 `not-available-to-you` | `{ Object (failure) } to deeply equal …` |
| tasks「closeAll while the operation waits on the gate: effect-unknown (no-connection)」 | 答 `connection-unavailable` | `{ Object (failure) } to deeply equal { failure: { …(2) } }` |
| cancel「step 8: at whichever microtask the cancel lands」 | k=54 时传输的 `call` 被以已触发的信号调用 | `k=54: transport.call entered with the stop fired: expected [ true ] to not include true` |

全部在 head 上绿（turbo/慢层日志）。

**3. 与 5. 变异表**（副本 `/tmp/fix2-mut/tree`，node_modules 以符号链接回指工作树，每次改后按字节还原；驱动 `mutations/mutate.py`；最终 head 的日志 `mutations/logs-final/*.log`、`table.json` `6bf7c488a87a7505`，`final-run.log` `2a1382f525fef311`，G16 在 0b84a0bec 上重跑 `6a9e4aac72836f10`）。23 条全部被杀：

| 变异（文件与位置） | 哪条用例变红 | 退出码 |
|---|---|---|
| G1 `table.ts` `ensureOptionsOf` 永远答 `{}` | invoke「step 4 and 7: the request connectBound stands in…」 | 1 |
| G2 `calls.ts` `checkRequest` 只看 `requestState` | continue「with the input responses alone is lawful too」 | 1 |
| G3 `tasks.ts` `failureOfEnsure` `'unknown'` 支答 `NO_CONNECTION` | tasks「…cannot be read again: unknown」 | 1 |
| G4 `tasks.ts` `failureOfEnsure` default 原样交出 | tasks「…is withdrawn by then: effect-unknown (no-connection)」 | 1 |
| G5 `guard.ts` `withdraws` 恒假 | gate「closes the connection of an endpoint a setting blocks」等 4 条 | 1 |
| G6 `calls.ts` `loseUnlessStopReply` 对任何已触发信号都不转 lost（旧 `calls.ts:239`） | cancel「…refuses for an ended session, is cancelled too, but the connection is lost」 | 1 |
| G7 `calls.ts` `callRequestOf` 首次调用也带 `continuation`（D 存活 `:126`） | invoke「step 9: a first call carries no continuation」 | 1 |
| G8 `calls.ts` `perform` 答复时不核 `stop.aborted` | cancel「that races the send…nothing is lost」等 3 条 | 1 |
| G9 `calls.ts` `under` 等待前不核关停（＝评审 MA、入口 isShut） | invoke「step 3: after closeAll nothing is asked」等 4 条 | 1 |
| G10 `calls.ts` 第 8 步不核关停 | invoke「step 3: at whichever microtask closeAll lands」 | 1 |
| G11 `tasks.ts` `built` 关口之后不再判关停 | tasks「closeAll while the operation waits on the gate」 | 1 |
| G12 `discovery.ts` `refresh` 不先判关停 | refresh「after closeAll: connection-unavailable before the gate」 | 1 |
| G13 `calls.ts` 第 8 步不核停止信号 | cancel「step 8: at whichever microtask the cancel lands」 | 1 |
| G14 `task-table.ts` `record` 不判碰撞 | tasks「…makes the key ambiguous」 | 1 |
| G15 `in-flight.ts` 第二次 `conclude` 删除已结束的键 | in-flight「concludes once」 | 1 |
| G16 `lost.ts` `lostOfOutcome` 去掉 `unknown` 支（D 存活 `:251`） | invoke「unknown (stream-breaks)…」等 3 条 | 1 |
| D1 旧 `calls.ts:216` → `prepare` 第 5 步的箭头答 `undefined` | invoke 30 条（首条「step 2: a second call…」）；**不再是运行错误** | 1 |
| D2 旧 `:252` → `applyAnswer` `lost !== undefined` 翻转 | invoke 16 条；不再是运行错误 | 1 |
| D3 旧 `:105` → `checkRequest` 的 continue 分支关闭 | continue 全部 + invoke（47 条） | 1 |
| D4 旧 `:229` → `prepare` 第二次 `issuedOn` 去否定 | continue/invoke 34 条 | 1 |
| D5 旧 `:281` → `answerOf` 的 `cancelRequest` 块清空 | cancel 7 条（首条「answers unknown to another principal…」） | 1 |
| D6 旧 `:303` → `perform` 的 try 体清空 | invoke 37 条 | 1 |
| D7 旧 `in-flight.ts:74` → `Reservation.conclude` 的 `delete` 去掉 | in-flight「lets an ended key be reserved again」等 9 条 | 1 |

D1/D2 在第 2 轮差分变异里是「运行错误」，现在是普通变红：这就是第 11 条守卫进 setup 的证明。

**D 的 22 个存活逐条处置**：`connectBound`（G1）、`inputResponses`（G2）、`tasks.ts:52/53/55`（共用函数 + G3/G4；`:52` `stage === 'connect' → true` 由 G4 的撤采用用例杀）、`guard.ts:57` 两条（站点删除 + G5）、`calls.ts:239`（G6）、`:126`（G7）、`:251`（G16）、`:167` 三条（`|| stop.aborted` 已删，站点消失；`'expired' → ""`/`→ false` 是类型诚实用的分支，`within` 只在 stop 触发时答 expired，等价）、`:302 'unsent'`（站点消失）、`:281 → true`（会让每个 complete 变 abandoned，由 step 12 用例杀；D5 的块清空也杀；当时存活是测量无效所致）；`:104/:108` 两条 `TypeError` 文字不是契约承诺，改不成可判定；`:118/:119` 三条与 `:248/:264`：`exactOptionalPropertyTypes` 要求的条件展开，运行时 `{x: undefined}` 与 `{}` 读出相同，等价，现在各收到一处（`ensureOptionsOf`、`classificationOf`、`applyAnswer` 的任务记录）。

**4.** `gates/greps-0b84a0bec.log` `6c35a4bf570eba17`：`grep -rn "markSent\|TypeError('markSent" packages/mcp/mcp/src` 空（exit 1）；`grep -n "let " calls.ts` 空；`table.ts:419 function lose(` / `:424 ): Losing | 'not-current' {`、`build.ts:165 function markLost(...): Losing {`（都不是 `async`、不返回 `Promise`）；`grep -n "from './invoker.ts'" calls.ts tasks.ts` 空。

**6.** 探索器（最终 head，turbo/慢层日志）12 个场景零违例：abort 148 states；call 263；call-faults 914；call-shutdown 1018；call-twice 18481；continue 1070；foreign-cancel 731；foreign-task 200；task 2221；task-account 5543；**task-collision 711 states, 1649 runs, depth 20**；task-methods 7775。碰撞变体在基线源码副本（`/tmp/fix2-mut/base`，`git archive 5204d3799` 的 src+tests 加键 E 与场景）上报 `P12 P12-task-on-foreign-connection: tA1 sent transport.getTask on the transport t1 of key E` 与 `P5-crossing`：`model/explorer-task-collision-baseline-5204d3799.log` `8583d306e86164e2`；修复后 `model/explorer-task-collision.log` `5584c8583c84294b`。负控 N1–N7、N3b、N4a–d 在新结构上照旧变红（`model/controls.py`，`controls-run.log` `89e60336263ca10e`，`controls/table.json` `d094db37402333a6`）；差异：N1 现在只报 P14 的三条，不再报 `P9-sent-after-stop`——第 8 步把发出挡住了。另加 N8（删碰撞规则）→ `task-collision` 报 P12。TLC：29 份配置全部判读符合预期（`model/tlc-all.log` `e61f1a2f61787715`，证据目录 `model/tlc/20261105T194113Z/`，summary 里 Calls 的 `model_sha256` 前缀 `096a2c50ced5b2e2` ＝ 提交里 `Calls.tla` 的 sha256）；`calls-valid-task` 74906 states，`calls-bad-send-after-shut` 仍违反 `P13_NoSendAfterShut`。

**7.** 最终 head 七项（`gates/*-0b84a0bec.log`）：typecheck exit 0 `Tasks: 86 successful`（`75deb8041d40cae6`）；lint:rules exit 0 `PASS … 6076 个提交的署名，无违反`（`06a79cd7f6656911`）；lint:oxlint exit 0 无输出（`3bb45224ba2ce5d7`）；lint:deps exit 0 `✔ 没有依赖违规…81 个成员、340 条成员边`（`e0b31059f6fe5324`）；format:check exit 0 `All matched files use the correct format`（`70549b5761e4a7f8`）；check:docs exit 0 `PASS: 2736 Markdown files`（`370623577405c36b`）；check:design exit 0 `PASS: 354 个词条…对账一致`（`07b0af04fe75d967`）；`git ls-files --eol | grep -c w/crlf` = 0（`76392a84bc0ad343`）。

**8.** `src/` 无 `as`（`as const` 除外）、无 `any`、无非空断言：greps 日志最后一条 exit 1（无命中）。

**9.** `pnpm run metrics --coverage --base b2ba7dc89`（head 0b84a0bec）：exit 0，mcp 覆盖率运行 1120 s 退出 0，**本次 `lifecycle.spec.ts > wide` 没有超时**（f34077cec 那次也没有，1127 s）；`gates/metrics-0b84a0bec.log` `4b85896486e93ffe`（03:01），审讯页 `/data/qiwei/repos/omne-harness-lite/tmp/metrics/0b84a0bec/review.html`。变更函数超 alert 1、超 warn 1，都不是本闭包新增：
- `discovery.ts:130 createDiscovery.publish` CC 17/覆盖 100%/CRAP 17；基线 5204d3799 上同为 CC 17/CRAP 17（`tmp/metrics/5204d3799/metrics.json`）。本闭包只改 `refresh`（加关停先判，CC 6）与 `ensureOptionsOf` 的调用，`publish` 一行未动。
- `table.ts:318 createConnectionTable.begin` CC 12/CRAP 12；基线上同为 12。本闭包只改 `table.ts` 的 `lose` 签名与 `ensureOptionsOf`，`begin` 未动。两者按 A 非阻断 4 的裁定本轮不改。
- 要求的读数（CC / 覆盖 / CRAP）：`perform` 5/100%/5（基线 5）；`prepare` 10/100%/10（基线 9，加了一个 `connectionOf` 分支，等于 warn 线、未超）；`under` 4/100%/4；`sendOrder` 7/100%/7；`applyAnswer` 4/100%/4；`answerOf` 2/100%/2；`failureOf` 7/78%/7.5（基线同）；`failureOfEnsure` 5/100%/5（基线 6/67%/7.3）；`built` 7/100%/7；`request` 7/100%/7；句柄：`InFlightCalls.reserve` 3/100%/3（含 `sent`、`conclude` 闭包）、`InFlightCalls.cancel` 7/83%/7.2（基线 7/82%/7.3）；`TaskTable.record` 4/100%/4；`lostOfOutcome` 3/100%/3（f34077cec 上 8/60%/12.1，已修）；`refresh` 6/100%/6；`table.lose` 3、`markLost` 1、`loseOn` 2、`loseInScope` 2、`connectionFailureOfBuild` 2、`classificationOf` 2、`ensureOptionsOf` 2、`withdraws` 2、`decideForUse` 1。

## 5. 门禁日志的时间与提交号

f34077cec：turbo 01:29（`d08de84757ec2524`）、test-slow 01:42（`25e47d6fa0e13da8`）、七项 01:29–01:35、metrics 02:1x（`gates/metrics-f34077cec.log`，报 lostOfOutcome 超 alert → 触发 0b84a0bec）。0b84a0bec：全部在上面第 4 节（02:17–03:01）。b3b806020：test-slow 19:37（`813bade62c93570f`，8 passed）。TLC 跑在 f34077cec 的工作树内容上（Calls.tla 之后未改，哈希对应）。

## 6. 命名账本

`Reservation`（占位句柄；探索器里别名 `Place`）、`Cell`（表里一键一格，句柄与表共持）、`STOPPED`/`Stopped`（`under` 与第 8 步的「已停止」哨兵）、`CALL_BREACHED`（T9 哨兵）、`Losing { done }`（`lose`/`markLost` 的同步前缀之后交回的拆除与标记）、`Ambiguous`（任务表的「有歧义」）、`applyAnswer`（原 `outcomeOf`）、`loseUnlessStopReply`（原 `notSentBy`）、`sendOrder`（步 3–12）、`connectionOf`（`calls.ts` 内第 7 步；与 `tasks.ts` 的 `connectionOf` 同名不同义，各自模块私有）、`connectionFailureOfBuild`、`lostOfOutcome`、`classificationOf`（`internal/classification.ts`）、`ensureOptionsOf`（`table.ts`）；用例替身 `armedEligibility`、`adoptionBefore`、`countedReads`、`gateCalls`；探索器 `STREAM_BROKEN`、键 `E`、`A_STARTED_TASK`、`TASK_COLLISION`；负控 N8。

## 7. 让排除文件里的句子过时的位置（下一闭包改）

- `README.md:95`、`README_ZH.md:95`：验证段只写到 P1–P8，探索器现在 12 个场景（含 `task-collision`）；B R2-9。
- `docs/flows.md:86`、`docs/object-model.md:50`：`markSent(key, …)` → 句柄 `sent(connection, generation)`；`conclude(key, phase)` → 句柄 `conclude()`；步号读法沿 MC-16 新文（第 3、8 步）。
- `verification/README.md`：`:43–47` 动作映射里的 `markSent`、`inFlight.conclude(key, phase)`、「在途表计数视图记下 markSent」；`:75`、`:105` 计数视图的描述（现观察句柄，`reserve`/`sent`/`conclude`）；`:171` F2 叙述里的「旧 markSent 答 cancelled」；`:173`、`:242`（C50「两种证据都表达不了」——现在有两条扫描用例：cancel「a cancel the call answers signalled, at whichever microtask」与 invoke「step 3: at whichever microtask closeAll lands」，且 `under` 等完之后的核对已删）；`:261` C07 引的「step 7: after closeAll」已改名为 step 3 且不再经过该行（SPEC 映射表第 1 行已改引「step 7: a call that joins」）；N 表：N1 的签名少了 `P9-sent-after-stop`，应加 N8；C 序列在最终 head 的重跑与 F1(d)/S8 补行归下一闭包（本闭包的 G/D 表可直接编入）；`:140` 等处的探索器读数表应换成第 4 节第 6 条的数字。
- `verification/models/README.md:19`：四键说法 → 五键（E ＝ alice 的另一账户），且 A 与 B/C 的差别按 `Calls.tla:71-73`（B R2-8）；配置表应注明 `gateW`/`tgateW` 在关口之后读 `shut`。
- 成员 SPEC 依据表仍钉契约 `104261a42`，S8 已改一句，由下一闭包更新出处（表达项）。

## 8. 自定裁定与理由；未覆盖项

**自定裁定（与裁定字面不同，派发者请先看证据再判）**

1. `under` 只有一个哨兵 `STOPPED`；「已关停」在 `under` 内直接答 `fail(CONNECTION_UNAVAILABLE)`，不再有第二个哨兵由 `prepare` 映射。做法是把 `ensure` 失败的映射挪进 work 闭包（`connectionOf`），`under` 的 F 统一为 `NotSentReason`，C 3 真正要的 `'stage' in` 区分消失；三个等待对关停的答复相同。证据：G9。
2. **`under` 等完之后不再核停止信号与关停**（裁定写「开始之前与等完之后都核」）。逐微任务扫描证明「等完之后核」关不上窗口：等待的答复与 `cancel`/`closeAll` 落在同一轮时，`under` 的后核过了，但 `under` 返回到 `prepare`、再到 `sendOrder` 还有 2–3 个微任务（`gaps-fast.log`：k=11 时 `cancel` 答 `signalled` 而调用答 `config-missing`；k=32 时 `transport.call` 在 `closeAll` 之后被调用）。改为在决定点核：下一次等待之前（`under` 的前核）、发出之前（第 8 步核停止信号与关停）、答复之时（`perform`）。证据：两条扫描用例在「等完之后核」的版本上红，在决定点版本上绿；G8、G10、G13 变红。
3. `prepare` 入口的 `isShut` 先判折进 `under` 的等待前检查（第一次等待就是关口，端口次数不变）。证据：G9 让「step 3: after closeAll nothing is asked」变红。
4. `perform` 一处判 `cancelled`，判据是 `STOPPED ∨ (not-sent ∧ stop.aborted)`，在收口的同一段同步执行里，所以 `cancel` 答了 `signalled` 的调用总答 `cancelled`（S2）；第 9 步的 `not-sent` 不再在 `sendOrder` 里映射。
5. 第 8 步除停止信号外也核关停（裁定只写停止信号）：k=32 扫描所需，P13 的守卫。
6. `Calls.tla` 同步了「关口之后读 shut」（`gateW`、`tgateW`），负控 `calls-bad-send-after-shut` 沿用旧旗；第 8 步的 shut 读模型按构造不覆盖（外部动作只在静止到达），由扫描用例守。任务键碰撞模型写不出来（A–D 没有两个键同租户同主体），未扩 `Keys`，已在 SPEC P12 行写「模型未覆盖」。
7. `lostOfOutcome` 用 `unknown` 一支加 `default`（不逐 kind 穷举）：穷举版 CC 8/覆盖 60% 超 alert；去掉 `unknown` 支的变异仍由「unknown (stream-breaks)」杀。
8. `status.ts` 改了一行：`withdraws` 收 `GateDecision` 后 `inspect` 里的 `decision.kind !== 'admitted' &&` 成为多余，同一改动的直接后果；文件在 `src/` 内但不在写范围的描述清单里，请核。
9. `in-flight.spec.ts` 删了两条：「refuses markSent for a key that is not reserved」（守卫按裁定 C 2 删除，无物可测）与「ends a call that reached the sent phase without a record (a call that breached)」（T9 现在经句柄 `sent` 记发出，情形不再存在）；替代用例是 `sentOn(...).conclude()` 各例与「concludes once」。不是放宽。
10. `tests/invoke.spec.ts` 的「task carries…」只加了 step 12 标签，不断言登记（登记由 `tasks.spec.ts`「answers the initiator」承担）。
11. `lost.ts` 的 `connectionFailureOfBuild` 放在 `lost.ts`（裁定给 `lost.ts` 或 `entry.ts` 二选一）；`classificationOf` 新开 `internal/classification.ts`。
12. 第 11 条守卫用 `tests/unhandled.ts` 顶层注册（不是导出函数），探索器自己的 P7 监听保留，两者并存时绿跑都为空（turbo/慢层已证）。

**未覆盖项**
- 没有真实传输/对端/耐久存储；探索器与 TLC 的读数只在所列上限内，不是证明。
- `cancel`/任务操作 `TaskControl` 没有 `signal`：任务操作的关口无界已登记为已知限制（第 10 条），契约形状归 6b。
- 验收 2 的「`closeAll` 之后 `invoke` 不问端口」在基线上无法变红（基线已有入口判关停），证据是端口次数断言 + G9。
- 差分变异（`--since 5204d3799`）按闭包规格不由本闭包跑；D 的 7 个无效变异体已手工翻转（第 4 节 5）。
- C 序列（C01–C52）在最终 head 的重跑与 `verification/README.md` 的记录归下一闭包。
- `InFlightCalls.cancel` 覆盖 83%、`failureOf` 78%：未命中的是 `default` 的 `never` 分支，与基线相同。

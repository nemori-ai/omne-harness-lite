# w3-mcp-call-fix3 交回

## 1. 结论

w3-mcp-call-fix3 做完了。head 是 `deb5a977e`，分支 PanQiWei/skill-mcp-w3-mcp-call，基线 fcc955a53。没有推送，没有开 PR。

- 关停的答复现在只在出口一处决定。调用口在 `perform`/`answerAtExit`，任务操作在 `outcomeOf`，refresh 在 `answerAtExit`。途中各点只交哨兵 `SHUT`，负责「关停之后不再开始下一步、不问端口」。
- 第 1–8 条都已兑现。验收 1–7 满足。
- 验收 8 有一个红项（见第 4 节第 8 条）：metrics 退出 0，但它的 mcp 覆盖率子运行退出 1。原因是 lifecycle 的 `wide` 场景在插桩下超过 600 s。这个用例对负载敏感，我没有循环重跑，交你处置。
- 没有触发停止条件。

## 2. 提交（9 个；作者与提交者都读回为 `PanQiWei <594557445@qq.com>`，trailer 是 Harness: claude-code、Agent-Role: developer）

| 提交 | 说明 |
|---|---|
| 2ea8d30a4 | test：红灯用例（C3-1a/R3-a、C3-2/R3-c、C3-3、R3-d、R3-e，两个扫描变体，任务操作两条扫描，tasks.spec 原 :429 改答，在途表一条），另加两条事实用例 |
| d91b9301a | fix：第 1、2 条与第 8 条（A 面）的行为，三处出口一处判定 |
| 02cb17df4 | fix：句柄只在 reserved 时记发出；收口后格子置为终态 |
| ffb989c7d | refactor：`recordSent`、`TaskTable.get` 只交记录、`Losing` 注释收窄、两个用例标题改步号（行为不变） |
| 65f6e21f9 | test：探索器 P13 加答复一侧的断言；新场景 continue-shutdown |
| 9747068b9 | test：refresh 取页途中关停 |
| 3a1c2cd95 | test：补杀手工变异 F5、F9、F13 的用例 |
| 0bf12ad34 | refactor：任务操作关口之后不再另判关停（F8 证明这次核对等价） |
| bdc07aa71 | docs：成员 SPEC、契约 S8 与第 30 条、tests/README.md、tests/index.md |
| deb5a977e | docs：契约第 30 条的出处补 fix3 |

## 3. 改了哪些文件

**src**
- `src/calls.ts`
  - 新增哨兵 `SHUT`、类型 `Shut`/`Halted`、守卫 `isHalted`。
  - `under` 与第 8 步交 `SHUT`。
  - 新函数 `answerAtExit` 判定答复，次序是：STOPPED → sent 原样 → 停止信号 → `SHUT` 或 `isShut()`；它由 `perform` 调用。
  - `answerOf` 的停止分支在关停之后不派 `cancelRequest`。
  - `place.sent` 改名 `place.recordSent`。
- `src/tasks.ts`
  - 新增 `SHUT`/`Unsent`/`Answered`、`reusedOf`（同步复用，去掉 Promise.resolve）、`answerOf`、`exchange`（入口与发请求前在同一段同步执行里核关停，传输答 not-sent 归为 Unsent）、`outcomeOf`（出口一处判定）。
  - `request` 变为表查找加 `outcomeOf(await exchange(...))`。
  - `built` 去掉关口之后的关停核对。
  - `failureOfEnsure` 只改注释。
- `src/discovery.ts`
  - `listPages` 每页前核关停。
  - `publish` 拆成 `publish`、`published`、`written`；读 basedOn 前与发布边界前各核一次关停。
  - `refresh` 拆为 `refreshOrder` 加 `answerAtExit`。
- `src/internal/in-flight.ts`：`recordSent` 只迁移 reserved；`conclude` 把格子置为 ENDED，撤销时先离表，去掉身份比较。
- `src/internal/task-table.ts`：`get` 只交 `TaskRecord | undefined`；`Ambiguous` 不再导出。
- `src/internal/build.ts`：`Losing` 注释收窄到签名层面的保证。

**tests**
- `tests/doubles/watched.ts`（新）：按收口次数判断调用在关停落下之前是否已答复。
- `tests/doubles/stalls.ts`：新增 `armedStore`。
- `invoke.spec`、`continue.spec`、`tasks.spec`、`refresh.spec`、`cancel.spec`、`in-flight.spec`：新用例与改名。
- `tests/model/explore.ts`、`properties.ts`、`scenarios.ts`、`calls.spec.ts`：新断言 `answeredOtherwiseAfterShutdown`、两个计数 `taskRequests`/`taskUnsent`（进状态投影）、场景 `CONTINUE_SHUTDOWN`（慢层）、去掉别名。
- `tests/README.md`、`tests/index.md`：登记 watched.ts。

**SPEC**
- 成员 SPEC：MC-7、MC-12、MC-16、MC-17、「所有权」、已知限制（+2 条）、P13（定理、表格行、负控句）。
- 契约 SPEC：只改 S8 与第 30 条。

## 4. 验收逐项（日志都在工作树 `tmp/closures/w3-mcp-call/fix3/`，哈希取 SHA-256 前 16 位）

**1. 构建、类型检查与测试**
- `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp --filter=@omne-harness/mcp-contract`：exit=0。16/16 个任务成功，其中 10 个命中缓存。mcp 463 passed（两层都跑），contract 548 passed。日志 `gates/final/turbo.log`，`a7b4d20cfce5620f`，05:33Z，head deb5a977e。
- `pnpm --filter @omne-harness/mcp run test:slow`：exit=0，10 passed、12 skipped。日志 `gates/final/test-slow.log`，`5aadf16ec6b6a3e0`，05:44Z，deb5a977e。

**2. 红绿证据**
- 红：`red/baseline-run.log`（`353159e380a20d7c`）。src 用 fcc955a53，跑 2ea8d30a4 的用例，11 条变红，原因与反例相符：
  - 续调用答 `unknown`；
  - 第 4 步变体 k=0 答 `config-missing`；
  - 续调用扫描在 k=12 答 `unknown`；
  - C3-3 答 config-missing；
  - R3-e 对端收到 1 条取消；
  - R3-d 答 kept(superseded)；
  - 任务操作同步关停答 `connection-unavailable` 且 getTask 在关停后被调用；
  - 两条任务扫描（复用一路 k=0 时 getTask 在关停后进入；新建一路 k=9 答 connection-unavailable）；
  - 原 :429 用例；
  - 在途表一条。
- 绿：`red/head-run.log`（`acbb430f6cdcf9e8`）在 head 上 163 passed。
- 后补的用例单独对基线跑，日志 `red/baseline-later-tests.log`（`809bf6312b84150e`）：
  - refresh「closeAll while a page is asked」在基线上红，这是本轮的行为改动；
  - F5、F9、F13 三条在基线上绿，它们守的是没有变的行为。
- 只守事实、在基线上本就绿的用例：Losing 的 `.then` 用例、B N4 事实用例。
- 探索器的新断言在基线上红：`model/baseline-continue-shutdown.log`（`baab993db2c24d7d`）报 `nA1 answered not-sent unknown after closeAll`；`model/baseline-task.log`（`53c82e6925191117`）报 `tA1 answered fail connection-unavailable`。
- 每项「用例 → 缺陷 → 变红证据」都在上面三个日志里。

**3. 手工变异**：见第 6 节。

**4. 探索器**
- 全部 13 个调用口场景零违例，lifecycle 9 例也通过（都在 final/turbo）。读数 `model/explorer-readings-final.txt`（`1283a11e7dc8712e`）：
  - call 263 states；call-shutdown 1018；continue 1070；continue-shutdown 2989（新，深度 34，21 s）；
  - task 2241；task-methods 8570；task-account 5568；task-collision 714；call-twice 18481；
  - foreign-cancel 731；foreign-task 200；abort 148；call-faults 914。
- 负控在 deb5a977e 上重跑，日志 `model/controls-run.log`（`974e5333ed5b1bce`），表 `model/controls/table.json`（`0f9e8126dc132b9d`）：

| 负控 | 场景 | 新增的签名 |
|---|---|---|
| N1 | call | P14 stopped-waits[adoption.endpoint]、[eligibility.check]、[store.read] |
| N2 | call | P10-cancelled-twice |
| N3 | call 与 call-faults | P11-answered-with-open-reservation、P11-reservation-left、P12-stopped-foreign-call |
| N3b | call | P11-concluded-nothing |
| N4a、N4d | foreign-cancel | P12-stopped-foreign-call |
| N4b | foreign-task | P12 三条与 P5-crossing |
| N4c | task-account | P12-task-on-foreign-connection、P5 |
| N5 | call-shutdown | P13 两条与 P1、P2、P3、P4 |
| N6 | call | P14 stopped-waits[transport.answer] |
| N7 | call | P14 [adoption.endpoint]、[eligibility.check] |
| N8 | task-collision | P12、P5 |
| N9（新，`perform` 的出口不读关停） | continue-shutdown | P13-answer-after-closeAll |
| N10（新，任务出口不读关停） | task | P13-answer-after-closeAll |

- N1–N8 的签名与 docs2 那次一致。
- 签名有变的：N1、N2 的变异原文随源码改了（`under` 体现在返回 `SHUT`；N2 在新的 `if (!table.isShut())` 下缩进），违例签名没变。
- N9 在 call-shutdown 上不变红。这是预期：那个场景的端口都合法，到不了非 SHUT 的拒绝。
- 更早在 65f6e21f9 上的一次运行留在 `model/controls-65f6e21f9/`。
- `Calls.tla` 没改：`Refused` 不带原因，模型只覆盖「不问端口」，答复一侧由探索器与用例守。

**5. 结构**
- `grep -n "fail(CONNECTION_UNAVAILABLE)" src/calls.ts`：0 行。验收原文假定的是旧的 `fail(...)` 写法；出口现在用 `notSent(...)`。
- `grep -n "CONNECTION_UNAVAILABLE" src/calls.ts`：只有 33 行（import）与 368 行（`answerAtExit`，只由 `perform` 调用）。
- `under` 与第 8 步交的是 `SHUT`，不是公开原因：186 行与 339 行都是 `if (table.isShut()) return SHUT`。
- `tasks.ts` 的关停答复只在 205 行（`outcomeOf`）：`if (exchanged === SHUT || ('unsent' in exchanged && table.isShut())) return fail(NO_CONNECTION)`。80、109、111、113 行的 `NO_CONNECTION` 是非关停原因（重读采用的拒绝、未采用或资格、配值、账户）。
- `discovery.ts` 的 226 行是 refresh 的唯一关停答复。

**6. 仓库检查**（都在 deb5a977e 上，05:5xZ，日志 `gates/final/`）

| 检查 | 结果 | 日志哈希 |
|---|---|---|
| `pnpm run typecheck` | exit 0（86/86） | `42bf74db26e52503` |
| `lint:rules` | PASS | `b9e4107dcc4dfa69` |
| `lint:oxlint` | exit 0 | `95cdd6c46421db6d` |
| `lint:deps` | 没有依赖违规 | `65fae1f91f55f12d` |
| `format:check` | All matched files use the correct format | `d8a337167bfaeee8` |
| `check:docs` | PASS 2736 | `ab43d7bcba931bdd` |
| `check:design` | PASS | `f1d2e17777c5ff74` |
| `git ls-files --eol \| grep -c w/crlf` | 0 | `gates/final/crlf.log` |

**7. src 无 `as`/`any`/非空断言**
- `grep -rnE "\bas [A-Za-z{(\[]" src` 的 11 处命中全在注释里。
- `grep -rnE ":\s*any\b|<any>|\bany\[\]" src`：0 行。
- `grep -rnE "[A-Za-z0-9_)\]]!(\.|\)|,|;|\[|$)" src | grep -v "!==\|!="`：0 行。

**8. 度量（红项）**
- `pnpm run metrics --coverage --base b2ba7dc89`：exit=0，日志 `metrics/metrics.log`（`b893733674b38145`），审讯页在主检出 `tmp/metrics/deb5a977e/review.html`。
- 变更函数超 alert：0；超 warn：1，是 `table.ts:318 begin`（CC 12，存量，本轮没改）。`publish` 从 CC 17 拆成 `publish` 5、`published` 10、`written` 7，不再超 alert。
- 读数：

| 函数 | CC | CRAP | 覆盖 |
|---|---|---|---|
| `perform` | 2 | 2 | 100% |
| `answerAtExit`（calls） | 7 | 7 | 100% |
| `under` | 4 | 4 | 100% |
| `sendOrder` | 7 | 7 | 100% |
| `prepare` | 10 | 10 | 100% |
| `exchange` | 7 | 7 | 100% |
| `outcomeOf` | 6 | 6 | 100% |
| `request` | 3 | 3 | 100% |
| `answerAtExit`（discovery） | 6 | 6 | 100% |
| `listPages` | 8 | 8 | 100% |

- 覆盖率 mcp 97%、contract 97%。
- 红项：mcp 覆盖率子运行退出 1，`lifecycle.spec`「wide」在 600 s 超时（主检出 `tmp/metrics/deb5a977e/coverage/packages__mcp__mcp.vitest.log`）。基线读数用 A 面第 3 轮在 fcc955a53 上的同一命令：1148 s，exit 0。第 2 轮出现过同样的 600 s 超时。wide 在非插桩的 turbo 里用时：本 head 360 s，前一次 367 s，fix1/fix2 时 338–398 s。所以 explore.ts 的改动没有让它变慢。按写者约定这类负载敏感用例不循环重跑，交派发者处置。

## 5. B N4 的事实

关停会汇合拆除，只有清单标记可能晚于 closeAll。代码路径：
- 调用答 not-sent 后，`loseInScope` 调 `table.lose` → `markLost`。它先同步执行 `entry.connection.lose`，再 `done = teardown(entry).then(markCatalog)`。`teardown.ts` 的 `teardown` 把这次拆除设为 `entry.tearing`。
- 条目处于 `lost`（不是 `closed`）时不满足遗忘条件，所以仍在 `entries` 里。
- `closeAll` 对它调用 `closeEntry`（`table.ts:206`）→ `connection.close()` → `teardown(entry)`。在途的 `entry.tearing` 被加入。
- `markCatalog` 在 `done` 里，`closeAll` 不等它。

证明用例：`invoke.spec`「closeAll joins the teardown that a call started on the connection it lost…」。transport.close 挂起时 closeAll 不答复；放开后 closeAll 答复，close 只调用一次；而清单标记的 store.write 在 closeAll 答复后仍挂着。SPEC「所有权」已按这一点改：拆除被汇合，只有标记可以晚于 closeAll。MC-10 不用改。

## 6. 手工变异

副本在工作树外：`/tmp/w3-call-fix3-mut`，用例表 `mutations/logs-final/table.json`（`27f7c589d667f0e1`），运行日志 `mutations/run-final.log`（`9de903e33a7df281`）。运行时 head 是 0bf12ad34，src 与 deb5a977e 逐字节相同。每项改完都按字节还原。

| 变异 | 改了什么 | 变红的用例 | 退出码 |
|---|---|---|---|
| F1（第 1 条） | `answerAtExit` 不读 `isShut()`，只认 SHUT | continue「…waits on the store」；invoke 两个 step 3 扫描变体；invoke「step 3: closeAll while the call waits on the gate, where step 4 then finds no connect-timeout」 | 1 |
| F2 | `under` 不核关停 | 3 条 gate/after closeAll 用例 | 1 |
| F3 | 第 8 步不核关停 | 「step 8: at whichever microtask…」、续调用扫描 | 1 |
| F4 | 关停后仍派 cancelRequest | 「step 11: …once closeAll began」 | 1 |
| F5 | 出口先读关停后读停止信号 | cancel「…followed by closeAll」 | 1 |
| F6（第 2 条） | 任务发请求前不核关停 | 「…built through the gate」扫描 | 1 |
| F7 | 任务出口不读关停 | 4 条 | 1 |
| F8 | 关口之后的关停核对去掉 | 第一遍（9747068b9）没有用例变红，`logs/F8.log`；证明等价后已删掉这次核对 | 0 |
| F9 | failureOfEnsure 的 settings 阶段 connection-unavailable 答 no-connection | 「a critical section bound that fires first…」 | 1 |
| F10 | 复用连接改回经 Promise 让出一次 | 存活：等价变异，发请求前的关停核对接住这次让出，答复与端口调用都不变 | 0 |
| F11 | 取页前不核关停 | refresh「…waits on the store before the listing」 | 1 |
| F12 | refresh 出口不读关停 | 「closeAll while a page is asked」 | 1 |
| F13 | 出口把已发布也改答 | 「closeAll while the store writes the listing」 | 1 |
| F14 | recordSent 不看阶段 | in-flight「records a send only…」 | 1 |

## 7. 命名账本

- 调用口：`SHUT`/`Shut`、`Halted`、`isHalted`、`answerAtExit`。
- refresh：`answerAtExit`（同名）、`refreshOrder`、`publish`/`published`/`written`、`Refreshed`。
- 任务操作：`Unsent`、`Answered`、`exchange`、`outcomeOf`、`reusedOf`、`answerOf`。
- 句柄 `sent` 改名 `recordSent`；探索器记录类型改名 `ReservationRecord`。
- 用例与替身：`ConcludeCounting`/`watchedCalls`/`Watched`、`armedStore`、`enteredAfterShut`、`scanShutdown`。
- 探索器：场景 `CONTINUE_SHUTDOWN`（continue-shutdown）；签名 `P13-answer-after-closeAll`；OpView 字段 `taskRequests`、`taskUnsent`。
- 变异编号：手工 F1–F14，探索器负控 N9、N10。

## 8. 写者声称的结构性改动（供 grep 核对）

1. `calls.ts` 中只有 `answerAtExit` 产出 `connection-unavailable`。
2. `under`、第 8 步交 `SHUT`。
3. `tasks.ts` 的关停答复只在 `outcomeOf`。
4. `built` 没有 isShut。
5. 复用路径没有 await。
6. discovery 中只有 `answerAtExit` 产出关停的 `connection-unavailable`。
7. `recordSent` 只迁移 reserved。
8. `TaskTable.get` 签名只交记录。
9. explore.ts 没有 `as Place`。

## 9. 自定裁定与理由（都是我能自己定的）

1. **去掉 tasks.ts 关口之后的关停核对**：这推翻了第 2 轮 C11 采纳的修法。依据是出口一处判定之后，F8 证明它等价：关停之后 `ensure` 不问端口、直接拒绝（MC-5）。SPEC MC-17 已写明。
2. **refresh 多加两处关停检查**：处置只要求「MC-7 补这一步」（每页一次），我另在读 basedOn 前与发布边界前各加一次。依据是 S8「不再开始下一步」：否则关停后仍会问存储与关口。
3. **refresh 出口没有停止信号优先**：kept(cancelled) 遇到关停也答 connection-unavailable，按处置字面执行。这一路没有专门用例，请留意。
4. **复用连接改为同步决定**：F10 是等价变异，留着它是为了兑现「没有让出」的字面。
5. **R3-c 同步关停用例与复用扫描变弱了**：R3-c 用例的断言从 `toEqual([])` 改成 `not.toContain(true)`，复用一路的扫描在 k=0 就结束。原因是请求现在在 closeAll 之前同步离开。复用一路的关停判断实际由新建一路的扫描与 F6 守。
6. **出口判定之后的答复**：调用在关停之后、未发出时，连 `correlation-key-in-use`（第 2 步）也保留，P13 断言对关停之后开始的操作放行它；任务操作放行发起者核对的 `unknown`。依据是成员次序里这两步在关停之前。
7. **continue-shutdown 放慢层**（21 s）。
8. **validate 用的扫描判据**：用收口次数而不是 `.then` 判断「调用已答复」，避免与答复自己的续行赛跑。
9. **第 30 条出处补了 fix3**，属于第 30 条句子之内。
10. B 面 N8、N6 这类表达项没动，留给 docs3。

## 10. 让排除文件里的句子过时的位置（docs3 的输入）

- `verification/README.md`：
  - C07、C44、C65 引的标题现为「step 8: at whichever microtask…」；
  - C22、C31、C55 引的现为「step 10: a call sent on one generation…」；
  - C36 的 `connectionOf` 已不存在；C55 的 `sent` 现为 `recordSent`；
  - N 序列表 N1、N2 的原文；
  - :96 关停读取点；
  - P13 读数，以及新场景 continue-shutdown、N9/N10、F1–F14 记录；
  - :174 与 :220 附近「三个决定点」。
- `verification/models/Calls.tla:305` 注释（`connectionOf`）。
- `verification/models/README.md`「可观察结果相同」只对端口成立。
- `docs/object-model.md:54` 的 `sent(connection, generation)`。
- `docs/flows.md:79、84`（第 8 步直接答 connection-unavailable）。
- `docs/architecture.md:51` 与模块表：publish 已拆三段；TaskTable 的「有歧义」现只在表内。
- `README.md:99`、`README_ZH.md:99` 列的 S8 承载模块。
- 成员 SPEC 自身「组合与验证·未覆盖」:220 与「性质与证据」:245 的「三个决定点」句子不在我的写范围节内，没改，是 B N6 的输入。

## 11. 没覆盖到的项

- 没有真实传输：传输对未发出请求答特有原因、关停之后改答，只在脚本化替身上验证。
- refresh 的「停止与关停同时」没有用例（见第 9 节第 3 条）。
- 差分变异与 admission 按授权没跑。D 面需要在最终 head 上以 `--since 5204d3799` 跑一次。
- 工作树外的副本还留着，可以删：`/tmp/w3-call-fix3-copy`、`/tmp/w3-call-fix3-mut`、`/tmp/w3-call-fix3-base`。

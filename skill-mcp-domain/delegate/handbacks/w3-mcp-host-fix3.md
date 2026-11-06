# 闭包 w3-mcp-host-fix3 交回（#1119 r1）

## 结论

18 条已定的事全部实施完，验收 1–9 全部在交回 head 上跑过并留下带退出码的日志；三条交叉核对点有代码出处；追加记录 03:21 的澄清（`die` 只结算依赖线路的两相，发现相不动）已按字面落实并有负控。有 4 条验收第 2 条点名的用例在基线上就是绿的（基线已有该行为），各自改用手工变异或负控证明用例对缺陷敏感，下文逐条写明。度量跑了两次：第一次发现本闭包新增一个超 alert（`lineGoneAnswerOf` 契约自身覆盖 0%），补契约单元用例后第二次消掉。实现完成、自验通过；独立评审与接受不在我手里。

- 工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，分支 `PanQiWei/skill-mcp-w3-mcp-host`，基线 `720a5d08a`，交回 head **`3a79454d0`**（2026-11-06 04:37:35 UTC），`git status --short` 为空。未推送、未开 PR、未合并。
- 过程证据全部在 `tmp/closures/w3-mcp-host/fix3/`（`red/`、`gates/`、`model/`、`manual/`、`mutants/`、`mutants.md`、`clusters.md`，共 620 KB）。

## 提交（9 个，基线之后按序）

| 提交 | 内容 |
| --- | --- |
| `e5549738f` | 第 3 轮修复的红灯用例（B1 S07、未写出请求号的应答、拒绝后共用流上的应答 N3、同步抛出的取回、信号后不再取回、不读 stdin 的对端上的 close()）；契约 T5 闸门永不放开的两条 |
| `a918b41ed` | 纯移动：契约按连接的规则 → `connection.ts`，组成用的词 → `composition.ts`，`withOneResend` → `discovery.ts` |
| `888f7502a` | 行为阶段：相 → 结局的规则归契约（`stopAnswerOf`、`lineGoneAnswerOf`、`fallbackGetConclusionOf`），`die` 按相结算、B1 修掉；脚本化传输先登记再授权；`StdioLine.close()` 一律中止写端、`writes` 删除；缺陷出口 `SessionOptions.reportDefect`；`classify` 只对 `sent` 相；`Pending` 去掉 `authorized`；`ConnectionView` 判别联合；元数据取回收到 signal |
| `dc0ecb927` | 契约未处理拒绝守卫（`tests/unhandled.ts` + `vitest.config.ts`）；`headerDeclarationInvalid` 拆开；`retryVersionOf` 只判一次现代性；探测错误类、结果类分支用例；回退 GET 不成立的三种流用例（MemoryLine `stream` 形态）；两份 SPEC 与 `docs/public-api.md` |
| `77529fd1b` | 负控表按首轮运行校正 3 个 `expect`；`mHttp-get-without-events` 改成能编译的替换；`mutate.ts` 构建失败记 `does-not-build`、还原后重建放进 `finally` |
| `766bc6eb7` | 第 18 条观察用例补断开那一刻的 `pending` 断言；新负控 `mV6-lineend-settles-discovery` |
| `184a29b9a` | 新用例：信号之后答「没取到」的取回不再跟下一个地址 |
| `2d1151fa4` | 新用例：SSE 共用流断开时授权中的请求 not-sent（验收 2 点名的孪生） |
| `3a79454d0` | 契约 `decisions.spec.ts` 补 `stopAnswerOf`、`lineGoneAnswerOf`、`fallbackGetConclusionOf` 单元用例（消掉度量带出的新 alert） |

改动文件：`git diff --name-status 720a5d08a..3a79454d0` 共 36 个，全部在写范围内（两成员 `src/`、`tests/`、SPEC.md、契约 `vitest.config.ts`、`docs/public-api.md`、契约 `src/index.md`，以及 `tmp/closures/w3-mcp-host/fix3/`）。没碰 host `verification/`、README、`docs/index.md`、`packages/mcp/mcp/`、锁文件。

## 验收逐项（命令都在工作树根或成员根运行；日志在 `tmp/closures/w3-mcp-host/fix3/`，哈希是 SHA-256 前 16 位）

**1. 构建、类型、测试（head 3a79454d0）**
- `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp` → `Tasks: 19 successful, 19 total`，`EXIT 0`；contract 669 passed、host 399 passed、mcp 254 passed。`gates/a1-turbo-3a79454d0.log` d03e974a1bd78970。
- `test:slow`：contract `Tests 262 skipped (262)` `EXIT 0`（**慢层没有执行任何用例**，基线 888f7502a 的记录也是如此，不是本闭包造成；退出 0 不等于慢层覆盖）`gates/a1-slow-mcp-contract-3a79454d0.log` 4655c22decfd8afd；host `240 passed | 8 skipped (248)` `EXIT 0` 1c80d8bc0ff06e57；mcp `No test files found` `EXIT 0` 7e96cdc6cad90804。
- 同一组在 184a29b9a 也跑过一遍（`a1-*-184a29b9a.log`），结果相同（host 当时 398）。

**2. 行为改动的用例：用例 → 缺陷 → 变红证据**（基线红灯日志：`red/baseline-session.log` 6c0ca9c0a0c86e87、`red/baseline-stdio-close.log` 5bdd5b8ad9a6ea2f、`red/baseline-contract-t5.log` b3e2a64034e82ff6；head 全绿见 a1-turbo）

| 项 | 用例 | 缺陷 | 基线 720a5d08a | 敏感性证据 |
| --- | --- | --- | --- | --- |
| B1 | session.spec「a request still being authorized when the session ended (S07) is not-sent and never reaches the line」 | `die` 对 session-ended 提前返回，授权中的请求之后发出去 | **红**（settled ok ≠ failure） | 负控 `mB1-session-ended-skips-authorizing` 红 |
| 线路级断开·stdio 进程退出 | 「the process exiting settles a request still being authorized with not-sent, and never sends it」 | 同上，按 cause | **绿**（基线对非 session-ended 的 cause 已结算授权中的项） | 探索器 V6 `lineend-authorizing` 预言；stdio-call／stdio-discover 场景到达 `event exited`（`model/explore-counts-3a79454d0.log`，见第 4 条）；负控 `mV6-lineend-keeps-authorizing` 红 |
| 线路级断开·SSE 共用流 | 「the shared stream of the SSE mode breaking settles a request still being authorized with not-sent, and never sends it」（`2d1151fa4` 新加） | 同上 | **绿**（`red/baseline-sse-break-authorizing.log` bb03d51bb8b783c3） | 负控 `mV6-lineend-keeps-authorizing`（sse-fallback 场景）红 |
| 脚本化传输授权中的 signal／close() | contract「T5 a call still being authorized when close() ran / when its signal fires …」各两次（两种流） | 闸门永不放开时 call()／close() 跟着等 | **红**（4 条 5 s 超时） | — |
| 信号后不再取回 | 「no fetch starts after the call's signal fired; the one in flight is let go and its result dropped」 | 信号后循环继续取下一个地址 | **绿** | 这条用例对去掉契约 `if (signal.aborted) break` 也不敏感（迟到的取回答文档，循环本来就停；`manual/c-fetch-after-signal.log` 6ef0566c68a229dc）。于是补「a fetch that answers nothing after the signal is not followed by the next address」（`184a29b9a`）：基线绿（契约与 host 源码都在基线：`red/baseline-fetch-after-signal-both.log` ec30442ae48d9f1f），去掉那一行时红（`manual/c-fetch-after-signal-2.log` 092d2c5cb2a06d1c） |
| classify 对未写出的请求号 | 「an answer for a request number that was not written yet does not settle it: the request goes out and waits for its own answer」 | 授权中的请求被别人的应答结算 | **红** | — |
| 发现中的请求在共用流上收到应答（N3） | 「a request refused with 401 keeps that conclusion when the shared stream later carries an answer with its id」 | 发现相的项被应答改写结论 | **红** | 手工去掉 `phase.kind !== 'sent'` 守卫 → 红（`manual/c-classify-ignores-phase.log` c1bf1bfa074cf383） |
| 同步抛出的取回 | 「a fetch that throws at one address counts as nothing fetched there; the next address is tried」 | 同步 throw 冲出循环 | **红** | — |
| 不读 stdin 的对端上 close() | stdio.spec「small calls that departed sit in the buffer to a peer that does not read stdin: close() returns within the bound, before the process stops」（真实子进程） | `close()` 等排空 | **红**（pending） | 负控 `mStdio-close-flushes` 红 |
| 第 18 条观察：断开时发现中的请求不被结算 | 「a request in the authorization discovery is not settled by the shared stream breaking: it ends authorization-required when the discovery ends」 | `die` 结算发现相 | **绿**，连补上 `pending` 断言之后也绿（`red/baseline-discovery-pending.log` cf13e030078b3441） | 补断言之前这条用例对「`die` 用 `stopAnswerOf`」的变异不敏感（`manual/c-phase-die-uses-stop-rule.log` 2ff4b05a841b1ed2 首次运行）；补后红（同日志第二次运行、负控 `mV6-lineend-settles-discovery`） |

四条基线绿的（进程退出、SSE 断开、信号后不再取回、发现不动）不满足「在基线上变红」的字面：基线已经有这些行为；交付的是能探出它们被拿掉的用例。

**3. 负控**：`node tests/model/mutate.ts --out ../../../tmp/closures/w3-mcp-host/fix3/mutants`（host 包根）。23 个负控全红、源码逐字节还原、`EXIT 0`：`mutants/run-3a79454d0.log` ac51935251bd09c8（与 `run-766bc6eb7.log` 逐字节相同；两 head 之间只改了 `tests/`）。表与退出的负控（`mStdio-writes-boolean`：计数随第 17 条删除）在 `mutants.md`；首轮（dc0ecb927）3 个 `expect` 猜错与 1 个不能编译的负控的校正过程也在那里。新负控 13 个：`mB1-session-ended-skips-authorizing`、`mV6-lineend-keeps-authorizing`、`mV6-lineend-settles-discovery`、`mStdio-close-flushes`、`mHttp-reset-is-unsent`、`mHttp-refused-is-broken`、`mHttp-follows-redirect`、`mHttp-sse-endpoint-forgotten`、`mHttp-reads-every-sse-event`、`mHttp-get-status-as-stream`、`mHttp-get-without-events`（以上 `mutants.ts`）；注意 `mutate.ts` 的行为改了：慢层负控构建失败记 `does-not-build`（不再抛出），还原后的重建放进 `finally`。

**4. 探索器**：`model/explorer-fast-3a79454d0.log`（11 passed，EXIT 0）、`model/explorer-slow-3a79454d0.log`（3 passed，EXIT 0）、计数探针 `model/explore-counts.ts` → `model/explore-counts-3a79454d0.log`（零违例）：

| 场景 | 线路断开 | 状态 | 调度 | 深度 |
| --- | --- | --- | --- | --- |
| stdio-discover | ended、exited、broken 各到达 | 2677 | 4205 | 10 |
| stdio-call | ended、exited、broken 各到达 | 247 | 347 | 8 |
| sse-fallback | broken 到达 | 5190 | 7448 | 17 |
| minimal／http-call／http-resend／http-peer／http-bare | — | 31／125／2927／26／442 | 40／215／4110／29／609 | 5／9／12／6／8 |

（日志文件名带 766bc6eb7 的是同一头源码的早一次运行，读数相同。）

**5. 簇表**：`clusters.md`。要点：`decisions.ts:311` 改写 + 两条用例；契约 `authorization.ts:20` 与 host `authorization.ts:37` 写了等价理由（正则组恒有值；失败形状没有 `value`）；`heldEndpoint` 三条手工变异全红（`manual/c-held-*.log`）；`http-line.ts` 7 个负控；session/stdio 四类：按相结算（`stop` 守卫等价理由 + 两份绿记录；`die` 三个负控）、关闭（三处 `|| this.closed` 等价理由 + 两份绿记录）、写计数（已删除）、归类（`return true` 等价理由；`sent` 守卫手工变异红）。

**6. 结构**（在 head 上跑，输出原文）：
- `grep -n 'authorized' packages/mcp/mcp-host-local/src/session.ts` → 8 行，全是 `authorizedToWrite`（:430 注释、:445 定义、:505 respond、:515 notify、:858 enterSse）与注释里的「authorized」一词（:152、:451、:502）；**没有 `authorized` 字段或属性**。
- `grep -n 'session-ended' …/session.ts` → 空（`die` 没有提前返回；cause 的区分在契约 `lineGoneAnswerOf`）。
- `grep -n 'this.usable' …/session.ts` → :433（`authorize` 前置）、:446（`authorizedToWrite`）、:564（`begin` 前置）、:855（`enterSse` 发 GET 之前的前置，在任何 await 之前）、:862（`enterSse` 在 `openGet` 答复之后，判线路的答复是否已迟到——不是对 handle 的再核；handle 之后的再核只在 :858 经 `authorizedToWrite`）。respond／notify 里没有。
- `refusedGet`：不再存在独立的 `WireContext` 构造；`grep -n 'WireContext' …/session.ts` → :80 导入、:189 `Pending.context`、:542 `makeEntry` 参数、:566 `begin`。回退 GET 的归类在契约 `fallbackGetConclusionOf`（session.ts:906 调用）。
- `grep -n 'writer.close' …/stdio-line.ts` → 空。

**7. 门禁（head 3a79454d0）**：`pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design` 全部 `EXIT 0`（`gates/gate-*-3a79454d0.log`：dc037f5780d1a0d8、46545c06b5d78f59、66e497d11f63682a、37618c693b98fb74、da7034822f961dda、32895c498b157729、f2650458e6041b72）；`git ls-files --eol | grep -c w/crlf` → 0（`gate-crlf-3a79454d0.log`）。

**8. `src/` 约束**（`git grep` 在 HEAD 上）：代码行的 `as`（排除注释行与 `as const`）`git grep -nE "[])A-Za-z0-9_'\"] as [A-Za-z_{(]" HEAD -- 'packages/mcp/mcp-host-local/src/*.ts' 'packages/mcp/mcp-contract/src/*.ts' | grep -vE ':[0-9]+:\s*(//|\*|/\*)' | grep -v 'as const'` → 只剩 8 行，全在字符串字面量里的英文（`'… as text'`、用例名）；`any` 作类型（`:\s*any\b|<any>|any\[\]|as any`）→ 空；非空断言 → 空；`git grep -n '@modelcontextprotocol' HEAD -- packages/mcp/mcp-host-local/src` → 只命中 `src/README.md` 的两句说明文字，没有导入。

**9. 度量**：`pnpm run metrics --coverage --base 92a8e3cdf` 跑了两次，都 `EXIT 0`。
- 第一次（184a29b9a，`gates/metrics-184a29b9a.log` 703b29cde911025d）：变更函数超 alert 3——**`lineGoneAnswerOf` CC 6 覆盖 0% CRAP 42 是本闭包新增的**（契约自身的测试没调它，只被 host 经 dist 执行），另两个是 `resultClassOf` 17.2、`probeErrorConclusionOf` 13.8。
- 第二次（3a79454d0，`gates/metrics-3a79454d0.log` c5257f3568d35c8a，补契约用例后）：变更函数超 alert 2、超 warn 8；依赖违规 0、环 1（存量）。读数：

| 函数 | 读数 | 处置 |
| --- | --- | --- |
| `withheld.ts:87 headerDeclarationInvalid` | CC 10 覆盖 100% CRAP 10（原 CC 19） | 拆成 `declaredHeaderOf` 2、`wellFormed` 4、`declarationInvalid` 6、`branchesOf` 4 与递归本体 |
| `wire.ts:301 resultClassOf` | CC 16 覆盖 83% CRAP 17.2（不变） | 补了每类请求的结果类用例；仍未覆盖的只有 `default` 的 `never` 穷尽守卫（:329–330）。它是按请求类的判别表，拆开只是搬家；保留，写理由 |
| `decisions.ts:329 probeErrorConclusionOf` | CC 11 覆盖 71% CRAP 13.8（不变） | 补了每个错误类在两次探测上的结论；未覆盖的只有 `never` 守卫（:349–350）。同上理由 |
| `concludeProbe` | CC 10 覆盖 75% CRAP 11.6 | 未覆盖：`legacy-http` 分支（探测不会收到回退 GET 的结局）与 `never` 守卫 |
| `testing-scripted-transport.ts:250 eventOf` | CC 10 覆盖 78% CRAP 11.1 | 第 3 条重写的替身；未覆盖 :270–271、:279 |
| `exchangeConclusionOf`、`httpErrorWireOf`、`readDiscoverResult`、`StdioLine.readStdout` | CC 11 覆盖 100% CRAP 11 | 圈复杂度本身超 warn，覆盖全 |
| `taskReadOf` | CC 10 覆盖 80% CRAP 10.8 | 未覆盖 :181–182 |
| `discovery.ts:23 discoverWith` | CC 9 覆盖 75% CRAP 10.3 | 纯移动过来；未覆盖 :48、:50–51（第二次 retry 与 default，评审已读为不可达） |
| 新规则 `stopAnswerOf`／`lineGoneAnswerOf`／`fallbackGetConclusionOf` | 5.9／7.3／2 | 未覆盖只剩 `never` 守卫 |

本闭包改动的函数没有超 alert 的新增（第一次的 `lineGoneAnswerOf` 已消）。度量日志里「测试未通过 54 个」是其他成员的覆盖率运行（退出码 1），与本闭包无关，我没有核查它们。

## 三条交叉核对点（追加记录 03:21）

- (a) 传输不可用时 `begin` 与 `authorize` 既不登记也不调 handle：`session.ts:563–564` `begin` 第一句 `if (!this.usable) return undefined`，在 `reserveId`、`pending.set`、`work` 之前；`:432–433` `authorize` 第一句 `if (!this.usable) return false`，在 `credential.authorize` 之前。
- (b) 读类再发在 `begin` 被拒 → not-sent：`request` → `withOneResend(() => this.once(...))`（`discovery.ts:61–66` 只在 `no-answer && resend` 时再调一次）→ `once` → `begin` 返回 undefined → `NOT_SENT`（`session.ts:753–770`）。
- (c) 已结算项上迟到的 404 不触发 `die`：`classify`（:707）对不在途的项先 `return true`，`concludeAnswer`／`apply` 不执行，而 `die` 只从 `apply` 的 `settle` 行带 `unusable` 时调用；另外 `die` 本身以 `dead ??= cause` 幂等。
- 澄清的落实：`lineGoneAnswerOf`（契约 `decisions.ts:447`）authorizing → not-sent（所有 cause）、sent → `streamGoneAnswerOf(cause)` 但 session-ended → undefined、discovery → undefined；`signal`／`close()` 走 `stopAnswerOf`，三相都结算。契约单元用例与 `mV6-lineend-settles-discovery` 钉住发现相不动。

## 命名账本（新名）

契约：`InFlightPhase`、`UnusableCause`、`stopAnswerOf`、`lineGoneAnswerOf`、`fallbackGetConclusionOf`（根入口新导出，`public-entry.spec` 与 `transport-conformance.spec` 的清单已加）；`fetchOrNothing`（`authorization.ts` 内部）；`declaredHeaderOf`、`wellFormed`、`declarationInvalid`、`branchesOf`（`withheld.ts` 内部）；`tests/unhandled.ts`。host：`SessionOptions.reportDefect`、`SentExchange`、`Pending.phase`、`authorizedToWrite`、`heldEndpoint`（原有，签名改为只收 `stream` 形态）；测试夹具 `sseNoise`（`tests/fixtures/scripted/http.ts`）、MemoryLine `sse: { kind: 'stream', status, headers, first }`、`deferred()`、`holdAfter().reached`、`countingCredential().rejected`；负控名见第 3 条；探索器 `LineEndCause`、`RunView.lineEnd`、`phaseAtLineEnd`、签名 `V6-lineend-<phase>`。

## 移动、改名或改形的契约导出

- 纯移动（`a918b41ed`，导出名不变）：`isLegacyConnection`、`checksListingHeaders`、`cancelsByNotification`、`ConnectionView` → `src/connection.ts`；`RequestMethod`、`NotificationMethod`、`OFFERED_LEGACY_VERSION`、`METHOD_NOT_FOUND` → `src/composition.ts`；`withOneResend` → `src/discovery.ts`。
- 改形：`ConnectionView` 从可选字段的记录改为判别联合 `{kind:'stdio', version} | {kind:'streamable-http', version, mode:'streamable'|'sse'}`（契约 SPEC 裁定 15）。
- 删除：无（`streamGoneAnswerOf`、`ABANDONED`、`authorizationRequiredAnswerOf` 仍导出；host 不再直接用前两者）。
- 消费者核对：`git grep` 在 `packages/mcp/mcp/src|tests` 里，`ConnectionView` 是它自己 `internal/table.ts` 的本地类型，`ABANDONED` 是本地常量，都不从契约导入；不消费 `createScriptedTransportFactory`（规格「当前认知」此处不准）。仓库其他成员没有引用这些名字。它的快层 254 passed、慢层没有用例。

## 写者声称的结构性改动（供逐条 grep）

1. host `session.ts`：没有 `authorized` 字段；`respond`／`notify`／`enterSse` 经 `authorizedToWrite` 再核（见第 6 条输出）。
2. `die(cause)` 循环 `lineGoneAnswerOf`，没有 cause 分支；`stop` 用 `stopAnswerOf`，发现相带 `headers`。
3. `classify` 第二句 `if (entry.phase.kind !== 'sent') return false`；`Pending.phase` 是 `authorizing | sent{exchange: line|stream{abort}|probe{cancel}} | discovery{headers, soFar}`。
4. `pump`／`consume` 手动迭代，`try` 只包 `next()`；每个事件的 throw 进 `reportDefect`，读取继续；`work(flow, entry)` 的 catch 先 `stop(entry)` 再 `reportDefect`。`factory.ts` 默认 `reportDefect` 用 `queueMicrotask(() => { throw defect })` 抛到 promise 之外。
5. `stdio-line.ts`：没有 `writes`、没有 `writer.close`；`close()` 固定次序 `clearTimeout` → `writable=false` → `closing.abort()` → `writer.abort(...)` → `stdout.cancel` → `stderr.cancel` → 等两个读循环 → `queue.end()`。
6. 契约 `testing-scripted-transport.ts` 整体重写：`begin` 先登记再后台 `send`（authorize → dispatch），`unusable` 经 `lineGoneAnswerOf`，发现经 `startAuthorizationDiscovery` 可中止。
7. 契约 `authorization.ts`：循环 `if (signal.aborted) break` + `fetchOrNothing`（`try { return await fetchMetadata(url, signal) } catch { return undefined }`）。
8. 契约 `vitest.config.ts` `setupFiles: ['./tests/unhandled.ts']`。
9. 两份 SPEC：契约加裁定 15、T1 no-answer「已交出（对端可能已收到它的任何部分，未必已离开本进程）」、T5 分界与 `InFlightPhase`／`stopAnswerOf`、T8 前言「传输不再可用的行按相结算其他在途请求」、S01–S04／S07 与 SSE 段各一句、R4 取回收到 signal 与同步抛出按没取到、`.` 入口行登记新导出；host SPEC 的 hunk 只有三处：`SPEC.md:76–79`（H6，第 17 条授权）、`:170–196`（整节「所有权、失败与生命周期」：三相、在途表是唯一再核、缺陷出口、「已交出」分界、信号后不再取回、关闭只等线路、新段「线路断开」含三条交叉核对点）、`:229–231`（「端口失败模型」一段，位于「性质与证据」标题之下，但规格点名了这一段）。

## 自定裁定与理由

1. 第 10 条的形式：没用规格写的 `Promise.resolve().then(fetch)`，改为 `fetchOrNothing` 的 `try { await }`。前者把第一次取回推迟一拍，`decisions.spec`「a discovery in progress…」（同步放行）超时；后者取回仍在调用当下发起，同步 throw 也按没取到。
2. 规格点名的用例对缺陷不敏感时补了用例而不是只改断言：发现不动（补 `pending` 断言）、信号后不再取回（新用例）、SSE 断开授权中（新孪生）。四条基线绿的如实列在第 2 条。
3. 度量跑了两次（规格说一次）：第一次暴露本闭包新增的 alert，不补用例就交回等于把新 alert 留给评审。
4. 第 11 条收尾：`session.spec.ts` 仍有 26 处 `settledWithin(x, 30) === 'pending'` 形式的否定等待——它们断言「在界内不发生」，deferred 表达不了「永不」；带时序竞争的正向等待都换成了 deferred（`credential.rejected`、`held.reached`、`metadataEnded`、`fetching`、`found`）。
5. `as` 只出现在测试：`session.spec.ts` 的 `notAText()` 用 `as string` 造一个非文本事件；`as const` 若干。
6. 第 16 条 session/stdio 的簇按规格允许的「等价理由」处置了 `stop` 守卫、三处 `|| this.closed`、`classify` 的 `return true`，没有改这些行（改了会失去显式的空操作／类型收窄）。
7. 契约慢层 262 条全部 skipped 是基线既有状态，没有去改分层配置（不在本闭包范围）。

## 让排除文件里的句子过时的位置

- host `verification/README.md:36`（`Broken(r)` 行写「线路级的断开经 `die` 结算 `sent` 相的项（`streamGoneAnswerOf`…」：现在按相经 `lineGoneAnswerOf`，授权中的项也结算）；`:129`（「另有四个负控 … `mStdio-writes-boolean`」：该负控已退出，现为 3 个 stdio 负控 + 7 个 http 负控）。
- host `docs/flows.md:52`（「GET 流结束或断开 → 所有在途请求 no-answer (stream-broken)」）与 `:59`（「会话把所有在途请求答 stream-broken 或 process-exited」）：现在按相，授权中的是 not-sent，发现中的不动。
- host `SPEC.md`「性质与证据」（不在写范围）：`:206`（「H6、H8 与性质 V2–V6 的负控」的描述）与 V6 行 `:256`（只列 `mV6-close-not-sent`、`mV6-authorizing-abandoned`；现另有 `mB1-…`、`mV6-lineend-keeps-authorizing`、`mV6-lineend-settles-discovery`）。
- host `README.md:13` 的 stdio 行仍然成立（关闭次序没变）。

## 清理候选（没动）

- 契约 `src/testing-transport.ts:430` `countingCredential(gate = Promise.resolve())`：T5 用例改用 `heldCredential()` 后，`gate` 参数没有调用方再传（两处调用都不传）。可删参数。
- `tests/model/explore-counts.ts` 之类的探针只在 `tmp/`，不入库。

## 未覆盖与局限

- 契约慢层与 `@omne-harness/mcp` 慢层没有执行任何用例（见验收 1）。
- 真实子进程只在 `stdio.spec`（item 17 的用例与既有用例）；HTTP 真实服务器在 `http.spec` 的脚本化 fixture 与参考服务器；没有跨服务的端到端。
- 度量的「测试未通过 54 个」属于其他成员，未核查。
- 探索器与 TLA+ 的「性质与证据」表未更新（写范围外）。


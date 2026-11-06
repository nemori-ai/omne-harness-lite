# 闭包 w3-mcp-host-fix2 交回

## 1. 结论

做完了。工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，分支 `PanQiWei/skill-mcp-w3-mcp-host`，基线 `db06b5b70` → head **`0695f2ba4`**，`git status` 干净。规格「已定的事」1–16 条全部兑现，唯一例外是第 13 条第一句（「端口失败模型」的豁免句在 `SPEC.md:230`，落在「性质与证据」节内，归 `w3-mcp-host-formal2`，我没动，见第 8 节交接项）。宿主 429 中断发生在 19:47，中断前后状态与派发者 01:15 读到的一致；mutate 的在途运行已正常结束、源码按字节还原（`git diff src/` 当时只有我未提交的 `once` 改动）。

## 2. 提交（db06b5b70..0695f2ba4，7 个）

| 提交 | 内容 |
|---|---|
| `75809c54c` | 红灯用例（验收 2 的八条 + 追加 14 的三条）；探索器 V4 改观察调用方 promise、V6 核 signal 与 close 两种停下、凭据与取回端口可答 `hang`、`close()` 须当即到达线路 |
| `9ae28f6e6` | 契约 `decisions.ts` 按四组拆开（纯移动），`discoverAuthorization`/`MetadataFetch` 移到 `authorization.ts` |
| `f856c8f55` | 契约新导出：组成、按连接的规则、`withOneResend`、流断开与拒绝的结算、`startAuthorizationDiscovery`、`WIRE_LIMITS`、`endedCauseOf`；`classifyWireEvent` 拆函数；脚本化传输改用；host `limits.ts`/`authorization.ts` 改用 `WIRE_LIMITS` |
| `cd605e85f` | 会话按结算重做（第 1–5、7 条）；`StdioLine` 写计数（第 6 条）；受影响用例改写 |
| `914b10a05` | `tests/model/mutants.ts` + `mutate.ts`（负控入库）；explore.ts 的 V6 对 initialized 之后的授权不按请求计；契约 SPEC T5/T9/裁定表（第 9 条） |
| `c8a78f888` | `unhandled.ts` 改 setup 文件（第 12 条）；成员 SPEC 第 13 条各节；tests/src 索引 |
| `0695f2ba4` | 新增用例：工作流意外 reject 按相结算（覆盖 `Session.work` 的 catch） |

作者/提交者均为 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code` / `Agent-Role: developer`。

## 3. 改了哪些文件

**packages/mcp/mcp-host-local/src/**
- `session.ts`：重写。`Pending` 带自己的 `answered/settle` 与 `departed/depart`（`Promise.withResolvers`），在途表成员资格是「在途」的真相；`Phase` 判别联合（`authorizing`/`sent`/`discovery{headers, refusal}`）；`Connection` 判别联合（`modern{version?}`/`legacy{version, session?}`/`legacy-sse{version?}`）；`Sending` 判别联合替代 `Dispatch` 字段袋；`work(flow, entry?)` 唯一的后台工作入口，意外 reject → `stop(entry)` 按相结算；`stop/stopAnswerOf`（signal、close、defect 同一处）；`callHandle` 是凭据句柄的唯一入口，调用前同步核 `closed`；`refusalOf` 把 reportRejection 与 `startAuthorizationDiscovery` 组成后台拒绝流，`soFar()` 供停下时取用；`call` = `race(departed, answered)`；`cancelRequest` 当即返回；`enterSse`/`refusedGet` 与 `notifications/initialized` 经 `untilClosed` 在 `teardown.signal` 下等；`close()` 单飞（`closing: Promise`），标记→同步 stop 全部→`teardown.abort()`→只等 `line.close()`；`die` 对 `sent` 用 `streamGoneAnswerOf`、对 `authorizing` 当场 `NOT_SENT`；`dispatch` 拆出 `armProbe`，`:445` 不可达分支消失。
- `stdio-line.ts`：`writing` 布尔 → `writes` 计数；`closing: AbortController`，`close()` 有在途写就 `writer.abort()` 并让仍在等管道的 `send` 答 `aborted`。
- `limits.ts`、`authorization.ts`：改用契约 `WIRE_LIMITS`（删掉 `METADATA_LIMITS` 拷贝）。
- `index.md`：模块说明跟随。

**packages/mcp/mcp-host-local/tests/**
- `session.spec.ts`：新 describe「the caller waits on the settlement, never on a port」9 条；`:1330` 改为 not-sent；三条 cancel 用例在 `cancelRequest` 后 `untilSent`；「close() 等发现结束」用例改写为新规则（close 先返回、listing 当场结算、迟到的 fetch 结果无处可去）。
- `lines.spec.ts`：重叠写后 `close()`；跨块未换行越界；写被拒绝答 `unsent`；EOF 尾行。
- `model/properties.ts`：V4 `unsettledAfterStop` 只看 op.status（含 cancel op，去掉 authorizing 豁免与 `discoveryAtRest`）；`closeReachesLine` 严格（close 后下个静止点必须已调 `line.close`）；`stopAnswers`（原 `closeAnswers`）同时核 `phasesAtSignal` 与 `phasesAtClose`。
- `model/ports.ts`：`credential.authorize`/`reportRejection`/`fetchMetadata` 加 `hang`，计入 `BREACHES` 预算。
- `model/explore.ts`：`hung` 列表（hang 的调用从可答集合移出、rest 不答、投影含 hung、`pending` 含 hung）；`phasesAtSignal`；删 `notificationWaits`/`boundedness`；`phaseAtStop` 保留「initialize 已读则后续授权是通知」的 V6 排除。
- `model/scenarios.ts`：`minimal` 加 authorize hang（breaches 1）；`http-call` 三个端口加 hang。
- `model/mutants.ts`（新）：12 个负控的缺陷、替换文本、用例、预期变红原因。
- `model/mutate.ts`（新）：`node tests/model/mutate.ts [名…] [--out 目录]`，逐个放进 `src/`、跑用例、按字节还原、输出表格，全红才退出 0。
- `unhandled.ts` 改为 setup 文件；`vitest.config.ts` 加 `setupFiles`；六个用例文件删掉调用；`README.md`、`index.md` 同步。

**packages/mcp/mcp-contract/src/**
- `decisions.ts`（只留 T8 结论 + 新规则）、`answer-readings.ts`（新）、`composition.ts`（新）、`discovery.ts`（新）、`authorization.ts`（+ `discoverAuthorization`、`MetadataFetch`、`startAuthorizationDiscovery`、`AuthorizationDiscoveryRun`）、`wire.ts`（`WIRE_LIMITS`、`endedCauseOf`、`classifyWireEvent` 按事件种类拆成 `lineOf`/`httpStreamOf`/`httpStatusOf`）、`index.ts`、`index.md`、`testing-scripted-transport.ts`（改用共用规则，删自己的 `legacy` getter 与组成代码）。
- `tests/`：`public-entry.spec.ts` 导出集合按新增改写；`decisions.spec.ts` 新 describe 覆盖全部新导出；其余只改导入（`decisions.spec` 一处断言期望改为 `{ ok: { tools: [] } }`——这是我新写的用例，不是原有断言）。
- `SPEC.md`、`docs/public-api.md`。

## 4. 验收逐项

证据目录 `tmp/closures/w3-mcp-host/fix2/`（gates/、red/、model/、mutants/）。哈希为 SHA-256 前 16 位。

**1. 构建/类型/测试** `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=…三个成员` → `Tasks: 19 successful, 19 total`，mcp 254、契约 662、host-local 381 全过，exit 0。`gates/turbo.log` `f6d2d227a71f6a10`（01:44，head 0695f2ba4）。`pnpm --filter @omne-harness/mcp-host-local run test:slow` → `Tests 235 passed | 8 skipped (243)`，`exit 0`（8 skipped = 快层的 8 条模型用例被慢层标签过滤）。`gates/test-slow.log` `d4f881599c0c057b`（01:31，head c8a78f888；之后唯一改动是 session.spec 一条快层用例，慢层未重跑）。

**2. 红灯用例**（`red/baseline-red.log` `f5218dc7b283b46c`，在基线 `db06b5b70` 的 `src/` 上跑；head 上同一批在 turbo 里全绿）：

| 用例（session.spec.ts 除注明外） | 缺陷 | 基线变红输出 |
|---|---|---|
| authorize never answers: the call's signal settles call() with not-sent, and nothing reaches the line | `call` 跟着 `send` 等 authorize | `expected 'pending' to deeply equal { settled: { failure… } }` |
| authorize never answers: close() settles listActions() with not-sent and returns | 同上，`once` 等工作流 | `expected 'pending' …` |
| …one that fires while it is authorized is not-sent, no SentCall (T5)（原 :1330 改写） | 授权中 signal 交 SentCall+abandoned | `expected 'pending' …`（基线上 call 还在等 authorize） |
| reportRejection never answers after a 401: close() returns at once… | `close()` `await Promise.all(flows)` | `expected 'pending' to deeply equal { settled: undefined }` |
| reportRejection never answers after a 401 to a call: the call's signal settles call()… | `abandon` 对 discovery 相不结算 | `expected 'pending' to match object…` |
| authorize never answers: cancelRequest on a legacy Streamable HTTP connection returns at once | `cancelRequest` await `sendNotification` → authorize | `expected 'pending' to deeply equal { settled: undefined }` |
| authorize never answers: close() settles a discover that waits to authorize the fallback GET | `enterSse` await authorize 不受 close 管辖 | `expected 'pending' …` |
| two callers closing at once both return after the line closed, from the one close（追加 16） | 第二个 `close()` 立即返回 | `expected { settled: undefined } to be 'pending'` |
| lines.spec：two overlapping writes, the first completes, then close()（C 探针 writing） | `writing` 布尔 | `expected 'pending' to deeply equal { settled: undefined }` |

追加 14 的三条（跨块未换行越界、写被拒绝答 unsent、EOF 尾行）**基线绿**（A 说的是「没有会失败的用例」，基线行为本身正确），由负控 `mStdio-no-cross-chunk-bound`、`mStdio-failed-write-sent`、`mStdio-drops-tail` 证明能变红（第 6 节）。

**3. 探索器**（新 V4/V6/hang 端口）。基线会话上（`model/baseline-fast.log` `d6f96e5b98076961`、`baseline-slow.log` `de570e10de000a05`）：`minimal` 报 `V4 V4-unsettled-call-authorizing: c1 is waiting after close(); pending: credential.authorize handle`，最短调度 `call / close`（深度 2）；另报 `V6-authorizing: c1 was authorizing at its signal and answered sent no-answer/abandoned`，调度 `call / signal c1 / answer credential.authorize:handle ok`。`http-call` 另报 `V4-unsettled-call-discovery`（`call / authorize ok / line.send 401 / close`）与 `V4-close-waits-port`；`http-peer`、`http-resend`、`sse-fallback` 各报 V4-unsettled-*。head 上（`model/head-fast.log` `bf2354f726c6e272`、`head-slow.log` `ec79f78b67873199`）：快层 8 场景 8 passed、慢层 3 passed，**零违例**；负控「调用方跟着工作流等」`mV4-caller-follows-workflow` 变红（`V4-unsettled-call-authorizing`，minimal），原有负控 V2/V3/V4×2/V5/V6 照旧变红，另加 `mV6-authorizing-abandoned`（B B1 的缺陷）变红。

**4. 结构 grep**（`gates/greps.log` `0eaa3f87a24dc6c0`）：
- `grep -c 'await this.send(' src/session.ts` → 0；`grep -c 'deferred.value'` → 0；`grep -n '\.phase ===\|entry.phase =='` 只命中 `die`/`stopAnswerOf` 里按相分派（没有调用方窥视）。成立的理由：公开方法只 `await` 在途项的 `answered`/`departed`（`once`、`call`）或 `untilClosed`（`enterSse`、`legacyPath`）。
- `close()`（`session.ts:969-977`）：标记、`for … this.stop(entry)`、`teardown.abort()`、`this.closing = this.line.close()`；没有 `await Promise.all(flows)`。
- `grep -c writing src/stdio-line.ts` → 0；`private writes = 0`、`+= 1`、`-= 1`×2、`if (this.writes > 0) abort`。

**5. 契约一处实现**（同一 log）：`callRequestOf`、`requestMetaOf`、`withOneResend`、`cancelsByNotification`、`checksListingHeaders`、`isLegacyConnection`、`endedCauseOf`、`streamGoneAnswerOf`、`authorizationRequiredAnswerOf`、`startAuthorizationDiscovery`、`getTaskRequest`… 各只有一处 `export function`，使用方是 `testing-scripted-transport.ts` 与 `session.ts`（或经 `composition.ts`）；`progressToken: id` 组成只在 `composition.ts`（另一命中是脚本化传输 Pending 的字段名）；`first.wire.resend` 循环只在 `withOneResend`；`isModernProtocolVersion` 在脚本化传输只剩工厂的选项校验，会话 0 处。契约原有用例：`decisions.spec`、`wire.spec` 等原有断言未改（只改导入与导出集合）；纯移动提交 `9ae28f6e6` 用 `git diff --color-moved=zebra --color=always 9ae28f6e6~1 9ae28f6e6 -- <五个文件> | grep -E '^\e\[3[12]m[+-]' | wc -l` → 69 行非移动，全部是文件头注释、import 段与两处为跨文件共用加的 `export`（`malformed` 带一句注释、`errorFailureOf`）；函数体零改动。

**6. 仓库门禁**（head 0695f2ba4 重跑的：turbo、lint:rules、lint:oxlint、format:check、crlf；其余在 c8a78f888，之后只多一条 session.spec 用例）：`lint:rules` PASS（`b2d2a9b72a2151b4`）；`lint:oxlint` 无输出 exit 0（`cc81ed65fa6b9f53`）；`lint:deps` ✔ 81 成员 343 边 0 违规（`72d94cada6db8f77`）；`format:check` 4212 files exit 0（`c8c4c3ce6ceaf195`）；`check:docs` PASS 2738 文件（`13e32caa15bb87fb`）；`check:design` PASS（`66abdcb4075c92fb`）；`git ls-files --eol | grep -c w/crlf` → 0（`9a271f2a916b0b6e`）。

**7. 源码边界**（greps.log）：严格 `as` 断言 grep（代码行、排除 `as const` 与字符串）→ 0；`any` → 0；非空断言 → 0；`modelcontextprotocol` in host `src/` → 0。

**8. metrics** `pnpm run metrics --coverage --base 92a8e3cdf` exit 0（`gates/metrics.log` `a5107b6d6b2085bb`，head c8a78f888；审讯页 `/data/qiwei/repos/omne-harness-lite/tmp/metrics/c8a78f888/review.html`）。变更函数超 alert 3：`withheld.ts headerDeclarationInvalid` CC 19、`wire.ts resultClassOf` CC 16、`decisions.ts probeErrorConclusionOf` CC 11/CRAP 13.8——三个都是本 PR 基线 `92a8e3cdf` 以来的存量，本闭包没有触及（`probeErrorConclusionOf` 只是随拆分移动，唯一未覆盖分支是穷尽检查的 `default`，按 A 裁定交代即可）；`classifyWireEvent`（CC 18）与 `Session.dispatch`（CC 12）已从超线名单消失。读数（`gates/metrics-functions.md`）：`Session.call` CC 5/100%、`close` 3/100%、`cancelRequest` 3/100%、`listActions` 1、`discover` 4、`begin` 6/100%、`sendOut` 7/100%、`dispatch` 8/92%、`work` 2/50%（catch 分支当时无用例；`0695f2ba4` 已补用例，metrics 未重跑）、`stop` 2、`enterSse` 9/100%、`StdioLine.send` 9/100%、`StdioLine.close` 3/100%；超 warn：`StdioLine.readStdout` CC 11（第 2 轮已是 11，本轮未改）、`exchangeConclusionOf`/`httpErrorWireOf` 11、`concludeProbe` 10、`eventOf` 10、`readDiscoverResult` 11、`taskReadOf` 10、`discoverWith` 9/CRAP 10.3——都是存量，本闭包未改其逻辑。

## 5. 门禁日志时间与提交号

见第 4 节各条：01:22–01:24（c8a78f888）lint-deps/check-docs/check-design；01:31（c8a78f888）test-slow；01:39（c8a78f888）metrics、model/head-*；01:40（c8a78f888）mutants/summary.md；01:44–01:45（0695f2ba4）turbo、lint-rules、lint-oxlint、format-check、crlf。基线证据 11-05 19:24–19:25（基线 `src/`，tests 为 75809c54c）。

## 6. 变异表（`mutants/summary.md` `fabd677df965c026`，全部 exit 1 = 变红；源码按字节还原，`git status` 干净）

| 改了什么（`tests/model/mutants.ts`） | 哪条用例变红 | 退出码 |
|---|---|---|
| mV2-forgets-close：`usable` 忽略 `closed` + `callHandle` 去掉 closed 核对（两处守卫） | session-model http-bare/http-call → `V2-authorize-after-close` | 1 |
| mV3-report-twice | http-call → `V3-more-than-refusals` | 1 |
| mV4-signal-dead（signal 不 stop） | minimal → `V4-unsettled-call` | 1 |
| mV4-close-settles-after-line（close 先等线路再结算） | minimal → `V4-unsettled-call` | 1 |
| mV4-caller-follows-workflow（begin 等 sendOut，once/call 等 begin） | minimal → `V4-unsettled-call-authorizing` | 1 |
| mV5-resend-any | http-resend（慢层）→ `V5-write-resent` | 1 |
| mV6-close-not-sent（sent 相答 not-sent） | http-call → `V6-sent` | 1 |
| mV6-authorizing-abandoned（授权中答 abandoned） | minimal → `V6-authorizing` | 1 |
| mStdio-writes-boolean（计数改回布尔） | lines.spec「two overlapping writes…」 | 1 |
| mStdio-no-cross-chunk-bound | lines.spec「spans many chunks…」 | 1 |
| mStdio-failed-write-sent | lines.spec「a write the process rejects is unsent」 | 1 |
| mStdio-drops-tail | lines.spec「the last line of stdout is delivered」 | 1 |
| （手工，未入表）`work` 去掉 `.catch` | session.spec「a workflow that fails unexpectedly…」变红 + setup 守卫报未处理拒绝 | 1 |

V2 说明：新结构里凭据句柄的调用在工作流各步的 `usable` 核对与 `callHandle` 的 `closed` 核对下双重守住，单点变异无法让 V2 变红，所以负控是两处替换（与第 1 轮 V1 的说明同类）。

## 7. 命名账本与自定裁定

命名：`Sending`（probe / legacy-initialize / operation / call）、`Connection`（modern / legacy / legacy-sse）、`Phase`、`Refusal`、`work`、`begin`、`sendOut`、`stop`/`stopAnswerOf`、`callHandle`、`refusalOf`、`enterDiscovery`、`untilClosed`、`teardown`（原 `closing` 控制器）、`closing`（关闭的 promise）、`departed/depart`、`view`、`armProbe`、`refusedGet`、`perform`；契约 `answer-readings.ts`、`composition.ts`、`discovery.ts`、`ComposedRequest`、`RequestValues`、`ConnectionView`、`AuthorizationDiscoveryRun`、`startAuthorizationDiscovery`、`withOneResend`、`requestMetaOf`、`callRequestOf`、`listActionsRequest`、`getTaskRequest`、`getTaskResultRequest`、`updateTaskRequest`、`cancelTaskRequest`、`isLegacyConnection`、`checksListingHeaders`、`cancelsByNotification`、`streamGoneAnswerOf`、`authorizationRequiredAnswerOf`、`endedCauseOf`、`WIRE_LIMITS`；探索器 `hang`/`HANG`、`stopAnswers`、`phasesAtSignal`、`V4-unsettled-<kind>-<phase>`、`V4-close-waits-port`。

移动或改名的契约根导出：**根导出名字一个都没改**；`discoverAuthorization`、`MetadataFetch` 改从 `authorization.ts` 导出，`callAnswerOf` 等读法从 `answer-readings.ts`，`requestTextOf` 等从 `composition.ts`，`discoverWith`/`DiscoverPaths` 从 `discovery.ts`。`git grep` 核对 `packages/mcp/mcp/src`、`tests`：29 处 `from '@omne-harness/mcp-contract'` 导入里没有任何一个被移动的名字（唯一命中 `ABANDONED` 是 `discovery.ts:62` 的本地常量）。

自定裁定（能自己定，依据写在后面）：
1. `reportRejection` 与元数据取回**并发**（原串行）。T4 只要求先调用 `reportRejection` 再报失败，并发仍满足；这样停下时 `soFar()` 不需要「尚未开始取回」的特殊态。代价：对端可能在句柄被告知前收到元数据请求。
2. `notifications/initialized` 在 `discover` 返回前写出，但经 `untilClosed` 在关闭下等；`cancelRequest` 的通知当即返回（规格第 4 条）。口径不同的理由：前者之后有依赖「已初始化」次序的请求，后者没有。
3. `die()` 对 `authorizing` 相当场结算 `not-sent`（原等 authorize 返回后再结算）；结果相同，调用方不再等句柄。
4. `listActionsRequest` 的 `checksListingHeaders` 在组成时算，不在读应答时算；与脚本化传输现在一致，与旧会话只在「并发 `discover` 期间改了修订」时有理论差异。
5. `streamGoneAnswerOf(cause: NoAnswerCause)` 比规则宽一档：`AnswerConclusion.unusable` 的类型含 `abandoned`，收窄它是公开形状改动（0.1.0 项）。
6. 探索器把 `hang` 计入 `BREACHES` 预算，`minimal` 的 breaches 0→1、`http-call` 三端口加 hang；状态数变了，formal2 的运行记录表会过时。
7. `soFar()` 的语义：`startAuthorizationDiscovery` 的 `fetched` 在每次 `await fetchMetadata` 之后同步 push；`stop()` 同步调用 `soFar()`，所以交出的是「已完成的取回」，正在飞的那个地址按 R4 是 `unavailable`。
8. 契约 `decisions-host` 裁定表登记为 10–14 条（含第 1 轮之后的四项与本轮的 T5 结局、元数据句、第 8 条新导出）；「唯一的行为改动」一句删改为第 11 条。
9. 纯移动提交里加了两个 `export`（见验收 5）。

## 8. 让排除文件过时的位置（交后面的表达/证据闭包与 formal2）

- 成员 `SPEC.md:230`「端口失败模型」豁免句（凭据句柄「可以挂起，由句柄的持有者承接」）与 `:236-241` V4、V6 定理句：归 formal2；应改为承诺句「没有 `signal` 的操作只由 `close()` 放开；没有 `close()` 时挂起的句柄由持有者负责」，V4 改为「调用方能看到的每个 promise（含 `cancelRequest`）」，V6 加「signal 与 close 同形」；`:230`、`:241`、`:238` 的 `#t8` 锚点（NB7）也在该节。
- `verification/README.md:43`（映射表写 `Deferred`，已不存在）、`:56`（「端口可以挂起」→ 三个端口可答 `hang`，且 V4 不再豁免）、`:83-93` 运行记录表（状态数全部过时：head 上 minimal 等场景因 hang 分支变大）、`:104`（变异脚本指 `tmp/.../mutate.py` → `tests/model/mutate.ts`，负控名见 `mutants.ts`）、`:106-113` 表（V2 负控改名 `mV2-forgets-close` 且是两处；V4 新增 `mV4-caller-follows-workflow`、`mV4-close-settles-after-line` 取代 `mV4-close-after-line`；V6 新增 `mV6-authorizing-abandoned`）。
- `docs/flows.md:18`（`Pending` 阶段 authorizing 的描述可留，但「call 的 signal 接到它的 AbortController」→ 现在接到 `stop`）、`:43`（「标记旧一路」→ 连接模式联合）、`:67`（`cancelRequest` 当即返回）、`:69`（`close()` 不再「结束取回后」答，当场答）。
- `docs/architecture.md:22`（`StdioLine` 的 `writing` → `writes` 计数 + `closing`）、`:37`（NB13：三行写的是「等到 `close()`」）。
- `docs/object-model.md:15`（`Deferred<Answered>` → `answered/settle`、`departed/depart`）、`:24`（`phase` 现为判别联合，`discovery` 带 `refusal`）、`:39`（「401 之后进入 discovery」仍对；补「停下时按相结算」）；会话字段 `version/legacy/sse/session` → `connection`。
- `README.md:13`、`README_ZH.md:13`（NB12「读不懂的行」）、`README_ZH.md:65`。
- `index.md:8`（NB13 导航）。

## 9. 未覆盖与说明

- `test:slow`、`lint:deps`、`check:docs`、`check:design`、metrics 在 c8a78f888 上跑，最后一个提交 `0695f2ba4` 只加了一条快层用例（turbo、lint:rules、lint:oxlint、format:check、crlf 已在它上面重跑）。
- `Session.work` 的 catch 在 metrics 读数里 50%，`0695f2ba4` 之后有用例覆盖，metrics 未重跑。
- 第 6 条「HTTP 线路按同一规则核一遍」：读过 `http-line.ts`，在途 POST、非 2xx 的 `bodyOf`、GET 的 `firstEventOf` 都挂在 `linked.controller` 下，`close()` 中止全部控制器并 `queue.end()`；没有同类缺口，没有改动。
- `lines.spec` 重叠写用例不能观察 sink 的 `abort()`（WritableStream 只在在途写完成后才调它），改为断言仍在等管道的 `send` 答 `aborted`。
- 真实组合（`@omne-harness/mcp` + 本包）未运行；真实远程对端未验证。
- 差分变异、admission、全仓测试按规格未跑。

# w3-mcp-contract 交回（#1119 r1）

工作树 `/home/user/omne-harness-lite/.worktrees/w3-mcp-contract`，分支 `PanQiWei/skill-mcp-w3-mcp-contract`，基线 `05f281394`，头 `1cbee8026`。工作树干净（`git status --short` 为空）。未推送，未开 PR。

## 1. 结论

做完。已定事项 1–16（除 reduce 2026-11-04 追加撤回的 16 中「`inputSchema` 必须 `type: "object"`」一条）、18、19 全部落地：类型与守卫、SPEC 条款、`mcpTransportConformance()`（54 个用例）与 `createScriptedTransportFactory`。两成员 build/typecheck/test 绿（mcp-contract 424、mcp 254），仓库门禁绿（`lint:deps` 的一处红在基线环境上就有，见第 5 节）。没有命中停止条件：SEP-2663 原文与 T6 不冲突（`tmp/closures/w3-mcp-contract/sep-2663.md`）。

## 2. 提交（全部在 F0 之上，作者 PanQiWei，trailer `Harness: claude-code` / `Agent-Role: developer`）

| 提交 | 说明 |
| --- | --- |
| `f59f67d91` | feat：已定事项 1、2、3、8、12、15、16 的类型与守卫（含当时的 C1 加严，下一提交还原） |
| `03c794051` | docs：SPEC 写回已定事项 4–7、9–11、13、14 与措辞、新节「与协议的偏离」；按追加撤回 C1 加严（`listing.ts` 还原到基线字节）；按波包「生态兼容」在 R4 加「授权流程归凭据提供者」一句 |
| `2e22c9ebc` | feat：`mcpTransportConformance()`、`TransportFixture`/`PeerScript`、`createScriptedTransportFactory`、`tests/transport-conformance.spec.ts` |
| `f26cda7f4` | test：`canonical`/`sameJson` 用例；README、`src/index.md`、`tests/index.md` 同步 |
| `1cbee8026` | test：套件加「关闭时仍在授权的调用不发出」用例（变异 M43 发现 dispatch 守卫只在这个交错下可达） |

## 3. 改了哪些文件（全部在 `packages/mcp/mcp-contract/`）

- `src/brands.ts`：`isRequestState` 接受任何文本（含空串）；注释改为「七个品牌非空」。
- `src/args.ts`（新）：`ActionArgs`、`isActionArgs`（只接受 JSON 对象）。
- `src/json.ts`：加 `sameJson`；`canonical` 与它由根导出。
- `src/ports.ts`：`McpClock { now(): Date }`。
- `src/services.ts`：`refresh` 请求加 `signal?`；`McpPorts.clock?`。
- `src/transport.ts`：`WithheldReason`、`ListingPage.withheld?`、`CallRequest.continuation.inputResponses?`。
- `src/outcomes.ts`：`TaskHints`（`pollIntervalMs?`、`ttlMs?`、`statusMessage?: Untrusted<string>`），`TaskReport` 与 `task` 结局带它。
- `src/classify.ts`：`taskHintsOf`（导出给脚本化传输复用）；`task` 结局带提示；空串 `requestState` 合法。
- `src/index.ts`、`src/provider.ts`、`src/testing.ts`：新导出（见第 9 节）。
- `src/testing-outcome-cases.ts`：空串 `requestState` 改为合法结局；任务提示两例。
- `src/testing-transport.ts`（新）：`PlainJson`、`PeerReply`、`PeerScript`、`PeerReceived`、`PeerNeeds`、`ScriptedPeer`、`TransportFixture`、`TransportKind` 与 `mcpTransportConformance()`。
- `src/testing-scripted-transport.ts`（新）：`createScriptedTransportFactory(script, options?)`、`ScriptedTransportFactory`、`ScriptedTransportOptions`。
- `SPEC.md`：见第 7 节。
- `README.md`、`README_ZH.md`、`src/index.md`、`tests/index.md`：状态表、模块列表、验证段、索引。
- `tests/values.spec.ts`（`isRequestState` 单独一条、`isActionArgs`）、`tests/catalog.spec.ts`（加「`inputSchema` 不是对象」一例，这是 C1 现有规则）、`tests/public-entry.spec.ts`（三个导出集合按新增改写）、`tests/closed-sets.ts`、`tests/closed-sets.spec-d.ts`（`WithheldReason`）、`tests/additive-shapes.spec-d.ts`（新）、`tests/json-equality.spec.ts`（新）、`tests/transport-conformance.spec.ts`（新）。
- `listing.ts`：与基线字节相同（加严写入后又还原）。`package.json`、`acceptance/`、`schema/`、`documentation.json`、`docs/` 未动。

## 4. 验收逐项

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp` | 退出 0；`mcp-contract: Tests 424 passed`，`mcp: Tests 254 passed`，16/16 tasks（`tmp/closures/w3-mcp-contract/gate-turbo.log`） |
| 2 | MC3-1 | 事项→条款对照见第 7 节；类型落点见第 3 节；`closed-sets.ts`/`closed-sets.spec-d.ts`/`spec-closed-sets.spec.ts` 加 `WithheldReason`（`header-invalid`）；旧测试原样通过，只改写了 `public-entry.spec.ts` 的集合与 `values.spec.ts` 中 `isRequestState` 的一条（已定事项 16 明确要求改守卫并加用例） |
| 3 | 已定事项 15 | `tests/values.spec.ts`「takes a JSON object and refuses every other JSON tree」；`tests/additive-shapes.spec-d.ts`「a continuation may carry the request state alone」。变异 M37（守卫接受数组）→ 用例变红，退出 1 |
| 4 | 已定事项 16 | `tests/values.spec.ts`「isRequestState takes any text as written, the empty text included」+ `classifyOutcomeCases`「inputRequired: an empty request state is opaque peer text」；变异 M38 → 变红。`inputSchema type object` 一项按追加撤回，不做；对应用例与守卫已还原 |
| 5 | MC3-2 | `mcpTransportConformance()` 54 例，`clause` 带 T1–T7/偏离，名字带 `(item 7)`…`(item 14)`（`tests/transport-conformance.spec.ts` 有一条用例钉住这一覆盖）；脚本化传输在 `['stdio','streamable-http']` 与反序两种夹具上各跑全部 54 例，`not-applicable` 计为失败（`register` 断言 `{kind:'passed'}`）；两种违约脚本传输：流断开时重发 `tools/call` → 偏离用例变红；去掉凭据句柄使 401/403 不调用 `reportRejection` → 两条 T4 用例变红 |
| 6 | 记录请求 | `ScriptedTransportFactory.received()`：每个请求 `{kind:'request', id, method, params}`，`params._meta` 带三键与 `tools/call` 的 `progressToken`；取消记为 `notification`（stdio）或 `stream-aborted`（HTTP）；`tests/transport-conformance.spec.ts`「records each request with its method, params, _meta and progress token, and the cancel」 |
| 7 | 门禁 | `lint:rules` 0、`lint:oxlint` 0、`format:check` 0、`check:docs` 0（2705 个 Markdown）；`lint:deps` 首跑退出 1：`packages/agent/agent/acceptance/fixtures/executor.mjs` 依赖 `../../dist/index.js` 不可解析——与本闭包无关（diff 不触及 `packages/agent`），原因是该成员 dist 未构建；构建 `@omne-harness/agent` 后复跑退出 0（`gate-lint-deps-after-agent-build.log`）。`git ls-files --eol \| grep -c w/crlf` 为 2：两份 `packages.0.0.1.legacy/.../LICENSE`，索引里就是 CRLF（`i/crlf`，最后改动 `481f9f45f`，基线如此），本闭包未触碰 |
| 8 | `src/` 无 `as`（`as const` 除外）、无 `any` | `grep -rnw as/any` 命中只在字符串字面量（用例名、错误文本）；品牌仍只由 `brands.ts` 守卫授予，`isActionArgs` 不是品牌 |

## 5. 门禁日志（都跑在 `1cbee8026`）

| 日志 | 时间（UTC） |
| --- | --- |
| `gate-turbo.log` | 2026-11-04T06:00:49Z |
| `gate-lint-rules.log`、`gate-lint-oxlint.log` | 06:01:20Z |
| `gate-lint-deps.log`（红，见上）/ `gate-lint-deps-after-agent-build.log`（绿） | 06:02:10Z / 06:04:25Z |
| `gate-format-check.log` | 06:02:11Z |
| `gate-check-docs.log` | 06:02:38Z |
| 成员全量 `step4-full-run.log`（2e22c9ebc 之前的工作树）与 turbo 复跑 | 05:53:32Z / 06:00:49Z |
| 红灯：`red/step2-types-guards.log`（12 条红）、`red/step2-classify.log`（样本表在旧类型上不编译） | 05:23Z |

## 6. 变异表（每条先改源码、重建 dist、跑用例、再 `git checkout` 按字节还原；52/52 变红；原始输出在 `red/M*.log`，汇总 `red/mutations.json`）

| 变异（文件与位置） | 变红的用例（去掉两条违约清单用例后） | 退出码 |
| --- | --- | --- |
| M01 envelope: no elicitation.form（src/testing-scripted-transport.ts） | T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 every request and notification carries the three _meta keys and the fixed capabilities (item 7) | 1 |
| M02 envelope: sampling declared（src/testing-scripted-transport.ts） | T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 every request and notification carries the three _meta keys and the fixed capabilities (item 7) | 1 |
| M03 call: no progressToken（src/testing-scripted-transport.ts） | T3 a call carries a progress token unique per request; progress reaches observe untrusted (item 14)；records each request with its method, params, _meta and progress token, and the cancel | 1 |
| M04 discover: no legacy fallback on a non-modern error（src/testing-scripted-transport.ts） | T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 discover fails only when both paths fail, and reports the modern path (item 7)；T3 legacy: a request from the peer is refused with a JSON-RPC error (item 7) | 1 |
| M05 discover: silence/400 is final, not a fallback（src/testing-scripted-transport.ts） | T3 stdio: a peer silent on discover within the probe time is a legacy peer (item 7)；T3 streamable-http: a 400 answer to discover is a legacy peer (item 7) | 1 |
| M06 discover: no -32022 retry（src/testing-scripted-transport.ts） | T3 -32022 after the retry is error-answer: the retry happens once (item 7)；T3 -32022 with supported versions: one retry with the highest version in common (item 7)；T3, T7 -32022 without a version in common is discover-shape (item 7) | 1 |
| M07 discover: retry without limit（src/testing-scripted-transport.ts） | T3 -32022 after the retry is error-answer: the retry happens once (item 7) | 1 |
| M08 discover: take the peer version instead of the common one（src/testing-scripted-transport.ts） | T2 discover: the modern answer is read to the peer identity；T3 -32022 with supported versions: one retry with the highest version in common (item 7)；T3, T7 -32022 without a version in common is discover-shape (item 7)；T3, T7 no protocol version in common is discover-shape, with no legacy fallback | 1 |
| M09 discover: serverInfo not read（src/testing-scripted-transport.ts） | T2 discover: the modern answer is read to the peer identity | 1 |
| M10 discover: instructions not bounded（src/testing-scripted-transport.ts） | T3 instructions are cut to the byte limit of the material, the digest over the whole text | 1 |
| M11 legacy: peer request answered with a result（src/testing-scripted-transport.ts） | T3 legacy: a request from the peer is refused with a JSON-RPC error (item 7) | 1 |
| M12 T4: other 403 treated like insufficient_scope（src/testing-scripted-transport.ts） | T4 another 403: not-sent connection-unavailable and reportRejection is not called (item 11) | 1 |
| M13 R4: root well-known before the path（src/testing-scripted-transport.ts） | T4 401 with no metadata anywhere: metadata unavailable, issuers empty, scopes from the header (item 11)；T4 401 without resource_metadata: the well-known URL with the path is tried before the root (item 11) | 1 |
| M14 R4: metadata scopes before header scopes（src/testing-scripted-transport.ts） | T4 401: not-sent authorization-required from WWW-Authenticate and the named metadata; reportRejection once (it | 1 |
| M15 T5: stdio cancel sends nothing（src/testing-scripted-transport.ts） | T5 stdio: cancelRequest sends notifications/cancelled with the request id and the envelope (item 9)；records each request with its method, params, _meta and progress token, and the cancel | 1 |
| M16 T5: http cancel sends a notification instead of aborting the stream（src/testing-scripted-transport.ts） | T5 streamable-http: cancelRequest ends the answer stream and sends no notification (item 9) | 1 |
| M17 T5: close cancels stdout before closing stdin（src/testing-scripted-transport.ts） | T5 stdio: close() closes stdin, then cancels stdout, and does not stop the process (item 9) | 1 |
| M18 T5: close stops the process（src/testing-scripted-transport.ts） | T5 stdio: close() closes stdin, then cancels stdout, and does not stop the process (item 9) | 1 |
| M19 T5: abort does not settle the answer（src/testing-scripted-transport.ts） | T5 a call whose signal fires after it was sent answers no-answer (abandoned) | 1 |
| M20 T5: close does not settle pending calls（src/testing-scripted-transport.ts） | T5 close() with a call in flight answers it no-answer (abandoned); later requests are not-sent | 1 |
| M21 T1: stdio stream break does not kill the transport（src/testing-scripted-transport.ts） | T1 stdio: a broken stream leaves a sent call with no-answer (stream-broken) | 1 |
| M22 T1: process exit reported as stream-broken（src/testing-scripted-transport.ts） | T1 stdio: a process that exits leaves a sent call with no-answer (process-exited) | 1 |
| M23 T7: error-shape accepts a non-integer code（src/testing-scripted-transport.ts） | T7 error-shape: an error without an integer code or without a message is not an error-answer | 1 |
| M24 T7: tools-missing read as an empty page（src/testing-scripted-transport.ts） | T7 tools-missing: a tools/list result without a tools list | 1 |
| M25 T7: status-unknown accepted as working（src/testing-scripted-transport.ts） | T7 status-unknown: a tasks/get status outside the five values | 1 |
| M26 T7: input-requests-missing not checked（src/testing-scripted-transport.ts） | T7 input-requests-missing: input_required without inputRequests | 1 |
| M27 T7: result-missing not checked（src/testing-scripted-transport.ts） | T7 result-missing: completed without result, for getTask and getTaskResult | 1 |
| M28 T6: expired on -32600 instead of -32602（src/testing-scripted-transport.ts） | T6 -32602 on tasks/get is expired for getTask and getTaskResult | 1 |
| M29 T6: hints dropped from the task report（src/testing-scripted-transport.ts） | T6 getTask reads the status, the input requests as untrusted and the hints (item 12) | 1 |
| M30 T6: failed task reported as not-finished（src/testing-scripted-transport.ts） | T6 getTaskResult: completed is the result, failed is the error, cancelled is cancelled, working is not-finishe | 1 |
| M31 T2: x-mcp-header not checked on http（src/testing-scripted-transport.ts） | T2 streamable-http: a tool with an invalid x-mcp-header declaration is withheld (item 8) | 1 |
| M32 T2: x-mcp-header checked on stdio too（src/testing-scripted-transport.ts） | T2 stdio: x-mcp-header is not checked and the page is handed over as written (item 8) | 1 |
| M33 deviation: reads not re-sent（src/testing-scripted-transport.ts） | 偏离 streamable-http: a read request whose answer stream broke is sent once more with a new id (item 10)；偏离 streamable-http: a second broken stream on a read is no-answer (stream-broken) (item 10) | 1 |
| M34 deviation: reads re-sent twice（src/testing-scripted-transport.ts） | 偏离 streamable-http: a second broken stream on a read is no-answer (stream-broken) (item 10) | 1 |
| M35 factory: open ignores an aborted signal（src/testing-scripted-transport.ts） | refuses to open on an aborted signal | 1 |
| M36 record: _meta not recorded（src/testing-scripted-transport.ts） | T3 -32022 with supported versions: one retry with the highest version in common (item 7)；T3 a call carries a progress token unique per request; progress reaches observe untrusted (item 14)；T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 every request and notification carries the three _meta keys and the fixed capabilities (item 7)；records each request with its method, params, _meta and progress token, and the cancel | 1 |
| M37 guard: isActionArgs accepts arrays（src/args.ts） | takes a JSON object and refuses every other JSON tree | 1 |
| M38 guard: isRequestState refuses the empty text（src/brands.ts） | isRequestState takes any text as written, the empty text included, and nothing else | 1 |
| M39 classify: statusMessage dropped（src/classify.ts） | T6 getTask reads the status, the input requests as untrusted and the hints (item 12)；task: the poll interval, the ttl and the status message come along, the message untrusted | 1 |
| M40 json: sameJson compares raw text（src/json.ts） | treats trees that differ only in member order as the same | 1 |
| M41 T1/T2: a result is not handed over as written（src/testing-scripted-transport.ts） | T1 call: a sent call hands over the request id and the raw result；T2 call: input_required, task and an unknown resultType come through unclassified；T2 discover: the modern answer is read to the peer identity；T2 listActions: the page carries the tools, the next cursor and the ttl as written；T2 stdio: x-mcp-header is not checked and the page is handed over as written (item 8)；T2 streamable-http: a tool with an invalid x-mcp-header declaration is withheld (item 8)；T3 -32022 with supported versions: one retry with the highest version in common (item 7)；T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 every request and notification carries the three _meta keys and the fixed capabilities (item 7)；T3 instructions are cut to the byte limit of the material, the digest over the whole text；T3 legacy: a request from the peer is refused with a JSON-RPC error (item 7)；T3 stdio: a peer silent on discover within the probe time is a legacy peer (item 7)；T3 streamable-http: a 400 answer to discover is a legacy peer (item 7)；T3, T7 no protocol version in common is discover-shape, with no legacy fallback；T5 stdio: close() closes stdin, then cancels stdout, and does not stop the process (item 9)；T6 a ttl of null is unlimited and left out; a hint of another type is left out (item 12)；T6 getTask on a completed task reports the status without the result；T6 getTask reads the status, the input requests as untrusted and the hints (item 12)；T6 getTaskResult: completed is the result, failed is the error, cancelled is cancelled, working is not-finishe；T7 input-requests-missing: input_required without inputRequests；T7 result-missing: completed without result, for getTask and getTaskResult；holds the answer until the pace hook lets the peer answer；偏离 streamable-http: a read request whose answer stream broke is sent once more with a new id (item 10) | 1 |
| M42 T1: a JSON-RPC error is handed over as a result（src/testing-scripted-transport.ts） | T1 call: a JSON-RPC error comes through answer as error, as written；T1 listActions: a JSON-RPC error is error-answer with code, message and data；T3 -32022 after the retry is error-answer: the retry happens once (item 7)；T3 -32022 with supported versions: one retry with the highest version in common (item 7)；T3 discover fails only when both paths fail, and reports the modern path (item 7)；T6 -32021 on a task operation is error-answer as written: a missing client capability (item 12)；T6 -32602 on tasks/get is expired for getTask and getTaskResult；T6 updateTask and cancelTask on an expired task are error-answer -32602 as written；T7 error-shape: an error without an integer code or without a message is not an error-answer | 1 |
| M43 T1/T5: requests still reach the peer after close（src/testing-scripted-transport.ts） | T5 a call still being authorized when close() ran is not-sent and never reaches the peer | 1 |
| M44 T6: getTask on a completed task carries more than the status（src/testing-scripted-transport.ts） | T6 getTask on a completed task reports the status without the result | 1 |
| M45 T6: tasks/update sends the responses under another name（src/testing-scripted-transport.ts） | T6 updateTask sends tasks/update with the task id and the input responses; the ack is accepted | 1 |
| M46 T6: cancelTask sends tasks/get（src/testing-scripted-transport.ts） | T6 cancelTask sends tasks/cancel; the ack is requested; no notifications/cancelled；偏离 streamable-http: a call, tasks/update and tasks/cancel are not re-sent: no-answer (stream-broken) (item 10) | 1 |
| M47 T6: -32021 is not handed over as written（src/testing-scripted-transport.ts） | T6 -32021 on a task operation is error-answer as written: a missing client capability (item 12) | 1 |
| M48 T4: 401 only read when a handle authorized（src/testing-scripted-transport.ts） | T4 401 on a request that no handle authorized is still authorization-required | 1 |
| M49 T2: nextCursor dropped from the page（src/testing-scripted-transport.ts） | T2 listActions: the page carries the tools, the next cursor and the ttl as written | 1 |
| M50 O2/T6: a null ttl read as zero（src/classify.ts） | T6 a ttl of null is unlimited and left out; a hint of another type is left out (item 12)；task: a null ttl means unlimited and is left out, as is a hint that is not a number | 1 |
| M51 T1: error data dropped from error-answer（src/testing-scripted-transport.ts） | T1 listActions: a JSON-RPC error is error-answer with code, message and data；T3 -32022 after the retry is error-answer: the retry happens once (item 7)；T3 -32022 with supported versions: one retry with the highest version in common (item 7)；T6 -32021 on a task operation is error-answer as written: a missing client capability (item 12) | 1 |
| M52 T6: error message not as written（src/testing-scripted-transport.ts） | T1 listActions: a JSON-RPC error is error-answer with code, message and data；T3 -32022 after the retry is error-answer: the retry happens once (item 7)；T3 discover fails only when both paths fail, and reports the modern path (item 7)；T6 updateTask and cancelTask on an expired task are error-answer -32602 as written | 1 |

两条违约脚本传输（`tests/transport-conformance.spec.ts`「the suite fails a transport that breaks the contract」）另证：重发 `tools/call` → 偏离用例变红；不调用 `reportRejection` → 两条 T4 用例变红。

## 7. 事项号 → 条款号

| 事项 | SPEC 条款 | 类型/守卫落点 |
| --- | --- | --- |
| 1 | S5（`kept`/`cancelled` 一条）、裁定 W3-1 | `ActionDiscovery.refresh` 请求 `signal?` |
| 2 | S3 末段、W3-2 | `McpClock`、`McpPorts.clock?` |
| 3 | 三个入口表、W3-3 | 根 `canonical`、`sameJson`、`isActionArgs`；`./testing` 八个样本构造器 |
| 4 | 「所有权、失败与生命周期」导语（锚 `ownership-rejects`）、AV7、UE6、CU8、PL6、CS9、W3-4 | — |
| 5 | S8、W3-5 | — |
| 6 | S9、W3-6 | — |
| 7 | T3 全条、W3-7 | 套件 T3 用例 |
| 8 | T2、W3-8 | `WithheldReason`、`ListingPage.withheld?` |
| 9 | T5、W3-9 | 套件 T5 用例 |
| 10 | 新节「与协议的偏离」（锚 `protocol-deviations`）、T5 末句、W3-10 | 套件「偏离」用例 |
| 11 | R4、T4、W3-11 | `AuthorizationDiscovery` 不变；套件 T4 用例 |
| 12 | O2 `task` 一行、T6 第一、四条、W3-12 | `TaskHints`、`TaskReport`、`task` 结局；`taskHintsOf` |
| 13 | C2、T3 第一条、W3-13 | — |
| 14 | T3 末条、S6（不改）、W3-14 | 套件 item 14 用例 |
| 15 | R2 末段、S2 第二条、W3-15 | `continuation.inputResponses?`、`isActionArgs` |
| 16 | V1、S7、W3-16（含撤回记录） | `isRequestState`；C1 未改 |
| 18 | 「组合与验证」T1–T7 行与夹具段、W3-17 | `mcpTransportConformance`、`TransportFixture`、`PeerScript` |
| 19 | 同上；「生命周期与所有权」加脚本化传输一句 | `createScriptedTransportFactory` |

## 8. 自定裁定与理由（规格没写的地方）

1. **夹具接口的形状**：`TransportFixture { kinds; protocolVersions; peer(script, needs) }`，`peer` 答 `{ factory, material, received(), close() }`。理由：真实夹具（w3-mcp-host）每次运行只开一种材料，套件按 `kinds` 判不适用；`protocolVersions` 让套件用传输自己会说的版本写 `supportedVersions`，不钉死 `2026-07-28`；`received()` 是套件观察对端的唯一通道，真实服务端夹具在处理器里记录即可。
2. **脚本是纯数据**（`PlainJson`，无函数、无 deferred）。理由：w3-mcp-host 的服务端夹具在子进程里，脚本要能序列化。排次序的需求改由 `createScriptedTransportFactory(script, { pace })` 的钩子承担（每个请求答复前 await 一次），供 B 段 `w3-mcp-call` 代替 W2 的 deferred 步骤。
3. **`Replies` 的语义**：一个答复或按序的列表，最后一项重复。`listing` 按 cursor 键（空串是首页）、`calls` 按工具名、`tasks` 按任务号分别计数。缺省：缺 `discover` 答现代结果（传输自己的版本 + `{tools:{}}`）；缺 `initialize` 答 `-32601`；未列 cursor/tool/task 答 `-32602`；已列任务缺 `update`/`cancel` 答空结果；well-known 未列即 404。
4. **T3 的若干细则**（规格只给方向）：`-32022`/`-32021`/`-32020` 属于现代修订，不触发旧一路；现代一路读不懂的结果也回退旧一路；两条路都失败时报现代一路的失败，现代一路没有 JSON-RPC 应答（探测时限内无应答或 400）时报旧一路的失败；有共有版本可读但不匹配（`supportedVersions` 无交集）直接 `discover-shape`、不走旧一路；旧一路 `initialize` 发 `protocolVersion: 2025-11-25`。已写进 T3。
5. **T5 两句新规则**：`call` 的 `signal` 在发出后触发时 `answer` 以 `no-answer(abandoned)` 兑现（取消仍只由 `cancelRequest` 发出）；`close()` 时在途调用同样 `abandoned`，关闭后请求 `not-sent`；`close()` 可重复调用。理由：服务按 28.8 不等应答，传输若不兑现这个 promise 就永远挂着；套件 `withPeer` 需要幂等关闭。
6. **item 8 在 stdio 上的读法**：stdio 不核 `x-mcp-header`，页原样交出（与 SDK「era-only on non-stdio」一致）。
7. **R4 两处都取不到元数据时报根地址**（原文只说「仍报这个地址」）；`scope` 按空白拆成列表。
8. **任务提示的读法**：`ttlMs: null` 省略（SEP-2663 定义 null 为无限），类型不对的提示省略而不判 malformed（它们是提示，不是状态）。
9. **`isActionArgs` 放在根入口的新文件 `args.ts`**；`CallRequest.args`/`InvokeRequest.args` 类型保持 `JsonValue`，由服务按 R2 抛 `TypeError`（事项 15 原文如此，且不改已有字段类型）。
10. **`countingCredential` 不公开**：套件内部构造计数句柄，`./testing` 公开面不增加这一项。
11. **误操作记录**：05:43Z 一条复合命令把 `cd` 放进了后台子 shell，`vitest run --mode fast` 在会话 cwd（`.worktrees/skill-mcp`）跑成了那个工作树的仓库级成员测试，约 10 分钟后发现并以 SIGINT 中止（退出 130）。`skill-mcp` 工作树 `git status` 干净，没有产物；这段时间内其他写者的测试可能受 CPU 争用影响。之后所有命令都带绝对路径 `cd` 且不用 `&`。

## 9. 结构性改动清单（供 reduce `grep` 核实）

- 新文件：`src/args.ts`、`src/testing-transport.ts`、`src/testing-scripted-transport.ts`、`tests/additive-shapes.spec-d.ts`、`tests/json-equality.spec.ts`、`tests/transport-conformance.spec.ts`。
- 根新导出：`canonical`、`sameJson`、`isActionArgs`、`type ActionArgs`、`type McpClock`、`type TaskHints`。
- `./provider` 新导出：`type WithheldReason`。
- `./testing` 新导出：`mcpTransportConformance`、`createScriptedTransportFactory`、`jsonOf`、`jsonTextOf`、`generationOf`、`revisionOf`、`actionNameOf`、`protocolVersionOf`、`requestStateOf`、`taskIdOf`，类型 `TransportFixture`、`PeerScript`、`PeerReply`、`Replies`、`TaskScript`、`PeerNotificationScript`、`PeerReceived`、`PeerNeeds`、`ScriptedPeer`、`TransportKind`、`PlainJson`、`ScriptedTransportFactory`、`ScriptedTransportOptions`。
- 新可选字段：`refresh` 请求 `signal?`；`McpPorts.clock?`；`ListingPage.withheld?`；`TaskReport`/`task` 结局 `pollIntervalMs?`、`ttlMs?`、`statusMessage?`；`CallRequest.continuation.inputResponses?`（由必填改可选）。
- SPEC 新锚：`decisions-w3`、`ownership-rejects`、`protocol-deviations`、`composition`；新条款 AV7、UE6、CU8、PL6、CS9；T3、T5 改为多条规则。
- `listing.ts` 与基线相同；`package.json` 未改。

## 10. 未覆盖与交接

- 真实传输、真实 SDK 服务端、真实 401/403、真实进程退出：不在本成员，由 `w3-mcp-host` 用同一夹具接口跑套件。`PeerReply.http` 与 `process-exits` 在脚本化传输上只是模型，不证明真实 HTTP/进程行为。
- `docs/public-api.md` 不在写范围（写范围未列 `docs/`），它的「定义索引」还没有 `args.ts`、`testing-transport.ts`、`testing-scripted-transport.ts` 与 W3 新条款号（AV7 等）；交给拥有者或波末写回。
- `mcp` 成员仍用自己的 `McpDiscovery`/`internal/canonical.ts`/`tests/doubles` 绕道，按已定事项 26、27 由 B 段删除；本闭包核对过 `mcp` 在 F0 上对新契约编译与测试通过。
- 已定事项 16 的 C1 加严按追加撤回未做；C1 容错方式归 B 段 `w3-mcp-call`。
- 波包「生态兼容」要求「版本覆盖到官方 SDK 客户端支持的全部修订」：T3 写的是「传输会说的版本」与「双方共有的最高版本」，没有钉版本列表；SSE 旧传输不在 `TransportMaterial.kind` 里（仍是 `stdio | streamable-http`），若 B 段需要新的材料种类，是一次新的可加改动。
- 清理候选（未动）：`packages/mcp/mcp/tests/doubles/scripted-transport.ts`（B 段按事项 19 删除）；`classify.ts` 与 `testing-scripted-transport.ts` 各有一处整数词形判断（`INTEGER`），B 段若再有第三处可抽到 `json.ts`。

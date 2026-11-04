# w3-mcp-contract 第 2 轮交回（#1119 r1，轮次 2）

写者 claude-opus-5-5@high（接手 Fable，记一次降级）。工作树 `/home/user/omne-harness-lite/.worktrees/w3-mcp-contract`，分支 `PanQiWei/skill-mcp-w3-mcp-contract`，第 1 轮头 `1cbee8026`，本轮头 `f06b4e632`。工作树干净。未推送，未开 PR。

## 1. 结论

做完。C1–C9 与待裁 1–6 全部落地，每条先有因预期原因变红的用例：新用例在未修的脚本化传输上 30 例红（`red-r2/step1-cases-before-fix.log`）；评审者列出的违约（B1、B3、B4、B5、B6、B8 与真管道上的 T5）各写成一个违约传输变异，连同其他裁定共 34 条变异（M53–M86），全部变红。最后一次改动之后的门禁全绿。没有命中停止条件。

## 2. 提交（作者与提交者 PanQiWei <594557445@qq.com>，trailer 只有 `Harness: claude-code` / `Agent-Role: developer`）

| 提交 | 说明 |
| --- | --- |
| `4a2d1a59c` | feat：套件与夹具接口按 C1–C9、待裁 1–6 修订；脚本化传输与 `classify` 随之修正；根导出 `LEGACY_PROTOCOL_VERSIONS`；SPEC 写回 |
| `f06b4e632` | test：观察包装让 stdout 等到传输取消；「400 其他码」用例改为能区分报哪一路（变异 M72 在原用例下存活后补） |

## 3. 每条 C 与待裁的落点（行号按 `f06b4e632`；套件文件 `src/testing-transport.ts` 简写 TT，脚本化传输 `src/testing-scripted-transport.ts` 简写 ST，`tests/transport-conformance.spec.ts` 简写 TC）

| 条 | 落点 | 用例名 |
| --- | --- | --- |
| C1 观察包装原样转发 | TT:408 `observedProcess`（写入转给原 writer，读取从原 reader 转出，只记 close/cancel/stop；原进程自己结束 stdout 时包装不转发结束，等传输取消） | TT:1495「stdio: close() closes stdin, then cancels stdout, and does not stop the process (item 9)」；TC:206–345 真管道传输 `PipeTransport` 与夹具 `pipeFixture`，TC:338「T5 stdio: close() closes stdin, then cancels stdout, …」在真管道上通过 |
| C1 `received()` 异步 | TT:129 `ScriptedPeer.received(): Promise<…>`（文档说明夹具等落账后再答）；全部用例改为 `await peer.received()` | 全部用例 |
| C1 T4 由目标派生 | TT:141 `ScriptSource = PeerScript \| ((target) => PeerScript)`；TT:388 `pathOf`、TT:393 `metadataUrlOf`；T4 元数据 `resource` 等于目标（RFC 9728） | TT:1277「401: not-sent authorization-required from WWW-Authenticate and the named metadata; reportRejection once (item 11)」、TT:1312「401 on listActions without resource_metadata: …」 |
| C1 对端在 initialized 之后发请求 | TT:1137 用例核应答排在 `notifications/initialized` 之后；ST:885 先发 initialized 再答对端请求 | TT:1137「legacy: a request the peer sends after notifications/initialized is refused with a JSON-RPC error (item 7)」 |
| C2 401 回报恰好一次 | 每条带凭据的 401 用例断言 `rejections() === 1` | TT:1277、TT:1312（listActions）、TT:1344「401 with no metadata anywhere: …; reportRejection once」、TT:1367「401 on discover: authorization-required with no legacy fallback; reportRejection once (item 11)」 |
| C2 403 非 insufficient_scope 的 Bearer 质询 | — | TT:1404「403 with another Bearer error (invalid_token): connection-unavailable; reportRejection is not called (item 11)」 |
| C3 回退规则 | 三条 `-32022` 用例脚本里给出本可成功的 `initialize`，断言没有发出 `initialize` | TT:1038「-32022 with supported versions: one retry …, kept after (item 7)」、TT:1069「-32022 without a version in common is discover-shape (item 7)」、TT:1091「-32022 after the retry is error-answer: the retry happens once (item 7)」、TT:1116「-32021 on server/discover is error-answer even when initialize would succeed (item 7)」 |
| C4 信封 | TT:315 `assertEnvelopes(peer, received)` 核三键、固定能力，HTTP 上另核请求头 | TT:1691「updateTask sends tasks/update with the task id, the input responses and the envelope; …」、TT:1713「cancelTask sends tasks/cancel with the envelope; …」、TT:1457「stdio: cancelRequest sends notifications/cancelled with the request id and the envelope (item 9)」 |
| C5 旧一路 instructions | — | TT:1186「legacy: the instructions of initialize are cut to the byte limit of the material too」 |
| C6 探测计时 | ST:536–545 `Pending.startProbe`、`settle` 里 `clearTimeout`；ST:581 计时在 `pace` 之后起算；SPEC T3 第 6 条 | TC:367「counts the stdio probe time from when the pace hook lets the peer answer」、TC:381「clears the stdio probe timer when the modern answer comes first」 |
| C7 / 待裁 5 `error-missing` | `src/outcomes.ts:170`；ST:290–291（`getTask`）、ST:313–317（`getTaskResult`，不再编造错误）；`tests/closed-sets.ts`；SPEC T7 第 4 条、T6 第 2 条 | TT:1901「error-missing: failed without an error object, for getTask and getTaskResult; no error is made up」 |
| C8 用例数 | 套件 67 例：T1 6、T2 5、T3 22（含 4 条「T3, T7」）、T4 8、T5 6、T6 11、T7 6、偏离 3。第 1 轮报 54，实为 53 | `tests/transport-conformance.spec.ts` 145 例 = 67×2 + 11 |
| C9 任务提示 | `src/classify.ts:64–71` `COUNT`/`countOf`（只有数字的词形且是安全整数）；`src/outcomes.ts` `TaskHints` 注释；SPEC O2 | TT:1810「a poll interval or ttl that is not a non-negative safe integer is left out (item 12)」；`src/testing-outcome-cases.ts:206/218/229` 三例（负数与小数、指数与 `-0` 与不安全整数、零保留） |
| 待裁 1 请求头 | TT:88 `PeerRequestHeaders`、TT:98 `PeerReceived.headers?`；TT:304 `mcpNameOf`；ST:86 `MCP_NAME_SOURCES`、ST:442 `headersOf`、ST:531；SPEC T3 第 3 条 | TT:713「streamable-http: each request carries MCP-Protocol-Version, Mcp-Method, and Mcp-Name for tools/call and tasks/* (item 7)」；HTTP 上所有调用 `assertEnvelopes` 的用例；TC:390「records the MCP request headers of a Streamable HTTP request, and none on stdio」 |
| 待裁 2 协商版本 | ST:514–520 `dispatch` 的版本取 `how.version ?? this.version ?? this.highest`；ST:862 `initialize` 带提出的旧版本；SPEC T3 第 2 条 | TT:808「after negotiation every request carries the negotiated version, on the legacy path too (item 7)」、TT:1038（重试后的版本保持） |
| 待裁 3 旧一路能力 | ST:84 `LEGACY_CAPABILITIES`；SPEC T3 第 8 条 | TT:779「legacy: initialize offers the highest legacy version and declares elicitation.form only (item 7)」 |
| 待裁 4 HTTP 400 | ST:429 `jsonRpcErrorOf`、ST:641–651；`call` 的 400 路径 ST:1000 `answerOf`；SPEC T3 第 7 条（写出 SDK 2.4.0 出处） | TT:887「streamable-http: a 400 answer to discover is a legacy peer (item 7)」、TT:910「… a 400 whose body is a JSON-RPC error of another code is a legacy peer; if initialize fails, that failure is reported (item 7)」、TT:941「… -32022 error is retried with the version in common (item 7)」、TT:966「… -32021 error is error-answer, with no legacy fallback (item 7)」、TT:1770「streamable-http: a 400 whose body is a JSON-RPC error is the error answer of a task operation (item 12)」 |
| 待裁 6 旧版本列表 | `src/revisions.ts:8` `LEGACY_PROTOCOL_VERSIONS`（SDK 2.4.0 `SUPPORTED_PROTOCOL_VERSIONS`：`2025-11-25`、`2025-06-18`、`2025-03-26`、`2024-11-05`、`2024-10-07`）、`:17` `isLegacyProtocolVersion`；`src/index.ts` 根导出；ST:870；SPEC T3 第 8 条、T7 `discover-shape` | TT:848「legacy: an initialize answer with a version outside LEGACY_PROTOCOL_VERSIONS is discover-shape」 |

SPEC 落点：`SPEC.md` 第 71–78 行（裁定 18 的七项）、第 86 行（根入口加 `LEGACY_PROTOCOL_VERSIONS`）、第 220 行（O2 提示类型）、第 425–438 行（T3 全条重写）、第 445 行（T6 `getTaskResult`）、第 454 行（T7 `error-missing`）、T7 `discover-shape` 一条、第 520 行（组合与验证里的夹具说明）。README/README_ZH 模块列表、`src/index.md`、`tests/index.md` 同步。

## 4. 变异表（34/34 变红）

做法：`tmp/closures/w3-mcp-contract/red-r2/mutate-r2.py` 每条改源码、`pnpm run build` 重建 dist、跑 `tests/transport-conformance.spec.ts`（C9 两条另跑 `tests/classify.spec.ts`），记变红用例，再 `git checkout` 按字节还原并重建。全量在 `f06b4e632` 上跑（开始/结束时间在 `red-r2/mutate-r2.start`）。原始输出 `red/M53-…log` 至 `red/M86-…log`，汇总 `red/mutations-r2.json`，表 `red-r2/mutation-table.md`。改动位置除注明外都在 ST；M80、M81 在 `src/classify.ts`；M82、M86 在 TT 的 `observedProcess`。

评审违约对照：B1→M53；B1b→M54；B1c→M55；B2b→M56；B3→M58；B3b→M59；B4→M60；B5→M61、M62、M63；B6→M64；B8→M65；真管道 T5→M82（第 1 轮形状的观察包装）。

| 变异（文件与位置） | 变红的用例（去掉两条违约包装用例；套件用例在两种材料次序下各跑一次，去重） | 退出码 |
| --- | --- | --- |
| M53 B1: tasks/update and tasks/cancel carry no _meta | T3 streamable-http: each request carries MCP-Protocol-Version, Mcp-Method, and Mcp-Name for tools/call and tasks/* (item 7)；T6 cancelTask sends tasks/cancel with the envelope; the ack is requested; no notifications/cancelled；T6 updateTask sends tasks/update with the task id, the input responses and the envelope; the ack is accepted | 1 |
| M54 B1b: no clientInfo in any _meta | T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 after negotiation every request carries the negotiated version, on the legacy path too (item 7)；T3 every request and notification carries the three _meta keys and the fixed capabilities (item 7)；T3 streamable-http: each request carries MCP-Protocol-Version, Mcp-Method, and Mcp-Name for tools/call and tasks/* (item 7)；T5 stdio: cancelRequest sends notifications/cancelled with the request id and the envelope (item 9)；T6 cancelTask sends tasks/cancel with the envelope; the ack is requested; no notifications/cancelled；T6 updateTask sends tasks/update with the task id, the input responses and the envelope; the ack is accepted | 1 |
| M55 B1c: a notification carries the capabilities only | T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 after negotiation every request carries the negotiated version, on the legacy path too (item 7)；T5 stdio: cancelRequest sends notifications/cancelled with the request id and the envelope (item 9) | 1 |
| M56 B2b: legacy initialize declares sampling and roots | T3 legacy: initialize offers the highest legacy version and declares elicitation.form only (item 7) | 1 |
| M57 ruling 3: legacy initialize declares the tasks extension | T3 legacy: initialize offers the highest legacy version and declares elicitation.form only (item 7) | 1 |
| M58 B3: reportRejection only for tools/call | T4 401 on discover: authorization-required with no legacy fallback; reportRejection once (item 11)；T4 401 on listActions without resource_metadata: the well-known URL with the path is tried before the root; reportRejection once (item 11) | 1 |
| M59 B3b: no reportRejection for tools/list | T4 401 on listActions without resource_metadata: the well-known URL with the path is tried before the root; reportRejection once (item 11) | 1 |
| M60 B4: any 403 with a Bearer challenge is authorization-required | T4 403 with another Bearer error (invalid_token): connection-unavailable; reportRejection is not called (item 11) | 1 |
| M61 B5a: -32022 without a version in common falls back to legacy | T3, T7 -32022 without a version in common is discover-shape (item 7) | 1 |
| M62 B5b: -32021 and -32020 fall back to legacy | T3 -32021 on server/discover is error-answer even when initialize would succeed (item 7)；T3 streamable-http: a 400 whose body is a JSON-RPC -32021 error is error-answer, with no legacy fallback (item 7) | 1 |
| M63 B5c: -32022 after the retry falls back to legacy | T3 -32022 after the retry is error-answer: the retry happens once (item 7) | 1 |
| M64 B6: legacy instructions not bounded | T3 legacy: the instructions of initialize are cut to the byte limit of the material too | 1 |
| M65 B8: _meta keeps the highest version after legacy negotiation | T3 -32022 with supported versions: one retry with the highest version in common, kept after (item 7)；T3 after negotiation every request carries the negotiated version, on the legacy path too (item 7) | 1 |
| M66 ruling 2: _meta keeps the highest version after a -32022 retry | T3 -32022 with supported versions: one retry with the highest version in common, kept after (item 7) | 1 |
| M67 ruling 2: initialize carries the modern version in _meta | T3 legacy: initialize offers the highest legacy version and declares elicitation.form only (item 7) | 1 |
| M68 ruling 1: no Mcp-Name on tasks/* | T3 every request and notification carries the three _meta keys and the fixed capabilities (item 7)；T3 streamable-http: each request carries MCP-Protocol-Version, Mcp-Method, and Mcp-Name for tools/call and tasks/* (item 7)；T6 cancelTask sends tasks/cancel with the envelope; the ack is requested; no notifications/cancelled；T6 updateTask sends tasks/update with the task id, the input responses and the envelope; the ack is accepted | 1 |
| M69 ruling 1: Mcp-Name on every request | T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 after negotiation every request carries the negotiated version, on the legacy path too (item 7)；T3 every request and notification carries the three _meta keys and the fixed capabilities (item 7)；T3 streamable-http: each request carries MCP-Protocol-Version, Mcp-Method, and Mcp-Name for tools/call and tasks/* (item 7) | 1 |
| M70 ruling 1: MCP-Protocol-Version header is always the highest version | T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 after negotiation every request carries the negotiated version, on the legacy path too (item 7) | 1 |
| M71 ruling 4: every 400 on discover is a legacy peer | T3 streamable-http: a 400 whose body is a JSON-RPC -32021 error is error-answer, with no legacy fallback (item 7)；T3 streamable-http: a 400 whose body is a JSON-RPC -32022 error is retried with the version in common (item 7) | 1 |
| M72 ruling 4: every JSON-RPC 400 on discover is an error answer | T3 streamable-http: a 400 whose body is a JSON-RPC error of another code is a legacy peer; if initialize fails, that failure is reported (item 7) | 1 |
| M73 ruling 4: a 400 to a task operation is connection-unavailable | T6 streamable-http: a 400 whose body is a JSON-RPC error is the error answer of a task operation (item 12) | 1 |
| M74 ruling 6: legacy version not checked against the list | T3, T7 legacy: an initialize answer with a version outside LEGACY_PROTOCOL_VERSIONS is discover-shape | 1 |
| M75 T3: -32601 reports the modern failure | T3, T7 legacy: an initialize answer with a version outside LEGACY_PROTOCOL_VERSIONS is discover-shape | 1 |
| M76 C6: probe time starts before the pace hook | counts the stdio probe time from when the pace hook lets the peer answer | 1 |
| M77 C6: probe timer not cleared by the answer | clears the stdio probe timer when the modern answer comes first | 1 |
| M78 C7: failed without error makes up an error | T7 error-missing: failed without an error object, for getTask and getTaskResult; no error is made up | 1 |
| M79 C7: an error that is not an object is accepted | T7 error-missing: failed without an error object, for getTask and getTaskResult; no error is made up | 1 |
| M80 C9: a negative hint is kept | T6 a poll interval or ttl that is not a non-negative safe integer is left out (item 12)；task: a hint written with an exponent or a sign is left out, as is an unsafe integer；task: a negative or fractional poll interval or ttl is left out | 1 |
| M81 C9: an unsafe hint is kept | T6 a poll interval or ttl that is not a non-negative safe integer is left out (item 12)；task: zero is a hint; an integer past the safe range is left out | 1 |
| M82 C1: observedProcess does not carry the pipes (round-1 shape) | T5 stdio: close() closes stdin, then cancels stdout, and does not stop the process (item 9) | 1 |
| M83 C1: peer requests answered before notifications/initialized | T3 legacy: a request the peer sends after notifications/initialized is refused with a JSON-RPC error (item 7) | 1 |
| M84 C2: another 403 with a challenge still reports the rejection | T4 403 with another Bearer error (invalid_token): connection-unavailable; reportRejection is not called (item 11) | 1 |
| M85 record: headers recorded on stdio too | records the MCP request headers of a Streamable HTTP request, and none on stdio | 1 |
| M86 C1: observedProcess forwards the end of stdout | T5 stdio: close() closes stdin, then cancels stdout, and does not stop the process (item 9) | 1 |

M82、M86 只在真管道传输上变红：脚本化传输不读管道，观察包装断开管道对它没有影响。这正是评审阻断 1 的情形。

第 1 轮的 M01–M52 没有在新头重跑：部分锚点已改名（例如 `fallback-silent` 改为 `legacy-peer`），原脚本的模式不再匹配。reduce 的差分变异在最终头覆盖它们。评审者的 `probe-broken.mjs` 同理绑定第 1 轮 dist 的字节，没有原样重跑；它的每种违约都在上表有对应变异。

## 5. 门禁日志（全部在 `f06b4e632`，`tmp/closures/w3-mcp-contract/gates-r2/`，时间取 `date -u`）

| 命令 | 开始–结束（UTC） | 结果 |
| --- | --- | --- |
| `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp --force` | 2026-11-04T10:22:00Z–10:22:12Z | 退出 0；16/16 tasks（cache bypass）；mcp-contract 15 文件 459 例通过，类型无错；mcp 13 文件 254 例通过（`turbo.log`） |
| `pnpm run lint:rules` | 10:22:21Z–10:23:01Z | 退出 0（`lint-rules.log`） |
| `pnpm run lint:oxlint` | 10:22:21Z–10:22:26Z | 退出 0（`lint-oxlint.log`） |
| `pnpm run lint:deps` | 10:22:21Z–10:23:20Z | 退出 0（`lint-deps.log`；第 1 轮的 agent dist 问题这次没有出现） |
| `pnpm run format:check` | 10:22:21Z–10:22:26Z | 退出 0（`format-check.log`） |
| `pnpm run check:docs` | 10:22:21Z–10:22:58Z | 退出 0（`check-docs.log`） |
| `git ls-files --eol \| grep -c w/crlf` | 10:23:22Z | 2：`packages.0.0.1.legacy/model/pi-ai-transport/resources/tokenizers/{deepseek-v4,qwen-38-27b}/LICENSE`，索引里就是 CRLF（`i/crlf`），基线如此，本闭包未触碰（与第 1 轮相同） |

汇总在 `gates-r2/gates.txt`。另：`src/` 无 `as`（`as const` 除外）、无 `any`（grep 命中只在注释与字符串）。

## 6. 自定裁定与理由

能自己定的，依据逐条写出：

1. **夹具脚本可以是函数** `ScriptSource = PeerScript | ((target) => PeerScript)`。依据：C1 要求 T4 的元数据 URL 与 `resource` 从夹具给出的目标派生，而目标在夹具建好之后才知道。函数在夹具进程内求值，写出的仍是纯数据，能送到子进程里的服务端。只有 `streamable-http` 的用例传函数。
2. **`PeerReceived.headers?` 的形状**：小写头名为键，只记 `mcp-protocol-version`、`mcp-method`、`mcp-name` 三个。依据：待裁 1 只要求这三个头；小写与 `Headers` 的规范化一致。stdio 请求没有这个字段。
3. **每个 HTTP 请求都带 `MCP-Protocol-Version` 与 `Mcp-Method`**，含旧一路的 `initialize`；`MCP-Protocol-Version` 等于该请求 `_meta` 的版本；通知不要求带。依据：SEP-2243 与 SEP-2663 原文「`Mcp-Method` 按标准头约定设为方法名」；SDK 2.4.0 服务端只核请求不核通知（`validateStandardRequestHeaders` 的说明）。SDK 客户端在旧会话上不发这些头，因为它的旧请求不带 `_meta`；本组的旧请求按已定事项 7 带 `_meta`，头跟随 `_meta`。
4. **`initialize` 的 `_meta` 版本是它提出的旧版本**（等于 `params.protocolVersion`），不是现代最高版本。依据：待裁 2 的「协商之后取协商版本」没有覆盖协商中的 `initialize`；同一请求里两个版本互相矛盾时，按 `_meta` 分类的服务端会误判修订。
5. **待裁 3 的「任务扩展只在现代修订声明」只用在 `initialize.params.capabilities`**；旧连接上每请求 `_meta.clientCapabilities` 仍固定声明任务扩展。依据：已定事项 7「`clientCapabilities` 固定声明任务扩展」，裁定 3 的对象是 `initialize.params.capabilities`。若 reduce 的意思包括旧连接的 `_meta`，改动是 ST 一行与 `assertEnvelopes` 一处。
6. **现代一路答 `-32601`、探测超时或「判旧对端的 400」时，两路都失败报旧一路的失败**；其余报现代一路。依据：待裁 6 要求旧版本不合法时答 `discover-shape`，而真实旧对端在 stdio 上对 `server/discover` 答 `-32601`；不加这条，`discover-shape` 会被 `-32601` 盖住。第 1 轮「报现代一路」的规则对 `-32603` 这类现代对端自己的错误仍成立（TT:984 用例不变）。
7. **400 的 JSON-RPC 错误正文对所有请求都是该请求的错误应答**，不只 `server/discover`；`tools/call` 收到时调用算已发出，`answer` 是 `error`。依据：SDK 2.4.0 服务端把 `-32021`、`-32022`、`-32020` 映射到 HTTP 400（`LADDER_ERROR_HTTP_STATUS`），SDK 客户端把现代请求的 400 JSON-RPC 正文当作应答。不这样读，T6「`-32021` 原样交出」在真实 SDK 服务端上做不到。本组不核正文 `id`（SDK 传输核，探测分类不核）。
8. **与 SDK 2.4.0 的一处差异照 reduce 裁定**：SDK 的探测分类把 `-32020`、`-32021` 当作旧对端；本组按 C3 答 `error-answer`。SPEC T3 写明这处差异与理由。生态兼容影响：只在对端对 `server/discover` 答这两个码时出现。
9. **`LEGACY_PROTOCOL_VERSIONS` 放在根入口与新模块 `src/revisions.ts`**，不放 `./provider`。依据：`./provider` 只导出类型（`tests/public-entry.spec.ts`「the provider entry exports port types only」锁住这一点），根入口放契约的值。`isLegacyProtocolVersion` 不导出。
10. **`error-missing` 也包括 `error` 不是对象**，`getTask` 与 `getTaskResult` 都答它。依据：SEP-2663 `failed` 带 JSON-RPC 错误对象；与 `result-missing` 对两个操作都成立一致。
11. **任务提示的词形**：只收只有数字的词形（不带符号、小数点、指数）且是安全整数；`0` 保留，`-0`、`1e2` 省略。依据：C9「非负安全整数」，词形规则沿 O4 的做法。
12. **观察包装不转发对端自己结束的 stdout**，等传输取消。依据：stdio 服务端常在 stdin 结束时退出并结束 stdout；转发结束会让传输的取消变成空操作，观察不到。变异 M86 证明真管道上会因此变红。代价：这个用例里传输看不到 stdout 结束；用例只做 `discover` 与 `close`。
13. **`ScriptedTransportFactory.received()` 保持同步**；只有夹具接口 `ScriptedPeer.received()` 改为异步。依据：内存替身同步落账；B 段 `w3-mcp-call` 直接读它更简单。
14. **探测计时的模型**：计时在 `pace` 之后起算，任何应答（含错误）都清除计时器。真实传输没有 `pace`，规则落成 SPEC 的「只在等待现代应答时计时」。

没有「只有负责人能定」的项。第 5 条是对裁定范围的读法，已写出改法与代价，reduce 可以直接改判。

## 7. 写者声称的结构性改动（供 `grep` 核实）

- 新文件：`packages/mcp/mcp-contract/src/revisions.ts`（`export const LEGACY_PROTOCOL_VERSIONS`、`export function isLegacyProtocolVersion`）。
- 根新导出：`LEGACY_PROTOCOL_VERSIONS`（`src/index.ts`：`export { LEGACY_PROTOCOL_VERSIONS } from './revisions.ts'`；`tests/public-entry.spec.ts` 的 `ROOT` 加这一项）。
- `./testing` 新导出类型：`PeerRequestHeaders`、`ScriptSource`（`src/testing.ts`）。
- 封闭集合加一项：`AnswerMalformed['what']` 的 `'error-missing'`（`src/outcomes.ts`、`tests/closed-sets.ts` 的 `ANSWER_MALFORMED_WHAT`、SPEC T7）。
- 夹具接口：`ScriptedPeer.received(): Promise<readonly PeerReceived[]>`；`TransportFixture.peer(script: ScriptSource, needs)`；`PeerReceived` 的 `request` 加 `headers?: PeerRequestHeaders`。
- `observedProcess` 用 `getWriter()`/`getReader()` 转发原流（`grep -n "getWriter\|getReader" src/testing-transport.ts`）。
- 脚本化传输：`LEGACY_CAPABILITIES`、`MCP_NAME_SOURCES`、`jsonRpcErrorOf`、`headersOf`、`answerOf`、`Pending.startProbe`、`modernPath` 的 `legacy-peer`（原 `fallback-silent` 已删除，`grep -c fallback-silent` 为 0）、`readTaskAnswer` 不再编造错误（`grep -c "message: 'failed'"` 为 0）、`const LEGACY_VERSION` 已删除（`grep -c "const LEGACY_VERSION"` 为 0，改用 `OFFERED_LEGACY_VERSION`）。
- `classify.ts`：`numberOf` 删除，改为 `COUNT`/`countOf`。
- `tests/transport-conformance.spec.ts`：真管道 `PipeTransport` 与 `pipedProcess`；`fixtureOf` 接受函数脚本，`received` 异步；违约包装 `forgettingRejections` 的期望从 2 例扩为 5 例。
- 不改：`package.json`、`acceptance/`、`schema/`、`documentation.json`、`docs/`、`packages/mcp/mcp/`、`packages/mcp/mcp-host-local/`、锁文件。

## 8. 未覆盖与交接

- 真实传输、真实 SDK 服务端、真实 HTTP 头与 400 正文、真实进程退出：不在本成员。`w3-mcp-host` 用同一夹具接口跑套件时，夹具要处理函数脚本（`ScriptSource`）、异步 `received()`（含 HTTP 中止与对端请求应答的落账）与 `PeerReceived.headers`。
- 真管道证据只覆盖 T5 关闭次序（`discover` + `close`）；其余 stdio 用例只在脚本化传输上运行。
- `Mcp-Name` 的值编码（SDK 的 `encodeMcpParamValue`，非 ASCII 时用哨兵编码）没有写进契约；套件只用 ASCII 的工具名与任务号。真实工具名含非 ASCII 字符时，`w3-mcp-host` 需要这一条，属于新的可加条款。
- 第 1 轮变异 M01–M52 与评审者 `probe-broken.mjs` 没有在新头原样重跑（见第 4 节）。
- `packages/mcp/mcp-contract/docs/public-api.md` 不在写范围：它的定义索引还没有 `revisions.ts`、`LEGACY_PROTOCOL_VERSIONS`、`error-missing`、`ScriptSource`、`PeerRequestHeaders`。交拥有者或波末写回。
- 线规格 `waves/w3/mcp/spec.md` 已定事项 7 的文字没有随待裁 2–4、6 更新（不在写范围）；成员 SPEC T3 是本轮的落点。
- 「Streamable HTTP 对只会旧 SSE 的对端回退」一句仍归 B 段 `w3-mcp-host`。
- 清理候选（未动）：ST 的 `errorOf` 与 `classify.ts` 的 `classifyError` 各自判整数错误码，B 段若再出现第三处可抽到 `json.ts`；`packages/mcp/mcp/tests/doubles/scripted-transport.ts`（B 段按已定事项 19 删除）。

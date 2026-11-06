# w3-mcp-host 第二段交回（写者 a1e1018a63dec3681 的 SubagentHandback 原文，头 a7b86e13b）

取自会话子代理记录 agent-a1e1018a63dec3681.jsonl，2026-11-05 取出。fix1 之后部分条目已被取代（如 message.ts 已删），卡上证据按最终 head 逐条复核后再引用。

# w3-mcp-host 第二段交回（#1119 r1，developer，implementation_kind: product）

工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，分支 `PanQiWei/skill-mcp-w3-mcp-host`，基线 `92a8e3cdf` + reduce 的依赖提交 `114f1e7ef`。工作树干净，没有推送。没有改 `package.json` 依赖段、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`packages/mcp/mcp`、`acceptance/`。

## 提交（按施工次序）

| 步 | 提交 | 内容 |
| --- | --- | --- |
| 1 契约可加改动 | `f46bcbe5c` | 13 个协议纯函数进 `@omne-harness/mcp-contract` 根导出（`clientEnvelopeOf`、`mcpRequestHeadersOf`、`withheldTools`、`authorizationChallengeOf`、`metadataCandidatesOf`、`authorizationDiscoveryOf`、`readDiscoverResult`、`readInitializeResult`、`peerIdentityOf`、`readListingPage`、`readTaskReport`、`readTaskAnswer`、`errorAnswerOf`）；`WireContext.mode?: 'sse'`；F4–F8 与旧 HTTP+SSE 回退写进 SPEC T2/T3/T5/T8/T9、新节「真实传播兑现时的裁定」(`#decisions-host`)；脚本化传输改用根导出；旧测试不改全绿 |
| 1 修正 | `96576e628` | SDK 对照表两处 `文件:行` 改为核过的 client 文件；回退 GET 的头写实 |
| 2 会话 | `7efff67de` | `src/session.ts`、`line.ts`、`message.ts`、`limits.ts`、`queue.ts`；`tests/session.spec.ts` 按 `TRANSPORT_TABLE` 每行每格在内存线路上驱动 |
| 3 stdio | `4bbca7f28` | `src/stdio-line.ts`；A 层 stdio 对端；契约套件在 stdio 上全绿 |
| 4 HTTP | `22849a33b` | `src/http-line.ts`、`authorization.ts`、`options.ts`、`factory.ts`、`index.ts`；A 层 HTTP 对端；两种材料套件全绿 |
| 5–6 用例 | `769a31522` | 旧 HTTP+SSE 回退用例、MC3-10 `tests/stdio.spec.ts`、MC3-11 `tests/http.spec.ts`、B 层 SDK 对端；stdio 线路两处真实缺陷修复（16 MiB 行上界在换行到达的块上漏核；退出观察晚一个微任务） |
| 6 文档 | `46a46fcd8` | 成员 SPEC、README/README_ZH、index、docs 六专题、src/tests/fixtures 的 README 与 index；**同一提交里有两处测试改动**：`tests/public-entry.spec.ts` 加 SDK 基线对照用例；`tests/stdio.spec.ts` 四个 SDK 对端用例改用 5 s 探测时限（见自裁 2） |
| 6 修正 | `2074c146c`、`4b817fb7a` | SPEC 变异句改为实测结果；依据表组设计修订号改为 `03505c68f`；H12 只陈述观测 |
| 清理 | `a7b86e13b` | 删夹具里三条多余的 `eslint-disable`（oxlint warning 归零） |

## 验收清单逐项

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 1 | `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp` | **exit 0**，19/19 tasks（第二次；日志 `tmp/closures/w3-mcp-host/red/acceptance-1-turbo-run2.log`）。第一次 1 红：三包并行时 `server-everything` 冷启动超过 300 ms 探测时限、传输按 T8 D13 走旧一路（产品行为正确，用例前提在负载下不成立），处置见自裁 2 |
| 2 MC3-9 | `tests/conformance.spec.ts`（慢层） | 两种材料各跑一遍 `mcpTransportConformance()`：stdio 优先 **97 过 / 1 不适用 / 0 失败**，Streamable HTTP 优先 **96 / 2 / 0**。不适用集合钉死：stdio 的 X02 两格（`discover-retry`、`initialize` × `unsent`：离开前失败在 stdio 上只有进程在 `open` 前已退出能实现，不能在第二次交换上实现）；HTTP 上「对端在 `initialized` 之后发请求」（本传输不开 GET 流，对端无通道）。旧 HTTP+SSE 回退有自己的用例（session.spec 的 SSE 模式组 + http.spec 四种回退情形 + `server-everything sse`） |
| 3 MC3-10 | `tests/stdio.spec.ts` | 12 过：非 JSON 行、16 MiB 行上界、进程先退出/stdout 先结束/`open` 前退出/答后退出、SDK 工具里退出、SDK 旧对端回退、探测时限回退与迟到应答、取消通知 `_meta`、SDK 慢工具取消与关闭、`server-everything stdio` |
| 4 MC3-11 | `tests/http.spec.ts` | 17 过：SDK bearer 网关 401 与元数据、两种 403、两段地址、凭据不泄漏、再发与不再发、连接被拒与头前重置、不跟随重定向、`x-mcp-header` 剔除、`server-everything streamableHttp`、SDK 2025 会话 `DELETE`→S07、现代取消中止流、旧 HTTP+SSE 四种情形、`server-everything sse` |
| 5 | `packages/mcp/mcp-host-local/SPEC.md`「与 SDK 的复用关系」 | 设计第 2 节的表进 SPEC（裁定 Q2），每处不复用带硬承诺、条款、`文件:行`；复用行写接入方式；两行与设计不同，见自裁 1 |
| 6 | `http.spec.ts`「the credential value appears in no answer, failure or discovery」 | 对所有结局的 JSON 断言不含令牌；本包不写日志；`Exchange`/`WireEvent`/失败都不带请求头（SPEC H13） |
| 7 | contract `tests/protocol-functions.spec.ts`、`public-entry.spec.ts` ROOT +13；`testing-scripted-transport.ts` 用根导出 | mcp-contract 17 文件 553 过，旧测试未改 |
| 8 门禁 | `lint:rules` PASS；`lint:oxlint` exit 0、0 warning；`lint:deps` ✔（**注意**：干净工作树上先红——`packages/agent/agent`、`packages/identity/identity-sql` 的测试导入自己的 `dist/`，需先 `pnpm turbo run build --filter=@omne-harness/agent --filter=@omne-harness/identity-sql`，环境事实非本次改动）；`format:check` 全过；`check:docs` PASS；`git ls-files --eol \| grep -c w/crlf` = 0 | 全过 |
| 9 | `grep` `src/` 代码行 | `as`（除 `as const`）0、`any` 0、非空断言 0；公开导出只有 `createLocalTransportFactory` 与类型 `LocalTransportOptions`，无 SDK 类型；`RangeError` 五种不合法选项有用例 |

## 套件计数

| 文件 | 层 | 用例 |
| --- | --- | --- |
| mcp-contract 全部 | | 17 文件 553 |
| mcp 全部（只读，未改） | | 13 文件 254 |
| `public-entry.spec.ts` | fast | 11 |
| `session.spec.ts` | fast | 74 |
| `conformance.spec.ts` | slow | 196（97+1 / 96+2） |
| `stdio.spec.ts` | slow | 12 |
| `http.spec.ts` | slow | 17 |
| mcp-host-local 合计 | | 5 文件 310，约 124 s |

## 用例 → 缺陷 → 变红证据（`tmp/closures/w3-mcp-host/red/mutations.md`，每条改一处产品源码、只跑一个文件、还原字节）

| 承诺 | 变异 | 变红 |
| --- | --- | --- |
| H1 一张表一份实现 | `conclude` 删 `http:2xx` case | session.spec D15、I06、O05、O06 行 |
| H1 | `answerWireOf` 探测的「5xx+码」不答 `server-error` | session.spec D16（20 格） |
| H2 线路不分类 | HTTP 线路丢掉 POST 错误状态正文 | conformance 两遍各 11 用例（D04–D08、D12、I03、O01–O03、C02…） |
| H3 open 不发请求 | `factory.open` 去第二次 `signal` 核对 | public-entry「signal fires while a stdio line is being opened」 |
| H4 凭据 | 带 `insufficient_scope` 的 403 不按 S05 | session.spec S05（16 格） |
| H5 不代重发 | 写类请求也再发 | http.spec「tools/call, tasks/update and tasks/cancel are not sent again」 |
| H6 关闭次序 | 先取消 stdout 再关 stdin | public-entry 两例 |
| H8 字节上界 | 上界翻倍 | stdio.spec「a line above the 16 MiB byte bound」 |
| H9 回退 | endpoint 不核同源 | http.spec「a cross-origin endpoint」 |
| H9 | SSE 模式下仍再发 | http.spec「the stream breaking … re-sends nothing」 |
| H10 离开前失败 | `UNSENT_CODES` 加 `UND_ERR_SOCKET` | http.spec「a reset before the answer head is stream-broken」 |
| H11 探测时限 | `PROBES` 加 `tools/list` | session.spec O01、O03、O08 |
| 施工期真实红灯 | 见 `red/step1-contract.md`…`step5-6-specs.md`（`readTaskAnswer` 吞失败、16 MiB 换行块漏核、退出观察晚一微任务、夹具 `endSessions` 等） | 各自文件记录 |

等价变异（未变红、已在 mutations.md 记明，不计为覆盖）：`READ_METHODS` 加 `tools/call`（call 不经 `request()`）；去掉 `authorized` 条件（它恒等于有句柄）；stdio 丢非 JSON 行（契约归 `other`）；回退 GET 的状态正文置空（I07 不读）。

## 自裁（授权内，请 reduce 核）

1. **复用表两行与设计不同（偏离裁定 Q2「原样进 SPEC」的输入，请重新确认）**：`serializeMessage` 与 `_meta`/错误码/`SUPPORTED_PROTOCOL_VERSIONS` 常量从「复用」改为「不复用」——契约根已导出同名常量，`serializeMessage` 只是 `JSON.stringify + '\n'`，为此引入 `@modelcontextprotocol/client` 运行时依赖没有价值。后果：产品源码零 `@modelcontextprotocol/*` 导入；`package.json` 的 `@modelcontextprotocol/client` 只被 `tests/public-entry.spec.ts` 一条对照用例使用（`LEGACY_PROTOCOL_VERSIONS` 等于 SDK `SUPPORTED_PROTOCOL_VERSIONS`），它该不该从 `dependencies` 挪到 `devDependencies` 交依赖写入负责人。
2. **B 层 SDK 对端用例的探测时限 5 s**（`tests/stdio.spec.ts` `sdkFactory`/`openSdk`，四处）：A 层仍 300 ms。随 `46a46fcd8` 提交。
3. 旧 HTTP+SSE 做成 HTTP 线路的一种模式（`WireContext.mode='sse'`），不是第三条线路。
4. stdio 线路从 `open` 起读出并丢弃 stderr，不写日志（防进程阻塞）。
5. `close()` 不发 `DELETE`（裁定 Q10），SPEC 写成与协议 SHOULD 的偏离。
6. `open` 零 I/O、不调句柄，答复前再核 `signal`（T9 新义务）。
7. 回退 GET 只带 `Accept: text/event-stream`、`MCP-Protocol-Version`、授权头；不带 `Mcp-*`。
8. A 层 `unsent` 预判规则：忽略未消费的缺省 discover；`initialize` 的 unsent 等旧一路前的探测答复。
9. 夹具只用 20000–59999 端口（`fetch` 拒绝 WHATWG bad ports，本机临时端口范围从 1024 起；探针 p7 排除端口复用）；SPEC 偏离表记了 bad-port 限制。
10. 通知的 `unsent` 结局忽略（N01）；应答到达后应答流在后台读完而不是中止（释放连接）；元数据取回不经凭据句柄（公开资源）。
11. HTTP 线路不设自己的超时（SPEC H11）；读类再发只一次、新请求号、重新授权。

## 结构改动清单（供 reduce grep）

- 契约根新增导出 13 个函数（见提交 `f46bcbe5c`）；`WireContext.mode`；`wire.ts` 删本地 `taskResultClassOf`/`TASK_STATUSES`；新文件 `src/{plain,envelope,withheld,authorization,readers}.ts`。
- host-local 新文件：`src/{limits,message,queue,line,session,stdio-line,http-line,authorization,options,factory}.ts`；`tests/{memory-line.ts,session.spec.ts,conformance.spec.ts,stdio.spec.ts,http.spec.ts}`；`tests/fixtures/process.ts`、`tests/fixtures/scripted/{children.ts,stdio-peer.mjs,stdio.ts,special-stdio.mjs,http.ts}`、`tests/fixtures/sdk/{legacy-stdio.mjs,modern-stdio.mjs,everything.ts,bearer-http.ts,legacy-http.ts}`。
- 文档：成员 18 个 Markdown 从占位写成正文；`documentation.json` 核过（无占位状态字段，登记的 required anchors 全部存在），未改。
- 证据：`tmp/closures/w3-mcp-host/red/`（step1…step7、mutations.md、conformance-run*.log、acceptance-1-turbo*.log）、`probes/p6`、`p7`。

## 未覆盖 / 待裁

- 远程对端、TLS、代理、DNS 失败只按 `cause.code` 集合分类，未在真实网络上验证（归 `w3-mcp-e2e`）。
- `x-mcp-header` 剔除只在 A 层验证（SDK `McpServer` 不能登记非法声明的工具）；B 层无带 `tasks/*` 的对端。
- `DELETE` 不发无用例（契约不核）；H12「进程先退出后继续读窗口内 stdout」没有能变红的用例（立即宣告的变异在 stdio.spec 与 conformance 都全绿）。
- 与 `@omne-harness/mcp` 的真实组合未在本包验证。
- 版本事实：SDK client/server 2.4.0、node 2.1.2、server-everything 2.1.0、eventsource-parser 3.1.1；组设计修订 `03505c68f`；契约 `96576e628`。
- `schema/`、`verification/`、`adr/`、`examples/`、`resources/`、`acceptance/` 仍是模板占位（本包无内容，acceptance 只读）。
- 清理候选（范围外未动）：无。
- 实现完成、本包验证通过；独立评审与最终接受未做，归 reduce / qa。

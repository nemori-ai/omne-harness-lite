# w3-mcp-host 第 1 轮评审（PR #1138，head `8f9016fd8`，范围 `92a8e3cdf..8f9016fd8`）

简报：`mcp-host-r1-briefs.md`。五路 12:24 起并行。

## E. 交付边界（general-purpose，sonnet，medium）

清单：

| # | 判定 | 缺什么 |
| --- | --- | --- |
| 1 | 达到 | — |
| 2 MC3-9 | 达到 | SSE 回退的计数卡上没有单列（Q4 要求） |
| 3 MC3-10 | 达到 | — |
| 4 MC3-11 | 达到 | 「`reportRejection` 恰好一次」「其余 403 不调用」只在用例名里 |
| 5 | 达到 | 见冲突 3 |
| 6 | 达到 | — |
| 7 | 未达到 | 契约 `tests/wire.spec.ts` 一条原有用例随 F4 改写（`stream-broken` → 丢弃），PR 正文写「契约原有用例不改」 |
| 8 | 未达到 | 卡上没有 `git ls-files --eol \| grep -c w/crlf` 的读数（评审者自跑为 0，卡上无不计） |
| 9 | 达到 | 卡上只有陈述，没有命令与输出 |

性质及证据义务：

- 「用例 → 缺陷 → 变红证据」表：未达到。卡上只有 H1–H12 的类别汇总。没有变红证据的用例：stdio 的取消 `_meta`、探测时限后的迟到应答、进程四种次序；http 的重定向、`x-mcp-header`、授权发现两段地址、会话号。卡上也没写「还原源码并重建 `dist` 再跑」。
- 不重发、进程归落点：达到。
- 异步副作用的上界或拥有者、无遗留进程与端口：文件里有（`afterEach` 断言 `leftover()`、`leftoverServers()`），卡上无。

其他缺口：卡上没有 10 个提交的逐个号、自裁 3–9 与 11 的内容、结构性改动清单；「62 个文件全在写范围」不准（diff 65 个文件，`mcp-contract/docs/public-api.md` 在写范围外，另两个是 reduce 的依赖提交）；`mcp-host-local/src/README.md:19` 仍写 SDK 客户端在 `dependencies`、去留待定。

冲突项 8 条，裁定见下节。

## 卡拥有者裁定（2026-11-05）

1. **F4 改了契约一条原有用例，与卡「契约变更：additive」、验收 7「原样通过」、停止条件「破坏性契约改动」冲突。** 维持 Q1。本卡的「可加」指公开形状，与 skill-fix 裁定第 1 条（评论 6655778538）相同。F4 是契约自己列出、留给本闭包关闭的未封闭项，Q1 在第二段开工前由 reduce 裁定，依据是波包「生态兼容」（优先于闭包其余条目）、SDK 的读法（`stdio.mjs:136` 只 `onerror` 不断流）与探针 `p5`。停止条件防的是写者自己做破坏性改动，不适用于派发者事先裁定的关闭。消费者核对：`packages/mcp/mcp` 的产品源码与用例都不依赖「非 JSON 行断流」。处置：验收 7 改为「契约原有用例原样通过，Q1 关闭 F4 改写的一条除外」，记进闭包规格追加记录；PR 正文改掉「契约原有用例不改」；卡正文的 additive 措辞在波末写回卡正文时加这条限定。
2. **卡正文写「只用官方 SDK 2.3.1 的 Transport 层」，与 Q2、自裁 1 冲突。** 卡正文陈旧，不是新的决定。现行依据是波段 MCP 规格第 28 行（优先复用 SDK，按硬承诺例外自写）与闭包已定事项 1（SDK 2.4.0）。卡正文 W3 行与 I-04 在波末同步；RFC-0001 的 2.3.1 归 K7 小卡。
3. **「规则归契约」与 `serializeMessage` 的「—」不是三条硬承诺之一。** 已定事项 1 与 2 一起读。已定事项 2 规定契约的纯规则只有一份实现、放契约根导出，契约不依赖 SDK。契约根已实现的规则，再用 SDK 的那份就是第二份实现，所以这些行由已定事项 2 决定；已定事项 1 的「指不出的就复用」管的是没有契约规则的块。SDK 的 schema 还比 T2 严（多余键也拒绝，`p5.out`），用它会违反结局如实分类，已定事项 1 末句「用 SDK 导出的常量与 schema」因此不再适用。`serializeMessage` 只有 `JSON.stringify` 加换行，没有协议行为；复用判据只管带协议行为的块。接受，不改表。
4. **契约套件在 A 层自写对端上跑，与目标边界「用真实 SDK 服务端夹具跑」冲突。** 维持 Q3、Q11。套件的夹具接口是 `PeerScript`，SDK 的 `McpServer` 答不出 `stream-breaks`、`unsent` 与任意 HTTP 状态（设计 Q3 一行）。A 层对端走真实的子进程 stdio 与本机 HTTP 端口，被测的是真实线路；与 SDK 真实服务端的互通由 B 层用例证明（`server-everything` 三种模式、SDK 现代与旧 stdio 对端、bearer 网关、2025 会话）。卡上「W3 起 MCP 用本地真实服务端」由 B 层兑现。目标边界改为「契约套件在真实线路上的 A 层对端跑；与 SDK 真实服务端的互通由 B 层证明」，记进追加记录。
5. **`TRANSPORT_TABLE` 的 I07 行仍是 `not-sent`，SPEC 的 I07 行写「先试回退一次；不成立时 `not-sent`」；SSE 计数没有单列。** 不是两份规则：回退的决定在 SPEC T3、T8 与会话代码里，表是套件对端的判据，套件的对端不提供旧一路，表上 I07 就是不成立的一支；成立的一支在 `http.spec.ts` 的旧 HTTP+SSE 一组。处置：表的 I07 行加一行注释说明这一点；卡上单列 SSE 回退的计数（5 条：A 层 4 条、`server-everything sse` 1 条）。
6. **T9 新义务没有契约套件的用例。** 本阶段不必补。义务来自 lifecycle 第 1 轮 L3 R3，目前唯一的真实实现方有自己的用例（`public-entry.spec.ts:88`、`:105`），变异 H3 变红；契约 SPEC 已把它列在「表外条款没有手写用例」里。出现第二个传输工厂实现时，套件的这条用例变为必需。
7. **Q10 不发 `DELETE`。** 只记录。已作为与协议 SHOULD 的偏离登记在成员 SPEC 与契约理由里。
8. **契约 `docs/public-api.md` 在写范围外被改。** 事后接受。契约根新增 13 个导出，不同步这份公开入口说明就留下陈旧文档，属于消费者同步义务，改动内容正是获准的导出。卡上「62 个文件全在写范围」更正为：65 个文件，62 个在写范围，`docs/public-api.md` 事后接受，`pnpm-lock.yaml` 与 `pnpm-workspace.yaml` 是 reduce 的依赖提交。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

`lint:deps` 退出 0；`metrics --coverage --base 92a8e3cdf` 退出 0（因 `pnpm-workspace.yaml` 改动判为全量；变更函数超 alert 11、超 warn 10；原件 `tmp/metrics/8f9016fd8/`）。9 个探针按 `source` 条件打包 `src/` 直接跑，副本在 `mcp-host-r1-probes-a/`。

阻断：

1. stdio `close()` 在 stdin 有未完成的写时无界挂住（`stdio-line.ts:167` `await this.writer.close()`）。探针 P3b：真实子进程不读 stdin，1 MiB 参数写满管道，`close()` 3 s 不返回，SIGKILL 后才返回。`mcp` 拆除先 `await transport.close()`（`table.ts:351`）再 `stop()`，于是进程成孤儿、凭据句柄不释放。
2. 线路发送期间 `call` 的 `signal` 不起作用（`session.ts:922-929`：`abandon` 要等 `entry` 赋值，而 `send()` 在 HTTP 上要等应答头）。P1：对端不发应答头，abort 后 3 s 不结算。P2 同根：401 后的授权元数据取回只受 `closing.signal` 约束（`:703`）。违背契约 T5「发出后触发，传输不再等待」；成员 SPEC 第 133 行把「写出返回后结算」写成了设计。
3. 会话丢掉 `classifyWireEvent` 的错误子类后自己再判一遍（`answerWireOf` `:648-652` 压成 `{kind:'error'}`，再由 `errorPayloadOf`、`probeErrorOf`、`versionRetryOf`、`supportedOf`、自写 `isModern` 重判），与契约结论不同：P4 `-32022` 带 `supported: ["DRAFT-2026-v1"]` 契约给 `+modern`（D05 应 `answer-malformed`），会话走旧一路成功；P9 discover 收到无 `jsonrpc` 的 `-32022`，契约 `error:unreadable`（D11 走旧一路），会话按 D04 重探测；P9 `tools/list` 收到无 `jsonrpc` 的错误，契约 O03 应 `answer-malformed(error-shape)`，会话答 `error-answer`；`call` 收到信封不合格的错误只交出 `error` 对象（T2、C02 要整条消息）。T8 的 D 行决策在 `session.ts:757-802` 与 `testing-scripted-transport.ts:677-725` 各一份，`supportedOf` 三份，彼此已不一致。违背已定事项 2。
4. 旧 HTTP+SSE 回退的 GET 收到 401 头后、正文到齐前 `close()`，`close()` 返回之后仍调 `reportRejection()`（`session.ts:851` 之后没有再核 `usable`）。P6：`close() resolved > reportRejection`。违背 T9「没有它授权过的传输还会调用它」。
5. 16 MiB 行上界只量一个块里的第一条行（`stdio-line.ts:77`，`:81-85` 原样投递其后的行）。P5：一个块含 16 MiB+10 的行，discover 照常 ok。
6. 写范围：`mcp-contract/docs/public-api.md`。已由交付边界冲突 8 裁定。

非阻断：(1) `controllerFor` 在 `closing.signal` 上的 abort 监听只加不减（`http-line.ts:122`，P8：50 条通知后 50 个监听）；(2) 结算后 `consume` 仍向 `seen` 累积（`session.ts:576`）；(3) 401 已到、授权发现进行中 `close()`，答 abandoned 而不是先到的 `not-sent(authorization-required)`；(4) 自裁 2 的失败归因没有 `test:triage` 输出；(5) 结构红项没有交代：`answerWireOf` CC 16、`enterSse` 14、`tryEnterSse` 13（CRAP 14.4）、`conclude` 12（CRAP 13.8）、`dispatch` 13、`readStdout` 12；契约 `headerDeclarationInvalid` 19、`classifyWireEvent` 18、`resultClassOf` 16、`readTaskReport` 13；`message.ts:25` `idOf` 无调用方；(6) 阻断 1–5 没有会失败的用例。

待裁：P7 答复对端 `ping` 的 POST 不经 `authorize`（`session.ts:404-415`），受保护的对端答 401。

未覆盖：全仓检查；与 `@omne-harness/mcp` 的真实组合（阻断 1、4 的拆除后果是读 `table.ts` 推出的）；`session.spec.ts` 未逐条读。

reduce 核对：阻断 1–3 的前提在源码上读到（`answerWireOf` 压平错误类、`sendCall` 的 `abandon` 以 `entry` 已赋值为前提、`close()` 直接 `await writer.close()`）。

### 卡拥有者对 A 的裁定

- 阻断 1–5 全部成立，本轮修。三问：都有探针反例；都对应契约条款（T5、T9、T2、已定事项 2）；都是 L3 的等待上界、凭据与结局分类，本阶段必需。
- P7：答复对端请求的 POST 也是出站 HTTP 请求，必须经 `authorize`。MCP 授权规范要求客户端发给服务端的每个 HTTP 请求都带授权。契约 T9「只在发请求时调用凭据句柄」的「请求」指出站 HTTP 请求，包含对对端请求的答复；T9 补这一句，本轮修。
- 非阻断 1–3、5、6 随本轮修；5 的结构红项在阻断 3 的重构后重读。非阻断 4：在修复轮的门禁里跑一次 `test:triage` 并附上；跑不了就写明未执行。

## B. 表达（design-reviewer，opus，xhigh）

阻断 0，非阻断 16：

- N1 成员 SPEC「决定」一节自称「契约没有写、条款是唯一的规则」，其中 6 条已在契约 T9、T8、T5、T3 里；H3、H5、H9、H12 逐句复述契约条款。两份现行源。
- N2「不发 DELETE」：成员 H7、`:125` 与契约 `:620` 写「契约没有写它」，而契约 T5 `:472` 与偏离表 `:600` 已写。
- N3 成员决定 6、H8、`docs/flows.md:50` 写「所有 HTTP 正文越界是流断开」，与 S05、S06、S07、D16 冲突；实现（`http-line.ts:147-150`）把超长错误正文读成空正文按「纯」归类。
- N4 H11 没写 `fetch` 自带的头与体超时（H10 承认它）；授权元数据取回没写上界。
- N5 契约 T2「唯一的断流条件」与 T8 的 stdout 结束冲突。
- N6「读不懂的一行」与 T2/T7/T8 的「读不懂」（`answer-malformed`）一词两义。
- N7 1xx：T2「按 4xx」，T8「观察不到，不在域里」。
- N8 成员 SPEC `:133` 不说 `signal` 触发后对 HTTP 交换做什么；`flows.md:56` 说中止流；契约 T5 说取消只经 `cancelRequest`。
- N9 bad ports 记在「与协议的偏离」表，实际偏离的是契约 T8 X01（没离开却答 `no-answer`，读类再发）。
- N10 编号悬空或撞号：F4–F8（契约现文已无）、MC3-x、「已定事项 N」只在 tmp 里，且与波段规格 35–40、`mcp/SPEC.md:11` 的 1–17 撞号。
- N11 复用表的全称陈述不成立（`serializeMessage`、`eventsource` 无硬承诺无条款，常量行无条款）；表头应分三类理由。
- N12 手填计数（`:145`、两份 README `:16`、「两遍各 11 个」「16 格」）与施工过程（「第一次实现的缺陷」「reduce 已确认」「设计曾定复用」「依赖已由 reduce 加入」、`:117`）进了正文；「stdio 优先」未定义。
- N13 成员「裁定 1–9」与契约 10 条对不上。
- N14 契约「未覆盖」缺 T3 回退、T8 SSE 模式、T5 不发 DELETE 三项；`:698` 已关闭的说明放在「未封闭项」里。
- N15 契约 `:448` 引 core `dist/src.mjs:6773`，实际是 client 的 `dist/src-CeKsbNLO.mjs`。
- N16 小项：README 与 public-api 把 H1–H13 叫「决定」；`architecture.md:33` 漏「2xx 而没有应答」；`architecture.md:34` 与 D14、I05、O04 冲突；成员 `:117` 依赖去留已过期；契约 T9 `:567`「只在发请求时调用」与 T4 `:468`「应答时调 `reportRejection()`」字面冲突；契约 `:501`「等行」开放列举且列了 SSE 模式不出现的 D16，S07 条件只写 `Mcp-Session-Id`。

SDK 复用表抽核 9 处 `文件:行` 与所述一致。

### 卡拥有者对 B 的待裁项

- P1 契约「真实传输兑现时的裁定」第 10 条与 S2、S7 是否越界：已核 `git diff 92a8e3cdf..HEAD -- packages/mcp/mcp-contract/SPEC.md`，S2、S7 没有改动；第 10 条就是基线的第 25 条，被写者挪进了新节，出处写错。处置：放回原列表第 25 条，新节只留本闭包的 9 条（成员 SPEC「裁定 1–9」随之一致，N13 闭合）。
- P2「不发 DELETE」归契约 T5。`close()` 的语义是契约对所有传输的约定，SDK 的 `close()` 也不发 DELETE（另有 `terminateSession()`）。契约 `:620` 改为「T5 不要求 DELETE，套件不核」，并在「表外条款没有手写用例」列出；成员 H7 与偏离表只指向契约 T5。
- P3 现代 Streamable HTTP 上 `signal` 可以中止应答流。`signal` 的含义是调用方不再等这次应答，传输随即释放这次交换；现代 HTTP 上释放交换就是中止应答流，对端会读成取消。不许中止就要让一条没人等的连接占到 `close()`，这是没有拥有者的副作用。结局照旧是 `unknown`（`abandoned`）。契约 T5 补一句：「`signal` 触发后传输释放这次交换；现代 Streamable HTTP 上释放就是中止应答流，对端可能把它读成取消；stdio 与旧修订上对端看不到」。成员 SPEC `:133` 与 `flows.md:56` 指向它。
- P4 bad ports 接受为与契约 T8 X01 的已知偏离（保守一侧：没离开却答 `no-answer`，读类再发一次），移到成员 SPEC「与契约的已知偏离」或「未覆盖」，写明受影响的行与方向。不为它在发送前另判端口：那是 `fetch` 的规则，再写一份就是第二份实现。
- P5 复用表引的探针 `p3`–`p5` 在 gitignored 的 tmp 里，SDK 升级时无法复核。把这三个探针与输出的关键摘录放进成员 `verification/`，复用表改引那里。

N1–N16 全部随本轮修。

## C. 设计与实践（general-purpose，opus，high）

探针在 `/tmp/mcp-host-c-probe/`，跑已有 `dist`（构建于 12:18，晚于最后一个改 src 的提交，已核一致）。

阻断：

- B1（同 A3）：会话丢掉 `-32022` 子类后自己重算。会话的 `isModern` 要求日期格式，契约 `isModernProtocolVersion`（`revisions.ts:10`）不要求。`modern.mjs`：`supported: ['2027-01-01x']`，契约与脚本化传输给 D05 `answer-malformed(discover-shape)`，会话走 D06 以旧版本成功。表驱动用例的 `-32022` 样本都是合法日期（`session.spec.ts:145-146`），区分不出。
- B2：T8 决策层在两边几乎逐字相同：常量（含 `READ_METHODS`）、`reading`/`readTask`/`readAnswer`、`interpret`、`expiredOf`、`answerOf`/`interpretFailure`、授权发现取回循环、再发规则、`discover`/`modernPath`/`probeOf`/`probeErrorOf`/`versionRetryOf`、四个任务操作、`Wire`/`Probe`/`Deferred` 类型（`session.ts` 与 `testing-scripted-transport.ts` 的行号对照见原报告）。
- B3：工具参数与回显的对端请求 id 经 `JSON.parse`/`JSON.stringify`（`message.ts:47-51` `plainOf`、`:33-38` `plainIdOf`），大整数词形被改：`1234567890123456789` 上线成 `1234567890123456800`。RFC-0010 已定工具参数值树用 `writeJsonText` 写出；`plain.ts:1-3` 写明 plain data 只用于本方写的东西。脚本化传输有同一份 `plainOf`，套件发现不了。契约 SPEC 没写「`args` 按词形原样写出」。
- B4（同 A1，另加）：stdio `send` 丢掉了端口 `line.ts:69` 声明的 `signal` 参数；`stdio-stuck.mjs`：对端不读 stdin、4 MiB 参数、200 ms 触发 signal，`call()` 与 `close()` 都到 SIGKILL（4075 ms）才返回。
- B5（同 A2）：HTTP 应答头到达前调用方 signal 碰不到请求。`probe.mjs`：头延迟 3 s、100 ms 触发，3004 ms 才返回。套件看不到，因为 HTTP 夹具的 silent 立即 flush 头（`fixtures/scripted/http.ts:402-407`）。

非阻断：N1（同 A 非阻断 1）监听只增不减；N2 授权元数据正文 `response.text()` 无上界（`authorization.ts:29-35`），地址可由对端 challenge 指定；N3 `answerWireOf` 兜底造出 `result: null`/`error: null`，会话用复制来的上限再 parse 一次（`limits.ts:10-17` 复制契约 `wire.ts:166-173`），用 `startsWith`/正则拆 `AnswerClass`，没有穷尽检查；N4（同 A 非阻断 2）`seen`；N5 重复与死代码（`isPlainJson`、`memberOf`/`textOf`、`idOf`、`Deferred`、`readers.ts:169`、`:173-180`、`session.ts:555` 不可达）；N6 类型纪律（`versions` 用非空元组、`method` 用字面量联合、授权发现只收 HTTP 材料）；N7（同 A 待裁 P7）；N8 H2 说线路不分类，而 `tryEnterSse` 在线路里判 T3 回退是否成立；N9 凭据泄漏用例只断言「没有」；N10 `StdioLine.ready` 的 `race` 写法误导，`close()` 不等两个读循环结束。

### 根因与卡拥有者对 C 的裁定

A 与 C 独立指向同一根因：已定事项 2 点名的「T8 的决策」没有进契约根导出。Q5 采纳的设计 §6.1 导出集合只有读法与头信息等 13 个纯函数，没有决策层；Q5 不是有意豁免，我当时没核出这个缺口。于是写者把脚本化传输的整层决策抄进了 `session.ts`，抄的过程中又自写了 `isModern`、`supportedOf` 与 `answerWireOf` 的拆分，产生 A3/B1 的分歧，`plainOf` 的词形问题也一起被复制（B3）。A1、A2、A4、B4、B5 是另一类：会话对线路 I/O 的等待点没有受请求的 `signal` 与 `closing` 管辖，等待之后也没有再核状态。

考虑过的另一种结构：把与线路无关的整个会话放进契约，脚本化传输改成「会话 + 脚本化线路」。不采用：契约包会变成协议引擎，`mcp` 成员的用例改成经真实会话驱动，波中爆炸半径过大；脚本化对端是同步回放，线路形状与真实线路不同。决策层是无状态的纯函数，抽到契约根即可满足已定事项 2，两边剩下的只是各自的线路编排。

- B1–B5 全部成立，本轮修。B2 按已定事项 2 原文成立，不降级。
- B3：契约 T2 或 T3 补「调用方写的值（`arguments`、`inputResponses`）与回显的对端请求 id 按原词形写出」，依据 RFC-0010；会话与脚本化传输一起改。
- N3 的改法采纳：`WireClassification` 的 `answer` 可加地带出已解析的消息，会话不再自己 parse，删掉 `limits.ts` 里复制的上限。
- N7 已按 A 的 P7 裁定：答复也经 `authorize`。
- N8：回退是否成立是 T3 的规则，与其他决策同样处理：线路只交事实，判定放在决策层；只有本成员实现 SSE 模式时可以留在会话里，但不能留在线路里。H2 与实现一致。
- 其余非阻断随本轮修。

## D. 差分变异（general-purpose，sonnet，high）

`VITEST_MAX_WORKERS=6 pnpm run mutation --base 92a8e3cdf`，退出 1；排队 485 s，运行 584 s；6 个工作进程。账本 `/data/qiwei/repos/omne-harness-lite/tmp/mutation-ledger/8f9016fd8/20261105-123307/`。

| | mcp-contract | mcp-host-local |
| --- | --- | --- |
| 变异体 | 681 | 1614 |
| 被杀 | 573 | 759 |
| 存活 | 86 | 286 |
| 无覆盖 | 11 | 455（线路两个文件 348，慢层覆盖） |
| 运行错误 | 0 | 2 |
| 没跑测试 | 3 | 0 |
| 超时未复核 | 7 | 101 |

两个成员都测量无效，不计分。host-local 的两个运行错误（`session.ts:355`、`stdio-line.ts:59`）都是 Stryker `errorToString` 对没有原型的对象报 `Cannot convert object to primitive value`：某个用例在变异下抛出或拒绝了一个没有原型的对象。契约的 3 个「没跑测试」（`readers.ts:144`、`:200`、`wire.ts:263`）可能是抖动。

存活与无覆盖的线索（没有判等价）：契约 `readers.ts` 多处可选字段 `=== undefined → false` 存活（读法的缺省没被钉住）；`envelope.ts:58-61` 控制字符与 0x7e 边界；`authorization.ts:20` 参数名大小写与 `:68` 空白；`withheld.ts:9-35` 关键字表逐项（static）；`plain.ts` 与 `message.ts` 的 `isPlainJson` 一族；host-local `http-line.ts:19-31` 错误码表逐项（static）；`authorization.ts` 的取回路径快层无覆盖；`session.ts` 存活 188、无覆盖 69（含中断路径 `:896-935`）。

### 卡拥有者对 D 的处置

- 本轮的代码修复会重写 `session.ts` 的大部分，旧 head 的存活清单大多过时；按 review-code，差分变异在最终 head 上跑一次（`--base 92a8e3cdf`，不给 `--since`：第 1 轮测量无效，没有可以收窄的有效基准）。
- 测试强度另开一个闭包，排在代码修复之后：定位并消除运行错误的来源（抛出或拒绝的都应是 `Error`）；按 D 的线索补输入夹具（读法的可选字段、信封边界、参数名大小写、关键字表与错误码表逐项）；同时补交付边界评审要的「每条 MC3-10、MC3-11 用例 → 缺陷 → 变红证据」（改源码、重建 `dist`、跑、还原、重建）。
- 穷尽检查的 `default`（`never`）无覆盖：类型保证运行时不可达，登记为等价，理由写进变异记录。

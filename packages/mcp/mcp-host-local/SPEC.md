# @omne-harness/mcp-host-local 行为规格

状态：候选规格，尚未取得技术接受。本包是 `@omne-harness/mcp-contract` 的 `McpTransportFactory` 与 `McpTransport` 的实现方：stdio 与 Streamable HTTP 两种真实传输，含旧 HTTP+SSE 的回退，以及授权发现的取回。行为条款归契约成员的 [SPEC](../mcp-contract/SPEC.md)。本页只写下列内容：本包兑现契约的哪些条款、本包自定的事项、与官方 SDK 的复用关系、与协议和契约的偏离，以及验证。本页不复制条款正文。公开形状归 `src/` 的公开定义，导航在 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

| 依据                                                                               | 修订                | 本页采用的范围                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [契约 SPEC](../mcp-contract/SPEC.md)                                               | `51bb48168`         | T1–T9 与 R4 作为被兑现的条款；[真实传输兑现时的裁定](../mcp-contract/SPEC.md#decisions-host) 1–9 由本包提出、契约接受；T8 的决策层是契约的根导出 |
| [组工程设计](../docs/architecture.md)                                              | `03505c68f`         | 本成员的位置：两个 `McpTransport` 实现、官方 SDK 只出现在本成员；协议基线与兼容                                                                  |
| 闭包 `w3-mcp-host` 的设计与裁定（2026-11-05，任务材料）                            | 本地                | 只作出处：本页的复用表、模块分法与「本包自定」最初在那里提出。规则以本页与契约 SPEC 为准                                                         |
| 官方 TypeScript SDK `@modelcontextprotocol/client` 与 `@modelcontextprotocol/core` | 2.4.0               | 只作对照与不复用的证据；本包的产品源码不导入它们，见[与 SDK 的复用关系](#sdk-reuse)                                                              |
| `@modelcontextprotocol/server`、`@modelcontextprotocol/node`、`server-everything`  | 2.4.0、2.1.2、2.1.0 | 只在测试里作对端（B 层夹具）                                                                                                                     |
| `eventsource-parser`                                                               | 3.1.1               | 2xx `text/event-stream` 正文与旧 HTTP+SSE 流的事件解析（与 SDK 同一个包）                                                                        |

调用方：`@omne-harness/mcp` 经 `McpTransportFactory.open(material, signal)` 取得传输，再调用 `discover` 与其他方法。它不认识本包的内部。本包不起进程、不停进程、不读设置、不取凭据：进程归落点（PL），凭据句柄由调用方放在材料里（CU）。

<a id="contract-clauses"></a>

### 兑现的契约条款

下表只给指针。条款的正文在契约 SPEC。

| 契约条款                                                                                | 本页说明怎样兑现   |
| --------------------------------------------------------------------------------------- | ------------------ |
| [T1、T2、T7、T8](../mcp-contract/SPEC.md#port-transport) 的归类与结论                   | H1、H2             |
| [T2](../mcp-contract/SPEC.md#port-transport) 的行缓冲上界                               | H8                 |
| [T3](../mcp-contract/SPEC.md#port-transport) 的请求组成、探测、旧一路与旧 HTTP+SSE 回退 | H1、H9、H11        |
| [T4](../mcp-contract/SPEC.md#port-transport) 与 [R4](../mcp-contract/SPEC.md#refusals)  | H4、H13            |
| [T5](../mcp-contract/SPEC.md#port-transport) 的取消与关闭，含不发 DELETE                | H6、H7、所有权一节 |
| [T8](../mcp-contract/SPEC.md#t8) D15、O05、C04、O06 的再发与不再发                      | H5                 |
| [T8](../mcp-contract/SPEC.md#t8) X01、X02 与 D14、I05、O04、C03                         | H10、H11           |
| [T8](../mcp-contract/SPEC.md#t8) 的进程退出与 `PROCESS_EXIT_WINDOW_MS`                  | H12                |
| [T9](../mcp-contract/SPEC.md#t8-end) 的凭据句柄与 `open`                                | H3、H4             |
| [真实传输兑现时的裁定](../mcp-contract/SPEC.md#decisions-host) 1–9                      | 同上各条           |

<a id="decisions"></a>

### 本包自定

契约没有写、由本包定下的事项。每条在指向的位置写明。

1. 会话与线路分开。线路只报告线上发生的事实，会话用契约的函数归类并得出结论。旧 HTTP+SSE 回退的 GET 也如此：线路交出 `GetOpened`，会话判定回退是否成立。见 H1、H2、H9。
2. 会话对外的效果只经四个注入点：线路、材料里的凭据句柄、`SessionOptions.fetchMetadata` 与计时端口 `SessionOptions.schedule`。见 H14。
3. stdio 线路读出并丢弃标准错误。见 H6。
4. stdio 上一次写在完成前被 `signal` 中止时，线路不再可写，传输按流断开不再可用。见 H6。
5. HTTP 线路自写，直接用 `fetch`，不用 SDK 的传输类。契约要求的不跟随重定向与不设超时由它兑现，见 H10、H11 与[复用表](#sdk-reuse)。
6. 请求离开之前的失败按 `fetch` 失败的 `cause.code` 集合判定。见 H10。
7. HTTP 正文也按契约 T2 的 16 MiB 上界读：只有 2xx 正文越界是流断开，错误状态的正文越界读成空正文。见 H8。
8. 应答到达之后，应答流在后台读到结束。没有人等待的交换（通知、答复对端请求的 POST）同样在后台读完。见[所有权一节](#所有权失败与生命周期)的「资源释放」。
9. 授权元数据的取回受请求的 `signal`、关闭与正文上界约束，不经凭据句柄。见 H4、H11。
10. 凭据的值只进出站请求的头。见 H13。

## 结果与不变量

每条写本包怎样兑现、一个反例，以及让守住它的用例变红的变异。锚点给验证引用。

<a id="h1"></a>

- **H1 一份规则一份实现**（契约 T1、T2、T7、T8）：`Session`（`src/session.ts`）把线路报告的每一次交换与事件翻成契约的 `WireEvent`，交给 `classifyWireEvent` 归类，再交给契约的决策层：`concludeAnswer` 给出 T8 行的结论，`discoverWith` 走探测与旧一路，`listingPageOf`、`taskReportOf`、`taskAnswerOf`、`callAnswerOf`、`interpretAnswer` 读出各请求的结果，`discoverAuthorization` 取回授权发现，`requestTextOf`、`notificationTextOf`、`responseTextOf` 写出消息的文本。会话自己不读 `-32022` 的 `data.supported`，不判断修订，不把错误类压平后再判断。反例：会话自己判断 `data.supported` 里的一项是不是现代版本，于是一个不是日期的版本被当作现代版本接受。变异：会话把 `-32022` 的错误类自判为 `+legacy` → `session.spec.ts`「a -32022 whose supported list names a modern-looking text that is no date」变红。

<a id="h2"></a>

- **H2 线路不分类**（契约 T2）：`Line`（`src/line.ts`）只报告事实。`send` 答 `unsent`、`sent`、`status`（状态、头、整个正文）、`stream`（头、逐条消息、`abort`）或 `aborted`。共用的流报告 `line`、`ended`、`broken` 事件。`openGet` 答 `GetOpened`：2xx 的状态、头与第一个事件，或非 2xx 的状态、头与正文，或 `unsent`、`unavailable`。线路不看消息的内容，不看状态码的含义，不核 `id`，不判断回退是否成立。反例：HTTP 线路把 404 读成「会话结束」；HTTP 线路自己判断 `endpoint` 是否同源。变异：HTTP 线路丢掉 POST 错误状态的正文（`status` 交换的 `body` 为空）→ `conformance.spec.ts` 里按正文分类的 T8 行（D04–D08、D12、I03、O01–O03、C02 等）变红。stdio 线路丢掉解析不了的行是等价变异：契约把这样的行归为 `other`，结局相同。

<a id="h3"></a>

- **H3 `open` 不发请求**（契约 T9）：`createLocalTransportFactory(options).open(material, signal)` 先核 `signal`，再建线路。stdio：取 stdin 的 writer，起 stdout 与 stderr 的读取，把已经成立的退出与 stdout 结束落定。HTTP：不做 I/O。然后再核一次 `signal`：已中止就关闭线路，答 `not-sent`（`connection-unavailable`），不交出传输。`open` 不写任何字节，不调用凭据句柄的任何方法。反例：`open` 发 `server/discover` 探测；`open` 先 `authorize` 再交出传输。变异：`factory.open` 去掉第二次 `signal` 核对 → `public-entry.spec.ts`「a signal that fires while a stdio line is being opened」变红。

<a id="h4"></a>

- **H4 凭据只在发请求与处理应答时用**（契约 T4、T9）：每个出站 HTTP 请求在写出之前经 `credential.authorize(headers)`：请求、通知、答复对端请求的 POST 与旧 HTTP+SSE 回退的 GET。句柄 reject、抛出或答失败时，这个请求不发出，答 `not-sent`（`connection-unavailable`）。每个等待点返回之后，会话先核这个请求是否已结算、传输是否已关闭；已关闭就不再调用句柄，请求不发出。对端答 401 或带 `insufficient_scope` 的 403 时，只对曾用这个句柄授权的请求调用 `reportRejection()` 恰好一次，然后取回授权发现；其他 403 不调用。`close()` 等进行中的授权发现结束后才返回，所以 `reportRejection()` 在 `close()` 返回之前调用。授权元数据的 well-known 取回不经句柄：元数据是公开的。反例：回退的 GET 先到 401 头、正文未到时 `close()`，`close()` 返回之后仍调用 `reportRejection()`。变异：`enterSse` 去掉 `openGet` 返回之后的关闭核对 → `http.spec.ts`「the fallback GET answered 401 with its body still to come when close() runs」变红。

<a id="h5"></a>

- **H5 不代调用方重发**（契约 T8 D15、O05、C04、O06、O07）：`request()` 在第一次的结论带「再发」标记时，以新的请求号再发一次，再发的结论不再触发再发。标记由契约的 `concludeAnswer` 按 `RESENT_REQUESTS` 给出：只在 Streamable HTTP、不在 SSE 模式、请求是 `server/discover`、`tools/list` 或 `tasks/get`、结论是流断开或「2xx 而没有应答」时成立。再发经过完整的发送：重新登记、重新授权。`tools/call` 不经 `request()`，没有再发的代码路径。反例：`tools/call` 的流断开后静默重试。变异：`request()` 对任何 `no-answer` 都再发 → `http.spec.ts`「tools/call, tasks/update and tasks/cancel are not sent again」变红（它按对端收到的请求数核对）。

<a id="h6"></a>

- **H6 进程归落点与 stdin 写端**（契约 T5、PL）：`StdioLine`（`src/stdio-line.ts`）跑在材料的 `ProcessHandle.stdin`/`stdout` 上。它从 `open` 起读出并丢弃 `stderr`，不写日志，让进程不因 stderr 管道满而阻塞。`close()` 的次序：结束 stdin 写端，再取消 stdout 读取，再取消 stderr 读取，然后等两个读循环结束；它不调用 `stop()`。stdin 有未完成的写时，`close()` 中止写端，不等对端读 stdin。会话在关闭线路之前先结算在途请求，见所有权一节。一次写在完成前被它的 `signal` 中止时，线路中止写端，不再可写，并报告 `broken`：在途的已发出请求答 `no-answer`（`stream-broken`），传输不再可用。反例：`close()` 调 `stop()`；`close()` 等一个不读 stdin 的对端。变异：`StdioLine.close` 颠倒前两步 → `conformance.spec.ts` T5「stdio: close() closes stdin, then cancels stdout」变红。不读 stdin 的对端由 `stdio.spec.ts`「the pipe is full: the call's signal settles the answer, the transport is unusable, and close() returns, each within the bound」核对。

<a id="h7"></a>

- **H7 不发 DELETE**：兑现契约 [T5](../mcp-contract/SPEC.md#port-transport)：`close()` 不向对端发 DELETE。契约不要求 DELETE，套件不核它，本包没有用例。与协议 SHOULD 的偏离见[与协议的偏离](#protocol-deviations)。

<a id="h8"></a>

- **H8 字节上界**（契约 T2）：`src/limits.ts` 的 `BYTE_LIMIT` 是 16 MiB，与契约 `classifyWireEvent` 的 JSON 上界同值。
  - stdio：每一行按字节量，不论它从块里的哪个位置开始，也不论它跨几个块。一行超过上界是流断开：线路取消 stdout，立即报告 `ended`，不等退出窗口。在途请求答 `stream-broken`，之后的请求答 `not-sent`。
  - HTTP：只有 2xx 的正文按上界读。JSON 正文或一个 SSE 事件超过上界，是这个请求的流断开。错误状态的正文超过上界时，线路交出空正文，契约把它归为「纯」，状态照常归类。
  - 授权元数据与旧 HTTP+SSE 回退的非 2xx 正文用同一个有界读法（`src/body.ts`）。元数据超过上界按没取到算。

  反例：只量块里第一行的字节，块里后面的长行漏过。变异：`readStdout` 只量块里的第一行 → `lines.spec.ts`「a line above 16 MiB that is not the first of its chunk」变红。

<a id="h9"></a>

- **H9 旧 HTTP+SSE 模式**（契约 T3、T8 I07、S07 与 SSE 模式）：旧一路的 `initialize` 的结论是「4xx+纯」时，会话试回退一次（`enterSse`）。会话先经句柄授权 GET 的头，写入 `MCP-Protocol-Version`（等于提出的旧版本），再调用线路的 `openGet`。线路交出事实（H2）。会话的 `heldEndpoint` 判定回退是否成立：状态 200、`content-type` 是 `text/event-stream`、第一个事件是 `endpoint`，且 `data` 相对连接目标解析后同源。成立时会话调用 `enter(endpoint)`，进入 SSE 模式；不成立时调用 `discard()`。GET 的非 2xx 状态按 `initialize` 归类：S05 的两种状态走授权发现，其余答 I07 的 `not-sent`（`connection-unavailable`）。SSE 模式下：每个请求与通知 POST 到 endpoint，不带 `Mcp-Session-Id`；`WireContext.mode` 是 `sse`；`initialize` 之后的请求按带着会话归类（S07）；共用的流结束或断开时，在途请求答 `stream-broken`，传输不再可用；`cancelRequest` 发 `notifications/cancelled`。`initialize` 的 401、403、5xx、「4xx+码」与离开前的失败都不触发回退。反例：跨源的 endpoint 被接受。变异：`heldEndpoint` 去掉同源核对 → `http.spec.ts`「the fallback that does not hold reports connection-unavailable: no stream, a cross-origin endpoint」变红。

<a id="h10"></a>

- **H10 请求离开之前的失败**（契约 T8 X01、X02）：`fetch` 在应答头之前 reject 时，`cause.code` 在下面的集合里是 `unsent`（X01）：`ECONNREFUSED`、`ENOTFOUND`、`EAI_AGAIN`、`EHOSTUNREACH`、`ENETUNREACH`、`EADDRNOTAVAIL`、`UND_ERR_CONNECT_TIMEOUT`，以及 TLS 握手码（`ERR_TLS_CERT_ALTNAME_INVALID`、`DEPTH_ZERO_SELF_SIGNED_CERT`、`SELF_SIGNED_CERT_IN_CHAIN`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE`、`CERT_HAS_EXPIRED`、`ERR_SSL_*`）。其余失败是流断开，因为请求已离开：`UND_ERR_SOCKET`、`ECONNRESET`，以及 `fetch` 自带的头超时与体超时（`UND_ERR_HEADERS_TIMEOUT`、`UND_ERR_BODY_TIMEOUT`）。集合的依据是探针 `p3`（[verification/proofs/sdk](verification/proofs/sdk/README.md)）。stdio 上，写请求时进程已退出、上一次写失败或线路已关闭是 `unsent`（X02）。反例：头前重置被当作没有离开。变异：`UNSENT_CODES` 加入 `UND_ERR_SOCKET` → `http.spec.ts`「a connection refused is not-sent; a reset before the answer head is stream-broken」变红。

<a id="h11"></a>

- **H11 没有自己的超时**（契约 T8 D14、I05、O04、C03）：HTTP 线路对 `fetch` 不设超时。等待应答只由调用方的 `signal`、`cancelRequest` 与 `close()` 结束。`fetch` 自带的头超时与体超时按 H10 是流断开。授权元数据的取回受三样约束：请求的 `signal`、传输的关闭（两者合成一个 `AbortSignal` 交给 `fetchMetadata`），以及正文的字节上界（H8）。stdio 上只有探测时限（`probeTimeoutMs`）：`server/discover` 写出之后，会话经 `SessionOptions.schedule` 起计时；应答先到时计时取消；时限到了按 D13 走旧一路；迟到的应答因为请求已不在途而丢弃。反例：会话 60 s 后自己发取消并报超时。变异：`dispatch` 不起探测计时 → `session.spec.ts`「falls back to initialize when the probe time runs out, and drops the late discover answer」变红。

<a id="h12"></a>

- **H12 退出窗口**（契约 T8 进程退出）：stdout 先结束时，线路最多等 `PROCESS_EXIT_WINDOW_MS` 的退出再报告 `ended`，之后的退出不改变已归类的结论。进程先退出时，线路最多再读 `PROCESS_EXIT_WINDOW_MS` 的 stdout（期内读到的行照常投递），然后报告并取消读取。两个时刻取同一时钟。退出的观察直接挂在句柄的 `exited` 上，先于任何在它之后 `await` 这个 promise 的调用方。反例：观察挂在派生 promise 的第二跳上，先等过 `exited` 的调用方还能写出一个请求。变异：`onExited` 挂在派生 promise 的第二跳上 → `stdio.spec.ts`「a process that answers and exits」变红。变异（进程先退出的一半）：`onExited` 不等窗口，立即报告并取消读取 → `lines.spec.ts`「delivers the line that stdout still carries within the window, then reports the end with the exit alone」变红。

<a id="h13"></a>

- **H13 凭据不外泄**：凭据句柄写进的头只进出站请求（`fetch` 的 `headers`）：POST 与回退的 GET。`Exchange`、`GetOpened`、`WireEvent`、答复、失败、授权发现与本包抛出的错误都不含请求头。本包不写日志。反例：`not-sent` 的失败带着请求头。变异：会话把请求的 `authorization` 头值写进应答头的挑战参数（授权发现的 `scopes` 带着令牌）→ `http.spec.ts`「the credential value appears in no answer, failure or discovery」变红。该用例先断言 `discover` 成功、`authorization-required` 带着发现，再断言所有结局的 JSON 都不含令牌。

<a id="h14"></a>

- **H14 会话只经注入的端口产生效果**：`Session` 对外的效果只经四个入口：线路（`Line`）、材料里的凭据句柄、`SessionOptions.fetchMetadata` 与计时端口 `SessionOptions.schedule`（`Scheduler`：起一次计时，返回取消函数）。会话不读全局时钟，不直接起全局计时器，不直接调用 `setImmediate`。工厂给缺省的 `schedule`，它用 `setTimeout` 与 `clearTimeout`。线路自己的计时（stdio 的退出窗口）不经这个端口。于是测试可以驱动会话，并排定每一次线路答复、凭据调用与计时触发的次序。反例：会话直接调用 `setTimeout` 起探测计时，测试无法决定它何时触发。变异：会话直接用 `setTimeout` 起探测计时，不经 `schedule` → `session.spec.ts`「starts a probe timer for the probe only, and clears it when the probe is answered」变红（它用记录计时的 `schedule` 替身，核对计时只经它起、经它取消）。

<a id="sdk-reuse"></a>

### 与 SDK 的复用关系

协议层优先复用官方 SDK。下表每一处「不复用」标出三类理由之一：

- **硬承诺**：复用会违反三条硬承诺之一。三条是：结局如实分类（T1、T8）；进程归落点（T5、PL）；不代调用方重发（T8 C04、O06、D15、O05 的「不再发」）。
- **规则归契约**：契约根已实现这条规则。一份规则只有一份实现，放在契约根导出，契约不依赖 SDK；所以本包不再用 SDK 的那一份。
- **无协议行为**：这一块没有协议行为，复用它不带来任何规则。

证据列的文件是 SDK 2.4.0 发布产物的简写：`index.mjs` = client `dist/index.mjs`，`stdio.mjs` = client `dist/stdio.mjs`，`src.mjs` = client `dist/src-CeKsbNLO.mjs`，`public.mjs` = client `dist/public-CvV4ZHkX.mjs`，`schemas.mjs` = core `dist/schemas-DscsoNZN.mjs`。探针 `p3`–`p5` 与它们的输出摘录在 [verification/proofs/sdk](verification/proofs/sdk/README.md)。

| SDK 的块                                                                                                                                                                                                               | 决定         | 理由类别   | 违反的硬承诺或契约条款                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 证据                                                                                                                                                                                                              | 复用时的接入 / 替代                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StdioClientTransport`                                                                                                                                                                                                 | 不复用       | 硬承诺     | 进程归落点：它自己 `spawn`，`close()` 发 `SIGTERM`/`SIGKILL`（T5「`close()` 只关闭传输，不停止进程」、PL）                                                                                                                                                                                                                                                                                                                                                                                                | `stdio.mjs:71-100`、`:181-204`                                                                                                                                                                                    | 自写 stdio 线路，跑在 `ProcessHandle.stdin/stdout` 上                                                                                                                                              |
| `ReadBuffer`                                                                                                                                                                                                           | 不复用       | 硬承诺     | 结局如实分类：是 JSON 而信封不合格的一行被抛弃（T2「`call` 收到读不懂的错误对象时原样交出」，T8 C02、D11、I04、O03 要求把读不懂的对象归类后交出）                                                                                                                                                                                                                                                                                                                                                         | `src.mjs:6764-6778`、`:6783-6785`；`p5`「ReadBuffer unreadable error object -> throws ZodError」                                                                                                                  | 自写按 `\n` 切行、去 `\r`；行的 JSON 判断交给 `classifyWireEvent`                                                                                                                                  |
| `serializeMessage`                                                                                                                                                                                                     | 不复用       | 规则归契约 | T3「调用方写的值按原词形写出」（RFC-0010）：它是 `JSON.stringify` 加换行，大整数的词形会改变                                                                                                                                                                                                                                                                                                                                                                                                              | `src.mjs:6786-6788`                                                                                                                                                                                               | 契约根的 `requestTextOf`、`notificationTextOf`、`responseTextOf`；stdio 线路补换行                                                                                                                 |
| `StreamableHTTPClientTransport`                                                                                                                                                                                        | 不复用       | 硬承诺     | 结局如实分类：(a) 2xx 正文里 T2 判为读不懂的消息，SSE 路径只 `onerror` 后丢弃，JSON 路径整个 `send` reject，应答原文拿不到（T2、T8 C02、D11、I04、O03）；reject 也不说请求是否已发出，X01 与流断开分不开；(b) 401/403 的头在 `response.text()` 后随错误丢失，授权发现（T4、R4）拿不到；(c) 非 400 的错误正文与头不交出（T2「HTTP 错误状态的正文」，T8 的 4xx、5xx 各行按正文分类）。这三项都只能在 `fetch` 钩子里自己读应答；读了之后剩下的只有头的组装，而它通知不写 MCP 头（T3 要求每个请求与通知都带） | (a) `index.mjs:1619-1627`、`:1795-1797`，`p5` 六个 `parseJSONRPCMessage` 样本全抛；(b) `:1746-1751`、`:1393-1402`；(c) `:1767-1780`；头 `:1452-1456`；契约对照表「现代请求的 400 正文当作应答」「MCP 请求头」两行 | 自写 HTTP 线路，直接用 `fetch`（`options.fetch`，缺省全局）：`redirect: 'manual'`（契约「不跟随重定向」；`p3` (g)），`Accept: application/json, text/event-stream`，每次交换一个 `AbortController` |
| `reconnectionOptions`（后台重连）                                                                                                                                                                                      | 不复用       | 硬承诺     | 结局如实分类：重连把 D15、O05 的「流断开」延后，并由 GET 续接，流断开不再如实报出（T8 D15、O05）                                                                                                                                                                                                                                                                                                                                                                                                          | `index.mjs:1629-1633`、`:1565-1593`                                                                                                                                                                               | 不开 GET 流，不续接                                                                                                                                                                                |
| `SSEClientTransport`                                                                                                                                                                                                   | 不复用       | 硬承诺     | 结局如实分类：`_send` 把非 2xx 压成文本 `Error`，状态与头都丢失（T8 S05、S06、O08、C05 与 S07 都分不开）；`message` 事件解析失败丢弃（同上 (a)）                                                                                                                                                                                                                                                                                                                                                          | `index.mjs:1252`、`:1170-1180`、`:1120-1151`                                                                                                                                                                      | 旧 HTTP+SSE 作为自写 HTTP 线路的一种模式：GET 流加 POST endpoint，见 H9                                                                                                                            |
| `eventsource`（npm 包，`EventSource`）                                                                                                                                                                                 | 不复用       | 硬承诺     | 结局如实分类：流结束或出错时它自己重连（WHATWG `EventSource` 的规则）；T3 规定 SSE 模式不重连，T8 SSE 模式规定共用的流结束是每个在途请求的流断开                                                                                                                                                                                                                                                                                                                                                          | `eventsource` 3.0.7 `dist/index.js:95`（流结束后 `scheduleReconnect`）、`:98`（出错后同样）；SDK 经 `index.mjs:4` 导入它                                                                                          | 用 `fetch` 的 `response.body` 经 `eventsource-parser` 自己读流                                                                                                                                     |
| `eventsource-parser/stream`（`EventSourceParserStream`）                                                                                                                                                               | 复用         | —          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `index.mjs:5`、`:1606`                                                                                                                                                                                            | HTTP 线路把 2xx `text/event-stream` 的 body 经 `TextDecoderStream` → `EventSourceParserStream`，取每个事件的 `data` 作为一条消息；`maxBufferSize` 是字节上界（H8）                                 |
| `Client` + `Protocol`（请求层）                                                                                                                                                                                        | 不复用       | 硬承诺     | 不代调用方重发：`callTool` 遇 `-32020` 自动再调用一次（T8 C04「不再发」）；结局如实分类：缺省 60 s 超时自己发取消并报 `REQUEST_TIMEOUT`（T8 D14、I05、O04、C03「等到 `close()`」；T5 的取消由调用方经 `cancelRequest` 发出）；`_onresponse` 用 `Number(id)`，文本 id 的应答进不了在途表（T2 按 id 比较）                                                                                                                                                                                                  | `public.mjs:3899-3912`；`src.mjs:6253-6255`、`:6200-6216`；`:6058`                                                                                                                                                | `src/session.ts` 加契约的决策层                                                                                                                                                                    |
| 版本协商（`negotiateEra`、`classifyProbeOutcome`、`classifyRpcError`、`classifyHttpError`）                                                                                                                            | 不复用       | 硬承诺     | 结局如实分类：`-32020`/`-32021` 判旧对端（T8 D08 答 `error-answer`）；stdio 探测中连接关闭判旧对端或抛错（T8 S01、S02）；`parseJsonRpcErrorBody` 不核信封（T2）。这些函数也不是公开导出                                                                                                                                                                                                                                                                                                                   | `public.mjs:2025-2029`、`:2103`、`:2048-2051`、`:2154-2172`；契约对照表「探测时连接关闭、超时」「-32022 与其他错误码的分类」                                                                                      | 契约根的 `discoverWith`、`concludeProbe` 与 `retryVersionOf`                                                                                                                                       |
| `_excludeInvalidXMcpHeaderTools` / `scanXMcpHeaderDeclarations`                                                                                                                                                        | 不复用       | 规则归契约 | T2 的 `x-mcp-header` 剔除。SDK 版也不是公开导出，它就地改写页并 `console.warn`                                                                                                                                                                                                                                                                                                                                                                                                                            | `public.mjs:3989-4000`；`src.mjs:4396`                                                                                                                                                                            | 契约根的 `withheldTools`；按 T2 与 SEP-2243 Final 与 SDK 核对过结果相同                                                                                                                            |
| `mcpNameSource`、`encodeMcpParamValue`、`MCP_NAME_HEADER_SOURCE`                                                                                                                                                       | 不复用       | 规则归契约 | T3 的三个 `Mcp-Name` 来源与值编码。SDK 版也不是公开导出                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `src.mjs:4710-4744`、`:4539`                                                                                                                                                                                      | 契约根的 `mcpRequestHeadersOf`，含 SEP-2243 的值编码                                                                                                                                               |
| `extractWWWAuthenticateParams`                                                                                                                                                                                         | 不复用       | 规则归契约 | R4、T4 的挑战读法。SDK 版只认第一个 scheme 为 Bearer 或 DPoP 的头，契约不限 scheme                                                                                                                                                                                                                                                                                                                                                                                                                        | `public.mjs:896-915`；`p5`「Basic realm=\"x\" -> {}」                                                                                                                                                             | 契约根的 `authorizationChallengeOf`；对 Bearer 头两者结果相同（`p5`）                                                                                                                              |
| `discoverOAuthProtectedResourceMetadata`                                                                                                                                                                               | 不复用       | 硬承诺     | 结局如实分类（R4 是 `authorization-required` 失败的内容）：200 而不是 JSON 对象时 SDK 不退到根地址（R4「取不到再取根」，「不是 JSON 对象按没取到算」）；正文经 schema 校验，缺 `resource` 就抛错（R4 只要求 JSON 对象）；404 抛错而不是「报告根地址」                                                                                                                                                                                                                                                     | `public.mjs:1022-1026`、`:969`、`:960-963`                                                                                                                                                                        | `src/authorization.ts` 用 `options.fetch` 取一个地址；契约根的 `discoverAuthorization` 按 `metadataCandidatesOf` 的次序取回，再用 `authorizationDiscoveryOf` 组装                                  |
| 常量：`_meta` 的三个键（`PROTOCOL_VERSION_META_KEY`、`CLIENT_CAPABILITIES_META_KEY`、`CLIENT_INFO_META_KEY`）、`METHOD_NOT_FOUND`、`INVALID_PARAMS` 等错误码、`SUPPORTED_PROTOCOL_VERSIONS`、`LATEST_PROTOCOL_VERSION` | 不复用       | 规则归契约 | T3 的 `_meta` 三个键由契约根的 `clientEnvelopeOf` 写出；对端请求的 `-32601` 是契约根的 `METHOD_NOT_FOUND`（T3）；旧修订列表是契约根的 `LEGACY_PROTOCOL_VERSIONS`（T3），它等于 `SUPPORTED_PROTOCOL_VERSIONS`。`LATEST_PROTOCOL_VERSION` 是旧修订 `2025-11-25`，不是本包会说的现代版本                                                                                                                                                                                                                     | `schemas.mjs:4`、`:6`、`:24`、`:32`、`:47`、`:100-101`；`index.mjs:1874` 导出它们；`tests/public-entry.spec.ts`「names the same legacy revisions as the SDK」断言两份旧修订列表相等；`p5` 的版本常量              | 契约根的常量                                                                                                                                                                                       |
| `parseJSONRPCMessage`、`specTypeSchemas`                                                                                                                                                                               | 不复用       | 规则归契约 | T2 的信封与读法由 `classifyWireEvent` 与契约根的读法实现。SDK 的 schema 也比 T2 更严（多余的键也拒绝），用它会违反结局如实分类                                                                                                                                                                                                                                                                                                                                                                            | `src.mjs:4285`；`p5`「parseJSONRPCMessage result with extra key -> throws ZodError」                                                                                                                              | 线上形状只经 `classifyWireEvent` 与契约根的读法判断                                                                                                                                                |
| 服务端：`serveStdio`、`McpServer`、`createMcpHandler`、`StdioServerTransport`、`requireBearerAuth`、`bearerAuthChallengeResponse`、`buildOAuthProtectedResourceMetadata`；`server-everything` 三种模式                 | 复用（测试） | —          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `tests/fixtures/sdk/`                                                                                                                                                                                             | B 层夹具：现代与旧 stdio 对端、bearer 网关、2025 会话、参考服务端三种模式                                                                                                                          |

本包的产品源码不导入任何 `@modelcontextprotocol/*` 包。`@modelcontextprotocol/client` 在 `package.json` 的 `devDependencies` 里，只给测试的对照断言与 `tests/probes/` 的探针用。T8 的全部行由会话与契约的决策层兑现：线路只产出线上事实，`classifyWireEvent` 给类别，`concludeAnswer` 给结论。`TRANSPORT_TABLE` 是契约 `./testing` 的导出，产品源码不导入它；用例用它核对。

<a id="protocol-deviations"></a>

### 与协议的偏离

| 协议要求                                                                           | 本包的做法                    | 依据                                                                                                            |
| ---------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 客户端不再需要旧修订的会话时 SHOULD 发 `DELETE`（2025-03-26 起的 Streamable HTTP） | `close()` 不发 `DELETE`（H7） | 契约 [T5](../mcp-contract/SPEC.md#port-transport) 与[契约的偏离表](../mcp-contract/SPEC.md#protocol-deviations) |
| Streamable HTTP 应答流断开时用新的请求号重发（2026-07-28 changelog 第 9 项）       | 只对读类请求重发一次（H5）    | 契约[与协议的偏离](../mcp-contract/SPEC.md#protocol-deviations)                                                 |

<a id="contract-deviations"></a>

### 与契约的已知偏离

| 契约条款                                                          | 本包的做法                                                                                                                                                                                                                                                                                           | 偏离的方向                                                                                                                       | 拥有者         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| T8 X01：请求离开之前失败答 `not-sent`（`connection-unavailable`） | 连接目标的端口是 WHATWG 的「bad ports」（1719、4045、6665–6669、10080 等）时，`fetch` 在连接之前拒绝，`cause` 没有码。本包按 H10 把它归为流断开。受影响的行：X01 读成 D15、O05（读类再发一次后答 `no-answer`（`stream-broken`）），C04（`tools/call` 的 `answer` 是 `no-answer`（`stream-broken`）） | 保守一侧：请求没有离开，本包却答「效果未知」；读类多发一次请求，这一次同样不会离开。没有一个结局把「可能有效果」读成「没有效果」 | 本成员的维护者 |

本包不在发送之前另判端口：那是 `fetch` 的规则，再写一份就是第二份实现。本包的测试夹具只用 20000 以上的端口。

## 所有权、失败与生命周期

- **身份与状态。** 一个 `Session` 是一个 `McpTransport`，带材料的代际。它拥有：在途请求表、协商出的版本、是否旧一路、旧 Streamable HTTP 的会话号、是否在 SSE 模式、`closed` 与 `dead`（流断开、进程退出、会话结束，传输不再可用）。在途表的每一项有请求号、`WireContext`、自己的 `AbortController`、授权标记、阶段（`authorizing`、`sent`、`discovery`）、探测计时的取消函数与应答流的 `abort`。线路拥有：stdio 的 writer、stdout 与 stderr 的 reader、两个时刻与退出窗口的计时；HTTP 的在途 `AbortController` 集合、endpoint 与共用流的 reader。
- **一个请求只结算一次。** 先到者定（T5）：应答、流断开、进程退出、探测时限、`cancelRequest`、`signal`、`close()` 中最先发生的那个给出结论，之后的事件对已结算的请求没有作用。一个请求在授权与写出之前登记进在途表，`call` 的 `signal` 在登记时接到它。
- **取消。** stdio 与旧修订（含 SSE 模式）上，`cancelRequest` 发 `notifications/cancelled`，`answer` 继续等。现代 Streamable HTTP 上，它中止这个请求的 `fetch` 与应答流，答 `abandoned`。`call` 的 `signal` 在调用前已触发时答 `not-sent`。登记之后任何时刻触发，传输都不再等待，`answer` 答 `abandoned`，交换随之释放（契约 [T5](../mcp-contract/SPEC.md#port-transport)）：
  - 现代 Streamable HTTP：中止这次 `fetch` 与应答流，包括应答头还没到的时候。
  - 旧修订的 Streamable HTTP 与 SSE 模式：同样中止这次 POST 的交换；旧修订不把断开读成取消。SSE 模式下，应答若稍后经共用的流到达，按无关的消息丢弃。
  - stdio：写已完成时，对端看不到释放。写未完成时，线路中止写端，传输按流断开不再可用（H6）。
  - 请求处在授权发现中时，`signal` 结束元数据的取回，请求结束发现后答 `not-sent`（`authorization-required`），见下一条。
- **关闭。** `close()` 按在途请求所处的阶段结算：
  - 授权中（还没有写出）：答 `not-sent`（`connection-unavailable`），不再调用句柄。
  - 已发出：答 `no-answer`（`abandoned`）。
  - 授权发现中：结束元数据的取回，然后答 `not-sent`（`authorization-required`）；没取到的地址按 R4 是 `unavailable`。`close()` 等这些发现结束后才返回。

  然后会话中止一切 `fetch` 与回退的 GET，关闭线路；stdio 线路按 H6 的次序关闭。之后的请求答 `not-sent`（`connection-unavailable`）。关闭之后会话不再调用凭据句柄，不再答复对端的请求。`close()` 可以重复调用。

- **对端的请求与通知。** 任何线路上带 `method` 与 `id` 的消息由契约的 `readPeerMessage` 读出：`ping` 答空结果，其余答 `-32601`（`peerRequestAnswerOf`）。答复经线路写出，回显的 id 按原词形写出；HTTP 上答复是一次 POST，它先经 `authorize`（H4），它的状态没有结局。`notifications/progress` 的 `progressToken` 对上在途调用时交给它的 `observe`（抛出不改变结局）。其他通知丢弃。
- **资源释放。** 探测计时在结算或关闭时取消。应答到达之后，应答流在后台读到结束，释放连接；读的过程中到达的对端请求与通知照常处理。没有人等待的交换（通知、答复对端请求的 POST）同样在后台读完。关闭时这些读取随交换的中止结束。没有 disposer 让外部效果可撤回：已经写出的请求与通知就是写出了。
- **失败的处置。** 线路 reject 是线路的缺陷：会话把发送请求时的 reject 当作 `aborted`，把写出通知与答复时的 reject 忽略。凭据句柄 reject 或抛出按 T9。`observe` 抛出按契约 S6。本包不把错误变成成功：读不懂的应答按 T7 的 `what` 报出，没有应答按 `no-answer` 的原因报出。
- **并发。** 一条线路上可以有多个请求同时在途。stdio 上按行投递，每行对每个在途请求各归类一次。HTTP 上每个请求各自一次 `fetch`。SSE 模式下共用一条流。会话不排队，不限流。

## 组合与验证

| 条款                                                           | 验证                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 命令                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 公开入口、`RangeError`、H3                                     | `tests/public-entry.spec.ts`（快层）：导出集合 `['createLocalTransportFactory']`；不合法的选项；`signal` 在 `open` 之前与期间中止：不交出传输、`authorize` 0 次、线路按次序关闭；旧修订列表与 SDK 相同                                                                                                                                                                                                                                                           | `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local`            |
| H1、H4、H5、H11、H14，T8 全表，T3 的探测与对端请求，T5、T9，H9 | `tests/session.spec.ts`（快层）：`TRANSPORT_TABLE` 每行每格在内存线路上驱动会话，核对结论、传输是否可用与 `reportRejection` 计数；探测时限与探测在途时的 `close()`（契约裁定 2）；对端请求与进度路由；SSE 模式的进入、流断开、endpoint 404、GET 的 401/403 与不成立的回退；契约的类别决定结论（D05、D11、O03、C02）；出站文本的词形；关闭与凭据句柄                                                                                                              | 同上；单独：`pnpm exec vitest run --mode fast tests/session.spec.ts`                   |
| H6、H8，两条线路的 `signal` 监听                               | `tests/lines.spec.ts`（快层）：内存进程句柄上不在块首的超长行；两条线路在交换结束后移除 `signal` 上的监听                                                                                                                                                                                                                                                                                                                                                        | `pnpm exec vitest run --mode fast tests/lines.spec.ts`                                 |
| 契约套件在两种真实线路上                                       | `tests/conformance.spec.ts`（慢层）：`mcpTransportConformance()` 在 A 层对端上跑两遍。「stdio 优先」一遍的夹具声明两种材料且 stdio 在前，没有指定材料的用例跑在 stdio 上；「Streamable HTTP 优先」一遍相反。通过、不适用、失败分开计数，不适用的集合钉死在 `NOT_APPLICABLE`：stdio 的 X02 两格（`discover-retry`、`initialize` × `unsent`：只有进程在 `open` 之前已退出，才能让请求在离开之前失败）；HTTP 上对端在 `initialized` 之后的请求（本传输不开 GET 流） | `pnpm exec vitest run --mode slow --typecheck.enabled=false tests/conformance.spec.ts` |
| H6、H8、H12，T2 的解析不了的行，T3 的旧对端与探测时限，T5      | `tests/stdio.spec.ts`（慢层）：丢弃不是 JSON 的行、16 MiB 行上界、进程先退出、stdout 先结束、`open` 之前退出、答后退出、SDK 工具里退出、SDK 旧对端回退、探测时限回退与迟到应答、不读 stdin 的对端、取消通知的 `_meta`、SDK 慢工具的取消与关闭、`server-everything stdio` 的清单与 `echo`                                                                                                                                                                         | `pnpm exec vitest run --mode slow --typecheck.enabled=false tests/stdio.spec.ts`       |
| H4、H5、H9、H10、H11、H13，T2 的页，T3 的会话，S07             | `tests/http.spec.ts`（慢层）：SDK bearer 网关的 401 与元数据、两种 403、两段地址、凭据不泄漏、`signal` 与 `close()` 管辖的等待（应答头不来、元数据取回挂住、元数据正文不结束、回退 GET 的 401 正文未到）、再发与不再发、连接被拒与头前重置、不跟随重定向、`x-mcp-header` 剔除与旧修订不核、`server-everything streamableHttp` 的版本一致、SDK 2025 会话的 `DELETE` → `session-ended`、现代取消中止流、旧 HTTP+SSE 回退、`server-everything sse`                  | `pnpm exec vitest run --mode slow --typecheck.enabled=false tests/http.spec.ts`        |
| 复用表的证据                                                   | `tests/probes/` 的探针 `p3`–`p5`；输出摘录在 [verification/proofs/sdk](verification/proofs/sdk/README.md)                                                                                                                                                                                                                                                                                                                                                                         | 在包根运行 `node verification/proofs/sdk/<探针>.mjs`                                   |
| 产品源码的边界                                                 | `pnpm run lint:rules`（无 `./testing` 导入、取时标注）；`pnpm exec oxlint`；`src/` 没有 `as`（`as const` 除外）、`any` 与非空断言，用 `grep` 核对                                                                                                                                                                                                                                                                                                                | `pnpm run lint:rules`、`pnpm run lint:oxlint`                                          |

夹具分两层。A 层（`tests/fixtures/scripted/`）是真实线路上的脚本化对端：stdio 的子进程脚本按契约 `PeerScript` 答复，并经 stderr 回报收到的内容；HTTP 的 `node:http` 服务端答 JSON、SSE、任意状态与头、well-known 元数据、旧 HTTP+SSE 的流与 endpoint，并按脚本的 `unsent` 预判让自己不可达；`special-stdio.mjs` 做脚本说不出的事（写不是 JSON 的行、写超长行、关 stdout 而存活、按时机退出、不读 stdin）。B 层（`tests/fixtures/sdk/`）是 SDK 的真实对端：`serveStdio` 的现代对端、`StdioServerTransport` 的旧对端、`createMcpHandler` 加 `requireBearerAuth` 的网关、`NodeStreamableHTTPServerTransport` 的 2025 会话，以及 `server-everything` 的 `stdio`、`sse`、`streamableHttp` 三种模式。每个慢层用例结束时核对没有遗留的子进程与监听端口。

未覆盖：

- 真实远程对端、TLS、代理与 DNS 失败只按 `cause.code` 的集合分类（H10），没有在真实网络上验证；远程目标归 `w3-mcp-e2e`。
- `x-mcp-header` 的剔除只在 A 层验证：SDK 的 `McpServer` 不能登记带非法声明的工具。
- 不发 `DELETE`（H7）没有用例核对，因为契约不核它。
- H12 里「进程先退出后仍读窗口内的 stdout」这一半没有能变红的用例：在本机，让线路立即报告的变异下，`stdio.spec.ts` 与 `conformance.spec.ts` 都通过。
- H14 没有用例核对。
- bad ports 的偏离（[与契约的已知偏离](#contract-deviations)）没有用例。
- 调用方（`@omne-harness/mcp`）与本包的真实组合没有在本包验证；组合归组设计与集成任务。

<a id="properties"></a>

## 性质与证据

本节把会话的请求生命周期写成定理，并分别记录每条性质的证据与状态。定理是目标。状态只说明所列证据在其范围内得到的结果，不是证明。模型动作、探索器动作与实现代码的映射、运行命令、规模上限与运行记录见 [verification/README.md](verification/README.md)。模型是 [verification/models/TransportSession.tla](verification/models/TransportSession.tla)，对真实实现的有界穷举探索器在 [tests/model/](tests/model/session-model.spec.ts)。

对象与参与者：

- 一个 `Session`（`src/session.ts`），一个 `McpTransport`，跑在一条线路上（`stdio-line.ts` 或 `http-line.ts`）。
- 驱动它的调用：`discover`、`call`、`listActions`、`updateTask`、`cancelTask`、`cancelRequest`、`close()`，以及每个 `call` 带的 `signal`。
- 会话的注入端口（代码修复轮交回）：线路（`send`、`openGet`、应答流、`close`）、凭据句柄（`authorize`、`reportRejection`）、元数据取回 `SessionOptions.fetchMetadata`、计时端口 `SessionOptions.schedule`。会话不读全局时钟、不直接起全局计时器，所以探索器排定每一个端口调用、每一次计时触发、`signal` 与 `close()` 的次序。
- 一个在途请求的三相（`Pending.phase`）：授权中 `authorizing`、已发出 `sent`、授权发现中 `discovery`。

端口失败模型：每次端口调用可以按契约答复、答复它的失败、reject、或永不答复（挂起）。线路的 `send`、`openGet` 与应答流受它们收到的 `signal` 管辖：`signal` 中止时按契约当即收场（契约 [T5](../mcp-contract/SPEC.md#t8)、线路端口 [`line.ts`](src/line.ts)）。凭据句柄的 `authorize`、`reportRejection` 不收 `signal`，可以挂起，由句柄的持有者承接。

证据分两种，范围见 [verification/README.md](verification/README.md#两种证据与各自范围)：有界穷举探索器驱动真实的 `Session`，核对下列性质的可观察形式；TLA+ 模型 `TransportSession.tla` 在有限配置内核对同一组性质的抽象形式。两者都只在各自上限与抽象之内成立，不是证明。

定理（名字与编号在本节、[verification/README.md](verification/README.md) 与 [verification/models/README.md](verification/models/README.md) 三处相同）：

- **V1 恰好结算一次**：每个请求的答复恰好兑现一次；结算之后到达的线上事件、迟到的端口答复都不改变它。可观察的形式：没有为一个已结算的请求再发请求、再调用凭据句柄（应答流在后台读到结束不算，见[资源释放](#所有权失败与生命周期)）。
- **V2 关闭之后不碰凭据**：`close()` 返回之后，不再调用凭据句柄的 `authorize` 与 `reportRejection`。
- **V3 拒绝至多一次**：带 401、或带 `insufficient_scope` 的 403 的应答，至多调用一次 `reportRejection`，且只对曾用这个句柄授权过的请求；其他 403 与没有句柄的材料不调用（契约 [T4](../mcp-contract/SPEC.md#t8)）。
- **V4 有界**：请求的 `signal` 触发，或 `close()` 被调用之后，在探索器的静止点每个在途请求都已结算——`sent` 相当即结算，`discovery` 相在它的发现端口静止后结算；线路或凭据端口挂起不改变这一点（挂起的端口调用由拥有者承接）。`close()` 在线路的 `close` 答复之后返回，不在它之前。
- **V5 不代调用方重发**：写类请求（`tools/call`、`tasks/update`、`tasks/cancel`）在流断开或「2xx 而没有应答」后不再发；读类（`server/discover`、`tools/list`、`tasks/get`）至多再发一次，用新的请求号并重新授权；旧 HTTP+SSE 模式下都不再发（契约 [T8 D15、O05、O06、C04](../mcp-contract/SPEC.md#t8)）。
- **V6 三相的去向**：`close()` 时，授权中的请求答 `not-sent`（`connection-unavailable`），已发出的答 `no-answer`（`abandoned`），授权发现中的请求结束发现后答 `not-sent`（`authorization-required`）（契约 [T5](../mcp-contract/SPEC.md#t8)）。

每条性质的证据状态（用词沿 [docs/verification.md](../../../docs/verification.md#分别表述这六种状态)「分别表述这六种状态」）：

| 性质 | 探索器（真实 `Session`，有限范围） | TLA+ 模型（TLC，有限范围） | 真实组合 |
| --- | --- | --- | --- |
| V1 | 可观察形式：有限范围通过。负控：结构上由 `Deferred` 与 `settle` 的删除双重保证，单点源码变异不足以变红，见 [verification/README.md](verification/README.md#两种证据能变红) | 有限范围内找到反例（`bad-resettle`） | 真实组合未验证 |
| V2 | 有限范围通过；负控 `mV2-send-after-close` 找到反例 | 有限范围内找到反例（`bad-cred-after-close`） | 真实组合未验证 |
| V3 | 有限范围通过；负控 `mV3-report-twice` 找到反例 | 有限范围内找到反例（`bad-report-twice`） | 真实组合未验证 |
| V4 | 有限范围通过；负控 `mV4-signal-dead`、`mV4-close-after-line` 找到反例 | 有限范围内找到反例（`bad-signal-dead`、`bad-close-after-line`） | 真实组合未验证 |
| V5 | 有限范围通过；负控 `mV5-resend-any` 找到反例 | 有限范围内找到反例（`bad-resend`） | 真实组合未验证 |
| V6 | 有限范围通过；负控 `mV6-close-not-sent` 找到反例 | 有限范围内找到反例（`bad-close-not-sent`） | 真实组合未验证 |

未覆盖（探索器与模型都不覆盖，由既有用例或后续任务承担）：

- 第 1 轮评审阻断 A5（stdio 一行超过 16 MiB 的字节上界）是 `stdio-line.ts` 的逐字节处置，探索器经内存线路驱动会话、不经 stdio 线路（见 [tests/model/](tests/model/session-model.spec.ts) 与 [H8](#h8)），所以探索器不覆盖它，由 `stdio.spec.ts` 承担。
- 第 1 轮评审阻断 A4（旧 HTTP+SSE 的 GET 收到 401 头、正文到齐前 `close()`）是一次端口答复内部的更细次序，比探索器的外部动作粒度更细，探索器不覆盖它，由 `http.spec.ts` 与模型的 `bad-cred-after-close`（关闭之后授权的抽象形式）承担。
- 真实线路、真实进程、真实对端与远程网络：真实组合未验证。
- 两种证据之间没有精化证明。

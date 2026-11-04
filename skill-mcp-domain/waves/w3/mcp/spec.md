# W3 MCP 线实施规格：契约回写、连接表收口、调用口、本地传输

格式沿 `claim` 技能 `references/spec-template.md`，方法 Matt `to-spec`。只写差额，共用部分引用。与 [Skill 线规格](../skill/spec.md)同骨架。

- 卡：[#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119)（交付修订 1）；波包 [w3/wave-pack.md](../wave-pack.md)；F0 `05f281394c9179ecb9427fb1d5b97cc2f808a789`
- 上一层：[线级地图](../../line-mcp/context-map.md)；[共用约束](../../constraints.md)；[范式 r2](../../operating-model.md)；W1、W2 规格的已定事项继续有效，与本页冲突时以本页为准；[2026-07-28 核对](../../w2/schema-check.md)；[W2 SDK 探路](../../w2/spike/README.md)
- 主工作类型：feature → poteto-mode Feature
- 风险级别：L3。连接键隔离与凭据句柄（继续）；在途表只许同租户同主体取消；任务表只对发起者开放；stdio 进程与 stderr 遮盖；HTTP 授权失败与 `WWW-Authenticate` 处理；并发拆除

## Problem Statement

W2 之后 MCP 能连接、发现并整份发布清单，但不能调用：没有 `ActionInvoker`，没有任务表，没有 `createMcp`，也没有真实传输。连接表还有五项已知限制（成员 SPEC「已知限制」），其中端口 reject 时资源归宿不保证一项直接违反 S9。契约还缺 2026-07-28 修订要求的若干条款。M2 之后的工具派生与 Agent 调用都要先有这一层。

## Solution

分三段，段内并行：

- **A 段**（从 F0）：`w3-mcp-contract` 回写契约可加调整并新增传输符合性套件与脚本化传输替身；`w3-mcp-table` 收口连接表的已知限制并把成员内绕道改回契约形状之前的准备。两个闭包写集不相交（`mcp-contract/` 与 `mcp/`）。
- **B 段**（从 F1 = A 段两个闭包合入后的父分支头）：`w3-mcp-call` 在 `mcp` 里实现 `ActionInvoker`、任务表与 `createMcp`；`w3-mcp-host` 在 `mcp-host-local` 里实现 stdio 与 Streamable HTTP 的 `McpTransportFactory`，用真实 SDK 服务端夹具跑契约套件。写集不相交。
- **C 段**（从 F2 = B 段合入后）：`w3-mcp-e2e` 在 `mcp-host-local` 的测试里用 `createMcp` + 本地传输 + 真实服务端跑端到端旅程。

## 生态兼容（负责人 2026-11-04 要求，优先于本页其余条目）

> MCP 与 Skill 是 harness 融入现有开发者生态的关键一环：社区开发者自己的 Skill、各厂商提供的 MCP 服务必须能用。不能因为自己造轮子或比规范与主流宿主更严而用不了。

首轮事实（reduce 2026-11-04 探针，`anthropics/skills` @ ca45fc4，20 个包）：18 个通过；2 个被拒——`claude-api` 的说明 1077 字符超过规范上限 1024；`template` 的 name `template-skill` 与目录名不同。两条都是规范写了、主流宿主不强制的规则。

MCP 侧的调整见[波包「生态兼容」](../wave-pack.md#生态兼容负责人-2026-11-04-要求优先于本页其余条目)。本页冲突处：已定事项 16 的 `inputSchema` 加严撤回；已定事项 36 的「只用 Transport 层」改为「优先复用 SDK，按硬承诺例外自写」；已定事项 40 的「SSE 旧传输不做」撤回；判据 MC3-12 加兼容矩阵。B 段闭包规格按此写。参考服务端已是测试依赖（978624857）：`server-everything`、`server-filesystem` 2.1.0 与 Python `mcp-server-fetch`（uv 组 `mcp-fixtures`）；SDK 钉在 2.4.0，W2 探路结论（2.3.1）由 `w3-mcp-host` 的测试在 2.4.0 上重新确认。SDK 另有 `./ext/skills` 子入口（经 MCP 分发 Skill），本波不用，记作 M2 之后的跨域议题。

## 依据与已定事项

| 依据 | 精确修订 | 本规格采用的范围 |
| --- | --- | --- |
| 成员 SPEC `packages/mcp/mcp-contract/SPEC.md` | F0 | 全文；本页列出的改动由 `w3-mcp-contract` 写回 |
| 成员 SPEC `packages/mcp/mcp/SPEC.md` | F0 | 「所有权、失败与生命周期」「已知限制」「与已定事项的偏离」 |
| 组页 `packages/mcp/docs/architecture.md` | F0 | 「MCP 连接」「调用口」「资格与换代」「调用结果」「内容交付」「Q-MC06」 |
| 2026-07-28 核对 | [schema-check.md](../../w2/schema-check.md) | 「落到 W3 的契约可加调整」#2–#12 与措辞、「w2-mcp-core 带回」「收口后留给 W3」 |
| SDK 探路 | [spike/README.md](../../w2/spike/README.md) | 只用 `Transport` 层；自写的协议条文；未跑通的五项 |
| 协议 | MCP 2026-07-28 核心 schema；任务扩展 `io.modelcontextprotocol/tasks`（SEP-2663） | 线上形状；任务形状须按 SEP-2663 原文核实 |

已定事项（reduce 裁定，写者照做；契约条款由 `w3-mcp-contract` 写进 mcp-contract SPEC，其余闭包按这里实现，二者一致）：

### 契约回写（`w3-mcp-contract`，只做可加改动）

1. `ActionDiscovery.refresh` 的请求加 `signal?: AbortSignal`。S5 写明：`signal` 只属于这一次刷新，在等待建连、取页与发布边界各自核对，触发时答 `kept`（`cancelled`）。
2. 时钟：契约加 `McpClock { now(): Date }`（沿 `ModelClock` 先例），`McpPorts` 加可选 `clock?: McpClock`。缺省由实现取本机时钟。S3 写明清单的 `acquiredAt` 取自它。
3. 公开根导出 `canonical` 与 `sameJson`（`json.ts`）；`./testing` 导出 `testing-values.ts` 的样本构造器。
4. 端口 reject 的语义（AV、UE、CU、PL、CS、T 各加一句）：端口应以 `Outcome` 答复；它以 reject 失败时是违反契约。实现方的处置写成条款：读类端口 reject 当作 `unknown`；`McpTransport.close()` reject 当作已关闭，继续拆除；`ProcessHandle.stop()` reject 当作 `unconfirmed`；凭据句柄 `release()` reject 当作已释放，不重试。拆除的每一步都执行，前一步失败不跳过后一步。
5. S8 加两条：`release` 与 `closeAll` 遇到落点在途（进程尚未交来）时，报告该连接的进程范围为 `unconfirmed`，不报 `no-process`。`closeAll` 之后本实例不再建立连接：要连接的操作答 `connection-unavailable`（`invoke`、`continueWithInput` 答「未发出：`connection-unavailable`」）。
6. S9 加关停例外：`closeAll` 时落点仍在途的连接，进程凭据句柄立即释放；之后迟到的进程照样停止一次，句柄不再释放第二次。
7. T3 改为规则：
   - 每个请求的 `_meta` 带 `io.modelcontextprotocol/protocolVersion`、`clientCapabilities` 与 `clientInfo`。`clientCapabilities` 固定声明任务扩展 `extensions["io.modelcontextprotocol/tasks"]` 与 `elicitation.form`；不声明 `elicitation.url`、`sampling`、`roots`。
   - 旧对端探测：stdio 上 `server/discover` 答任何不属于现代修订的错误，或在探测时限内没有应答，回退到 `initialize` + `notifications/initialized`；Streamable HTTP 上看 400 应答的正文。`discover` 只在现代与旧两条路都失败时答 `error-answer` 或 `answer-malformed`。这样 S5/S7 的「`discover` 失败 → `lost(discover-failed)`」只在两条路都失败时成立。
   - `-32022`（版本不支持）带 `data.supported` 时，选双方共有的最高版本重试一次；没有共有版本答 `answer-malformed`（`discover-shape`）。
   - 旧修订下对端发来的请求一律以 JSON-RPC 错误拒绝。
8. `ListingPage` 加可选 `withheld?: readonly Readonly<{ name: Untrusted<string>; reason: 'header-invalid' }>[]`。Streamable HTTP 上 `x-mcp-header` 不合法的工具由传输在交页前剔除并列在这里。C1 不变：交出的页里一项非法，整份仍拒绝。服务在本波不读 `withheld`。
9. T5 按传输分写：stdio 的 `cancelRequest` 发 `notifications/cancelled`（带每请求 `_meta`）；Streamable HTTP 的 `cancelRequest` 中止该请求的应答流，不另发通知。`close()` 只关闭传输，不停止进程（不变）。stdio 的关闭次序：先关 stdin 写端，再取消 stdout 读取。
10. **有意偏离**（写进 SPEC「与协议的偏离」）：Streamable HTTP 应答流断开时规范要求用新 id 重发。本组只对读类请求（`server/discover`、`tools/list`、`tasks/get`）重发一次；`tools/call`、`tasks/update`、`tasks/cancel` 不重发，答 `no-answer`（`stream-broken`）。理由：调用与任务写不是幂等的，效果未知时不代调用方重发。
11. R4 补授权发现：先取 `/.well-known/oauth-protected-resource/<path>`，失败再取根 `/.well-known/oauth-protected-resource`。403 且 `WWW-Authenticate` 带 `error="insufficient_scope"` 时答 `authorization-required`，`scopes` 取该头的 `scope`；其余 403（例如 `Origin` 不被接受）答 `not-sent`（`connection-unavailable`），不调用 `reportRejection()`。
12. `TaskReport` 加可选 `pollIntervalMs?: number`、`ttlMs?: number`、`statusMessage?: Untrusted<string>`；`task` 结局（`CallOutcome` 的任务分支）加同样三项可选字段。对端答 `-32021`（缺少客户端能力）时原样以 `error-answer` 交出：它表示本组声明缺项，是本组缺陷。
13. `list_changed` 只经 `subscriptions/listen` 到达，本组不订阅；`changedNotified` 保持为假。SPEC 写明，订阅归 W4 之后。
14. 进度：传输在 `call` 上带 `progressToken`（每请求唯一），进度通知经 `observe` 交出。日志不开（不发 `logging/setLevel`，不设 `_meta.logLevel`）。
15. `CallRequest.continuation.inputResponses` 改为可选（只带 `requestState` 的重试合法）。`args` 必须是 JSON 对象：服务的 `invoke` 与 `continueWithInput` 收到非对象 `args` 时抛 `TypeError`。这是调用方缺陷（前提违反），不是「未发出」的原因；SPEC 写明。
16. 措辞：S7 的「协商」「会话」只对旧对端成立处加限定；空串 `requestState` 合法，V1 不再判 malformed（改守卫并加用例）；C1 加「`inputSchema` 必须是 `type` 为 `"object"` 的对象」，不符的工具按 C1 使整份拒绝，缺陷码是现有的 `action-invalid`，不新增码。
17. `open` 不在 MCP。
18. 传输符合性套件 `mcpTransportConformance()`（Q-MC06）：从 `./testing` 导出，`ConformanceCase[]` + `node:assert`，与其他五个套件同形。夹具接口由本闭包设计，最低要求：夹具能按用例要求给出一个「脚本化对端」并为它打开传输；脚本至少能表达现代对端、旧对端、`discover` 失败两路、多页清单、`tools/call` 的完成/错误/`input_required`/任务结果、`tasks/get` 的五种状态与 `-32602`、应答流断开、进程退出、401 与两种 403、读不懂的应答（T7 每个 `what` 一例）。套件用例覆盖 T1–T7 与已定事项 7–12、14。
19. `./testing` 另导出内存脚本化传输 `createScriptedTransportFactory(script)`：它实现 `McpTransportFactory`，按脚本答复，记录收到的请求（含 `_meta` 与 `progressToken`）。它必须过 `mcpTransportConformance()`（全部用例通过或 `not-applicable` 计为失败，同其他替身）。B 段的 `w3-mcp-call` 用它代替 W2 成员内的 `tests/doubles/scripted-transport.ts`。

### 连接表收口（`w3-mcp-table`，从 F0，只写 `packages/mcp/mcp/`）

20. 遗忘谓词：条目只有在什么资源也不持有时才从表里删除——没有传输、没有进程句柄、没有凭据句柄、没有未确认停止的进程、没有在途的落点。谓词写成一个纯函数，删除只经它。
21. 拆除（`teardown`）每一步 `try/finally` 继续往下：关传输 → 停进程 → 释放句柄。按已定事项 4 处置 reject。用例：`transport.close()` reject 后换修订，旧进程仍被停、句柄仍被释放；`stop()` reject 记 `unconfirmed`；`release()` reject 不重试、不再调用第二次。
22. 同一持有的临界区里，采用重读受连接时限约束：用剩余时限包住重读，超时答 `connection-unavailable`，不让后续 `ensure` 无限等待。
23. 按已定事项 5、6 实现 `release`/`closeAll` 遇落点在途的报告、`closeAll` 之后拒绝建连、关停时立即释放句柄。
24. 抽「条目生命周期」模块：`internal/table.ts` 现为 684 行，把临界区、单飞、迟到收口分开成可单独测的模块（例如 `internal/entry.ts` 持有资源与遗忘谓词、`internal/teardown.ts` 拆除、`internal/table.ts` 只编排）。行为不变的部分以现有用例为准，不改测试断言。
25. 「旧令牌在采用口给旧答复时短暂建旧连接」不修：根因在端口给旧答复，实现不能识别。SPEC「已知限制」保留这一项并改写为端口质量前提。
26. `w3-mcp-table` 不改契约，不用契约的新形状（A 段并行）。已定事项 1–3 的成员内绕道（`McpDiscovery`、第三参 `{ now }`、`internal/canonical.ts`、`tests/doubles/values.ts`）由 B 段 `w3-mcp-call` 删除。

### 调用口（`w3-mcp-call`，从 F1，只写 `packages/mcp/mcp/`）

27. `createMcp(ports, config)` 交出五个服务 `McpServices`，`invoker` 与核心共享同一张连接表、同一个在途表与同一个任务表。`createMcpCore` 删除（只有本成员测试在用，按演进政策同步迁移）。成员内绕道按已定事项 26 删除，改用契约的 `signal?`、`clock?`、`canonical`/`sameJson`、`./testing` 样本构造器与 `createScriptedTransportFactory`。
28. `invoke` 的次序（每步失败答「未发出」并撤销占位，除非注明）：
    1. 在途表按（租户、主体、关联键）占位，查重与占位一步；重复答 `correlation-key-in-use`。
    2. 关口：采用 → 资格（S1）。
    3. 配值（S4，按 target、credential、connect-timeout、env 的次序只报第一项）。
    4. 已知动作：读当前清单，动作不存在或不可用答对应 R2 原因；调用方预期的定义摘要与当前不符答「定义已变」。
    5. 建连（`ensure`）：连接失败映射到 R2 的连接类原因。
    6. 检查占位是否已被 `cancel`：是则答 `cancelled`，不发出。
    7. `transport.call(request, signal, observe)`，带进度令牌；`not-sent` 映射到 R2；成功则 `markSent(requestId, generation)`。
    8. 等应答。`signal` 在发出后触发：`cancelRequest(requestId)`，结局 `unknown`（`abandoned`），不等对端。
    9. `classifyOutcome` 分类；任务结局在任务表登记（租户、主体、持有、任务号 → 代际与连接键）；`markEnded`。
29. `continueWithInput`：同 `invoke` 的 1–7，另核发出代际：当前连接的代际与 `inputRequired` 交出的代际不同，答「未发出：`unknown`」，不在新代际上重发（S2）。请求带 `continuation`（`inputResponses` 可选，已定事项 15）。
30. `cancel`：只查在途表，不核采用与资格（S2 原文）。占位后、发出前的取消使原调用答 `cancelled`。
31. 四个任务操作按 S2：只对发起者开放（表里没有、非发起者、重启后都答 `unknown`，答复不随任务是否存在而变）；可以复用现有连接（不核资格），要新建连接时资格必须 `granted`，否则 `effect-unknown`（`no-connection`）；`cancelTask` 不为取消启动新进程；`no-answer` → `effect-unknown`，`error-answer`/`answer-malformed` 原样交出；`taskResult` 已取消答 `cancelled`。
32. 观察函数（S6）：进度通知标为不可信交给调用方的 `observe`；它抛出时吞掉，不影响结局；本组不记日志。
33. 内容交付：完成结局经契约的 `toContentBlocks`（D1–D5）转成内容块；本组不改写内容。
34. 在途表与任务表都不跨重启（已知限制，SPEC 写明）。

### 本地传输（`w3-mcp-host`，从 F1，只写 `packages/mcp/mcp-host-local/`）

35. 公开根导出一个工厂 `createLocalTransportFactory(options)`，按 `material.kind` 分派到 stdio 与 Streamable HTTP。`options`：`clientInfo`（name、version，必填）、`probeTimeoutMs`（stdio 旧对端探测时限，正整数，必填，不设缺省）、可选 `fetch`（测试注入，缺省全局 `fetch`）。不合法时抛 `RangeError`。
36. 只用 SDK 的 `Transport` 层（W2 结论）。stdio：自写 `StreamTransport`，跑在 `ProcessHandle` 的 `stdin`/`stdout` 上，按行切帧，不用 SDK 的 `ReadBuffer`（它静默丢非 JSON 行）。stdout 出现一行非 JSON：视为流损坏，传输关闭，在途请求答 `no-answer`（`stream-broken`）。进程退出（`exited` 解决）：在途请求答 `no-answer`（`process-exited`）。stderr 只读出丢弃，不进日志（S6 与遮盖责任归落点）。HTTP：`StreamableHTTPClientTransport` 加 `fetch` 钩子，在钩子里调用 `credential.authorize(headers)`、读 `WWW-Authenticate`、需要时调用 `reportRejection()`；不传 `authProvider`。`Client` 高层 API 只在测试里做对照客户端。
37. JSON-RPC 由本成员自己发：请求号按传输自增文本；每请求 `_meta`（已定事项 7）；HTTP 头 `MCP-Protocol-Version`、`Mcp-Method`、`Mcp-Name`（工具名，仅 `tools/call`）；`x-mcp-header` 规则（已定事项 8）；取消（已定事项 9）；重发（已定事项 10）；授权发现（已定事项 11）；任务操作按 T6 与已定事项 12；`-32022` 续接（已定事项 7）；`instructions` 经 `boundInstructions`（S3）。
38. 真实服务端夹具在 `tests/fixtures/`：用 `@modelcontextprotocol/server` 2.3.1，现代 stdio 用 `serveStdio`，HTTP 用 SDK 的 HTTP 处理器起本机端口；`tasks/*` 自写处理器（SDK 没有任务运行时），形状按 SEP-2663 原文核实并在成员 SPEC 写明出处；多页清单自写处理器（`McpServer` 不分页）；旧对端模式用 SDK 的 2025 修订服务端。夹具实现 `mcpTransportConformance()` 的夹具接口，两种传输各跑一遍。用例结论原样记：通过、失败、不适用分开计数；不适用要写理由。
39. 进程来源：测试用 `node:child_process` 起夹具服务端并包成 `ProcessHandle`（测试内的落点替身，不是产品落点）；`stop()` 以进程组结束并按实际确认答范围。
40. 不实现：OAuth 授权流程（只做发现）、`elicitation.url`、`sampling`、`roots`、`list_changed` 订阅、SSE 旧传输（HTTP+SSE 2024-11-05）。

### 端到端（`w3-mcp-e2e`，从 F2，只写 `packages/mcp/mcp-host-local/tests/e2e/` 与成员 SPEC 的验证节）

41. `createMcp` + `createLocalTransportFactory` + 真实服务端夹具 + 契约的五个端口替身，两种传输各跑同一张旅程表：`refresh` 整份发布 → `invoke` 完成 → 动作错误（`isError`）→ `input_required` 再 `continueWithInput` 完成 → 任务结局后 `queryTask` 到 `completed` 再 `taskResult` → 发出后 `cancel` 得 `unknown`（`abandoned`）→ `release` 报告确认范围。两种传输读数一致（结局种类逐步相同）。

## 原则与约束

| ub-mode 条目 | 本规格的取舍 |
| --- | --- |
| 先做对 | 每条已定事项先有红用例；并发用 deferred 排次序，不用 sleep；超时用小值与注入时钟 |
| 其余 | 按 ub-mode 全文 |

| 判断或约束 | 拥有者 | 本规格的具体条目 |
| --- | --- | --- |
| 轴与拥有者 | `engineering-taste.md` | 协议线上形状归传输（`mcp-host-local`）；结局分类归纯函数（契约）；调用发起条件与在途/任务表归服务（`mcp`）；资源生命周期归连接表。传输不分类 `call` 的应答，服务不读协议细节 |
| 领域边界 | `layers-and-dependencies.md` | SDK 只进 `mcp-host-local`；服务只依赖契约的 `McpTransport` |
| 面向契约 | 成员 SPEC | 契约改动全部可加；`createMcpCore` 删除是成员内部入口，消费者只有本成员测试 |
| 防御与失败语义 | `docs/defensive-patterns.md` | 见下 |
| 演进政策 | `publication.md` | 删除 `createMcpCore` 与成员内绕道；不留兼容层 |

### 跨域概念的五问

不适用：本波不新增跨域概念。

### 失败语义

| 情形 | 行为 | 由谁负责 | 怎样验证 |
| --- | --- | --- | --- |
| 正常 | `invoke` 交出 `CallOutcome`；任务可查询、取结果、交答复、取消 | `mcp` | 服务 + 脚本化传输；端到端 |
| 失败 | 「未发出」带 R2 原因，没有对端效果；`error-answer` 与 `answer-malformed` 原样交出 | `mcp`、`mcp-host-local` | 每个原因一例；套件 |
| 未知 | 发出后无应答答 `unknown`（`abandoned`/`stream-broken`/`process-exited`）；任务操作 `effect-unknown` | `mcp` | 用例 |
| 取消与清理 | `cancel` 只发信号；拆除每一步都执行；`closeAll` 后不建连 | `mcp` | 用例：reject 注入 |
| 外部效果 | 调用可能已在对端生效；不重发调用与任务写 | `mcp-host-local` | 套件：流断开时 `tools/call` 不重发 |

## User Stories

1. 作为 Agent 的调用方，我用一个关联键调用一个 MCP 已知动作，得到完成、动作错误、需要输入、任务或「未发出」，以便按结局继续。
2. 作为调用方，我在需要输入时把答复交回同一代际的连接，连接换代时得到「未发出：`unknown`」而不是被重发。
3. 作为调用方，我能取消自己发出的调用；别的主体用同一关联键取消不了。
4. 作为任务的发起者，我能查询、取结果、交答复、取消；别人查询同一个任务号得到同一个 `unknown`。
5. 作为宿主装配者，我用一个本地传输工厂同时接 stdio 与 Streamable HTTP 的接入点。
6. 作为运维，我在宿主退出时 `closeAll`，之后不会再起进程，凭据句柄都已释放。
7. 作为凭据拥有者，HTTP 401/403 时句柄被告知拒绝，凭据值不出现在任何答复与日志里。

## Implementation Decisions

- `mcp-contract`：改 `services.ts`（`refresh` 的 `signal`、`McpPorts.clock`）、`ports.ts`（`McpClock`）、`transport.ts`（`ListingPage.withheld`、`CallRequest.continuation`）、`outcomes.ts`（`TaskReport` 三个可选字段）、`index.ts`（`canonical`、`sameJson`）、`testing.ts`（样本构造器、`mcpTransportConformance`、`createScriptedTransportFactory`）、新文件 `testing-transport.ts`、`testing-scripted-transport.ts`；`SPEC.md` 的 S1–S9、T1–T7、R4、V1、C1 与新节「与协议的偏离」。
- `mcp`：`internal/` 拆出条目与拆除模块；新增 `invoker.ts`、`internal/tasks.ts`；`index.ts` 换成 `createMcp`。
- `mcp-host-local`：`src/{index,factory,stdio,http,jsonrpc,discover,auth,tasks}.ts`（分法写者可调，理由写进 SPEC）；`tests/fixtures/` 真实服务端；`tests/conformance.spec.ts` 两种传输各跑套件。

## Testing Decisions

- 先写红；红灯输出存闭包 tmp 的 `red/`。证明变红时先还原源码并**重建 dist** 再跑（W2 教训）。
- 接缝：契约套件 + 内存替身；服务 + 脚本化传输；本地传输 + 真实 SDK 服务端（本机进程与本机端口）。
- 先例：`mcp-contract/tests/conformance.spec.ts`；W2 `mcp/tests/races.spec.ts` 的 deferred 次序。
- 传感器：成员 build/typecheck/test、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`metrics --coverage --base <F>`、`mutation --base <F>`；L3 热点由 reduce 逐行读并派 implementation-reviewer 实跑探针。
- 不能声称的事：真实凭据、真实落点、远端服务、断电、长时间运行；OAuth 流程；SSE 旧传输。

## 判据

| ID | 判据 | 证据 |
| --- | --- | --- |
| MC3-1 | 契约：已定事项 1–16 每条在 SPEC 有条款、在类型或守卫有落点；封闭集合测试同步；旧测试原样通过 | 契约测试；`spec-closed-sets.spec.ts` |
| MC3-2 | `mcpTransportConformance()` 覆盖 T1–T7 与已定事项 7–12、14；`createScriptedTransportFactory` 过套件；用一个违约脚本传输证明套件会变红 | `conformance.spec.ts` |
| MC3-3 | 连接表：遗忘谓词纯函数穷举；拆除三步在每种 reject 组合下都执行；临界区重读超时答 `connection-unavailable`；落点在途时 `release`/`closeAll` 报 `unconfirmed`；`closeAll` 后建连被拒；关停时句柄立即释放且只一次 | `teardown.spec.ts`、`races.spec.ts` |
| MC3-4 | `invoke` 次序 1–9 每步的失败各一例，失败时占位撤销；R2 每个原因一例；发出后 `signal` 触发得 `unknown`（`abandoned`）且 `cancelRequest` 被调用 | `invoke.spec.ts` |
| MC3-5 | 在途表隔离：另一主体或另一租户用同一关联键 `cancel` 得 `unknown`；占位后发出前取消使原调用 `cancelled` 且传输 `call` 计数 0 | `cancel.spec.ts` |
| MC3-6 | `continueWithInput`：同代际完成；换代后「未发出：`unknown`」且新代际 `call` 计数 0；只带 `requestState` 的继续合法 | `continue.spec.ts` |
| MC3-7 | 任务四操作：发起者可用；非发起者与表外任务答同一 `unknown`（`deepStrictEqual`）；复用连接不核资格；新建连接资格非 `granted` 得 `effect-unknown`（`no-connection`）且传输工厂计数 0；`cancelTask` 不建连 | `tasks.spec.ts` |
| MC3-8 | `createMcp` 交出五个服务并共享一张表；成员内绕道全部删除（`grep` 为空） | 用例；`grep` |
| MC3-9 | 本地传输：两种传输都跑 `mcpTransportConformance()`，通过/失败/不适用分开计数，失败为 0，不适用每条有理由 | `conformance.spec.ts` |
| MC3-10 | stdio：非 JSON 行 → `stream-broken`；进程退出 → `process-exited`；旧对端回退；取消通知带 `_meta`；探测时限内无应答回退 | `stdio.spec.ts` |
| MC3-11 | HTTP：401 与 `insufficient_scope` 403 → `authorization-required` 且 `reportRejection()` 恰好一次；其余 403 → `connection-unavailable` 且不调用；授权发现两段 URL；流断开时读类重发一次、调用不重发；`x-mcp-header` 非法工具进 `withheld` | `http.spec.ts` |
| MC3-12 | 端到端旅程两种传输逐步结局种类一致 | `e2e/journey.spec.ts` |

## 待决事项

| 缺口 | 影响的切片 | 处置 |
| --- | --- | --- |
| SEP-2663 任务的线上形状（`tasks/get` 应答字段、`tasks/update` 参数名） | 契约套件脚本、host 夹具 | `w3-mcp-contract` 写者按 SEP-2663 原文核实并在 SPEC 引用出处；与 T6 现有读法冲突时停下交回 |

## Out of Scope

- OAuth 授权流程、`elicitation.url`、`sampling`、`roots`、`list_changed` 订阅、SSE 旧传输、后台重连、在途表与任务表跨重启、Cordis 服务键与插件（W4）、组页写回（波末）。

## Further Notes

- W2 教训进本波：契约缺口在 A 段先补，不让实现闭包绕道；同类并发问题先在规格里写成谓词（已定事项 20），不靠评审逐个抓；写者声称做了的结构性改动，reduce 用 `grep` 核实。

# @omne-harness/mcp-contract 行为规格

状态：候选契约，尚未取得技术接受。本页封闭 [MCP 能力组工程设计](../docs/architecture.md)列给本成员的未定项。公开类型是形状的唯一来源，本页只写类型不能表达的行为：每一项在什么条件下出现，以及必须的结果。本成员只有纯函数、类型、类别端口与测试设施。服务实现、`CatalogStore` 的生产实现、传输实现和真实组合都不在本成员。

## 范围与依据

本成员是 MCP 组的纯契约成员。它用 MCP 自己的词对外提供值、结局、失败、五个应用服务的接口、纯函数和接入点正文的类别端口。它不点名任何调用方，不依赖 Cordis，不依赖任何 MCP SDK。官方 SDK 的类型不进入本成员。

| 依据                                                                                                                                                                                       | 修订                                       | 本页采用的范围                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [组工程设计](../docs/architecture.md)                                                                                                                                                      | `21175c9f9`                                | 边界、协议基线、模型、值对象、MCP 连接、动作清单、设置声明、端口、应用服务、调用结果、内容交付、失败种类                                                                                              |
| 领域设计裁定（2026-11-03）                                                                                                                                                                 | 见[领域设计裁定](#decisions)               | 本页每一条与组页不同或组页未定的决定                                                                                                                                                                  |
| 2026-07-28 核对后的决定（2026-11-04）                                                                                                                                                      | 见[2026-07-28 核对后的裁定](#decisions-w3) | 对照 2026-07-28 修订核对后的可加调整：新字段、新导出、新条款与措辞                                                                                                                                    |
| [资产成员 SPEC](../../assets/assets/SPEC.md#accepted-public-types)                                                                                                                         | `21175c9f9`                                | `BodyContract` 的字段与判断规则                                                                                                                                                                       |
| [MCP 协议修订 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28)                                                                                                        | 2026-07-28                                 | 结果形状、`resultType`、多轮输入、内容类型、JSON-RPC 错误码、授权                                                                                                                                     |
| [MCP 任务扩展](https://modelcontextprotocol.github.io/ext-tasks/specification/2026-07-28/tasks.html)（[SEP-2663](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663)） | 2026-07-28                                 | 任务句柄、`tasks/get`、`tasks/update`、`tasks/cancel`；[Streamable HTTP 路由头](https://modelcontextprotocol.github.io/ext-tasks/specification/2026-07-28/tasks.html#streamable-http-routing-headers) |
| [SEP-2243](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243)（[HTTP 标准化](https://modelcontextprotocol.io/seps/2243-http-standardization.md)）                     | 2026-07-28                                 | MCP 请求头、`x-mcp-header`                                                                                                                                                                            |
| 官方 TypeScript SDK `@modelcontextprotocol/client` 与 `@modelcontextprotocol/core`                                                                                                         | 2.4.0（仓库采用的版本）                    | T3、T8 引用的探测、回退与请求头行为，逐处位置见[与 SDK 2.4.0 的对照](#sdk-2-4-0)；本成员不依赖 SDK                                                                                                    |

<a id="decisions"></a>

### 领域设计裁定

MCP 领域设计在 2026-11-03 作出下列裁定。本页的条款兑现它们。

1. 三个入口 `.`、`./provider`、`./testing`，各有 `source`、`types`、`import`。见[三个入口](#entries)。
2. 接入点正文登记的类别是 `mcp`。见 E5。
3. 正文的形状、名字词法、拒绝原因集合与 schema 文件。见 E1–E6。
4. `env` 每项写变量名与来源 `setting` 或 `credential`，正文不写值。见 E3。
5. 设置声明项：连接目标、凭据、连接超时三项固定设置，加上每个 `setting` 来源变量的一项。逐动作权限项不经类别端口产出。见 E5、C8。
6. 对端账号只由 `peerAccountOf` 得出，`CredentialUse` 只答句柄。见 K1。
7. `AdoptionView` 有 `endpoints` 与 `endpoint` 两个操作。见 AV。
8. `McpTransport` 与 `McpTransportFactory` 在 `./provider`。见 T。
9. `mergeListing` 只按清单修订做条件判断，清单带上取得前读到的修订，输入只能是 `completeListing` 构造的清单。见 C4–C6。
10. 「未发出」、拒绝与连接失败的原因是封闭集合。见 R1–R6。
11. 不可用原因是封闭集合。见 R3。
12. `CallOutcome` 有六种，`unknown` 有三种子因。是否建任务由对端逐次决定，请求不带方式。见 O1–O6。
13. 授权发现的四个字段与取值来源。见 R4。
14. 凭据用途与按用途分型的句柄。见 CU。
15. `McpConfig` 的四个必填字段；连接超时缺值时用请求里的 `connectBound`。见 S3、S4。
16. `classifyOutcome` 接收注入的输出校验函数。见 O3。
17. `toContentBlocks` 的转换规则。见 D1–D5。
18. 哪些对端内容用 `Untrusted` 包住。见 V4。
19. 五个服务只写接口与结果值，`ActionInvoker` 是 `ActionCalls` 与 `TaskControl` 的交集。见 S。
20. 配值可以缺失或不合法，两者分别报告 `config-missing` 与 `config-invalid`。见 R1、S4。
21. 任务的多轮输入经 `provideTaskInput` 交回；任务操作只对发起者开放。见 S2、T6。
22. 传输失败按对端效果分四种，读不懂的应答答 `answer-malformed`；任务操作在无应答时答 `effect-unknown`，新建连接前必须核资格。见 T1、T6、T7、S2。
23. 明文 `http` 只用于回环主机。见 V3。

<a id="decisions-w3"></a>

### 2026-07-28 核对后的裁定

本页在 2026-11-04 对照 2026-07-28 修订作出下列可加决定。每条只加字段、导出或条款，不删导出，不把可选改为必填。只有一处改了已有签名的必填性：第 15 条把 `CallRequest.continuation.inputResponses` 从必填放宽为可选；这是放宽，已有调用方照常成立。每条只指向条款，条款是唯一的规则。

1. `ActionDiscovery.refresh` 的请求带 `signal?`，只属于这一次刷新。见 S5。
2. `McpClock` 与 `McpPorts.clock?`：清单的 `acquiredAt` 取自它。见 S3。
3. 公开根导出 `canonical`、`sameJson` 与 `isActionArgs`；`./testing` 导出样本构造器。见[三个入口](#entries)。
4. 端口以 reject 失败是违反契约；实现方按固定规则处置。见[所有权、失败与生命周期](#ownership-rejects)。
5. `release` 与 `closeAll` 在落点在途时报告 `unconfirmed`；`closeAll` 之后不再建连。见 S8。
6. `closeAll` 时落点在途的连接，进程凭据句柄立即释放。见 S9。
7. 每请求 `_meta` 的三个键、能力声明、旧对端探测、`-32022` 续接。见 T3。
8. `ListingPage.withheld`：Streamable HTTP 上 `x-mcp-header` 不合法的工具由传输剔除并列出。见 T2。
9. `cancelRequest` 按传输分写；stdio 的关闭次序。见 T5。
10. Streamable HTTP 应答流断开时只重发读类请求一次。见[与协议的偏离](#protocol-deviations)。
11. 授权发现先取带路径的 well-known 地址；两种 403 分开。见 R4、T4。
12. `TaskReport` 与 `task` 结局带 `pollIntervalMs?`、`ttlMs?`、`statusMessage?`；`-32021` 原样 `error-answer`。见 O2、T6。
13. 本组不经 `subscriptions/listen` 订阅，`changedNotified` 保持为假。见 C2、T3。
14. `call` 带每请求唯一的 `progressToken`；不开日志。见 T3、S6。
15. `continuation.inputResponses` 可选；`args` 必须是 JSON 对象。见 R2、S2。
16. 空串 `requestState` 合法；S7 的「协商」「会话」只对旧对端成立。见 V1、S7。`inputSchema` 的容错方式见[未封闭项](#open-items)。
17. 传输符合性套件 `mcpTransportConformance()` 与内存脚本化传输 `createScriptedTransportFactory`。见[组合与验证](#composition)。
18. MCP 请求头、协商之后的版本、旧修订的能力与旧版本列表。见 T3。
19. 传输对每类请求与每类应答的结论是一张全决策表；`TransportFailure` 加 `not-sent`（`session-ended`），`AnswerMalformed` 加 `error-missing` 与 `cursor-invalid`。见 T1、T7、T8。
20. 传输方法与凭据句柄失败时的处置。见 T9。
21. 取消与关闭按传输与修订分写。见 T5。
22. 任务提示 `pollIntervalMs` 与 `ttlMs` 只收非负安全整数。见 O2。
23. 传输夹具的 `protocolVersions` 只列现代修订。见[组合与验证](#composition)。
24. 线上事件归入应答类别的纯全函数 `classifyWireEvent`，进程退出的时间窗 `PROCESS_EXIT_WINDOW_MS`，请求离开之前的失败。见 T2、T8。
25. 传输不再可用时连接的状态，以及 `cancelTask` 的建连条件。见 S1、S2、S5、S7。

<a id="entries"></a>

### 三个入口

| 入口         | 给谁                   | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`          | 调用方与实现方         | 值、品牌守卫、结局、失败、五个服务接口与结果值、纯函数、`mcpEndpointBodyContract()`、`isActionArgs`、`canonical`、`sameJson`、`McpClock`、`LEGACY_PROTOCOL_VERSIONS`、`FIRST_MODERN_PROTOCOL_VERSION`、`classifyWireEvent` 与 `PROCESS_EXIT_WINDOW_MS`                                                                                                                                                                                            |
| `./provider` | 端口的实现方           | 五个需求端口、`McpTransport`、`McpTransportFactory` 及其答复类型。只有类型，不重复根入口已导出的类型                                                                                                                                                                                                                                                                                                                                              |
| `./testing`  | 端口的实现方，用于自测 | 五个需求端口与传输的符合性套件、各自的内存替身（传输的是 `createScriptedTransportFactory`）、`classifyOutcomeCases`、`mergeListingCases`、样本构造器（`jsonOf`、`jsonTextOf`、`generationOf`、`revisionOf`、`actionNameOf`、`protocolVersionOf`、`requestStateOf`、`taskIdOf`），传输决策表 `TRANSPORT_TABLE` 与它的输入域（`transportCells`、`rowsOf`、`cellsOf`），以及 `runConformanceCase`、`isNotApplicable`、`NotApplicable`、`CaseVerdict` |

公开根不导入 `./testing`。产品源码不导入 `./testing`。

<a id="closed-items"></a>

### 本页封闭的组页未定项

| 组页位置       | 未定项                                                 | 本页条款                                          |
| -------------- | ------------------------------------------------------ | ------------------------------------------------- |
| 第 170 行      | `StdioLaunch` 的变量绑定、工作目录的写法与缺省         | [E3、E4](#endpoint)                               |
| 第 181 行      | `degraded` 的原因集合                                  | [S7](#services)                                   |
| 第 318 行      | 连接超时缺值时的上界与失败码                           | [S4](#services)                                   |
| 第 330 行      | 各设置项与权限项的值域                                 | [E5](#endpoint)、[C8](#catalog)                   |
| 第 343 行      | 进程句柄的精确形状                                     | [PL](#port-landing)                               |
| 第 355 行      | `UseEligibility` 拒绝原因的完整集合                    | [UE](#port-eligibility)                           |
| 第 374、599 行 | 授权发现的四个字段；`CredentialUse` 的用途值域         | [R4](#refusals)、[CU](#port-credentials)          |
| 第 401 行      | 不可用原因的封闭集合                                   | [R3](#refusals)                                   |
| 第 430 行      | 「未发出」原因的封闭集合                               | [R2](#refusals)                                   |
| 第 445 行      | 任务处于 `input_required` 时怎样取得输入请求并带回答复 | [S2](#services)、[T6](#port-transport)            |
| 第 465 行      | 控制操作在资格不是 `granted` 时的失败码                | [R1](#refusals)                                   |
| 第 525 行      | 精确的失败码                                           | [失败码索引](#failure-codes)                      |
| 第 600 行      | 变量名绑定到非秘密配值还是凭据句柄，以及写法           | [E3](#endpoint)                                   |
| 第 602 行      | 对端日志通知里的秘密                                   | [S6](#services)                                   |
| 第 603 行      | 分页数、清单大小与 `instructions` 的上界               | [C1](#catalog)、[S3](#services)                   |
| 第 604 行      | 部分准备与配置错误的报告形状                           | [R1](#refusals)、[S4](#services)、[S7](#services) |

本页不封闭组页第 601 行（`deriveDeclarations` 取得清单的上下文），见[未封闭项](#open-items)。

<a id="deviations"></a>

### 与组页的差异

下列差异都已经领域设计裁定（2026-11-03）接受，组页随后写回。

| 组页位置                     | 组页的写法                                            | 本页的写法                                                                                                          | 裁定                                     |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 第 171 行                    | 对端账号随凭据句柄交回                                | 对端账号只由 `peerAccountOf` 得出（K1）                                                                             | 接受，与组页第 342 行一致                |
| 第 174 行                    | 动作定义带 `execution`（含任务支持方式）              | 不读任务支持方式，定义原样保存（C3）                                                                                | 接受，2026-07-28 的任务扩展如此规定      |
| 第 411–412、421、427、430 行 | 调用带方式 `mode`，方式不支持时「未发出」             | 请求不带方式，是否建任务由对端决定（O2）；「未发出」原因没有方式一项（R2）                                          | 接受，2026-07-28 的任务扩展如此规定      |
| 第 316 行                    | 是否允许明文 `http` 是政策，本页不定                  | 明文 `http` 只用于回环主机（V3）                                                                                    | 接受                                     |
| 第 317、513 行               | 凭据缺值按缺凭据失败                                  | 要连接的操作答 `credential-unavailable`（`missing`），`current` 与 `peer` 答 `config-missing`（`credential`）（K1） | 接受                                     |
| 第 442 行                    | `taskResult` 答结局、尚未结束、已过期或 `unknown`     | 另有 `cancelled`（S2）                                                                                              | 接受，任务扩展有「已取消、无结果」的终态 |
| 第 443、467 行               | `cancelTask` 答已请求、已在终态或 `unknown`；不需连接 | 只答已请求，终态经 `queryTask` 得知；任务操作需要连接或可重建的材料（S2）                                           | 接受，`tasks/cancel` 只回确认            |
| 第 488 行                    | `inputRequired` 带 `inputRequests` 与 `requestState`  | 两项各自可选，至少有一项（O2）                                                                                      | 接受，协议如此规定                       |
| 「调用结果」一节             | 未知的 `resultType` 未定                              | 答 `protocolError`（O5）                                                                                            | 接受                                     |
| 「对外接口」一节             | `CredentialUse` 答一种句柄                            | 按用途分型（CU1）                                                                                                   | 接受                                     |

## 结果与不变量

<a id="values"></a>

### 值与不可信内容

- **V1** 每个品牌只由公开根里的一个守卫授予，例如 `isEndpointName`、`isMillis`、`isConnectionTarget`。守卫不修补输入。持有、采用修订、凭据配值、动作名、关联键、任务号、协议版本这七个品牌只要求非空文本：它们按名字区分含义不同的值，不检查内容。请求状态只要求是文本：对端可以写出空串，空串合法。这些值原样保存，只比较相等。
- **V2** `Millis` 是正的安全整数。`Generation` 是非负的安全整数。`CatalogRevision` 是正的安全整数，第一次采用的修订是 1。`DefinitionDigest` 与 `InstructionsDigest` 是 `sha256:` 加 64 位小写十六进制。
- **V3** `ConnectionTarget` 只做句法检查：小写 `https`，或者主机是回环主机（`localhost`、`127.0.0.1`、`::1`）时的小写 `http`。主机按 WHATWG URL 解析后的写法与回环集合比较，所以 `http://127.1/` 这类简写也算回环；保存的是原文，传输实现须用同一种解析；绝对地址；有主机；没有 fragment；没有 userinfo；整串没有空白、控制字符或反斜杠。其他明文 `http` 地址不合法。不合法时守卫答否，不修补后接收。句法检查不判定对端可信，也不阻止秘密出现在地址里。
- **V4** 下列对端内容用 `Untrusted<T>` 包住：`serverInfo`（2026-07-28 起在应答的 `_meta` 里，可能缺席，所以是可选字段）、`instructions`、动作定义的 annotations、内容项的 annotations、进度与日志通知、授权发现里的受保护资源元数据、`inputRequired` 结局与任务报告里的 `inputRequests`。读这些值必须经 `untrusted` 字段。其余对端内容原样交出，同样不是身份或授权的依据，例如授权发现的 `issuers` 与 `scopes`、动作定义里的 title、description、icons 与 `_meta`、`fault` 与 `error-answer` 的 `message` 与 `data`、内容与结构化内容。

<a id="endpoint"></a>

### 接入点正文

- **E1** `parseEndpointBody(body, capabilityName?)` 只接受 `@omne-harness/json-text` 的 JSON 树。正文是对象，成员只有 `name`、`transport`、`auth`、`launch`。它不抛出。
- **E2** 拒绝原因按下列顺序判定，第一个成立的原因就是答复。先报结构，再报名字，最后报组合，这个顺序让同一个正文总得到同一个原因：
  1. `malformed`：输入不是 JSON 树，或结构不合法。结构不合法包括未知成员、`name` 不合词法（`^[a-z0-9]+(?:-[a-z0-9]+)*$`，1–64 个字符）、`transport` 或 `auth` 不是文本、`launch` 内部不合法。
  2. `name-mismatch`：给出了能力名，且 `name` 与它不同。没有给出能力名时不比较。
  3. `transport-unknown`：`transport` 不是 `stdio` 或 `streamable-http`。
  4. `auth-unknown`：`auth` 不是 `none`、`static` 或 `oauth`。
  5. `malformed`：组合不合法。`stdio` 配 `oauth` 不合法，因为授权规范只用于 HTTP。`auth` 是 `none` 而 `env` 里有 `credential` 来源的变量也不合法。
  6. `launch-missing`：`stdio` 没有 `launch`。`launch-unexpected`：`streamable-http` 带了 `launch`。
- **E3** `launch` 的成员是 `command`（必需，非空）、`args`、`cwd`、`env`、`facilities`。省略的列表读作空列表。`env` 每项只有 `name` 与 `source`，正文不写值。`name` 是环境变量名（`^[A-Za-z_][A-Za-z0-9_]*$`），同一正文里不重复。`source` 的含义如下：
  - `setting`：取 `AdoptionView` 在 `processEnv` 里交来的同名非秘密配值。
  - `credential`：起进程时由进程凭据句柄注入。秘密值不经过 MCP。几个 `credential` 变量共用同一份凭据配值，各自注入什么由 `CredentialUse` 与 `ProcessLanding` 两个实现方约定。

  正文没有列出的变量不隐式补入。命令是一个程序，不经 shell 解释。参数原样传递，不插值，不展开。`facilities` 的项合词法（`^[a-z][a-z0-9-]{0,31}$`），不重复。

- **E4** `cwd` 是非空文本，原样交给 `ProcessLanding`，由落点解释。省略 `cwd` 时由落点决定工作目录。MCP 不选落点，所以不给缺省。
- **E5** `mcpEndpointBodyContract()` 登记类别 `mcp`。它的 `judge`、`deriveDeclarations`、`references` 只接受 `readBodyText` 的读取结果，这是资产契约的规则：对其他输入，`judge` 答 `incomplete-reference`，另两个抛出 `TypeError`。`judge` 的拒绝原因与 E2 相同。`deriveDeclarations` 按下列次序产出设置声明项：
  1. `setting:placement-identity:target`：只对 `streamable-http`。值域是 `ConnectionTarget`。
  2. `setting:placement-identity:credential`：只在 `auth` 不是 `none` 时。值域是 `CredentialBinding`，没有缺省值。
  3. `setting:placement-identity:env.<NAME>`：每个 `setting` 来源的变量一项，按正文次序。值域是文本，没有缺省值。
  4. `setting:preference:connect-timeout`：总是产出。值域是 `Millis`，没有缺省值。

  判断失败时 `deriveDeclarations` 与 `references` 抛出 `TypeError`，错误文本带拒绝原因。`references` 对合法正文答空列表：接入点不引用其他能力。

- **E6** `launchesLocalCommand(definition)` 对 `stdio` 答真，对 `streamable-http` 答假。加载正文时就能回答。`schema/endpoint-body.schema.json` 是同一规则的说明文档，`$id` 带格式版本 `:1`。正文是否合法由 E1–E2 决定。

<a id="keys"></a>

### 对端账号与键

- **K1** 对端账号只由 `peerAccountOf(auth, binding)` 得出。`auth` 是 `none` 时答 `anonymous`，不读凭据配值。否则凭据配值缺失答 `credential-missing`，不退回其他凭据。服务把它报告为：要连接的操作答 `credential-unavailable`（`missing`）；不连接的 `current` 与 `peer` 答 `config-missing`（`credential`）。`CredentialUse` 不答复对端账号。
- **K2** `connectionKeyOf` 由租户、持有、采用修订与对端账号组成。采用修订一变，键就变。不同租户、不同对端账号的键不同。
- **K3** `catalogKeyOf` 由租户、对端账号与持有组成，不含采用修订与协议版本。采用修订或协议版本变化时，已知动作不离开清单。

<a id="catalog"></a>

### 清单与已知动作

- **C1** `completeListing` 只在下列条件全部成立时构造完整清单，否则答第一个成立的缺陷：
  1. `page-failed`：任一页失败。前面已取得的各页也不采用。
  2. `page-limit-exceeded`：页数超过 `maxPages`，或取到 `maxPages` 页时最后一页仍有下一页。
  3. `pages-unfinished`：没有页，或最后一页仍有下一页。
  4. `action-limit-exceeded`：动作总数超过 `maxActions`。
  5. `action-invalid`：某一项不是对象，`name` 不是非空文本，`inputSchema` 不是对象，或 `outputSchema`、`annotations` 存在但不是对象。
  6. `duplicate-action-name`：动作名重复，跨页也算。
- **C2** 完整清单带上调用方给出的 `basedOn`：取得前经 `CatalogStore.read` 读到的修订，从未写入时是 `absent`。新鲜度的取得时刻由调用方给出，`ttlMs` 取各页给出值中的最小值，`changedNotified` 为假。2026-07-28 的 `list_changed` 只经 `subscriptions/listen` 到达；本组不订阅（T3），所以 `changedNotified` 保持为假。清单、它的动作列表与每个动作都冻结。
- **C3** 动作定义原样保存，不改写。`definition` 是对端对象去掉 `annotations` 后的原样内容，annotations 另存为不可信值。`digestDefinition` 对对端原对象（含 annotations）的规范化文本算 SHA-256。规范化文本的规则：对象成员按名字的 UTF-16 码元排序；字符串按 RFC 8785 转义；数字保留原样的词形；没有空白；文本按 UTF-8 编码。成员次序不改变摘要，任何内容或数字词形的变化都改变摘要。
- **C4** `mergeListing(current, listing)` 只接受 `completeListing` 在同一模块实例里构造的清单。其他对象，包括复制出来的清单，使它抛出 `TypeError`。这项登记是进程内的凭证：清单不能序列化后传给另一个进程再合并；同一进程加载本成员两份时，两份互不承认对方构造的清单。
- **C5** `mergeListing` 只按清单修订做条件判断。当前修订（未取得时是 `absent`）不等于清单的 `basedOn` 时答 `stale-revision`，不产出记录。它不比较连接代际：产出清单的那一代连接是否仍是当前连接，在发布边界由服务实现核对。
- **C6** 条件成立时，`mergeListing` 产出一份完整的新记录：
  - 清单里的动作可用，带新的定义与摘要。
  - 已知但不在清单里的动作仍在记录里，保留最近合法定义与摘要，标为不可用，原因是 `no-longer-offered`。
  - 修订是原修订加一，第一次是 1。
  - 采用依据与新鲜度取自本次清单。
  - 动作按名字的 UTF-16 码元排序，名字不重复。

  空清单也是「已取得」，表示对端提供零个动作。「未取得」不是零个动作。

- **C7** `markUnavailable(record, reason)` 把每个动作标为不可用，原因是给出的连接、凭据、授权或落点原因。原因是 `no-longer-offered` 的动作保留这个原因，其他已不可用的动作改为新原因。定义与摘要不变，修订加一。修订已是最大安全整数时，`mergeListing` 与 `markUnavailable` 抛出 `RangeError`。
- **C8** `actionPermissionItems` 在「未取得」时答 `not-acquired`，不推断零个动作。「已取得」时每个已知动作一项，项名是 `execute:<对端动作名>`，可用与不可用的动作都有。项名只由动作名决定。每项的值域是 `forbid`、`auto`、`ask`。MCP 只声明权限项，不判定权限。

<a id="outcomes"></a>

### 结局分类

- **O1** `classifyOutcome(answer, context)` 是全函数，不抛出。`context` 给出发出时的连接代际、动作的 `outputSchema`（如有）和注入的输出校验函数。
- **O2** 对端答 `result` 时按 `resultType` 分类。缺 `resultType` 的结果来自旧对端，按 `complete` 处理。请求不带方式，是否建任务由对端对每个请求自己决定：
  - `complete` 且 `isError` 为真：`toolError`，带内容与结构化内容（如有）。这是动作自己的失败，不是协议失败。
  - `complete` 且 `isError` 缺省或为假：`complete`，带内容、结构化内容（如有）与输出校验结论。
  - `input_required`：`inputRequired`，带 `inputRequests`（不可信值）、`requestState`（各自如有）与发出代际。两者至少有一项，`inputRequests` 是对象。
  - `task`：`task`，带 `taskId` 与发出代际，以及任务句柄上的提示 `pollIntervalMs`、`ttlMs`、`statusMessage`（各自如有，`statusMessage` 是不可信值）。`ttlMs` 为 `null` 表示无限，省略。提示的类型不对时省略该提示，不判 `result-malformed`。`pollIntervalMs` 与 `ttlMs` 的类型是非负安全整数：词形只有数字，不带符号、小数点或指数，值不超过 `Number.MAX_SAFE_INTEGER`。其他数值按类型不对省略。`statusMessage` 的类型是文本。
- **O3** 输出校验结论只有三种：动作没有声明 `outputSchema` 时是 `no-schema`，不调用校验函数。声明了 `outputSchema` 但结果没有结构化内容时是 `violates`，原因是 `structured-content-missing`，不调用校验函数。其余情形调用一次校验函数，用它的答复。`toolError` 不调用校验函数。原因文本 `structured-content-missing` 是契约值；校验函数给出的其他原因文本不是契约。
- **O4** 对端答 JSON-RPC 错误时是 `protocolError`，`fault` 是 `peer-error`，带整数错误码、消息与 `data`（如有）。错误码的词形必须是整数（`^-?\d+$`），带小数点或指数的词形不算整数。错误码不作翻译，所有码都按同一规则交出。协议错误不证明调用没有效果。
- **O5** 读不懂的应答也是 `protocolError`，不猜测成功：
  - `result-type-unknown`：`resultType` 是未知的文本，带原值。
  - `result-malformed`：结果不是对象，`resultType` 不是文本，缺 `content` 或 `content` 不是列表，`isError` 不是布尔值，多轮结果两项都没有、`inputRequests` 不是对象或 `requestState` 不是文本，任务句柄的 `taskId` 缺失或不是非空文本。
  - `error-malformed`：错误对象不是对象，或缺整数码，或缺消息。
- **O6** 已发出但没有应答时是 `unknown`，子因是 `stream-broken`、`process-exited` 或 `abandoned`。`unknown` 表示效果未知，不压成失败，不重发。

<a id="content"></a>

### 内容交付

- **D1** `toContentBlocks(items)` 按对端次序逐项转换，一项对应一项，不丢弃任何一项。
- **D2** `text` 转成文本块，`image` 转成图块，`audio` 转成语音块。媒体类型原样交出，不改写，不能为空。`data` 是 RFC 4648 第 4 节的标准 base64，带填充。
- **D3** `resource_link` 与 `resource` 原样带协议类型交出，不改写成文本。`resource_link` 要有非空 `uri` 与文本 `name`。`resource` 要有带非空 `uri` 的 `resource` 对象，并且恰好有 `text` 或 base64 的 `blob` 之一。
- **D4** 不合法的一项转成 `invalid`，带原因与一个说明文本块。原因与它出现的条件：
  - `not-an-object`：这一项不是对象。`type-missing`：没有文本的 `type`。`type-unknown`：`type` 不在 2026-07-28 的内容类型里。
  - `annotations-invalid`：annotations 存在但不是对象。
  - `text-invalid`：文本项的 `text` 不是文本。`data-invalid`：图或语音的 `data` 不是 base64。`mime-type-invalid`：图或语音缺媒体类型或媒体类型为空。
  - `uri-invalid`、`name-invalid`：资源链接缺非空 `uri` 或文本 `name`。`resource-invalid`：内嵌资源不满足 D3。

  说明文本带位置、类型与原因，不复制这一项的内容。说明文本的措辞不是契约，只有 `reason` 与 `type` 是。

- **D5** 块的标识是 `content-<位置>`，位置从 0 计，在一份结局内唯一。每个块对人与模型都可见：谁看到什么由调用方决定。内容项的 annotations 作为不可信值另交，`_meta` 原样另交。

<a id="refusals"></a>

### 拒绝、连接失败、未发出与不可用

每个集合的成员以类型为准，本节写每一项在什么条件下出现。

- **R1** `Refusal` 在使用连接之前给出：
  - `not-available-to-you`：接入点未采用、主体无资格或接入点不存在。三者对任何主体不可区分。
  - `blocked`：主体有资格，但被设置挡下，带 `local-command-not-enabled` 或 `disabled`。
  - `unknown`：采用或资格不可读，或者答复无法证明，例如任务不在本次运行的任务表里。
  - `config-missing`：操作需要的配值缺失，带配置项：`connect-timeout`、`target`、`credential` 或 `env.<NAME>`。
  - `config-invalid`：配值存在但它的守卫拒绝了它，带配置项 `connect-timeout`、`target` 或 `credential`。变量值只有缺失一种配置失败，所以没有 `env.<NAME>` 一项。

  控制操作在资格不是 `granted` 时只答 `Refusal`。

- **R2** `NotSentReason` 是「未发出」的原因，「未发出」没有对端效果。除 `Refusal` 与 `ConnectionFailure` 的各项外：
  - `correlation-key-in-use`：同一（租户、主体、关联键）已在途。
  - `cancelled`：占位后、发出前收到了 `cancel`。
  - `definition-changed`：调用方预期的定义摘要与当前摘要不同。
  - `action-unavailable`：已知动作不可用，或不在清单里。

  `args` 必须是 JSON 对象，`isActionArgs` 判定。`invoke` 与 `continueWithInput` 收到非对象 `args` 时，返回的 Promise 以 `TypeError` reject，方法不同步抛出：这是调用方缺陷（前提违反），不是「未发出」的原因，不进入 `NotSentReason`。

- **R3** `UnavailableReason` 写进已知动作的可用性：`no-longer-offered` 由 `mergeListing` 给出；`connection-unavailable`、`authorization-required`、`credential-unavailable`、`landing-unavailable` 由 `markUnavailable` 按连接条件给出。
- **R4** 授权发现有四个字段：
  - `resourceMetadataUrl`：受保护资源元数据的地址。`WWW-Authenticate` 头有 `resource_metadata` 时只取这一个地址，取不到也报告它。没有时按连接目标的 well-known 地址取：先取带路径的 `/.well-known/oauth-protected-resource/<连接目标的路径>`，取不到再取根 `/.well-known/oauth-protected-resource`；报告实际取到元数据的地址，两处都取不到时报告根地址。
  - `metadata`：元数据是否取到，`fetched` 或 `unavailable`。取到的内容不是 JSON 对象时按没取到算。`resourceMetadata` 只在取到时出现，是不可信值。
  - `issuers`：元数据的 `authorization_servers` 里的文本项。元数据没取到时为空。
  - `scopes`：对端 `WWW-Authenticate` 头的 `scope`，按空白拆开。头里没有 `scope` 或拆开后为空时，取元数据的 `scopes_supported` 里的文本项。都没有时为空。

  对端答 401，或答 403 且 `WWW-Authenticate` 带 `error="insufficient_scope"` 时，才有授权发现。其余 403（例如 `Origin` 不被接受）不是授权失败：答 `connection-unavailable`，见 T8 S06。MCP 不做授权流程：OAuth 授权流程归凭据保管的提供者，MCP 交出完整的授权发现，提供者可以直接复用官方 SDK 的授权模块完成流程。

- **R5** `CallOutcome` 只描述已发出的调用。`InvokeResult` 用 `not-sent` 与 `sent` 两种分开它们。
- **R6** `ConnectionFailure` 在需要连接、而连接条件不成立时给出：
  - `credential-unavailable`：凭据缺失、被拒或不可读，带 `missing`、`rejected` 或 `unknown`。
  - `authorization-required`：对端答需要授权，带授权发现。
  - `landing-unavailable`：进程落点或设施不成立，或落点不可读。
  - `connection-unavailable`：传输打不开，协商失败，或请求没有产生对端效果（`not-sent`）。
- **R7** `OperationFailure` 是读口、状态口与任务操作的失败，由 `Refusal`、`ConnectionFailure` 与下面三项组成。`current` 与 `peer` 不发请求，它们的失败 `ReadFailure` 不含这三项：
  - `effect-unknown`：请求已发出而没有应答，带 `NoAnswerCause` 的子因；或任务操作既没有现有连接、也没有可重建连接的采用材料，子因是 `no-connection`。效果未知，不压成失败，不重发。
  - `error-answer`：请求已发出，对端答 JSON-RPC 错误，带错误码、消息与 `data`（如有），原样交出。
  - `answer-malformed`：请求已发出，应答不是 T2、T6 为这个请求点名的形状，带 `what`（见 T7）。

<a id="services"></a>

### 应用服务接口

本成员只写接口与结果值。下列条款约束接口的实现方。

- **S1** 除 `ActionInvoker.cancel` 与 `Connections.closeAll` 以外，每个操作先经 `AdoptionView.endpoint` 核采用，再经 `UseEligibility.check` 核资格。四个任务操作例外，按 S2 的建连规则核。未采用时答 `not-available-to-you`，不再问资格。`AdoptionView` 不可读时答 `unknown`。资格答 `not-eligible` 时答 `not-available-to-you`，答被设置挡下时给出该原因，答 `unknown` 时答 `unknown`。`EndpointStatus.list` 经 `AdoptionView.endpoints` 取列表，再逐项核资格，只列出有资格的接入点；任一项资格答 `unknown`，整次答 `unknown`。接入点被撤采用或被禁用后，`Connections` 在下一次使用边界之前自行关闭它的连接，stdio 时一并停止进程。所以 `release` 对被禁用的接入点答 `blocked` 是可接受的：连接不靠 `release` 释放。
- **S2** 调用与任务的控制：
  - `cancel` 只按（租户、主体、关联键）在本次运行的在途表里定位，不核采用与资格。在途时答 `signalled`；关联键已结束时答 `no-call-in-flight`；表里没有时答 `unknown`。占位后、发出前收到的 `cancel` 使原调用答「未发出：`cancelled`」。
  - 连接换代之后，`continueWithInput` 在旧代际上的在途状态无法证明时答「未发出：`unknown`」，不在新代际上重发。它发出的 `CallRequest` 带 `continuation`：`requestState` 与 `inputResponses` 各自可选，只带 `requestState` 的重试合法。
  - 服务在本次运行内保存已发出的任务表，键是（租户、主体、持有、任务号）。表项在本次运行内不删除；任务的终态交出之后再查询，仍转发给对端。任务表不跨重启，这是已知限制。
  - `queryTask`、`taskResult`、`provideTaskInput`、`cancelTask` 只对发起者开放：非发起者、重启之后和表里没有的任务一律答 `unknown`，不随任务是否存在而变。
  - 四个任务操作的建连规则，`cancelTask` 也一样：复用现有连接时不核采用与资格。要新建连接时，经 `AdoptionView.endpoint` 核采用并取得建连材料，`UseEligibility` 必须答 `granted`；`AdoptionView` 答 `unknown` 时答 `Refusal` 的 `unknown`；未采用、资格不是 `granted` 或没有可以建连的材料时，不建连接，答 `effect-unknown`（`no-connection`）。
  - 传输答 `no-answer` 时，四个任务操作答 `effect-unknown`，带同一子因。传输答 `error-answer` 或 `answer-malformed` 时原样交出。
  - `taskResult` 对已取消、没有结果的任务答 `cancelled`。`provideTaskInput` 把答复交给 `input_required` 的任务，对端确认后答 `accepted`。`cancelTask` 在对端确认取消请求后答 `requested`；任务是否已到终态，经 `queryTask` 得知。
- **S3** `McpConfig` 的四个字段都必填，没有缺省值：
  - `principalKey`：给出主体的文本。同一租户内不同主体映射到不同文本，同一主体在本次运行内映射到同一文本。违反这一点是装配方的缺陷。
  - `maxListingPages`、`maxActions`、`instructionsByteLimit`：正的安全整数，分别限制一次取得的分页数、一次取得接受的动作数、保留的 `instructions` 的 UTF-8 字节数。
  - 服务的构造函数（`createMcp`）收到不合法的 `McpConfig` 时抛出 `RangeError`。

  清单新鲜度的 `acquiredAt` 取自 `McpPorts.clock`（`McpClock.now()`，写成 ISO 8601 文本）。`clock` 缺省时实现取本机时钟。

  `instructions` 由传输在 `discover` 时处理：先对全文算摘要，再经 `boundInstructions` 截断。截断在完整的 UTF-8 字符边界内，摘要是 `InstructionsDigest`。`boundInstructions` 的上界不是正的安全整数时，它抛出 `RangeError`，这是前提违反。

- **S4** 配值按下表使用。缺陷按 target、credential、connect-timeout、env 的次序检查（env 按正文次序），只报第一项。

  | 操作                                                                 | 需要的配值                                                                                                      |
  | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
  | 要连接的操作：`refresh`、`invoke`、`continueWithInput`、四个任务操作 | Streamable HTTP 的 target；`auth` 不是 `none` 时的 credential；connect-timeout；stdio 的每个 `setting` 来源变量 |
  | `current`、`peer`                                                    | `auth` 不是 `none` 时的 credential，用来组成清单键                                                              |
  | `release`、`EndpointStatus.inspect`、`EndpointStatus.list`           | 不需要配值                                                                                                      |

  每一项的规则：
  - target 缺失时答 `config-missing`（`target`），不合法时答 `config-invalid`（`target`）。
  - credential 缺失时按 K1 报告，不合法时答 `config-invalid`（`credential`）。
  - connect-timeout 取 `AdoptionView` 交来的配值。缺值时用请求或任务引用里的 `connectBound`。两者都没有时答 `config-missing`（`connect-timeout`）。配值不合法时答 `config-invalid`（`connect-timeout`），不改用 `connectBound`。
  - `processEnv` 缺某个 `setting` 来源变量时答 `config-missing`（`env.<NAME>`）。变量值只有缺失一种失败。

  `invoke` 与 `continueWithInput` 把这些答复作为「未发出」的原因，其他操作把它们作为失败。

- **S5** `refresh` 答下列之一：
  - `published`：清单已整份发布，带新的修订。
  - `kept`，原因是 `superseded`：`CatalogStore` 写入时答修订冲突，`mergeListing` 答 `stale-revision`，或产出清单的那一代连接在发布前已不是当前连接。原采用不变。
  - `kept`，原因是 `cancelled`：本次刷新已被取消。请求的 `signal` 只属于这一次刷新。实现在等待建连、取每一页与发布边界各自核对它；它已触发时答 `cancelled`，不发布。原采用不变。`signal` 触发只结束本次刷新对建连的等待，不中止同一连接键上共享的建连：那次建连照常完成或失败，结果留给其他等待者。
  - `kept`，原因是 `listing-incomplete`：`completeListing` 答了缺陷，带这个缺陷。某页的传输答 `no-answer`、`error-answer` 或 `answer-malformed` 时，这一页算失败，缺陷是 `page-failed`，连接转为 `degraded`（`list-failed`）。原采用不变。
  - 总规则：某个请求的 T8 结论带「传输不再可用」时，连接转为 `lost`，原因取结论的子因（`stream-broken`、`process-exited`、`session-ended`），并以 `connection-unavailable` 调用 `markUnavailable`；`refresh` 答 `connection-unavailable`。下面各条只用于没有这个标记的结论。
  - 失败：某页或 `discover` 的传输答 `not-sent`（`authorization-required` 或 `connection-unavailable`）时，答对应的 `ConnectionFailure`，连接按 S7 转为 `lost`，并用对应原因调用 `markUnavailable`。写入这份记录时 `CatalogStore` 答修订冲突，`refresh` 答 `kept`（`superseded`）；答不可用时答 `unknown`。`discover` 答 `no-answer` 时答 `effect-unknown`，连接转为 `degraded`（`discover-failed`）；答 `error-answer` 或 `answer-malformed` 时答 `connection-unavailable`，连接转为 `lost`（`discover-failed`）。发布边界核对当前授权失败时，答对应的 `Refusal`，不发布。`CatalogStore` 读取或写入不可用时答 `unknown`，不报告新修订。
- **S6** 进度与日志通知经调用方给出的观察函数交出，标为不可信，不代替结局。观察函数抛出不影响调用的结局。本组不把通知写进自己的日志：对端日志不经过 `ProcessLanding`，MCP 无法按值遮盖其中的秘密。
- **S7** `EndpointStatusView` 的连接状态：
  - `none`：本次运行没有这个接入点的连接。`preparing`：正在准备。`ready`：`discover` 已成立。2026-07-28 没有握手与会话：「协商」只指旧对端的 `initialize`，「会话」只对旧对端成立。
  - `degraded`：最近一次非调用请求暂时失败，原因 `discover-failed`（`discover`，含旧一路的 `initialize`）或 `list-failed`（`tools/list`）。
  - `lost`：连接不再成立，原因如下：`preparation-failed`，准备失败且不属于其他几种；`discover-failed`，`discover` 已发出而最终报出的失败是 `error-answer` 或 `answer-malformed`，按 T8 它可能来自现代一路的 `server/discover`，也可能来自走旧一路后的 `initialize`；`close-unconfirmed`，`release`、`closeAll` 或自动关闭时进程的 `stop()` 答 `root-only` 或 `unconfirmed`；`authorization-required`，对端答需要授权；`process-exited`，stdio 进程退出；`stream-broken`，管道或流断开且传输不再可用（T8 S01、S03）；`negotiation-invalid`，已记录的 `discover` 或旧对端 `initialize` 的结果不再成立；`session-ended`，传输对旧对端会话上的请求答 `not-sent`（`session-ended`）（T8 S07）。

  「确认停止」指 `stop()` 答 `tree-confirmed`。准备失败或关闭后留下的进程与它确认的停止范围只记在 `lost` 状态的 `residual` 上，视图原样反映状态。关闭时确认停止，状态回到 `none`；否则状态是 `lost`（`close-unconfirmed`）并带 `residual`。重建成功或之后确认停止时，`residual` 清除。凭据在视图里报告为：`not-required`，`auth` 是 `none`；`absent`，配值缺失；`invalid`，配值被守卫拒绝；`present`，配值存在。视图不报告凭据值。

- **S8** `release` 与 `closeAll` 只报告实际确认的范围：有进程时带确认的停止范围；连接没有进程时报告 `no-process`；连接状态为 `none` 时报告 `no-connection`。落点在途（进程尚未交来）时，报告该连接的进程范围为 `unconfirmed`，不报 `no-process`。`closeAll` 之后本实例不再建立连接：`refresh` 答 `connection-unavailable`；`invoke` 与 `continueWithInput` 答「未发出：`connection-unavailable`」；四个任务操作答 `effect-unknown`（`no-connection`），与 S2「不建连接」相同。任务操作先按 S2 判发起者：不是发起者或表里没有时答 `unknown`，然后才判 `closeAll`。`peer` 不为回答而建连接，本次运行没有连接时答 `not-connected`。`current` 的 `basisCurrent` 比较采用依据与当前连接的协议版本和能力（能力按规范化 JSON 比较相等），不比较连接代际；本次运行没有连接时答 `no-connection`。
- **S9** 凭据句柄的取得与释放：每条连接按凭据配值调用一次 `CredentialUse.acquire`，所有 `credential` 来源变量共用这一个进程凭据句柄。进程凭据句柄在进程的 `stop()` 返回之后释放，不论它答哪种范围；准备失败时立即释放。HTTP 凭据句柄随连接关闭释放。关停例外：`closeAll` 时落点仍在途的连接，进程凭据句柄立即释放。之后迟到的进程照样停止一次，句柄不再释放第二次。

## 所有权、失败与生命周期

本成员的纯函数没有异步资源，没有外部效果，不需要清理。下列条款约束端口的实现方，每条对应 `./testing` 里同名套件的用例。

<a id="ownership-rejects"></a>

端口应以 `Outcome` 答复。端口以 reject 失败是违反契约。实现方按下列规则处置 reject，规则写在各端口的最后一条，传输的规则是 T9：读类端口 reject 当作 `unknown`；`McpTransport.close()` reject 当作已关闭，继续拆除；`ProcessHandle.stop()` reject 当作 `unconfirmed`；凭据句柄 `release()` reject 当作已释放，不重试。拆除的每一步都执行，前一步失败不跳过后一步。

<a id="port-adoption"></a>

### `AdoptionView`（AV）

- **AV1** `endpoint(access, ref)` 对已采用的接入点答该项，带采用修订、正文、三项固定设置的配值与 stdio 进程环境所需的非秘密配值。未配的设置项答 `absent`，守卫拒绝的配值答 `invalid` 并带原文，不补缺省值。
- **AV2** `endpoints(access, scope)` 只列出该作用域里已采用的接入点。
- **AV3** 未采用的接入点答 `not-adopted`。
- **AV4** 对其他租户的主体，已采用的接入点与不存在的接入点答复完全相同，都是 `not-adopted`。
- **AV5** 正文或任一配值变化时，采用修订随之变化。
- **AV6** 不可读时答 `unknown`，不答 `not-adopted` 或空列表。
- **AV7** `endpoints` 或 `endpoint` reject 是违反契约。实现方当作 `unknown`。

<a id="port-eligibility"></a>

### `UseEligibility`（UE）

拒绝原因以 `EligibilityVerdict` 的类型为准：`not-eligible`、`local-command-not-enabled`、`disabled`。

- **UE1** 有使用资格的主体答 `granted`。
- **UE2** 无使用资格的主体，对已存在与不存在的接入点答复完全相同，都是 `refused`、`not-eligible`。
- **UE3** 被设置挡下的原因 `local-command-not-enabled` 与 `disabled` 只答给有使用资格的主体。
- **UE4** 每次使用都现场判定，不缓存。撤权在下一次判定时生效。
- **UE5** 不能判定时答 `unknown`，不答拒绝。
- **UE6** `check` reject 是违反契约。实现方当作 `unknown`。

<a id="port-credentials"></a>

### `CredentialUse`（CU）

- **CU1** `acquire` 按用途答不同的句柄。`process-env` 答 `ProcessCredentialHandle`：MCP 不读它，只把它交给 `ProcessLanding`，并在用完后释放。它怎样变成变量值，是 `CredentialUse` 与 `ProcessLanding` 两个实现方之间的约定；内存替身用一张内部表兑现这条约定。`http-authorization` 带连接目标，答 `HttpCredentialHandle`：它只对这份持有与这个连接目标有效，能为一个出站请求授权，能回报对端的拒绝，能释放。句柄以 `purpose` 字段区分。
- **CU2** 没有凭据时答 `missing`。
- **CU3** 答复不退回组织、官方或其他租户的凭据。
- **CU4** 句柄不是秘密值。句柄、它的序列化形式与它的检视文本都不含秘密值。
- **CU5** 凭据被拒时答 `rejected`。
- **CU6** 不可读时答 `unknown`，不答 `missing`。
- **CU7** 一份持有的凭据不答给另一份持有。
- **CU8** `acquire` reject 是违反契约，实现方当作 `unknown`。句柄的 `release()` reject 当作已释放，不重试，不再调用第二次。

<a id="port-landing"></a>

### `ProcessLanding`（PL）

进程句柄给出标准输入、标准输出、已遮盖秘密的标准错误、根进程退出的信号，以及 `stop()`。`start` 的环境由非秘密配值与按变量名给出的进程凭据句柄组成。

- **PL1** `stop()` 请求停止该进程及其全部后代，答实际确认的范围：`tree-confirmed`、`root-only` 或 `unconfirmed`。答 `tree-confirmed` 或 `root-only` 时，`exited` 会兑现。调用了 `stop()` 不证明进程已停。
- **PL2** 交出标准错误之前遮盖其中的秘密值。标准错误在进程停止后结束；`stop()` 答 `unconfirmed` 时，套件不读到底，这个用例不适用。
- **PL3** 设施不成立时答 `facility-missing`，不起进程。
- **PL4** 落点不成立时答 `landing-invalid`，不静默落到宿主。不能判定时答 `unknown`。
- **PL5** `stop()` 可以重复调用。再次调用不失败，答复不比第一次确认的范围小。
- **PL6** `start` reject 是违反契约，实现方当作 `unknown`。`stop()` reject 当作 `unconfirmed`。

<a id="port-store"></a>

### `CatalogStore`（CS）

- **CS1** 从未写入的键答 `absent`。
- **CS2** 写入整份记录，读出的是同一份完整记录，不留半份。
- **CS3** 从未写入的键只接受以 `absent` 为期望的写入。期望某个修订时答 `revision-conflict`。
- **CS4** 已有记录时，以 `absent` 为期望的写入答 `revision-conflict`，记录不变。
- **CS5** 期望较旧修订的写入答 `revision-conflict`，较新的记录不变。
- **CS6** 期望当前修订的写入成立。
- **CS7** 不同租户、不同对端账号、不同持有的键互不可见。
- **CS8** 不可用时读写都答 `unavailable`，不答 `absent`。
- **CS9** `read` 或 `write` reject 是违反契约。实现方当作 `unknown`。

<a id="port-transport"></a>

### `McpTransport` 与 `McpTransportFactory`（T）

传输对一个请求得到什么、交出什么，由两步决定：`classifyWireEvent` 把读到的线上事件归入 T8 的应答类别，T8 的决策表给出这一类的结论。T1–T7 定义两步用到的词与请求的组成，T5 是取消与关闭的时序，T9 是端口失败的处置。表外不另立结局规则。

- **T1** 传输失败按对端效果分四种：`not-sent`，请求没有对端效果；`no-answer`，请求已离开而没有应答，效果未知；`error-answer`，请求已离开，对端答 JSON-RPC 错误，带错误码、消息与 `data`（如有）；`answer-malformed`，请求已离开，应答读不懂，见 T7。`not-sent` 的原因有三个：`connection-unavailable`；`authorization-required`，带授权发现（R4）；`session-ended`，Streamable HTTP 旧修订上对端结束了会话。`call` 的失败只会是 `not-sent`；调用已发出后，结局经 `answer` 交出。「传输不再可用」指之后的每个请求答 `not-sent`（`connection-unavailable`）；T8 中没有写「传输不再可用」的行，传输照常可用。
- **T2** 应答的判据。这些判据由 `classifyWireEvent` 实现，传输用它归类：
  - 对本请求的 JSON-RPC 应答：一条 stdio 行或 2xx 正文里的一条消息，是 JSON 对象，`id` 等于本请求的 id，不带 `method`。它的信封合格指 `jsonrpc` 是 `"2.0"`，且恰好带 `result` 与 `error` 之一；信封不合格的应答算读不懂的错误对象。T8 里写「直接」的应答就是这样的应答。
  - stdio 上不是 JSON 的一行使流断开。是 JSON 但不是对本请求的应答的行：对端的请求按 T3 作答，对端的通知按 T3 处理，其余丢弃。
  - HTTP 错误状态的正文：是 JSON 对象、信封合格且带 `error` 时，按 `error` 归类，不核 `id`；其余正文记为「纯」。
  - 错误对象读得懂：是对象，带整数错误码（词形按 O4）与文本 `message`。
  - 对 `call`、`tasks/update` 与 `tasks/cancel`，任何 JSON-RPC 结果都读得懂；`call` 原样交出结果，不分类，分类由 `classifyOutcome` 完成。`call` 收到读不懂的错误对象时原样交出：信封不合格时交出整条消息。对其他请求：
  - `server/discover`：结果是对象，带 `supportedVersions`（列表，其中的文本项是版本）与 `capabilities`（对象）。读得懂时，其中有传输会说的现代版本才算「有共有的现代版本」。
  - `initialize`：结果是对象，`protocolVersion` 是 `LEGACY_PROTOCOL_VERSIONS` 里的一项，`capabilities` 是对象。
  - `tools/list`：结果是对象，带 `tools` 列表；`nextCursor` 缺省或是文本。交出的页：`tools` 是对端的列表，`nextCursor` 原样；`ttlMs` 是非负安全整数时原样交出（词形规则同 O2），否则省略。Streamable HTTP 上，`x-mcp-header` 声明不合法的工具（SEP-2243：声明只能出现在经 `properties` 链可静态到达的属性上，值是非空的 RFC 9110 token，属性类型是 `string`、`integer` 或 `boolean`，名字不区分大小写地唯一；`number` 类型的属性上的声明不合法，与 SEP-2243 Final 及 SDK 2.4.0 相同）由传输从 `tools` 剔除，列在 `withheld`，每项带工具名（不可信值）与原因 `header-invalid`。stdio 上不核 `x-mcp-header`。C1 不变：交出的页里一项非法，整份仍拒绝。
  - `tasks/get`：见 T6。
  - 错误对象读得懂：是对象，带整数错误码（词形按 O4）与文本消息。
- **T3** 请求的组成：
  - 每个请求与通知的 `params._meta` 带 `io.modelcontextprotocol/protocolVersion`、`io.modelcontextprotocol/clientCapabilities` 与 `io.modelcontextprotocol/clientInfo`。`_meta` 的版本是现代修订时，`clientCapabilities` 声明任务扩展 `extensions["io.modelcontextprotocol/tasks"]` 与 `elicitation.form`，不声明 `elicitation.url`、`sampling`、`roots`。版本是旧修订时，`clientCapabilities` 是空对象。现代修订是日期不早于 `FIRST_MODERN_PROTOCOL_VERSION`（`2026-07-28`）的修订。不设 `io.modelcontextprotocol/logLevel`，不发 `logging/setLevel`，不发 `subscriptions/listen`。
  - `_meta` 的协议版本：第一次 `server/discover` 带传输会说的最高现代版本；T8 D04 的再次探测带选出的版本；`initialize` 带它提出的旧版本。协商之后，每个请求与通知带协商出的版本。
  - Streamable HTTP 上每个请求与通知带 MCP 头：`MCP-Protocol-Version` 等于它 `_meta` 的协议版本；`Mcp-Method` 是方法名（[SEP-2243「Standard Headers」](https://modelcontextprotocol.io/seps/2243-http-standardization#standard-headers)，2026-07-28 修订）；`Mcp-Name` 只在 `tools/call`（工具名）与 `tasks/get`、`tasks/update`、`tasks/cancel`（`params.taskId`，SEP-2663「Streamable HTTP: Routing Headers」）上带。`initialize` 的应答带 `Mcp-Session-Id` 时，之后的每个请求与通知带同一个 `Mcp-Session-Id`；`initialize` 自己不带。stdio 上没有这些头。
  - 旧一路的 `initialize`：`protocolVersion` 是 `LEGACY_PROTOCOL_VERSIONS` 的第一项；`capabilities` 是空对象；带 `clientInfo`。读得懂之后发 `notifications/initialized`。
  - 再次探测的版本：`-32022` 的 `data.supported` 里，双方共有的现代版本中最高的一个。再次探测是 `discover-retry` 类请求。
  - 探测时限：stdio 上第一次与再次探测各有一个时限，取值由传输的配置给出，不来自打开材料。时限只在传输等待这个探测的应答时计时，应答先到时结束。时限到了以后迟到的应答丢弃。Streamable HTTP 上没有探测时限。
  - 现代一路读得懂的结果给出对端身份：协议版本取双方共有的现代版本中最高的一个；`serverInfo` 取 `_meta["io.modelcontextprotocol/serverInfo"]`（如有，不可信值）。旧一路的对端身份取自 `initialize` 的结果（`serverInfo` 如有，不可信值）。两条路的 `instructions` 都按打开材料里的 `instructionsByteLimit` 经 `boundInstructions` 处理（S3），带本连接的代际。
  - 「走旧一路」指发 `initialize`。T8 的结论写明旧一路也失败时 `discover` 报哪一个失败。S5、S7 的「`discover` 失败 → `lost`（`discover-failed`）」按 `discover` 最终报出的失败成立。
  - 对端发来的请求：`ping` 答空结果，其余请求一律答 JSON-RPC 错误 `-32601`。不分修订，也不分 `notifications/initialized` 之前或之后。
  - `call` 的 `_meta` 另带 `progressToken`，每请求唯一。对端的 `notifications/progress` 带着在途调用的 `progressToken` 时，传输把这条通知的 `params` 原样放进 `untrusted`，经该调用的 `observe` 交出（S6）；`progressToken` 对不上在途调用的通知丢弃。其他通知丢弃。
- **T4** T8 S05 的授权失败：失败是 `not-sent`（`authorization-required`），带授权发现（R4）。这个请求曾用凭据句柄授权时，传输先调用该句柄的 `reportRejection()` 恰好一次，再报这个失败。T8 S06 的 403 不调用 `reportRejection()`。
- **T5** 取消与关闭。这些事件与 T8 的应答事件落在同一个请求上时，先发生的那个决定结论，后来的丢弃：
  - `cancelRequest` 不证明对端已停止。stdio 上，以及 Streamable HTTP 旧修订上，它发 `notifications/cancelled`，带 `requestId` 与每请求 `_meta`，`answer` 继续等应答。Streamable HTTP 现代修订上，它中止该请求的应答流，不另发通知，`answer` 以 `no-answer`（`abandoned`）兑现。
  - `call` 的 `signal` 在调用前已触发时，`call` 答 `not-sent`（`connection-unavailable`）。在发出后触发时，传输不再等待：`answer` 以 `no-answer`（`abandoned`）兑现。取消由调用方经 `cancelRequest` 发出。
  - `close()` 只关闭传输，不停止进程。进程由进程句柄的持有者停止。stdio 的关闭次序：先关 stdin 写端，再取消 stdout 读取。关闭时在途的请求答 `no-answer`（`abandoned`），调用的 `answer` 同样兑现。关闭后的请求答 `not-sent`（`connection-unavailable`）。`close()` 可以重复调用。
- **T6** 任务操作：
  - `getTask` 与 `getTaskResult` 都发 `tasks/get`。结果读得懂：是对象，`taskId` 是非空文本，`status` 是 `TaskStatus` 的五个值之一；`input_required` 带 `inputRequests` 对象；`completed` 带 `result`；`failed` 带 `error` 对象（形状不核，原样交出）。任务形状按 SEP-2663 2026-07-28：结果在顶层带 `taskId`、`status`；`tasks/update` 的参数是 `taskId` 与 `inputResponses`；`tasks/cancel` 的参数是 `taskId`；没有 `tasks/list`。
  - `getTask` 交出 `status`、`input_required` 时的 `inputRequests`（不可信值），以及提示 `pollIntervalMs`、`ttlMs`、`statusMessage`（各自如有，规则同 O2）。它不交出任务的结果。
  - `getTaskResult`：`completed` 的 `result` 与 `failed` 的 `error` 作为 `finished` 的原样应答交出；`cancelled` 答 `cancelled`；其他状态答 `not-finished`。
  - `updateTask` 对端确认后答 `accepted`，`cancelTask` 对端确认后答 `requested`。两者都只是确认，终态经 `getTask` 得知。
  - 服务把 `no-answer` 答成 `effect-unknown`（S2）。
- **T7** `answer-malformed` 的 `what`，每个值只在 T8 的对应行出现：
  - `discover-shape`：D03、D05、I02。
  - `tools-missing`：L02。`cursor-invalid`：L03。
  - `status-unknown`：G02，结果不是对象、`taskId` 缺失或不是非空文本，或 `status` 不在五个值里。`input-requests-missing`：G03。`result-missing`：G04。`error-missing`：G05，`failed` 的 `error` 缺失或不是对象，传输不编造错误。
  - `error-shape`：D11、I04、O03，JSON-RPC 错误对象读不懂（T2）。`call` 收到的错误对象不在这里判断，原样交出（C02）。

<a id="t8"></a>

- **T8** 决策表。输入域是「材料 × 请求类别 × 应答类别」的全部组合，每个组合恰好落在下表一行，每行一个结论。
  - 材料：stdio；HTTP（Streamable HTTP）。
  - 请求类别：`discover`（连接的第一次 `server/discover`）；`discover-retry`（D04 之后的再次探测）；`initialize`；`tools/list`；`tools/call`；`tasks/get`（`getTask` 与 `getTaskResult`）；`tasks/update`；`tasks/cancel`；通知（客户端发出的 `notifications/initialized`、`notifications/cancelled`）。
  - 应答类别是根导出的 `classifyWireEvent(event, context)` 的值域：它是纯全函数，把一个线上事件（`WireEvent`）对一个请求（`WireContext`）归入下列一类，或答 `other`（stdio 上与本请求无关的行）、`waiting`（2xx 的流还开着而没有本请求的应答，还不是任何一类）。各类：
    - 请求离开之前失败：HTTP 上连接失败（DNS、连接被拒、TLS 握手失败）；stdio 上写请求时管道已断或进程已退出。
    - JSON-RPC 结果，按 T2、T6 分为读得懂与各种读不懂。JSON-RPC 错误，按码分为 `-32020`、`-32021`、`-32022`（按 `data.supported` 再分三种，见 D04–D06）、`-32601`、`-32602`、其他码，以及读不懂的错误对象（含信封不合格的应答）。
    - 流断开：stdio 上 stdout 结束（见进程退出）或出现非 JSON 行；HTTP 上请求开始发出之后、收到应答头之前失败（连接被重置、超时），以及 2xx 的应答流中断。
    - 没有应答：传输停止等待时，本请求什么也没收到（stdio 的探测时限到、`close()`、`signal`）。
    - 进程退出（只在 stdio）：根进程退出。stdout 结束与根进程退出都发生时，退出不晚于 stdout 结束之后 `PROCESS_EXIT_WINDOW_MS`（100 毫秒）的记为进程退出，否则记为流断开。
    - HTTP 上另有：401；403 带 `error="insufficient_scope"`；其他 403；2xx 而应答体已结束、没有本请求的应答；404 而请求带着旧会话的 `Mcp-Session-Id`；以及 400、404、405、406、415、429、「4xx」（其余 3xx 与 4xx）、「5xx」（500 及以上）各自按正文再分（正文按 T2 归为哪一码的错误、读不懂的错误对象，或「纯」）。传输不跟随重定向；3xx 归入「4xx」。1xx 观察不到，不在域里。
    - 通知没有 JSON-RPC 应答。
  - 记号：「直接」指 T2 的对本请求的应答；`E(码)` 指该码的 JSON-RPC 错误；「4xx」指 400、404、405、406、415、429 与其余 3xx、4xx，不含 401、403 与带旧会话的 404；「5xx」指 500 及以上；「4xx+码」「5xx+码」指正文是该码的 JSON-RPC 错误；「+纯」指正文按 T2 是「纯」。「旧一路，报旧」指走旧一路，旧一路也失败时报旧一路的失败；「旧一路，报本行」指旧一路也失败时报本行写的失败。
  - 走旧一路时，`initialize` 按 I 行与 S、X 行得出结论；那一行写的 `reportRejection()` 与「传输不再可用」照样生效，以那一行为准。
  - D15、O05 再发的请求保持原来的请求类别，它的应答重新归类；再发的请求不再适用 D15、O05，再断开时是 `no-answer`（`stream-broken`）。

| 行  | 材料  | 请求                                         | 应答                                                                           | 结论                                                                                   |
| --- | ----- | -------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| D01 | 两者  | `discover`、`discover-retry`                 | 结果读得懂，有共有的现代版本                                                   | 对端身份（T3）                                                                         |
| D02 | 两者  | `discover`、`discover-retry`                 | 结果读得懂，没有共有的现代版本                                                 | 旧一路，报旧                                                                           |
| D03 | 两者  | `discover`、`discover-retry`                 | 结果读不懂                                                                     | 旧一路，报本行：`answer-malformed`（`discover-shape`）                                 |
| D04 | 两者  | `discover`                                   | `E(-32022)`，`supported` 有双方共有的现代版本；直接或 4xx+码                   | 以 T3 选出的版本再探测一次（`discover-retry`）                                         |
| D05 | 两者  | `discover`                                   | `E(-32022)`，`supported` 有现代版本而没有共有的；直接或 4xx+码                 | `answer-malformed`（`discover-shape`）                                                 |
| D06 | 两者  | `discover`                                   | `E(-32022)`，`supported` 缺失、不是非空文本列表，或没有现代版本；直接或 4xx+码 | 旧一路，报旧                                                                           |
| D07 | 两者  | `discover-retry`                             | 任一种 `E(-32022)`；直接或 4xx+码                                              | `error-answer`（原样）                                                                 |
| D08 | 两者  | `discover`、`discover-retry`                 | `E(-32020)`、`E(-32021)`；直接或 4xx+码                                        | `error-answer`（原样）                                                                 |
| D09 | 两者  | `discover`、`discover-retry`                 | `E(-32601)`，直接                                                              | 旧一路，报旧                                                                           |
| D10 | 两者  | `discover`、`discover-retry`                 | `E(-32602)`、`E(其他码)`，直接                                                 | 旧一路，报本行：`error-answer`（原样）                                                 |
| D11 | 两者  | `discover`、`discover-retry`                 | 读不懂的错误对象，直接                                                         | 旧一路，报本行：`answer-malformed`（`error-shape`）                                    |
| D12 | HTTP  | `discover`、`discover-retry`                 | 4xx+`-32601`、4xx+`-32602`、4xx+其他码、4xx+读不懂、4xx+纯                     | 旧一路，报旧                                                                           |
| D13 | stdio | `discover`、`discover-retry`                 | 没有应答（探测时限到）                                                         | 旧一路，报旧                                                                           |
| D14 | HTTP  | `discover`、`discover-retry`                 | 没有应答                                                                       | 等到 `close()`：`no-answer`（`abandoned`）                                             |
| D15 | HTTP  | `discover`、`discover-retry`                 | 流断开；2xx 而没有应答                                                         | 以新的请求号再发一次；再发也如此时 `no-answer`（`stream-broken`）                      |
| D16 | HTTP  | `discover`、`discover-retry`                 | 5xx，任何正文                                                                  | `no-answer`（`stream-broken`），不再发                                                 |
| I01 | 两者  | `initialize`                                 | 结果读得懂                                                                     | 对端身份（T3），然后发 `notifications/initialized`                                     |
| I02 | 两者  | `initialize`                                 | 结果读不懂                                                                     | `answer-malformed`（`discover-shape`）                                                 |
| I03 | 两者  | `initialize`                                 | 任一码的 `E`；直接或 4xx+码、5xx+码                                            | `error-answer`（原样）                                                                 |
| I04 | 两者  | `initialize`                                 | 读不懂的错误对象；直接或在 4xx、5xx 正文                                       | `answer-malformed`（`error-shape`）                                                    |
| I05 | 两者  | `initialize`                                 | 没有应答                                                                       | 等到 `close()`：`no-answer`（`abandoned`）                                             |
| I06 | HTTP  | `initialize`                                 | 流断开；2xx 而没有应答；5xx+纯                                                 | `no-answer`（`stream-broken`），不再发                                                 |
| I07 | HTTP  | `initialize`                                 | 4xx+纯                                                                         | `not-sent`（`connection-unavailable`）                                                 |
| L01 | 两者  | `tools/list`                                 | 结果读得懂                                                                     | 页（T2）                                                                               |
| L02 | 两者  | `tools/list`                                 | 结果不是对象，或没有 `tools` 列表                                              | `answer-malformed`（`tools-missing`）                                                  |
| L03 | 两者  | `tools/list`                                 | 有 `tools` 列表，`nextCursor` 存在而不是文本                                   | `answer-malformed`（`cursor-invalid`）                                                 |
| G01 | 两者  | `tasks/get`                                  | 结果读得懂（T6）                                                               | 任务报告或任务答复（T6）                                                               |
| G02 | 两者  | `tasks/get`                                  | 结果不是对象，或 `status` 不在五个值里                                         | `answer-malformed`（`status-unknown`）                                                 |
| G03 | 两者  | `tasks/get`                                  | `input_required` 而没有 `inputRequests` 对象                                   | `answer-malformed`（`input-requests-missing`）                                         |
| G04 | 两者  | `tasks/get`                                  | `completed` 而没有 `result`                                                    | `answer-malformed`（`result-missing`）                                                 |
| G05 | 两者  | `tasks/get`                                  | `failed` 而没有 `error` 对象                                                   | `answer-malformed`（`error-missing`）                                                  |
| G06 | 两者  | `tasks/get`                                  | `E(-32602)`；直接或 4xx+码、5xx+码                                             | `expired`                                                                              |
| W01 | 两者  | `tasks/update`、`tasks/cancel`               | 任何结果                                                                       | `accepted`、`requested`                                                                |
| O01 | 两者  | `tools/list`、`tasks/update`、`tasks/cancel` | 任一码的 `E`；直接或 4xx+码、5xx+码                                            | `error-answer`（原样）                                                                 |
| O02 | 两者  | `tasks/get`                                  | `-32602` 以外任一码的 `E`；直接或 4xx+码、5xx+码                               | `error-answer`（原样）                                                                 |
| O03 | 两者  | `tools/list`、三个任务请求                   | 读不懂的错误对象；直接或在 4xx、5xx 正文                                       | `answer-malformed`（`error-shape`）                                                    |
| O04 | 两者  | `tools/list`、三个任务请求                   | 没有应答                                                                       | 等到 `close()`：`no-answer`（`abandoned`）                                             |
| O05 | HTTP  | `tools/list`、`tasks/get`                    | 流断开；2xx 而没有应答                                                         | 以新的请求号再发一次；再发也如此时 `no-answer`（`stream-broken`）                      |
| O06 | HTTP  | `tasks/update`、`tasks/cancel`               | 流断开；2xx 而没有应答                                                         | `no-answer`（`stream-broken`），不再发                                                 |
| O07 | HTTP  | `tools/list`、三个任务请求                   | 5xx+纯                                                                         | `no-answer`（`stream-broken`），不再发                                                 |
| O08 | HTTP  | `tools/list`、三个任务请求                   | 4xx+纯                                                                         | `not-sent`（`connection-unavailable`）                                                 |
| C01 | 两者  | `tools/call`                                 | 任何结果                                                                       | 已发出；`answer` 是原样结果                                                            |
| C02 | 两者  | `tools/call`                                 | 任何错误对象（含读不懂的）；直接或在 4xx、5xx 正文                             | 已发出；`answer` 是原样错误                                                            |
| C03 | 两者  | `tools/call`                                 | 没有应答                                                                       | 已发出；`signal` 触发或 `close()` 时 `answer` 是 `no-answer`（`abandoned`）            |
| C04 | HTTP  | `tools/call`                                 | 流断开；2xx 而没有应答；5xx+纯                                                 | 已发出；`answer` 是 `no-answer`（`stream-broken`），不再发                             |
| C05 | HTTP  | `tools/call`                                 | 4xx+纯                                                                         | `call` 答 `not-sent`（`connection-unavailable`）                                       |
| S01 | stdio | 除 `tools/call` 与通知外的各类               | 流断开                                                                         | `no-answer`（`stream-broken`）；传输不再可用                                           |
| S02 | stdio | 除 `tools/call` 与通知外的各类               | 进程退出                                                                       | `no-answer`（`process-exited`）；传输不再可用                                          |
| S03 | stdio | `tools/call`                                 | 流断开                                                                         | 已发出；`answer` 是 `no-answer`（`stream-broken`）；传输不再可用                       |
| S04 | stdio | `tools/call`                                 | 进程退出                                                                       | 已发出；`answer` 是 `no-answer`（`process-exited`）；传输不再可用                      |
| S05 | HTTP  | 除通知外的各类                               | 401；403 带 `error="insufficient_scope"`                                       | `not-sent`（`authorization-required`），带授权发现；`reportRejection()` 恰好一次（T4） |
| S06 | HTTP  | 除通知外的各类                               | 其他 403                                                                       | `not-sent`（`connection-unavailable`）；不调用 `reportRejection()`                     |
| S07 | HTTP  | `tools/list`、`tools/call`、三个任务请求     | 404，请求带着旧会话的 `Mcp-Session-Id`（任何正文）                             | `not-sent`（`session-ended`）；传输不再可用                                            |
| X01 | HTTP  | 除通知外的各类                               | 请求离开之前失败                                                               | `not-sent`（`connection-unavailable`）                                                 |
| X02 | stdio | 除通知外的各类                               | 请求离开之前失败                                                               | `not-sent`（`connection-unavailable`）；传输不再可用                                   |
| N01 | 两者  | 通知                                         | 任何应答                                                                       | 没有结局；发出通知的操作照常继续                                                       |

<a id="t8-end"></a>

- **T9** 端口失败。传输的方法应以 `Outcome` 答复；以 reject 失败或同步抛出都违反契约，两者按同一规则处置：
  - 服务的处置：`open` 失败当作 `not-sent`（`connection-unavailable`）；`discover`、`listActions`、任务操作、`call` 与 `SentCall.answer` 失败当作该请求效果未知，`no-answer`（`abandoned`）；`cancelRequest` 失败忽略；`close` 失败当作已关闭，继续拆除，见[端口 reject 的处置](#ownership-rejects)。
  - 传输对凭据句柄的处置：`authorize` 失败时请求不发出，答 `not-sent`（`connection-unavailable`）；`reportRejection` 失败时忽略，仍报 `authorization-required`。

<a id="sdk-2-4-0"></a>

### 与官方 TypeScript SDK 2.4.0 的对照

T3 与 T8 引用的 SDK 行为，按仓库采用的 `@modelcontextprotocol/client` 与 `@modelcontextprotocol/core` 2.4.0 的发布产物逐处核对。路径相对于包根。

| SDK 行为                    | 位置（2.4.0）                                                                                                  | 本页                                | 关系                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 现代修订的下界与判断        | client `dist/src-CeKsbNLO.mjs:474` `FIRST_MODERN_PROTOCOL_VERSION`，`:483` `isModernProtocolVersion`           | T3、`FIRST_MODERN_PROTOCOL_VERSION` | 相同                                                                                                                                                          |
| 旧修订列表                  | core `dist/schemas-DscsoNZN.mjs:6` `SUPPORTED_PROTOCOL_VERSIONS`                                               | `LEGACY_PROTOCOL_VERSIONS`          | 相同                                                                                                                                                          |
| 探测结果的分类              | client `dist/public-CvV4ZHkX.mjs:2059` `classifyResult`                                                        | D01–D03                             | 回退的决定相同；读不懂时 SDK 不区分报哪一路，本页报 `discover-shape`                                                                                          |
| `-32022` 与其他错误码的分类 | client `dist/public-CvV4ZHkX.mjs:2078` `classifyRpcError`，`:2143` `parseSupportedList`                        | D04–D10                             | 相同，`-32020`、`-32021` 除外：SDK 判旧对端，本页 D08 答 `error-answer`                                                                                       |
| HTTP 状态的分类             | client `dist/public-CvV4ZHkX.mjs:2106` `classifyHttpError`，`:2154` `parseJsonRpcErrorBody`                    | D12、D16、S05、S06                  | 状态的分法相同。正文的读法不同：SDK 不要求 `jsonrpc`，码是数就按码分类，缺 `message` 也按码分类；本页按 T2 的信封与错误对象判据，不合格的正文是「纯」或读不懂 |
| 探测时连接关闭、超时        | client `dist/public-CvV4ZHkX.mjs:2048`、`:2051`（`classifyProbeOutcome`，`:2034`）                             | S01、S02、D13、D15                  | stdio 超时相同（D13）。stdio 连接关闭：SDK 为旧一路另起子进程并回退，本页 S01、S02 不回退。HTTP 应答流断开：SDK 失败，本页按 D15 再发一次；两者都不回退       |
| 探测时的网络错误            | client `dist/public-CvV4ZHkX.mjs:2130` `classifyNetworkError`                                                  | X01、D15                            | 都不回退。SDK 不区分请求离开前后；本页离开前失败是 X01，离开后失败是流断开（D15）                                                                             |
| 旧一路的版本检查            | client `dist/public-CvV4ZHkX.mjs:2975` `Client._legacyHandshake`（`:2989`）                                    | I02                                 | 相同                                                                                                                                                          |
| 现代请求的 400 正文当作应答 | client `dist/index.mjs:1767`（`StreamableHTTPClientTransport._send`），`:1467` `_isModernEnvelopedRequest`     | T2、I03、O01、O02、G06、C02         | 不同：SDK 只读 400 的正文，且要求 `id` 相同；本页读 4xx 与 5xx 的正文，不核 `id`（T2）                                                                        |
| MCP 请求头                  | client `dist/index.mjs:1452` `_applyBodyDerivedHeaders`；`dist/src-CeKsbNLO.mjs:4710` `MCP_NAME_HEADER_SOURCE` | T3                                  | `Mcp-Name` 的来源相同。SDK 只在带 `_meta` 版本的请求上发这些头，通知不发；本页每个请求与通知都发（T3）                                                        |
| 会话头                      | client `dist/index.mjs:1440`、`:1703`、`:1725`                                                                 | T3、S07                             | 回带相同。SDK 不把 404 读成会话失效                                                                                                                           |

<a id="protocol-deviations"></a>

### 与协议的偏离

| 协议要求                                                                                 | 本页的做法                                                                                                                              | 理由                   |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Streamable HTTP 应答流断开时，客户端必须用新的请求号重发（2026-07-28 changelog 第 9 项） | 只对 `server/discover`、`tools/list`、`tasks/get` 重发一次（D15、O05）；`tools/call`、`tasks/update`、`tasks/cancel` 不重发（C04、O06） | 见[理由](#t-rationale) |

<a id="t-rationale"></a>

### 理由

本节解释 T 节的选择，不是条款。

- 只重发读类请求：调用与任务写不是幂等的。效果未知时，本组不代调用方重发，由调用方决定（O6、S2）。
- `-32020`、`-32021` 不回退：对端已按现代修订作答。回退会掩盖本组声明的缺项。
- stdio 上探测时连接关闭不回退：旧一路需要一个新的进程，而进程归进程句柄的持有者，传输不能另起。
- 4xx+纯答 `not-sent`：对端在处理之前拒绝了请求。5xx+纯答 `no-answer`：对端可能已部分处理，效果未知；读类也不重发，因为对端已经给出了 HTTP 答复。
- 会话失效答 `not-sent`（`session-ended`）：对端不认识这个会话，请求没有被处理。服务据此报 `lost`（`session-ended`），见 S7。
- 旧一路不声明能力：旧修订的能力会让对端向客户端发请求，而本组拒绝这类请求（T3），声明了也不会兑现。
- 旧修订 HTTP 上的取消发通知：2025 修订里断开应答流不是取消。
- `closeAll` 之后任务操作答 `effect-unknown`（`no-connection`）：任务操作的失败类型里没有「未发出」。
- 进程退出的时间窗：进程崩溃时 stdout 结束与进程退出几乎同时发生，取能如实报出原因的一方；100 毫秒覆盖常见的调度延迟，又短于人能察觉的等待。
- 请求离开之前的失败答 `not-sent`：请求没有到达对端。stdio 上写不进去说明管道已断，传输不再可用；HTTP 上下一个请求可以再连。
- 3xx 归入「4xx」：传输不跟随重定向，重定向的目标不在本组核过的连接目标之内。
- `cancelTask` 复用连接时不核：取消只减少效果。

<a id="failure-codes"></a>

### 失败码索引

每个集合的成员以类型为准。本表只指出类型与给出条件的条款。

| 阶段                   | 类型                                                                                                                                                                                               | 条款               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 正文                   | `EndpointBodyRejection`；类别端口另有资产规则的 `incomplete-reference`                                                                                                                             | E2、E5             |
| 对端账号               | `peerAccountOf` 的 `credential-missing`                                                                                                                                                            | K1                 |
| 识别、资格与配置       | `Refusal`、`ConfigItem`                                                                                                                                                                            | R1、S1、S4         |
| 连接条件               | `ConnectionFailure`                                                                                                                                                                                | R6                 |
| 读口、状态口与任务操作 | `OperationFailure`、`ReadFailure`、`EffectUnknown`、`ErrorAnswer`、`AnswerMalformed`；`peer` 另有 `not-connected`                                                                                  | R7、S2、S8         |
| 调用发起               | `NotSentReason`                                                                                                                                                                                    | R2                 |
| 调用控制               | `CancelAnswer`                                                                                                                                                                                     | S2                 |
| 发现与采用             | `ListingDefect`、`MergeRefusal`、`KeptReason`；修订耗尽的 `RangeError`；伪造清单的 `TypeError`                                                                                                     | C1、C4、C5、C7、S5 |
| 已发出调用             | `ProtocolFault`、`NoAnswerCause`                                                                                                                                                                   | O4–O6              |
| 内容                   | `ContentDefect`                                                                                                                                                                                    | D4                 |
| 已知动作               | `UnavailableReason`                                                                                                                                                                                | R3                 |
| 连接状态与释放         | `DegradedReason`、`LostReason`、`ReleaseReport`                                                                                                                                                    | S7、S8             |
| 任务                   | `TaskReport` 与 `expired`；`taskResult` 的 `not-finished`、`cancelled`                                                                                                                             | S2、T6             |
| 截断与配置             | `boundInstructions` 与 `createMcp` 的 `RangeError`                                                                                                                                                 | S3                 |
| 端口                   | `AdoptionView` 的 `unknown`；`EligibilityVerdict`；`CredentialFailure`；`ProcessLanding` 的 `landing-invalid`、`facility-missing`、`unknown`；`CatalogStore` 的 `unavailable`、`revision-conflict` | AV、UE、CU、PL、CS |
| 传输                   | `TransportFailure`、`AnswerMalformed`、`TaskAnswer`；页上被剔除工具的 `WithheldReason`                                                                                                             | T1、T2、T7、T8     |

### 生命周期与所有权

- 本成员的函数不持有资源，不发起外部操作。
- `completeListing` 的登记是进程内凭证，见 C4。
- `./testing` 的内存替身不耐久，只用于自测，不能装配进产品。内存 `CatalogStore` 替身不是 `@omne-harness/mcp` 的内存实现。脚本化传输不说协议，按脚本答复；它不是 `@omne-harness/mcp-host-local` 的传输。

<a id="composition"></a>

## 组合与验证

| 条款               | 验证                                                                                                                                                                                                                                                                                                                                                                          | 命令                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 入口与依赖         | `tests/public-entry.spec.ts` 核对三个入口的运行时导出与导入关系；`tests/provider-types.spec-d.ts` 核对 `./provider` 的类型导出                                                                                                                                                                                                                                                | `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract` |
| 封闭集合           | `tests/closed-sets.spec-d.ts` 把代码列表钉在类型上；`tests/spec-closed-sets.spec.ts` 核对本页写到每一项                                                                                                                                                                                                                                                                       | 同上                                                                      |
| V1–V3              | `tests/values.spec.ts`                                                                                                                                                                                                                                                                                                                                                        | 同上                                                                      |
| V4                 | 类型：每个不可信字段的类型是 `Untrusted<T>`；`tests/catalog.spec.ts`、`tests/content.spec.ts`、`classifyOutcomeCases` 核对 annotations 与 `inputRequests` 包在 `untrusted` 里                                                                                                                                                                                                 | 同上                                                                      |
| R1–R7              | 类型与 `tests/closed-sets.spec-d.ts`、`tests/spec-closed-sets.spec.ts`；R2 的发起条件、R6 与 R7 的给出条件由服务与传输实现验证，见「未覆盖」                                                                                                                                                                                                                                  | 同上                                                                      |
| S3 的截断          | `tests/instructions.spec.ts`                                                                                                                                                                                                                                                                                                                                                  | 同上                                                                      |
| E1–E6              | `tests/endpoint.spec.ts`：每个拒绝原因一个反例，schema 与解析规则一致                                                                                                                                                                                                                                                                                                         | 同上                                                                      |
| K1–K3              | `tests/keys.spec.ts`                                                                                                                                                                                                                                                                                                                                                          | 同上                                                                      |
| C1–C8              | `tests/catalog.spec.ts` 的性质测试与带种子的随机序列；`tests/conformance.spec.ts` 跑 `mergeListingCases`                                                                                                                                                                                                                                                                      | 同上                                                                      |
| O1–O6              | `tests/classify.spec.ts` 跑 `classifyOutcomeCases` 并核对覆盖                                                                                                                                                                                                                                                                                                                 | 同上                                                                      |
| D1–D5              | `tests/content.spec.ts`                                                                                                                                                                                                                                                                                                                                                       | 同上                                                                      |
| AV、UE、CU、PL、CS | `tests/conformance.spec.ts` 让五个套件跑内存替身，并用违约替身证明套件会变红                                                                                                                                                                                                                                                                                                  | 同上                                                                      |
| T1–T9              | `mcpTransportConformance()`：T8 的每一行生成一个用例（用例名带行号），用例跑这一行在夹具材料上的每个输入组合；T1–T6 与 T9 的组成、时序与端口失败另有手写用例。`tests/transport-conformance.spec.ts` 让 `createScriptedTransportFactory` 跑全部用例，用违约传输证明套件会变红，并核对：输入域的每个组合恰好落在一行；每行至少一个用例；本页 T8 的行号与 `TRANSPORT_TABLE` 一致 | 同上                                                                      |

端口的实现方这样使用套件：从 `./testing` 取 `mcp<端口>Conformance()`，为每个用例新建一份夹具，用 `runConformanceCase` 在自己的测试框架里逐个运行。传输的夹具是 `TransportFixture`：它声明能打开的材料种类与传输在 `server/discover` 上会说的现代协议版本。`protocolVersions` 只列现代修订，从高到低排列：套件取第一项为最高版本，取最后一项为最低版本；旧修订由 `LEGACY_PROTOCOL_VERSIONS` 决定，列了旧修订时用例失败。夹具为每个用例按 `PeerScript` 给出一个脚本化对端、到达它的传输工厂与打开材料。脚本只描述对端在 JSON-RPC 层怎样答，不描述 SDK。用例也可以给出一个函数，夹具知道 Streamable HTTP 材料的目标之后调用它写出脚本：T4 的元数据地址与元数据的 `resource` 取自这个目标。对端记录的 `received()` 是异步的：夹具等客户端在调用之前发出的一切都记下之后才答复，例如中止的应答流与客户端对对端请求的答复。T5 关闭次序用例把材料的进程句柄换成一个观察包装：读写原样转给原进程，只另记关闭 stdin、取消 stdout 与停止进程；原进程自己结束 stdout 时，包装仍让 stdout 等到传输取消它。T8 生成的用例跑该行在夹具材料上的每个输入组合（两种材料共 989 个），每个组合跑每个样本应答，结论是「走旧一路」的组合另跑一次旧一路失败的情形；真实夹具每跑一次就要准备一个对端。真实服务端夹具归 `@omne-harness/mcp-host-local`。结论有三种：

- 通过。
- 失败：用例抛出 `node:assert` 的 `AssertionError` 或其他错误，`runConformanceCase` 把它抛给调用方。
- 不适用：夹具缺少用例需要的句柄，`runConformanceCase` 答 `not-applicable`。不适用既不是通过也不是失败，调用方单独计数。本成员对内存替身的测试把不适用当作失败，因为替身提供全部句柄。

未覆盖：

- 服务条款 S1–S9 没有实现，本成员不能验证它们。它们由服务实现的测试验证。
- 传输条款的覆盖，本成员只在脚本化传输上运行套件。真实服务端夹具、真实 stdio 进程与真实 Streamable HTTP 在 `@omne-harness/mcp-host-local`：
  - T8 的每一行由生成的用例覆盖，用例跑这一行在夹具材料上的每个输入组合。T1 的四种失败与 T7 的 `what` 都经 T8 的行核对。
  - 表外条款有手写用例的部分：T2 的页（`nextCursor`、`ttlMs`、`withheld`、stdio 不核 `x-mcp-header`）；T3 的 `_meta`、请求头、会话头、协商版本、旧一路 `initialize` 的内容、两条路的 `instructions` 截断、对端请求、`progressToken` 与 `observe`；T4 与 R4 的授权发现；T5 的三种取消、关闭次序、发出后的 `signal`、关闭时在途的调用、关闭后的请求、授权中被关闭的调用；T6 的任务报告、任务答复、提示与请求参数；T9 中凭据句柄的两种失败。
  - 表外条款没有用例的部分：T3 的探测时限取自传输配置、时限到了以后迟到的应答丢弃；T5 的 `signal` 在调用前已触发时答 `not-sent`；T9 中服务对传输方法失败的处置，它由服务实现的测试验证。
- 真实对端、真实凭据、真实进程落点、耐久存储的行为都没有证据。替身通过不等于真实组合通过。

<a id="open-items"></a>

### 未封闭项

- 组页第 601 行：资产的 `deriveDeclarations(body, context)` 拿不到 MCP 动作清单，逐动作权限项不能经类别端口派生。本成员只提供 `actionPermissionItems`。拥有者：资产 SPEC 的拥有者与本成员的维护者。
- C1 对 `inputSchema` 的容错：本组不比协议与官方 SDK 更严，「`inputSchema` 必须是 `type` 为 `"object"` 的对象」不作为 C1 的拒绝条件；不符的工具怎样处置还没有决定。拥有者：`@omne-harness/mcp` 的调用口实现。

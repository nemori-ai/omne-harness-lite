# @omne-harness/mcp-contract 行为规格

状态：候选契约，尚未取得技术接受。本页封闭 [MCP 能力组工程设计](../docs/architecture.md)列给本成员的未定项。公开类型是形状的唯一来源，本页只写类型不能表达的行为：每一项在什么条件下出现，以及必须的结果。本成员只有纯函数、类型、类别端口与测试设施。服务实现、`CatalogStore` 的生产实现、传输实现和真实组合都不在本成员。

## 范围与依据

本成员是 MCP 组的纯契约成员。它用 MCP 自己的词对外提供值、结局、失败、五个应用服务的接口、纯函数和接入点正文的类别端口。它不点名任何调用方，不依赖 Cordis，不依赖任何 MCP SDK。官方 SDK 的类型不进入本成员。

| 依据                                                                                                 | 修订                         | 本页采用的范围                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| [组工程设计](../docs/architecture.md)                                                                | `21175c9f9`                  | 边界、协议基线、模型、值对象、MCP 连接、动作清单、设置声明、端口、应用服务、调用结果、内容交付、失败种类 |
| 领域设计裁定（2026-11-03）                                                                           | 见[领域设计裁定](#decisions) | 本页每一条与组页不同或组页未定的决定                                                                     |
| [资产成员 SPEC](../../assets/assets/SPEC.md#accepted-public-types)                                   | `21175c9f9`                  | `BodyContract` 的字段与判断规则                                                                          |
| [MCP 协议修订 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28)                  | 2026-07-28                   | 结果形状、`resultType`、多轮输入、内容类型、JSON-RPC 错误码、授权                                        |
| [MCP 任务扩展](https://modelcontextprotocol.github.io/ext-tasks/specification/2026-07-28/tasks.html) | 2026-07-28                   | 任务句柄、`tasks/get`、`tasks/update`、`tasks/cancel`                                                    |

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

<a id="entries"></a>

### 三个入口

| 入口         | 给谁                   | 内容                                                                                                                                                                |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`          | 调用方与实现方         | 值、品牌守卫、结局、失败、五个服务接口与结果值、纯函数、`mcpEndpointBodyContract()`                                                                                 |
| `./provider` | 端口的实现方           | 五个需求端口、`McpTransport`、`McpTransportFactory` 及其答复类型。只有类型，不重复根入口已导出的类型                                                                |
| `./testing`  | 端口的实现方，用于自测 | 五个需求端口的符合性套件、各自的内存替身、`classifyOutcomeCases`、`mergeListingCases`，以及 `runConformanceCase`、`isNotApplicable`、`NotApplicable`、`CaseVerdict` |

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

- **V1** 每个品牌只由公开根里的一个守卫授予，例如 `isEndpointName`、`isMillis`、`isConnectionTarget`。守卫不修补输入。持有、采用修订、凭据配值、动作名、关联键、请求状态、任务号、协议版本这八个品牌只要求非空文本：它们按名字区分含义不同的值，不检查内容。这些值原样保存，只比较相等。
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
- **C2** 完整清单带上调用方给出的 `basedOn`：取得前经 `CatalogStore.read` 读到的修订，从未写入时是 `absent`。新鲜度的取得时刻由调用方给出，`ttlMs` 取各页给出值中的最小值，`changedNotified` 为假。清单、它的动作列表与每个动作都冻结。
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
  - `task`：`task`，带 `taskId` 与发出代际。
- **O3** 输出校验结论只有三种：动作没有声明 `outputSchema` 时是 `no-schema`，不调用校验函数。声明了 `outputSchema` 但结果没有结构化内容时是 `violates`，原因是 `structured-content-missing`，不调用校验函数。其余情形调用一次校验函数，用它的答复。`toolError` 不调用校验函数。原因文本 `structured-content-missing` 是契约值；校验函数给出的其他原因文本不是契约。
- **O4** 对端答 JSON-RPC 错误时是 `protocolError`，`fault` 是 `peer-error`，带整数错误码、消息与 `data`（如有）。错误码的词形必须是整数（`^-?\d+$`），带小数点或指数的词形不算整数。错误码不作翻译，所有码都按同一规则交出。协议错误不证明调用没有效果。
- **O5** 读不懂的应答也是 `protocolError`，不猜测成功：
  - `result-type-unknown`：`resultType` 是未知的文本，带原值。
  - `result-malformed`：结果不是对象，`resultType` 不是文本，缺 `content` 或 `content` 不是列表，`isError` 不是布尔值，多轮结果两项都没有、`inputRequests` 不是对象或 `requestState` 不是非空文本，任务句柄的 `taskId` 缺失或不是非空文本。
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
- **R3** `UnavailableReason` 写进已知动作的可用性：`no-longer-offered` 由 `mergeListing` 给出；`connection-unavailable`、`authorization-required`、`credential-unavailable`、`landing-unavailable` 由 `markUnavailable` 按连接条件给出。
- **R4** 授权发现有四个字段：
  - `resourceMetadataUrl`：受保护资源元数据的地址。取 `WWW-Authenticate` 头的 `resource_metadata`；没有时取连接目标的 well-known 地址（`/.well-known/oauth-protected-resource`）。两处都取不到元数据时仍报这个地址，`metadata` 是 `unavailable`。
  - `metadata`：元数据是否取到，`fetched` 或 `unavailable`。`resourceMetadata` 只在取到时出现，是不可信值。
  - `issuers`：元数据的 `authorization_servers`。元数据没取到时为空。
  - `scopes`：对端 `WWW-Authenticate` 头的 `scope`。没有时取元数据的 `scopes_supported`。都没有时为空。

  MCP 不做授权流程。

- **R5** `CallOutcome` 只描述已发出的调用。`InvokeResult` 用 `not-sent` 与 `sent` 两种分开它们。
- **R6** `ConnectionFailure` 在需要连接、而连接条件不成立时给出：
  - `credential-unavailable`：凭据缺失、被拒或不可读，带 `missing`、`rejected` 或 `unknown`。
  - `authorization-required`：对端答需要授权，带授权发现。
  - `landing-unavailable`：进程落点或设施不成立，或落点不可读。
  - `connection-unavailable`：传输打不开，协商失败，或请求没有产生对端效果（`not-sent`）。
- **R7** `OperationFailure` 是读口、状态口与任务操作的失败，由 `Refusal`、`ConnectionFailure` 与下面三项组成。`current` 与 `peer` 不发请求，它们的失败 `ReadFailure` 不含这三项：
  - `effect-unknown`：请求已发出而没有应答，带 `NoAnswerCause` 的子因；或任务操作既没有现有连接、也没有可重建连接的采用材料，子因是 `no-connection`。效果未知，不压成失败，不重发。
  - `error-answer`：请求已发出，对端答 JSON-RPC 错误，带错误码、消息与 `data`（如有），原样交出。
  - `answer-malformed`：请求已发出，应答不是 T6、T7 为这个请求点名的形状，带 `what`，见 T7。

<a id="services"></a>

### 应用服务接口

本成员只写接口与结果值。下列条款约束接口的实现方。

- **S1** 除 `ActionInvoker.cancel`、`ActionInvoker.cancelTask` 与 `Connections.closeAll` 以外，每个操作先经 `AdoptionView.endpoint` 核采用，再经 `UseEligibility.check` 核资格。`queryTask`、`taskResult` 与 `provideTaskInput` 例外：它们核采用，但只在要新建连接时核资格，复用现有连接时不核（S2）。未采用时答 `not-available-to-you`，不再问资格。`AdoptionView` 不可读时答 `unknown`。资格答 `not-eligible` 时答 `not-available-to-you`，答被设置挡下时给出该原因，答 `unknown` 时答 `unknown`。`EndpointStatus.list` 经 `AdoptionView.endpoints` 取列表，再逐项核资格，只列出有资格的接入点；任一项资格答 `unknown`，整次答 `unknown`。接入点被撤采用或被禁用后，`Connections` 在下一次使用边界之前自行关闭它的连接，stdio 时一并停止进程。所以 `release` 对被禁用的接入点答 `blocked` 是可接受的：连接不靠 `release` 释放。
- **S2** 调用与任务的控制：
  - `cancel` 只按（租户、主体、关联键）在本次运行的在途表里定位，不核采用与资格。在途时答 `signalled`；关联键已结束时答 `no-call-in-flight`；表里没有时答 `unknown`。占位后、发出前收到的 `cancel` 使原调用答「未发出：`cancelled`」。
  - 连接换代之后，`continueWithInput` 在旧代际上的在途状态无法证明时答「未发出：`unknown`」，不在新代际上重发。
  - 服务在本次运行内保存已发出的任务表，键是（租户、主体、持有、任务号）。表项在本次运行内不删除；任务的终态交出之后再查询，仍转发给对端。任务表不跨重启，这是已知限制。
  - `queryTask`、`taskResult`、`provideTaskInput`、`cancelTask` 只对发起者开放：非发起者、重启之后和表里没有的任务一律答 `unknown`，不随任务是否存在而变。`cancelTask` 不核采用与资格。
  - 任务操作可以复用现有连接，复用时不核资格。要新建连接时，`UseEligibility` 必须答 `granted`；否则不建连接，答 `effect-unknown`（`no-connection`）。没有现有连接、也没有可以重建连接的采用材料时，同样答 `effect-unknown`（`no-connection`）。`cancelTask` 只减少效果，不为取消启动新进程。`AdoptionView` 答 `unknown` 时，任务操作答 `Refusal` 的 `unknown`。
  - 传输答 `no-answer` 时，四个任务操作答 `effect-unknown`，带同一子因。传输答 `error-answer` 或 `answer-malformed` 时原样交出。
  - `taskResult` 对已取消、没有结果的任务答 `cancelled`。`provideTaskInput` 把答复交给 `input_required` 的任务，对端确认后答 `accepted`。`cancelTask` 在对端确认取消请求后答 `requested`；任务是否已到终态，经 `queryTask` 得知。
- **S3** `McpConfig` 的四个字段都必填，没有缺省值：
  - `principalKey`：给出主体的文本。同一租户内不同主体映射到不同文本，同一主体在本次运行内映射到同一文本。违反这一点是装配方的缺陷。
  - `maxListingPages`、`maxActions`、`instructionsByteLimit`：正的安全整数，分别限制一次取得的分页数、一次取得接受的动作数、保留的 `instructions` 的 UTF-8 字节数。
  - 服务的构造函数（`createMcp`）收到不合法的 `McpConfig` 时抛出 `RangeError`。

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
  - `kept`，原因是 `cancelled`：发布边界核对时，本次刷新已被取消。原采用不变。
  - `kept`，原因是 `listing-incomplete`：`completeListing` 答了缺陷，带这个缺陷。某页的传输答 `no-answer`、`error-answer` 或 `answer-malformed` 时，这一页算失败，缺陷是 `page-failed`，连接转为 `degraded`（`list-failed`）。原采用不变。
  - 失败：某页或 `discover` 的传输答 `not-sent`（`authorization-required` 或 `connection-unavailable`）时，答对应的 `ConnectionFailure`，连接按 S7 转为 `lost`，并用对应原因调用 `markUnavailable`。写入这份记录时 `CatalogStore` 答修订冲突，`refresh` 答 `kept`（`superseded`）；答不可用时答 `unknown`。`discover` 答 `no-answer` 时答 `effect-unknown`；答 `error-answer` 或 `answer-malformed` 时答 `connection-unavailable`，连接转为 `lost`（`discover-failed`）。发布边界核对当前授权失败时，答对应的 `Refusal`，不发布。`CatalogStore` 读取或写入不可用时答 `unknown`，不报告新修订。
- **S6** 进度与日志通知经调用方给出的观察函数交出，标为不可信，不代替结局。观察函数抛出不影响调用的结局。本组不把通知写进自己的日志：对端日志不经过 `ProcessLanding`，MCP 无法按值遮盖其中的秘密。
- **S7** `EndpointStatusView` 的连接状态：
  - `none`：本次运行没有这个接入点的连接。`preparing`：正在准备。`ready`：协商已成立。
  - `degraded`：最近一次非调用请求暂时失败，原因 `discover-failed`（`server/discover`）或 `list-failed`（`tools/list`）。
  - `lost`：连接不再成立，原因如下：`preparation-failed`，准备失败且不属于其他几种；`discover-failed`，`server/discover` 已发出而应答是 JSON-RPC 错误或读不懂；`close-unconfirmed`，`release`、`closeAll` 或自动关闭时进程的 `stop()` 答 `root-only` 或 `unconfirmed`；`authorization-required`，对端答需要授权；`process-exited`，stdio 进程退出；`stream-broken`，管道或流断开；`negotiation-invalid`，已记录的协商结果不再成立；`session-ended`，旧对端终止了会话。

  「确认停止」指 `stop()` 答 `tree-confirmed`。准备失败或关闭后留下的进程与它确认的停止范围只记在 `lost` 状态的 `residual` 上，视图原样反映状态。关闭时确认停止，状态回到 `none`；否则状态是 `lost`（`close-unconfirmed`）并带 `residual`。重建成功或之后确认停止时，`residual` 清除。凭据在视图里报告为：`not-required`，`auth` 是 `none`；`absent`，配值缺失；`invalid`，配值被守卫拒绝；`present`，配值存在。视图不报告凭据值。

- **S8** `release` 与 `closeAll` 只报告实际确认的范围：有进程时带确认的停止范围；连接没有进程时报告 `no-process`；连接状态为 `none` 时报告 `no-connection`。`peer` 不为回答而建连接，本次运行没有连接时答 `not-connected`。`current` 的 `basisCurrent` 比较采用依据与当前连接的协议版本和能力（能力按规范化 JSON 比较相等），不比较连接代际；本次运行没有连接时答 `no-connection`。
- **S9** 凭据句柄的取得与释放：每条连接按凭据配值调用一次 `CredentialUse.acquire`，所有 `credential` 来源变量共用这一个进程凭据句柄。进程凭据句柄在进程的 `stop()` 返回之后释放，不论它答哪种范围；准备失败时立即释放。HTTP 凭据句柄随连接关闭释放。

## 所有权、失败与生命周期

本成员的纯函数没有异步资源，没有外部效果，不需要清理。下列条款约束端口的实现方，每条对应 `./testing` 里同名套件的用例。

<a id="port-adoption"></a>

### `AdoptionView`（AV）

- **AV1** `endpoint(access, ref)` 对已采用的接入点答该项，带采用修订、正文、三项固定设置的配值与 stdio 进程环境所需的非秘密配值。未配的设置项答 `absent`，守卫拒绝的配值答 `invalid` 并带原文，不补缺省值。
- **AV2** `endpoints(access, scope)` 只列出该作用域里已采用的接入点。
- **AV3** 未采用的接入点答 `not-adopted`。
- **AV4** 对其他租户的主体，已采用的接入点与不存在的接入点答复完全相同，都是 `not-adopted`。
- **AV5** 正文或任一配值变化时，采用修订随之变化。
- **AV6** 不可读时答 `unknown`，不答 `not-adopted` 或空列表。

<a id="port-eligibility"></a>

### `UseEligibility`（UE）

拒绝原因以 `EligibilityVerdict` 的类型为准：`not-eligible`、`local-command-not-enabled`、`disabled`。

- **UE1** 有使用资格的主体答 `granted`。
- **UE2** 无使用资格的主体，对已存在与不存在的接入点答复完全相同，都是 `refused`、`not-eligible`。
- **UE3** 被设置挡下的原因 `local-command-not-enabled` 与 `disabled` 只答给有使用资格的主体。
- **UE4** 每次使用都现场判定，不缓存。撤权在下一次判定时生效。
- **UE5** 不能判定时答 `unknown`，不答拒绝。

<a id="port-credentials"></a>

### `CredentialUse`（CU）

- **CU1** `acquire` 按用途答不同的句柄。`process-env` 答 `ProcessCredentialHandle`：MCP 不读它，只把它交给 `ProcessLanding`，并在用完后释放。它怎样变成变量值，是 `CredentialUse` 与 `ProcessLanding` 两个实现方之间的约定；内存替身用一张内部表兑现这条约定。`http-authorization` 带连接目标，答 `HttpCredentialHandle`：它只对这份持有与这个连接目标有效，能为一个出站请求授权，能回报对端的拒绝，能释放。句柄以 `purpose` 字段区分。
- **CU2** 没有凭据时答 `missing`。
- **CU3** 答复不退回组织、官方或其他租户的凭据。
- **CU4** 句柄不是秘密值。句柄、它的序列化形式与它的检视文本都不含秘密值。
- **CU5** 凭据被拒时答 `rejected`。
- **CU6** 不可读时答 `unknown`，不答 `missing`。
- **CU7** 一份持有的凭据不答给另一份持有。

<a id="port-landing"></a>

### `ProcessLanding`（PL）

进程句柄给出标准输入、标准输出、已遮盖秘密的标准错误、根进程退出的信号，以及 `stop()`。`start` 的环境由非秘密配值与按变量名给出的进程凭据句柄组成。

- **PL1** `stop()` 请求停止该进程及其全部后代，答实际确认的范围：`tree-confirmed`、`root-only` 或 `unconfirmed`。答 `tree-confirmed` 或 `root-only` 时，`exited` 会兑现。调用了 `stop()` 不证明进程已停。
- **PL2** 交出标准错误之前遮盖其中的秘密值。标准错误在进程停止后结束；`stop()` 答 `unconfirmed` 时，套件不读到底，这个用例不适用。
- **PL3** 设施不成立时答 `facility-missing`，不起进程。
- **PL4** 落点不成立时答 `landing-invalid`，不静默落到宿主。不能判定时答 `unknown`。
- **PL5** `stop()` 可以重复调用。再次调用不失败，答复不比第一次确认的范围小。

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

<a id="port-transport"></a>

### `McpTransport` 与 `McpTransportFactory`（T）

- **T1** 传输失败按对端效果分四种：`not-sent`，请求没有对端效果；`no-answer`，请求已离开而没有应答，效果未知；`error-answer`，请求已离开，对端答 JSON-RPC 错误，带错误码、消息与 `data`（如有）；`answer-malformed`，请求已离开，应答读不懂，见 T7。`call` 的失败只会是 `not-sent`；调用已发出后，没有应答经 `answer` 交出 `no-answer`，JSON-RPC 错误经 `answer` 交出 `error`。
- **T2** 对 `call`，传输交出对端的原样应答，不分类，分类由 `classifyOutcome` 完成。对非调用请求（`discover`、`listActions` 与任务操作），传输把应答解释到 T6、T7 点名的形状为止。
- **T3** `discover` 在旧对端上回退到 `initialize`。客户端是否在请求上声明任务扩展能力，由传输实现决定。`discover` 按打开材料里的 `instructionsByteLimit` 处理 `instructions`，见 S3。
- **T4** 对端对一个请求答 HTTP 401 或权限不足的 403 时，请求没有对端效果，失败是 `not-sent`、`authorization-required`，带授权发现。这个请求曾用凭据句柄授权时，传输先调用该句柄的 `reportRejection()`，再报这个失败。
- **T5** `cancelRequest` 发出取消通知，不证明对端已停止。`close()` 只关闭传输，不停止进程。进程由进程句柄的持有者停止。
- **T6** 任务操作与协议的对应：
  - `getTask` 发 `tasks/get`，读应答里的 `status` 与 `input_required` 时的 `inputRequests`。它不交出任务的结果。
  - `getTaskResult` 也发 `tasks/get`，读同一种应答：`completed` 的 `result` 与 `failed` 的错误作为 `finished` 的原样应答交出；`cancelled` 答 `cancelled`；其他状态答 `not-finished`。
  - `updateTask` 发 `tasks/update` 交回答复，对端确认后答 `accepted`。`cancelTask` 发 `tasks/cancel`，对端确认后答 `requested`。两者都只是确认，终态经 `getTask` 得知。
  - 对端答 JSON-RPC 错误 `-32602`（任务不存在或已过期）时，`getTask` 与 `getTaskResult` 答 `expired`；对端删除过期任务后同样如此，不当作失败或完成。其余 JSON-RPC 错误以 `error-answer` 原样交出。`updateTask` 与 `cancelTask` 对已过期的任务得到 `error-answer`（`-32602`），原样交出。
  - 请求已发出而没有应答时答 `no-answer`，服务据此答 `effect-unknown`（S2）。

- **T7** 非调用请求的应答读不懂时，答 `answer-malformed`，`what` 的值与条件：
  - `status-unknown`：`tasks/get` 的 `status` 不在 `TaskStatus` 的五个值里。
  - `input-requests-missing`：`status` 是 `input_required` 而没有 `inputRequests`。
  - `result-missing`：`status` 是 `completed` 而没有 `result`。
  - `error-shape`：错误对象缺整数错误码（词形按 O4）或缺消息。错误码不是整数词形的 JSON-RPC 错误不以 `error-answer` 交出。
  - `tools-missing`：`tools/list` 的应答没有 `tools` 列表。
  - `discover-shape`：`server/discover` 的应答不是 T3 要求的形状，例如缺协议版本或能力。

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
| 传输                   | `TransportFailure`、`AnswerMalformed`、`TaskAnswer`                                                                                                                                                | T1、T4、T6、T7     |

### 生命周期与所有权

- 本成员的函数不持有资源，不发起外部操作。
- `completeListing` 的登记是进程内凭证，见 C4。
- `./testing` 的内存替身不耐久，只用于自测，不能装配进产品。内存 `CatalogStore` 替身不是 `@omne-harness/mcp` 的内存实现。

## 组合与验证

| 条款               | 验证                                                                                                                                                                          | 命令                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 入口与依赖         | `tests/public-entry.spec.ts` 核对三个入口的运行时导出与导入关系；`tests/provider-types.spec-d.ts` 核对 `./provider` 的类型导出                                                | `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract` |
| 封闭集合           | `tests/closed-sets.spec-d.ts` 把代码列表钉在类型上；`tests/spec-closed-sets.spec.ts` 核对本页写到每一项                                                                       | 同上                                                                      |
| V1–V3              | `tests/values.spec.ts`                                                                                                                                                        | 同上                                                                      |
| V4                 | 类型：每个不可信字段的类型是 `Untrusted<T>`；`tests/catalog.spec.ts`、`tests/content.spec.ts`、`classifyOutcomeCases` 核对 annotations 与 `inputRequests` 包在 `untrusted` 里 | 同上                                                                      |
| R1–R7              | 类型与 `tests/closed-sets.spec-d.ts`、`tests/spec-closed-sets.spec.ts`；R2 的发起条件、R6 与 R7 的给出条件由服务与传输实现验证，见「未覆盖」                                  | 同上                                                                      |
| S3 的截断          | `tests/instructions.spec.ts`                                                                                                                                                  | 同上                                                                      |
| E1–E6              | `tests/endpoint.spec.ts`：每个拒绝原因一个反例，schema 与解析规则一致                                                                                                         | 同上                                                                      |
| K1–K3              | `tests/keys.spec.ts`                                                                                                                                                          | 同上                                                                      |
| C1–C8              | `tests/catalog.spec.ts` 的性质测试与带种子的随机序列；`tests/conformance.spec.ts` 跑 `mergeListingCases`                                                                      | 同上                                                                      |
| O1–O6              | `tests/classify.spec.ts` 跑 `classifyOutcomeCases` 并核对覆盖                                                                                                                 | 同上                                                                      |
| D1–D5              | `tests/content.spec.ts`                                                                                                                                                       | 同上                                                                      |
| AV、UE、CU、PL、CS | `tests/conformance.spec.ts` 让五个套件跑内存替身，并用违约替身证明套件会变红                                                                                                  | 同上                                                                      |

端口的实现方这样使用套件：从 `./testing` 取 `mcp<端口>Conformance()`，为每个用例新建一份夹具，用 `runConformanceCase` 在自己的测试框架里逐个运行。结论有三种：

- 通过。
- 失败：用例抛出 `node:assert` 的 `AssertionError` 或其他错误，`runConformanceCase` 把它抛给调用方。
- 不适用：夹具缺少用例需要的句柄，`runConformanceCase` 答 `not-applicable`。不适用既不是通过也不是失败，调用方单独计数。本成员对内存替身的测试把不适用当作失败，因为替身提供全部句柄。

未覆盖：

- 服务条款 S1–S9 没有实现，本成员不能验证它们。它们由服务实现的测试验证。
- 传输条款 T1–T7 的契约测试与真实服务端夹具不在本成员。
- 真实对端、真实凭据、真实进程落点、耐久存储的行为都没有证据。替身通过不等于真实组合通过。

<a id="open-items"></a>

### 未封闭项

组页第 601 行：资产的 `deriveDeclarations(body, context)` 拿不到 MCP 动作清单，逐动作权限项不能经类别端口派生。本成员只提供 `actionPermissionItems`。拥有者：资产 SPEC 的拥有者与本成员的维护者。

# @omne-harness/mcp-contract 行为规格

状态：候选契约，尚未取得技术接受。本页封闭 [MCP 能力组工程设计](../docs/architecture.md)列给本成员的未定项。公开形状与运行时校验归 `src/` 的公开定义，本页只写类型不能完整表达的行为。本成员只有纯函数、类型、类别端口与测试设施，没有服务实现。服务实现、`CatalogStore` 的生产实现、传输实现和真实组合都不在本成员。

## 范围与依据

本成员是 MCP 组的纯契约成员。它用 MCP 自己的词对外提供值、结局、失败、五个应用服务的接口、纯函数和接入点正文的类别端口。它不点名任何调用方，不依赖 Cordis，不依赖任何 MCP SDK。官方 SDK 的类型不进入本成员。

| 依据                                                                                | 修订                         | 本页采用的范围                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| [组工程设计](../docs/architecture.md)                                               | `21175c9f9`                  | 边界、协议基线、模型、值对象、MCP 连接、动作清单、设置声明、端口、应用服务、调用结果、内容交付、失败种类 |
| W1 MCP 线实施规格「已定事项」1–19                                                   | 2026-11-03，负责人会话内裁定 | 入口、类别名、正文形状、变量绑定、上界与配置、`classifyOutcome` 的注入校验、不可信值与服务接口的写法     |
| [资产成员 SPEC](../../assets/assets/SPEC.md#accepted-public-types)                  | `21175c9f9`                  | `BodyContract` 的字段与判断规则                                                                          |
| [MCP 协议修订 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) | 2026-07-28                   | 结果形状、`resultType`、多轮输入、内容类型、JSON-RPC 错误码、任务扩展的任务句柄                          |

<a id="entries"></a>

### 三个入口

| 入口         | 给谁                   | 内容                                                                                       |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------ |
| `.`          | 调用方与实现方         | 值、品牌守卫、结局、失败、五个服务接口与结果值、纯函数、`mcpEndpointBodyContract()`        |
| `./provider` | 端口的实现方           | 五个需求端口、`McpTransport`、`McpTransportFactory` 及其答复类型。只有类型，没有运行时导出 |
| `./testing`  | 端口的实现方，用于自测 | 五个需求端口的符合性套件、各自的内存替身、`classifyOutcomeCases`、`mergeListingCases`      |

公开根不导入 `./testing`。产品源码不导入 `./testing`。

<a id="closed-items"></a>

### 本页封闭的组页未定项

| 组页位置       | 未定项                                               | 本页条款                                         |
| -------------- | ---------------------------------------------------- | ------------------------------------------------ |
| 第 170 行      | `StdioLaunch` 的变量绑定、工作目录的写法与缺省       | [E3](#endpoint)、[E4](#endpoint)                 |
| 第 181 行      | `degraded` 的原因集合                                | [S7](#services)                                  |
| 第 318、330 行 | 连接超时缺值时的上界与失败码；各设置项与权限项的值域 | [E5](#endpoint)、[C8](#catalog)、[S3](#services) |
| 第 343 行      | 进程句柄的精确形状                                   | [PL](#port-landing)                              |
| 第 355 行      | `UseEligibility` 拒绝原因的完整集合                  | [UE](#port-eligibility)                          |
| 第 374、599 行 | 授权发现的三项字段；`CredentialUse` 的用途值域       | [R4](#refusals)、[CU](#port-credentials)         |
| 第 401 行      | 不可用原因的封闭集合                                 | [R3](#refusals)                                  |
| 第 430 行      | 「未发出」原因的封闭集合                             | [R2](#refusals)                                  |
| 第 465 行      | 控制操作在资格不是 `granted` 时的失败码              | [R1](#refusals)                                  |
| 第 525 行      | 精确的失败码                                         | [失败码总表](#failure-codes)                     |
| 第 600 行      | 变量名绑定到非秘密配值还是凭据句柄，以及写法         | [E3](#endpoint)                                  |
| 第 602 行      | 对端日志通知里的秘密                                 | [S6](#services)                                  |
| 第 603 行      | 分页数、清单大小与 `instructions` 的上界             | [S3](#services)、[C2](#catalog)                  |
| 第 604 行      | 部分准备与配置错误的报告形状，含连接超时缺值         | [R2](#refusals)、[S4](#services)                 |

本页不封闭下列两项，见[未封闭项](#open-items)：第 601 行（`deriveDeclarations` 取得清单的上下文），第 445 行（任务处于 `input_required` 时怎样取得输入请求）。

## 结果与不变量

<a id="values"></a>

### 值与不可信内容

- **V1** 每个品牌只由公开根里的一个守卫授予，例如 `isEndpointName`、`isMillis`、`isConnectionTarget`。守卫不修补输入。不透明的文本品牌（持有、采用修订、凭据配值、动作名、关联键、请求状态、任务号、协议版本）接受任何非空文本，原样保存，只比较相等。
- **V2** `Millis` 是正的安全整数。`Generation` 是非负的安全整数。`CatalogRevision` 是正的安全整数，第一次采用的修订是 1。`DefinitionDigest` 是 `sha256:` 加 64 位小写十六进制。
- **V3** `ConnectionTarget` 只做句法检查：小写 `http` 或 `https`，绝对地址，有主机，没有 fragment，没有 userinfo，整串没有空白、控制字符或反斜杠。不合法时守卫答否，不修补后接收。句法检查不判定对端可信，也不阻止秘密出现在地址里。
- **V4** 对端自报的内容只经 `Untrusted<T>` 交出：`serverInfo`、`instructions`、动作定义的 annotations、内容项的 annotations、进度与日志通知、授权发现里的受保护资源元数据。调用方读这些值必须经 `untrusted` 字段，类型系统不把它们当作可信值。它们不是身份或授权的依据。

<a id="endpoint"></a>

### 接入点正文

- **E1** `parseEndpointBody(body, capabilityName?)` 只接受 `@omne-harness/json-text` 的 JSON 树。正文是对象，成员只有 `name`、`transport`、`auth`、`launch`。任何其他输入答 `malformed`，不抛出。
- **E2** 拒绝原因是封闭集合，按下列顺序判定，第一个成立的原因就是答复：
  1. `malformed`：结构不合法。包括未知成员、`name` 不合词法（`^[a-z0-9]+(?:-[a-z0-9]+)*$`，1–64 个字符）、`transport` 或 `auth` 不是文本、`launch` 内部不合法。
  2. `name-mismatch`：给出了能力名，且 `name` 与它不同。没有给出能力名时不比较。
  3. `transport-unknown`：`transport` 不是 `stdio` 或 `streamable-http`。
  4. `auth-unknown`：`auth` 不是 `none`、`static` 或 `oauth`。
  5. `launch-missing`：`stdio` 没有 `launch`。`launch-unexpected`：`streamable-http` 带了 `launch`。
- **E3** `launch` 的成员是 `command`（必需，非空）、`args`、`cwd`、`env`、`facilities`。省略的列表读作空列表。`env` 每项只有 `name` 与 `source`，正文不写值。`name` 是环境变量名（`^[A-Za-z_][A-Za-z0-9_]*$`），同一正文里不重复。`source` 是 `setting` 或 `credential`：
  - `setting`：取 `AdoptionView` 在 `processEnv` 里交来的同名非秘密配值。
  - `credential`：起进程时由凭据句柄注入。秘密值不经过 MCP。
    正文没有列出的变量不隐式补入。命令是一个程序，不经 shell 解释。参数原样传递，不插值，不展开。`facilities` 的项非空，不重复。
- **E4** `cwd` 是非空文本，原样交给 `ProcessLanding`，由落点解释。省略 `cwd` 时由落点决定工作目录。MCP 不选落点，所以不给缺省。
- **E5** `mcpEndpointBodyContract()` 登记类别 `mcp`。它的 `judge`、`deriveDeclarations`、`references` 只接受 `readBodyText` 的读取结果，其他输入答 `incomplete-reference`，这是资产契约的规则。`judge` 的拒绝原因与 E2 相同。`deriveDeclarations` 按下列规则产出固定设置的声明项，次序固定：
  - `setting:placement-identity:target`：只对 `streamable-http`。值域是 `ConnectionTarget`。
  - `setting:placement-identity:credential`：只在 `auth` 不是 `none` 时。值域是 `CredentialBinding`，没有缺省值。
  - `setting:preference:connect-timeout`：总是产出。值域是 `Millis`，没有缺省值。
    判断失败时 `deriveDeclarations` 与 `references` 抛出 `TypeError`，错误文本带拒绝原因。`references` 对合法正文答空列表：接入点不引用其他能力。逐动作权限项不经类别端口产出，见 [C8](#catalog)。
- **E6** `launchesLocalCommand(definition)` 对 `stdio` 答真，对 `streamable-http` 答假。加载正文时就能回答。`schema/endpoint-body.schema.json` 是同一规则的说明文档，正文是否合法由 E1–E2 决定。

<a id="keys"></a>

### 对端账号与键

- **K1** 对端账号只由 `peerAccountOf(auth, binding)` 得出。`auth` 是 `none` 时答 `anonymous`，不读凭据配值。否则凭据配值缺失答 `credential-missing`，不退回其他凭据。`CredentialUse` 不答复对端账号。
- **K2** `connectionKeyOf` 由租户、持有、采用修订与对端账号组成。采用修订一变，键就变。不同租户、不同对端账号的键不同。
- **K3** `catalogKeyOf` 由租户、对端账号与持有组成，不含采用修订与协议版本。采用修订或协议版本变化时，已知动作不离开清单。

<a id="catalog"></a>

### 清单与已知动作

- **C1** `completeListing` 只在下列条件全部成立时构造完整清单，否则答第一个成立的缺陷：
  1. `page-failed`：任一页失败。前面已取得的各页也不采用。
  2. `page-limit-exceeded`：页数超过上界，或取到上界时最后一页仍有下一页。
  3. `pages-unfinished`：没有页，或最后一页仍有下一页。
  4. `action-limit-exceeded`：动作总数超过上界。
  5. `action-invalid`：某一项不是对象，`name` 不是非空文本，`inputSchema` 不是对象，`outputSchema` 或 `annotations` 存在但不是对象，或 `execution.taskSupport` 不是 `forbidden`、`optional`、`required`。
  6. `duplicate-action-name`：动作名重复，跨页也算。
- **C2** 完整清单的新鲜度：取得时刻由调用方给出，`ttlMs` 取各页给出值中的最小值，`changedNotified` 为假。省略的 `execution` 或 `taskSupport` 读作 `forbidden`。
- **C3** 动作定义原样保存，不改写。`definition` 是对端对象去掉 `annotations` 后的原样内容，annotations 另存为不可信值。`digestDefinition` 是对端原对象（含 annotations）规范化后的 SHA-256：对象成员按 UTF-16 码元排序，数字保留原样的词形。成员次序不改变摘要，任何内容或数字词形的变化都改变摘要。
- **C4** `mergeListing(current, listing, basedOn)` 只接受 `completeListing` 在同一模块实例里构造的清单，其他对象答 `not-complete`。复制出来的对象也答 `not-complete`。
- **C5** `mergeListing` 只按清单修订做条件判断。当前修订（未取得时是 `absent`）不等于 `basedOn` 时答 `stale-revision`，不产出记录。它不比较连接代际：产出清单的那一代连接是否仍是当前连接，在发布边界由服务实现核对。
- **C6** 条件成立时，`mergeListing` 产出一份完整的新记录：
  - 清单里的动作可用，带新的定义与摘要。
  - 已知但不在清单里的动作仍在记录里，保留最近合法定义与摘要，标为不可用，原因是 `no-longer-offered`。
  - 修订是原修订加一，第一次是 1。
  - 采用依据与新鲜度取自本次清单。
  - 动作按名字排序，名字不重复。
    空清单也是「已取得」，表示对端提供零个动作。「未取得」不是零个动作。
- **C7** `markUnavailable(record, reason)` 把可用的动作标为不可用，原因是给出的连接、凭据、授权或落点原因。原因是 `no-longer-offered` 的动作保留这个原因。定义与摘要不变，修订加一。
- **C8** `actionPermissionItems` 在「未取得」时答 `not-acquired`，不推断零个动作。「已取得」时每个已知动作一项，项名是 `execute:<对端动作名>`，可用与不可用的动作都有。项名只由动作名决定。每项的值域是 `forbid`、`auto`、`ask`。MCP 只声明权限项，不判定权限。

<a id="outcomes"></a>

### 结局分类

- **O1** `classifyOutcome(answer, context)` 是全函数，不抛出。`context` 给出发出时的连接代际、动作的 `outputSchema`（如有）和注入的输出校验函数。
- **O2** 对端答 `result` 时按 `resultType` 分类。缺 `resultType` 的结果来自旧对端，按 `complete` 处理：
  - `complete` 且 `isError` 为真：`toolError`，带内容与结构化内容（如有）。这是动作自己的失败，不是协议失败。
  - `complete` 且 `isError` 缺省或为假：`complete`，带内容、结构化内容（如有）与输出校验结论。省略的 `content` 读作空列表。
  - `input_required`：`inputRequired`，带 `inputRequests`、`requestState`（各自如有）与发出代际。两者至少有一项。
  - `task`：`task`，带 `taskId` 与发出代际。
- **O3** 输出校验结论只有三种：动作没有声明 `outputSchema` 时是 `no-schema`，不调用校验函数。声明了 `outputSchema` 但结果没有结构化内容时是 `violates`，原因是 `structured-content-missing`，不调用校验函数。其余情形调用一次校验函数，用它的答复。`toolError` 不调用校验函数。
- **O4** 对端答 JSON-RPC 错误时是 `protocolError`，`fault` 带整数错误码、消息与 `data`（如有）。错误码不作翻译，所有码都按同一规则交出。协议错误不证明调用没有效果。
- **O5** 读不懂的应答也是 `protocolError`，不猜测成功：未知的 `resultType` 答 `result-type-unknown` 并带原值；结果不是对象、`resultType` 不是文本、`content` 不是列表、`isError` 不是布尔值、多轮结果两项都没有或 `requestState` 为空、任务句柄没有 `taskId` 时答 `result-malformed`；错误对象缺整数码或消息时答 `error-malformed`。
- **O6** 已发出但没有应答时是 `unknown`，子因是 `stream-broken`、`process-exited` 或 `abandoned`。`unknown` 表示效果未知，不压成失败，不重发。

<a id="content"></a>

### 内容交付

- **D1** `toContentBlocks(items)` 按对端次序逐项转换，一项对应一项，不丢弃任何一项。
- **D2** `text` 转成文本块，`image` 转成图块，`audio` 转成语音块。媒体类型原样交出，不改写。`data` 必须是 base64。
- **D3** `resource_link` 与 `resource` 原样带协议类型交出，不改写成文本。`resource_link` 要有非空 `uri` 与文本 `name`。`resource` 要有带非空 `uri` 的 `resource` 对象，并且恰好有 `text` 或 base64 的 `blob` 之一。
- **D4** 不合法的一项转成 `invalid`，带一个文本块，文本说明它的位置、类型与原因。原因是封闭集合 `ContentDefect`。说明文本不复制这一项的内容。不在 2026-07-28 内容类型里的类型答 `type-unknown`。
- **D5** 块的标识是 `content-<位置>`，在一份结局内唯一。每个块对人与模型都可见：谁看到什么由调用方决定。内容项的 annotations 作为不可信值另交，`_meta` 原样另交。

<a id="refusals"></a>

### 拒绝、未发出与不可用

- **R1** 读口、调用口与状态口的拒绝是 `Refusal`：`not-available-to-you`、`blocked`（带 `local-command-not-enabled` 或 `disabled`）、`unknown`。未采用、无权与不存在对任何主体都是 `not-available-to-you`，不可区分。控制操作（`release`、`queryTask`、`taskResult`）在资格不是 `granted` 时也只答这三种。
- **R2** 「未发出」原因是封闭集合：`Refusal` 的三种，`correlation-key-in-use`，`cancelled`，`definition-changed`，`action-unavailable`，`mode-unsupported`，以及连接条件 `ConnectionCondition` 的五种：`credential-unavailable`（带 `missing`、`rejected` 或 `unknown`），`authorization-required`（带授权发现），`landing-unavailable`，`connection-unavailable`，`config-missing`（带 `connect-timeout` 或 `target`）。「未发出」没有对端效果。
- **R3** 不可用原因是封闭集合：`no-longer-offered`、`connection-unavailable`、`authorization-required`、`credential-unavailable`、`landing-unavailable`。
- **R4** 授权发现有四个字段：`resourceMetadataUrl`（受保护资源元数据的地址），`resourceMetadata`（元数据本身，不可信），`issuers`（元数据列出的授权服务器签发者），`scopes`（对端要求的 scope）。MCP 不做授权流程。
- **R5** `CallOutcome` 只描述已发出的调用。`InvokeResult` 用 `not-sent` 与 `sent` 两种分开它们。

<a id="services"></a>

### 应用服务接口

本成员只写接口与结果值。下列条款约束接口的实现方。

- **S1** 除 `ActionInvoker.cancel` 与 `ActionInvoker.cancelTask` 以外，读口、调用口与状态口的每个操作先经 `AdoptionView.endpoint` 核采用，再经 `UseEligibility.check` 核资格。未采用时答 `not-available-to-you`，不再问资格。`AdoptionView` 不可读时答 `unknown`。资格答 `not-eligible` 时答 `not-available-to-you`，答被设置挡下时给出该原因，答 `unknown` 时答 `unknown`。
- **S2** `cancel` 只按（租户、主体、关联键）在本次运行的在途表里定位，不核采用与资格。答复是 `signalled`、`no-call-in-flight` 或 `unknown`。占位后、发出前收到的 `cancel` 使原调用答「未发出：`cancelled`」。`cancelTask` 只供发起该任务的同一租户与主体使用，不核采用与资格。
- **S3** `McpConfig` 的四个字段都必填，没有缺省值：`principalKey` 给出主体的稳定文本；`maxListingPages`、`maxActions`、`instructionsByteLimit` 是正的安全整数，分别限制一次取得的分页数、一次取得接受的动作数、保留的 `instructions` 的 UTF-8 字节数。超出 `instructionsByteLimit` 的部分截断，`instructions` 标明已截断并带摘要与取得时的连接代际。
- **S4** 连接超时取 `AdoptionView` 交来的 `connectTimeout`。缺值时用操作请求里的 `connectBound`。两者都没有时，`invoke` 与 `continueWithInput` 答「未发出：`config-missing`（`connect-timeout`）」，`refresh` 答「保留原采用」，原因相同。Streamable HTTP 缺连接目标时同样答 `config-missing`（`target`）。
- **S5** `refresh` 答新的修订、「保留原采用」带 `KeptReason`，或 `Refusal`。`CatalogStore` 写入不可用时答 `unknown`，不报告新修订。修订冲突时答「保留原采用」，原因是 `newer-adoption`。
- **S6** 进度与日志通知经调用方给出的观察函数交出，标为不可信，不代替结局。本组不把通知写进自己的日志：对端日志不经过 `ProcessLanding`，MCP 无法按值遮盖其中的秘密。
- **S7** `EndpointStatusView` 的连接状态是 `none`、`preparing`、`ready`、`degraded`、`lost`。`degraded` 的原因是 `discover-failed` 或 `list-failed`，即最近一次非调用请求暂时失败。`lost` 的原因是 `preparation-failed`、`process-exited`、`stream-broken`、`negotiation-invalid` 或 `session-ended`。凭据只报告 `present`、`absent` 或 `not-required`，不报告值。
- **S8** `release` 与 `closeAll` 只报告实际确认的范围。没有进程的连接报告 `no-process`。

## 所有权、失败与生命周期

本成员的纯函数没有异步资源，没有外部效果，不需要清理。下列条款约束端口的实现方，每条对应 `./testing` 里同名套件的用例。

<a id="port-adoption"></a>

### `AdoptionView`（AV）

- **AV1** `endpoint(access, ref)` 对已采用的接入点答该项，带采用修订、正文、三项固定设置的配值与 stdio 进程环境所需的非秘密配值。未配的设置项如实缺值，不补缺省值。
- **AV2** `endpoints(access, scope)` 只列出该作用域里已采用的接入点。
- **AV3** 未采用的接入点答 `not-adopted`。
- **AV4** 对其他租户的主体，已采用的接入点与不存在的接入点答复完全相同，都是 `not-adopted`。
- **AV5** 正文或任一配值变化时，采用修订随之变化。
- **AV6** 不可读时答 `unknown`，不答 `not-adopted` 或空列表。

<a id="port-eligibility"></a>

### `UseEligibility`（UE）

- **UE1** 有使用资格的主体答 `granted`。
- **UE2** 无使用资格的主体，对已存在与不存在的接入点答复完全相同，都是 `refused`、`not-eligible`。
- **UE3** 被设置挡下的原因 `local-command-not-enabled` 与 `disabled` 只答给有使用资格的主体。
- **UE4** 每次使用都现场判定，不缓存。撤权在下一次判定时生效。
- **UE5** 不能判定时答 `unknown`，不答拒绝。

<a id="port-credentials"></a>

### `CredentialUse`（CU）

- **CU1** `acquire` 的用途是 `process-env`，或 `http-authorization` 带连接目标。HTTP 的句柄只对这份持有与这个连接目标有效。句柄能为一个出站请求授权，能回报对端的拒绝，能释放。
- **CU2** 没有凭据时答 `missing`。
- **CU3** 答复不退回组织、官方或其他租户的凭据。
- **CU4** 句柄不是秘密值。句柄、它的序列化形式与它的检视文本都不含秘密值。
- **CU5** 凭据被拒时答 `rejected`。
- **CU6** 不可读时答 `unknown`，不答 `missing`。

<a id="port-landing"></a>

### `ProcessLanding`（PL）

进程句柄给出标准输入、标准输出、已遮盖秘密的标准错误、根进程退出的信号，以及 `stop()`。`start` 的环境由非秘密配值与按变量名给出的凭据句柄组成。

- **PL1** `stop()` 请求停止该进程及其全部后代，答实际确认的范围：`tree-confirmed`、`root-only` 或 `unconfirmed`。确认了停止时，`exited` 会兑现。调用了 `stop()` 不证明进程已停。
- **PL2** 交出标准错误之前遮盖其中的秘密值。
- **PL3** 设施不成立时答 `facility-missing`，不起进程。
- **PL4** 落点不成立时答 `landing-invalid`，不静默落到宿主。不能判定时答 `unknown`。

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

- **T1** 失败只分两种：`not-sent` 表示请求没有离开，没有对端效果；`no-answer` 表示请求已离开而没有应答，效果未知。`call` 的失败只会是 `not-sent`，没有应答经 `answer` 交出 `no-answer`。
- **T2** 传输交出对端的原样应答，不分类。分类由 `classifyOutcome` 完成。
- **T3** `discover` 在旧对端上回退到 `initialize`。对端答需要授权时，失败是 `not-sent`、`authorization-required`，带授权发现。
- **T4** `cancelRequest` 发出取消通知，不证明对端已停止。`close()` 只关闭传输，不停止进程。进程由进程句柄的持有者停止。
- **T5** `getTaskResult` 答 `finished`（带原样应答）、`cancelled`、`not-finished` 或 `expired`。对端删除过期任务后答 `expired`，不当作失败或完成。

<a id="failure-codes"></a>

### 失败码总表

| 阶段       | 失败码                                                                                                                                                                                               | 出处           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 正文       | `malformed`、`name-mismatch`、`transport-unknown`、`auth-unknown`、`launch-missing`、`launch-unexpected`；类别端口另有资产规则的 `incomplete-reference`                                              | E2、E5         |
| 对端账号   | `credential-missing`                                                                                                                                                                                 | K1             |
| 识别与资格 | `not-available-to-you`、`blocked`、`unknown`                                                                                                                                                         | R1             |
| 连接条件   | `credential-unavailable`、`authorization-required`、`landing-unavailable`、`connection-unavailable`、`config-missing`                                                                                | R2             |
| 调用发起   | `correlation-key-in-use`、`cancelled`、`definition-changed`、`action-unavailable`、`mode-unsupported`                                                                                                | R2             |
| 发现       | `page-failed`、`page-limit-exceeded`、`pages-unfinished`、`action-limit-exceeded`、`action-invalid`、`duplicate-action-name`                                                                         | C1             |
| 采用       | `stale-revision`、`not-complete`；服务答复 `newer-adoption`、`superseded`、`listing-incomplete`                                                                                                      | C4、C5、S5     |
| 已发出调用 | `protocolError` 的 `peer-error`、`result-type-unknown`、`result-malformed`、`error-malformed`；`unknown` 的 `stream-broken`、`process-exited`、`abandoned`                                           | O4–O6          |
| 内容       | `ContentDefect` 的十种原因                                                                                                                                                                           | D4             |
| 端口       | `AdoptionView`：`unknown`；`CredentialUse`：`missing`、`rejected`、`unknown`；`ProcessLanding`：`landing-invalid`、`facility-missing`、`unknown`；`CatalogStore`：`unavailable`、`revision-conflict` | AV、CU、PL、CS |
| 传输       | `not-sent`（`connection-unavailable`、`authorization-required`）、`no-answer`（三种子因）                                                                                                            | T1             |

### 生命周期与所有权

- 本成员的函数不持有资源，不发起外部操作。
- `mergeListing` 认的是同一模块实例构造的清单。同一进程里加载两份本成员时，一份构造的清单在另一份里答 `not-complete`。
- `./testing` 的内存替身不耐久，只用于自测，不能装配进产品。内存 `CatalogStore` 替身不是 W2 的生产内存实现。

## 组合与验证

| 条款               | 验证                                                                                                     | 命令                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 入口与依赖         | `tests/public-entry.spec.ts` 核对三个入口的运行时导出                                                    | `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract` |
| V1–V3              | `tests/values.spec.ts`                                                                                   | 同上                                                                      |
| E1–E6              | `tests/endpoint.spec.ts`：每个拒绝原因一个反例，Schema 与解析规则一致                                    | 同上                                                                      |
| K1–K3              | `tests/keys.spec.ts`                                                                                     | 同上                                                                      |
| C1–C8              | `tests/catalog.spec.ts` 的性质测试与带种子的随机序列；`tests/conformance.spec.ts` 跑 `mergeListingCases` | 同上                                                                      |
| O1–O6              | `tests/classify.spec.ts` 跑 `classifyOutcomeCases` 并核对覆盖                                            | 同上                                                                      |
| D1–D5              | `tests/content.spec.ts`                                                                                  | 同上                                                                      |
| AV、UE、CU、PL、CS | `tests/conformance.spec.ts` 让五个套件跑内存替身，并用违约替身证明套件会变红                             | 同上                                                                      |

端口的实现方这样使用套件：从 `./testing` 取 `describe<端口>Conformance()`，为每个用例新建一份夹具，在自己的测试框架里逐个登记并运行 `run(fixture)`。用例失败时抛出 `node:assert` 的 `AssertionError`。夹具缺少某个用例需要的句柄时抛出 `NotApplicable`，这不算通过。

未覆盖：

- 服务条款 S1–S8 没有实现，本成员不能验证它们。它们由服务实现的测试验证。
- 传输条款 T1–T5 的契约测试与真实服务端夹具不在本成员。
- 真实对端、真实凭据、真实进程落点、耐久存储的行为都没有证据。替身通过不等于真实组合通过。

<a id="open-items"></a>

### 未封闭项

- 组页第 601 行：资产的 `deriveDeclarations(body, context)` 拿不到 MCP 动作清单，逐动作权限项不能经类别端口派生。本成员只提供 `actionPermissionItems`。拥有者：资产 SPEC 的拥有者与本成员的维护者。
- 组页第 445 行：任务处于 `input_required` 时，怎样取得任务的输入请求并经 `tasks/update` 带回答复。`TaskControl` 目前只答任务状态。拥有者：本成员的维护者，随任务扩展的实现确定。

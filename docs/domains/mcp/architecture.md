# MCP领域交接设计

状态：技术草案，未获技术接受。已接受职责沿[领域入口](README.md)。本页只维护事实拥有者、端口的实现方和跨领域交接。`@omne-harness/mcp-contract` 已有实现（候选，尚未取得技术接受）。`@omne-harness/mcp` 已实现（候选，尚未取得技术接受）：`EndpointInspection`、`ActionDiscovery`、`ActionInvoker`、`EndpointStatus`、`Connections` 与 `CatalogStore` 的内存实现，行为正文是它的 [SPEC](../../../packages/mcp/mcp/SPEC.md)。`@omne-harness/mcp-host-local` 已实现两种传输（候选，尚未取得技术接受），行为正文是它的 [SPEC](../../../packages/mcp/mcp-host-local/SPEC.md)。mcp-cordis-contract 尚未建立。成员分解、端口操作、对外接口和失败种类见[组工程设计](../../../packages/mcp/docs/architecture.md)，精确公开行为见各成员的候选 SPEC。

用词沿统一语言：[MCP 连接](../../../.meta_harness/design/ubiquitous_language/terms/reach-and-availability.md#ul-mcp-connection--mcp-连接--mcp-connection)、[MCP 动作清单](../../../.meta_harness/design/ubiquitous_language/terms/reach-and-availability.md#ul-mcp-action-catalog--mcp-动作清单--mcp-action-catalog)、[MCP 已知动作](../../../.meta_harness/design/ubiquitous_language/terms/reach-and-availability.md#ul-mcp-known-action--mcp-已知动作--mcp-known-action)、[凭据保管方](../../../.meta_harness/design/ubiquitous_language/terms/grounding-and-isolation.md#ul-credential-custodian--凭据保管方--credential-custodian)。接入点指 MCP 资产。

## 事实与责任

| 拥有者 | 权威事实与操作 | 消费者和交接 |
| --- | --- | --- |
| 资产/规则、身份授权 | 接入点身份/持有、配值资格、权限界、禁用和当前主体资格 | 接入点采用及每道使用边界消费，工作区文件不授予权利 |
| 接入点定义/采用 | 完整候选来源、定义/实现及专有设置的采用依据 | 装配消费；不拥有资产公共求值 |
| 凭据保管方与获准认证适配 | 每租户持有的 MCP 凭据、授权流程、同账号续期及秘密使用/释放 | 连接适配消费最小必要使用能力，清单与 MCP 交出的数据不带值 |
| 连接提供者 | 对端身份、连接代际、状态、监听/进程/连接资源；MCP 连接按租户与对端账号分开，不跨租户共用 | 发现和调用取得条件，连接不判调用终局 |
| 发现/采用协调者 | 合法取得的 MCP 动作清单、来源版本、当前可用集合、MCP 已知动作身份与定义的内容摘要及发布顺序 | 调用方经读口消费；与原调用捕获分开 |
| 动作接入的集成方 | 动作在调用方体系里的条目、逐动作准入与呈现 | 消费 MCP 的读口与调用口。它认识 MCP 与调用方双方，不在 MCP 内 |
| 原调用的调用方 | 调用身份、原消费位置、结果/账目、待消费及消费确认 | 保存 MCP 交回的结局及 `requestState`、`taskId`、发出代际；MCP 不保存原调用 |
| 读面与交付面 | 各自权威的合法投影、必要内容转换与披露 | 不反写权威、不重做动作、不以缓存授权 |

原租户、接入点 name 与持有、采用修订、对端/连接代际、动作身份及定义的内容摘要、原调用、原工作与消费位置各可核验。名称复用不使旧清理或响应命中新实例；路径、Context、插件实例、运行句柄不是租户身份或持久数据格式。非动作能力按明确桥接契约另行消费，不与动作身份混拼。

## MCP 声明的端口与实现方

MCP 是需求方。它用自己的词声明下面四个跨领域端口，由集成方实现。MCP 不认识实现方，只读端口交回的结论。依据层：架构[外域概念的进入方式](../../architecture/layers-and-dependencies.md#外域概念的进入方式)。操作与规则见[组工程设计](../../../packages/mcp/docs/architecture.md#mcp-声明的端口)。

| 端口（候选） | 实现方 | 交给 MCP 什么 | 不交什么 |
| --- | --- | --- | --- |
| `CredentialUse` | 凭据保管方（settings 的[秘密保管](../../../packages/assets/settings/SPEC.md#failure-and-recovery)）与获准的认证适配 | MCP 交来凭据配值与用途，Streamable HTTP 时另交连接目标。本端口按用途交回两种凭据句柄。句柄是本租户这份持有上的 MCP 凭据的一次受限使用能力。HTTP 凭据句柄只对这个连接目标有效，能为出站 HTTP 请求授权，能接收对端拒绝的回报，能释放。进程凭据句柄由 MCP 原样交给 `ProcessLanding`，MCP 不读它，用完释放。它怎样变成进程环境里的值，由本端口与 `ProcessLanding` 的实现方约定。对端账号只由 MCP 从认证方式与凭据配值得出，不由本端口答复。认证方式为 `none` 时，MCP 不调用本端口，对端账号取固定值 `anonymous`，凭据缺值不是失败 | 秘密值本身；组织、官方或其他租户的凭据；授权流程与续期的步骤 |
| `ProcessLanding` | [执行环境](../execution-environments/README.md) | 本机命令型接入点的本机进程，按启动声明（命令、参数、工作目录、所需设施）落在获准的落点与设施上。起进程时，用 MCP 交来的凭据句柄把秘密值注入进程环境。交回的进程句柄能停止整棵进程树，并报告实际确认的停止范围。stderr 交给 MCP 之前，由本端口遮盖其中的秘密值 | 落点选择权；失败后落到宿主的降级；秘密值（不经过 MCP） |
| `AdoptionView` | 资产求值与[装配](../assembly-and-handoff/README.md) | 已采用的接入点列表，以及按接入点引用取得的单项，未采用时单项答 `not-adopted`。每项是持有身份、采用修订、正文、三项固定设置（连接目标、凭据、连接超时）的配值，以及 stdio 进程环境所需的非秘密配值。每项配值如实交出三种状态之一：缺失、不合法（带原文）、有值。正文或任一配值变化时，采用修订随之变化，MCP 据此换用新的 MCP 连接 | 求值过程；使用资格；MCP 不保存采用 |
| `UseEligibility` | [身份与授权](../identity-and-authorization/README.md) | 本次使用这个接入点的当前资格：`granted`、`refused`（带原因）或 `unknown`。`refused` 的原因分两类：无使用资格（`not-eligible`）；有资格但被设置挡下（`local-command-not-enabled`，即本机命令型接入点未由使用租户开启；或 `disabled`）。MCP 在 `ProcessLanding.start` 之前必须得到 `granted` | 缓存的结论，撤权在下一次使用时生效；接入点是否存在（对无权主体，答复不随它变）；对无使用资格的主体，被设置挡下的原因 |

`AdoptionView` 只回答采用，`UseEligibility` 只回答接入点这一级的使用资格，两者各自交出结论。逐动作的权限项由 MCP 声明，判定不在 MCP。

本组自己的 `McpTransport` 由组内的本地宿主成员实现，不是跨领域端口。

MCP 还声明需求端口 `CatalogStore`，保存自己的 MCP 动作清单。它的问题、答复与失败见[组工程设计](../../../packages/mcp/docs/architecture.md#mcp-声明的端口)。实现方如下：

- 组内通用实现成员的内存实现。它只在一次运行内保存清单，进程重启后清单回到「未取得」。
- 耐久实现：接存储契约 [sql-contract](../../../packages/storage/sql-contract/README.md)，是剩余义务。存储契约只提供存储机制，清单的含义、键与修订条件仍归 MCP。拥有者：MCP 组的维护者。

## MCP 交出的能力

| 能力（候选） | 接收方 | 交接 |
| --- | --- | --- |
| `EndpointInspection` | 资产与装配 | 按 assets [类别提供方](../../../packages/assets/assets/SPEC.md#category-provider)接入 MCP 类别。加载期就能判定接入点可能启动本机命令。声明三项固定设置，并在 MCP 动作清单已取得时声明逐动作权限项 `execute:<对端动作名>`。现行 `deriveDeclarations` 不接收动作清单，见下文剩余义务 |
| `ActionDiscovery` | 调用方 | 读口：MCP 动作清单视图（取得状态、清单修订、采用依据、新鲜度、每个 MCP 已知动作的原样定义、定义的内容摘要与可用性）、刷新结论与对端视图。首次发现由调用方经 `refresh` 触发，之前视图答「未取得」。接入点未采用时答 `not-available-to-you` |
| `ActionInvoker` | 调用方 | 调用口：按调用方给出的接入点引用、对端动作名、参数、预期的定义的内容摘要与关联键发出协议请求，交回「未发出」或调用结局；带回输入答复；取消在途调用。在途调用按（租户、主体、关联键）分开，取消只对同一租户与同一主体有效，不要求当前使用资格。接入点未采用时答 `not-available-to-you`。状态口：任务的查询、取结果、交回输入答复与取消。调用的截止由调用方经 `signal` 给出 |
| `EndpointStatus` | 管理与查询读面 | 接入点、MCP 连接与 MCP 动作清单的状态，不含秘密值。对无权主体和未采用的接入点返回 `not-available-to-you`，与「不存在」不可区分。主体有使用资格、但接入点被设置挡下时，给出该原因 |

MCP 不知道接收方是谁。MCP 交出可作稳定键的身份与定义的内容摘要。把动作接入调用方体系（名字、条目形状、准入与呈现）的那一层归集成方，不在 MCP 内。依据层：同上；领域[模块角色与事实归属](README.md#模块角色与事实归属)。

对端答需要授权时，MCP 只交出授权发现的结果（受保护资源元数据、签发者与 scope），作为一种结局报给调用方。授权流程、令牌保管与续期归凭据设置入口与凭据保管方。

逐动作权限的声明路径有一项剩余义务：资产 SPEC 的 `deriveDeclarations(body, context)` 不接收 MCP 动作清单，须扩展上下文或另立接缝。拥有者：资产 SPEC 的拥有者与 mcp-contract 的维护者。规则见[组工程设计](../../../packages/mcp/docs/architecture.md#设置声明与逐动作权限)。

## 组合保证的承担者

| 组合保证 | 承担者 | 参与方 | 失败归谁 |
| --- | --- | --- | --- |
| MCP 连接不跨租户、不跨对端账号；MCP 动作清单按租户、对端账号与接入点持有分开 | MCP 的连接提供者与发现协调者 | 凭据保管方核实际秘密的租户绑定 | 绑定不符时凭据保管方拒绝；MCP 不发起 |
| 断流后效果未知、不自动重发 | 原调用的调用方 | MCP 报 `unknown`（带子因）并记录对协议的偏离，见 [Q-MC04](../../../packages/mcp/docs/architecture.md#q-mc04-原调用dummy可靠结果和恢复的组合协议) | 由原调用的合法调用方决定核查、补偿或另起动作 |
| 需要输入与长任务不丢失 | 原调用的调用方 | MCP 交回 `requestState` 或 `taskId` 与发出代际，见[领域流程 F-MC04](key-flows.md#f-mc04-动作准入至可靠结果) | 保存失败的处置归调用方 |
| 本机进程不落到未获准的位置 | 执行环境 | MCP 在资格为 `granted` 之后交出启动声明与 `env`（非秘密配值加凭据句柄） | 落点不成立时执行环境拒绝；MCP 不连接 |
| MCP 已知动作跨进程重启保留 | `CatalogStore` 的耐久实现（剩余义务） | MCP 的发现协调者按修订条件整份写入 | 写入不可用时发现协调者不报新修订。当前只有内存实现，不兑现这项保证 |
| 撤采用、禁用或采用修订变化后不再使用旧连接 | MCP 的连接提供者 | 资产求值与身份授权给出当前结论 | MCP 在下一次使用边界之前关闭连接与进程；关闭只报告实际确认的范围 |
| 逐动作权限生效 | 动作调用的准入，见领域[主路径与交接](README.md#主路径与交接)第 3 步 | MCP 声明权限项；资产求值给出各层配值 | 清单未取得时没有 MCP 已知动作，也没有权限项；判定不归 MCP |

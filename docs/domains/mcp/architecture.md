# MCP领域交接设计

状态：技术草案，未获技术接受。已接受职责沿[领域入口](README.md)。本页只维护事实拥有者、端口的实现方和跨领域交接。成员分解、端口操作、服务和失败种类见[组工程设计](../../../packages/mcp/docs/architecture.md)，精确公开行为尚未分配正式成员。

用词沿统一语言：[MCP 连接](../../../.meta_harness/design/ubiquitous_language/terms/reach-and-availability.md#ul-mcp-connection--mcp-连接--mcp-connection)、[MCP 动作清单](../../../.meta_harness/design/ubiquitous_language/terms/reach-and-availability.md#ul-mcp-action-catalog--mcp-动作清单--mcp-action-catalog)、[MCP 已知动作](../../../.meta_harness/design/ubiquitous_language/terms/reach-and-availability.md#ul-mcp-known-action--mcp-已知动作--mcp-known-action)、[凭据保管方](../../../.meta_harness/design/ubiquitous_language/terms/grounding-and-isolation.md#ul-credential-custodian--凭据保管方--credential-custodian)。接入点指 MCP 资产。

## 事实与责任

| 拥有者 | 权威事实与操作 | 消费者和交接 |
| --- | --- | --- |
| 资产/规则、身份授权 | 接入点身份/持有、配值资格、权限界、禁用和当前主体资格 | 接入点采用及每道使用边界消费，工作区文件不授予权利 |
| 接入点定义/采用 | 完整候选来源、定义/实现及专有设置的采用依据 | 装配消费；不拥有资产公共求值或 Agent Definition 身份 |
| 凭据保管方与获准认证适配 | 每租户持有的 MCP 凭据、同账号续期及秘密使用/释放 | 连接适配消费最小必要使用能力，清单及 Tool 普通数据不带值 |
| 连接提供者 | 对端身份、连接代际、状态、监听/进程/连接资源；MCP 连接按租户与对端账号分开，不跨租户共用 | 发现和调用取得条件，连接不判 Run/Job/调用终局 |
| 发现/采用协调者 | 合法取得的 MCP 动作清单、来源版本、当前可用集合、MCP 已知动作身份及发布顺序 | 工具发现读面和动作桥接消费；与原调用捕获分开 |
| 动作桥接与 Tool 准入 | 接入点/对端能力关联、动作映射、原主体和匹配输入的交接 | Tool/实际提供者保管真实调用、控制、效果和结果 |
| 原调用/结果消费者 | 调用身份、原消费位置、结果/账目、待消费及消费确认 | 会话或独立程序接续；归档后不恢复推进 |
| 读面/Context/交付面 | 各自权威的合法投影、必要内容转换与披露 | 不反写权威、不重做动作、不以缓存授权 |

原租户、接入点 name 与持有、采用修订、对端/连接代际、动作身份及定义来源、原调用、原工作与消费位置各可核验。名称复用不使旧清理或响应命中新实例；路径、Context、插件实例、运行句柄不是租户身份或持久数据格式。非动作能力按明确桥接契约另行消费，不与动作工具身份混拼。

## MCP 声明的端口与实现方

MCP 是需求方。它用自己的词声明下面四个跨领域端口，由集成方实现。MCP 不认识实现方，只读端口交回的结论。依据层：架构[外域概念的进入方式](../../architecture/layers-and-dependencies.md#外域概念的进入方式)。操作与规则见[组工程设计](../../../packages/mcp/docs/architecture.md#mcp-声明的端口)。

| 端口（候选） | 实现方 | 交给 MCP 什么 | 不交什么 |
| --- | --- | --- | --- |
| `CredentialUse` | 凭据保管方（settings 的[秘密保管](../../../packages/assets/settings/SPEC.md#failure-and-recovery)）与获准的认证适配 | 凭据句柄与对端账号。句柄是本租户这份持有上的 MCP 凭据的一次受限使用能力。认证方式为 `none` 时，对端账号不由本端口给出，MCP 取固定值 `anonymous` | 秘密值本身；组织、官方或其他租户的凭据 |
| `ProcessLanding` | [执行环境](../execution-environments/README.md) | 本机命令型接入点的本机进程，落在获准的落点与设施上。执行环境起进程时，用 MCP 交来的凭据句柄把秘密值注入进程环境 | 落点选择权；失败后落到宿主的降级；秘密值（不经过 MCP） |
| `AdoptionView` | 资产求值与[装配](../assembly-and-handoff/README.md) | 已采用的接入点及其正文，连同设置求值得出的非秘密配值与采用依据 | 求值过程；使用资格；MCP 不保存采用 |
| `UseEligibility` | [身份与授权](../identity-and-authorization/README.md) | 本次使用这个接入点的当前资格：`granted`、`refused`（带原因）或 `unknown`。本机命令型接入点未由使用租户开启时答 `refused`，原因是 `local-command-not-enabled`。MCP 在 `ProcessLanding.start` 之前必须得到 `granted` | 缓存的结论，撤权在下一次使用时生效；接入点是否存在（对无权主体，答复不随它变） |

`AdoptionView` 只回答采用，`UseEligibility` 只回答使用资格，两者各自交出结论。逐动作的准入不在这两个端口里，归 Tool 的准入。

本组自己的 `McpTransport` 由组内的本地宿主成员实现，不是跨领域端口。

## MCP 交出的能力

| 能力（候选） | 接收方 | 交接 |
| --- | --- | --- |
| `EndpointInspection` | 资产与装配 | 按 assets [类别提供方](../../../packages/assets/assets/SPEC.md#category-provider)接入 MCP 类别。加载期就能判定接入点可能启动本机命令 |
| `ActionDiscovery` | 将来的 Tool 工具目录桥接来源；独立程序 | 当前 MCP 动作清单与投影出的工具条目形状。接入 Tool 待新 RFC，见下节 |
| `ActionInvoker` | 将来的 Tool 实现提供者；独立程序 | 按已准入的固定请求发出协议请求，交回调用结果。原调用、等待和结果由 Tool 保管 |
| `EndpointStatus` | 管理与查询读面 | 接入点、MCP 连接与 MCP 动作清单的状态，不含秘密值。对无权主体返回 `not-available-to-you`，与「不存在」不可区分 |

MCP 不知道接收方是 Tool 还是独立程序。依据层：同上。

## 与 Tool 接入的两项差异

两项差异都来自 Tool 的现行契约，都不能在 MCP 一侧消除。

1. 凭据端口不同。Tool 的 [`ToolCredentials`](../../../packages/tool/tool-contract/SPEC.md#第三方凭据端口) 依次从租户、该租户所属组织、官方来源选择配置引用。MCP 本租户缺凭据时按缺凭据失败，不退回组织、官方或其他租户的凭据（领域[模块角色与事实归属](README.md#模块角色与事实归属)）。[MCP 凭据](../../../.meta_harness/design/ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)也只挂在租户层的持有上，组织层不持有。所以 MCP 用专用端口 `CredentialUse`，不复用 `ToolCredentials`。
2. 动作没有资产版本。Tool 的定义采用全等于资产版本（[定义完整性与呈现](../../../packages/tool/tool-contract/SPEC.md#定义完整性与呈现)），绑定登记表的键是来源层、能力身份与资产版本（[P15 配置声明与合法装载](../../../packages/tool/tool-contract/SPEC.md#p15-配置声明与合法装载)）。MCP 动作不是资产，没有自己的资产版本，现行键装不下它。[RFC-0012](../../rfcs/RFC-0012-tool-dynamics.md#决定范围) 把 MCP 动态规则列为不采用范围，并把 MCP 动作的常驻规则留给[后续提案](../../rfcs/RFC-0012-tool-dynamics.md#后继关系与维护)。因此 MCP 动作接入 Tool 需要工具目录的「桥接来源」，它的键不含资产版本，须走新 RFC。

新 RFC 的拥有者是 Tool 契约的维护者，MCP 技术拥有者参与。RFC 采用之前，MCP 动作不进入 Tool 的工具目录，`ActionDiscovery` 与 `ActionInvoker` 只供独立程序消费。

## 组合保证的承担者

| 组合保证 | 承担者 | 参与方 | 失败归谁 |
| --- | --- | --- | --- |
| MCP 连接与 MCP 动作清单不跨租户、不跨对端账号 | MCP 的连接提供者与发现协调者 | 凭据保管方核实际秘密的租户绑定 | 绑定不符时凭据保管方拒绝；MCP 不发起 |
| 断流后效果未知、不自动重发 | Tool 的原调用 | MCP 报 `unknown` 并记录对协议的偏离，见 [Q-MC04](../../../packages/mcp/docs/architecture.md#q-mc04-原调用dummy可靠结果和恢复的组合协议) | 由原调用的合法调用方决定核查、补偿或另起动作 |
| 需要输入与长任务不丢失 | Tool 的原调用 | MCP 交回 `requestState` 或 `taskId`，见[领域流程 F-MC04](key-flows.md#f-mc04-动作准入至可靠结果) | 保存失败的处置归 Tool 的[内部等待与有效答复](../../../packages/tool/tool-contract/SPEC.md#内部等待与有效答复) |
| 本机进程不落到未获准的位置 | 执行环境 | MCP 在资格为 `granted` 之后交出启动声明与 `env`（非秘密配值加凭据句柄） | 落点不成立时执行环境拒绝；MCP 不连接 |
| MCP 动作进入工具目录 | Tool 契约的维护者（新 RFC） | MCP 交出清单与投影 | RFC 采用前不接入 |

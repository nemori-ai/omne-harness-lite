# data.mcp-endpoint v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.mcp-endpoint, 1)`——
  `family = data`、`topic = mcp-endpoint`、规范路径 `spec/data/mcp-endpoint/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-23 起草）——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-002 rev 16、PF-006 rev 17** 为准；PF-016 rev 5、PF-005 rev 5、PF-012 rev 10 只引
- **精确语义依赖**：

  | 坐标 | 消费的条款 | 取它的什么 | 本契约怎么用 |
  |---|---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.asset-model · v1`（**candidate**） | [S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳)、[S-12](../../asset-model/v1/contract.md#s-12-属性声明由正文推出)、[S-13](../../asset-model/v1/contract.md#s-13-设置项类别)、[S-14](../../asset-model/v1/contract.md#s-14-属性配值)、[S-15](../../asset-model/v1/contract.md#s-15-disabled-是保留项名)、[S-18](../../asset-model/v1/contract.md#s-18-资产持有)、[S-20](../../asset-model/v1/contract.md#s-20-出厂格与工作区格的持有)、[S-23](../../asset-model/v1/contract.md#s-23-凭据引用) | mcp 那一支正文外壳、属性声明的形状与推出义务、设置项类别、属性配值与留存、保留项、持有的键、工作区格的限制、凭据引用 | 本契约的 `McpEndpoint` 就是 S-10 里 mcp 那一支所携带的值；[S-14](#s-14-推出规则六类项) 按 S-12 的形状给推出规则；凭据取值域引用它的 `$defs/CredentialRef`（写在推出的声明里，不在本契约 Schema 里） |
  | `omne-harness-lite-design-2026-09-15 · data.tool-definition · v1`（**candidate**） | [S-14](../../tool-definition/v1/contract.md#s-14-时长的表示)、[S-15](../../tool-definition/v1/contract.md#s-15-执行权限) | 时长的表示；执行权限三档 | `$ref` 它的 `$defs/Duration`（两项超时）与 `$defs/ExecutePermission`（逐动作执行权限的作者默认） |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [S-8](../../identity-values/v1/contract.md#s-8-tenantrole)、[S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)、[S-33](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开) | 租户角色两值；不透明标识的交换表示与空白码点集合；表示层校验与判定分开 | `$ref` 它的 `$defs/TenantRole`（「能不能用」的取值）；OAuth 绑定号与各处「空白」按 S-31 的散文自定义，**不 `$ref` 它的 `OpaqueIdentifier`**（主线 2026-09-23 S1-a 口径） |
  | `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1` | [S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围) | 时刻的规范形式 | `$ref` 它的 `$defs/Instant`：`fetchedAt`、`since` |

  `data.asset-model` v1 与 `data.tool-definition` v1 都是**同批候选**，定型前它们的条款号与 `$defs` 名可能随评审变；变了在[验证入口](../verification.md#变化的影响)登记影响。
  **本契约不依赖 `data.content-blocks`**：能力标识的形状经 `data.asset-model` 间接取得，本契约自己不写出 `CapabilityId`
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.mcp-endpoint/v1#S-9`。
  缺口 `G-n`、性质 `P-n`、消费者核对场景 `CS-n`、`malformed` 的来由 `M1`～`M13`（[S-20](#s-20-表示层拒绝值与判定次序)）同此范围。
  **本文引另一份契约的条款一律带坐标，裸号只指本契约**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| MCP 是外部工具来源的接入点；接入点是资产、动作不是；身份是接入点的 name，动作清单、连接参数、凭据都不是身份；每个动作一个工具条目；自带的属性（连接目标与凭据是落点与身份类，两项超时是偏好类；能不能用；逐动作执行权限随对端此刻的动作而有）；本版桥到哪一步随采用的客户端；不组合任何资产 | [PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp) | S-1～S-3、S-7、S-8、S-14、S-16 |
| MCP 凭据：一份持有一份值、静态或经 OAuth 取得是同一项、工作区一级取不了、还没取或失效即连不上、续期不算换值、随持有生灭、值永不呈现、组织层能否持有未决 | [PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) · [§九](../../../../product/PF-002-assets-settings-and-permissions/design.md#九未决项) | S-6、S-12、S-13、[G-3](#八已知缺口) |
| 设置项分四类、资产声明每一项时必须标类别 | [PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别) | S-14 |
| 项的目录不需要单独维护；项的存在性由组装决定 | [PF-002 §5.2 两个推论](../../../../product/PF-002-assets-settings-and-permissions/design.md#由此得到两个推论) | S-15 |
| 工作区那一级不参与权限计算；落点与身份类与 `immutable` 同样滤掉；工作区自己提供的资产权限取最严值、不认它自己声明的出厂值 | [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) | S-8、S-17 |
| 对端动作在动作空间里是工具条目；随接入点持有与授权；每次开始前与可用性一起重算；连不上即不可用、替换件照最近一次拿到的清单装 | [PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作) · [连不上就是不可用](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用) | S-9、S-11 |
| 每一次执行尝试也算一次「开始」（**主线 2026-09-23 裁定 B-M03：动作集「一次运行之内不变」读作「一次尝试之内不变」**，产品修订待落） | [PF-012 §5.7 每一次尝试开始都要做四件事](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事) | S-9、S-15 |
| MCP 客户端的采用：官方 SDK 上自写薄桥；本版桥 tools 列举与调用、取消与日志通知、静态鉴权（请求头 / stdio 环境变量）、stdio 与 Streamable HTTP、elicitation、进度、OAuth；不桥 resources 条目、prompts、sampling、roots、任务式动作、旧式 SSE；stdio 一律在据点机拉起 | [D-037](../../../../record/decisions/mcp-client-adoption/decision.md) | S-3～S-5、S-9 |
| 统一语言正式名 | [MCP](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) · [MCP 凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential) · [工具定义](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition) · [资产持有](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding) · [属性配值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment) · [能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) | 全部英文名 |
| 规格形式；部署边界；租户隔离 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) · [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | S-18～S-21；[第五节](#五装配给与协议给) |

> **没有产品行、或产品行不足以单独支撑的条款，逐条点名：**
>
> | 条款 | 依据来自哪 |
> |---|---|
> | [S-9](#s-9-动作清单副本) 的 `not_fetched` 一支 | **主线 2026-09-23 追加裁定**：「还没取过」是显式取值，不是缺席 |
> | [S-11](#s-11-动作条目名) 动作条目名的拼法与词法 | **起草简报的账本**：「接入点:动作」、能力标识名词法允许 `:`、禁 `/`（主线 2026-09-23 对 `data.asset-model` S-2 的改判，那边待对齐，见 [G-6](#八已知缺口)） |
> | [S-16](#s-16-逐动作项按动作名键) 逐动作项按动作名键、动作消失再出现原配值照旧 | **主线 2026-09-23 裁定 A-G12** |
> | [S-7](#s-7-两项超时的作者默认)、[S-8](#s-8-两项权限的作者默认) 作者默认写在正文里、[S-13](#s-13-凭据配值的取值域) 凭据取值域 | **规格层推导**：`data.asset-model/v1#S-12` 要求每一项声明带作者给的 `default`，`data.asset-model/v1#S-23` 第 2 条把凭据类项「还没取」的写法交给本契约；理由写在各条正文里 |
> | [S-6](#s-6-正文不收凭据)、[S-9](#s-9-动作清单副本) 的「不在正文里」 | **规格层推导，与起草简报账本不同**，理由写在两条正文里，已报主线改判 |
> | [S-18](#s-18-规范表示)～[S-21](#s-21-表示层拒绝不是判定也不修补) | **SYS-SPEC** |

## 一、目的与消费者

### 这份契约拥有什么

**MCP 接入点这一类资产的数据形状**：

1. **接入点正文**（`McpEndpoint`）——作者写下的连接目标，以及接入点四项自带属性里三项的作者默认值；
2. **连接目标的两种传输**（`McpTransport`）；
3. **动作清单副本**（`ActionSnapshot`）与其中每一项**对端动作描述**（`McpToolDescriptor`）的形状；
4. **动作条目名**（`McpActionName`）的拼法；
5. **OAuth 绑定**（`OAuthBinding`）的形状与三个状态的含义；
6. **凭据配值的取值域**——「还没取」怎样作为一个显式取值进去；
7. **属性项推出规则**——一个接入点有哪些设置项、哪些权限项，各自类别、取值域与默认值；
8. 一个值不合这些形状时，**拒绝值叫什么**。

它是一份**数据契约**：没有操作、没有提交点、没有状态转移，**因此不需要插件**。

**它不拥有**：

| 不拥有 | 归谁 |
|---|---|
| 连接、列举、刷新副本、把动作投影成工具定义、调用动作、判可用性、OAuth 流程与状态迁移 | [`capability.mcp-bridge`](../../../capabilities/mcp-bridge/v1/contract.md) v1（同一执行者同批起草） |
| 副本存在哪、以什么为键、谁写 | 同上（[`capability.mcp-bridge/v1#S-7`](../../../capabilities/mcp-bridge/v1/contract.md#s-7-动作清单持久副本)） |
| 凭据本体的存储、加密、解引用与续期写回 | 凭据保管方的提供者设计（`data.asset-model/v1#S-23` 第 7 条）；OAuth 那一路的义务见 `capability.mcp-bridge` |
| 资产记录、版本线、持有与配值的写路径 | `data.asset-model` v1 与 `capability.asset-governance`（同批，不在本工作树） |
| 属性项的层级求值（谁覆盖谁、权限怎样求交、工作区最严值怎样取） | `capability.asset-evaluation`（同批，不在本工作树） |
| 一次尝试里 agent 面前有哪些条目、按尝试钉住 | 注册表（`capability.asset-registry`，同批，不在本工作树） |
| MCP 协议本身（握手、JSON-RPC、分页、通知的线上形状） | 官方 SDK（D-037）；本契约只在需要时引协议版本 |

### 消费者

| 消费者 | 消费什么 |
|---|---|
| `capability.mcp-bridge` v1 | 全部形状：连接用 [S-3](#s-3-连接目标两种闭合)～[S-5](#s-5-streamable_http)，副本用 [S-9](#s-9-动作清单副本)、[S-10](#s-10-对端动作描述)，投影用 [S-11](#s-11-动作条目名) 与 [S-8](#s-8-两项权限的作者默认)，OAuth 用 [S-12](#s-12-oauth-绑定)、[S-13](#s-13-凭据配值的取值域) |
| `data.asset-model` v1 | mcp 那一支正文由 `body`（不透明）换成本契约的 `McpEndpoint`（它的 G-5 的闭合，**那边出新版或对齐时做**） |
| `capability.asset-evaluation`（同批） | [S-14](#s-14-推出规则六类项)～[S-17](#s-17-工作区格上的这些项) 推出的属性声明；逐动作项要的那份动作集 |
| `capability.asset-governance`（同批） | 凭据配值写入时按 [S-13](#s-13-凭据配值的取值域) 判取值域；`credential_plaintext` 这个拒绝值 |
| 注册表（同批） | 动作条目名（[S-11](#s-11-动作条目名)）；副本的两支（[S-9](#s-9-动作清单副本)）——`not_fetched` 与空清单是两回事 |
| 设置页与交付面（PF-002 §6.1、PF-016，无契约） | 属性声明长出表单；OAuth 绑定的三个状态与 `since` 用于呈现「有没有、哪一层的、什么时候取的」 |
| `data.call-accounts` v1 | 一笔 MCP 对端收的钱记到哪个接入点：那边用接入点的能力标识规范串，**不用**本契约的动作条目名（两者拼法相近、含义不同，见 [S-11](#s-11-动作条目名)） |

> 上表没有一行是本契约的依赖：方向一律是消费者 → 本契约，登记在各消费者自己的 catalog 条目里。

## 二、含义与使用范围

**适用范围**：一个部署之内。本版完整交付是单机，但每一条的**领域语义在跨进程之后必须原样成立**；
哪些结论在单机由装配给出、分布式后必须由协议重新兑现，列在[第五节](#五装配给与协议给)。

### 规格层 token 与词条的对应

交换表示用 token，对外文档用词条名，**两者不得互相替代**。

| 规格层 token | 词条 / 产品正文的说法 |
|---|---|
| `McpEndpoint` | [MCP · MCP](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) 这一类资产的一份正文（「接入点正文」**无词条**） |
| `McpTransport` | PF-002 §4 MCP 的「**连接目标**」的取值 |
| `ActionSnapshot` | PF-006 §6.13 的「**最近一次拿到的那份动作清单**」（「动作清单持久副本」**无词条**） |
| `McpToolDescriptor` | 对端动作——PF-002「它提供的动作」的一项（**无词条**；它不是[工具定义](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)，工具定义是投影的产物） |
| `McpActionName` | 那个动作在[动作空间](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-action-space--动作空间--action-space)里的工具条目的名字（**无词条**） |
| `OAuthBinding` | PF-002「经 OAuth 取得」那一路的流程与状态（**无词条**；**不裸写「授权」「OAuth 登录」**，按 [MCP 凭据词条](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)的注意） |
| 凭据配值的值 | [MCP 凭据 · MCP Credential](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)——它是一份[资产持有](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)上的一条[属性配值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment) |
| `use` 项 | PF-002 §4 MCP 权限「**能不能用**」（§5.7 与「谁可以用」列为同类） |
| `execute:<对端动作名>` 项 | PF-002 §4 MCP「**每一个动作的执行权限**」 |

**上表标「无词条」的五个是规格层的名字**，本契约与 Schema 里**不给它们「中文 · English」那种词条式标题**，
也**不在这里给它们下词条式定义**——它们的含义就是各自条款写的形状；是否立词条已报主线。

### 与相近概念的差异

- **接入点正文 ≠ 接入点在一份持有上的样子。**正文是作者发布的、随版本不变的内容；一份持有上还有配值（连接目标可以被改、凭据只在持有上）与桥为它存的动作清单副本。**这三样不混在一个值里**（[S-6](#s-6-正文不收凭据)、[S-9](#s-9-动作清单副本)）。
- **动作清单副本 ≠ 工具定义。**副本是对端给的原话；工具定义是桥按投影规则从副本算出来的（`capability.mcp-bridge`）。
- **`not_fetched` ≠ 空清单。**前者是「从没拿到过，不知道有什么」，后者是「拿到了，对端确实一个动作也没有」（[S-9](#s-9-动作清单副本)）。
- **动作条目名 ≠ 能力标识规范串。**`github:create_issue` 是一个工具条目的名字，不是一个资产的身份；`data.call-accounts` 记一笔账时写的是接入点那个能力标识的规范串（[S-11](#s-11-动作条目名)）。
- **凭据配值的值 ≠ 凭据。**值是一个凭据引用，或「还没取」；凭据本体不进任何一份配值（[S-13](#s-13-凭据配值的取值域)）。
- **OAuth 绑定 ≠ 凭据。**绑定是一次取值流程与它取得那一份的状态，里面既没有凭据本体，也没有凭据引用（[S-12](#s-12-oauth-绑定)）。
- **`use` 项 ≠ 逐动作执行权限。**前者答「这个租户能不能用这个接入点」，后者答「每一次调用这个动作要不要问人」。

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `McpEndpoint` | 接入点正文 | [S-1](#s-1-接入点正文)、[S-2](#s-2-身份只在能力标识上)、[S-6](#s-6-正文不收凭据)～[S-8](#s-8-两项权限的作者默认) |
| `McpTransport` | 连接目标 | [S-3](#s-3-连接目标两种闭合)～[S-5](#s-5-streamable_http) |
| `ActionSnapshot` | 动作清单副本 | [S-9](#s-9-动作清单副本) |
| `McpToolDescriptor` | 对端动作描述 | [S-10](#s-10-对端动作描述) |
| `McpActionName` | 动作条目名 | [S-11](#s-11-动作条目名) |
| `OAuthBinding` | OAuth 绑定 | [S-12](#s-12-oauth-绑定) |
| 凭据配值的取值域 | `CredentialRef` 或 `{ "kind": "not_fetched" }` | [S-13](#s-13-凭据配值的取值域) |

### S-1 接入点正文

**`McpEndpoint` 是一份 MCP 接入点资产的正文：`{ transport, timeouts, permissions }`，三个成员都必填、不收别的成员。**

| 成员 | 含义 | 条款 |
|---|---|---|
| `transport` | 作者写下的**连接目标**——它是「连接目标」这一项设置的作者默认值 | [S-3](#s-3-连接目标两种闭合) |
| `timeouts` | `{ connect, call }`：两项偏好类设置的作者默认值 | [S-7](#s-7-两项超时的作者默认) |
| `permissions` | `{ use, execute }`：两项权限的作者默认值 | [S-8](#s-8-两项权限的作者默认) |

- **它就是 `data.asset-model/v1` 的 [`AssetContent`](../../asset-model/v1/contract.md#s-10-八类正文的外壳) 里 `category = mcp` 那一支所携带的值。**那一支此刻写作不透明的 `body`；
  本契约成立后，那边把 `body` 换成对本条的引用（它的 G-5 的闭合，成员名归那边定）——**在那之前，本契约不替那边改名**。
- **一份正文是作者发布下来的内容，随那一版不变**（`data.asset-model/v1#S-9`）。**所以随对端而变、随持有而异的东西都不在这里**：
  凭据（[S-6](#s-6-正文不收凭据)）与动作清单副本（[S-9](#s-9-动作清单副本)）。
- **正文里写的都是默认值，不是生效值。**持有它的各格按[三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值)配值、运行时求值；生效的连接目标可以不是 `transport`（组织在自己那一格改了它），生效的执行权限可以比 `permissions.execute` 更严。

### S-2 身份只在能力标识上

**接入点的身份是它的[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)（类别 `mcp` ＋ name），住在资产记录上（`data.asset-model/v1#S-8`），不在正文里。**

- **正文里没有名字字段。**[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp) 的身份行：接入点的 name 是身份，**动作清单、连接参数、凭据都不是**。
  换一份实现，这三样都可以全不一样——正文改连接目标，不改变「是不是同一个接入点」。
- **消费者不得用 `transport` 判断两份正文是不是同一个接入点**，也不得把 URL 或命令拼进任何身份键。

### S-3 连接目标两种，闭合

**`McpTransport` 按 `kind` 判别，本版恰两种：`stdio`、`streamable_http`。**依据是 [D-037](../../../../record/decisions/mcp-client-adoption/decision.md) 复选卡片勾选的「stdio 与 Streamable HTTP 传输」。

- **其余一切传输（含旧式 SSE）拒绝，拒绝值 `transport_unknown`**——D-037 明写旧式 SSE 不桥；`kind` 缺席是 `malformed`（M2）。
- **它是「连接目标」这一项[落点与身份类](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)设置的取值域**（[S-14](#s-14-推出规则六类项)）：
  正文里的那一份是作者默认，各格可以配另一份；**工作区那一格配不了**（[S-17](#s-17-工作区格上的这些项)）。
- **换传输种类就是换连接目标**：一格把 stdio 改成 streamable_http 是一次改值，同一个接入点、同一份持有。

### S-4 stdio

**`{ kind: "stdio", command, args, env? }`：由[会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)的进程在据点机上拉起一个子进程，经它的标准输入输出通信**（本版取值，[D-037](../../../../record/decisions/mcp-client-adoption/decision.md)；「可换落点」是将来的拓展点，不在本版）。

| 成员 | 必填 | 含义 |
|---|---|---|
| `command` | 是 | 要拉起的程序。**至少含一个不属于 `data.identity-values/v1#S-31` 空白码点集合的字符**；空串或全是空白的拒绝值是 **`command_empty`** |
| `args` | 是 | 按次序交给程序的参数，**原样传递**；可以为空数组，单项可以是空串 |
| `env` | 否 | 作者给的**非秘密**环境变量：名 → 值。名非空、不含 `=` 与 NUL；值不含 NUL。**不声明＝作者不加任何变量**——这是「没有」，不是「补一个空表」 |

- **拉起时的完整环境不由本条定**：据点进程自己的环境变量哪些可以传下去、凭据怎样作环境变量出示，归 `capability.mcp-bridge`；本条只定作者给的那一部分。
- **`command` 不被解释成 shell 命令行**：它是一个程序，`args` 是它的参数表；**不做 shell 展开、不做变量插值**（`$HOME` 原样是五个字符）。
  这一条是本契约的推导：插值要读据点进程的环境，会把宿主上的秘密拼进一条会被呈现的连接目标里，也会让同一份正文在两台机器上指到不同的程序。

### S-5 streamable_http

**`{ kind: "streamable_http", url }`：对端在一个 HTTP(S) 地址上，按 MCP 的 Streamable HTTP 传输通信。**

`url` 必须是：

1. **绝对地址**，scheme 恰为小写的 `http` 或 `https`；
2. **有主机**，主机那一段不含空白、控制字符、`/`、`?`、`#`、`\`；
3. **不带片段**（`#` 及其后）；整串不含空白与控制字符；
4. **不带 userinfo**（主机前的 `user:pass@`）——带了的拒绝值是 **`credential_plaintext`**（[S-6](#s-6-正文不收凭据)），不是 `url_invalid`。

不合 1～3 的拒绝值是 **`url_invalid`**。

- **不强制 `https`**：本机的 MCP 服务端常在 `http://127.0.0.1` 上；要不要禁止明文 HTTP 连外网，是一项治理政策，**本版产品未定**，本契约不替它定（[G-8](#八已知缺口)）。
- **查询串里的秘密挡不住**：`?api_key=…` 形状上合法。**本契约只按形状判**；凭据应走凭据配值（[S-6](#s-6-正文不收凭据)）。

### S-6 正文不收凭据

**[MCP 凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)是一份持有上的一条属性配值，不是正文的一部分。正文里没有任何一个成员是凭据的位置。**

依据三条，任一条都足以排除「正文里放凭据」：

1. **一份持有一份值，不跨租户身份共用**（[PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)）。正文随版本被每一个持有它的格共用；凭据写在正文里，就被所有持有者共用了。
2. **凭据是落点与身份类设置**（同上；`data.asset-model/v1#S-23` 主线自决 A4）。设置的值挂在持有上，由有配值资格的人配；正文里写的只能是默认值，而**凭据类项没有一个自然的默认值**——它的默认值是「还没取」（[S-13](#s-13-凭据配值的取值域)）。
3. **工作区那一级取不了**（同上，与 [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)）。仓库带来的接入点，正文来自目录里的文件；正文若有凭据位置，一个仓库就能随正文带进来一个凭据——主线 2026-09-23 已裁「仓库带来的接入点不许带静态凭据」（A-G15）。

**表示层的后果**：

- 正文上出现名为 `credential` 的成员，拒绝值是 **`credential_plaintext`**——比一般的「多出成员」更具体，因为那正是这条要挡的写法；
- streamable_http 的 `url` 带 userinfo，拒绝值同样是 **`credential_plaintext`**（[S-5](#s-5-streamable_http) 第 4 条）；
- **`env`、`args`、`url` 的查询串里写进秘密，形状上挡不住**：它们被当作可以呈现的普通内容对待（PF-016 §6.11 管不到它们，因为它们不是凭据）。**凭据的唯一入口是凭据配值**——这是给作者的义务，不是本契约能兑现的保证。

> **与起草简报账本的差别**：账本把 `credential?: CredentialRef` 与 `oauth?: OAuthBinding` 列为 `McpEndpoint` 的成员。
> 本条按上面三条依据把两者都移出正文：凭据是持有上的配值（取值域见 [S-13](#s-13-凭据配值的取值域)），OAuth 绑定按持有保存（[S-12](#s-12-oauth-绑定)，存在哪归 `capability.mcp-bridge`）。**已报主线改判。**

### S-7 两项超时的作者默认

**`timeouts = { connect, call }`，两个成员都必填，都是 `data.tool-definition/v1` 的 [`Duration`](../../tool-definition/v1/contract.md#s-14-时长的表示)，都必须大于零。**

| 成员 | 是哪一项的默认 | 管什么 |
|---|---|---|
| `connect` | 「**连接超时**」 | 建立连接并拿齐一次动作清单，最多等多久（含 stdio 进程拉起与协议握手） |
| `call` | 「**单次调用超时**」 | 一次动作调用发出之后，最多等多久应答 |

- **两项分开**，是 [PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp) 的原话；两者都是偏好类设置（[S-14](#s-14-推出规则六类项)），各格可以改。
- **必填、没有缺省**：`data.asset-model/v1#S-12` 要求每一项声明带作者给的 `default`，而产品没给这两项一个平台默认值；**本契约不填一个**。
- **零时长拒绝**（`PT0S`、`PT0.0S`、`PT0H0M` 等全部写法），落 `malformed`（M8）：连接超时为零意味着永远连不上，调用超时为零意味着每次调用都在发出那一刻超时——两种都是一个不可能被用上的配置，**不给它一个「无上限」的读法**。
  这一条是本契约的推导；[`data.tool-definition/v1#S-14`](../../tool-definition/v1/contract.md#s-14-时长的表示) 允许 `PT0S`，并把「零对某一项意味着什么」交给那一项自己定——本条就是这两项的定法。
- **超时到了之后怎样收场**（连不上、调用落失败）归 `capability.mcp-bridge`。

### S-8 两项权限的作者默认

**`permissions = { use: { default }, execute: { default } }`，都必填、没有缺省。**

| 成员 | 是哪一项的默认 | 取值 |
|---|---|---|
| `use.default` | 「**能不能用**」 | `superAdministrator`、`member`（`data.identity-values/v1` 的 [TenantRole](../../identity-values/v1/contract.md#s-8-tenantrole)）或 `self`——取值域按主线 2026-09-23 裁定 A-G14「租户角色枚举 ＋ self」 |
| `execute.default` | 本接入点**每一个动作**的「**执行权限**」共用的那一个默认档 | `forbid`、`auto`、`ask`（`data.tool-definition/v1` 的 [ExecutePermission](../../tool-definition/v1/contract.md#s-15-执行权限)） |

- **一个接入点只给一个执行权限默认档，对它的每一个动作都一样**：作者写正文时并不知道对端此刻有哪些动作——那是对端决定的、随时会变（[S-9](#s-9-动作清单副本)）。
  逐动作地收窄，是持有它的各格的事（[S-16](#s-16-逐动作项按动作名键)）。
- **它就是 PF-002 §5.7 说的「它自己声明的出厂值」**：一个声明了 `auto` 的接入点，被持有在组织、租户格时按收窄合成；**被工作区提供时这个值不被认**，取最严值（[S-17](#s-17-工作区格上的这些项)）。
- **`use` 的取值怎样被求值**（允许集合求交之后判哪个租户能用、`self` 在各格指谁）**归 `capability.asset-evaluation`**；本条只定它的取值域与作者默认的位置。
  `default` 在这里是一个取值、不是一个集合——这是 `data.asset-model/v1#S-12` 对权限项形状的统一要求；它对「谁可以用」这类集合型权限意味着什么，已报主线（[G-5](#八已知缺口)）。
- **缺席即拒**：缺 `permissions`、缺其中一项、缺 `default`，都是 `malformed`（M3）；**不补成任何一档**——补成 `auto` 等于放行，补成 `forbid` 等于替作者做了一个他没做的判断。

### S-9 动作清单副本

**`ActionSnapshot` 是一份接入点持有最近一次完整拿到的对端动作清单，按 `kind` 判别恰两支，闭合：**

| `kind` | 成员 | 含义 |
|---|---|---|
| `fetched` | `fetchedAt`（`Instant`）、`tools`（`McpToolDescriptor` 数组） | 在 `fetchedAt` 那一刻完整拿到的清单；`tools` **可以为空数组**——对端确实一个动作也没有 |
| `not_fetched` | 无 | **还没取过**——从没完整拿到过一次，不知道对端有什么 |

1. **`not_fetched` 是一个显式取值，不是缺席，也不是空清单**（主线 2026-09-23 追加裁定）。三者各是一件事：缺席是「表示不完整」（拒绝），空清单是「对端没有动作」，`not_fetched` 是「不知道」。
   **把 `not_fetched` 读成空清单，等于把「不知道有什么」说成「确定什么都没有」**——替换件就无从同形（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)）。
2. **`fetched` 必带 `fetchedAt`**；缺了的拒绝值是 **`snapshot_missing_time`**——一份不知道何时拿到的清单，说不出它有多旧。
3. **一份副本里对端动作名（`tools[*].name`）不重复**；重复是 `malformed`（M10）。MCP 协议里一个服务端的工具名本就唯一，重复只能是列举拼错了。
4. **`tools` 的次序是对端列举给出的次序，原样保留**；次序不承载含义，但保留它让同一份副本在任何实现里投影出同一个次序的条目（`capability.mcp-bridge`）。
5. **「完整」的意思是：分页全部拿完**。拿到一半的清单**不是**一份 `fetched`——它不被写成副本（`capability.mcp-bridge` 的义务）。
6. **本版只记 tools。**D-037 的复选卡片不桥 resources 作为条目、不桥 prompts，它们不进副本。

**副本不在正文里。**它按持有保存、只由桥写（[`capability.mcp-bridge/v1#S-7`](../../../capabilities/mcp-bridge/v1/contract.md#s-7-动作清单持久副本)）。理由有三：

- **已发布的正文整条不变**（`data.asset-model/v1#S-9`），副本却在每次连上时重取——放进正文，每连一次就得发一版；
- **对端按账号给出的动作可能不同**：同一个接入点在两个租户身份下用两份凭据，对端看到的是两个账号（[PF-002 acceptance §一](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)），给出的清单不必相同——一份共用的清单装不下；
- **替换件要的是「这一份持有最近一次拿到的」**（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)），不是作者发布时看到的那一份。

> **与起草简报账本的差别**：账本把 `actions: ActionSnapshot` 列为 `McpEndpoint` 的成员，主线 2026-09-23 A-M11 也写「投影读接入点资产正文里的动作快照」。
> 本条按上面三条把它移出正文；形状（本条）不变，只是住处从正文换到了持有。**已报主线改判**；若主线维持「在正文」，本条与 [S-15](#s-15-推出规则的输入正文与动作集) 要改，`data.asset-model/v1#S-9` 的「已发布不变」要为它开例外。

### S-10 对端动作描述

**`McpToolDescriptor` 是对端在列举结果里给出的一个动作，原样保存。**本契约只约束三个成员，其余成员**原样保留、不解释、不丢弃**：

| 成员 | 必填 | 约束 |
|---|---|---|
| `name` | 是 | 对端的动作名，**非空字符串**，原样——不裁剪、不规范化、不改写大小写 |
| `inputSchema` | 是 | 参数 schema，**一个 JSON 对象**，原样 |
| `description` | 否 | 字符串，原样；可以为空串 |

- **必填的两项就是 MCP 协议里工具项的必填项**；对端给的一项缺了它们，是对端违反协议——整次列举不成立（`capability.mcp-bridge` 按协议错误收），**不是**本契约替它补一个。
- **`inputSchema` 在这里只要求是对象**：它能不能成为一份工具定义的参数（`data.tool-definition/v1` 的 [S-4](../../tool-definition/v1/contract.md#s-4-单函数工具)），在投影时判——一项不合格不让整份副本不合格（`capability.mcp-bridge`）。
- **原样保存的理由**：副本是替换件同形的唯一依据（[S-9](#s-9-动作清单副本)），改写一个字节，替换件就与对端原件不同形；
  **其余成员留着**，是因为投影规则可能按协议版本读其中几项（例如声明必须以任务方式执行的那一项，`capability.mcp-bridge`），丢了就无从读。
- **对端给的说明与参数 schema 是不受信任的内容**：它们会原样进模型面（经投影），本契约不对它们作任何承诺。

### S-11 动作条目名

**对端一个动作在动作空间里那个工具条目的名字，恰是：接入点能力标识的 name ＋ `:` ＋ 对端动作名（`McpToolDescriptor.name`）。**例：接入点 `mcp:github`、对端动作 `create_issue` ⇒ `github:create_issue`。

**词法**（起草简报账本：与能力标识名同一套，按主线 2026-09-23 的改判——**允许 `:`，禁 `/`**）：

1. 非空；
2. 任何位置都不含 `data.identity-values/v1#S-31` 逐个列出的空白码点；
3. **不含 `/`（U+002F）**；
4. 区分大小写，相等是逐码点精确相等。

**由此**：

- **一个对端动作名能不能成条目名，看它自己是否满足第 2、3 条**（接入点的 name 由 `data.asset-model` 保证合词法）。
  MCP 协议只**建议**工具名用字母、数字、`_`、`-`、`.`，并非强制；**对端动作名含空白或 `/` 的，拼不出条目名**——那个动作怎样收（不进条目、留下可见记录）归 `capability.mcp-bridge`。**本契约不改写它**：改写（替换字符、截断、加哈希）会让两个对端动作撞到同一个名字上。
- **在同一个接入点之内，条目名与对端动作名一一对应**：前缀固定，余下部分就是对端动作名原样（[S-9](#s-9-动作清单副本) 第 3 条保证对端名不重复）。
- **跨接入点可能撞名**：能力标识名允许 `:`，接入点 `a`＋动作 `b:c` 与接入点 `a:b`＋动作 `c` 拼出同一个 `a:b:c`；与作者写的工具名也可能相同。**本契约保证不了跨接入点唯一**——撞名怎样判归把条目装进动作空间的一方（注册表），见 [G-2](#八已知缺口)。
- **条目名不可拆**：消费者**不得**从中拆出接入点或对端动作名（`data.tool-definition/v1` 的 [S-18](../../tool-definition/v1/contract.md#s-18-名字的表示与相等)「不解析」）——那两样在工具定义的 `origin` 里（`data.tool-definition/v1` 的 [S-17](../../tool-definition/v1/contract.md#s-17-来源)）。
- **它不是能力标识，也不是规范串**：对端动作不是资产、没有能力标识（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)）。一笔 MCP 对端收的钱记到的是**接入点**（`data.call-accounts` 用接入点能力标识的规范串），**不是**条目名。
- **供应商对工具名的字符与长度限制**（不少供应商不收 `:`、限 64 个字符）**不由本条承担**：怎样把条目名呈现成某一家供应商收得下的名字、再映射回来，归模型请求运行时的传输适配（`data.tool-definition/v1` 的 G-12 同一类，见 [G-2](#八已知缺口)）。

### S-12 OAuth 绑定

**`OAuthBinding = { id, state, since }`：一份接入点持有上的一次经 OAuth 取得 MCP 凭据的流程，与它取得的那一份凭据此刻的状态。**

| 成员 | 含义 |
|---|---|
| `id` | 绑定号：**不透明、部署内唯一、不回收不复用**；交换表示按 `data.identity-values/v1#S-31` 的散文（非空，首末字符不属于空白码点集合，逐码点相等）。**不可猜**——它是把「对端同意之后回来的那个应答」认回这一次流程的唯一把手（`capability.mcp-bridge`） |
| `state` | 恰三值，闭合，见下表 |
| `since` | 进入当前 `state` 的时刻（`Instant`）。`granted` 时它就是 PF-002 说的「什么时候取的」 |

| `state` | 含义 |
|---|---|
| `pending` | 已发起、在等人到对端点一次同意 |
| `granted` | 已取得、可用：保管方持有这一份凭据，续期不要人（[PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)「续期」行） |
| `revoked` | 作废：人拒绝了、流程过期或被同一份持有上新的一次发起取代、续不上、持有被移除或凭据被清掉。**终态**——要再取，是一次新的发起、一个新的绑定号 |

- **它不含凭据本体，也不含凭据引用。**绑定可以被呈现（「有没有、哪一层的、什么时候取的」），凭据引用不行（`data.asset-model/v1#S-23` 第 5 条）。
- **续期不改变 `state`，也不改变 `since`**：续期不算换值（PF-002 同一行）；[PF-002 acceptance §一](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)「经 OAuth 取得的那一份到期续上了」那一行要求「看不到一次『设置被改』」。
- **状态怎样迁移、谁迁它、存在哪**，归 `capability.mcp-bridge`（[S-8](../../../capabilities/mcp-bridge/v1/contract.md#s-8-oauth-绑定状态与迁移)）。
- **组织格能不能有一份 OAuth 取得的凭据**产品未决（PF-002 §九，U-1）；**本条的形状两种答案下都不变**（[G-3](#八已知缺口)）。

### S-13 凭据配值的取值域

**「凭据」这一项的配值值恰是下面两种之一，闭合：**

1. **一个 `CredentialRef`**——`data.asset-model/v1` 的 [S-23](../../asset-model/v1/contract.md#s-23-凭据引用)：指向凭据本体的不透明引用；静态值与经 OAuth 取得的**是同一种值**（PF-002「两种来路是同一项设置」）；
2. **`{ "kind": "not_fetched" }`——还没取。**它是这一项的 `default`（[S-14](#s-14-推出规则六类项)）。

写成这一项声明的取值域（`AttributeDomain` 的 `schema`），恰是：

```json
{
  "oneOf": [
    { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/asset-model/v1/asset-model.schema.json#/$defs/CredentialRef" },
    {
      "type": "object",
      "properties": { "kind": { "const": "not_fetched" } },
      "required": ["kind"],
      "additionalProperties": false
    }
  ]
}
```

- **这就是 `data.asset-model/v1#S-23` 第 2 条交给本契约的那件事**：「还没取」是一个显式取值，**不是真凭据，也不是缺席**。两种写法在 JSON 类型上就分得开（一个是字符串、一个是对象），**不存在一个既像引用又像「还没取」的值**。
- **取值域之外的一切，拒绝值是 `credential_plaintext`**：一个对象里放着 token、一个数字、一个 `null`、`{ "kind": "fetched" }`……**只能按形状判**——一个明文 token 若恰好是一个非空、首尾无空白的字符串，它形状上就是一个 `CredentialRef`，**本条挡不住**。
  挡住它的是写入方的义务：**凭据配值的写入只接受凭据保管方发出的引用**（`data.asset-model` 的验证入口 SC-5；`capability.mcp-bridge` 的 OAuth 那一路只交出保管方发出的引用）。
- **`not_fetched` 与 [S-9](#s-9-动作清单副本) 的 `not_fetched` 是同一个 token、同一个意思（「还没取」），用在两个不同的值上**；它们互不推出：凭据还没取，副本可以已有（对端不要鉴权）；副本还没取，凭据可以已有（从没连上过）。
- **凭据「失效」不是这个取值域里的一个值**：失效是保管方那边的事实（续不上、被对端撤了），配值不变；桥解引用时发现它，收成「凭据不可用」（`capability.mcp-bridge`）。**把「失效」写回配值是不允许的**——那会是一次没有人操作的改值。

## 四、属性项推出规则

**`data.asset-model/v1#S-12` 要求每一份正文契约给出一条推出规则：一份资产有哪些属性项，各是什么形状。**本节是 MCP 这一类的那条规则。

### S-14 推出规则：六类项

**一个 MCP 接入点的属性项恰是下表六类；再加 `data.asset-model/v1` 保留的 [`disabled`](../../asset-model/v1/contract.md#s-15-disabled-是保留项名) 那一条，就是它的全部属性项。**

| `item` | `kind` | `category` | `domain` | `default` |
|---|---|---|---|---|
| `connectionTarget` | `setting` | `placement_identity` | `{ kind: "open", schema: <本契约 Schema 的 $id>#/$defs/McpTransport 的引用 }` | 正文的 `transport` |
| `credential` | `setting` | `placement_identity` | `{ kind: "open", schema: <S-13 那一份> }` | `{ "kind": "not_fetched" }` |
| `connectTimeout` | `setting` | `preference` | `{ kind: "open", schema: <大于零的 Duration> }` | 正文的 `timeouts.connect` |
| `callTimeout` | `setting` | `preference` | 同上 | 正文的 `timeouts.call` |
| `use` | `permission` | —（权限项不带类别） | `{ kind: "enum", values: ["superAdministrator", "member", "self"] }` | 正文的 `permissions.use.default` |
| `execute:<对端动作名>`，**动作集里每一个动作一条** | `permission` | — | `{ kind: "enum", values: ["forbid", "auto", "ask"] }` | 正文的 `permissions.execute.default` |

`connectionTarget` 与 `connectTimeout` / `callTimeout` 的 `schema` 写法：前者恰是 `{ "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/mcp-endpoint/v1/mcp-endpoint.schema.json#/$defs/McpTransport" }`；
后两者恰是本契约 Schema 里 `McpEndpoint.timeouts.connect` 那一份（`Duration` 且不为零）的内联副本——**两处必须一起改**。

这条规则满足 `data.asset-model/v1#S-12` 的四项要求：

1. **确定**：同一份正文、同一份动作集（[S-15](#s-15-推出规则的输入正文与动作集)），永远推出同一组声明；不读谁持有它、在哪一格、什么时候推、在哪个环境里推。
2. **`item` 互不相同**：五个固定项名互不相同，都不以 `execute:` 开头；逐动作项的余下部分是对端动作名原样，而对端动作名在一份动作集里不重复（[S-9](#s-9-动作清单副本) 第 3 条）。
3. **不产出 `disabled`，不产出治理类的项。**
4. 每一条都合 `AttributeDeclaration` 的形状：设置项带类别、取值域开放；权限项不带类别、取值域是非空枚举、`default` 在 `values` 里。

**各项的来由**：

- **连接目标与凭据是落点与身份类，两项超时是偏好类**——[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)「自带的属性」一格的原话。**类别由本契约定死，不由作者选**：容许作者把连接目标标成偏好，一个仓库就能改掉接入点连到哪里（同 `data.tool-definition/v1#S-10` 的理由）。
- **「能不能用」与逐动作执行权限是权限**——同一格。
- **`execute:` 的执行权限三档与工具执行权限同**：「一个动作就是一个工具条目，逐动作的权限就是那个条目的执行权限」（同一格；[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)）。**投影出来的工具定义的执行权限默认值就是这一项的 `default`**（`capability.mcp-bridge`），两处是同一个值。

### S-15 推出规则的输入：正文与动作集

**五个固定项只由正文推出；逐动作项由正文与一份动作集推出——动作集是求值的一方交给推出规则的那份 `ActionSnapshot`。**

- **这偏离了 `data.asset-model/v1#S-12` 第 1 条的字面**（「是正文的确定函数」）：逐动作项「随对端此刻提供的动作而有」（PF-002 §4 MCP），而对端此刻有什么不在正文里（[S-9](#s-9-动作清单副本)）。
  **它不偏离那一条的用意**：给定正文与动作集，推出仍是确定的；动作集不是「谁持有、在哪一格、什么时候」这类外部状态，而是推出的一个显式输入。
  **这一处要 `data.asset-model` 对齐**（S-12 第 1 条为 MCP 写明第二个输入），已报主线（[G-1](#八已知缺口)）。
- **动作集是哪一份，由求值的一方决定并写明**：一次执行尝试里用的，是注册表为这次尝试钉住的那一份（主线 2026-09-23 裁定 B-M03：动作集「一次尝试之内不变」）；设置页上呈现的，是哪一份副本——**未定**（[G-4](#八已知缺口)）。
- **动作集是 `not_fetched` 时，逐动作项一条也推不出来**：那是「不知道有哪些动作」，**不是**「没有逐动作项」——与 `data.asset-model/v1#S-12` 对不透明壳的那一句是同一条规矩。**求值的一方不得把它当作「这个接入点没有动作」**；这时这个接入点没有工具条目（`capability.mcp-bridge`），逐动作项也就无从生效。

### S-16 逐动作项按动作名键

**逐动作项的键是对端动作名：`execute:` ＋ `McpToolDescriptor.name` 原样。**（主线 2026-09-23 裁定 A-G12。）

- **配值挂在接入点那份持有上，按动作名键**（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)「配在接入点那份持有上」）；动作本身没有持有。
- **动作从动作集里消失，它的配值照样留着**——那是 `data.asset-model/v1` 的 [S-14](../../asset-model/v1/contract.md#s-14-属性配值) 说的合法留存：项不在了，配值不参与求值，**读到它的一方不得删它、改它、替它「修好」**。
- **动作再出现，原配值照旧生效**：同一个键、同一条配值。**这一句挡的是一个具体的后果**：组织对某个动作配了「禁止」，对端把它撤下又加回，若配值没了，这个动作就回到作者默认——可能是 `auto`。
- **键只看名字，不看动作的内容**：对端把同名动作的说明或参数 schema 换掉，配值照旧适用。**这是按名字键的代价**，已报主线（[G-7](#八已知缺口)）；本版不按内容指纹键。

### S-17 工作区格上的这些项

**工作区那一格上，这些项只剩偏好类的两项超时可以配**——这是 `data.asset-model/v1` 的 [S-20](../../asset-model/v1/contract.md#s-20-出厂格与工作区格的持有) 与 [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) 的直接结果，本条只把它对到 MCP 的六类项上：

| 项 | 工作区格上 |
|---|---|
| `connectionTarget`、`credential` | 落点与身份类，**读入时滤掉**；工作区格配不了 |
| `connectTimeout`、`callTimeout` | 偏好类，**可以配**，不带锁 |
| `use`、`execute:*` | 权限，**读入时滤掉** |

- **工作区自己提供的接入点**，它的连接目标随正文一起来（`data.asset-model/v1#S-20`「落点类设置随资产的正文与声明一起来，不是配值」）；**它的凭据没有来路**——正文里没有凭据位置（[S-6](#s-6-正文不收凭据)），工作区格又配不了，所以它的凭据恒为 `not_fetched`，**要鉴权的对端就连不上**。
  这正是 [PF-002 acceptance](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景) 那一行：「仓库带来的接入点要 OAuth，挂上工作区之后连不上；把它收进租户层、在那里取了之后才用得上」。
- **它的权限取最严值、不认它自己声明的出厂值**（PF-002 §5.7）：执行权限一律「问一下」，「能不能用」是挂上这份工作区的那个租户本人——**怎样取归 `capability.asset-evaluation`**，本条只说正文里的 `permissions` 在这时不被认。

## 五、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变的保证**；右列写分布式后必须由协议重新兑现什么，以及做不到会怎样。
> 不在表里的条款在任何部署形态下一律成立。**这张表是契约的一部分，不是流程笔记。**

| 保证 | 单机由谁给 | 分布式必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **OAuth 绑定号部署内唯一、不可猜**（[S-12](#s-12-oauth-绑定)） | 单一生成点 | 跨节点分配；唯一是承诺，不是「碰撞概率足够低」；不可猜在每个节点都成立 | 一个回来的同意应答被认到另一份持有的流程上——**凭据被配到别人的持有上** |
| **stdio 连接目标在据点机上拉起**（[S-4](#s-4-stdio)） | D-037 本版取值：据点进程就在那台机器上 | 「可换落点」是将来的拓展点；换了之后，`command` 在哪台机器上解释、`env` 在哪里合成，要由新版契约写明 | 同一份正文在两个节点上拉起两个不同的程序 |
| **表示层校验在每个接收边界重做**（[S-20](#s-20-表示层拒绝值与判定次序)） | 写入前校验一次 | 每个接收边界各自重验，不信任上游「已校验过」 | 一份带凭据的正文或一份缺时刻的副本进了存储 |

## 六、表示与边界校验

### S-18 规范表示

- **规范表示**：[`mcp-endpoint.schema.json`](mcp-endpoint.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/mcp-endpoint/v1/mcp-endpoint.schema.json`
- **定义项（6 项）**：`McpEndpoint`、`McpTransport`、`ActionSnapshot`、`McpToolDescriptor`、`McpActionName`、`OAuthBinding`。
  消费者 `$ref` 这些定义，**不复制一份同义类型**。**根模式不约束任何文档**：本文件是共享定义的登记处。
- **凭据配值的取值域不是一个定义项**：它写在推出的属性声明里（[S-13](#s-13-凭据配值的取值域)），引用 `data.asset-model` 的 `CredentialRef`。
- **成员名一律 camelCase**，枚举值一律 snake_case 字符串（租户角色两值是 `data.identity-values` 已冻结的 `superAdministrator`、`member`，原样引用）；判别成员一律叫 `kind`。
- **外部引用**：`Instant` 取自 `data.offer-expiry/v1`；`TenantRole` 取自 `data.identity-values/v1`；`Duration`、`ExecutePermission` 取自 `data.tool-definition/v1`。
- **正反实例**：[`examples.md`](examples.md)，本版的规范工件。

### S-19 判别式与枚举闭合

`McpTransport.kind`、`ActionSnapshot.kind`、`OAuthBinding.state`、`permissions.use.default`、`permissions.execute.default`、凭据配值的 `kind` 各是一个**闭合集合**，没有「其他」。

遇到未知取值**一律作表示非法拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、**不得**忽略该成员继续。
一个未知的传输被当作 stdio，就会把一个 URL 当成程序去拉起；一个未知的 `state` 被当作 `granted`，就会用一份不存在的凭据去连——**静默降级就是放行**。

### S-20 表示层拒绝值与判定次序

**表示层拒绝值是一个闭合集合，恰六个，没有「其他」**：`malformed`、`transport_unknown`、`credential_plaintext`、`command_empty`、`url_invalid`、`snapshot_missing_time`。

**一份输入命中多行时，报下表中最靠前的那一行**——两个实现对同一份坏输入必须给出同一个值。
**`malformed` 的来由逐条编为 `M1`～`M13`，这份清单就是它的全部来由**：一份输入不合 Schema、却对不上下表任何一行，是本契约的缺陷，不是第七个值。
同属 `malformed` 的几条可以重叠（一个数字形式的超时既是 M5 也是 M8），重叠不改变报出的值。

| 次序 | 拒绝值 | 条件 |
|---|---|---|
| 1 | `malformed` | **M1** 该是对象的值不是 JSON 对象（正文、连接目标、副本、对端动作描述、OAuth 绑定）；**M2** 缺判别成员——`McpTransport.kind`、`ActionSnapshot.kind`。**凭据配值不走这一行**：它的取值域里本来就有一个字符串，它只由第 3 行判 |
| 2 | `transport_unknown` | `McpTransport.kind` 在，但不是 `stdio`、`streamable_http` 之一（含不是字符串、大小写不同） |
| 3 | `credential_plaintext` | 正文上有名为 `credential` 的成员；streamable_http 的 `url` 带 userinfo；凭据配值既不是 `CredentialRef` 也不恰是 `{ "kind": "not_fetched" }`（[S-6](#s-6-正文不收凭据)、[S-13](#s-13-凭据配值的取值域)） |
| 4 | `command_empty` | stdio 的 `command` 是字符串，但为空串或全是空白 |
| 5 | `url_invalid` | streamable_http 的 `url` 是字符串，但不合 [S-5](#s-5-streamable_http) 第 1～3 条（带 userinfo 的已在第 3 行报） |
| 6 | `snapshot_missing_time` | `ActionSnapshot.kind` 是 `fetched`，却没有 `fetchedAt` |
| 7 | `malformed` | 下列任一：**M3** 缺其余必填成员——正文的 `transport`、`timeouts`、`permissions`，`timeouts` 的两项，`permissions` 的两项与各自的 `default`，stdio 的 `command`、`args`，streamable_http 的 `url`，`fetched` 的 `tools`，对端动作描述的 `name`、`inputSchema`，OAuth 绑定的三项；**M4** 出现未登记的成员（第 3 行那一种除外）——正文、`timeouts`、`permissions`、`use`、`execute`、两种传输、副本两支、OAuth 绑定任一处；`actions`、`oauth`、`headers` 出现在正文上都在此；**M5** 成员或数组元素的 JSON 类型不对，含 `null`（第 2、3、4、5 行各自那一处除外）；**M6** `ActionSnapshot.kind`、`OAuthBinding.state`、`permissions.use.default`、`permissions.execute.default` 在，但不在各自的闭合集合里；**M7** `fetchedAt` 或 `since` 不合 `Instant`；**M8** 两项超时不合 `Duration`，或为零；**M9** `env` 的名为空、含 `=` 或 NUL，或值含 NUL；**M10** 同一份副本里两项对端动作的 `name` 相同；**M11** 对端动作描述的 `name` 是空串，或 `description` 在却不是字符串；**M12** OAuth 绑定号为空、或首末字符属于空白码点集合；**M13** 一个串被当作动作条目名，却不合 [S-11](#s-11-动作条目名) 的词法（只在检查一个派生出的条目名时出现，见[实例第 4 节](examples.md#4-动作条目名)） |

- **第 3 行排在前面是有意的**：一份输入既有凭据写错了地方、又有别的毛病时，先告诉写入方「秘密放错了地方」。这是本契约对 [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec)「同一输入同一答案」之外的唯一取舍，理由是那个错误的后果最大。
- **这些拒绝值在哪一个操作的失败集合里出现，归调用那个操作的契约**：资产治理的写面（写正文、写凭据配值）、`capability.mcp-bridge` 的副本写入与投影。**它们引用本条的名字，不另起一套同义值。**

### S-21 表示层拒绝不是判定，也不修补

- **表示非法的输入在进入任何判定之前被拒绝。**这次拒绝**不表示**「这个接入点不存在」「对端连不上」「这一格没有资格」，也**不得被记成一次判定结果**——与 `data.identity-values/v1` 的 [S-33](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开) 同一条规矩。
- **不修补、不降级、不尽力而为**：不把 `SSE` 当成 `streamable_http`、不把 `HTTP://` 改成小写、不删掉 URL 里的 userinfo 留下其余、不把缺的 `fetchedAt` 补成现在、不丢掉坏的那一项动作留下其余的副本、不把一个明文 token 包成一个引用。**修补等于替写入方做了一个它没做的决定**；对凭据那一行，修补还意味着秘密已经在一处不该在的地方被读过了。
- **表示合法不表示任何资格**：一份合法的正文不说明任何人能用它，一份合法的凭据配值不说明它解引用得出来。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 管不到的那部分归谁 |
|---|---|---|
| [S-1](#s-1-接入点正文)、[S-6](#s-6-正文不收凭据)～[S-8](#s-8-两项权限的作者默认) | **管得到**：三个成员必填、不收别的成员、两项超时不为零、两项权限的取值 | 「带 `credential` 成员」与「多出别的成员」的拒绝值不同——Schema 都只说拒绝，名字由 [S-20](#s-20-表示层拒绝值与判定次序) 定 |
| [S-3](#s-3-连接目标两种闭合)～[S-5](#s-5-streamable_http) | **管得到**：两种闭合、`command` 非空白、`env` 的名与值、`url` 的写法 | 「不做 shell 展开与插值」是桥的行为；`url` 查询串里的秘密管不到 |
| [S-9](#s-9-动作清单副本)、[S-10](#s-10-对端动作描述) | 管两支、`fetched` 三个成员、描述的三个受约束成员 | **对端动作名不重复**（M10）管不到；「完整」「原样」「只由桥写」是行为约束，归 `capability.mcp-bridge` |
| [S-11](#s-11-动作条目名) | 管词法 | 拼法（前缀就是接入点的 name）与跨接入点撞名管不到 |
| [S-12](#s-12-oauth-绑定) | 管形状与三值 | 唯一、不可猜、迁移规则——行为约束 |
| [S-13](#s-13-凭据配值的取值域) | 由推出的声明里那份 `schema` 管，不在本文件 | 「引用是保管方发出的」管不到（写入方义务） |
| [S-14](#s-14-推出规则六类项)～[S-17](#s-17-工作区格上的这些项) | 不是一个形状 | 推出规则的实现与 `capability.asset-evaluation` |

**非法输入的含义**：Schema 校验失败 ⇒ 该输入**不是**本契约的一个值 ⇒ 按 [S-20](#s-20-表示层拒绝值与判定次序) 取拒绝值、按 [S-21](#s-21-表示层拒绝不是判定也不修补) 收场。
**Schema 通过也可能仍然非法**——上表「管不到」那一列里属于形状的那些（M10），由接收边界的校验兑现。

## 七、性质与场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 正文里没有凭据的位置；凭据只作为持有上的配值存在 | 安全 | [PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) | Schema ＋ 接收边界（[S-6](#s-6-正文不收凭据)、[S-20](#s-20-表示层拒绝值与判定次序) 第 3 行） | 一个仓库带进来的接入点连上了某个账号；或同一个凭据被持有同一接入点的所有格共用 |
| P-2 | 「还没取」「对端没有动作」「表示不完整」三者分得开 | 不变量 | 主线追加裁定 · [PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用) | Schema（[S-9](#s-9-动作清单副本)、[S-13](#s-13-凭据配值的取值域)） | 从没连上过的接入点被当成「没有动作」，或一个缺时刻的清单被当成最新 |
| P-3 | 本版只有两种传输；未知传输不被猜成已知 | 安全 | [D-037](../../../../record/decisions/mcp-client-adoption/decision.md) | Schema（[S-3](#s-3-连接目标两种闭合)、[S-19](#s-19-判别式与枚举闭合)） | 一个 URL 被当成程序拉起，或一个旧式 SSE 服务端被按新协议连 |
| P-4 | 同一份正文与同一份动作集，推出同一组属性声明；逐动作项的项名在一个接入点内唯一 | 不变量 | `data.asset-model/v1#S-12` · 主线 A3 | 推出规则（[S-14](#s-14-推出规则六类项)、[S-15](#s-15-推出规则的输入正文与动作集)） | 设置页长出来的表单与正文、清单对不上；两个动作共用一个权限项 |
| P-5 | 动作消失再出现，原配值照旧生效 | 安全 | 主线 A-G12 | 推出规则按动作名键（[S-16](#s-16-逐动作项按动作名键)）＋ `data.asset-model/v1#S-14` 的留存 | 组织配的「禁止」在对端撤下又加回之后悄悄回到作者默认 |
| P-6 | 条目名在一个接入点内与对端动作名一一对应；本契约不改写对端动作名 | 不变量 | 起草简报账本 · [PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装) 同形 | 拼法（[S-11](#s-11-动作条目名)） | 两个对端动作落到同一个条目上；或替换件与原件不同名 |
| P-7 | 缺席不补、表示非法即拒、拒绝值唯一 | 安全 | SYS-SPEC | 每个接收边界（[S-20](#s-20-表示层拒绝值与判定次序)、[S-21](#s-21-表示层拒绝不是判定也不修补)） | 两个实现对同一份坏输入报不同的拒绝值；或缺的执行权限被补成 `auto` |

**本契约不拥有任何进展性质**：它没有状态转移。**不建 `formal/`**：结构约束 Schema 与条款即可表达，没有需要在给定规模里找反例的关系；
属性项在各格上怎样求值的结构性质归 `capability.asset-evaluation` 的 Alloy 模型（`data.asset-model` 的验证入口已登记），那份模型消费本契约推出的声明。
**这不是把义务省掉**：它们被改写成[验证入口](../verification.md#证据义务)的 V-1～V-5。

### 规范场景

#### S-22 正文里写凭据被拒

一份正文在 `transport` 旁边多写了 `"credential": "ghp_…"`：**拒绝，拒绝值 `credential_plaintext`**——不是 `malformed`，也不是「接受并忽略这个成员」。
同一份正文若把凭据写进 `url`（`https://bot:ghp_…@mcp.example.com/`）：**同样 `credential_plaintext`**。
**反例**：实现只按 Schema 报「拒绝」而说不出是哪个值；或删掉 userinfo 之后接受——那个秘密已经被读过、可能已进了日志。

#### S-23 还没取过与空清单不是一回事

副本 `{ "kind": "not_fetched" }` 投影出来**没有条目**，逐动作项一条也推不出来，**而且消费者知道这是「不知道」**；
副本 `{ "kind": "fetched", "fetchedAt": "…", "tools": [] }` 投影出来也没有条目，**但那是「对端确实没有」**。
**反例**：一个实现把从没连上过的接入点存成 `tools: []`、再在连不上时照它装替换件——agent 面前这个接入点「什么都没有」，而它其实只是还没被连上过。

#### S-24 动作消失再出现

组织在它那一格给 `execute:delete_repo` 配了 `{ allowed: ["forbid"] }`、锁住；对端下一版撤掉了 `delete_repo`：这条配值**留着**、不参与求值；对端再加回 `delete_repo`：**这条配值重新生效**，这个动作仍是禁止。
**反例**：推出规则只为当前动作集写项，治理写面据此把「不在的项」的配值清掉——动作回来时是作者默认 `auto`。

#### S-25 仓库带来的接入点没有凭据

工作区承载清单提供了一个 streamable_http 接入点，对端要 OAuth：它的凭据恒为 `not_fetched`（[S-17](#s-17-工作区格上的这些项)），连不上、动作不可用；
挂上它的租户把它收进租户层、在那里经 OAuth 取了一份之后，**用的是租户格那份持有上的凭据**。
**反例**：工作区承载清单里写一条对 `credential` 的配值，读入时被接受——一个仓库替用户选了连对端的账号。

### 消费者核对场景

#### CS-1 资产治理写一条凭据配值

写面拿到一份写入请求：持有是某个 MCP 接入点在租户格的那份，`item = credential`，`value = "cred_77f0"`。
按 [S-13](#s-13-凭据配值的取值域)：形状合（一个 `CredentialRef`）；**它是不是保管方发出的**，是写面自己的义务（`data.asset-model` SC-5）。
`value = { "token": "…" }` ⇒ `credential_plaintext`；`value = { "kind": "not_fetched" }` ⇒ 合法，意思是「清掉」（PF-002「撤掉就是清掉这一项的值」）。**本场景走得通**，停在 `capability.asset-governance` 不在本工作树。

#### CS-2 求值为一次尝试推出属性项

求值拿到一份正文与注册表为这次尝试钉住的动作集（两个动作 `list_issues`、`create_issue`）：推出七条声明（五个固定项 ＋ 两个逐动作项），加 `disabled` 共八条。
各格配值里有一条 `execute:delete_repo`（动作集里没有）：**不参与求值，也不被删**（[S-16](#s-16-逐动作项按动作名键)）。**本场景走得通**；各项怎样合成停在 `capability.asset-evaluation`。

#### CS-3 桥投影一份副本

桥拿到正文（`permissions.execute.default = ask`）与副本（`tools` 两项），为接入点 `mcp:github` 投影出两个工具条目 `github:list_issues`、`github:create_issue`，执行权限默认都是 `ask`。
对端第三项名为 `repo/admin`：拼不出条目名（[S-11](#s-11-动作条目名) 第 3 条）。**本契约到此为止**：它怎样收归 `capability.mcp-bridge`。

#### CS-4 设置页呈现一个接入点的凭据

设置页要呈现「有没有、哪一层的、什么时候取的」：**有没有**看这一格凭据配值是 `CredentialRef` 还是 `not_fetched`；**哪一层**看这份持有的格；
**什么时候取的**：经 OAuth 的，看这份持有上 `granted` 那个绑定的 `since`；**静态配上的，本版没有表示**——属性配值不带时刻（`data.asset-model/v1#S-14`），见 [G-9](#八已知缺口)。

## 八、已知缺口

| # | 缺口 | 影响 | owner |
|---|---|---|---|
| **G-1** | **推出规则的第二个输入**：逐动作项要一份动作集，`data.asset-model/v1#S-12` 第 1 条写的是「正文的确定函数」（[S-15](#s-15-推出规则的输入正文与动作集)） | `data.asset-model` 与本契约对「推出规则读什么」字面不一 | **主线**：改判副本的住处（[S-9](#s-9-动作清单副本) 末段）时一并定；`data.asset-model` 对齐时为 MCP 写明 |
| **G-2** | **动作条目名跨接入点、跨作者工具可能撞名**（[S-11](#s-11-动作条目名)）；**以及条目名在各家供应商那里怎样呈现**（`:` 与长度） | 同一个动作空间里两个同名条目；或某一家供应商拒收整份工具表 | 撞名：**注册表**（`capability.asset-registry`，同批）；供应商呈现：**模型请求运行时的传输适配**（块 C） |
| **G-3** | **组织格能不能有一份 MCP 凭据**（PF-002 §九 唯一未决，U-1） | 组织格上凭据配值与 OAuth 绑定是否出现；**本契约的形状两种答案下都不变** | **产品负责人** |
| **G-4** | **设置页呈现逐动作项时用哪一份动作集**：注册表钉住的是每次尝试的；设置页不在任何一次尝试里。尤其组织格——组织自己不一定持有凭据（G-3），它那一格没有自己的副本 | 组织与租户在设置页上看得见、配得着哪些动作的执行权限 | **PF-002 / PF-016 的 owner**（产品面：给不在任何一次运行里的人看什么） |
| **G-5** | **「能不能用」这类集合型权限的 `default` 是一个取值**：`data.asset-model/v1#S-12` 规定权限项的 `default` 是 `values` 里的一个，而「谁可以用」天然是一个集合 | 作者默认 `member` 在求值里意味着「只有 member」还是「member 及以上」 | **`capability.asset-evaluation`**（求值语义）；形状若要改，归 `data.asset-model` |
| **G-6** | **能力标识名的词法**：本契约按主线 2026-09-23 的改判写（允许 `:`、禁 `/`）；`data.asset-model` v1 此刻的 S-2 仍是「不含冒号」 | 在那边改之前，本契约的条目名词法与那边的名字词法不是同一套 | **主线**：对齐波改 `data.asset-model` S-2／S-3 |
| **G-7** | **逐动作项按名字键，不看内容**：对端换掉同名动作的说明或参数，原来配的 `auto` 照旧（同行称「rug pull」，[研究第二轮](../../../../../research/mcp-client-reuse/research.md#第二轮同行封装的借鉴与依赖)） | 一个被配成 `auto` 的动作可能在人不知情时变成另一件事 | **PF-002 / PF-007 的 owner**（产品面：要不要为此加一道确认） |
| **G-8** | **是否禁止明文 `http` 连外网地址**（[S-5](#s-5-streamable_http)） | 凭据可能在明文信道上出示 | **产品负责人**（治理政策）；本版不禁 |
| **G-9** | **静态配上的凭据「什么时候取的」没有表示**：属性配值不带时刻 | PF-002「只呈现有没有、哪一层的、什么时候取的」的第三项，静态那一路呈现不出 | **`data.asset-model` 与资产治理的读面**（配值的写入时刻在哪） |
| **G-10** | **被 `data.asset-model` 引用的形状尚未对齐**：那边 mcp 一支仍是不透明 `body`，本契约成立后要换成 `McpEndpoint` | 在那之前，资产记录里的 mcp 正文按那边的规矩「不得解释」 | **主线**：对齐波 |

**它们都不是默认值**：消费者碰上时停在缺口，不挑一个看起来合理的答案。

## 九、明确不承诺

- 不承诺对端的可用性、版本与动作集——那不由本系统掌握（PF-002 §4 MCP）。
- 不承诺对端给的说明与参数 schema 的真实性；它们原样进副本、经投影进模型面。
- 不承诺挡住写进 `env`、`args`、`url` 查询串里的秘密；凭据的唯一入口是凭据配值。
- 不定义连接、列举、调用、OAuth 的任何行为；那些归 `capability.mcp-bridge`。
- 不承诺条目名在各家供应商那里原样可用（[G-2](#八已知缺口)）。

## 十、版本差异与规范工件

**首版。**没有被取代的旧版本；`design_legacy/` 不作输入。规范工件恰三份：`contract.md`、`mcp-endpoint.schema.json`、`examples.md`。
执行结果、覆盖状态与变化的影响在[验证入口](../verification.md)，不写进本目录。

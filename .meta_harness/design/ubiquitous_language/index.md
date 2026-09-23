# 全部词条索引

**查重从这里开始。**加任何一个新词之前，先在这一页搜一遍——
**连[弃用说法](conventions.md#一个词条长什么样)一起搜**。

> **这一页不是定义。**每行末那句话只是**认出它**用的，
> **定义在各卷里**，以那里的为准。
> 加、改、废一个词条时**同步改这一页**——它与分卷是否一致由对账器守着；
> 怎么加、怎么改，加载 `ubiquitous-language` skill（谁该加载见 [AGENTS.md](AGENTS.md)）。

## [架构内核与扩展](terms/architecture-core-and-extension.md)

**这个系统哪一部分立规矩，其余部分怎么建在它之上。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-architecture-core](terms/architecture-core-and-extension.md#ul-architecture-core--架构内核--architecture-core) | 架构内核 | Architecture Core | 立规矩的那一部分，**与 Cordis 的「内核层」不是一回事**；旧说法 ~~harness core~~ |

## [主体与归属](terms/subjects-and-ownership.md)

**谁在用这个系统，东西归谁。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-account](terms/subjects-and-ownership.md#ul-account--账号--account) | 账号 | Account | 自然人的产品身份，只管标识、鉴权、聚合 |
| [UL-login-identifier](terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier) | 登录标识 | Login Identifier | 账号的对外名字，**部署内唯一、注册时定**；**只指认，不证明持有** |
| [UL-login-state](terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state) | 登录状态 | Login State | 鉴权意义上的一次登录，**不是会话**；退出只失效这一个，**同账号的有效登录状态可被逐个列出与撤销** |
| [UL-organization](terms/subjects-and-ownership.md#ul-organization--组织--organization) | 组织 | Organization | 一个协作范围，能容纳多个账号 |
| [UL-personal-organization](terms/subjects-and-ownership.md#ul-personal-organization--个人组织--personal-organization) | 个人组织 | Personal Organization | 注册时自动产生、不能邀请人的那一个 |
| [UL-team-organization](terms/subjects-and-ownership.md#ul-team-organization--团队组织--team-organization) | 团队组织 | Team Organization | 个人组织之外的所有组织 |
| [UL-parent-organization](terms/subjects-and-ownership.md#ul-parent-organization--上级组织--parent-organization) | 上级组织 | Parent Organization | 一项属性，不是一层，也不带来继承 |
| [UL-ancestor-chain](terms/subjects-and-ownership.md#ul-ancestor-chain--上级链--ancestor-chain) | 上级链 | Ancestor Chain | 顺着上级往上那条链，**不含自己**；「有共同上级」= 各自算进来后两条链有交集 = 同一棵隶属树，那就是资产流转的边界 |
| [UL-offer](terms/subjects-and-ownership.md#ul-offer--邀约--offer) | 邀约 | Offer | 要对方点头才生效的那类东西的**统称**，**当前四样**；**只归类，四样不共享身份机制** |
| [UL-invitation](terms/subjects-and-ownership.md#ul-invitation--邀请--invitation) | 邀请 | Invitation | 发给某个账号的加入邀约，**接受即产生租户**；**会过期** |
| [UL-affiliation-request](terms/subjects-and-ownership.md#ul-affiliation-request--隶属请求--affiliation-request) | 隶属请求 | Affiliation Request | 发给另一个组织的建立隶属邀约，**接受即填上上级组织属性、不产生租户**；**与邀请是两种对象，只是过期规则相同** |
| [UL-tenant](terms/subjects-and-ownership.md#ul-tenant--租户--tenant) | 租户 | Tenant | (组织, 账号) 这一组合，归属与隔离的单位 |
| [UL-membership-standing](terms/subjects-and-ownership.md#ul-membership-standing--成员资格效力--membership-standing) | 成员资格效力 | Membership Standing | 这个租户此刻算不算数，**只有有效/无效两个取值**；**「目标范围不可用」不是第三个取值，那是失败** |
| [UL-current-tenant-identity](terms/subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity) | 当前租户身份 | Current Tenant Identity | 登录状态上的一项选择，**创建那一刻被捕获，之后切换不影响已创建的** |
| [UL-tenant-role](terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role) | 租户角色 | Tenant Role | 租户在其组织内当前能做什么 |
| [UL-super-administrator](terms/subjects-and-ownership.md#ul-super-administrator--超级管理员--super-administrator) | 超级管理员 | Super Administrator | 一个组织内的最高治理角色，**不是平台管理员** |
| [UL-deployment-operator](terms/subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator) | 运维者 | Deployment Operator | 握着一次治理中心部署的人，**不是账号、不是租户角色，产品不记它是谁**；对治理事实没有门 |

## [作用域与求值](terms/scope-and-resolution.md)

**一个值是怎么被算出来的。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-scope-layer](terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer) | 作用域层 | Scope Layer | 身份带来的出厂默认 / 组织级 / 租户级 / 会话级这四层；**设置这一维还多一格工作区** |
| [UL-scope-layer-identity](terms/scope-and-resolution.md#ul-scope-layer-identity--作用域层身份--scope-layer-identity) | 作用域层身份 | Scope Layer Identity | 一格由哪重身份充当：组织 / 租户 / 会话；**出厂默认那一格没有身份**，**工作区不在其列** |
| [UL-workspace](terms/scope-and-resolution.md#ul-workspace--工作区--workspace) | 工作区 | Workspace | 租户持有、会话创建时显式挂上的一级资产归属，**由目录承载而不是目录本身**，不指定就空；**设置压过租户，权限一概不参与**；旧说法 ~~项目~~、~~会话挂上的那个宿主机目录~~ |
| [UL-scoped-object](terms/scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object) | 范围化对象 | Scoped Object | 归属于某一层、参与求值的那类对象 |
| [UL-capability-identifier](terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) | 能力标识 | Capability Identifier | 判定两个对象能否互相覆盖的那个标识，资产上是**类别 ＋ name** |
| [UL-scope-evaluation](terms/scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation) | 作用域求值 | Scope Evaluation | 沿层算出这次实际生效的那一份 |
| [UL-scope-composition-semantics](terms/scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics) | 作用域合成语义 | Scope Composition Semantics | 覆盖 / 收窄 / 组合三种 |
| [UL-two-pass-resolution](terms/scope-and-resolution.md#ul-two-pass-resolution--两轮求值--two-pass-resolution) | 两轮求值 | Two-Pass Resolution | 先算哪个资产，再算它的属性项 |
| [UL-immutable-marker](terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker) | 不可覆盖标记 | Immutable Marker | 把「默认这样」变成「必须这样」的那个标记 |
| [UL-attribute-assignment](terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment) | 属性配值 | Attribute Assignment | 一份资产持有上、一个属性项的一个值，**设置与权限真正被读写的最小单位** |
| [UL-attribute-projection](terms/scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection) | 属性投影 | Attribute Projection | 「组织的设置」是视图不是对象 |
| [UL-runtime-context](terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context) | 运行时 context | Runtime Context | **一块块就地更新的数据**，在 agent loop 内被**模型/工具/拓展点**消费；旧说法 ~~会话上下文感知域~~ |
| [UL-meta-runtime-context](terms/scope-and-resolution.md#ul-meta-runtime-context--元-runtime-context--meta-runtime-context) | 元 runtime context | Meta Runtime Context | **每个会话必需携带并持续更新的那些**，当前**十四项**；与 meta 能力同构 |
| [UL-collaboration-scope-context](terms/scope-and-resolution.md#ul-collaboration-scope-context--协作范围-context--collaboration-scope-context) | 协作范围 context | Collaboration-Scope Context | 我在哪个组织、什么租户身份、什么角色 |
| [UL-personal-context](terms/scope-and-resolution.md#ul-personal-context--个人-context--personal-context) | 个人 context | Personal Context | 跟着人走的偏好，不参与任何层的合成 |

## [能力与构成](terms/capabilities-and-composition.md)

**agent 由什么构成，因此能做什么。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-asset](terms/capabilities-and-composition.md#ul-asset--资产--asset) | 资产 | Asset | 约束 agent 由什么组装而成、从哪被触达、在哪插手，**恰有八类** |
| [UL-setting](terms/capabilities-and-composition.md#ul-setting--设置--setting) | 设置 | Setting | 资产的一种属性，管「怎么做」 |
| [UL-setting-category](terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category) | 设置项类别 | Setting Category | 每项设置必标的四类之一：偏好 / 绑定 / 落点与身份 / 治理；决定值能从哪些层来 |
| [UL-permission](terms/capabilities-and-composition.md#ul-permission--权限--permission) | 权限 | Permission | 资产的一种属性，管「能做什么」 |
| [UL-skill](terms/capabilities-and-composition.md#ul-skill--技能--skill) | 技能 | Skill | 一段可复用的工作方法 |
| [UL-tool](terms/capabilities-and-composition.md#ul-tool--工具--tool) | 工具 | Tool | 一个可被调用的动作，**身份是这一类里的那个 name** |
| [UL-mcp](terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) | MCP | MCP | 一个外部工具来源的接入点；对端每个动作是一个工具条目，run 内不变 |
| [UL-connector](terms/capabilities-and-composition.md#ul-connector--连接件--connector) | 连接件 | Connector | 一个外部消息来源的接入件，**方向相反**；带身份鉴权，接哪个账号是持有上的落点与身份类设置 |
| [UL-loop-extension](terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension) | 拓展件 | Loop Extension | 挂在 loop 拓展点上的一段判断或动作，**第八类资产**；无「放宽」档，可否决含落卡片等人 |
| [UL-modality-converter](terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter) | 模态转换件 | Modality Converter | 站在「消息落盘之前」的拓展件：一块或一文件进，若干别的模态的块 + transcript 出，挂原块作派生表示；按模态/媒体类型登记可替换，本版不是资产；失败即否决 |
| [UL-slash-command](terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command) | 斜杠命令 | Slash Command | 人在交付面敲 `/` 发起某件事的入口；绑定目标恰三种：自定义提示词 / 装配的 skill / 系统业务流程；**只由交付面识别、只对人** |
| [UL-plugin](terms/capabilities-and-composition.md#ul-plugin--插件--plugin) | 插件 | Plugin | 打包分发若干资产的单元，**不是 Cordis plugin** |
| [UL-agent-definition](terms/capabilities-and-composition.md#ul-agent-definition--agent-定义--agent-definition) | Agent 定义 | Agent Definition | 一个 agent 的静态定义，不是会话也不是实例 |
| [UL-agent-type](terms/capabilities-and-composition.md#ul-agent-type--agent-类型--agent-type) | agent 类型 | Agent Type | 这份定义**具不具备 master 的那一整套机制**：`master` / `non-master`；**不是「子 agent」那个意思** |
| [UL-master-category](terms/capabilities-and-composition.md#ul-master-category--master-类目--master-category) | master 类目 | Master Category | master 主要干什么的，五类；**只出厂加**，**不是会话类型** |
| [UL-asset-version](terms/capabilities-and-composition.md#ul-asset-version--资产版本--asset-version) | 资产版本 | Asset Version | 一个资产某一次发布定下的那份内容，已发布即不可变 |
| [UL-asset-composition](terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition) | 资产组合 | Asset Composition | 资产之间、资产与 agent 之间的同一种关系 |
| [UL-agent-constitution](terms/capabilities-and-composition.md#ul-agent-constitution--agent-构成--agent-constitution) | agent 构成 | Agent Constitution | 装配清单里「它是什么」的那部分；旧名 ~~实例构成~~ |
| [UL-action-space](terms/capabilities-and-composition.md#ul-action-space--动作空间--action-space) | 动作空间 | Action Space | 能发起哪些动作，**只由构成决定** |
| [UL-session-slash-command-set](terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set) | 会话斜杠命令集 | Session Slash-Command Set | 一个会话此刻认得的斜杠命令：装配时取此人有权用的，**不在里面的就是不存在**；资产增删禁用不让它自己变，重新装配时整批换，权限收回即时去掉 |
| [UL-meta-capability](terms/capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability) | meta 能力 | Meta Capability | 一整类能力的统一入口，**必定常驻、不可禁用** |
| [UL-prompt-slot](terms/capabilities-and-composition.md#ul-prompt-slot--提示词槽位--prompt-slot) | 提示词槽位 | Prompt Slot | 系统提示词里一个恒定占位的条目 |
| [UL-model-profile](terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) | 模型档案 | Model Profile | 关于一个可被调用的模型的全部事实，是数据不是资产 |
| [UL-model-credential](terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) | 模型凭据 | Model Credential | 组织或租户身上的一项属性，**一范围一把**；身份即范围、轮换是改值、用量归范围；**范围可以自带** |
| [UL-model-request-parameters](terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters) | 模型请求参数 | Model Request Parameters | 档案身上随请求带上的一组常用参数，**系统统一命名、adapter 各自解析**，不认的项留痕不静默丢 |
| [UL-mcp-credential](terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential) | MCP 凭据 | MCP Credential | MCP 接入点持有上的一项落点与身份类设置，**一份持有一份**；静态的或经 OAuth 取得的；**不是模型凭据** |
| [UL-selected-model](terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model) | 选中模型 | Selected Model | 会话当前指向的那条档案，**只因切换而变的取值** |
| [UL-effective-model](terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model) | 有效模型 | Effective Model | 这一次请求实际用的那条档案，**每次现算**；可与选中的不同，算不出是非常态 |

## [流转与授权](terms/circulation-and-entitlement.md)

**东西怎么在主体之间流动，谁凭什么用它。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-definition-ownership](terms/circulation-and-entitlement.md#ul-definition-ownership--定义所有权--definition-ownership) | 定义所有权 | Definition Ownership | 这个定义是谁的 |
| [UL-usage-right](terms/circulation-and-entitlement.md#ul-usage-right--使用权--usage-right) | 使用权 | Usage Right | 一个范围对一份资产有没有使用的权利；定义者直接有，被分享方确认后有 |
| [UL-version-selection](terms/circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection) | 版本选用 | Version Selection | 某个范围当前选了哪个版本 |
| [UL-revocation-is-not-stop](terms/circulation-and-entitlement.md#ul-revocation-is-not-stop--撤销不等于强制停止--revocation-is-not-a-stop) | 撤销不等于强制停止 | Revocation Is Not a Stop | 撤权管的是下一道准入 |
| [UL-asset-holding](terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding) | 资产持有 | Asset Holding | 范围与资产之间的持有关系，**带一个启用/禁用标记**；**配值资格的来源** |
| [UL-asset-origin](terms/circulation-and-entitlement.md#ul-asset-origin--资产来源--asset-origin) | 资产来源 | Asset Origin | official 还是 customized |
| [UL-official-asset](terms/circulation-and-entitlement.md#ul-official-asset--官方件--official-asset) | 官方件 | Official Asset | 组装的最小必需，**不可禁用** |
| [UL-customized-asset](terms/circulation-and-entitlement.md#ul-customized-asset--自定义件--customized-asset) | 自定义件 | Customized Asset | 自定义来源，对 official 只有「替代」一种关系 |
| [UL-asset-copy](terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy) | 资产复制 | Asset Copy | 同一个人两个租户身份之间的搬运，**断链**；**「资产转移」是它的弃用说法** |
| [UL-asset-sharing](terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing) | 资产分享 | Asset Sharing | 主体之间的授权，所有权不动，**被动跟随** |
| [UL-copy-lineage](terms/circulation-and-entitlement.md#ul-copy-lineage--复制血缘--copy-lineage) | 复制血缘 | Copy Lineage | 再复制一次该更新哪一份；**「转移血缘」是它的弃用说法** |
| [UL-asset-removal](terms/circulation-and-entitlement.md#ul-asset-removal--资产移除--asset-removal) | 资产移除 | Asset Removal | 不再持有，配的值随之消失；**agent 不知道有这回事** |
| [UL-asset-disable](terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable) | 资产禁用 | Asset Disable | 每份持有资产上的一项布尔设置：为真则**装配时不可见**、配置原样保留；**任一层为真即为真** |

## [Agent 运行时闭环](terms/agent-runtime-loop.md)

**一段协作怎么从触发走到收束，又怎么回到会话。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-single-active-execution](terms/agent-runtime-loop.md#ul-single-active-execution--会话内单活跃--single-active-execution) | 会话内单活跃 | Single Active Execution | **一个会话同一时刻至多一个活跃 Run、一个活跃 agent runtime**（GPT-Live 时重裁） |
| [UL-session](terms/agent-runtime-loop.md#ul-session--会话--session) | 会话 | Session | 一段协作的耐久身份与归属边界，**不要求有人说过话** |
| [UL-primary-session](terms/agent-runtime-loop.md#ul-primary-session--主会话--primary-session) | 主会话 | Primary Session | 不是任何会话之子会话的那个；**彼此生命周期独立** |
| [UL-child-session](terms/agent-runtime-loop.md#ul-child-session--子会话--child-session) | 子会话 | Child Session | `delegate`/`spawn` 出的子 agent 所在的会话；**不继承历史，spawn 不是 fork** |
| [UL-session-archival](terms/agent-runtime-loop.md#ul-session-archival--会话归档--session-archival) | 会话归档 | Session Archival | **唯一那个「协作到此为止」的锚点**；**租户手动或到期自动**；**本身可撤销，连带的三件事不可逆** |
| [UL-session-type](terms/agent-runtime-loop.md#ul-session-type--会话类型--session-type) | 会话类型 | Session Type | 这个会话主要干什么的，**由 AgentDefinition 算出来**；**不是闸门** |
| [UL-session-run-mode](terms/agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode) | 会话运行模式 | Session Run Mode | 「本该问人」那一刻怎么办：`never` / `auto_permission` / `bypass-permissions`；**别与执行环境那维的 `auto_place` 混** |
| [UL-run](terms/agent-runtime-loop.md#ul-run--运行--run) | 运行 | Run | 一次逻辑执行请求及其结果；**有没人承接的输入且无未终结运行就开始，落终态才结束**；成本与失败的归属单位。**未终结不等于有协程活着** |
| [UL-trigger](terms/agent-runtime-loop.md#ul-trigger--触发--trigger) | 触发 | Trigger | **让待处理消息队列从空变非空的那件事**，不必是人说了一句话 |
| [UL-pending-message-queue](terms/agent-runtime-loop.md#ul-pending-message-queue--待处理消息队列--pending-message-queue) | 待处理消息队列 | Pending Message Queue | 日志里还没被 loop 取走的那些消息，**是投影不是另一份存储** |
| [UL-input-claim](terms/agent-runtime-loop.md#ul-input-claim--承接--input-claim) | 承接 | Input Claim | loop 把队列里一批消息取走交给某次运行，**每一次都落一条记录**；**不是入站到达** |
| [UL-run-attempt](terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt) | 执行尝试 | Run Attempt | 同一次运行内第几次起协程，**身份 (运行, 序号) 从日志派生、不另存**；**重试不是新的 Run** |
| [UL-run-terminal-state](terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state) | 运行终态 | Run Terminal State | **恰有三种**，只从一个出口落账；**等人不是终态** |
| [UL-agent-loop](terms/agent-runtime-loop.md#ul-agent-loop--agent-loop--agent-loop) | Agent Loop | Agent Loop | 推进一次运行的那个**纯函数**；**被求值的那个，不是求值它的那个** |
| [UL-agent-runtime](terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) | agent runtime | Agent Runtime | **求值 loop 的那个协程**；全系统**唯一的 event loop**，不持有状态 |
| [UL-agent-step](terms/agent-runtime-loop.md#ul-agent-step--agent-的一步--agent-step) | agent 的一步 | Agent Step | loop 转一圈；**一步之内至多一次模型调用** |
| [UL-current-conditions](terms/agent-runtime-loop.md#ul-current-conditions--当下条件--current-conditions) | 当下条件 | Current Conditions | 日志之外、此刻才成立的那些，**不落日志** |
| [UL-loop-extension-point](terms/agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point) | Loop 拓展点 | Loop Extension Point | 一个状态点的紧前或紧后，**按位置命名不按功能**；可挂多个。**当前十一个** |
| [UL-wait-primitive](terms/agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive) | 等待原语 | Wait Primitive | 协程「停下来等外面应答」的那一种办法，主流程与拓展件共用；协程没了靠卡片与答复活着 |
| [UL-replay](terms/agent-runtime-loop.md#ul-replay--回放--replay) | 回放 | Replay | 新尝试把挂起中的拓展件按日志重跑到挂起点；不花第二遍钱、不出第二张卡 |
| [UL-agent-assembly](terms/agent-runtime-loop.md#ul-agent-assembly--agent-装配--agent-assembly) | Agent 装配 | Agent Assembly | 把定义在某作用域下**求值成一份清单**的那个动作 |
| [UL-assembly-manifest](terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest) | 装配清单 | Assembly Manifest | 「当时那个 agent 是什么样」的唯一答案；**是数据，可跨尝试复用** |
| [UL-runtime-injection](terms/agent-runtime-loop.md#ul-runtime-injection--运行时注入--runtime-injection) | 运行时注入 | Runtime Injection | 外面给的，换了不用重建，**不是 DI** |
| [UL-incremental-loading](terms/agent-runtime-loop.md#ul-incremental-loading--增量装载--incremental-loading) | 增量装载 | Incremental Loading | 运行中加一个可选能力，清单上追加一条 |
| [UL-cancellation-follows-host](terms/agent-runtime-loop.md#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host) | 取消跟着宿主走 | Cancellation Follows Host | **宿主没了它就没了**；转后台就是换宿主 |
| [UL-graceful-cancellation](terms/agent-runtime-loop.md#ul-graceful-cancellation--优雅取消--graceful-cancellation) | 优雅取消 | Graceful Cancellation | 显式动作：先不接新活，等停当，再释放（旧名**实例退役**） |
| [UL-forced-stop](terms/agent-runtime-loop.md#ul-forced-stop--强制停止--forced-stop) | 强制停止 | Forced Stop | 立刻撤销执行资格，**外部效果收不回来** |

## [落地与隔离](terms/grounding-and-isolation.md)

**动作实际落到哪里，事实本身又存在哪一处。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-execution-environment](terms/grounding-and-isolation.md#ul-execution-environment--执行环境--execution-environment) | 执行环境 | Execution Environment | 动作落到哪里，**永远存在，且是注入的** |
| [UL-sandbox](terms/grounding-and-isolation.md#ul-sandbox--沙箱--sandbox) | 沙箱 | Sandbox | 执行环境中隔离的那些，**不是上位概念** |
| [UL-sandbox-implementation](terms/grounding-and-isolation.md#ul-sandbox-implementation--沙箱实现--sandbox-implementation) | 沙箱实现 | Sandbox Implementation | 装配时可选装配的隔离环境提供者，**同一套契约，自报设施与可绑定层级** |
| [UL-host-machine](terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine) | 宿主机 | Host Machine | 唯一不隔离的那一个，**始终在场，但要被显式允许才落得上去** |
| [UL-stateless-sandbox](terms/grounding-and-isolation.md#ul-stateless-sandbox--无状态沙箱--stateless-sandbox) | 无状态沙箱 | Stateless Sandbox | 用完就扔 |
| [UL-session-sandbox](terms/grounding-and-isolation.md#ul-session-sandbox--会话级沙箱--session-scoped-sandbox) | 会话级沙箱 | Session-Scoped Sandbox | 到点销毁，数据不留存 |
| [UL-tenant-sandbox](terms/grounding-and-isolation.md#ul-tenant-sandbox--租户级沙箱--tenant-scoped-sandbox) | 租户级沙箱 | Tenant-Scoped Sandbox | 共享工作空间，**只有它要求数据持久** |
| [UL-sandbox-data](terms/grounding-and-isolation.md#ul-sandbox-data--沙箱数据--sandbox-data) | 沙箱数据 | Sandbox Data | 与沙箱本体分开的那个东西 |
| [UL-environment-facility](terms/grounding-and-isolation.md#ul-environment-facility--环境设施--environment-facility) | 环境设施 | Environment Facility | 这个环境提供哪几种做事的手段 |
| [UL-terminal-session](terms/grounding-and-isolation.md#ul-terminal-session--终端会话--terminal-session) | 终端会话 | Terminal Session | `Shell()` 开的那条命令行，**与[会话](terms/agent-runtime-loop.md#ul-session--会话--session)毫无关系** |
| [UL-execution-environment-permission](terms/grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission) | 执行环境权限 | Execution Environment Permission | per-tool 三态，管**作用落在哪**不管**动作准不准**；`auto_place` 别混 `auto_permission` |
| [UL-session-base](terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base) | 会话据点 | Session Base | 一个账号的会话、日志、卡片与 runtime 实际所在的那一处，身份是（一处 · 中心 · 账号）；**不是进程**，没人开着屏时照常发生事 |
| [UL-governance-center](terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center) | 治理中心 | Governance Center | 治理事实与组织／租户层范围化对象所在的那一处，**一次部署一个、身份不是它的地址**；**它不知道任何会话** |
| [UL-deployment-key](terms/grounding-and-isolation.md#ul-deployment-key--部署密钥--deployment-key) | 部署密钥 | Deployment Key | 这一次部署独有的一套秘密，让「只有中心自己能说的话」不可伪造；**不加密任何东西，换了什么都不丢** |
| [UL-governance-center-identifier](terms/grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier) | 治理中心标识 | Governance Center Identifier | 中心指认自己的名字，首次启动定下、不变、跟着数据走；**不是地址、不是秘密**，搬家还是另一个中心比它 |
| [UL-deployment-parameter](terms/grounding-and-isolation.md#ul-deployment-parameter--部署参数--deployment-parameter) | 部署参数 | Deployment Parameter | 「按部署配置」那些值的统称，运维者给值、缺一不可、改了只影响此后；**不是范围化对象** |

## [取用与可用性](terms/reach-and-availability.md)

**一样能力此刻够不够得着、做不做得了。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-residency](terms/reach-and-availability.md#ul-residency--常驻--residency) | 常驻 | Residency | 能力身份始终对 agent 可见；**是引用上的一项偏好类设置，不是资产的属性**；可见时展示什么归装配策略 |
| [UL-current-availability](terms/reach-and-availability.md#ul-current-availability--当下可用性--current-availability) | 当下可用性 | Current Availability | **依赖解析的结果，不是开关**；每次 run 前重算。**可见但用了一定失败**，与禁用不同 |
| [UL-stand-in](terms/reach-and-availability.md#ul-stand-in--替换件--stand-in) | 替换件 | Stand-in | 不可用时占在原位的**同形呈现**：只换说明，调用必得「不可用」 |
| [UL-dependency-declaration](terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration) | 依赖声明 | Dependency Declaration | **一串必需项的抽象名字**，种类不限；**只有且，只有必需** |
| [UL-governance-center-health-check](terms/reach-and-availability.md#ul-governance-center-health-check--治理中心体检--governance-center-health-check) | 治理中心体检 | Governance Center Health Check | 中心「我在不在、能不能答」的自述；公开部分恰三样、登录前可读，**不含治理事实与秘密** |

## [执行与收场](terms/execution-and-outcome.md)

**一件事怎么跑、跑时跟外面说什么、跑偏了谁接手、最后怎么了结。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-tool-definition](terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition) | 工具定义 | Tool Definition | 一个工具在数据与治理层面的身份与表示，**可自带实现** |
| [UL-tool-execution](terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution) | 工具执行 | Tool Execution | 一次执行，**计算资源，绑会话不绑实例** |
| [UL-background-execution](terms/execution-and-outcome.md#ul-background-execution--后台执行--background-execution) | 后台执行 | Background Execution | 不占当前这一轮地跑，**不声明就是不能** |
| [UL-model-call](terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) | 一次模型调用 | Model Call | 发出请求到拿回完整一份；**与工具执行是兄弟** |
| [UL-tool-wait-state](terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state) | 工具等待态 | Tool Wait State | 一次工具执行停下来等一个应答，**「谁来应答」不是它的一部分** |
| [UL-frame-emission](terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission) | 发帧 | Frame Emission | 跑的过程中交出「我正在干什么」，**不承诺任何事** |
| [UL-execution-frame](terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) | 执行帧 | Execution Frame | **一条 `ToolInternalMessage` 的到达增量**，走与模型回复同一套到达语法 |
| [UL-tool-output](terms/execution-and-outcome.md#ul-tool-output--工具产出--tool-output) | 工具产出 | Tool Output | 三部分，**读者不同**；帧只给人看，agent 看不到 |
| [UL-call-account](terms/execution-and-outcome.md#ul-call-account--调用账目--call-account) | 调用账目 | Call Account | 一次调用或执行花了什么、产出多少的账；**进日志不进上下文**，费用拿不到记未知 |
| [UL-attachment](terms/execution-and-outcome.md#ul-attachment--附件--attachment) | 附件 | Attachment | 存进存储、不进对话，agent 自己去取 |
| [UL-result-offloading](terms/execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading) | 结果卸载 | Result Offloading | 原始结果存起来、消息里换成带摘要的占位，**不是全卸载** |
| [UL-offloaded-result](terms/execution-and-outcome.md#ul-offloaded-result--被卸载的原始结果--offloaded-result) | 被卸载的原始结果 | Offloaded Result | 太大而被卸载存起来的那份完整工具结果，日志里只有占位 |
| [UL-execution-outcome](terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome) | 执行收场 | Execution Outcome | 六种，**非完成的四种里只有一种是失败** |
| [UL-nominal-path](terms/execution-and-outcome.md#ul-nominal-path--主路径--nominal-path) | 主路径 | Nominal Path | 一层没出非常态时本该的样子，**推进式或稳态式** |
| [UL-off-nominal](terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal) | 非常态 | Off-Nominal | 某层此刻不在主路径上，**是状态不是一类事，与报错无关** |
| [UL-escalation](terms/execution-and-outcome.md#ul-escalation--上交--escalation) | 上交 | Escalation | 了结不了就把处置权交给外面一层，**交身份与分类不交正文** |
| [UL-terminal-disposition](terms/execution-and-outcome.md#ul-terminal-disposition--终局--terminal-disposition) | 终局 | Terminal Disposition | 交到头也回不去了；**落终局的是那件事，不是那一层** |

## [交互与派发](terms/interaction-and-dispatch.md)

**agent 跟人、跟别的 agent 怎么来往，外面怎么进来，人从哪一面碰到它。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-agent-dispatch](terms/interaction-and-dispatch.md#ul-agent-dispatch--agent-派发--agent-dispatch) | agent 派发 | Agent Dispatch | `spawn` / `delegate` / `handoff` 三种，**五维取值不同** |
| [UL-inter-agent-communication](terms/interaction-and-dispatch.md#ul-inter-agent-communication--agent-间通信--inter-agent-communication) | agent 间通信 | Inter-Agent Communication | **两条规则，覆盖面不一样**；素不相识的也能通 |
| [UL-subagent](terms/interaction-and-dispatch.md#ul-subagent--子-agent--subagent) | 子 agent | Subagent | 会话是当前会话之**子会话**的那个；**`handoff` 与第三方 harness 不算** |
| [UL-dispatch-report](terms/interaction-and-dispatch.md#ul-dispatch-report--派发报告--dispatch-report) | 派发报告 | Dispatch Report | **终结这次派发，不是那个会话**；只来一次 |
| [UL-hitl](terms/interaction-and-dispatch.md#ul-hitl--人在回路--human-in-the-loop) | 人在回路 | Human in the Loop | 停下来等人，**没有上限** |
| [UL-run-wait-state](terms/interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state) | 运行等待态 | Run Wait State | 系统算出来的、**直接把 run 停住**的那种等 |
| [UL-decision-card](terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card) | 决策卡片 | Decision Card | 让人**当场**就能判断；**一张只能答一次**；来源三种：agent / 系统 / 拓展件 |
| [UL-card-batch](terms/interaction-and-dispatch.md#ul-card-batch--一批卡片--card-batch) | 一批卡片 | Card Batch | 一次停下来产生的那批卡片，全了才解除阻塞 |
| [UL-decision-pool](terms/interaction-and-dispatch.md#ul-decision-pool--决策池--decision-pool) | 决策池 | Decision Pool | 租户内所有等着的卡片，**是陈列不是主体** |
| [UL-admission-decision](terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision) | 放行判断 | Admission Decision | 一个函数，**既是判官也是撰稿人**；三样输入合起来 |
| [UL-inquiry](terms/interaction-and-dispatch.md#ul-inquiry--问询--inquiry) | 问询 | Inquiry | agent 主动问人，**一次问全** |
| [UL-approval-request](terms/interaction-and-dispatch.md#ul-approval-request--请示--approval-request) | 请示 | Approval Request | 动手之前请人准不准，**固定两个选项** |
| [UL-session-authorization-context](terms/interaction-and-dispatch.md#ul-session-authorization-context--会话授权上下文--session-authorization-context) | 会话授权上下文 | Session Authorization Context | 用户关于授权说过的话，**按序排着的流水**；**是数据不是结论**，归档不丢 |
| [UL-authorization-expression](terms/interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression) | 授权表达 | Authorization Expression | 流水里的**一笔**：来源 × 方向 × 作用域；**「决策记录」是它的弃用说法** |
| [UL-inbound-arrival](terms/interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival) | 入站到达 | Inbound Arrival | 外面送进一个会话、**被受理之后**的那条事实；**不是消息**，**裸写「到达」不作数** |
| [UL-business-flow-extension-point](terms/interaction-and-dispatch.md#ul-business-flow-extension-point--业务流程拓展点--business-flow-extension-point) | 业务流程拓展点 | Business Flow Extension Point | 拦得住请求，**碰不到已经落定的事实**；**与 Loop 拓展点并列的另一类** |
| [UL-control-command](terms/interaction-and-dispatch.md#ul-control-command--控制指令--control-command) | 控制指令 | Control Command | 对正在发生的事或队列本身的直接处置，**不是内容、不排队** |
| [UL-queue-jump](terms/interaction-and-dispatch.md#ul-queue-jump--插队--queue-jump) | 插队 | Queue Jump | 「这句话我要现在就被看到」，**插的是时间不是位置**；**不终止运行** |
| [UL-delivery-surface](terms/interaction-and-dispatch.md#ul-delivery-surface--交付面--delivery-surface) | 交付面 | Delivery Surface | 把日志投影给人看、把人做的事送进受理的那一面，**不持有领域事实、没有自己的领域语义**；本版只有一种 |
| [UL-presentation-form](terms/interaction-and-dispatch.md#ul-presentation-form--呈现形式--presentation-form) | 呈现形式 | Presentation Form | 同一份事实交给读者的形式，**恰两种**：人读 / 机读；**别混会话运行模式** |
| [UL-look-and-feel-preference](terms/interaction-and-dispatch.md#ul-look-and-feel-preference--观感偏好--look-and-feel-preference) | 观感偏好 | Look-and-Feel Preference | 只影响好不好看、顺不顺手的那些选择，**loop 内三个角色都不消费它**；个人 context 的一部分，不是 agent 要感知的界面偏好 |

## [记录与上下文](terms/record-and-context.md)

**留下了什么，以及怎么把它组装给读的人或模型。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-occurrence](terms/record-and-context.md#ul-occurrence--发生的事--occurrence) | 发生的事 | Occurrence | 留下记录之前的那个东西，**判断打在它身上** |
| [UL-record-entry](terms/record-and-context.md#ul-record-entry--记录条目--record-entry) | 记录条目 | Record Entry | 一条不可变条目，**产出多条只有两个原因** |
| [UL-entry-standing](terms/record-and-context.md#ul-entry-standing--条目效力--entry-standing) | 条目效力 | Entry Standing | 丢了会怎样——**依据 / 留痕 / 瞬态** |
| [UL-session-log](terms/record-and-context.md#ul-session-log--会话日志--session-log) | 会话日志 | Session Log | **只增不改的流水账**，消息只是它的一部分 |
| [UL-session-log-projection](terms/record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection) | 会话日志投影 | Session Log Projection | 从日志派生的视图，**不是第二份权威**；重算必得同一答案 |
| [UL-message](terms/record-and-context.md#ul-message--消息--message) | 消息 | Message | 一条对话记录，**七种，按谁在说话分** |
| [UL-content-block](terms/record-and-context.md#ul-content-block--内容块--content-block) | 内容块 | Content Block | 一条消息装的是若干个块，**不是一段文本** |
| [UL-derived-rendering](terms/record-and-context.md#ul-derived-rendering--派生表示--derived-rendering) | 派生表示 | Derived Rendering | 转换件产出、挂在原块上的一组别的模态的块；原块不动，落盘前写好不变 |
| [UL-transcript](terms/record-and-context.md#ul-transcript--transcript--transcript) | transcript | Transcript | 转换件为一个块产出的纯文本兜底；有它的块不再把模型挡在合法目标外 |
| [UL-modality](terms/record-and-context.md#ul-modality--模态--modality) | 模态 | Modality | 一类内容的形态，**恰四种**：文本 · 图 · 语音 · 视频；档案上与块上两处必须对得上；**块的模态看媒体类型**，视频装在文件块里 |
| [UL-modality-projection](terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection) | 模态投影 | Modality Projection | 会话历史里出现过哪几种**没有 transcript** 的模态；从日志派生、只增不减；合法目标的输入 |
| [UL-block-annotation](terms/record-and-context.md#ul-block-annotation--块标注--block-annotation) | 块标注 | Block Annotation | 给人看吗、给模型看吗——**标在块上不在消息上** |
| [UL-incremental-arrival](terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival) | 增量到达 | Incremental Arrival | 分次到达，**能长的只有四样**；半条不是消息 |
| [UL-in-flight-arrival](terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival) | 在途状态 | In-Flight Arrival | 收尾之前拼到一半的那份，**运行时持有，不进日志、不是消息** |
| [UL-todo-item](terms/record-and-context.md#ul-todo-item--待办条目--todo-item) | 待办条目 | Todo Item | agent 记给自己看的一条待办，活在一次会话里 |
| [UL-context-assembly](terms/record-and-context.md#ul-context-assembly--上下文组装--context-assembly) | 上下文组装 | Context Assembly | 从日志拼出给某一方看的那份，**只读不写** |
| [UL-user-facing-context](terms/record-and-context.md#ul-user-facing-context--给用户看的上下文--user-facing-context) | 给用户看的上下文 | User-Facing Context | 两个动作，**方向相反、锚点不同** |
| [UL-model-facing-context](terms/record-and-context.md#ul-model-facing-context--给模型看的上下文--model-facing-context) | 给模型看的上下文 | Model-Facing Context | 两块分别组装，**只有第二块压得动** |
| [UL-system-prompt](terms/record-and-context.md#ul-system-prompt--系统提示词--system-prompt) | 系统提示词 | System Prompt | 实例存续期内恒定，**压缩碰不到它** |
| [UL-prefix-consistency](terms/record-and-context.md#ul-prefix-consistency--前缀一致--prefix-consistency) | 前缀一致 | Prefix Consistency | 开头那段与上一次逐字相同，**尽可能最大化** |
| [UL-context-compaction](terms/record-and-context.md#ul-context-compaction--上下文压缩--context-compaction) | 上下文压缩 | Context Compaction | **三个目标两两相冲**；能做两件、不能做两件 |
| [UL-compaction-record](terms/record-and-context.md#ul-compaction-record--压缩记录--compaction-record) | 压缩记录 | Compaction Record | `CompactionMessage`；**边界不是一条截断线** |

返回[统一语言入口](README.md)

# 能力与构成

### UL-model-adaptation-binding · 模型适配绑定 · Model Adaptation Binding

> **中**：一次模型调用所持有的适配属性，指明其公共实现、家族规则与模型窄定义的精确版本，以及采用的配置。同一个绑定内的规则和配置不随后续更新变化。
>
> **EN**: The adaptation attribute held by a model invocation, identifying the exact versions of its shared implementation, family rules and narrow model definition, together with the adopted configuration. Rules and configuration in one binding do not change after later updates.

- **形态**：属性
- **出处**：[UL-D-6](../decisions.md#ul-d-6--模型适配绑定--2026-09-27)
- **别混**：与模型档案的范围身份、凭据以及 Cordis fiber 实例身份不同；不是独立领域对象。

### UL-model-prefix-cache-policy · 模型前缀缓存策略 · Model Prefix Cache Policy

> **中**：模型适配绑定中控制上游请求前缀缓存的配置属性，明确自动或显式方式及适用配置。该配置不代表上游已写入或读取缓存。
>
> **EN**: The configuration attribute of a model adaptation binding that controls upstream prompt-prefix caching, specifying automatic or explicit mode and its applicable configuration. Configuration does not establish that the upstream has written or read a cache.

- **形态**：属性
- **出处**：[UL-D-6](../decisions.md#ul-d-6--模型适配绑定--2026-09-27)
- **别混**：与完整响应缓存、缓存命中事实和本系统持久化日志不同。

**这一卷回答：agent 由什么构成，以及它因此能做什么。**

收在这里的是**被持有、被组装的那些东西**，以及它们之间的构成关系。
**这些东西怎么在主体之间流动**归[流转与授权](circulation-and-entitlement.md)，
**它们的值怎么被算出来**归[作用域与求值](scope-and-resolution.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

## 三样东西

### UL-asset · 资产 · Asset

> **中**：**约束 agent 由什么组装而成、从哪里被触达、以及推进时在哪些位置插手**的那一类对象。
> 它是三样东西里**唯一独立存在的对象**；
> [设置](#ul-setting--设置--setting)与[权限](#ul-permission--权限--permission)是它的**两种属性**。
> **恰有[八类](#八类资产)，这八类是穷尽的。**
>
> **EN**: The class of objects that **constrains what an agent is assembled from**,
> **through which channels it can be reached**, and **where things may be inserted as
> its loop advances**. It is the only one of the three that exists as an object in
> its own right; settings and permissions are two kinds of **attribute on** it.
> **There are exactly eight kinds, and the list is exhaustive.**

- **形态**：对象
- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)（rev 23） · [资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 23）
- **别混**：知识、经验、报告、附件与文件**都不是资产**——它们是 agent **读写的对象**，**不参与组装**
- **注意 ①**：判据是**它在 agent definition 里被声明、被持有、被授权、按层级求值**——**这四件事**，不是「它提供动作」
- **注意 ②**：**规格里的「资产记录」指的是同一个[能力标识](scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)下的一份具体资产**——所有者、来源、草稿与版本线都挂在它身上；它是本条身份的下层（[对象条目](../../domain_objects/objects.md#ul-asset--资产)），**不另立词条**。**草稿是它身上还没发布的那份内容**，[不是版本](#ul-asset-version--资产版本--asset-version)，也不另立

### UL-setting · 设置 · Setting

> **中**：[资产](#ul-asset--资产--asset)的一种属性，约束 agent **以什么配置、什么参数去做**。
> **资产定形状**（有哪些项、什么含义、取值域是什么），**持有它的各层配值**，
> 运行时按[覆盖](scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)求值。
>
> **EN**: A kind of attribute on an asset, constraining **with what configuration and
> parameters** the agent acts. **The asset defines the shape** (which entries exist,
> what they mean, what values they admit), **each layer holding it supplies values**,
> and at run time they resolve by **override**.

- **形态**：属性
- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)（rev 23） · [PF-002 §5.2](../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)（rev 26）
- **注意 ①**：配值的资格来自**持有**——**没有这个工具，就配不了它的执行权限**。
  配下的那一格叫[属性配值](scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)，
  **挂在那份持有上**
- **注意 ②**：**配值的不只组织与租户**——[工作区](scope-and-resolution.md#ul-workspace--工作区--workspace)那一级也配得了，
  且[它配的值压过租户](../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)，
  **除非上层加了 `immutable`**
- **注意 ③**：[禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)是一项**特殊的布尔设置**——
  **任一层为真即为真**，那等价于「覆盖 ＋ 真即 `immutable`」
- **注意 ④**：**每一项设置带一个[设置项类别](#ul-setting-category--设置项类别--setting-category)**，
  类别决定这项值能从哪些层来——**落点与身份类不从工作区来**
- **注意 ⑤**：**同标识替换之后，设置按资产取值**——外层给原来那一份配的值（连锁住的在内）不落到替换它的那一份上（[PF-002 §5.5](../../product/PF-002-assets-settings-and-permissions/design.md#替换是一条路径不是一扇后门)）；与[权限](#ul-permission--权限--permission)相反

### UL-setting-category · 设置项类别 · Setting Category

> **中**：[资产](#ul-asset--资产--asset)声明一项[设置](#ul-setting--设置--setting)时**必须标上的那个类别**，
> 取值恰为四个：**偏好**（改错顶多难用）、**绑定**（指向本系统内另一份资产或一个位置）、
> **落点与身份**（东西在哪执行、连到哪、送到哪、以谁的名义、用哪把凭据）、**治理**（管别的设置与权限怎么起作用：禁用、`immutable`、连接件的触发会话的默认运行模式）。
> 它决定**这项值能从哪些归属层来**：落点与身份类、以及治理类里除禁用之外的项，
> [工作区](scope-and-resolution.md#ul-workspace--工作区--workspace)那一级一概配不了，加载时与权限一起滤掉。
> 判一项归哪类问两句：**改了会不会换掉这次运行要过的那道权限门、或改变一道已放行的权限实际放出去的是什么——会，就是落点与身份**；
> **改的若是那道门自己怎么判**（锁不锁得住、「本该问人」的那一刻是拒、是算、还是放）**——就是治理**。
>
> **EN**: The class an asset **must assign to each setting entry it declares**, drawn from
> exactly four values: **preference** (a wrong value is at worst inconvenient), **binding**
> (points at another asset or a position inside this system), **placement and identity**
> (where something runs, connects or delivers, on whose behalf, with which credential), and
> **governance** (how other settings and permissions take effect: disable, `immutable`, a
> connector's default run mode for triggered sessions). It decides **from which ownership
> layers a value may come**: placement-and-identity entries and every governance entry other
> than disable can never be set by the workspace level; they are filtered at load time together
> with permissions. Two tests classify an entry: **would changing it change which permission
> gate this run passes through, or what an already-granted permission actually lets out — if so,
> placement and identity**; **does it change how that gate itself decides** (whether a lock
> holds, what happens at the moment a person should be asked) **— if so, governance**.

- **形态**：属性
- **出处**：[PF-002 §5.2 设置项分四类](../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)（rev 26）
- **别混**：与[能力标识](scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)里的「类别」不是一回事——
  那是**资产**的八类之一，这是**设置项**的四类之一；正文里裸写「类别」指前者
- **注意**：工作区**自己带来的**资产，其落点类设置随资产一起来——这条限定挡的是**改别人资产的落点**

### UL-permission · 权限 · Permission

> **中**：[资产](#ul-asset--资产--asset)的一种属性，约束 agent **能执行什么动作、边界在哪**。
> 每一层对它能做两件事之一：**锁下一个允许集合**（一道界），或**不锁、只挑一个值**。
> 各层的界按[收窄](scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)取交集，
> **更外层锁下的界，更具体的一层突破不了**；界内取哪一个，由最具体的、挑在界内的那一层定。
> **配成「禁止」的，锁不锁都是界。**
>
> **EN**: A kind of attribute on an asset, constraining **which actions the agent may
> perform and where the boundary lies**. Each layer may do one of two things with it:
> **lock a set of permitted values** (a bound), or **pick a single value without locking**.
> Bounds combine by **narrowing** — their intersection across layers — so **a bound locked
> further out cannot be broken by a more specific layer**; within the bound, the value is
> the one picked by the most specific layer whose pick falls inside it. **Setting "forbid"
> is a bound whether locked or not.**

- **形态**：属性
- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)（rev 23） · [§6.2](../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 23） · [PF-002 §5.3](../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)（rev 26）
- **别混**：**不是[租户角色](subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role)**——角色是**身份**的属性，权限是**资产**的属性
- **注意 ①**：**一次运行之内，权限变了，[动作空间](#ul-action-space--动作空间--action-space)不变**；运行之间也只有[「谁可以使用它」](circulation-and-entitlement.md#ul-usable-by--谁可以使用它--usable-by)会让下一次运行的构成变小——它改的是装不装进来
- **注意 ②**：**不锁的配值不是界**——组织配「问一下」而不锁，成员挑「自动」就生效；组织要守的边界必须锁（「禁止」除外）
- **注意 ③**：**同标识替换之后，外层为这个身份锁下的界照样管着替换它的那一份**；那一份少声明了锁住的某一项，那一项按最严算（[PF-002 §5.5](../../product/PF-002-assets-settings-and-permissions/design.md#替换是一条路径不是一扇后门)）
- **注意 ④**：**权限项有哪几项由资产的类别定，作者不能自加**；[「谁可以使用它」](../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)是各类共用的一项

## 八类资产

### UL-skill · 技能 · Skill

> **中**：**一段可复用的工作方法**——告诉 agent「遇到这类事情该怎么做」。
> 主体是**可读的指引正文**，可以带上所需的资源文件。
> **读取一个 skill 不等于运行它带的脚本**，也不自动装载它的全部附件。
>
> **EN**: **A reusable way of working** — telling the agent how to handle a class of
> situations. Its substance is **readable guidance text**, optionally accompanied by
> resource files. **Reading a skill is not running the scripts it carries**, nor does
> it automatically load all of its attachments.

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-002 §4 Skill](../../product/PF-002-assets-settings-and-permissions/design.md#skill)（rev 26） · [PF-006 §4 技能的说明](../../product/PF-006-tools-and-skills/design.md#技能的说明)（rev 20）
- **别混**：Skill 说**怎么做**，[Tool](#ul-tool--工具--tool) 是**做的那个动作**。「代码审查该看哪些地方」是 skill，「读文件」是 tool
- **注意**：它的**说明**是触发与路由的依据——[常驻](reach-and-availability.md#ul-residency--常驻--residency)时进系统提示词的是 name 与说明，`Skills().search` 按它找，替换件换掉的也是它；正文与资源按需取
- **能组合**：Tool

### UL-tool · 工具 · Tool

> **中**：**一个可被调用的动作。**它的身份是**这一类里的那个 name**；参数形状、说明、返回形状
> 与实现都跟着实现走，**所以同一个 name 下可以有平台、组织、租户各自的一份，彼此替代**。
> 一个 tool 可以是**多命令**的，而**整套命令在组装时只占一个[槽位](#ul-prompt-slot--提示词槽位--prompt-slot)**。
>
> **EN**: **One invocable action.** Its identity is **its name within this kind**; the argument
> shape, description, result shape and implementation all travel with the implementation, so
> **one name may have a platform, an organization and a tenant version, each standing in for
> the others**. A tool may be **multi-command**, and **the whole command set occupies a single
> slot** at assembly time.

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-002 §4 Tool](../../product/PF-002-assets-settings-and-permissions/design.md#tool)（rev 26）
- **别混**：**子命令是 tool 的内部结构，不是独立资产**——随这个 tool 一起被持有、配置与授权
- **⚠️ 别混**：**「工具」这个词指三样东西，寿命各不相同**——
  [工具定义](execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)（数据，长期）、
  动作空间里的那个条目（构成，绑 agent runtime）、
  [工具执行](execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)（计算资源，**绑会话**）。
  **本条说的是它作为一类资产**
- **注意**：本系统把 Tool 定为**顶层资产**，与前身 `omne-next` 把它归为「组件」**有意相反**
- **能组合**：Skill

### UL-mcp · MCP · MCP

> **中**：**一个外部工具来源的接入点。**接进来之后，它提供的动作可被 agent 使用。
> **接入点本身是资产，它带来的那些动作不单独成为资产**——随它一起被持有、授权与治理。
> **对端的可用性与版本不由本系统掌握**：它提供的动作可能今天有明天没有，**而这不是故障**。
> **对端的每一个动作在动作空间里是一个工具条目**——不常驻、经取用入口发现；
> 动作集**每一次[执行尝试](agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)开始前与可用性一起重算，一次尝试之内不变**。
>
> **EN**: **An access point to an external source of tools.** Once connected, the
> actions it offers become usable by the agent. **The access point is the asset; the
> actions it brings are not assets of their own** — they are held, authorized and
> governed along with it. **Availability and versioning on the far side lie outside
> this system's control**, so an action present today may be gone tomorrow — **and
> that is not a fault**. **Each action on the far side is one tool entry in the action
> space** — not resident, found through the discovery entry; the action set is
> **recomputed before each run attempt together with availability and does not change within an attempt**.

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 23） · [PF-002 §4 MCP](../../product/PF-002-assets-settings-and-permissions/design.md#mcp)（rev 26） · [PF-006 §6.13](../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)（rev 20）
- **别混**：Tool 是**一个动作**，MCP 是**一批动作的来源**——**MCP 本身不可被调用**
- **注意**：它连对端用的是 [MCP 凭据](#ul-mcp-credential--mcp-凭据--mcp-credential)，挂在持有上，不是[模型凭据](#ul-model-credential--模型凭据--model-credential)
- **能组合**：**不组合任何资产**

### UL-connection-target · 连接目标 · Connection Target

> **中**：**[MCP](#ul-mcp--mcp--mcp) 接入点的一项[落点与身份类](#ul-setting-category--设置项类别--setting-category)设置：这个接入点连到对端的哪里。**
> 它与 [MCP 凭据](#ul-mcp-credential--mcp-凭据--mcp-credential)一起决定这个接入点接的是哪一处、以哪个账号进门；
> 各层按持有配值，**工作区那一级配不了它**。**它不是接入点的身份**——身份是接入点的 name。
>
> **EN**: **A placement-and-identity setting on an MCP access point: where on the far side the access
> point connects.** Together with the MCP credential it decides which endpoint the access point reaches
> and under which account it gets in; layers assign it through their holdings, and **the workspace level
> cannot set it**. **It is not the access point's identity** — that is the access point's name.

- **形态**：属性
- **出处**：[PF-002 §4 MCP](../../product/PF-002-assets-settings-and-permissions/design.md#mcp) ·
  [§5.2 设置项分四类](../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)（rev 26）
- **别混**：**不是[投递目标](interaction-and-dispatch.md#ul-inbound-target--投递目标--inbound-target)**——那是连接件把外面的消息送进哪个会话，方向相反
- **注意**：连不上（含凭据还没取或已失效），这个接入点带来的动作[一律不可用](../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)（PF-006 rev 20）

### UL-connector · 连接件 · Connector

> **中**：**一个外部消息来源的接入件**，把外部的消息送进来。
> **八类里只有它回答「agent 从哪里被触达」**——另外六类回答「agent 能做什么、怎么做」，
> [拓展件](#ul-loop-extension--拓展件--loop-extension)回答「推进的时候在哪些位置插手」。
> **只能送消息进来**——没有数据读取面，也没有管理面。
> **它带身份鉴权**：接对面服务的哪个账号（鉴权绑定），是持有上的一项[落点与身份类设置](#ul-setting-category--设置项类别--setting-category)，
> **只在租户那一层配**，随租户身份不同而不同。它的权限只有一项：**能不能安装**。
> **它声明一份事件目录**——它会送进来的每一种[连接件事件类型](#ul-connector-event-type--连接件事件类型--connector-event-type)；每条送进来的消息恰属其中一种，持有上以[事件订阅](#ul-event-subscription--事件订阅--event-subscription)选其中哪几种真的送进来，目录外与未订阅的受理时拒绝、看得见。
> **外部的事进到会话里有两种投递方式，动作主体不同**：① **已有的会话开口接收**——它这一侧的配置是[投递目标](interaction-and-dispatch.md#ul-inbound-target--投递目标--inbound-target)（送进哪一个已有的会话）；② **它送来的事件经受理开出一个新会话**——它这一侧的配置是**触发会话的默认运行模式**（持有上必配的一项[治理类设置](#ul-setting-category--设置项类别--setting-category)，哪一层都没给过的开不出新会话，作者默认不算），新会话怎么建归会话那一块。
> **送进来的消息以谁的身份处理，不是权限，是一条固定规则**：按它落进的那个会话创建那一刻捕获的租户身份，对面那个账号只作来源留在消息上；两种投递方式都照这一条。**外部内容只说得出自己是目录里的哪一种**，进哪个会话、开不开新会话、以谁的身份、按什么运行模式它一样都选不了。
>
> **EN**: **An inbound attachment for an external message source**, delivering outside
> messages into the system. **Of the eight, only this one answers how the agent can
> be reached**: six answer what an agent can do and how, and a loop extension answers
> where to intervene as the agent proceeds. It can **only deliver messages inward** — it
> exposes no data-read surface and no management surface. **It carries identity
> authentication**: which account on the far side it binds to (the authentication binding) is a
> placement-and-identity setting on the holding, **configured at the tenant layer only**, differing
> per tenant identity. Its one permission is **whether it may be installed**. **It declares an event
> catalog** — every connector event type it can deliver; each delivered message belongs to exactly one,
> the holding's event subscription picks which of them are actually delivered, and anything outside the
> catalog or unsubscribed is refused at intake, visibly. **There are two delivery modes, with different
> acting subjects**: ① **an existing session opens itself to receive** — the connector-side configuration
> is the inbound target (which existing session); ② **an event it delivers opens a new session through
> intake** — the connector-side configuration is the **default run mode for triggered sessions** (a
> governance setting the holding must supply; a connector no layer has ever given it to cannot open a
> session, and the author's default does not count), while how that session is created belongs to the
> session topic. **Whose identity an incoming message is handled under is not a permission but a fixed
> rule**: the tenant identity the receiving session captured at creation; the far-side account is kept on
> the message as its source only; both modes follow it. **External content can only say which catalog
> type it is** — never which session, whether to open one, under whose identity or in which run mode.

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 23） · [PF-002 §4 Connector](../../product/PF-002-assets-settings-and-permissions/design.md#connector) · [两种投递方式](../../product/PF-002-assets-settings-and-permissions/design.md#两种投递方式动作主体不同) · [触发会话的默认运行模式](../../product/PF-002-assets-settings-and-permissions/design.md#触发会话的默认运行模式)（rev 26）
- **注意 ①**：**一人多账户不立新对象**——同一租户身份要接同一服务的两个账号，就是两份 name 不同的连接件
- **注意 ②**：「能不能安装」的取值与其余「谁可以……」[同一种](circulation-and-entitlement.md#ul-usable-by--谁可以使用它--usable-by)：一组租户角色，外加一个「自己」
- **别混**：MCP 是**我出去调它**，Connector 是**它进来找我**
- **能组合**：**不组合任何资产**
- **注意 ③**：**事件目录不是它的身份**——身份仍是 name，换一份实现目录可以不同；消息包整份随信封进来（厚信封），只送一个标识回头去拉本版不支持
- **注意 ④**：**② 那一路本 topic 只定它存在与它这一侧的配置**——受理怎么开新会话、同一件事来两次怎么办归 [PF-014](../../product/PF-014-inbound-intake-and-queueing/design.md#57-穷举一什么会让队列从空变成非空)（rev 8）；新会话以哪个 agent definition、哪个租户身份建归 PF-015；同一份连接件的一条事件走哪一路由什么决定，PF-002 记为待裁（D-6）
- **注意 ⑤**：触发会话的默认运行模式**只管此后开出来的新会话**，与 ① 那一路无关；租户可调，组织的值与锁照默认与强制那一套管着；工作区配不了

### UL-connector-event-type · 连接件事件类型 · Connector Event Type

> **中**：**一份[连接件](#ul-connector--连接件--connector)在正文里声明的、它会送进来的一种外部事件：一个类型名、一段说明、一个消息包形状。**
> 目录由作者定、随正文走；**每条送进来的外部消息恰属于其中一种**，不在目录里的类型受理时拒绝。
> 说明是给模型读的：被订阅的那几种，说明进组合了这份连接件的 agent 的上下文。
>
> **EN**: **One kind of external event a connector declares in its body that it can deliver: a type name,
> a description and a payload shape.** The catalog is authored and travels with the body; **every
> delivered message belongs to exactly one declared type**, and an undeclared type is refused at intake.
> The description is for the model: for the subscribed types it enters the context of any agent that
> composes this connector.

- **形态**：属性（连接件正文的一项声明；与工具定义里的命令表同一种东西）
- **出处**：[PF-002 §4 事件目录与事件订阅](../../product/PF-002-assets-settings-and-permissions/design.md#事件目录与事件订阅)（rev 26）
- **别混**：不是[入站到达](interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival)——到达是一次事实，类型是它属于哪一类
- **注意 ①**：消息包**整份随信封进来**（厚信封）；连接件没有读取面，接收方无处回拉
- **注意 ②**：**目录不是连接件的身份**——换一份实现，目录可以不同；目录是结构化的，说明给模型读、形状给受理对

### UL-event-subscription · 事件订阅 · Event Subscription

> **中**：**一份连接件持有上的一项设置：目录里哪几种[连接件事件类型](#ul-connector-event-type--连接件事件类型--connector-event-type)真的送进来。**
> 取值是目录的子集；作者可给默认，组织层与租户层各配各的，**只在持有那一侧求值**——工作区与会话那两级没有它的值；**agent 不在运行时改它**——它是持有它的那几层配的值，不是 agent 的动作。
> 类别是**偏好**。
>
> **EN**: **A setting on a connector holding: which of the declared connector event types are actually
> delivered.** Its value is a subset of the catalog; the author may give a default, and the organization
> and tenant layers each configure their own, **evaluated on the holding side only** — the workspace and
> session levels carry no value for it. **An agent never changes it at run time** — it is a value assigned
> by the layers holding the connector, not an agent action. Its category is **preference**.

- **形态**：属性（一项[设置](#ul-setting--设置--setting)）
- **出处**：[PF-002 §4 事件目录与事件订阅](../../product/PF-002-assets-settings-and-permissions/design.md#事件目录与事件订阅) · [§5.2 设置项分四类](../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)（rev 26）
- **注意 ①**：未订阅的类型送来，受理拒绝，不是静默丢弃
- **注意 ②**：组合了这份连接件的 agent，上下文里**只带被订阅的那几种**的说明——怎么带归 PF-010

### UL-loop-extension · 拓展件 · Loop Extension

> **中**：挂在某个 [Loop 拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)上的**一段判断或动作**。
> 它声明自己**挂在哪个位置**、**管哪些情形**，以及自己的**[干预力](agent-runtime-loop.md#ul-intervention-power--干预力--intervention-power)**——
> 只观察 / 可改写 / 可否决——**没有「放宽」一档**，拓展件不能把「问一下」变成放行。
> **可否决那一档含「落一张[决策卡片](interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card)等人」**：拓展件用的是 loop 自己等外部应答的那个原语，与主流程共用。
> **它是 opt-in 的可插拔服务**：不可用（它依赖的服务用不了、它自己起不来）时，**按它的[拓展件不可用处置](agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy)办**——
> 租户挂上的默认跳过（视作已卸载，这一次这个位置没有它），注册时可声明为否决；系统自带的由预先声明的指定挂件顶上；哪一种都在日志里看得见。
> 可用却运行时报错，按它那一类的处置策略办，「可否决挂了当否决」是可否决一档的默认策略。
> **同一个位置可以挂多个拓展件，各干各的；先后就是它们在装配清单里的顺序。**
>
> **EN**: **A piece of judgement or action** attached to one loop extension point. It
> declares **which position it sits at**, **which cases it covers**, and its own
> **intervention power** — observe, rewrite, or veto; **there is no "relax" level**, an
> extension cannot turn "ask" into "allow". **Veto includes "drop a decision card and wait
> for a person"**: the extension uses the loop's own primitive for awaiting an external
> reply, shared with the main flow. **It is an opt-in pluggable service**: when unavailable
> (a service it depends on is down, or it fails to start) **its extension unavailability policy
> applies** — tenant-installed ones default to skip (treated as unloaded, absent from that position
> this time) and may declare veto at registration; system-provided ones are replaced by a
> pre-declared fallback extension; either way it is visible in the log. When available but failing
> at run time, it is handled by the policy for its kind, "a failed veto-capable extension counts as
> a veto" being that level's default. **Several extensions may sit at the same position, each doing
> its own thing; their order is their order in the assembly manifest.**

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-002 §4 Loop Extension](../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension) · [不可用处置是这一件自己的声明](../../product/PF-002-assets-settings-and-permissions/design.md#不可用处置是这一件自己的声明)（rev 26） ·
  [PF-012 §4 拓展件](../../product/PF-012-agent-loop-and-run/design.md#拓展件) · [§5.8](../../product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点)（rev 15）
- **注意 ④**：**不可用处置是这一件自己的一项声明，不是设置，也不是权限**——持有它的各层不给它配值、也收窄不了它；取值与谁能用哪一种归 PF-012。声明了否决，也要干预力求出来是可否决才算数
- **注意 ③**：**外来 hook**（Claude Code / Codex 格式）导入为拓展件时按其声明的输出能力定档；**工作区带来的一律只观察**
- **⚠️ 别混**：**它不是[拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)**——
  **拓展点是位置，拓展件是挂上去的东西**。位置由[状态点](../../product/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作)推出、数目有限；**挂什么没有上限**
- **注意 ①**：**干预力是它的[权限](#ul-permission--权限--permission)，不是[设置](#ul-setting--设置--setting)**——
  **装一个拓展件、却只给它「只观察」，是成立的配法**
- **注意 ②**：**它只能靠改[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)起作用**，不能不留痕地改变下一步
- **能组合**：**不组合任何资产**（同 [MCP](#ul-mcp--mcp--mcp) 与[连接件](#ul-connector--连接件--connector)）

### UL-modality-converter · 模态转换件 · Modality Converter

> **中**：挂在 [PF-012「消息落盘之前」](../../product/PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里)那个位置上的一件[拓展件](#ul-loop-extension--拓展件--loop-extension)。
> **输入一个非文本[模态](record-and-context.md#ul-modality--模态--modality)的[内容块](record-and-context.md#ul-content-block--内容块--content-block)或一个文件块；
> 输出一个或多个别的模态的内容块（不能是文件块），外加一段纯文本 [transcript](record-and-context.md#ul-transcript--transcript--transcript) 作最后兜底。**
> 产出挂在原块上作[派生表示](record-and-context.md#ul-derived-rendering--派生表示--derived-rendering)，**原块不动，不新增块、不另立对象**。
> 它按**一种模态或一种文件媒体类型**登记，同键只有一件生效、**可替换**（替换只在系统装配层，**本版不是资产**）；
> 一个文件块两种键都命中时，**媒体类型那一件来转**。**本版它不调模型**，transcript 只来自本地识别。
> 产出**在落盘之前写好，之后不变**。**转换失败（它挂了、交不出 transcript、交出了文件块，或只交 transcript 不交派生块）时，那条消息不落盘、也不补偿**：
> 输入消息拒绝请求并告知发送方；模型回复那次调用照常结束、记下被否决，loop 退避之后另起新调用，同一步连续被否决到上限 Run 失败；工具结果直接让 Run 失败。
> 没登记转换件的键不算失败；**登记了却不可用，当转换失败**。
> 它**不判断这次要不要转**、**不承诺无损**。正文在没有歧义处简称**转换件**。
>
> **EN**: A loop extension at the "before a message is persisted" position. **It takes one
> content block of a non-text modality, or one file block, and yields one or more content
> blocks in other modalities (never a file block), plus a plain-text transcript as the
> last-resort fallback.** The outputs hang on the original block as its derived renderings;
> **the original is untouched, no block is added and no separate object is created.** Converters
> are registered **per modality or per file media type**; one is in effect per key and it is
> **replaceable** — at system assembly only, **not an asset in this version**; when a file block
> matches both kinds of key, **the media-type converter converts it**. **In this version it makes
> no model call**: the transcript comes from local recognition only. Outputs are
> **written before persistence and never change**. **If conversion fails (the converter is down,
> yields no transcript, yields a file block, or yields only a transcript with no derived block),
> the message is not persisted and nothing is compensated**: an incoming message is rejected and
> the sender told; for a model reply the call ends as usual with the reply recorded as vetoed, and
> the loop starts a new call after a backoff, the Run failing once the same step has been vetoed
> up to its limit; a tool result fails the Run outright. A key with no registered converter is not
> a failure; **a registered converter that is unavailable counts as a failed conversion**. It does
> **not** decide whether to convert this time and does **not** promise losslessness. Short form in
> running text: *converter*.

- **形态**：变体（父：[拓展件](#ul-loop-extension--拓展件--loop-extension)）
- **出处**：[PF-013 §4 转换件](../../product/PF-013-model-profiles-and-invocation/design.md#转换件)（rev 15） ·
  [PF-012 §5.8 模态转换为什么必须落在这里](../../product/PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里)（rev 15）
- **⚠️ 别混 ①**：**不是[结果卸载](execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading)**——
  那是把**太大**的工具结果换成占位、原件离开消息；转换件处理的是**读不懂**，**原件一步没动**
- **⚠️ 别混 ②**：**父词条是资产的一类，它本版却不是资产**——它走拓展件的位置与干预力，
  但不被持有、不按层配值；「未来是否升为资产」是 PF-013 记下的显式缺口
- **注意 ①**：**位置归 PF-012，契约归 PF-013**——有哪些模态、哪个模型收得下哪些，是大语言模型域定的
- **注意 ②**：**转换失败就是「消息落盘之前」那个位置的否决**（[PF-012 §5.8 否决按消息是谁产生的分三路](../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)）——失败语义与业务流程拓展点同性质：拒绝或失败，不补偿；**被否决的模型回复不是一次调模型失败**
- **注意 ③**：**没登记转换件、因而没有 transcript 的块进[模态投影](record-and-context.md#ul-modality-projection--模态投影--modality-projection)**，把收不下它的模型挡在合法目标之外——这是有意的兜底方向

### UL-slash-command · 斜杠命令 · Slash Command

> **中**：**人主动发起某件事的入口**，人在交付面敲 `/什么` 触发；**只由交付面识别、只对人**，模型不调用它。
> 它**绑定**要做的事，**绑定目标恰有三种**：**一段自定义提示词**；**装配的一个 skill**（其正文直接成为消息里的一个内容块）；
> **一条系统业务流程**（命令服务或查询服务的某一个动作，不进队列、不成为消息）。
> **命令本身不是做事的东西，它是指路牌**。**不含键盘控制或 shell 命令。**
>
> **EN**: **An entry point through which a person initiates something**, triggered by
> typing `/something` on a delivery surface; **recognized only by the delivery surface and
> only for people** — the model never invokes it. It **binds** to the thing to be done, and
> **the binding target is exactly one of three**: **a custom prompt**; **an assembled skill**
> (whose text becomes one content block of the message); or **a system business flow** (one
> action of a command or query service, which enters no queue and becomes no message).
> **The command is not the doing; it is a signpost.** It covers **no keyboard control and no
> shell commands.**

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-002 §4 Slash Command](../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)（rev 26）
- **别混**：Skill 是方法本身，Slash Command 是**发起它的入口**。绑定是**多对多**——一个 skill 可以有多个入口，也可以完全没有
- **注意 ①**：**名字**——交付面自己的动作名与系统业务流程型命令名是**系统保留名**，**一律在 `omne-official` 前缀下**；前两种绑定的命令**不得使用这个前缀**；同能力标识按资产替换规则
- **注意 ②**：**为什么单独是一类资产**：为将来的可编程性留口子——出处同上
- **注意 ③**：一个会话认得哪些，是它的[会话斜杠命令集](#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set)——**没有权限用的，对这个会话就不存在**
- **注意 ④**：**绑定目标与[参数声明](#ul-command-parameter-declaration--命令参数声明--command-parameter-declaration)是这条命令本身，不是设置**——各层配不出不同的值；想改一条命令展开什么，换一份同名的
- **能组合**：Skill（绑定）

### UL-command-parameter-declaration · 命令参数声明 · Command Parameter Declaration

> **中**：**一条[斜杠命令](#ul-slash-command--斜杠命令--slash-command)可选带的那份参数说明，每个参数配一句给人看的提示。**
> 它是这条命令本身的一部分，**不是设置**——不随持有它的那一层配出不同的值。
> **声明了的，按声明解析**，解析不通过就当场明说哪里不对、不发送；**没声明的，命令名之后的整段文本作一个自由参数**。三种绑定目标一条规则。
>
> **EN**: **The optional description of a slash command's parameters, each carrying a short hint for
> the person typing it.** It is part of the command itself, **not a setting** — no holding layer can give
> it a different value. **Where declared, input is parsed against it**, and a failed parse is reported on
> the spot, saying what is wrong, and nothing is sent; **where not, everything after the command name is
> one free-form argument**. The same rule holds for all three binding targets.

- **形态**：属性
- **出处**：[PF-002 §4 Slash Command](../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)（rev 26） ·
  [PF-016 §5.7 人要做的事分三族](../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)（rev 10）
- **别混**：**不是工具调用的参数**——那是模型给出、按工具定义收齐之后才解析的；这里解析的是人敲进交付面的那一行
- **注意**：② 型命令里，人附带的参数**另成一个内容块**，不拼进 skill 的正文

### UL-plugin · 插件 · Plugin

> **中**：**把若干资产打包在一起分发与启用的单元。**装一个 plugin，等于一次性获得
> 它里面的全部东西；停用它，那些东西一起退场。
> **内含成员不取得独立的顶层生命周期**——不能单独卸载 plugin 里的某一个 skill。
>
> **EN**: **A unit for distributing and enabling a bundle of assets together.**
> Installing one grants everything inside at once; disabling it withdraws them all.
> **Its members have no independent top-level lifecycle** — one cannot uninstall a
> single skill out of a plugin.

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 23） · [PF-002 §4 Plugin](../../product/PF-002-assets-settings-and-permissions/design.md#plugin)（rev 26）
- **别混 ①**：**不是 Cordis plugin**——那是运行时的代码装载单元，属技术设计。指它时**必须写全 `Cordis plugin`**
- **别混 ②**：Plugin 组合出来的**还是资产**，可以继续被组合；[Agent Definition](#ul-agent-definition--agent-定义--agent-definition) 组合出来的是**一个能跑的 agent**
- **能组合**：Skill、Tool、Slash Command、MCP、Connector、[拓展件](#ul-loop-extension--拓展件--loop-extension)，以及 Rules 这类声明性成员

### UL-agent-definition · Agent 定义 · Agent Definition

> **中**：**一个 agent 的静态定义**——它由什么组装而成、以什么面貌工作。
> **它不是会话，也不是[agent runtime](agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)**：
> 改定义**不会**改变已经在跑的那个 agent，一个定义可以同时有很多个 agent runtime，
> **定义与实例分别演进**。sub-agent 的定义**也属于这一类**。
>
> **EN**: **The static definition of an agent** — what it is assembled from and how it
> presents itself at work. **It is neither a session nor an agent runtime**:
> editing a definition **does not** change an agent already running, one definition
> may have many agent runtimes going at once, and **the definition and the running
> thing evolve separately**. A sub-agent's definition **is one of these too**.

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 23） · [PF-002 §4 Agent Definition](../../product/PF-002-assets-settings-and-permissions/design.md#agent-definition)（rev 26）
- **注意**：混为一谈会出现「**我改了配置，正在跑的任务突然换了行为**」这种事故
- **能组合**：**全部八类**（含其他 Agent Definition 作为 sub-agent）——**它是唯一能组合全部八类的**

### UL-agent-type · agent 类型 · Agent Type

> **中**：**一份 [Agent 定义](#ul-agent-definition--agent-定义--agent-definition)具不具备
> master agent 的那一整套机制。****只有两个取值**：
> **`master`**——具备全套机制，[开一段会话](agent-runtime-loop.md#ul-session--会话--session)，用户挑的就是它；
> **`non-master`**——**不具备那套机制**的 agent。
> **后者由前者反过来定义**：这条线划的是**有没有那套机制**，
> **不是它在某次派发里扮演什么角色**。
> **它是定义自身的属性**，与那份定义某一次装配的结果无关。
>
> **EN**: **Whether an agent definition carries the full set of mechanisms a master agent
> has.** There are **exactly two values**: **`master`**, which has them and opens a session,
> and **`non-master`**, defined by **not** having them. The second is defined **in terms of
> the first on purpose**: the line is about **which mechanisms a definition carries**, not
> about **the role it plays in any one dispatch**. **It is a property of the definition
> itself**, independent of what any one assembly of it produces.

- **形态**：属性
- **出处**：[PF-004 §4 agent 类型](../../product/PF-004-agent-definition-and-assembly/design.md#agent-类型)（rev 13） · [§6.8](../../product/PF-004-agent-definition-and-assembly/design.md#68-两类-agent谁能被谁自定义)（rev 13）
- **⚠️ 别混**：**`non-master` 不是[子 agent](interaction-and-dispatch.md#ul-subagent--子-agent--subagent)。**
  后者说的是**它在派发关系里的角色**（被 `spawn`/`delegate` 派出去的那个）。
  **一个是这份定义带着哪套机制，一个是此刻在扮演什么。**
  **取这个名正是为了让两者不撞**（[C-14](../conflicts.md)）
- **注意 ①**：**[master 必定是 official](../../product/PF-004-agent-definition-and-assembly/design.md#68-两类-agent谁能被谁自定义)**；
  **租户能自定义的只有 `non-master`**
- **注意 ②**：**它不决定这个 agent 能做什么**——[动作空间只由构成决定](#ul-action-space--动作空间--action-space)。
  **一个 `non-master` 照样可以装得很强**
- **⚠️ 注意 ③**：**「master 的那一整套机制」包含哪些，尚未定全**——
  目前只列得出开会话、带类目、只能官方提供三条
  （[PF-004 D-1](../../product/PF-004-agent-definition-and-assembly/decisions.md#三待裁决)）。
  **不要按「凡是 master 有的 `non-master` 都没有」去实现**

### UL-master-category · master 类目 · Master Category

> **中**：**一份 [master](#ul-agent-type--agent-类型--agent-type) 的定义，主要是用来干什么的。**
> 当前五类：`general-purpose` · `coding` · `office` · `research` · `personal-life`。
> **它只挂在 master 上**——`non-master` 不开协作，这项属性对它没有意义。
>
> **EN**: **What a master agent's definition is mainly for.** Currently five:
> `general-purpose`, `coding`, `office`, `research`, `personal-life`. **It hangs on masters
> only** — a non-master opens no collaboration, so the property means nothing for it.

- **形态**：属性
- **出处**：[PF-004 §4 master 类目](../../product/PF-004-agent-definition-and-assembly/design.md#master-类目)（rev 13）
- **⚠️ 别混**：**它不是[会话类型](agent-runtime-loop.md#ul-session-type--会话类型--session-type)。**
  会话类型是**会话**的属性，**由它算出来**——
  [算，不是拷贝](../../product/PF-015-session-lifecycle-and-ownership/design.md#53-会话类型怎么算出来)。
  **映射改了，已存在的会话一个都不跟着变**
- **注意 ①**：**只能由产品出厂增补，租户加不了新的一类**——
  这是「[master 只能官方提供](#ul-agent-type--agent-类型--agent-type)」的推论，不是一条独立限制
- **注意 ②**：**五类不是封死的**，产品负责人明说「不限定死，未来可拓展」；
  **能拓展的是产品，不是租户**

## 一份资产的版本

### UL-asset-version · 资产版本 · Asset Version

> **中**：**一个[资产](#ul-asset--资产--asset)在某一次发布时定下的那一份内容。**
> **已发布的版本不可变**——要改，只能在它之上再发一个新的。
> 每一份资产有**自己独立的一条版本线**，从 v1 起各数各的：
> 一份[复制](circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)过去的资产
> **落在目标侧自己的线上**，源侧的 v7 在那边可能是 v2。
>
> **EN**: **The content of an asset as fixed by one release of it.** **A published
> version is immutable**: changing anything means publishing a new one on top of it.
> Every asset has **a version line of its own**, counted from v1 independently of
> everyone else's — an asset copied elsewhere **lands on the receiving side's own
> line**, so the source's v7 may be v2 over there.

- **形态**：对象
- **出处**：[PF-002 flows §3.3 一个资产定义的版本](../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)（rev 26） ·
  [PF-003 §6.4 可复制的对象](../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)（rev 6）
- **别混 ①**：**不是[版本选用](circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection)**——
  那说的是**某个范围当前选了哪一个**，是一条关系；这一条说的是**被选的那个东西**
- **别混 ②**：**草稿不是版本**——它还在变，**复制与分享都只认已发布的**
- **注意**：**发现有新版本不静默替换已选用的那个**——选哪一版是消费方的决定；持有选了「追随当前版」的，新版一发布就用上，那是持有上写明的选择，不算静默替换

## 构成关系

### UL-asset-composition · 资产组合 · Asset Composition

> **中**：资产之间、资产与 agent 之间、属性与资产之间的**同一种关系**，不是几种。
> 三条规则：**引用指向[能力标识](scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)**、
> **组合图不得成环**、**组合不转移[定义所有权](circulation-and-entitlement.md#ul-definition-ownership--定义所有权--definition-ownership)**。
>
> **EN**: **One and the same relation** holding between assets, between assets and an
> agent, and between attributes and assets — not several mechanisms. Three rules:
> **references point at capability identifiers**, **the composition graph must be
> acyclic**, and **composition transfers no definition ownership**.

- **形态**：属性
- **出处**：[PF-002 §5.1](../../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种)（rev 26）
- **别混**：与[作用域合成语义](scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)不是一回事——**裸写「组合」不作数**
- **注意 ①**：这一节在 PF-002 里标着「**PM 推导，待产品负责人确认**」
- **注意 ②**：**「环」指沿引用展开会回到自己、展开不完的那一种**；[Skill 与 Tool 互相引用不算](../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)——两边各装一份就完

### UL-agent-constitution · agent 构成 · Agent Constitution

> **中**：**一份[装配清单](agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)里「它是什么」的那部分**——
> 动作空间、技能、需要哪几类执行环境、装进来哪些[沙箱实现](grounding-and-isolation.md#ul-sandbox-implementation--沙箱实现--sandbox-implementation)、
> 系统提示词的全部成分。**在装配时确定。**
> **构成变了就是另一个 agent**；与[运行时注入](agent-runtime-loop.md#ul-runtime-injection--运行时注入--runtime-injection)的分界是一句话：
> **这个变化改变的是「它是什么」，还是「它处在什么情况下」？**
>
> **EN**: **The part of an assembly manifest that says *what it is*** — its action
> space, its skills, which kinds of execution environment it needs, which sandbox
> implementations are assembled in, and every ingredient of its system prompt.
> **Fixed at assembly time.** **A change of
> constitution makes it a different agent.** The line against runtime injection is
> one question: **does this change alter *what it is*, or *what circumstances it is
> in*?**

- **形态**：属性
- **出处**：[PF-004 §4 注入](../../product/PF-004-agent-definition-and-assembly/design.md#注入)（rev 13） · [§5.3](../../product/PF-004-agent-definition-and-assembly/design.md#53-三个时刻)（rev 13）
- **弃用的说法**：**「agent 构成 / Instance Constitution」**——
  2026-09-20 之前的名字，主语是已退役的「运行实例」，见 [UL-D-3](../decisions.md#ul-d-3--runtime-与活体--2026-09-20)
- **别混**：**它不是整份清单**——清单还记着为哪个会话求的、依据哪个定义版本、成本算谁的。
  **这一条只说其中「是什么」那一部分**，因为**那一部分才与注入对立**
- **注意**：构成变了**未必要重新装配**——系统已受理的 Agent Definition 变更是**下一次 run 重新装配**，
  运行中[增量装载](agent-runtime-loop.md#ul-incremental-loading--增量装载--incremental-loading)则**只在清单上追加一条**；
  **构成变小**（移除、禁用、「谁可以使用它」被收回，落在非常驻条目上也算）**下一次运行起重新装配**——[PF-004 §6.3](../../product/PF-004-agent-definition-and-assembly/design.md#三类变化背后只有一条判据系统提示词的成分会不会变)（rev 13）
- **工作区来源边界**：只改文件不等于系统已受理装载变更；等待实际装配或显式资产 reload，校验失败时原内存数据不变。

### UL-action-space · 动作空间 · Action Space

> **中**：**这个[agent runtime](agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)能发起哪些动作的集合。**
> 它**只由[agent 构成](#ul-agent-constitution--agent-构成--agent-constitution)决定**——
> 装上新工具就变大，移除工具就变小，而**一次运行之内，权限怎么变它都不变**。
> agent 照样能发起那个调用，只是这次被拒绝：它因此知道
> **「这件事存在，只是我现在不被允许」，而不是「这件事不存在」**。
> 运行之间，下一次装配按当时的权限求值：执行权限这一类不进构成，动作空间照样不变；
> **只有[「谁可以使用它」](circulation-and-entitlement.md#ul-usable-by--谁可以使用它--usable-by)改的是装不装进来**——判下来这个人不能用的，自下一次运行起不再装入，那是构成变了。
> **构成变小（移除、禁用、「谁可以使用它」被收回）时，下一次运行起重新装配**——落在非常驻条目上也一样，agent 从那时起搜不到、调不到它。
>
> **EN**: **The set of actions this agent runtime can initiate.** Determined **by the
> agent's constitution alone** — it grows when a tool is loaded, shrinks when one is
> removed, and **within one run it does not change however permissions change**. The agent
> can still issue the call and simply be refused, so it knows **"this exists, I am merely
> not allowed right now"** rather than **"this does not exist"**. Between runs the next
> assembly evaluates with the permissions of that moment: execution permissions never enter
> the constitution, so the action space still does not change; **only "usable by" decides
> whether something is loaded at all** — what that person may not use is no longer loaded from
> the next run on, which is a change of constitution. **When the constitution shrinks (removal,
> disable, "usable by" withdrawn), the agent is reassembled from the next run on** — for
> non-resident entries too; from then on the agent can neither find nor call it.

- **形态**：视图
- **出处**：[PF-004 §4 动作空间](../../product/PF-004-agent-definition-and-assembly/design.md#动作空间) · [§6.3 三类变化背后只有一条判据](../../product/PF-004-agent-definition-and-assembly/design.md#三类变化背后只有一条判据系统提示词的成分会不会变) · [§6.5](../../product/PF-004-agent-definition-and-assembly/design.md#65-权限变化动作空间不变)（rev 13）
- **注意 ①**：这条锁定的是**变化的唯一原因**，不是「永不改变」。它真正排除的只有一件事：**拿构成之外的东西去改动作空间**
- **注意 ②**：**「谁可以使用它」被收回不是这条的反例**——它落在组装之前、与禁用同一段，agent 一样不知道有这回事；已经开始的那次运行照它捕获的构成跑完
- **注意 ③**：**[PF-012 §5.7](../../product/PF-012-agent-loop-and-run/design.md#57-一次尝试三条路通向重新算一遍)（rev 14）写「重算之后动作空间可能与上一次尝试不同」，与本条（PF-004 I-4）对不上**——两处说法照实记在 [C-33](../conflicts.md)，本条不选边；PF-012 已登记为来源问题，PM 的读法是那两处的「动作空间」该读作「调得通的范围」

### UL-session-slash-command-set · 会话斜杠命令集 · Session Slash-Command Set

> **中**：**一个会话此刻认得的那批[斜杠命令](#ul-slash-command--斜杠命令--slash-command)**：
> 这个会话[装配](agent-runtime-loop.md#ul-agent-assembly--agent-装配--agent-assembly)时从求值结果里取出、
> 会话所属的那个人有权使用的那些，再去掉此后被收回了权限的。
> 交付面只按它识别命令——**不在里面的名字，对这个会话就是不存在**，
> 不论那条命令在别处有没有、这个人为什么用不了。
> 它住在会话的一张注册表里；资产的增删与禁用不会让它自己变，**要等人发对应的 reload 热更新那张注册表**（③ 型失败后系统自动刷新；一次完整的重新装配也会重填它）。
>
> **EN**: **The slash commands a session recognizes right now**: those taken from the
> evaluation result when the session is assembled and that the person the session belongs
> to is permitted to use, less any whose permission has been withdrawn since. The delivery
> surface recognizes commands against this set alone — **a name outside it does not exist
> for this session**, whether or not such a command exists elsewhere and whatever the
> reason the person cannot use it. Adding, removing or disabling assets does not change it
> by itself; it lives in a session registry and **changes only when the matching reload hot-updates that registry** (refreshed automatically after a type-③ failure; a full re-assembly refills it too).

- **形态**：视图
- **出处**：[PF-002 §4 会话认得哪些命令，什么时候变](../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)（rev 26）
- **别混**：[动作空间](#ul-action-space--动作空间--action-space)在权限变了时**不变**，agent 因此知道「存在，只是不许」；
  会话斜杠命令集**恰好相反**——无权使用的**就不在里面**，人得到的回答是「没有这个命令」
- **注意**：**收窄即时，放宽要等 reload**——权限一收回，那条命令此刻起就不在；
  会话进行中新得到权限的，要等下一次 reload 或重新装配才进来

### UL-meta-capability · meta 能力 · Meta Capability

> **中**：**一整类能力的统一入口。**它自己不是某一个动作，而是**通向一族动作的那扇门**——
> 「工具的工具、技能的技能」是最纯的两个例子。
> 全部 meta 能力合起来就是**一个 agent 的基本盘**：什么都不配的 agent 天生就有它们。
> **它必定[常驻](reach-and-availability.md#ul-residency--常驻--residency)，而且不可禁用、不可替换。**
>
> **EN**: **A single entry point to a whole class of capabilities.** It is not one
> action but **the door onto a family of them** — "the tool for tools, the skill for
> skills" being the purest two examples. Together they constitute **an agent's
> baseline**: an agent configured with nothing at all still has them. **They are
> necessarily resident, and can be neither disabled nor replaced.**

- **形态**：对象
- **出处**：[PF-007 §4 meta](../../product/PF-007-meta-capabilities/design.md#meta)（rev 19） · [meta 与常驻的关系](../../product/PF-007-meta-capabilities/design.md#meta-与常驻的关系)（rev 19）
- **⚠️ 注意 ①**：**「不可禁用」说的是那扇门，不是门后的每一条命令。**
  [权限照常作用在命令这一级](../../product/PF-007-meta-capabilities/design.md#57-权限能关掉一条命令关不掉一扇门)——
  **一条命令可以被关掉，而那扇门关不掉**。
  典型：会话运行模式是 [`never`](agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode) 时，
  `Ask().request_approval` 不可用，**而 `Ask()` 还在**
- **注意 ②**：**「必定常驻」不是产品选择，是结构逼出来的**——
  **够到非常驻能力的唯一途径就是 meta**，若它自己也不常驻，就永远够不着它。
  **自指的闭环必须有一个不动点**
- **注意 ③**：**常驻不一定是 meta**——一个普通工具标了常驻，它只是占了个位置
- **注意 ④**：**关掉一扇门等于门后一整类能力凭空消失**，而 agent 会「不知道某件事存在」——
  那种失明无法解释也无法申诉。**收紧安全只能靠执行环境、权限与装配清单**
- **注意 ⑤**：**全部采用多命令范式**，因此[整套只占一个槽位](#ul-prompt-slot--提示词槽位--prompt-slot)；
  **没有这一条，meta 这件事在预算上就不成立**
- **别混**：**具体是哪几扇门（`Tools()` `Shell()` …）是它的实例，不是概念**——
  词表定义 meta 能力，**不为每一扇门各立一条**

### UL-prompt-slot · 提示词槽位 · Prompt Slot

> **中**：**agent 始终直接看见的一个条目**——正文说「在系统提示词里」指的就是这种始终可见的呈现，不限定它落在一次模型请求的哪个位置。
> 标了[常驻](reach-and-availability.md#ul-residency--常驻--residency)的占一个，没标的不占；
> 此外有**一批恒定占槽位、且关不掉**的条目（PF-007 定义的 meta）。
> **多命令工具整套只占一个**，因此常驻预算的正确用法是
> **把钱花在入口上，不是花在具体动作上**。
>
> **EN**: **One entry the agent always sees directly** — "in the system prompt" in the product text means this always-visible rendering, wherever it lands in a request. Whatever is
> marked resident takes one; whatever is not takes none. On top of these sit **a set
> that permanently occupy slots and cannot be switched off**. **A multi-command tool
> takes a single slot for its whole command set**, so the right way to spend a
> resident budget is **on entry points, not on individual actions**.

- **形态**：视图
- **出处**：[PF-006 §4 槽位](../../product/PF-006-tools-and-skills/design.md#槽位)（rev 20） · [PF-007 §5.4](../../product/PF-007-meta-capabilities/design.md#54-十三个槽位是预算的地板也是它的天花板意义)（rev 19）
- **别混**：**裸写「槽位」不作数**——它专指系统提示词里的那种占位
- **注意**：**不占槽位不等于不在[动作空间](#ul-action-space--动作空间--action-space)里**——见[三层正交](reach-and-availability.md#三层正交这是本卷的地基)

## 拿哪个模型去做

### UL-model-profile · 模型档案 · Model Profile

> **中**：**关于一个可被调用的模型的全部事实**——上游认哪个名字、能走哪几家供应商、
> 收得下和给得出哪几种模态、一次能吃多少吐多少、送进去之前还有什么限制、随它带上哪些[请求参数](#ul-model-request-parameters--模型请求参数--model-request-parameters)。
> **上游输入限制的事实与本档案实际提供的有限输入范围分别声明；上游限制可明确未知，未知不等于无限制。**
> 输入 token 的发前限额检查可以采用有依据的估算与明确配置的余量；**通过检查不保证上游实际 token 必然不超限**。
> 字节与图片数量仍按实际值精确检查；上游实际用量与费用独立记录，不用估算替代。
> **它是数据，不是[资产](#ul-asset--资产--asset)**：「用哪个模型」是某份
> [Agent 定义](#ul-agent-definition--agent-定义--agent-definition)的一项[设置](#ul-setting--设置--setting)，
> **那项设置记的是一个路由名，名字背后必须是一条档案**——档案自己独立存在、读得出来。
> **一条档案是哪一条，看它所在的范围（出厂默认、某个组织或某个租户）加它的路由名**：
> 同一个范围里一个路由名只对应一条（在册的、已撤回的都算），不同范围里可以各有一条同名的；
> **路由名一旦定下不可改**，改了就是另一条档案。
> **同名的几条按层覆盖**：一个会话用到这个名字时，在它所在的范围链上取最具体一格的那一条（租户 > 组织 > 官方），
> 先滤掉已撤回的与这个范围不允许的，模态对不上的与缺凭据的不滤；**用哪一条由层序定，不由引用它的人挑**。
>
> **EN**: **Everything the system holds about one callable model** — the name upstream
> answers to, which providers it may go through and in what order, which modalities it
> takes in and gives out, how much it reads and writes in one go, what else must
> hold before a request goes out, and which **request parameters** travel with it. **Upstream input-limit facts
> and this profile’s finite supplied input range are declared separately; an upstream limit may be explicitly
> unknown, which does not mean unlimited.** Pre-send input-token limit checks may use a supported
> estimate with an explicitly configured margin; **passing does not guarantee that the upstream's
> actual token count stays within the limit**. Bytes and image counts are still checked exactly;
> actual upstream usage and cost are recorded separately, never replaced by estimates.
> **It is data, not an asset**: "which model" is a
> setting on an agent definition, and **that setting records a routing name behind which
> there must be one profile**, which exists in its own right and can be read back. **Which profile it is
> follows from its scope (factory default, one organization or one tenant) plus its
> routing name**: within one scope a routing name maps to exactly one profile (listed or
> withdrawn), while different scopes may each hold one under the same name; **the routing
> name never changes** — change it and it is a different profile. **Same-named profiles override
> by layer**: when a session uses the name, the most specific slot on its scope chain wins
> (tenant > organization > official), after withdrawn profiles and those this scope does not allow
> are filtered out — modality mismatch and a missing credential do not filter; **which one is used is
> decided by the layer order, never picked by whoever references it**.

- **形态**：对象
- **出处**：[PF-013 §4 模型档案](../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) ·
  [上游限制与档案提供的上限](../../product/PF-013-model-profiles-and-invocation/design.md#上游限制与档案提供的上限) ·
  [档案的身份：所在范围加路由名](../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名) ·
  [PF-013 flows §3.1 一条模型档案](../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)（rev 15）
- **⚠️ 别混 ①**：**官方档案 / 自建档案**（谁建的、落在哪一层）**不是
  [官方件](circulation-and-entitlement.md#ul-official-asset--官方件--official-asset) /
  [自定义件](circulation-and-entitlement.md#ul-customized-asset--自定义件--customized-asset)**——
  后一对说的是**资产**的来源，而档案不是资产。**两套词各有各的对象，不能互相套用**
- **别混 ②**：**不是[一次模型调用](execution-and-outcome.md#ul-model-call--一次模型调用--model-call)**——
  那是有头有尾的计算资源，档案是长期的数据；**也不是上游那个模型本身**——
  **档案是我们对它的记载**，记载会过期，而模型不因为我们改了档案就变
- **注意 ①**：**建档 → 在册 ⇄ 已撤回**，**没有终态，而那一行永远保留**——
  已撤回的能[恢复在册](#ul-profile-listing-status--档案在册状态--profile-listing-status)，恢复的还是原来那一条；
  删了行，还指着它的会话就只说得出「未知模型」，而不是「已下架」，也再恢复不了它
- **注意 ②**：**「已撤回」与「这个范围不允许它」是两件事**——
  后者那条档案照样在册，只是在这个范围[求值](scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)算不出来
- **注意 ③**：**同一个路由名在[展示列表](scope-and-resolution.md#ul-model-display-list--模型展示列表--model-display-list)里能选的只有一行**——胜出的那一条；被盖住的同名条目照列、带来源、标「被某层同名档案覆盖」，选不了。
  「用哪个模型」那项设置记的是路由名，不是某一层的某一行；它落到哪一行每次用到时按层序现算——同一个名字在两个成员的会话里可以落到不同层的两行
- **注意 ④**：**「已下架」说的是一个名字**——链上同名的每一条都撤回了才说；最具体那一条撤回而链上另有同名在册的，调用照发、用那一条，不是替用户改选
- **注意 ⑤**：**组织的锁锁的是名字**——锁得住名字锁不住实现：成员在自己那层建一条同名的，供应商与参数就是他的了；组织建了与官方同名的自建档案，没配自己凭据的成员这个名字就用不了

### UL-official-model-profile · 官方档案 · Official Model Profile

> **中**：**随系统发布、位于出厂默认层的那种[模型档案](#ul-model-profile--模型档案--model-profile)。**
> 它自己**不含凭据**——出厂默认那一格可以有一把，由部署装配时配好，产品里没有任何操作能配、换或解绑它；
> 它与自建档案**在同一份列表里**展示；**自建档案与它同路由名时，自建的按层覆盖它**。
>
> **EN**: **A model profile that ships with the system and sits at the factory-default layer.** It
> **carries no credential** of its own — the factory-default slot may have one, set up at deployment
> assembly and beyond the reach of any operation in the product; it is shown **in the same single list**
> as custom profiles, and **a custom profile under the same routing name overrides it by layer**.

- **形态**：变体（父：[模型档案](#ul-model-profile--模型档案--model-profile)）
- **出处**：[PF-013 §4 官方档案 / 自建档案](../../product/PF-013-model-profiles-and-invocation/design.md#官方档案--自建档案) ·
  [§5.6](../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) ·
  [§6.3](../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)（rev 15）
- **⚠️ 别混**：**不是[官方件](circulation-and-entitlement.md#ul-official-asset--官方件--official-asset)**——官方件说的是资产的来源，而档案不是资产；**所以这里叫「档案」不叫「件」**

### UL-custom-model-profile · 自建档案 · Custom Model Profile

> **中**：**组织的超级管理员或租户在自己那一层建的[模型档案](#ul-model-profile--模型档案--model-profile)。**
> 它自己**不存凭据**，调用时取**发起调用的那个租户自己的那一把**[模型凭据](#ul-model-credential--模型凭据--model-credential)——
> 建在组织层的也一样，成员调它用的是成员自己那一把；
> 在册期间可以修订，**路由名与来源除外**——换路由名就是另建一条。它的身份含所在范围：
> 组织层与租户层各建一条同名的、或与官方档案同名，都成立；**同名时按层覆盖**——租户层的盖组织层的，自建的盖官方的。
>
> **EN**: **A model profile that an organization's super administrator, or a tenant, creates at their
> own layer.** It **stores no credential** and at call time uses **the calling tenant's own model
> credential** — one created at the organization layer included: a member calling it uses that
> member's own; while listed it may be revised, **except for its routing name and origin** — a new
> routing name means a new profile. Its identity includes its scope: one at the organization layer
> and one at the tenant layer under the same name, or one sharing a name with an official profile,
> are all valid; **same-named profiles override by layer** — tenant over organization, custom over official.

- **形态**：变体（父：[模型档案](#ul-model-profile--模型档案--model-profile)）
- **出处**：[PF-013 §4 官方档案 / 自建档案](../../product/PF-013-model-profiles-and-invocation/design.md#官方档案--自建档案) ·
  [§5.6](../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)（rev 15） ·
  [flows §四 角色与操作](../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)（rev 15）
- **⚠️ 别混**：**不是[自定义件](circulation-and-entitlement.md#ul-customized-asset--自定义件--customized-asset)**——理由同上
- **注意**：**组织层建的档案，成员配上自己那一把凭据之前用不上**——列表上标明缺的是什么；组织那一层给不了他一把兜底的

### UL-profile-listing-status · 档案在册状态 · Profile Listing Status

> **中**：**一条[模型档案](#ul-model-profile--模型档案--model-profile)是「在册」还是「已撤回」。**
> 在册的能被新选中；已撤回的不能，**但行还在、读得出来**。
> **「已下架」说的是一个名字，不是一行**：会话用的那个名字在链上同名的每一条都撤回了，才说「已下架」而不是「未知模型」；
> 最具体那一条撤回了、链上另有同名在册的，名字落到那一条，调用照发。
> **已撤回的可以恢复在册**：恢复的还是原来那一条（同一个范围、同一个路由名），谁撤得了它谁就恢复得了它；
> 还指着它的会话不用换就接得上。**两个取值之间来回都走得通，没有终态。**
>
> **EN**: **Whether a model profile is listed or withdrawn.** A listed profile can be newly selected;
> a withdrawn one cannot, **yet its row remains and can still be read**. **"Withdrawn" as a status
> shown to a session is said of a name, not a row**: only when every same-named profile on the session's
> scope chain is withdrawn does the session say "withdrawn" rather than "unknown model"; if the most
> specific one is withdrawn but another same-named profile on the chain is listed, the name falls to that
> one and calls go out as usual. **A withdrawn profile can be relisted**: what comes back is the very same
> profile (same scope, same routing name), relistable by whoever could withdraw it, and a session still
> pointing at it reconnects without switching. **Both transitions are open; neither value is terminal.**

- **形态**：状态
- **出处**：[PF-013 §4 在册 / 已撤回](../../product/PF-013-model-profiles-and-invocation/design.md#在册--已撤回) ·
  [§6.4](../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)（rev 15） ·
  [flows §3.1](../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)（rev 15）
- **别混**：**「这个范围不允许它」不是这里的取值**——那是求值的结果，档案照样在册；两者要用户做的事不同：已下架要换一个，不被允许要去找管理员
- **注意**：**同一个范围里想再用一个已撤回档案的路由名，走的是「恢复在册」，不是「建档」**——那个名字在这个范围里只对应这一条

### UL-allowed-providers · 允许的供应商 · Allowed Providers

> **中**：**[模型档案](#ul-model-profile--模型档案--model-profile)上的一项属性：这条档案允许走哪几家供应商、按什么次序。**
> 有序、非空；**顺序就是重试挂件逐家去试的顺序**，每一次发出只走其中一家。建档时给，可改。
>
> **EN**: **An attribute of a model profile: which providers the profile may go through, and in what
> order.** Ordered and non-empty; **the order is the order in which the retry extension tries them**,
> each send going through exactly one. Set when the profile is created; may be changed.

- **形态**：属性
- **出处**：[PF-013 §4 模型档案](../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) ·
  [§5.12 系统自带一件默认的](../../product/PF-013-model-profiles-and-invocation/design.md#系统自带一件默认的所以开箱就有重试)（rev 15）
- **注意**：它是[试尽](execution-and-outcome.md#ul-retry-exhaustion--试尽--retry-exhaustion)这个判断的**输入**，不是试尽的定义
- **别混**：**不是「各家一把凭据」**——所有模型请求统一经 OpenRouter 出去，一个租户一把[模型凭据](#ul-model-credential--模型凭据--model-credential)，不分供应商

### UL-provider-fallback · 供应商回退 · Provider Fallback

> **中**：**[模型档案](#ul-model-profile--模型档案--model-profile)上的一项是 / 否属性：第一家不行时，允不允许往后换一家。**
> 允许时，默认的重试件顺着[次序](#ul-allowed-providers--允许的供应商--allowed-providers)每家至多试一次；
> 不允许时，**同一家退避之后至多再试一次**——不许的是换家，不是再试。建档时给，可改。
>
> **EN**: **A yes/no attribute of a model profile: whether, when the first provider fails, the call may
> move on to the next.** If allowed, the default retry extension tries each provider in order at most
> once; if not, **it retries the same provider at most once after back-off** — what is forbidden is
> switching provider, not retrying. Set when the profile is created; may be changed.

- **形态**：属性
- **出处**：[PF-013 §4 模型档案](../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) ·
  [§5.12 系统自带一件默认的](../../product/PF-013-model-profiles-and-invocation/design.md#系统自带一件默认的所以开箱就有重试)（rev 15）
- **注意**：它同样只是[试尽](execution-and-outcome.md#ul-retry-exhaustion--试尽--retry-exhaustion)的输入；租户换掉默认重试件之后，怎么读它由那一件定

### UL-model-credential · 模型凭据 · Model Credential

> **中**：一个[租户](subjects-and-ownership.md#ul-tenant--租户--tenant)**身上的一项属性**：
> **这个租户把模型请求发出去时用的那一把 OpenRouter 凭据**，**一个租户一把**——
> 这个租户发起的调用都从它出去，不管调的是官方档案、组织层建的[自建档案](#ul-custom-model-profile--自建档案--custom-model-profile)还是他自己建的。
> **[组织](subjects-and-ownership.md#ul-organization--组织--organization)那一层不持有它**，每个人在自己的租户层自取。
> 由此三条：**身份即范围**（它是谁的，看它配在哪个租户上）、
> **轮换就是改这一项的值**、**用量记在这个租户头上**。
> **官方档案不带它**；租户**可以自带自己的那一把**，也可以换、可以**解绑**（清空后照没配处理）。
> **出厂默认那一格也可以有一把**：由部署装配时配好，产品里没有任何操作能配、换或解绑它，它不是哪个组织或租户的。
>
> **EN**: An attribute on a **tenant**: **the one OpenRouter credential that tenant's model
> requests go out with**, **one per tenant** — every call that tenant initiates goes out on it,
> whether the profile called is official, self-built at the organization layer, or the tenant's
> own. **The organization layer holds none**; each person brings their own at their tenant layer.
> Three consequences follow: **its identity is the scope** — whose it is follows from which tenant
> it sits on; **rotating it means changing this one value**; and **usage is attributed to that
> tenant**. Official profiles carry none, and a tenant may **bring its own**, change it, or
> **unbind** it (cleared, it is treated as not configured). **The factory-default cell may hold one
> too**: configured when the deployment is assembled, with no product operation able to set, change
> or unbind it; it belongs to no organization or tenant.

- **形态**：属性
- **出处**：[PF-013 §5.6](../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) ·
  [组织那一层为什么不持有](../../product/PF-013-model-profiles-and-invocation/design.md#组织那一层为什么不持有) ·
  [§6.2](../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)（rev 15）
- **⚠️ 别混 ①**：**不是[设置](#ul-setting--设置--setting)**——设置是**资产**的属性，
  而[档案不是资产](#ul-model-profile--模型档案--model-profile)、凭据也不是；**它挂在租户身上**
- **别混 ②**：**裸写「凭据」不作数**——账号的登录凭据、[连接件](#ul-connector--连接件--connector)的接入凭据、
  [MCP 凭据](#ul-mcp-credential--mcp-凭据--mcp-credential)都叫凭据，**正式名一律带「模型」**
- **注意 ①**：一租户一把的代价是**做不到「这个模型走另一个账号」**；
  这个租户所有调用的用量都记在同一把上，**上游账单分不到单条档案**
- **注意 ②**：**组织那一层不持有，是与 [MCP 凭据](#ul-mcp-credential--mcp-凭据--mcp-credential)一并定的同一条路**——
  组织持有一把、供成员共用，本版不做；组织层建的档案，成员配上自己那一把之前用不上
- **弃用说法**：~~BYOK~~——OpenRouter 响应里的 `is_byok` 是上游字段，说的是**上游那一侧**用了谁的 key，与本词条不是一回事，正文不用这个缩写

### UL-model-request-parameters · 模型请求参数 · Model Request Parameters

> **中**：[模型档案](#ul-model-profile--模型档案--model-profile)**身上的一项属性**：**发请求时随档案带上的那一组常用参数**——推理强度、temperature、seed 这一类——
> **名字与取值由系统统一定一份，各家 adapter 自己解析处理**；上游不认的项**不静默丢，留痕**。
> 一次请求实际带了什么，记在那次请求的可追溯组成里；「调模型之前」的拓展件可以只为这一次改掉它们。
>
> **EN**: An attribute of a **model profile**: **the set of common parameters that travel
> with the profile on every request** — reasoning effort, temperature, seed and the like —
> **named and typed once by the system, translated by each adapter on its own**; an item
> the upstream does not recognise is **never dropped silently but recorded**. What a given
> request actually carried is kept in that request's traceable composition; an extension
> at "before the model call" may override them for that one request.

- **形态**：属性
- **出处**：[PF-013 §4 模型档案](../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)（rev 15）
- **别混**：**不是[模型凭据](#ul-model-credential--模型凭据--model-credential)**——凭据挂租户、一租户一把；参数挂档案、一档案一组
- **注意**：词表里有哪些参数、各取什么值，归规格，不归产品正文

### UL-mcp-credential · MCP 凭据 · MCP Credential

> **中**：一个 [MCP](#ul-mcp--mcp--mcp) 接入点**连对端时出示的那一份凭据**，
> 是这个接入点**挂在[租户](subjects-and-ownership.md#ul-tenant--租户--tenant)那一层**的一份[持有](circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)上的一项
> [落点与身份类](#ul-setting-category--设置项类别--setting-category)[设置](#ul-setting--设置--setting)：**一份持有一份值**，
> 决定对端**以哪个账号**认这个接入点。**组织那一层不持有它**——组织接入的接入点，由每个成员在自己的租户层取；工作区那一级取不了。
> 值有两种来路——**直接配上的一个静态值**，
> 或**经 OAuth、由人到对端点同意后取得的那一份**；两种来路是同一项设置。
> 经 OAuth 取得的那一份**续期不算换值**，续出来的仍归同一份持有。
>
> **EN**: The credential an **MCP** access point presents to its far side — a
> placement-and-identity **setting** on one **holding** of that access point **at the tenant
> layer**, **one value per holding**, deciding **which far-side account** the access point is
> recognised as. **The organization layer holds none** — for an access point the organization
> connected, each member obtains one at their own tenant layer; the workspace level cannot obtain
> one. The value arrives by one of two routes: **a static value set directly**, or **one
> obtained through OAuth after a person consents on the far side**; both are the same
> setting. Renewing an OAuth-obtained value **is not a change of value**, and what it
> renews into stays with the same holding.

- **形态**：属性
- **出处**：[PF-002 §4 MCP](../../product/PF-002-assets-settings-and-permissions/design.md#mcp) ·
  [MCP 凭据：一份持有一份](../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) ·
  [§5.2 设置项分四类](../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)（rev 26）
- **⚠️ 别混**：**不是[模型凭据](#ul-model-credential--模型凭据--model-credential)**——模型凭据挂在**租户身上**、一租户一把、不是设置；
  MCP 凭据挂在**接入点的持有**上、一份持有一份、是一项设置。**两者同一条路：组织那一层都不持有**
- **别混 ②**：[连接件](#ul-connector--连接件--connector)的**鉴权绑定**方向相反（对面进来找我），不是这一项；它同样只在租户那一层配
- **注意**：经 OAuth 取得的那一步，正文**不裸写「授权」**（撞使用权与[授权表达](interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression)），
  也不写「OAuth 登录」（撞[登录状态](subjects-and-ownership.md#ul-login-state--登录状态--login-state)）；写「经 OAuth 取得」

### UL-selected-model · 选中模型 · Selected Model

> **中**：**[会话](agent-runtime-loop.md#ul-session--会话--session)当前指向的那个[模型档案](#ul-model-profile--模型档案--model-profile)路由名。**
> 它是一个**被记下来的取值**，**记的是路由名，不是某一层的某一行**——这个名字落到哪一条档案，每次用到时按层覆盖现算；
> **只因一次[模型切换](#ul-model-switch--模型切换--model-switch)而变**；它摆在那儿，不会算不出来。
> **会话从没切换过时，它取「用哪个模型」这项设置沿层级求值出来的那个名字**——这就是它的初值。
> **它不是这一次请求实际用的那条**——那是[有效模型](#ul-effective-model--有效模型--effective-model)。
>
> **EN**: **The model-profile routing name a session currently points at** — a **recorded value**
> that **records a name, not a row at some layer** (which profile the name resolves to is computed by
> layer override each time it is used), and **changes only through a model switch**; it is always simply
> there. **Until the session has ever switched, it is the name that the "which model" setting evaluates
> to across the layers** — that is its initial value. **Not the profile a given request actually goes out
> with**: that is the effective model.

- **形态**：属性
- **出处**：[PF-013 §4 选中模型 与 有效模型](../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) ·
  [档案的身份：所在范围加路由名](../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名) ·
  [§5.9](../../product/PF-013-model-profiles-and-invocation/design.md#59-换模型一条事实一个生效点零个新分支)（rev 15）
- **⚠️ 别混**：用户界面上「你正在用 X」说的是它；**「刚才那句话是 X 说的」说的是另一件事**，两者完全可以不是同一个答案
- **注意**：它是「用哪个模型」这项[设置](#ul-setting--设置--setting)在**会话那一格**的值；切换就是改这一格，**从没切换过时那一格没有值**，所以初值取沿层级求值的那一条
- **注意 ②**：**它的每一次改变，都先是会话日志里的一条[切换](#ul-model-switch--模型切换--model-switch)事实**——[条目落盘即改变](../../product/PF-013-model-profiles-and-invocation/flows.md#33-一个会话的选中模型)（PF-013 rev 12），没有「自动从 A 变成别的」这条转移
- **注意 ③**：**最具体那一条撤回了、链上另有同名在册的，它没变**——变的是这个名字落到哪一条，那不是改选；[§6.1](../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用)（rev 15）标题里的「引用」指名字背后必须有一条档案，不指某一行

### UL-effective-model · 有效模型 · Effective Model

> **中**：**这一次请求实际用的那条[模型档案](#ul-model-profile--模型档案--model-profile)。**
> 它是**一次求值的结果，每次请求现算**：从[选中模型](#ul-selected-model--选中模型--selected-model)出发，
> 经[层级求值](scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)（上层[锁死](scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)的压过它）得到一个路由名，
> 这个名字在范围链上按层覆盖落到一条档案，
> 再经「调模型之前」位置上的[拓展件](#ul-loop-extension--拓展件--loop-extension)可能的改写得出；
> **可以与选中模型不同**；**算不出来是一件非常态**。
> **不是「上一条回复是哪个模型生成的」**——那是留痕，是上一次求值的历史答案。
>
> **EN**: **The model profile one request actually goes out with** — **the result of an
> evaluation, computed afresh per request**: starting from the selected model, through
> scope evaluation (an upper level's lock wins) to a routing name, which resolves by layer
> override on the scope chain to one profile, then through whatever an extension at the
> "before the model call" position rewrites. It **may differ from the selected model**,
> and **failing to compute it is an off-nominal**. **Not "which model produced the last
> reply"** — that is a trace, the answer of an earlier evaluation.

- **形态**：视图
- **出处**：[PF-013 §4 选中模型 与 有效模型](../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) ·
  [§5.10](../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) ·
  [§6.9](../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)（rev 15）
- **注意**：拓展件改掉它**不是静默的**——它[必须留下结论](../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论)
- **注意 ②**：**出门之前核的是它，不是选中模型**——上层锁死了另一条，请求就用锁定的那条照常发出，不算失败；
  [只有它算不出来、或不是合法目标，这一次才失败](../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)

### UL-model-switch · 模型切换 · Model Switch

> **中**：**用户把一个会话的[选中模型](#ul-selected-model--选中模型--selected-model)换成另一个[合法目标](scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set)路由名的那个动作。**
> 它先是一条落进[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)的事实——**条目一落盘，切换就已经发生**，之后走不走得通不回头推翻它；
> **切换事实记的是路由名**，这个名字落到哪一条档案由按层覆盖定，切换改的是名字、不是某一行。
> **生效点在收到那条事实之后、下一次模型请求之前**：正在进行的那次调用照常跑完，仍用原来那条。
> 用户选了合法目标，切换就发生，**没有第二种结果**；它不给 loop 添任何分支。
>
> **EN**: **The act by which a user changes a session's selected model to another legal-target routing
> name.** It is first a fact written to the session log — **once the entry is written, the switch has
> happened**, and whatever follows does not undo it; **the switch fact records a routing name** — which
> profile the name resolves to is decided by layer override, so a switch changes the name, not a row.
> **It takes effect after that fact and before the next model request**, so a call already under way runs
> to its end on the old profile. Choosing a legal target always succeeds — **there is no second outcome**;
> the switch adds no branch to the loop.

- **形态**：过程
- **出处**：[PF-013 §5.9 换模型](../../product/PF-013-model-profiles-and-invocation/design.md#59-换模型一条事实一个生效点零个新分支) ·
  [§6.5](../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝) ·
  [§6.6](../../product/PF-013-model-profiles-and-invocation/design.md#66-切换先是一条要被记录的事实) ·
  [§6.7](../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前)（rev 15） ·
  [flows §3.3](../../product/PF-013-model-profiles-and-invocation/flows.md#33-一个会话的选中模型)（rev 15）
- **别混 ①**：**选中模型变了，不等于[有效模型](#ul-effective-model--有效模型--effective-model)变了**——上层锁死过，求值出来的可能仍是别的
- **别混 ②**：**不是[当前租户身份](subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity)的切换**。裸写「切换」不作数
- **注意 ①**：**窗口更小、看着更「差」都不构成拒绝**——装不装得下，下一次请求前照常量、照常压缩
- **注意 ②**：**agent 可以代用户执行一条明确的切换指令，但不能为了绕开一次失败自己换**——[换模型不是模型调用那一层的手段](../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)
- **弃用**：~~「切换事实」~~作为概念名——那是这个动作落下的那条[记录条目](record-and-context.md#ul-record-entry--记录条目--record-entry)，不另立


### UL-scheduling-capability · 日程能力 · Scheduling Capability

> **中**：创建和管理跨时间工作安排、调度到期工作并触发对应执行或通知动作的可插拔能力，供系统安排自身机械工作，也供 harness agent 与用户推进短、中、长期事务与目标。
>
> **EN**: A pluggable capability for creating and managing work arranged over time, scheduling due work, and triggering execution or notification actions, supporting the system’s own mechanical work as well as short-, medium-, and long-term undertakings for harness agents and users.

- **形态**：总称
- **出处**：[PF-021 §4 日程能力](../../product/PF-021-schedule-and-calendar/design.md#日程能力)（rev 8）
- **别混**：能力本身不同于一份 Schedule。

### UL-routine · 工作例程 · Routine

> **中**：一份日程内描述各次定时作业共同工作要求的数据属性，说明机械操作或 agent 工作目标以及适用的通知内容与目标租户；不含时间规则，也不承载单次作业的进度与成果，无独立身份或生命周期。出厂形式是供填入该属性的预置描述数据。
>
> **EN**: The work-description data held within a schedule, specifying the mechanical action or agent objective and applicable notification content and target tenant for its jobs. It excludes timing rules and per-job progress or results, and has no independent identity or lifecycle. Factory-provided forms are preset descriptions used to populate this data.

- **形态**：属性
- **出处**：[PF-021 §4 工作例程](../../product/PF-021-schedule-and-calendar/design.md#工作例程)（rev 8）
- **别混**：各次 Job 共用工作定义，不共享执行状态；不同 Schedule 不共同引用一个可变 Routine 对象。

### UL-calendar-service · 日历服务 · Calendar Service

> **中**：支持日历配置、管理、选择切换和数据更新维护，供应业务日历及其版本并提供日期计算的服务统称；作为独立产品应用交付，是日程能力的计算依赖。
>
> **EN**: The service capability for calendar configuration, management, selection and switching, data maintenance, versioned calendar supply, and date calculations. It is delivered as an independent product application and serves as a computational dependency of scheduling.

- **形态**：总称
- **出处**：[PF-021 §4 日历服务](../../product/PF-021-schedule-and-calendar/design.md#日历服务)（rev 8）
- **别混**：独立产品应用与部署位置是不同维度；“计算器”是日程讨论中的简称。

### UL-notification-capability · 通知能力 · Notification Capability

> **中**：供系统和 agent 发送通知并送达到明确目标租户的能力；支持定时来源，也支持无日程或作业来源的通知。
>
> **EN**: A capability used by both the system and agents to send notifications and deliver them to an explicitly identified target tenant, with or without a schedule or scheduled job as their source.

- **形态**：总称
- **出处**：[PF-021 §4 通知能力](../../product/PF-021-schedule-and-calendar/design.md#通知能力)（rev 8）
- **别混**：不是成果上报、普通会话回复或复制通知邀约本身；目标租户沿既有租户身份，送达不自动等于已读。

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)

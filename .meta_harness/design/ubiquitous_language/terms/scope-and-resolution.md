# 作用域与求值

**这一卷回答：一个值是怎么被算出来的。**

收在这里的都是**求值机制**——归属的层级、判定同一性的标识、几层同时有值时怎么合成，
以及 agent 感知到的「我现在处在什么情形下」。**被求值的那些东西**归
[能力与构成](capabilities-and-composition.md)，**求值的结果落到谁头上**归
[主体与归属](subjects-and-ownership.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

## 层与对象

### UL-scope-layer · 作用域层 · Scope Layer

> **中**：[协作范围 context](#ul-collaboration-scope-context--协作范围-context--collaboration-scope-context) 内部
> **由身份带来的归属层级**。共四层，由低到高：
>
> | 中文 | English | 归属 |
> |---|---|---|
> | **出厂默认** | **Factory Default** | 系统 |
> | **组织级** | **Organization** | 组织 |
> | **租户级** | **Tenant** | (组织, 账号) |
> | **会话级** | **Session** | 本次协作 |
>
> **它说的是「归属」，不是「有一堆自己的字段」**：一层的设置与权限，是它持有的资产
> 各自属性的[投影](#ul-attribute-projection--属性投影--attribute-projection)。
> **合成时用哪条层序，按维度分**：**权限**就是上面这四层；
> **设置**在租户级与会话级之间**还多一格[工作区](#ul-workspace--工作区--workspace)**，共五级——
> 工作区**不是一重身份**，所以不进上面这张表。
>
> **EN**: The levels of **ownership brought by identity** inside the collaboration-scope
> context, four in all, from lowest to highest: **Factory Default**, **Organization**,
> **Tenant** and **Session**. A layer denotes **ownership, not a set of fields of its own**
> — its settings and permissions are projections of the attributes of the assets it holds.
> **Which chain applies depends on the dimension**: **permissions** resolve over exactly
> these four; **settings** resolve over five, with the **workspace** sitting between tenant
> and session. A workspace is **not an identity**, so it is not in the table above.

- **形态**：属性
- **出处**：[PF-001 §6.1 层次](../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)（rev 17） · [PF-002 §5.8 三条层序](../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)（rev 20）
- **别混 ①**：**账号不在这四层里**——它的[求值是恒等的](#ul-scope-evaluation--作用域求值--scope-evaluation)，不占一格
- **别混 ②**：[上级组织](subjects-and-ownership.md#ul-parent-organization--上级组织--parent-organization)**不进这四层**——否则层数会随隶属链变化，且把「隶属」悄悄变成「被管辖」
- **别混 ③**：**裸写「层」不作数。**系统里到处是层
- **别混 ④**：**不是[资产归属](../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)那条层序**——那条答「这份资产是谁的、谁替换得了谁」，是 official < 组织 < 租户 < 工作区
- **注意**：**每一格由哪重身份充当**，归[作用域层身份](#ul-scope-layer-identity--作用域层身份--scope-layer-identity)
- **弃用**：~~「账号层」~~

### UL-scope-layer-identity · 作用域层身份 · Scope Layer Identity

> **中**：**[作用域层](#ul-scope-layer--作用域层--scope-layer)的一格由哪重身份充当。**
> 那四层是**身份带来的**四层，每一格对应一重归属：
>
> | 层 | 由谁充当 |
> |---|---|
> | **出厂默认** | **系统。没有一个身份对象充当它** |
> | **组织级** | [组织](subjects-and-ownership.md#ul-organization--组织--organization) |
> | **租户级** | [租户](subjects-and-ownership.md#ul-tenant--租户--tenant)，即 (组织, 账号) |
> | **会话级** | 本次协作，也就是那个[会话](agent-runtime-loop.md#ul-session--会话--session) |
>
> **EN**: **Which identity occupies a given scope layer.** The four layers are the ones
> **brought by identity**, each answering to one: the **factory-default** layer answers to the
> system and **is occupied by no identity object at all**; the **organization** layer to an
> organization; the **tenant** layer to a tenant, that is (organization, account); and the
> **session** layer to this collaboration, which is to say that session.

- **形态**：属性
- **出处**：[PF-001 §6.1 层次](../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)（rev 17） · [PF-002 §5.8 它不因此多一重身份](../../product/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份)（rev 20）
- **别混 ①**：**不是[作用域层](#ul-scope-layer--作用域层--scope-layer)本身**——层是那一格，层身份是**占着那一格的那个对象**
- **别混 ②**：**[工作区](#ul-workspace--工作区--workspace)不在其列。**它[不是一重身份](../../product/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份)，只在**设置**与**资产归属**两条层序上各占一格；它**挂在租户下**
- **别混 ③**：**[账号](subjects-and-ownership.md#ul-account--账号--account)不充当任何一格**——它的[求值是恒等的](#ul-scope-evaluation--作用域求值--scope-evaluation)，早已完成，也不接受任何配置
- **⚠️ 注意**：**出厂默认那一格没有身份对象。**读成「每一层都有一个身份主体」，就会给系统那一格**编一个出来**；它的内容是 official 资产与它们声明的默认值，[任何层不得清空](../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)

### UL-workspace · 工作区 · Workspace

> **中**：**组织、租户之下再多的一级[资产](capabilities-and-composition.md#ul-asset--资产--asset)归属：
> 由[租户](subjects-and-ownership.md#ul-tenant--租户--tenant)持有、由[会话](agent-runtime-loop.md#ul-session--会话--session)在创建时显式挂上的一份资产与配值的归属单位。**
> 与组织、租户**同形**：那八类资产它一样能持有、一样能配值——
> **权限、[落点与身份类的设置项](capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)与治理类里除禁用之外的项（`immutable`、连接件的触发会话的默认运行模式）除外，那三样它配了也不加载**；**它不是一重身份**。
> **它不是目录**——本版它**由宿主机文件系统上的一个目录承载**，那个目录里特定命名的文件是它持有什么、配了什么的来路，
> 挂上之后在装配时自动解析进来；别的承载形态本版不定义。
> **同一个租户下**，同一个目录被两个会话挂上，**两边看到的是同一份**；
> **换一个租户身份挂上同一个目录，那是另一份**。会话创建时不指定，**这一级就是空的**。
>
> **EN**: **One more level of asset ownership beneath organization and tenant: a unit of
> held assets and assigned values, owned by a tenant and explicitly attached by a session at
> creation.** Structurally identical to organization and tenant — it holds the same eight
> kinds and assigns values to them, **except permissions, placement-and-identity settings
> and every governance setting other than disable (`immutable`, a connector's default run mode for
> triggered sessions), which are never loaded from it** — **but it is not an identity**. **It is not a directory**:
> in this version it is **backed by a directory on the host file system**, whose specially
> named files are where its holdings and values come from, parsed automatically at assembly
> once attached; other backings are undefined in this version. **Within one tenant**, two
> sessions attached to the same directory see the same workspace; the same directory attached
> under a different tenant identity is a different one. A session created without naming one
> **has an empty level**.

- **形态**：对象
- **出处**：[PF-002 §4 工作区](../../product/PF-002-assets-settings-and-permissions/design.md#工作区) · [工作区不是目录](../../product/PF-002-assets-settings-and-permissions/design.md#工作区不是目录) · [它是会话选用的，不指定就是空](../../product/PF-002-assets-settings-and-permissions/design.md#它是会话选用的不指定就是空) · [§5.7](../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) · [§5.8 三条层序](../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题) · [§6.4 禁用是逐层配的布尔设置](../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)（rev 20）
- **弃用说法**：~~项目~~——**同一个东西**，正文统一写工作区。
  「项目」在别处指的东西太多，**收窄它代价过大**；
  ~~会话挂上的那个宿主机目录~~——那是它的**承载**，不是它
- **⚠️ 别混 ①**：**不是承载它的那个目录。**目录是宿主机上的一个位置，归操作系统；
  工作区是租户持有的一级归属。[路径是地址，不是钥匙](../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)，
  而且**那个目录不是 agent 在宿主机上的活动边界**（[PF-005 §4](../../product/PF-005-execution-environments-and-sandboxes/design.md#工作区的承载目录不是宿主机上的边界)）
- **⚠️ 别混 ②**：**不是「会话级」。**会话级的东西[一律不外溢](agent-runtime-loop.md#ul-session--会话--session)，
  **工作区级的留在那个目录上**——这个会话没了，同一租户的下一个会话挂上来还看得见
- **⚠️ 注意 ①**：**它在三条层序上各站各的位置**——
  **[设置](capabilities-and-composition.md#ul-setting--设置--setting)它压过租户**（除非上层加了
  [不可覆盖标记](#ul-immutable-marker--不可覆盖标记--immutable-marker)），
  **同[能力标识](#ul-capability-identifier--能力标识--capability-identifier)的资产它替换租户的**，
  **[权限](capabilities-and-composition.md#ul-permission--权限--permission)它一概不参与**
- **⚠️ 注意 ②**：**授权与权限相关的配置，它一概不参与。**
  [系统加载的时候就把工作区来的那部分过滤掉](../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)——
  **不是「加载了不许放宽」，也不是「只取收紧的那些」，是那条路根本不走**。
  **一个仓库不能给自己提权**
- **注意 ③**：**这条管三样：授权与权限、落点与身份类的设置项、治理类里除禁用之外的项（`immutable`、连接件的触发会话的默认运行模式）。**其余资产与设置照常从它这一级求值——
  **能力和偏好可以从项目里来，权力不行**。
  [禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)是一项布尔设置，
  **它这一级照样配得了、照样参与过滤**，
  **但只对它自己提供的那批资产生效**——别的层提供的资产，它配的值不参与
- **⚠️ 注意 ④**：**它不是[作用域层](#ul-scope-layer--作用域层--scope-layer)表里的一格。**
  那张表列的是**由身份带来的**四层，而工作区不是一重身份；
  [它只在设置那条层序上占一格](../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)，
  插在租户级与会话级之间
- **注意 ⑤**：**没有「登记」「撤销」一份工作区这两个动作**——会话创建时指定了目录，（租户，目录）这一份就在；
  据点上记着的「这个租户身份用过哪些目录」是[给人挑的清单，不是治理对象](../../product/PF-002-assets-settings-and-permissions/design.md#它是会话选用的不指定就是空)
- **注意 ⑥**：**它带来的本地命令型 MCP 接入点与命令型 hook 默认不启用**，由持有它的租户在自己的设置里逐件打开——
  [开关不在仓库里](../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)

### UL-scoped-object · 范围化对象 · Scoped Object

> **中**：**协作范围 context 内部**的对象——设置、权限与资产的共同抽象：
> **归属于某一作用域层、并参与求值的对象**。每个这样的对象都带三个要素：
> [能力标识](#ul-capability-identifier--能力标识--capability-identifier)、所属层、
> [合成语义](#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)。
>
> **EN**: The common abstraction over settings, permissions and assets **inside the
> collaboration-scope context**: an object that **belongs to one scope layer and
> takes part in evaluation**. Each carries three elements — a capability identifier,
> an owning layer, and composition semantics.

- **形态**：总称
- **出处**：[PF-001 §4 范围化对象](../../product/PF-001-identity-scope-and-agent-constraints/design.md#范围化对象)（rev 17）
- **别混**：[个人 context](#ul-personal-context--个人-context--personal-context) **不是**范围化对象——它在另一个轴上。账号的身份事实（登录标识、凭据、激活状态）**也不是**

### UL-capability-identifier · 能力标识 · Capability Identifier

> **中**：判定两个[范围化对象](#ul-scoped-object--范围化对象--scoped-object)是否
> **「实质上同一性质」**的标识，从而决定它们**能否互相覆盖**。
> **它的构成按资产类别定：类别 ＋ name。**
> 资产声明的依赖与引用**指向能力标识，不指向某个具体资产**——
> 所以发生覆盖之后，**依赖自动指向当前生效的那一个**。
> **[模型档案](capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)不是资产，但以路由名充当能力标识**：「用哪个模型」记的是路由名，同名的几条在范围链上按层取最具体的一条。
>
> **EN**: The identifier deciding whether two scoped objects are **"the same thing in
> substance"**, and therefore whether one **may override** the other. **It is made up of the
> asset's kind plus its name**, per kind. An asset's declared dependencies and references
> **point at capability identifiers, never at a specific asset** — so after an override, **a
> dependency resolves automatically to whichever asset is now in effect**. **A model profile is
> not an asset, but its routing name serves as its capability identifier**: "which model" records
> a routing name, and among same-named profiles the most specific one on the scope chain wins.

- **形态**：属性
- **出处**：[PF-001 §4 范围化对象](../../product/PF-001-identity-scope-and-agent-constraints/design.md#范围化对象) · [§6.3](../../product/PF-001-identity-scope-and-agent-constraints/design.md#63-依赖与组合)（rev 17） · [PF-002 §4 身份是「类别 ＋ name」](../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)（rev 20） · [PF-013 §4 档案的身份](../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)（rev 12）
- **注意**：**同一层可以有好几份同标识的资产，但一层对一个能力标识至多持有一份**——替代发生在持有上，复制进来不自动顶掉原来持有的那份

## 怎么算

### UL-scope-evaluation · 作用域求值 · Scope Evaluation

> **中**：沿[作用域层](#ul-scope-layer--作用域层--scope-layer)把各层持有的
> [范围化对象](#ul-scoped-object--范围化对象--scoped-object)算成**这次实际生效的那一份**。
> 账号也求值，只是它的求值**恒等**——给一个账号，求出这一个自然人，**不需要任何机制**。
>
> **EN**: Computing **what actually takes effect this time** from the scoped objects
> held at each layer. An account is evaluated too, but its evaluation is **the
> identity function** — given an account, it yields that one natural person,
> **requiring no mechanism at all**.

- **形态**：过程
- **出处**：[PF-001 §4 账号](../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号) · [§6.2](../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 17）
- **注意**：**求值与[装配](agent-runtime-loop.md#ul-agent-assembly--agent-装配--agent-assembly)不能合并**——合并的话，「组织禁用了某个 skill」与「这个 agent 没引用它」会变成同一件事，而两者的产品含义完全不同

### UL-scope-composition-semantics · 作用域合成语义 · Scope Composition Semantics

> **中**：同一[能力标识](#ul-capability-identifier--能力标识--capability-identifier)的对象
> 在多层同时存在时，**怎样合成出最终结果**。三种，各对一类对象：
>
> | 对象 | 中文 | English | 怎么合成 | 层次有方向吗 |
> |---|---|---|---|---|
> | 设置 | **覆盖** | **Override** | 取最具体的、有值的那一层的值，更外层的被丢弃 | 有 |
> | 权限 | **收窄** | **Narrowing** | 各层**锁下的允许集合**取**交集**，更外层锁下的不可突破；界内取最具体的、挑在界内的那一层的值 | 取交集那一半**无**（交集可交换）；挑那一半有 |
> | 资产 | **组合 + 同标识覆盖** | **Composition + Same-Identifier Override** | 不同标识并存，同标识取最具体那一层的 | 同标识时有 |
>
> 「更外层 / 更具体」按[作用域层](#ul-scope-layer--作用域层--scope-layer)的先后读：出厂默认最外，会话级最具体。
>
> **EN**: How objects sharing one capability identifier across several layers combine
> into a final result. Three kinds: **Override** for settings (the most specific layer
> with a value wins, outer ones are discarded); **Narrowing** for permissions (the locked sets of permitted values
> intersect across layers, order-independently, and no more specific layer can break a
> bound locked further out; within the bound, the most specific layer whose pick falls
> inside it decides); and **Composition + Same-Identifier Override** for assets (distinct
identifiers coexist; for one identifier the most specific layer's asset wins). "Outer" and
"more specific" follow the layer order: the factory default is outermost, the session most
specific.

- **形态**：规则
- **出处**：[PF-001 §6.2 三种合成语义](../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 17）
- **别混**：**裸写「组合 / composition」不作数**——[资产组合](capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)是另一回事
- **注意**：**权限上，锁下的才是界，不锁的只是在界里挑**——组织配「问一下」不锁，成员挑「自动」就生效；**配成「禁止」的锁不锁都是界**。
  组织锁成空集，租户再怎么挑也拿不到——**空集与谁的交集都是空集**
- **注意**：资产求值有一条**下界**：每个 [official](circulation-and-entitlement.md#ul-official-asset--官方件--official-asset) 能力标识下都必须有东西，**任何层都不能把它清空**

### UL-two-pass-resolution · 两轮求值 · Two-Pass Resolution

> **中**：求值分两轮，**作用对象不同**：第一轮作用在**资产**上（这个能力标识下生效的是哪个资产），
> 第二轮作用在**资产的属性项**上（这个资产的某项设置或权限取什么值）。
>
> **EN**: Evaluation runs in two passes over **different objects**: the first over
> **assets** (which asset is in effect under this capability identifier), the second
> over **an asset's attribute entries** (what value a given setting or permission
> takes).

- **形态**：规则
- **出处**：[PF-001 §6.2 两轮合成](../../product/PF-001-identity-scope-and-agent-constraints/design.md#两轮合成作用对象不同)（rev 17） · [PF-002 §5.6](../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)（rev 20）
- **别混**：混为一谈就会得出「**改一项设置等于换一个资产**」这种结论——而实际上租户改默认模型时，用的还是**组织共享的那一个**资产
- **注意 ①**：第一轮内部有三小步，次序写死：**先按[禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)滤，
  再按[「谁可以使用它」](circulation-and-entitlement.md#ul-usable-by--谁可以使用它--usable-by)滤（official 那一份不参与），最后同标识取最具体的一份**；
  被前两步滤掉的持有在替换次序上视为不存在，标识退回下一层
- **注意 ②**：**唯一会改组合的那项设置——[Plugin](capabilities-and-composition.md#ul-plugin--插件--plugin) 的「启用哪些成员」——在组装展开到它时就地求值**，其余属性项照常在第二轮

### UL-immutable-marker · 不可覆盖标记 · Immutable Marker

> **中**：一层给出某个值时可以附加的标记，表示这个值**不可再被上层覆盖**。
> 不加即「**默认**这样」，加了即「**必须**这样」。**一个标记同时管三处**：
> 设置的字段值、权限的取值、资产的替换。
>
> **EN**: A marker a layer may attach to a value it supplies, meaning the value
> **cannot be overridden by any higher layer**. Without it the layer says
> "**by default** this"; with it, "**it must be** this". **One marker covers three
> cases**: a setting's field value, a permission's value, and an asset substitution.

- **形态**：属性
- **出处**：[PF-001 §6.2 默认与强制](../../product/PF-001-identity-scope-and-agent-constraints/design.md#默认与强制immutable)（rev 17） · [PF-002 §5.4](../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)（rev 20）
- **注意 ①**：对权限而言，`immutable(v)` 就是把允许集合**收窄到单元素** `{v}`——**强制是收窄的特例**；权限上**带它的配值是界、不带的只是挑选**，唯独配成「禁止」的不带也是界
- **注意 ③**：锁资产替换时**不问被锁的是 official 还是自定义**——组织或租户在自己那层把某份 official 的持有标上它，
  下面就换不掉；[工作区](#ul-workspace--工作区--workspace)那一级**配不了它**
- **注意 ②**：[禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)的析取语义
  **等价于「布尔设置 ＋ 真即 immutable」**——**不是第四处，也不是另一套机制**
- **注意 ③**：**[工作区](#ul-workspace--工作区--workspace)那一级同样压不动锁住的项**——
  它在设置这一维虽然[压过租户](../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)，
  覆盖也只发生在**没被锁死**的项上

### UL-attribute-assignment · 属性配值 · Attribute Assignment

> **中**：某一级在**一份[资产持有](circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)上、
> 为其中一个属性项**配下的**一个值**，可带[不可覆盖标记](#ul-immutable-marker--不可覆盖标记--immutable-marker)。
> 它是[设置](capabilities-and-composition.md#ul-setting--设置--setting)与[权限](capabilities-and-composition.md#ul-permission--权限--permission)
> **真正被读写的最小单位**——「组织的设置」只是一批配值的[投影](#ul-attribute-projection--属性投影--attribute-projection)。
> **它不脱离那份持有存在**：持有被[移除](circulation-and-entitlement.md#ul-asset-removal--资产移除--asset-removal)即随之消失，
> 被[禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)则原样保留。
>
> **EN**: One value a level supplies **for one attribute entry on one asset holding**,
> optionally carrying the immutable marker. It is **the smallest read-write unit** behind
> settings and permissions — "an organization's settings" is merely a projection of a set
> of such assignments. **It does not exist apart from that holding**: removing the holding
> removes it, while disabling the holding leaves it untouched.

- **形态**：属性
- **出处**：[PF-002 §5.2「组织的设置」是视图，不是对象](../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象) · [PF-002 flows §3.2](../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值)（rev 20）
- **别混**：不是[属性投影](#ul-attribute-projection--属性投影--attribute-projection)——投影是**从一批配值算出来的视图**，配值是被投影的那一格。**裸写「配值」不作数**：正文也用它说「各层配值」这个动作
- **注意**：**每一级各配各的。**同一份资产在组织、租户、[工作区](#ul-workspace--工作区--workspace)上各是一份持有，各有各的配值；
  [几级都配了听谁的，看那一维的层序](../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)

### UL-attribute-projection · 属性投影 · Attribute Projection

> **中**：某一层的设置或权限，是**它持有的资产各自属性**在这一层上的投影——
> **是视图，不是对象**，不需要维护，**是持有关系的函数**。
> 真正可被读写的最小单位是[属性配值](#ul-attribute-assignment--属性配值--attribute-assignment)。
>
> **EN**: A layer's settings or permissions are a **projection** of the attributes of
> the assets it holds. It is a **view, not an object**: nothing to maintain, being a
> **function of the holding relation**. The smallest read-write unit is the
> **attribute assignment**.

- **形态**：视图
- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)（rev 17） · [PF-002 §5.2](../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)（rev 20）
- **注意**：**没有「组织的设置」这个对象。**把它当对象实现，就会出现一份**独立于资产的字段表**，两者各自演化，最终对不上

### UL-permission-bound · 权限界 · Permission Bound

> **中**：**一层在一项[权限](capabilities-and-composition.md#ul-permission--权限--permission)上锁下的允许集合**——带[不可覆盖标记](#ul-immutable-marker--不可覆盖标记--immutable-marker)的那一条[配值](#ul-attribute-assignment--属性配值--attribute-assignment)，锁成一个值是它的特例；
> **执行权限配成「禁止」的，锁不锁都算界**。各层的界**取交集**：更具体的一层只能在外层的界里再收，突破不了；
> 界锁成空集，每一次调用都被拒。
>
> **EN**: **The set of allowed values a layer locks down on one permission** — an assignment carrying the
> immutable marker, locking to a single value being the special case; **an execution permission set to
> "deny" counts as a bound whether locked or not**. The bounds of all layers **intersect**: a more specific
> layer can only narrow within the outer bound, never break out of it; a bound locked to the empty set
> rejects every call.

- **形态**：属性
- **出处**：[PF-002 §5.3 两个例子，两种合成](../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) ·
  [§5.5 替换是一条路径](../../product/PF-002-assets-settings-and-permissions/design.md#替换是一条路径不是一扇后门)（rev 20） ·
  [PF-001 §6.2 三种合成语义](../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 17）
- **别混**：**不锁的配值不是界**——那是[权限挑选](#ul-permission-pick--权限挑选--permission-pick)；组织说「默认问一下」而不锁，是在说「没人另挑就用它」，不是「只许问一下」
- **注意**：**界跟着[能力标识](#ul-capability-identifier--能力标识--capability-identifier)走**——同标识替换之后，外层为这个标识锁下的界照样管着替换它的那一份；替换件的声明里少了被锁的那一项，那一项按最严算
- **注意 ②**：**裸写「界」不作数**——单字，到处都是

### UL-permission-pick · 权限挑选 · Permission Pick

> **中**：**一层在一项[权限](capabilities-and-composition.md#ul-permission--权限--permission)上配下、但没有锁的那个值**：它不划范围，只在[界](#ul-permission-bound--权限界--permission-bound)里挑一个。
> 求值时**从最具体的一层往外，取第一个落在界内的挑选**；作者声明的默认值是最外面那一个挑选；挑到界外的不生效。
> **谁都没挑到界内的，取界内离最具体的那个挑选最近的一档，一样近取严的。**
>
> **EN**: **A value a layer sets on a permission without locking it**: it draws no boundary, it only
> picks within the bound. Evaluation takes, **from the most specific layer outward, the first pick that
> falls inside the bound**; the author's declared default is the outermost pick; a pick outside the bound
> has no effect. **If no pick falls inside, the result is the level within the bound closest to the most
> specific pick, the stricter one on a tie.**

- **形态**：属性
- **出处**：[PF-002 §5.3 两个例子，两种合成](../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)（rev 20） ·
  [PF-001 §6.2 三种合成语义](../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 17）
- **别混**：**「设成自动」看着像放宽，其实是在界内挑一个**——界不空，分档的权限（执行权限、干预力）求出来就恰好是一档
- **注意**：**执行权限配成「禁止」的不是挑选，是界**——任何一层的「禁止」都不能被更具体的一层挑掉

### UL-legal-target-set · 合法目标集合 · Legal Target Set

> **中**：**此刻这个[会话](agent-runtime-loop.md#ul-session--会话--session)能切换到的那些[模型档案](capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)路由名**：
> 每个路由名取它在这条范围链上**胜出的那一条**（先滤掉已撤回的与这个范围不允许的），胜出行**在册 ∩ 这个范围允许 ∩ 兼容这个会话的[模态投影](record-and-context.md#ul-modality-projection--模态投影--modality-projection)**，这个名字才在集合里。
> [切换](capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)到它里面的任何一个都不得拒绝；不在它里面的，选不到，也就谈不上被拒绝。
> **它只会越收越紧**——模态投影只增不减。
>
> **EN**: **The model-profile routing names this session can switch to right now**: each name resolves to
> **the profile that wins on this scope chain** (withdrawn profiles and those this scope does not allow are
> filtered first), and the name is in the set only when that winning profile is **listed ∩ allowed in this
> scope ∩ compatible with the session's modality projection**. A switch to any member may not be refused; a
> name outside it cannot be chosen, so there is nothing to refuse. **It only ever narrows**, because the
> modality projection only grows.

- **形态**：视图
- **出处**：[PF-013 §5.10 合法目标集合与展示列表，是两件事](../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) ·
  [§4 档案的身份](../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名) ·
  [§5.11](../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面) ·
  [§6.5](../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)（rev 12）
- **别混**：**不是[模型展示列表](#ul-model-display-list--模型展示列表--model-display-list)**——展示列表多出当前选中的那一条，哪怕它已不是合法目标
- **注意 ①**：**出门之前核的是[有效模型](capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)是不是它的成员**——不是选中模型
- **注意 ②**：**模态兼容挡在算它的那一刻，不挡在出门那一刻**——收不下会话里已有模态的，从一开始就不在候选里

### UL-model-display-list · 模型展示列表 · Model Display List

> **中**：**用户挑模型时看见的那一份：[合法目标集合](#ul-legal-target-set--合法目标集合--legal-target-set) ∪ 当前的[选中模型](capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)，外加被它们盖住的同名条目（只作标注），此外一条不多。**
> **一个路由名能选的只有一行**——它在这条范围链上胜出的那一条；被盖住的同名条目（含最具体那一格撤回了的那条）照列、带来源、标「被某层同名档案覆盖」，**选不了**——选这个名字，用的就是胜出的那一条。
> 当前选中的那个名字即使已下架（链上同名的都撤回了）、这个范围不再允许、或读不了这个会话里的内容，**也留着，并标明是哪一种**；
> 合法目标里调它时没有凭据可用的（这个租户还没配自己那一把），可选，但标明现在用不了、缺什么；其余不是合法目标的，不在列表里。
> 官方与自建在同一份列表里，**每一条都标着来源**——官方，或自建加建在哪一层。
>
> **EN**: **What the user sees when choosing a model: the legal target set ∪ the current selected model,
> plus the same-named entries they cover (annotation only) — nothing more.** **Only one row per routing
> name is selectable** — the profile that wins on this scope chain; covered same-named entries (including
> a withdrawn most-specific one) are listed with their origin and marked "covered by a same-named profile
> at layer X", **not selectable** — choosing the name uses the winning row. The selected name stays even
> when withdrawn (every same-named profile on the chain withdrawn), no longer allowed in this scope, or
> unable to read this session's content, **marked with which of these it is**; a legal target with no
> credential usable for the call (the tenant has not yet set their own) is selectable but marked as unusable
> for now, saying what is missing; nothing else that is not a legal target appears. Official and custom
> profiles share this one list, **and every row carries its origin** — official, or custom plus the layer it
> was created at.

- **形态**：视图
- **出处**：[PF-013 §5.10 合法目标集合与展示列表，是两件事](../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) ·
  [§6.3](../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)（rev 12）
- **别混**：**选中的那条在列表里，不等于它是合法目标**——它选不了、也切不过去，留着只为让用户看见自己此刻停在哪一条上
- **注意 ①**：**来源是每一条上的一个标注，不是把列表分成几块的依据**
- **注意 ②**：被盖住的条目**怎么呈现**（排在胜出那条下面、折起来）归 PF-016

## agent 感知到的处境

### UL-runtime-context · 运行时 context · Runtime Context

> **中**：**会话推进中，在 [agent loop](agent-runtime-loop.md#ul-agent-loop--agent-loop--agent-loop) 内
> 被模型、工具、拓展点之一消费的、[消息](record-and-context.md#ul-message--消息--message)之外的那些上下文。**
> **它是一块一块的**：每块是一份数据，多数是一张**就地更新**的表单，也有实时算出来的；
> **每块都有生产者**（会话本身，或会话外的某个东西）**和消费者**（那三个角色的一个或多个）。
> [协作范围 context](#ul-collaboration-scope-context--协作范围-context--collaboration-scope-context)
> 与[个人 context](#ul-personal-context--个人-context--personal-context) 都是其中的块。
>
> **EN**: The context **outside the messages** that is consumed, within the agent loop, by
> one of three roles — **the model, tools, extension points**. It comes **in blocks**: each
> block is a piece of data, mostly a form **updated in place**, sometimes computed on the
> spot; each has **a producer** (the session itself, or something outside it) and **consumers**
> (one or more of those three roles). Collaboration-scope context and personal context are
> among its blocks.

- **形态**：总称
- **出处**：[PF-015 §4 runtime context](../../product/PF-015-session-lifecycle-and-ownership/design.md#runtime-context)（rev 11）；块的两类来源沿用 [PF-001 §4 Context](../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 17）
- **弃用说法**：~~会话上下文感知域~~——**同一个概念**，正文统一写 runtime context
- **别混 ①**：**不是 Cordis 的 `Context`**——那是依赖注入与生命周期的容器，属技术设计。指它时**必须写全 `Cordis Context`**
- **别混 ②**：**不是[给模型看的上下文](../index.md#记录与上下文)**。**裸写「上下文 / context」在跨 topic 的文字里一律不作数**，[已记为冲突](../conflicts.md#现有冲突)
- **⚠️ 别混 ③**：**不是[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)。**
  日志**只追加**、历史全都在、自己会说话；它**就地更新**、只回答「现在是什么」、
  **变了要专门通知**。**一个答「发生过什么」，一个答「现在是什么」**
- **注意 ①**：**判它进不进来只看一条**——**在 agent loop 内被那三个角色之一消费（依赖）**。
  不看形态、不看归谁维护、不看重不重要
- **注意 ②**：**「会话要维护的状态」是另一个圈，两者有交集不重合**——
  [模态投影](../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)是会话要维护的，
  但那是**提供给会话外的服务用的**，会话内没人消费，**因此不是它**。
  那一类的正名是[会话日志投影](record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection)
- **注意 ③**：**[当下可用性](reach-and-availability.md#ul-current-availability--当下可用性--current-availability)也不是**——
  **消费它的是 runtime 本身**，它在组装那一步就被用掉了
- **注意 ④**：**工具和拓展点也读它。**它**从来不只是「给模型的上下文」**
- **⚠️ 注意 ⑤**：**变更怎么被会话感知，有推与拉两条**——
  **推**由那一块的生产者发起，**只在这个会话还有[运行](agent-runtime-loop.md#ul-run--运行--run)没闭合时才进得来**，
  **会话空闲时推来的一律丢弃，不落日志**；**拉**由 [agent runtime](agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) 自己做，
  [每一次执行尝试起来时取一次当前快照](../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)。
  **因此[因果链记的是这个会话感知到的变化，不是世界上发生过的每一步](../../product/PF-014-inbound-intake-and-queueing/design.md#610-注入的上下文变了没有运行在跑时什么都不做)**
- **⚠️ 注意 ⑥**：**除了实时算的那些，每一块都要能恢复**——
  [会话被重新加载、归档被撤销之后，它们必须还在](../../product/PF-015-session-lifecycle-and-ownership/design.md#58-存储要守住的两件事)。
  **实时算的那些没有「恢复」这回事**

### UL-meta-runtime-context · 元 runtime context · Meta Runtime Context

> **中**：**每个[会话](agent-runtime-loop.md#ul-session--会话--session)都必需携带、
> 并且必需持续更新的那些 [runtime context](#ul-runtime-context--运行时-context--runtime-context)。**
> 与装配无关、与运行模式无关：**不论装的是哪一份定义，这一批一样都不能少。**
>
> **EN**: The blocks of runtime context **every session must carry and keep updated**.
> Independent of assembly and of run mode: **whatever definition is assembled, none of them
> may be missing.**

- **形态**：总称
- **出处**：[PF-015 §4 meta runtime context](../../product/PF-015-session-lifecycle-and-ownership/design.md#meta-runtime-context) · [§5.6 十四项](../../product/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)（rev 11）
- **注意 ①**：**与 [meta 能力](capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability)同构**——
  那边是每个 agent 必不可少的**能力**，这边是每个会话必不可少的**感知**。**两边都不可禁用、不可替换**
- **注意 ②**：**当前恰有十四项**，[逐项的生产者、消费者与至少提供什么见正文](../../product/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)
- **注意 ③**：**模型看见其中一块只有两种形态**——**完整的那一份**（会话刚开始、**上下文压缩之后**）
  与**一条变更通知**。**第二种依赖第一种**：只发通知不发全量，模型迟早拼出一份与真的对不上的状态

### UL-collaboration-scope-context · 协作范围 context · Collaboration-Scope Context

> **中**：「**我现在在哪个组织、以什么租户身份、什么角色**」。由组织与租户承载。
> 它一换，**能用的资产、能做的事、怎么做全都变**。
> 四个[作用域层](#ul-scope-layer--作用域层--scope-layer)是**它内部**的层次。
>
> **EN**: **Which organization I am in, under which tenant identity, in which role.**
> Carried by the organization and the tenant. When it changes, **the assets
> available, the actions allowed and the way they are performed all change.** The
> four scope layers are the layers **inside it**.

- **形态**：视图
- **出处**：[PF-001 §4 Context](../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 17）
- **别混**：**不是[当前租户身份](subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity)。**那一条只是「**此刻以哪个租户身份行事**」那**一项选择**；这一条是由它算出来的**整块信息**——在哪个组织、什么租户身份、什么角色

### UL-personal-context · 个人 context · Personal Context

> **中**：**属于这个人本身的偏好**——界面语言、时区、通知方式一类。由账号承载，
> **跟着人走，在所有组织里都一样**。它**不是范围化对象**，**不参与任何层的合成**。
>
> **EN**: **Preferences belonging to the person themself** — interface language, time
> zone, notification channel and the like. Carried by the account, it **follows the
> person and is identical across all organizations**. It is **not a scoped object**
> and **takes part in no layer composition**.

- **形态**：属性
- **出处**：[PF-001 §4 Context](../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 17）
- **注意**：「**正交**」的意思是两者**独立变化**——切换组织不改界面语言，改界面语言也不影响自己在哪个组织。因此**不能用同一套层次去合成**

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)

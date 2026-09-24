# 主体与归属

**这一卷回答：谁在用这个系统，以及东西归谁。**

收在这里的都是**主体**——能持有东西、能做动作、能被指认的那些，
以及主体之间的隶属关系。**主体不是它持有的东西**，后者归
[能力与构成](capabilities-and-composition.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

### UL-account · 账号 · Account

> **中**：一个自然人在本系统中的产品身份，只承担**标识、鉴权、聚合**三件事。
> 它先于任何组织存在，**不持有任何[范围化对象](scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object)**。
>
> **EN**: A natural person's product identity in the system, carrying exactly three
> duties — **identify, authenticate, aggregate** that person's tenants into one
> place for viewing and switching. It exists prior to any organization and **holds
> no scoped objects**.

- **形态**：对象
- **出处**：[PF-001 §4 账号](../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)（rev 18）
- **别混**：账号回答「你是谁」，[租户](#ul-tenant--租户--tenant)回答「你的东西归哪儿」。**一个账号对应多个租户**
- **注意 ①**：一个现实中的人可以持有多个账号；系统**不核验、不关联、也不记录**它们属于同一人。**账号是一个自然人全部 context 的最大边界**，两个账号之间没有任何通路
- **注意 ②**：**未激活的那条记录有留存期限。**[注册第 1 步](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#11-注册)建立的账号处于未激活状态并占住[登录标识](#ul-login-identifier--登录标识--login-identifier)；期限**按部署配置**，[期限内用同一标识、同一凭据重来认回的是同一条记录，到期则记录清除、登录标识随之释放，连同为它建的个人组织与第一个租户一起消失](../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)。**这不是账号终止**——被清掉的是一条从未成为可用账号的记录，那三样从未承载过任何东西；**已激活的账号本版没有任何消失路径**

### UL-login-identifier · 登录标识 · Login Identifier

> **中**：**一个[账号](#ul-account--账号--account)用来指认自己的那个对外名字**，
> **在整个部署内唯一**，**注册时定下**。它只承担「指认」这一件事：
> **它不证明来者持有这个账号**——那是凭据的事。
>
> **EN**: **The outward name by which an account is identified**, **unique across the whole
> deployment** and **fixed at registration**. It carries one duty only — identification.
> **It proves nothing about whether the bearer holds the account**; that is the credential's
> job.

- **形态**：属性
- **出处**：[PF-001 §4 账号](../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)（rev 18）
- **别混 ①**：**不是凭据。**凭据是**证明持有**的那个东西，[不以可读形式保存](../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)；登录标识是公开的名字。**两者同样注册时定下、本版同样不可改**——[凭据的一切写路径（重置与主动更换）都在非目标里](../../product/PF-001-identity-scope-and-agent-constraints/design.md#非目标)
- **别混 ②**：**不是规格层用来引用一个账号的那个键。**登录标识是**人输入的名字**；一个账号在契约里被什么键引用、那个键与这个名字是不是同一个值，**产品正文没说，词表也不定义它**
- **注意 ①**：**本版不可改。**[注册时定下，此后不变](../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)；[修改登录标识列在非目标里](../../product/PF-001-identity-scope-and-agent-constraints/design.md#非目标)。**凭据同样不可改**，两者是同一个口径，不是相反
- **注意 ②**：它是[账号的身份事实](scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object)，**不是范围化对象**，不参与任何一层的求值。**登录失败的反馈里读不出它存不存在**——[「标识不存在」「凭据错误」「账号未激活」三种情形的反馈完全一样](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)

### UL-login-state · 登录状态 · Login State

> **中**：**一次通过鉴权的登录**，此后的交互以这个账号的身份进行。
> 每次登录产生**新的一个**，且**可被单独撤销**——退出只让被退出的那一个失效，
> 同一账号在别处的登录不受影响。**失效不可逆**：重新登录得到的是新的一个，不是旧的复活；
> 而且**失效在系统重启之后依然成立**。
> 同一账号可以同时有多个有效的，**持其中任一个就能列出全部有效的那些，每一个带签发时间**。
>
> **EN**: **One authenticated login**, under which subsequent interaction is carried out as that
> account. Each login yields **a new one**, revocable **on its own** — signing out invalidates
> only that login and leaves the account's other logins untouched. **Invalidation is
> irreversible**: logging in again yields a new one rather than reviving the old, and **it still
> holds after a restart**. An account may hold several valid ones at once, and **holding any one
> of them is enough to list them all, each with its issue time**.

- **形态**：对象
- **出处**：[PF-001 §4 登录状态](../../product/PF-001-identity-scope-and-agent-constraints/design.md#登录状态) · [PF-001 flows §3.2 登录状态](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态) · [PF-001 flows §1.2 登录](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#12-登录)（rev 18）
- **注意**：「失效在系统重启之后依然成立」里的「重启」含进程崩溃与强行结束，**不含机器断电或操作系统崩溃**——那时崩溃前最后一段已提交的事实可能退回，刚退出的登录状态可能又有效，持有者在列表上再撤一次（[PF-001 flows §3.2](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态)，rev 16；例外的拥有者是 [PF-017 §6.7](../../product/PF-017-governance-center-as-deployable-application/design.md#67-重启不让任何人退出登录)，rev 2）
- **别混**：**不是[会话](agent-runtime-loop.md#ul-session--会话--session)。**一个回答「这次登录还算不算数」，一个是一段协作。**正文刻意不用「会话」称呼它**，英文也不写 `login session`
- **注意 ①**：登录之后的初始协作范围是**该账号的[个人组织](#ul-personal-organization--个人组织--personal-organization)**
- **注意 ②**：**正文未述它靠什么标识**，只写明彼此可分辨——重新登录是新的一个，多处登录各是一个
- **注意 ③**：**可被同账号的其他有效登录状态列出。**[持本账号任一有效登录状态者，可以列出本账号当前全部有效的登录状态，每一个带签发时间](../../product/PF-001-identity-scope-and-agent-constraints/design.md#登录状态)；**已失效的不在列表里**。**撤销仍然逐个**，[本版不做全设备撤销](../../product/PF-001-identity-scope-and-agent-constraints/design.md#非目标)
- **注意 ④**：[当前租户身份](#ul-current-tenant-identity--当前租户身份--current-tenant-identity)这项选择**挂在它身上**：它失效，那项选择随之不存在；重新登录从个人组织重新起算
- **注意 ⑤**：**属于签发它的那个[治理中心](grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)**，这是它身份的一部分；换一个中心就是另一套身份（[PF-016 §4 治理中心](../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)（rev 3））

### UL-organization · 组织 · Organization

> **中**：一个**协作范围**。它可以容纳多个账号作为成员，并拥有自己的设置、权限与资产。
> 由某个账号创建，**创建者自动成为该组织的[超级管理员](#ul-super-administrator--超级管理员--super-administrator)**。
>
> **EN**: A **collaboration scope**. It can hold multiple accounts as members and
> owns its own settings, permissions and assets. It is created by an account, and
> **its creator automatically becomes its super administrator**.

- **形态**：对象
- **出处**：[PF-001 §4 组织](../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)（rev 18）
- **别混**：组织**不是**租户，而是租户的一半——另一半是账号

### UL-personal-organization · 个人组织 · Personal Organization

> **中**：**账号注册成功时自动产生的组织**，是该账号的默认协作范围。
> 它只有创建它的那一个账号作为成员，**不能邀请他人**，
> **既无上级组织、亦不能作他人的上级**。每个账号恰有一个。
>
> **EN**: **The organization created automatically when an account is registered**,
> serving as that account's default collaboration scope. It has exactly one member —
> its creator — **cannot invite others**, and **neither has nor can be a parent
> organization**. Each account has exactly one.

- **形态**：变体（父：[组织](#ul-organization--组织--organization)）
- **出处**：[PF-001 §4 个人组织](../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织)（rev 18）
- **注意**：「不能邀请他人」是**结构性禁止**，不是一项可被调整的权限设置
- **注意**：它**永远不与别的组织同在一棵[隶属树](#ul-ancestor-chain--上级链--ancestor-chain)上**，因此永远在所有流转边界之外
- **注意**：它**唯一的消失路径**是[随一条未激活的账号记录到期被清除](../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)——它在注册第 2 步随账号记录一并建起，那条记录到期被清时它与[第一个租户](#ul-tenant--租户--tenant)一起消失。**已激活账号的个人组织不会消失**

### UL-team-organization · 团队组织 · Team Organization

> **中**：**个人组织之外的所有组织**，也就是**可邀请**的那些。
> 它不是新概念，只是需要一个词把它和个人组织对着说。
>
> **EN**: **Every organization other than a personal one** — that is, the invitable
> ones. Not a new concept, merely a word to set against "personal organization".

- **形态**：变体（父：[组织](#ul-organization--组织--organization)）
- **出处**：[PF-003 §4 承接](../../product/PF-003-asset-transfer-and-sharing/design.md#承接-pf-001-与-pf-002)（rev 5）

### UL-parent-organization · 上级组织 · Parent Organization

> **中**：组织的**一项属性**，表达「团队属于公司」「公司是另一家的子公司」。
> **至多一个**，可以为空；**隶属链不得成环**；个人组织恒为空且不可作他人的上级。
> **它不进[作用域层](scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)**——
> 子组织**不自动继承**上级组织的任何东西。
>
> **EN**: **An attribute** of an organization expressing affiliation such as "this
> team belongs to that company". **At most one**, possibly none; **affiliation
> chains must not form cycles**; a personal organization always has none and can
> never be one. **It is not a scope layer** — a child organization **inherits
> nothing automatically**.

- **形态**：属性
- **出处**：[PF-001 §4 组织](../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)（rev 18）
- **别混**：**隶属 ≠ 被管辖**。东西要流过去，走[资产复制](circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)或[资产分享](circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)的明确动作
- **注意**：建立需**双方超级管理员各做一次动作**——一方发出一份[隶属请求](#ul-affiliation-request--隶属请求--affiliation-request)、另一方接受；**解除则任一方单方面可做**，不需要请求
- **注意**：**创建组织时它恒为空**，[不能在创建时指定](../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)——那会是一次单方面指定，而单方面指定正是被明文排除的

### UL-ancestor-chain · 上级链 · Ancestor Chain

> **中**：从一个组织顺着[上级组织](#ul-parent-organization--上级组织--parent-organization)一路往上得到的组织序列，
> **不含它自己**。两个组织**有共同上级**，指的是**把各自算进自己的上级链之后两条链有交集**，
> 也就是**它们在同一棵隶属树上（根相同）**；那棵树**就是资产流转的那个边界**。
>
> **EN**: The sequence of organizations obtained by following an organization's
> parent links upward, **excluding the organization itself**. Two organizations
> **share an ancestor** when their ancestor chains intersect **once each is included in
> its own chain** — equivalently, when they sit in **the same affiliation tree** (same
> root); that tree **is exactly the boundary** within which assets may circulate.

- **形态**：视图
- **出处**：[PF-001 §4 组织](../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)（rev 18） · [PF-003 §5.2](../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)（rev 5）
- **别混**：**「有共同上级」不是「两条不含自己的链有交集」。**照那种读法，[一个组织与它自己的上级会被判成没有共同上级](../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)，而它们分明在同一棵树上——团队与它所属的公司反倒成了出树。**必须先把各自算进自己的链**
- **注意**：个人组织的上级链恒为空，把它自己算进来也只有它一个，所以**任何两个个人组织都不会有共同上级**——不是把门放宽了，**是那把尺子量不到它们**

### UL-offer · 邀约 · Offer

> **中**：**要另一方点头才生效的那类东西的统称。**发出之后先悬着，**接受才算数**；
> 悬着的那一段可以被发起方**撤回**，也会**过期**——**这四样各有自己的默认时长，
> 而发出时发起者可以指定这一份的**；**它指向的那个东西不存在了，它随即自动过期**。三种收场**完全相同**：
> **什么都没建立**，要它成立只能重新发一份。**当前恰有四样**：
> [邀请](#ul-invitation--邀请--invitation)、[隶属请求](#ul-affiliation-request--隶属请求--affiliation-request)、
> [复制通知](circulation-and-entitlement.md#ul-copy-notice--复制通知--copy-notice)、[分享邀请](circulation-and-entitlement.md#ul-sharing-invitation--分享邀请--sharing-invitation)。
>
> **EN**: The collective name for **things that take effect only once the other side says yes**.
> Once issued it hangs pending, and **acceptance is what makes it count**; while pending it may
> be **withdrawn** by the issuer, and it **expires** — **each of the four carries its own default
> period, and the issuer may set the period for that one offer when issuing it**; it also expires
> **at once if the thing it points at ceases to exist**. All three endings are
> **identical**: **nothing has been established**, and a fresh one must be issued. There are
> **exactly four** today: an invitation, an affiliation request, a pending copy notice and a
> pending sharing invitation.

- **形态**：总称
- **出处**：[PF-001 §4 两种邀约都会过期](../../product/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)（rev 18） · [PF-003 §6.14 待确认的复制通知与分享邀请会过期](../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)（rev 5）
- **⚠️ 别混**：**这四样不是同一类东西，也不共享一套身份机制。**四样**各是一个对象**——[邀请](#ul-invitation--邀请--invitation)、[隶属请求](#ul-affiliation-request--隶属请求--affiliation-request)、
  [复制通知](circulation-and-entitlement.md#ul-copy-notice--复制通知--copy-notice)、[分享邀请](circulation-and-entitlement.md#ul-sharing-invitation--分享邀请--sharing-invitation)各有词条与条目，
  关系主体与接受后建立的东西各不相同。**这个词只用来归类，不给这四样一套共同的身份、存储或状态机**
- **注意 ①**：**它自身不会有实例**——指得到的永远是那四样里的某一份
- **注意 ②**：**过期那条规则是同一条裁决的两半**——[PF-001 这一半](../../product/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)管邀请与隶属请求，[PF-003 那一半](../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)管复制通知与分享邀请，**两处口径一致**
- **注意 ③**：**「已经接受了的」不在这个词的论域里**——[确认之后的使用权没有到期](circulation-and-entitlement.md#ul-usage-right--使用权--usage-right)，[接受产生的租户](#ul-tenant--租户--tenant)也不会过期
- **注意 ④**：**本人型的[资产复制](circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)与[资产分享](circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)不产生邀约**——两侧都是同一个人，发起即生效，没有要等的另一方

### UL-invitation · 邀请 · Invitation

> **中**：**一个组织的[超级管理员](#ul-super-administrator--超级管理员--super-administrator)向某个账号发出的加入邀约。**
> 它**要被邀请的那个账号接受才生效**：接受即建立成员关系，租户 (该组织, 该账号) 随之产生。
> 被接受之前它可以**被撤回**，也会**过期**——**邀请这一类有自己的默认时长，
> 而发出时发起者可以指定这一份的**；**发出它的那个组织不存在了，它随即自动过期**；
> 两种收场相同，那时只能重新发一份。
> **[个人组织](#ul-personal-organization--个人组织--personal-organization)发不出邀请**，这是结构性禁止。
>
> **EN**: **An offer to join an organization, issued by that organization's super administrator to
> one account.** It takes effect only when **that account accepts**: acceptance establishes
> membership, and the tenant (organization, account) comes into being with it. Before acceptance
> it may be **withdrawn**, and it **expires** — **invitations carry their own default period, and
> the issuer may set the period for that one invitation when issuing it**; it also expires
> **at once if the issuing organization ceases to exist**. Either way a fresh one must be issued.
> **A personal organization can issue none** — a structural prohibition.

- **形态**：对象
- **出处**：[PF-001 flows §1.5 邀请与加入](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#15-邀请与加入) · [PF-001 §4 两种邀约都会过期](../../product/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)（rev 18）
- **别混**：与[隶属请求](#ul-affiliation-request--隶属请求--affiliation-request)是**两种对象**，不是同一样东西的两种用法——[邀请是组织对账号发的、接受产生租户，隶属请求是组织对组织发的、接受只给上级组织属性填上值](../../product/PF-001-identity-scope-and-agent-constraints/design.md#隶属关系怎么建立与解除)。**两者只有过期规则相同**
- **注意**：**正文未述它靠什么标识**。有效期正文已述：[这一类有默认时长、发出时发起者可以指定这一份的，组织不存在则自动过期](../../product/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)

### UL-affiliation-request · 隶属请求 · Affiliation Request

> **中**：**一个组织的超级管理员向另一个组织发出的建立隶属邀约**：请对方成为自己的
> [上级组织](#ul-parent-organization--上级组织--parent-organization)，或请对方成为自己的下级。
> 它**要另一方的超级管理员接受才生效**：接受即给下级组织的上级组织属性填上值，
> **不产生[租户](#ul-tenant--租户--tenant)**。被接受之前它可以**被撤回**，也会**过期**——
> **隶属请求这一类有自己的默认时长，而发出时发起者可以指定这一份的**；
> **它指向的那个组织不存在了，它随即自动过期**；三种收场相同，那时只能重新发起一份。**[个人组织](#ul-personal-organization--个人组织--personal-organization)不参与隶属关系**，
> 因此既发不出也收不到。
>
> **EN**: **An offer to establish affiliation between two organizations**, issued by one
> organization's super administrator to another — asking the other to become its parent, or to
> become its child. It takes effect only when **the other organization's super administrator
> accepts**: acceptance fills in the child organization's parent-organization attribute and
> **brings no tenant into being**. Before acceptance it may be **withdrawn**, and it **expires** —
> **affiliation requests carry their own default period, and the issuer may set the period for
> that one request when issuing it**; it also expires **at once if an organization it points to
> ceases to exist**. Either way a fresh one must be issued. **A personal organization takes no part in
> affiliation**, and so neither issues nor receives one.

- **形态**：对象
- **出处**：[PF-001 §4 隶属关系怎么建立与解除](../../product/PF-001-identity-scope-and-agent-constraints/design.md#隶属关系怎么建立与解除) · [§4 两种邀约都会过期](../../product/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期) · [PF-001 flows §1.7 建立与解除组织隶属](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#17-建立与解除组织隶属)（rev 18）
- **别混**：与[邀请](#ul-invitation--邀请--invitation)是**两种对象**——[那一个是组织对账号发的，接受产生租户；这一个是组织对组织发的，接受填上一个属性](../../product/PF-001-identity-scope-and-agent-constraints/design.md#隶属关系怎么建立与解除)。**关系主体不同，结果也不同；两者只有过期规则相同**
- **注意 ①**：**正文未述它靠什么标识**
- **注意 ②**：**解除隶属不走这条路**——建立要两边各做一次动作，[解除则任一方单方面即可](../../product/PF-001-identity-scope-and-agent-constraints/design.md#隶属关系怎么建立与解除)，不需要一份请求

### UL-tenant · 租户 · Tenant

> **中**：**(组织, 账号) 这一组合所确定的身份**，是**数据归属与隔离的单位**。
> 同一组织内的两个成员是两个租户；同一账号在两个组织中也是两个租户。
> **租户身份不含[租户角色](#ul-tenant-role--租户角色--tenant-role)。**
>
> **EN**: The identity determined by the pair **(organization, account)**; the unit
> of **data ownership and isolation**. Two members of the same organization are two
> distinct tenants, as is one account across two organizations. **A tenant identity
> does not carry a role.**

- **形态**：对象
- **出处**：[PF-001 §4 租户](../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户)（rev 18）
- **别混**：不是组织，也不是账号，**是两者的组合**
- **注意 ①**：跨租户访问**默认拒绝**；**使用成本按租户归属**，且**不随派发层级漂移**
- **注意 ②**：**身份由那一组合确定，不因成员关系断续而变**——退出组织之后再被邀请加入，[回来的是同一个租户](../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户)；解除期间它的租户级私有部分**不可达，但不销毁**

### UL-tenant-workspace-relation · 租户—工作区关系 · Tenant–Workspace Relation

> **中**：记录一个[租户](#ul-tenant--租户--tenant)与一个[工作区](scope-and-resolution.md#ul-workspace--工作区--workspace)之间当前关系的对象。
> 它区分治理所有者与被授权参与者，另带有效能力、来源和状态；治理中心用有效关系列出该租户当前可感知的工作区。
> 公开地址的发现不会自动产生这条关系。

> **EN**: A durable object recording the current relationship between a tenant and a workspace. It distinguishes governance ownership from authorized participation and carries effective capabilities, origin, and status. A governance center lists a tenant's workspaces from its active relations; discovering a public address does not create one automatically.

- **形态**：对象
- **出处**：[PF-020 租户—工作区关系](../../product/PF-020-workspace/design.md#租户工作区关系)（rev 2）
- **别混**：不是工作区实例，也不是一次会话的选择；实例是关系生效后在部署节点上的装载结果。

### UL-membership-standing · 成员资格效力 · Membership Standing

> **中**：**一个[租户](#ul-tenant--租户--tenant)此刻算不算数。**恰有两个取值：
> **有效**——成员关系成立，这个租户在其组织内持有[恰好一个租户角色](#ul-tenant-role--租户角色--tenant-role)；
> **无效**——从未建立或已被解除，这个身份在那个组织里什么也看不到、什么也做不了，
> 而[它的租户级私有部分不可达、但不销毁](../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)。
> **成员关系的断与续改变的是它**，**不改变这个租户是哪一个**；[角色调整两样都不改](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)。
>
> **EN**: **Whether a tenant counts at this moment.** It takes exactly two values. **In force** —
> membership holds, and the tenant carries **exactly one tenant role** in that organization.
> **Not in force** — membership was never established or has been dissolved, so that identity
> can see nothing and do nothing there, while **its tenant-level private holdings stay
> unreachable but are not destroyed**. **Breaking and resuming membership changes this**, never
> **which** tenant it is; a change of role changes neither.

- **形态**：属性
- **出处**：[PF-001 §4 退出之后再加入，回来的是同一个租户](../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户) · [§6.4 隔离](../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) · [PF-001 flows §3.3 成员关系](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)（rev 18）
- **别混 ①**：**不是[租户角色](#ul-tenant-role--租户角色--tenant-role)。**角色答「这个身份**能做什么**」，效力答「这个身份**此刻算不算数**」。有效时两样同时成立，[角色调整不改变效力](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)
- **别混 ②**：**不是[租户](#ul-tenant--租户--tenant)本身。**租户身份是 (组织, 账号) 这一组合**确定的值，不生不灭**；**有效性才是有状态、有写路径、有并发约束的那一面**
- **别混 ③**：**[PF-001 flows §3.3 把这件事叫作「成员关系」](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)**，那一节画的「无 → 成员 → 无」正是这两个取值。
  [领域对象那边已把「成员关系」并入租户](../../domain_objects/objects.md#ul-tenant--租户)，分界是**身份是值、有效性是记录**；**本词条就是「有效性」那一面的正式名**，不是第二个对象
- **⚠️ 注意 ①**：**「目标范围不可用」不是它的第三个取值。**[§6.4 把「目标范围不可用」与「成员失权」并列](../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)，
  两者**收场相同**——**明确失败，不静默回退到个人范围**；但**前者是这一次判不出来，后者是判出来的结果是无效**。
  把不可用读成无效，写出来的就是「那就降级到个人范围」这类静默回退
- **注意 ②**：**无效不抹掉已经发生的事。**[作者记录与归属照旧指着这个租户](../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)，
  [解除不强停正在进行的工作](../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)；重新加入**不是一次恢复动作**，没有东西被删过

### UL-current-tenant-identity · 当前租户身份 · Current Tenant Identity

> **中**：**一个账号此刻以哪一个[租户](#ul-tenant--租户--tenant)身份行事**——
> 挂在一次[登录状态](#ul-login-state--登录状态--login-state)上的**一项选择**。
> 登录之后它初始指向该账号[个人组织](#ul-personal-organization--个人组织--personal-organization)里的那个租户，
> **切换当前组织就是改它**。**在某个租户身份下创建出来的对象，持有的是创建那一刻的这个值**；
> 此后这项选择被改成别的，已经创建的那些一概不跟着变。
>
> **EN**: **Which tenant identity an account is acting as at this moment** — a **selection**
> carried on one login state. It initially points at the tenant in that account's personal
> organization, and **switching the current organization is what changes it**. **Anything
> created under a tenant identity holds the value captured at the moment of creation**;
> later changes to this selection leave what was already created untouched.

- **形态**：属性
- **出处**：[PF-001 §4 当前租户身份](../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份) · [PF-001 flows §1.8 切换当前组织](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#18-切换当前组织)（rev 18）
- **别混 ①**：**不是[协作范围 context](scope-and-resolution.md#ul-collaboration-scope-context--协作范围-context--collaboration-scope-context)。**那一块是 agent 运行时感知到的「我在哪个组织、什么租户身份、什么角色」**整块信息**；这一条只是**其中那个租户身份从哪儿来**的那项选择
- **别混 ②**：**不是租户本身**，是一项**指向**租户的选择。租户的身份由 (组织, 账号) 确定，与此刻谁选了它无关
- **注意 ①**：它**不是[范围化对象](scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object)**——不参与任何一层的求值，也不被任何一层配值。它只决定**这一次动作以谁的身份开始**
- **注意 ②**：**它随登录状态走**：那次登录失效，它随之不存在；重新登录得到的是**重新从个人组织起算**的一项新选择

### UL-tenant-role · 租户角色 · Tenant Role

> **中**：[租户](#ul-tenant--租户--tenant)在其所属组织内的属性，决定这个身份**当前能做什么**。
> 一个租户在其组织内**只持一个**；本版只有两种：**超级管理员**与**普通成员**（Member）。
> **可变**，变更只影响**此后**的准入判定，不改变已发生的归属与既有事实。
>
> **EN**: An attribute of a tenant **within its organization**, determining what that
> identity **can currently do**. A tenant holds **exactly one**; this version defines
> two — **Super Administrator** and **Member**. It is **mutable**, and a change
> affects only **subsequent** admission decisions, never ownership already
> established or facts already recorded.

- **形态**：属性
- **出处**：[PF-001 §4 角色](../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)（rev 18）
- **别混 ①**：**不是[权限](capabilities-and-composition.md#ul-permission--权限--permission)**——角色是**身份**的属性，权限是**资产**的属性
- **别混 ②**：**与消息里的 role 字段（user / assistant / system）毫无关系**。**裸写「角色」在跨 topic 的文字里一律不作数**

### UL-super-administrator · 超级管理员 · Super Administrator

> **中**：**一个组织内**的最高治理角色，可分配与收回本组织的角色（包括把这个角色给他人）。
> **它的作用域恰是该组织**：不因此取得平台全局权限、官方件的编辑权、其他组织的管理权，
> 或成员个人范围的访问权。**任何组织在任何时刻至少有一位有效的超级管理员。**
>
> **EN**: The highest governance role **within one organization**, able to grant and
> revoke roles there, including granting this role to others. **Its scope is exactly
> that organization** — it confers no platform-wide authority, no right to edit
> official assets, no control over other organizations, and no access to a member's
> personal scope. **Every organization always has at least one.**

- **形态**：状态
- **出处**：[PF-001 §4 角色](../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色) · [PF-001 flows §3.3 成员关系](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)（rev 18）
- **别混**：**不是平台管理员。**这是最容易读错的一条，读错会把组织级治理当成全局治理
- **注意**：**本版管理类动作一律只归它**——[邀请新成员、调整他人角色、管理组织的设置权限资产、建立或解除隶属，以及看本组织发出的邀约、收到的隶属请求与已解除的成员，普通成员一概不可](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#四角色与操作)。**本版没有「可被授予的管理资格」这样东西**
- **注意**：**本组织的有效成员名单不在管理类之内**——[它对本组织的每一位有效成员可见](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#四角色与操作)，看得见名单不等于持有这个角色；**[成员资格已失效](#ul-membership-standing--成员资格效力--membership-standing)的那些另算，[只有它看得见](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#四角色与操作)**
- **注意**：「至少一位」是一条**任何时刻都成立的事实**，不是每次动作各自检查一遍的前置条件——[两位超管同时移除或降级对方时，先成的一方成功、后成的一方被拒](../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)，两次动作各自合法、合起来把超管清空这种结果不允许存在

### UL-deployment-operator · 运维者 · Deployment Operator

> **中**：持有一次[治理中心](grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)部署的控制权的那个人或那几个人：
> 能把它立起来、停掉、重启、升级，能拿到它所在的机器与它的数据所在。
> **它不是账号，也不是[租户角色](#ul-tenant-role--租户角色--tenant-role)**——它先于任何账号存在，
> 作用域是这一次部署而不是某个组织；**产品不给它身份、不记录它是谁**。
> 它能做的事全在部署这一层，**对治理事实没有任何一扇门**。
>
> **EN**: The person or people who hold control of one governance-center deployment: they can
> stand it up, stop, restart and upgrade it, and can reach the machine it runs on and wherever
> its data lives. **Not an account and not a tenant role** — they exist before any account does,
> and their scope is this one deployment rather than any organization; **the product gives them
> no identity and keeps no record of who they are**. Everything they can do lies at the deployment
> layer, **with no door of any kind onto governance facts**.

- **形态**：总称
- **出处**：[PF-017 §4 运维者](../../product/PF-017-governance-center-as-deployable-application/design.md#运维者) ·
  [§5.5](../../product/PF-017-governance-center-as-deployable-application/design.md#55-运维者与超级管理员两条线不交叉) ·
  [§6.13](../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)（rev 2）
- **⚠️ 别混**：**不是[超级管理员](#ul-super-administrator--超级管理员--super-administrator)。**超管是一个组织内的最高治理角色，
  凭自己的登录状态做治理动作；运维者凭对机器与数据的控制让中心在，**手上没有任何登录状态可用**。
  同一个人两头都是，产品也当成两个人
- **注意 ①**：形态判「总称」，因为系统里指不出「这一个运维者」，也没有任何东西引用它；
  判成挂在治理中心上的属性，下游就会去建一份「运维者列表」，而正文明说中心不登记
- **注意 ②**：「平台管理员」「部署管理员」「内置管理员账号」**不是它的别名**——那几个名字指的东西
  [本产品没有](../../product/PF-017-governance-center-as-deployable-application/design.md#非目标)，刻意不立
- **注意 ③**：产品挡的是「产品自己开的门」，不是握着磁盘的人——
  [边界说实话](../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)

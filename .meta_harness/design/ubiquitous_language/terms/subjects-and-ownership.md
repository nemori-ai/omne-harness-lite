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

- **出处**：[PF-001 §4 账号](../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)（rev 6）
- **别混**：账号回答「你是谁」，[租户](#ul-tenant--租户--tenant)回答「你的东西归哪儿」。**一个账号对应多个租户**
- **注意**：一个现实中的人可以持有多个账号；系统**不核验、不关联、也不记录**它们属于同一人。**账号是一个自然人全部 context 的最大边界**，两个账号之间没有任何通路

### UL-organization · 组织 · Organization

> **中**：一个**协作范围**。它可以容纳多个账号作为成员，并拥有自己的设置、权限与资产。
> 由某个账号创建，**创建者自动成为该组织的[超级管理员](#ul-super-administrator--超级管理员--super-administrator)**。
>
> **EN**: A **collaboration scope**. It can hold multiple accounts as members and
> owns its own settings, permissions and assets. It is created by an account, and
> **its creator automatically becomes its super administrator**.

- **出处**：[PF-001 §4 组织](../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)（rev 6）
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

- **出处**：[PF-001 §4 个人组织](../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织)（rev 6）
- **注意**：「不能邀请他人」是**结构性禁止**，不是一项可被调整的权限设置
- **注意**：它**永远不在任何[隶属树](#ul-ancestor-chain--上级链--ancestor-chain)上**，因此永远在所有流转边界之外

### UL-team-organization · 团队组织 · Team Organization

> **中**：**个人组织之外的所有组织**，也就是**可邀请**的那些。
> 它不是新概念，只是需要一个词把它和个人组织对着说。
>
> **EN**: **Every organization other than a personal one** — that is, the invitable
> ones. Not a new concept, merely a word to set against "personal organization".

- **出处**：[PF-003 §4 承接](../../product/PF-003-asset-transfer-and-sharing/design.md#承接-pf-001-与-pf-002)（rev 1）

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

- **出处**：[PF-001 §4 组织](../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)（rev 6）
- **别混**：**隶属 ≠ 被管辖**。东西要流过去，走[资产转移](circulation-and-entitlement.md#ul-asset-transfer--资产转移--asset-transfer)或[资产分享](circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)的明确动作
- **注意**：建立需**双方超级管理员各做一次动作**（一方发起、另一方接受）；**解除则任一方单方面可做**

### UL-ancestor-chain · 上级链 · Ancestor Chain

> **中**：从一个组织顺着[上级组织](#ul-parent-organization--上级组织--parent-organization)一路往上得到的组织序列。
> 两个组织的上级链上有共同的组织，就说它们**有共同上级**；
> 同一条隶属树**就是资产流转的那个边界**。
>
> **EN**: The sequence of organizations obtained by following an organization's
> parent links upward. Two organizations **share an ancestor** when their ancestor
> chains intersect; **one affiliation tree is exactly the boundary** within which
> assets may circulate.

- **出处**：[PF-001 §4 组织](../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织) · [PF-003 §5.2](../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)（rev 6 / rev 1）
- **注意**：个人组织的上级链恒为空，所以**任何两个个人组织都不会有共同上级**——不是把门放宽了，**是那把尺子量不到它们**

### UL-tenant · 租户 · Tenant

> **中**：**(组织, 账号) 这一组合所确定的身份**，是**数据归属与隔离的单位**。
> 同一组织内的两个成员是两个租户；同一账号在两个组织中也是两个租户。
> **租户身份不含[租户角色](#ul-tenant-role--租户角色--tenant-role)。**
>
> **EN**: The identity determined by the pair **(organization, account)**; the unit
> of **data ownership and isolation**. Two members of the same organization are two
> distinct tenants, as is one account across two organizations. **A tenant identity
> does not carry a role.**

- **出处**：[PF-001 §4 租户](../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户)（rev 6）
- **别混**：不是组织，也不是账号，**是两者的组合**
- **注意**：跨租户访问**默认拒绝**；**使用成本按租户归属**，且**不随派发层级漂移**

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

- **出处**：[PF-001 §4 角色](../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)（rev 6）
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

- **出处**：[PF-001 §4 角色](../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)（rev 6）
- **别混**：**不是平台管理员。**这是最容易读错的一条，读错会把组织级治理当成全局治理

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)

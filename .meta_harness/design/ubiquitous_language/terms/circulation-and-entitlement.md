# 流转与授权

**这一卷回答：东西怎么在主体之间流动，以及谁凭什么用它。**

收在这里的是**关于一份东西的权利状态**，以及**改变这个状态的那些动作**。
**东西本身是什么**归[能力与构成](capabilities-and-composition.md)，
**主体是谁**归[主体与归属](subjects-and-ownership.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

## 三件互不蕴含的事

> **拥有、获权、选用可同时成立，但互不蕴含。**这是本卷的地基。

### UL-definition-ownership · 定义所有权 · Definition Ownership

> **中**：**这个定义是谁的。**获得[使用权](#ul-usage-right--使用权--usage-right)或
> [选用](#ul-version-selection--版本选用--version-selection)**都不转移**它，
> [资产组合](capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)也不转移它。
> **自己拥有的定义可直接作为权利依据**，无须伪造一份向自己授予的外部授权。
>
> **EN**: **Whose definition this is.** Neither obtaining a usage right nor selecting
> a version **transfers** it, and neither does composition. **A definition one owns
> serves directly as the basis of entitlement** — no fabricated self-grant is needed.

- **形态**：属性
- **出处**：[PF-001 §4 拥有、获权、选用](../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)（rev 17）
- **注意**：**实际作者与定义所有者分别记录**；作者用**租户身份**标识

### UL-usage-right · 使用权 · Usage Right

> **中**：**一个范围对一份[资产](capabilities-and-composition.md#ul-asset--资产--asset)有没有使用它的权利。**
> 定义者对自己的资产直接有；被[分享](#ul-asset-sharing--资产分享--asset-sharing)的一方（一个组织，或一个租户）从确认起有，
> 直到自己移除、分享方撤销、两个组织的隶属关系解除，或**分享的任一方是一个租户时，它的成员关系解除**。
> 它**不蕴含**所有权，也**不证明**节点已安装、agent 已激活或某次动作已获准。**个人与多个组织的使用权不自动叠加或相互借用。**
>
> **EN**: **Whether a scope is permitted to use an asset.** The definer has it outright;
> a recipient of sharing — an organization or a tenant — has it from confirmation until it removes the share, the sharer
> revokes it, the affiliation between the two organizations ends, or, **where either party to the share is a tenant,
> that tenant's membership ends**. It **entails no
> ownership**, and **proves nothing** about whether a node has installed it, an agent has
> been activated, or a particular action has been approved. **Usage rights held
> personally and through several organizations neither stack nor lend themselves to one
> another.**

- **形态**：属性
- **出处**：[PF-001 §4 拥有、获权、选用](../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用) · [§6.4](../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)（rev 17） · [PF-003 §6.10](../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有) · [§6.12](../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)（rev 5）
- **别混**：**论域只有资产。**[模型档案](capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)不是资产，一个范围允不允许某条档案由设置与权限的求值决定，不叫使用权
- **注意 ①**：**没有暂停，没有到期**——它只有「有」与「没有」（[C-15 的裁决](../conflicts.md#现有冲突)）
- **注意 ②**：**结束了就不复活**——关系断了又接上（重新隶属、重新加入），它不自己回来；要用，再分享一次，那是[新的一段分享关系](#ul-sharing-relationship--分享关系--sharing-relationship)

### UL-version-selection · 版本选用 · Version Selection

> **中**：**某个范围当前实际选了它的哪个版本。**
>
> **EN**: **Which version of it a given scope currently has selected.**

- **形态**：属性
- **出处**：[PF-001 §4 拥有、获权、选用](../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)（rev 17）
- **别混**：**裸写「选用 / selection」不作数**——它专指**选哪个版本**
- **注意**：它记在[持有](#ul-asset-holding--资产持有--asset-holding)上，**有两种：钉在某一版，或追随当前版**；不另说时追随当前版，而那是持有上写明、看得见的选择——新版一发布就用上，不算静默替换（[PF-002 flows §3.3](../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)）

### UL-revocation-is-not-stop · 撤销不等于强制停止 · Revocation Is Not a Stop

> **中**：角色变更、退出、撤权、撤销分享，影响的是**下一道尚未通过的准入**。
> **旧菜单、缓存与历史成功不能继续当作授权**；而**已经开始的调用是否停止，
> 由独立的运行控制决定**。
>
> **EN**: A role change, a departure, a revocation, a share being withdrawn
> — each affects **the next admission not yet granted**. **Stale menus, caches and
> past successes do not continue to serve as authorization**; and **whether a call
> already under way is stopped is decided by run control, separately.**

- **形态**：规则
- **出处**：[PF-001 §6.6](../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)（rev 17）
- **别混**：与[强制停止](agent-runtime-loop.md#ul-forced-stop--强制停止--forced-stop)**不是一件事**

## 一个范围手上有什么

### UL-asset-holding · 资产持有 · Asset Holding

> **中**：**一个范围与一份[资产](capabilities-and-composition.md#ul-asset--资产--asset)之间的持有关系，带一个启用/[禁用](#ul-asset-disable--资产禁用--asset-disable)标记**；
> 范围指组织、租户或[工作区](scope-and-resolution.md#ul-workspace--工作区--workspace)。
> 它是**配值资格的来源**——一层要为某资产配[设置](capabilities-and-composition.md#ul-setting--设置--setting)或
> [权限](capabilities-and-composition.md#ul-permission--权限--permission)，前提是它持有该资产；
> 它同时是那一层的设置与权限作为[属性投影](scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection)算出来时的定义域。
> **这一级为它配下的每一个值，就挂在这份持有上**（[属性配值](scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)）。
> **资格本身来自[拥有那个定义](#ul-definition-ownership--定义所有权--definition-ownership)或[获得使用权](#ul-usage-right--使用权--usage-right)**；
> 加入即产生，[移除](#ul-asset-removal--资产移除--asset-removal)即消失，**禁用不使它消失**。
>
> **EN**: The relation between a scope — an organization, a tenant or a workspace — and an
> asset it **holds**, **carrying an enabled/disabled flag**. It is **where the right to
> configure comes from**: a layer may set an asset's settings or permissions only if it holds
> that asset, and it is likewise the domain over which that layer's settings and permissions
> are projected. **Every value that level supplies hangs on this holding** (an attribute
> assignment). **The entitlement behind it comes from owning the definition or from a granted
> usage right.** It begins when the asset is added and ends when the asset is removed;
> **disabling does not end it.**

- **形态**：属性
- **出处**：[PF-002 §5.2 三方分工](../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值) · [PF-002 §6.4](../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作) · [PF-002 flows §3.1 一个资产在某个范围里](../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)（rev 20） · [PF-001 §6.1 层次](../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)（rev 17）
- **别混**：与[定义所有权](#ul-definition-ownership--定义所有权--definition-ownership)不是一回事——**持有的不一定是自己的**，[被分享来的](#ul-asset-sharing--资产分享--asset-sharing)照样持有。**裸写「持有」不作数**：正文也用它说「持有使用权」「持有待处理消息队列」
- **注意 ①**：正文**未述它靠什么标识**；工作区那一级持有的资产算不算[自定义件](#ul-customized-asset--自定义件--customized-asset)，正文没说。
  **工作区那一级照样配得了[禁用](#ul-asset-disable--资产禁用--asset-disable)**，
  **但只对它自己提供的那批资产生效**——这一条已经裁过了
- **注意 ②**：**配值跟着持有走。**移除，这份持有没了，挂在它上面的
  [属性配值](scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)**一起消失**；
  禁用，持有还在，**配的值一个不丢**
- **注意 ③**：**一层对一个[能力标识](scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)至多持有一份**——同一层可以有好几份同标识的资产，替代发生在持有上；
  持有上还记着[版本选用](#ul-version-selection--版本选用--version-selection)：钉在某一版，或追随当前版
- **注意 ④**：**把资产从租户范围提升到组织范围，只换所有者，不动任何一份持有**
  （[PF-001 §6.7](../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)）
- **注意 ⑤**：**形态是「属性」说的是它的所指，不是它的存储**——它是范围与资产之间的一层关系，
  [C-17](../conflicts.md#现有冲突) 已由产品负责人裁为属性；**它存不存成一条独立的记录、怎么标识，归系统架构设计**，不因此改变形态

### UL-usable-by · 谁可以使用它 · Usable By

> **中**：**每一类资产都有、而且是同一项的那一项[权限](capabilities-and-composition.md#ul-permission--权限--permission)：这份资产，哪些人够得着。**
> 取值是**一组[租户角色](subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role)，外加一个「自己」**；作者不另说时**只有「自己」**。
> 它与[禁用](#ul-asset-disable--资产禁用--asset-disable)一样挂在每一份[持有](#ul-asset-holding--资产持有--asset-holding)上。
> Skill 的「谁可以使用它」、Slash Command 的「谁可以用这个入口」，说的都是它。
>
> **EN**: **The one permission every asset category carries — the same one in each: who can reach this
> asset.** Its value is **a set of tenant roles plus "self"**; left unspecified by the author, it is
> **"self" alone**. Like disabling, it hangs on every holding. A skill's "who may use it" and a slash
> command's "who may use this entry point" are both this.

- **形态**：属性
- **出处**：[PF-002 §5.2「谁可以使用它」是各类资产共用的一项权限](../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限) ·
  [§4 Slash Command](../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) ·
  [§5.6 第 1 步](../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)（rev 20） ·
  [PF-007 §6.2](../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能)（rev 18）
- **别混**：**不是[使用权](#ul-usage-right--使用权--usage-right)**——使用权说的是**一个范围**对一份资产有没有使用的权利（定义者直接有、被分享方确认后有）；
  这一项是那份持有上配的「**这个范围里哪些人**能用」
- **注意 ①**：**「自己」在组织、租户持有的资产上指作者本人**；在工作区自带的资产上，指挂上那份工作区的租户本人
- **注意 ②**：**判下来这个人不能用的那一份，不装进他的会话**——它在替换次序上视为不存在，同标识退回下一层（资产求值第 1 步，与禁用同一段）；
  **official 那一份不受它管**。会话进行中被收回，**已经开始的运行不变，自下一次运行起不再装入**；斜杠命令是人的入口，此刻起就不存在
- **注意 ③**：**② 型斜杠命令展开的那个 skill，照样要过它自己的这一项**——入口的权限不替 skill 放权
- **注意 ④**：**权限项只有各类别列出的那些，作者不能另加**——没有哪一道关口去看的权限，只会让人以为有人守

## 来源

### UL-asset-origin · 资产来源 · Asset Origin

> **中**：一个资产是 **official** 还是 **customized**。
> **它不是独立于[作用域层](scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)的第三个维度，而是层次的体现**：
> 两者的关系就是**出厂默认层与其上各层在资产合成中的关系**，不需要另一套规则。
>
> **EN**: Whether an asset is **official** or **customized**. **It is not a third
> dimension alongside scope layers but an expression of them**: the relation between
> the two is simply that between the factory-default layer and the layers above it in
> asset composition — no separate rule set is needed.

- **形态**：属性
- **出处**：[PF-001 §4 来源](../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)（rev 17）
- **别混**：**裸写「来源」不作数**——它专指 official / customized 这个二分
- **注意**：来源**不能靠任意请求自报来冒充**

### UL-official-asset · 官方件 · Official Asset

> **中**：位于**出厂默认层**的资产，**是组装出一个 agent 的最小必需**。
> 它**不需要授权**，也**不可被禁用**——组织的超级管理员同样没有「不允许成员使用它」这项权力；
> **这不是一条可调整的权限设置，是结构性的。**
> 它可以被**同[能力标识](scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)的 customized 替代，但替代不是移除**。
>
> **EN**: An asset at the **factory-default layer**, constituting **the minimum
> required to assemble an agent at all**. It **requires no authorization** and
> **cannot be disabled** — not even by an organization's super administrator; **this
> is structural, not an adjustable permission setting.** It may be **substituted** by
> a customized asset bearing the same capability identifier, **but substitution is
> not removal**.

- **形态**：变体（父：[资产](capabilities-and-composition.md#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 来源](../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)（rev 17）
- **别混**：它**不是**「一批可以申请使用的官方资源」，**它是底座**——没有它，agent 组装不出来
- **注意**：资产求值的**下界**：每个 official 能力标识下都必须有东西，**任何层都不能把它清空**

### UL-customized-asset · 自定义件 · Customized Asset

> **中**：自定义来源的资产，位于组织级或租户级。它对 official **只有一种关系：替代**——
> 当两者能力标识相同时。它**需要授权**，**可以被禁用**。
>
> **EN**: An asset from a customized origin, at the organization or tenant layer. Its
> only relation to an official asset is **substitution**, and only when the two share
> a capability identifier. It **requires authorization** and **can be disabled**.

- **形态**：变体（父：[资产](capabilities-and-composition.md#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 来源](../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)（rev 17）
- **注意**：自定义来源**不会**因为被 agent 使用就给作者或该 agent 额外的行动权限——**资产决定组装，权限决定行动，两者不互相转化**

## 两个动作

> **你要不要让对方在关系结束之后还能用，决定了你该复制还是该分享。**

### UL-asset-copy · 资产复制 · Asset Copy

> **中**：**把自己拥有的某个资产的某一个已发布版本送出去，在另一个组织里建立或更新一份独立资产的动作。**
> 只有两条通则：**本人型**——同一个自然人的两个租户身份之间，源是他本人拥有的，落在他在另一个组织里的**租户级**
> （源在个人组织、而他是目标组织的超级管理员时，可改选那个组织的**组织级**）；
> **组织型**——同一棵隶属树上的两个团队组织之间，源是源组织组织级的，由源组织的超级管理员发起，落在目标组织的组织级。
> 五条性质：**跨主体的要对方确认，本人型不需要**（两侧都是他自己，发起就是同意）；**源保留**；
> **落下的那一份独立拥有**——落在哪一层就归谁；**此后各走各的**；**执行者在源与目标都有租户身份，只对本人型成立**。
>
> **EN**: **Sending one published version of an asset one owns, to create or update an independent
> asset in another organization.** Exactly two rules: **the personal form** — between two tenant
> identities of the same natural person, from an asset that person owns, landing at their **tenant
> level** in the other organization (or, when the source is in their personal organization and they
> are that organization's super administrator, optionally at its **organization level**); **the
> organizational form** — between two team organizations in the same affiliation tree, from the source
> organization's organization-level asset, initiated by its super administrator and landing at the
> target's organization level. Five properties: **across parties the other side must confirm; the
> personal form needs no confirmation** (both sides are the same person, so initiating is consenting);
> **the source remains**; **the copy is owned outright** — by whichever layer it lands in; **the two
> diverge from then on**; and **"the actor holds a tenant identity on both sides" holds for the
> personal form only**.

- **形态**：过程
- **出处**：[PF-003 §4 资产复制](../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制) ·
  [§6.2 谁能流向谁](../../product/PF-003-asset-transfer-and-sharing/design.md#62-谁能流向谁) ·
  [§6.3](../../product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份)（rev 5）
- **别混**：与[资产分享](#ul-asset-sharing--资产分享--asset-sharing)的根本分别——**复制交出一份所有权，分享只开放使用权**；
  交出所有权只在同一个人、或同树两个各由超管点头的组织之间发生，分享能到的对方更宽。
  **裸写「复制」不作数**——那个词到处都是
- **注意 ①**：**没有任何「链接」留下来。**很多人以为复制之后两边保持一致，**没有这回事**
- **注意 ②**：是首次还是重复，由[复制血缘](#ul-copy-lineage--复制血缘--copy-lineage)在**落进的那一层里**系统判定，**不由执行者选**
- **注意 ③**：**关系解除之后留着**
- **注意 ④**：**组织型在确认之前只是一份[复制通知](#ul-copy-notice--复制通知--copy-notice)，它会过期**；
  确认由落进那一层的管理者做——组织级是目标组织的超级管理员。**本人型不经过这一段**，不产生通知，也没有东西会过期
- **注意 ⑤**：**「本人型」「组织型」是两条通则的叫法，不是两个概念**——正文这样区分时，指的都是这一个动作；
  英文随定义写 **the personal form / the organizational form**（「本人型复制」= a personal-form asset copy）。
  两支只差在两侧是谁、落哪一层、由谁确认，身份机制与收场都没有各自的一套，**所以不另立词条，也不作变体**（变体只给对象，这一条是过程）
- **弃用**：~~「资产转移 / Asset Transfer」~~（旧 ID ~~`UL-asset-transfer`~~）、~~「转移」~~

### UL-asset-sharing · 资产分享 · Asset Sharing

> **中**：**把自己拥有的一个资产的使用权开放给另一方；对方确认之后，对方对它的使用权才建立。所有权不动。**
> 接收的一方有两种：**另一个组织**（同树两个团队组织之间，或两个个人组织之间），或**一个租户**——
> 本组织里的另一个成员（这一种叫**组织内分享**），或我自己在另一个组织里的租户（**本人型**，发起即生效、不需要第二个人确认）。
> 四条性质：**给的是获权不是拥有**；**要对方确认才成立**（本人型除外）；**被分享方不能改它**；**被分享方被动跟随**——
> 分享方发布了新版本，他用到的就是新版本。**不要求双方是同一个人。**
>
> **EN**: **Opening the usage right of an asset one owns to another party; that party's usage
> right comes into being only once it confirms. Ownership does not move.** The recipient is one
> of two kinds: **another organization** (two team organizations in the same affiliation tree, or
> two personal organizations), or **a tenant** — another member of one's own organization (**intra-
> organization sharing**), or one's own tenant in another organization (**the personal form**, which
> takes effect on initiation with no second person to confirm). Four properties: **what is granted
> is a usage right, not ownership**; **it takes effect only on the recipient's confirmation** (the
> personal form excepted); **the recipient cannot modify it**; and **the recipient follows
> passively** — when the sharer publishes a new version, that is what the recipient gets. **The two
> parties need not be the same person.**

- **形态**：过程
- **出处**：[PF-003 §4 分享](../../product/PF-003-asset-transfer-and-sharing/design.md#分享) · [§6.2 谁能流向谁](../../product/PF-003-asset-transfer-and-sharing/design.md#62-谁能流向谁) · [§6.10](../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有) · [§6.12](../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)（rev 5）
- **注意 ①**：**它成立后的那一段是一个对象——[分享关系](#ul-sharing-relationship--分享关系--sharing-relationship)**；结束的来路都写在那一条上：
  分享方撤销、被分享方移除、两个组织的隶属关系解除、任一方是租户时它的成员关系解除。**结束了不复活**——关系断了又接上，要用得再分享一次，那是新的一段。
  **确认之后的使用权没有到期，也没有暂停**
- **注意 ②**：**不可传递**——组织内分享来的、本人型分享来的同样不能再分享、复制出去或提升到组织级
- **注意 ③**：确认之前只是一份[分享邀请](#ul-sharing-invitation--分享邀请--sharing-invitation)，对方的可用集合里没有它；组织内分享的邀请就是分享邀请，同一条规则。
  确认由落进那一层的管理者做：接收方是组织的，由它的超级管理员（个人组织就是那个账号本人）；是租户的，由那个租户本人。
  **本人型不经过这一段**，不产生邀请
- **注意 ④**：**组织级的资产不需要组织内分享**——它在本组织里谁能用，归权限项[谁可以使用它](#ul-usable-by--谁可以使用它--usable-by)；
  **个人组织 → 团队的组织级只有复制，没有分享**
- **注意 ⑤**：**「组织内分享」「本人型分享」是按接收方是谁分出的两种情形的叫法，不是独立概念**——
  [正文说组织内分享「就是分享，不另立一套」](../../product/PF-003-asset-transfer-and-sharing/design.md#分享)；
  英文随定义写 **intra-organization sharing / the personal form**。它们与 flows §4 分格用的「跨组织分享」「个人间分享」一样，
  指的都是这一个动作，只是接收方、确认者与结束来路各占一格，**不另立词条，也不作变体**（变体只给对象，这一条是过程）

### UL-copy-lineage · 复制血缘 · Copy Lineage

> **中**：**目标侧那份资产与它的来源之间的对应关系：这一份是从哪个源复制过来的。**
> 它挂在落进**目标组织某一层**的那一份上——来源 → 目标组织那一层里的那一份。
> 一份资产**要么有一条，要么没有**——复制来的有，这个组织自己创作的没有；
> **因此一条血缘由它挂着的那份目标侧资产确定**。
> 它只用来回答一个问题：**再复制一次的时候，该更新目标组织那一层里的哪一份。**
> **层与层各算各的**：同一个来源在一个组织里可以有两份——某人租户级一份、组织级一份，各有各的血缘。
> **首次复制时产生，此后不变；不传递。**
>
> **EN**: **The correspondence between a copied asset and where it came from.** It hangs on the
> copy that landed **at one layer of the target organization** — source → that copy at that layer.
> An asset either carries one or carries none — copied assets carry one, locally authored assets do
> not — so **a lineage is pinned down by the target-side asset it hangs on**. It answers exactly
> one question: **on a repeat copy, which copy at that layer of the target organization to update.**
> **Layers are counted separately**: one source may have two copies in one organization — one at
> someone's tenant level, one at the organization level — each with a lineage of its own.
> **Created at the first copy, fixed thereafter, and it does not propagate.**

- **形态**：属性
- **出处**：[PF-003 §4 复制血缘](../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘) · [§6.5](../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制)（rev 5）
- **别混**：**不是 [registry 里那份血缘](../../registry/README.md)**（设计对象的新旧身份对应）。**裸写「血缘」不作数**
- **注意**：对目标组织**有意做得很浅**——能看到「由某租户在某时送进来第几版」，**看不到源资产本身**
- **弃用**：~~「转移血缘 / Transfer Lineage」~~（旧 ID ~~`UL-transfer-lineage`~~）

### UL-copy-notice · 复制通知 · Copy Notice

> **中**：**一次组织型[资产复制](#ul-asset-copy--资产复制--asset-copy)发起之后、目标组织的超级管理员确认之前，悬在接收方那边的那一份邀约。**
> 发起时可以指定这一份的有效时长；不指定按这一类的默认时长。它**可被发起方撤回**、**会到期**、
> **它指向的那份资产不存在了就随即过期**——三种收场相同：**结束，什么都没建立**，不可再确认；
> 重新发起产生的是**新的一份**，不是它的复活。确认了，目标组织那一层新增或更新一份资产。
> **本人型复制不产生它。**它是一个对象：接收方看得见每一份、确认的是那一份。
>
> **EN**: **The offer hanging on the receiving side from the moment an organizational asset copy
> is initiated until the target organization's super administrator confirms it.** The issuer may
> set this one notice's validity period when issuing it; otherwise the kind's default applies. It
> **may be withdrawn by the issuer**, **expires**, and **expires at once if the asset it points at
> ceases to exist** — the three endings are identical: **ended, nothing established**, no longer
> confirmable; issuing again produces **a new notice**, not a revival. Confirmed, a copy is created
> or updated at that layer of the target organization. **A personal-form copy produces none.** It
> is an object: the recipient sees each one, and what gets confirmed is that one.

- **形态**：对象
- **出处**：[PF-003 §6.14 待确认的复制通知与分享邀请会过期](../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期) ·
  [§4 资产复制](../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制) ·
  [PF-003 flows §3.4](../../product/PF-003-asset-transfer-and-sharing/flows.md#34-一份待确认的邀约复制通知与分享邀请同形)（rev 5）
- **别混**：**不是[分享邀请](#ul-sharing-invitation--分享邀请--sharing-invitation)**——两者同形（可撤回、会过期、带时长、再发是新的一份），
  但确认落下的东西不同：这一个落下一份资产，那一个建立一段使用权。也**不是[邀请](subjects-and-ownership.md#ul-invitation--邀请--invitation)**（那是加入组织的）
- **注意 ①**：**正文未述它靠什么标识**；只写明逐份可辨——接收方看得见每一份，重新发起的是新的一份
- **注意 ②**：**过期与撤回效果相同，来路不同**——撤回是发起方主动收回，过期是时间或资产的消失替他收回
- **弃用**：~~「待确认的复制通知」~~作为概念名——「待确认」是它的状态，不进名字；正文这么写时指的就是它

### UL-sharing-invitation · 分享邀请 · Sharing Invitation

> **中**：**一次[资产分享](#ul-asset-sharing--资产分享--asset-sharing)发起之后、接收方确认之前，悬在接收方那边的那一份邀约。**
> 接收方是组织的，由它的超级管理员确认（个人组织就是那个账号本人）；是租户的，由那个租户本人确认——组织内分享的邀请就是它。
> 发起时可以指定这一份的有效时长；不指定按这一类的默认时长。它**可被分享方撤回**、**会到期**、
> **它指向的那份资产不存在了就随即过期**——三种收场相同：**结束，什么都没建立**，不可再确认；
> 重新发起产生的是**新的一份**。确认了，[分享关系](#ul-sharing-relationship--分享关系--sharing-relationship)进入分享中、使用权建立。
> **本人型分享不产生它。**
>
> **EN**: **The offer hanging on the receiving side from the moment an asset share is initiated
> until the recipient confirms it.** An organization confirms through its super administrator (for
> a personal organization, the account itself); a tenant confirms in person — the invitation of an
> intra-organization share is one of these. The sharer may set this one invitation's validity
> period when issuing it; otherwise the kind's default applies. It **may be withdrawn by the
> sharer**, **expires**, and **expires at once if the asset it points at ceases to exist** — the
> three endings are identical: **ended, nothing established**, no longer confirmable; issuing again
> produces **a new invitation**. Confirmed, the sharing relationship enters "sharing" and the usage
> right comes into being. **A personal-form share produces none.**

- **形态**：对象
- **出处**：[PF-003 §6.14 待确认的复制通知与分享邀请会过期](../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期) ·
  [§4 分享](../../product/PF-003-asset-transfer-and-sharing/design.md#分享) ·
  [PF-003 flows §3.4](../../product/PF-003-asset-transfer-and-sharing/flows.md#34-一份待确认的邀约复制通知与分享邀请同形)（rev 5）
- **别混**：**不是[邀请](subjects-and-ownership.md#ul-invitation--邀请--invitation)**——那是加入组织的邀约，接受产生租户；这一份接受建立的是使用权。
  正文在没有歧义处写「邀请」指前者，指这一个时一律带「分享」
- **注意 ①**：**正文未述它靠什么标识**；只写明逐份可辨
- **注意 ②**：它与[分享关系](#ul-sharing-relationship--分享关系--sharing-relationship)的「待确认」是同一段时间的两个视角：
  正文把这一段既画在邀约的状态机上（flows §3.4），也画在分享关系的状态机上（flows §3.2）；**待确认那一段有没有第二份记录，正文未述**
- **弃用**：~~「待确认的分享邀请」~~作为概念名——「待确认」是它的状态，不进名字

### UL-sharing-relationship · 分享关系 · Sharing Relationship

> **中**：**一次[资产分享](#ul-asset-sharing--资产分享--asset-sharing)在分享方与接收方之间立起来的那一段：待确认 → 分享中 → 结束。**
> 分享中，接收方用的是分享方当前发布的那一版、能配自己那层的值、不能改内容。
> **结束的来路**：分享方撤销、被分享方移除、两个组织的隶属关系解除、任一方是租户时它的成员关系解除；
> 待确认那一段另有三个出口（撤回、到期、资产不存在了），同样到结束、不曾建立过使用权。
> **结束是终点，不复活**——关系断了又接上，这一段不回来；再分享一次产生的是**新的一段**。
> 本人型分享发起即进入分享中，没有待确认那一段。
>
> **EN**: **The stretch an asset share establishes between sharer and recipient: pending →
> sharing → ended.** While sharing, the recipient uses whatever version the sharer currently
> publishes, may configure its own layer's values, and cannot edit the content. **It ends** when
> the sharer revokes, the recipient removes, the affiliation between the two organizations ends,
> or — where either party is a tenant — that tenant's membership ends; the pending stretch has three
> further exits (withdrawal, expiry, the asset ceasing to exist), all likewise reaching "ended"
> without any usage right ever having existed. **Ended is final and never revives** — a broken
> relationship that is later restored does not bring it back; sharing again produces **a new one**.
> A personal-form share enters "sharing" on initiation, with no pending stretch.

- **形态**：对象
- **出处**：[PF-003 flows §3.2 一段分享关系](../../product/PF-003-asset-transfer-and-sharing/flows.md#32-一段分享关系) ·
  [PF-003 §6.12](../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后) ·
  [§6.10](../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)（rev 5）
- **别混**：**不是[使用权](#ul-usage-right--使用权--usage-right)**——使用权是接收方对那份资产的一项权利状态（有 / 没有），
  由这一段的「分享中」带来；这一段是被逐份指认、有自己生灭的那个东西。也**不是[资产分享](#ul-asset-sharing--资产分享--asset-sharing)**——那是动作，这是动作立起来的东西
- **注意 ①**：**正文未述它靠什么标识**；只写明「再分享一次是新的一段」，即同一对当事人、同一份资产可以先后有两段
- **注意 ②**：**分享中没有别的状态**——不过期，也没有暂停；要暂时不让对方用，就撤销，要用再分享一次
- **注意 ③**：结束**向后生效**，不回溯已经发生的事，也[不强停正在运行的工作](#ul-revocation-is-not-stop--撤销不等于强制停止--revocation-is-not-a-stop)
- **弃用**：~~「一段分享关系」~~作为概念名——正文这么写时指的就是它的一个实例

## 两个不能合并的收回动作

> **判据是：收回持有，还是暂时关掉。**
> **两者对 agent 是同一个结果：都不可见。**

### UL-asset-removal · 资产移除 · Asset Removal

> **中**：让**该资产不再被这个范围[持有](#ul-asset-holding--资产持有--asset-holding)**，
> **为它配的值随之消失**。agent 装不上，**也不知道有这回事**——
> 成员问起，它只能说做不到，**说不出为什么**。
>
> **EN**: Making an asset **no longer held by this scope**, **discarding the values
> configured for it**. The agent cannot assemble it **and does not know it exists** —
> asked about it, the agent can only say it cannot, **without being able to say why**.

- **形态**：过程
- **出处**：[PF-002 §6.4](../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)（rev 20）
- **别混**：与[资产禁用](#ul-asset-disable--资产禁用--asset-disable)**在 agent 那一侧看不出差别**，差的是**配置还在不在、还能不能开回来**
- **注意**：**这个范围往后不要这份资产了 → 用这个**

### UL-asset-disable · 资产禁用 · Asset Disable

> **中**：**每份[持有](#ul-asset-holding--资产持有--asset-holding)的资产上的一项布尔设置**，
> 每个归属层各配各的；为真则这份资产在[装配](agent-runtime-loop.md#ul-agent-assembly--agent-装配--agent-assembly)时
> **对这个范围不可见**，**而持有不解除、配的值原样保留**。
> **合成语义是析取：任一层为真即为真**，本层改回假只去得掉本层那一个真，
> **下层开不回上层禁的**。**[工作区](scope-and-resolution.md#ul-workspace--工作区--workspace)那一级是个例外：
> 它配的值只对它自己提供的那批资产生效**，别的层提供的资产，它的值不参与析取。
>
> **EN**: **A boolean setting on each held asset**, configured independently at every
> ownership layer. When true, the asset is **invisible to that scope at assembly time**,
> **without releasing the holding and leaving its configured values untouched**. **The layers
> compose by disjunction: true at any layer makes it true**; setting it back to false only
> clears that layer's own true, and **a lower layer cannot re-enable what a higher one
> disabled**. **The workspace layer is the one exception: the value it sets applies only to the
> assets the workspace itself provides**, and does not enter the disjunction for assets provided
> by any other layer.

- **形态**：属性
- **出处**：[PF-002 §6.4](../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作) · [§6.4 禁用是逐层配的布尔设置](../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)（rev 20）
- **注意**：被禁的那份持有**在替换次序上视为不存在，同标识退回下一层**——
  工作区借「同名替换再禁用」藏不掉租户的资产
- **别混**：与[当下可用性](reach-and-availability.md#ul-current-availability--当下可用性--current-availability)不是一回事——
  **禁用是不可见，不可用是可见但用了一定失败**
- **注意**：**只是这一阵不让用、将来还要开回来 → 用这个**。成员据以知道去申请的是**设置页**，不是 agent 的回答

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)

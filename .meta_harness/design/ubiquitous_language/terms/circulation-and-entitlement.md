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
- **出处**：[PF-001 §4 拥有、获权、选用](../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)（rev 15）
- **注意**：**实际作者与定义所有者分别记录**；作者用**租户身份**标识

### UL-usage-right · 使用权 · Usage Right

> **中**：**一个范围对一份[资产](capabilities-and-composition.md#ul-asset--资产--asset)有没有使用它的权利。**
> 定义者对自己的资产直接有；被[分享](#ul-asset-sharing--资产分享--asset-sharing)的一方从确认起有，
> 直到自己移除、分享方撤销或隶属关系解除。它**不蕴含**所有权，也**不证明**节点已安装、
> agent 已激活或某次动作已获准。**个人与多个组织的使用权不自动叠加或相互借用。**
>
> **EN**: **Whether a scope is permitted to use an asset.** The definer has it outright;
> a recipient of sharing has it from confirmation until it removes the share, the sharer
> revokes it, or the affiliation between the organizations ends. It **entails no
> ownership**, and **proves nothing** about whether a node has installed it, an agent has
> been activated, or a particular action has been approved. **Usage rights held
> personally and through several organizations neither stack nor lend themselves to one
> another.**

- **形态**：属性
- **出处**：[PF-001 §4 拥有、获权、选用](../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用) · [§6.4](../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)（rev 15） · [PF-003 §6.10](../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)（rev 4）
- **别混**：**论域只有资产。**[模型档案](capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)不是资产，一个范围允不允许某条档案由设置与权限的求值决定，不叫使用权
- **注意**：**没有暂停，没有到期**——它只有「有」与「没有」（[C-15 的裁决](../conflicts.md#现有冲突)）

### UL-version-selection · 版本选用 · Version Selection

> **中**：**某个范围当前实际选了它的哪个版本。**
>
> **EN**: **Which version of it a given scope currently has selected.**

- **形态**：属性
- **出处**：[PF-001 §4 拥有、获权、选用](../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)（rev 15）
- **别混**：**裸写「选用 / selection」不作数**——它专指**选哪个版本**

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
- **出处**：[PF-001 §6.6](../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)（rev 15）
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
- **出处**：[PF-002 §5.2 三方分工](../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值) · [PF-002 §6.4](../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作) · [PF-002 flows §3.1 一个资产在某个范围里](../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)（rev 13） · [PF-001 §6.1 层次](../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)（rev 15）
- **别混**：与[定义所有权](#ul-definition-ownership--定义所有权--definition-ownership)不是一回事——**持有的不一定是自己的**，[被分享来的](#ul-asset-sharing--资产分享--asset-sharing)照样持有。**裸写「持有」不作数**：正文也用它说「持有使用权」「持有待处理消息队列」
- **注意 ①**：正文**未述它靠什么标识**；工作区那一级持有的资产算不算[自定义件](#ul-customized-asset--自定义件--customized-asset)，正文没说。
  **工作区那一级照样配得了[禁用](#ul-asset-disable--资产禁用--asset-disable)**，
  **但只对它自己提供的那批资产生效**——这一条已经裁过了
- **注意 ②**：**配值跟着持有走。**移除，这份持有没了，挂在它上面的
  [属性配值](scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)**一起消失**；
  禁用，持有还在，**配的值一个不丢**

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
- **出处**：[PF-001 §4 来源](../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)（rev 15）
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
- **出处**：[PF-001 §4 来源](../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)（rev 15）
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
- **出处**：[PF-001 §4 来源](../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)（rev 15）
- **注意**：自定义来源**不会**因为被 agent 使用就给作者或该 agent 额外的行动权限——**资产决定组装，权限决定行动，两者不互相转化**

## 两个动作

> **你要不要让对方在关系结束之后还能用，决定了你该复制还是该分享。**

### UL-asset-copy · 资产复制 · Asset Copy

> **中**：**一个人把自己拥有的某个资产的某一个已发布版本发给他的另一个租户所在的组织，
> 那个组织确认之后，在它里面建立或更新一份独立的资产。**五条性质：执行者在源与目标**都有租户身份**；
> **要目标组织确认才发生**；**源保留**；**目标独立拥有**；**此后各走各的**。
>
> **EN**: **Sending one published version of an asset the actor owns to the organization
> of another tenant identity of that same person, which — once that organization
> confirms — creates or updates an independent copy there.** Five properties: the actor
> **holds a tenant identity on both sides**; **nothing happens until the target
> organization confirms**; **the source remains**; **the target owns its copy outright**;
> and **the two diverge from then on**.

- **形态**：过程
- **出处**：[PF-003 §4 资产复制](../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制)（rev 4）
- **别混**：与[资产分享](#ul-asset-sharing--资产分享--asset-sharing)的根本分别——**复制是身份之间的搬运，分享是主体之间的授权**；两者都要对方确认。
  **裸写「复制」不作数**——那个词到处都是
- **注意 ①**：**没有任何「链接」留下来。**很多人以为复制之后两边保持一致，**没有这回事**
- **注意 ②**：是首次还是重复，由[复制血缘](#ul-copy-lineage--复制血缘--copy-lineage)**系统判定，不由执行者选**
- **注意 ③**：**关系解除之后留着**
- **注意 ④**：**确认之前只是一份待确认的复制通知，它会过期**——**这一类有自己的默认时长，
  而发起时发起方可以指定这一份的**；**被它指向的那份资产不在了，它随即自动过期**。过期之后确认不了，发起方可以重新发起
- **弃用**：~~「资产转移 / Asset Transfer」~~（旧 ID ~~`UL-asset-transfer`~~）、~~「转移」~~

### UL-asset-sharing · 资产分享 · Asset Sharing

> **中**：**邀请另一个组织使用自己拥有的一个资产；对方确认之后，对方对它的使用权才建立。所有权不动。**
> 四条性质：**给的是获权不是拥有**；**要对方确认才成立**；**被分享方不能改它**；**被分享方被动跟随**——
> 分享方发布了新版本，他用到的就是新版本。**不要求双方是同一个人。**
>
> **EN**: **Inviting another organization to use an asset one owns; the recipient's usage
> right comes into being only once it confirms. Ownership does not move.** Four
> properties: **what is granted is a usage right, not ownership**; **it takes effect only
> on the recipient's confirmation**; **the recipient cannot modify it**; and **the
> recipient follows passively** — when the sharer publishes a new version, that is what
> the recipient gets. **The two parties need not be the same person.**

- **形态**：过程
- **出处**：[PF-003 §4 分享](../../product/PF-003-asset-transfer-and-sharing/design.md#分享) · [§6.10](../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)（rev 4）
- **注意 ①**：**关系解除之后失效**；分享方撤销、被分享方移除同样让它结束。**确认之后的使用权没有到期，也没有暂停**
- **注意 ②**：**不可传递**
- **注意 ③**：确认之前只是一份待确认的分享邀请，对方的可用集合里没有它。
  **这份邀请会过期**——**这一类有自己的默认时长，而发起时分享方可以指定这一份的**；
  **被它指向的那份资产不在了，它随即自动过期**。
  过期之后确认不了，分享方可以重新发起

### UL-copy-lineage · 复制血缘 · Copy Lineage

> **中**：**目标侧那份资产与它的来源之间的对应关系：这一份是从哪个源复制过来的。**
> 一份资产**要么有一条，要么没有**——复制来的有，这个组织自己创作的没有；
> **因此一条血缘由它挂着的那份目标侧资产确定**。
> 它只用来回答一个问题：**再复制一次的时候，该更新目标组织里的哪一份。**
> **首次复制时产生，此后不变；不传递。**
>
> **EN**: **The correspondence between a copied asset and where it came from.** An asset
> either carries one or carries none — copied assets carry one, locally authored assets do
> not — so **a lineage is pinned down by the target-side asset it hangs on**. It answers exactly
> one question: **on a repeat copy, which copy in the target organization to update.**
> **Created at the first copy, fixed thereafter, and it does not propagate.**

- **形态**：属性
- **出处**：[PF-003 §4 复制血缘](../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘)（rev 4）
- **别混**：**不是 [registry 里那份血缘](../../registry/README.md)**（设计对象的新旧身份对应）。**裸写「血缘」不作数**
- **注意**：对目标组织**有意做得很浅**——能看到「由某租户在某时送进来第几版」，**看不到源资产本身**
- **弃用**：~~「转移血缘 / Transfer Lineage」~~（旧 ID ~~`UL-transfer-lineage`~~）

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
- **出处**：[PF-002 §6.4](../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)（rev 13）
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
- **出处**：[PF-002 §6.4](../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作) · [§6.4 禁用是逐层配的布尔设置](../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)（rev 13）
- **注意**：被禁的那份持有**在替换次序上视为不存在，同标识退回下一层**——
  工作区借「同名替换再禁用」藏不掉租户的资产
- **别混**：与[当下可用性](reach-and-availability.md#ul-current-availability--当下可用性--current-availability)不是一回事——
  **禁用是不可见，不可用是可见但用了一定失败**
- **注意**：**只是这一阵不让用、将来还要开回来 → 用这个**。成员据以知道去申请的是**设置页**，不是 agent 的回答

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)

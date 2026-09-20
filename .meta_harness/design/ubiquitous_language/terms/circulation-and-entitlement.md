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

- **出处**：[PF-001 §4 拥有、获权、选用](../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)（rev 6）
- **注意**：**实际作者与定义所有者分别记录**；作者用**租户身份**标识

### UL-usage-right · 使用权 · Usage Right

> **中**：**谁被允许使用它。**它**不蕴含**所有权，也**不证明**节点已安装、
> agent 已激活或某次动作已获准。**个人与多个组织的使用权不自动叠加或相互借用。**
>
> **EN**: **Who is permitted to use it.** It **entails no ownership**, and **proves
> nothing** about whether a node has installed it, an agent has been activated, or a
> particular action has been approved. **Usage rights held personally and through
> several organizations neither stack nor lend themselves to one another.**

- **出处**：[PF-001 §4 拥有、获权、选用](../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用) · [§6.4](../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)（rev 6）

### UL-version-selection · 版本选用 · Version Selection

> **中**：**某个范围当前实际选了它的哪个版本。**
>
> **EN**: **Which version of it a given scope currently has selected.**

- **出处**：[PF-001 §4 拥有、获权、选用](../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)（rev 6）
- **别混**：**裸写「选用 / selection」不作数**——它专指**选哪个版本**

### UL-revocation-is-not-stop · 撤销不等于强制停止 · Revocation Is Not a Stop

> **中**：角色变更、退出、撤权、使用权暂停或到期，影响的是**下一道尚未通过的准入**。
> **旧菜单、缓存与历史成功不能继续当作授权**；而**已经开始的调用是否停止，
> 由独立的运行控制决定**。
>
> **EN**: A role change, a departure, a revocation, a suspended or expired usage right
> — each affects **the next admission not yet granted**. **Stale menus, caches and
> past successes do not continue to serve as authorization**; and **whether a call
> already under way is stopped is decided by run control, separately.**

- **出处**：[PF-001 §6.6](../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)（rev 6）
- **别混**：与[强制停止](agent-runtime-loop.md#ul-forced-stop--强制停止--forced-stop)**不是一件事**

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

- **出处**：[PF-001 §4 来源](../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)（rev 6）
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

- **出处**：[PF-001 §4 来源](../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)（rev 6）
- **别混**：它**不是**「一批可以申请使用的官方资源」，**它是底座**——没有它，agent 组装不出来
- **注意**：资产求值的**下界**：每个 official 能力标识下都必须有东西，**任何层都不能把它清空**

### UL-customized-asset · 自定义件 · Customized Asset

> **中**：自定义来源的资产，位于组织级或租户级。它对 official **只有一种关系：替代**——
> 当两者能力标识相同时。它**需要授权**，**可以被禁用**。
>
> **EN**: An asset from a customized origin, at the organization or tenant layer. Its
> only relation to an official asset is **substitution**, and only when the two share
> a capability identifier. It **requires authorization** and **can be disabled**.

- **出处**：[PF-001 §4 来源](../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)（rev 6）
- **注意**：自定义来源**不会**因为被 agent 使用就给作者或该 agent 额外的行动权限——**资产决定组装，权限决定行动，两者不互相转化**

## 两个动作

> **你要不要让对方在关系结束之后还能用，决定了你该转移还是该分享。**

### UL-asset-transfer · 资产转移 · Asset Transfer

> **中**：**把一个人自己拥有的某个资产的某一个已发布版本，在他的另一个租户所在的组织里，
> 建立或更新一份独立的资产。**四条性质：执行者在源与目标**都有租户身份**；
> **源保留**；**目标独立拥有**；**此后各走各的**。
>
> **EN**: **Creating or updating an independent copy of an asset — at one published
> version, owned by the actor — inside the organization of another tenant identity of
> that same person.** Four properties: the actor **holds a tenant identity on both
> sides**; **the source remains**; **the target owns its copy outright**; and **the
> two diverge from then on**.

- **出处**：[PF-003 §4 转移](../../product/PF-003-asset-transfer-and-sharing/design.md#转移)（rev 1）
- **别混**：与[资产分享](#ul-asset-sharing--资产分享--asset-sharing)的根本分别——**转移是身份之间的搬运，分享是主体之间的授权**
- **注意 ①**：**没有任何「链接」留下来。**很多人以为转移之后两边保持一致，**没有这回事**
- **注意 ②**：是首次还是重复，由[转移血缘](#ul-transfer-lineage--转移血缘--transfer-lineage)**系统判定，不由执行者选**
- **注意 ③**：**关系解除之后留着**

### UL-asset-sharing · 资产分享 · Asset Sharing

> **中**：**把自己拥有的一个资产，授予另一个组织使用。所有权不动。**
> 三条性质：**给的是获权不是拥有**；**被分享方不能改它**；**被分享方被动跟随**——
> 分享方发布了新版本，他用到的就是新版本。**不要求双方是同一个人。**
>
> **EN**: **Granting another organization the use of an asset one owns. Ownership does
> not move.** Three properties: **what is granted is a usage right, not ownership**;
> **the recipient cannot modify it**; and **the recipient follows passively** — when
> the sharer publishes a new version, that is what the recipient gets. **The two
> parties need not be the same person.**

- **出处**：[PF-003 §4 分享](../../product/PF-003-asset-transfer-and-sharing/design.md#分享)（rev 1）
- **注意 ①**：**关系解除之后失效**
- **注意 ②**：**不可传递**

### UL-transfer-lineage · 转移血缘 · Transfer Lineage

> **中**：**目标侧那份资产与它的来源之间的对应关系：这一份是从哪个源转过来的。**
> 它只用来回答一个问题：**再转一次的时候，该更新目标组织里的哪一份。**
> **首次转移时产生，此后不变；不传递。**
>
> **EN**: **The correspondence between a transferred asset and where it came from.**
> It answers exactly one question: **on a repeat transfer, which copy in the target
> organization to update.** **Created at the first transfer, fixed thereafter, and it
> does not propagate.**

- **出处**：[PF-003 §4 血缘](../../product/PF-003-asset-transfer-and-sharing/design.md#血缘)（rev 1）
- **别混**：**不是 [registry 里那份血缘](../../registry/README.md)**（设计对象的新旧身份对应）。**裸写「血缘」不作数**
- **注意**：对目标组织**有意做得很浅**——能看到「由某租户在某时转入了第几版」，**看不到源资产本身**

## 两个不能合并的收回动作

> **判据是：成员该不该知道它存在。**

### UL-asset-removal · 资产移除 · Asset Removal

> **中**：让**该资产不再被这个组织持有**。agent 装不上，**也不知道有这回事**——
> 成员问起，它只能说做不到，**说不出为什么**。
>
> **EN**: Making an asset **no longer held by this organization**. The agent cannot
> assemble it **and does not know it exists** — asked about it, the agent can only say
> it cannot, **without being able to say why**.

- **出处**：[PF-002 §6.4](../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)（rev 2）
- **注意**：**不想让成员知道这个能力存在 → 用这个**

### UL-asset-disable · 资产禁用 · Asset Disable

> **中**：**资产还在，但权限被收窄为空集**。agent 装上了，一调就被拒，
> 而它**能说明「这项被组织关掉了」**——成员因此知道可以去申请。
>
> **EN**: **The asset remains, but its permission set is narrowed to empty.** The agent
> assembles it and is refused on invocation, **and can say that the organization has
> turned it off** — so the member knows an appeal is possible.

- **出处**：[PF-002 §6.4](../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)（rev 2）
- **注意**：**想让成员知道并且可以申请 → 用这个**

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)

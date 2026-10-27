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
- **出处**：[PF-001 §6.1 层次](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)（rev 26） · [PF-002 §5.8 三条层序](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)（rev 32）
- **别混 ①**：**账号不在这四层里**——它的[求值是恒等的](#ul-scope-evaluation--作用域求值--scope-evaluation)，不占一格
- **别混 ②**：[上级组织](subjects-and-ownership.md#ul-parent-organization--上级组织--parent-organization)**不进这四层**——否则层数会随隶属链变化，且把「隶属」悄悄变成「被管辖」
- **别混 ③**：**裸写「层」不作数。**系统里到处是层
- **别混 ④**：**不是[资产归属](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)那条层序**——那条答「这份资产是谁的、谁替换得了谁」，是 official < 组织 < 租户 < 工作区。那条层序上的一格叫[来源层](#ul-source-layer--来源层--source-layer)
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
- **出处**：[PF-001 §6.1 层次](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)（rev 26） · [PF-002 §5.8 它不因此多一重身份](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份)（rev 32）
- **别混 ①**：**不是[作用域层](#ul-scope-layer--作用域层--scope-layer)本身**——层是那一格，层身份是**占着那一格的那个对象**
- **别混 ②**：**[工作区](#ul-workspace--工作区--workspace)不在其列。**它[不是一重身份](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份)，只在**设置**与**资产归属**两条层序上各占一格；它**挂在租户下**
- **别混 ③**：**[账号](subjects-and-ownership.md#ul-account--账号--account)不充当任何一格**——它的[求值是恒等的](#ul-scope-evaluation--作用域求值--scope-evaluation)，早已完成，也不接受任何配置
- **⚠️ 注意**：**出厂默认那一格没有身份对象。**读成「每一层都有一个身份主体」，就会给系统那一格**编一个出来**；它的内容是 official 资产与它们声明的默认值，[任何层不得清空](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)

### UL-source-layer · 来源层 · Source Layer

> **中**：资产归属层序上的一格：官方、组织、租户或工作区，四选一。
> 这条层序回答「这份资产由哪一层持有、谁替换得了谁」，由低到高是官方、组织、租户、工作区。
> 一份工具贡献的来源层取自核验过的授权依据，不取自登记者自报的租户；登记者的租户只用来核验它有没有资格在这一层登记。
>
> **EN**: One position on the asset-ownership order: official, organization, tenant or
> workspace. This order answers "which layer holds this asset, and who can stand in for whom",
> from lowest to highest: official, organization, tenant, workspace. The source layer of a tool
> contribution comes from its verified authority, not from the tenant that the registrant
> states. The registrant's tenant only shows whether it may register at that layer.

- **形态**：属性
- **出处**：[PF-002 §5.8 三条层序](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)（rev 32）；层名与登记键见已采用的 [RFC-0012 绑定登记表](../../../../docs/rfcs/RFC-0012-tool-dynamics.md#绑定登记表g7)
- **别混 ①**：不是[作用域层](#ul-scope-layer--作用域层--scope-layer)。作用域层是身份带来的层级（出厂默认、组织、租户、会话），权限按它合成。来源层没有会话一格，多了工作区一格；官方一格装的是出厂内容，但它不是一重身份
- **别混 ②**：不是[资产来源](circulation-and-entitlement.md#ul-asset-origin--资产来源--asset-origin)。资产来源只分 official 与 customized；来源层把 customized 再分成组织、租户与工作区三格
- **注意 ①**：Tool 的登记键由来源层、能力身份与资产版本组成。按记下的形状解析同形贡献时，系统只核访问，不做层序选择：官方层对任何合法租户开放，组织层要求同一组织，租户层要求同一租户，工作区层要求当前获授该工作区
- **注意 ②**：层序求值本身归资产与装配，不归 Tool

### UL-workspace · 工作区 · Workspace

> **中**：带有自身身份、跨会话持续的完整资源聚合包。Omne Host 托管工作区有一个治理所有者租户，也可以通过[租户—工作区关系](subjects-and-ownership.md#ul-tenant-workspace-relation--租户工作区关系--tenantworkspace-relation)授权其他租户参与；登记外部仓库的工作区不设 Omne 治理所有者，首次登记者与后来接入的租户都是参与者，登记不取得外部资源所有权或额外写权限。
> 它可以聚合文件、代码、数据、知识和自定义资产，访问它的 agent 类型可以不同；它不绑定一个固定目标，
> 也不是会话、agent、本地目录或执行环境边界。工作区可以有多个[工作区地址](#ul-workspace-address--工作区地址--workspace-address)，
> 并在部署节点上被装载为多个[工作区实例](#ul-workspace-instance--工作区实例--workspace-instance)。
> 工作区实例中的资产进入 PF-002 定义的工作区资产层：设置和资产可以按层求值，权限、落点与身份类及治理类例外
> 不从工作区放宽。

> **EN**: An identity-bearing, persistent resource aggregate that spans sessions. An Omne Host workspace has one tenant with governance ownership and may authorize other tenants to participate. A registered external repository has no Omne governance owner: both its first registrant and later tenants are participants, and registration grants neither external-resource ownership nor additional write permission. It may contain files, code, data, knowledge, and custom assets; it has no fixed goal and is neither a session, agent, local directory, nor execution boundary. A workspace may have multiple addresses and multiple materialized instances. Assets from its instance enter the PF-002 workspace asset layer, while permissions and placement/identity governance cannot be widened from the workspace.

- **形态**：对象
- **出处**：[PF-020](../../product.0.0.1.legacy/PF-020-workspace/design.md)（rev 22） · [PF-002 工作区资产层](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#工作区)（rev 32）
- **别混**：地址和实例是它的访问与装载关系，不是另一个工作区；目录只是一个可能的地址/本地承载。
- **资产层规则**：工作区提供的自定义资产仍遵循 PF-002 的设置覆盖、同标识替换、权限过滤和禁用规则。
- **内容来源**：实例下的[共享目录](#ul-workspace-shared-directory--工作区共享目录--workspace-shared-directory)与[本地目录](#ul-workspace-local-directory--工作区本地目录--workspace-local-directory)是同一工作区层的两个来源，不是两份工作区。组织的[参与限制](#ul-workspace-participation-restriction--工作区参与限制--workspace-participation-restriction)与工作区访问授权分别成立。

### UL-workspace-instance · 工作区实例 · Workspace Instance

> **中**：一个工作区在某个部署节点上被装载或物化后、供会话和 agent 读写资源的具体工作入口。实例不固定归属于一个租户，可被多个租户的会话使用，关系与治理条件在各会话装配时按其租户身份求值。
> 实例也可在用户显式选择后，从已有的本地目录登记并接入，不要求由 Omne 下载资源后才产生。一个工作区可以有多个实例；实例独立于会话存活，可以先于会话存在，会话结束不自动卸载实例，实例卸载不等于工作区消失；不用时可不再附着，中心存储中的工作区销毁不连带清理本地实例。精确身份与状态转换仍待定义。

> **EN**: A materialized realization of a workspace on a deployment node through which a session and agent read and write resources. It is not bound to one tenant: sessions of multiple tenants may use it, with relations and governance evaluated for each session tenant during assembly. An instance may also be adopted from an existing local directory after an explicit user choice, without requiring Omne to download its resources. One workspace may have multiple instances. An instance has a lifecycle independent of sessions: it may exist before a session, and ending a session does not automatically unload it. Unloading an instance does not delete the workspace. An unused local instance need not be attached again, and destroying the centrally stored workspace does not trigger cleanup of local instances. Exact identity and state transitions remain open.

- **形态**：对象
- **出处**：[PF-020 工作区实例](../../product.0.0.1.legacy/PF-020-workspace/design.md)（rev 22）
- **未定**：实例的精确身份、并发和终止状态由 PF-020 后续修订决定。

### UL-workspace-attachment · 工作区附着 · Workspace Attachment

> **中**：一个工作区在某个部署节点上的一次装载的引用，由两部分组成：工作区实例标识和装载依据（例如 Git commit）。它和 `WorkspaceId` 一起出现，`WorkspaceId` 回答哪个工作区，工作区附着回答在哪个实例上、按什么依据装载。两部分的格式归工作区域。

> **EN**: A reference to one load of a workspace on a deployment node. It has two parts: the workspace instance identifier and the load basis (for example, a Git commit). It occurs together with a `WorkspaceId`: the `WorkspaceId` tells which workspace, and the workspace attachment tells on which instance and from which basis the workspace is loaded. The workspace domain owns the format of both parts.

- **形态**：属性
- **出处**：[工作区：产品需求描述](../../product/workspaces/design.md#产品需求描述)（rev 4）。补充依据：[#679 裁定](https://github.com/nemori-ai/omne-harness-lite/issues/679#issuecomment-6443061282)（PanQiWei 2026-10-27 裁定：`workspace` 分为身份轴、实例轴与版本轴，实例轴与版本轴合为工作区域拥有的附着值）。当前由 Session 契约的[创建规则](../../../../packages/session/session-contract/SPEC.md#消费者资格与输入)以 `workspaceAttachment` 字段承载
- **别混**：与[工作区实例](#ul-workspace-instance--工作区实例--workspace-instance)不是一回事：实例是被装载出来的工作入口，工作区附着只是指向某个实例的一次装载的引用。与[附件](execution-and-outcome.md#ul-attachment--附件--attachment)、[执行挂接](agent-runtime-loop.md#ul-execution-attachment--执行挂接--execution-attachment)无关，字段和类型不许简称 `attachment`（同 [C-64](../conflicts.md#c-64执行挂接的候选类型名)）。产品正文（如[J-WS01](../../product/workspaces/design.md#j-ws01-显式接入已有目录或装载已登记资源)「报告附着成功」）、[租户—工作区关系](subjects-and-ownership.md#ul-tenant-workspace-relation--租户工作区关系--tenantworkspace-relation)的参与边界与本卷[工作区实例](#ul-workspace-instance--工作区实例--workspace-instance)「不再附着」里的「附着」是动作：把工作区接到会话上，或这一动作的结果。它不是本词，本词是一个引用值。两种用法待收敛，见 [C-72](../conflicts.md#c-72附着动作与工作区附着值)

### UL-workspace-address · 工作区地址 · Workspace Address

> **中**：找到或访问工作区或工作区实例的地址，可以是本地文件系统路径、GitHub 地址、Obsidian vault、Office 365 资源地址、云端存储地址或其他未来地址。
> 地址带有提供者类型，用途沿相应资源管理机制表达；统一工作区层不另设跨地址的权威来源或自动同步规则。它不是工作区身份，也不是访问凭据。同一工作区可以有多个地址，地址不可达不自动删除工作区。

> **EN**: A location or access address for a workspace or workspace instance, such as a local filesystem path, GitHub URL, Obsidian vault, Office 365 resource, or cloud storage address. It carries a provider type, with usage expressed by the underlying resource-management mechanism. The common workspace layer adds no cross-address authority or automatic synchronization rules. An address is neither the workspace identity nor a credential, and a workspace may have multiple addresses.

- **形态**：属性
- **出处**：[PF-020 工作区地址](../../product.0.0.1.legacy/PF-020-workspace/design.md)（rev 22）
- **别混**：地址不是工作区实例本身；知道地址不能绕过租户授权。

### UL-workspace-category · 工作区类别 · Workspace Category

> **中**：描述工作区资源与治理语义的属性，不等于地址提供者类型。当前保留 Omne 原生、外部资源和未来组合三个可扩展类别。

> **EN**: An attribute describing a workspace's resource and governance semantics, distinct from its address provider type. Current categories are Omne-native, external-resource, and a future composite category.

- **形态**：属性
- **出处**：[PF-020 工作区类别](../../product.0.0.1.legacy/PF-020-workspace/design.md)（rev 22）
- **别混**：GitHub、Obsidian、Office 365 等是地址提供者类型，不直接决定工作区类别。

### UL-workspace-management-type · 工作区管理类型 · Workspace Management Type

> **中**：工作区采用哪一种资源管理方式的属性，用于区分其持久保存、版本管理与实例同步所遵循的模型。租户创建 Omne Host 工作区时选择该属性，首版仅提供 Git；它不同于资源与治理意义上的工作区类别，也不同于地址提供者。

> **EN**: A workspace attribute identifying the model used to persist, version, and synchronize its resources with instances. A tenant selects it when creating an Omne Host workspace; the first release offers Git only. It is distinct from workspace category and address provider.

- **形态**：属性
- **出处**：[PF-020 工作区管理类型](../../product.0.0.1.legacy/PF-020-workspace/design.md#工作区管理类型)（rev 22）

### UL-git-workspace · Git 工作区 · Git Workspace

> **中**：工作区抽象（`Workspace`）中管理类型为 Git 的特化，类型记法为 `GitBasedWorkspace`。其共享资源以 Git 仓库管理，装载出的工作区实例使用相应 Git 工作副本；首版 Omne Host 仅提供此类型。它沿用工作区的逻辑身份与生命周期，Git 仓库地址、分支和提交版本不替代工作区身份。

> **EN**: The Git specialization of Workspace, denoted `GitBasedWorkspace`: shared resources are managed in a Git repository and instances use corresponding Git working copies. It is the only type offered by Omne Host in the first release. It retains the workspace's logical identity and lifecycle; repository addresses, branches, and commits do not replace that identity.

- **形态**：变体（父：[工作区](#ul-workspace--工作区--workspace)）
- **出处**：[PF-020 Omne Host 的首版范围](../../product.0.0.1.legacy/PF-020-workspace/design.md#omne-host-的首版范围)（rev 22）

### UL-workspace-address-provider · 工作区地址提供者 · Workspace Address Provider

> **中**：提供一个工作区地址的外部系统或宿主类型，例如 `omne-host`、`github`、`obsidian`、`office365` 和本地文件系统。
> 它描述地址的访问方式与可用能力，不是工作区身份、租户所有者或访问授权。

> **EN**: The external system or host type that provides a workspace address, such as `omne-host`, `github`, `obsidian`, `office365`, or a local filesystem. It describes access and capabilities, not workspace identity, tenant ownership, or authorization.

- **形态**：属性
- **出处**：[PF-020 工作区地址](../../product.0.0.1.legacy/PF-020-workspace/design.md)（rev 22）

### UL-workspace-shared-directory · 工作区共享目录 · Workspace Shared Directory

> **中**：工作区实例目录下约定名为 `.omne` 的子目录，用于自动发现和加载工作区共享的资产、配置与规范；变更属于向云端同步并与获准访问的其他租户共享的内容。
> 它与工作区本地目录使用相同结构，不是另一份工作区或独立授权来源。

> **EN**: The conventional `.omne` subdirectory of a workspace instance, used to discover and load shared assets, configuration, and instructions. Its changes belong to the content synchronized to cloud storage and shared with authorized tenants. It has the same structure as the workspace local directory and grants no authority itself.

- **形态**：位置
- **出处**：[PF-020 两个约定目录](../../product.0.0.1.legacy/PF-020-workspace/design.md#两个约定目录)（rev 22）

### UL-workspace-local-directory · 工作区本地目录 · Workspace Local Directory

> **中**：工作区实例目录下约定名为 `.omne.local` 的子目录，用于该实例的本地资产、配置与规范；实例可跨租户共用，各会话按自己的租户身份分别求值。其结构与 `.omne` 相同，内容不进入工作区共享同步，但不保证共用同一物理实例的租户之间不可见；同能力标识的可用资产优先于共享目录中的资产。
> 可以只为共享资产提供设置覆盖而不复制资产；若选用同名本地资产，则完整使用该本地实现，不叠加针对共享资产的设置覆盖。本地目录不是租户级资产层，也不因是本地内容而获得权限配值资格。

> **EN**: The conventional `.omne.local` subdirectory of a workspace instance, containing instance-local assets, configuration, and instructions. Multiple tenants may share the instance, with each session evaluating this source under its own tenant identity. It has the same structure as `.omne`, stays out of shared workspace synchronization without guaranteeing privacy between tenants using the same physical instance, and takes precedence for eligible assets with the same capability identifier. It may supply settings for a shared asset without copying the asset. When a same-identity local asset is selected, that local implementation is used as a whole, without applying settings intended to override the shared implementation. It is not the tenant asset layer and grants no permission-setting authority.

- **形态**：位置
- **出处**：[PF-020 两个约定目录](../../product.0.0.1.legacy/PF-020-workspace/design.md#两个约定目录) · [目录的合并与作用域](../../product.0.0.1.legacy/PF-020-workspace/design.md#目录的合并与作用域)（rev 22）

### UL-workspace-participation-restriction · 工作区参与限制 · Workspace Participation Restriction

> **中**：组织针对本组织租户以工作区身份参与开发、维护与写入设定的限制。配置可为不启用、仅本组织或仅同一组织隶属树，默认不启用；首版不提供逐租户或逐工作区的例外豁免。该限制不拦只读访问，也不代替工作区自身的访问授权；仅在会话装配时按当时的策略和组织树判定，运行中不热同步变更或逐次操作重判；当前不覆盖将项目作为普通本地目录使用的路径。

> **EN**: An organization's restriction on its tenants participating in development, maintenance, or writing through recognized workspace relations. It may be disabled, limited to the same organization, or limited to the same affiliation tree, and is disabled by default. The first release offers no per-tenant or per-workspace exemptions. It does not block read-only access or grant workspace access rights. It is evaluated only during session assembly using the policy and organization tree at that time, with no live policy synchronization or per-operation reevaluation. Using a project as an ordinary local directory is outside its current coverage.

- **形态**：规则
- **出处**：[PF-020 组织对参与范围的限制](../../product.0.0.1.legacy/PF-020-workspace/design.md#组织对参与范围的限制)（rev 22）
- **外部仓库边界**：启用仅本组织或同一组织树限制时，该租户在装配中不能把登记外部仓库认定为工作区、附着或加载其工作区来源；不把首次登记者或任一参与者的组织当成工作区归属。原有只读资格不被撤销，但不保留上述工作区身份或装配来源。普通目录仍按已有 Files／Shell、执行环境及底层资源权限访问；这是尽力而为的治理，不是文件系统禁止。限制不删除全局工作区身份、租户关系或本地实例，不热重判已经运行的会话。
- **EN boundary**: When a same-organization or same-affiliation-tree restriction is enabled, assembly does not recognize a registered external repository as that tenant's workspace, attach it, or load its workspace sources. No participant's organization, including the first registrant's, becomes its governance affiliation. Existing read access remains valid through ordinary directory or underlying-resource access, without retaining workspace recognition or sources. Files/Shell, execution-environment, and resource permissions still apply. This best-effort governance does not prohibit filesystem access, delete global workspace identities, relations, or local instances, or reevaluate running sessions.

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
- **出处**：[PF-001 §4 范围化对象](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#范围化对象)（rev 26）
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
- **出处**：[PF-001 §4 范围化对象](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#范围化对象) · [§6.3](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#63-依赖与组合)（rev 26） · [PF-002 §4 身份是「类别 ＋ name」](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)（rev 32） · [PF-013 §4 档案的身份](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)（rev 17）
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
- **出处**：[PF-001 §4 账号](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#账号) · [§6.2](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 26）
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
- **出处**：[PF-001 §6.2 三种合成语义](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 26）
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
- **出处**：[PF-001 §6.2 两轮合成](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#两轮合成作用对象不同)（rev 26） · [PF-002 §5.6](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)（rev 32）
- **别混**：混为一谈就会得出「**改一项设置等于换一个资产**」这种结论——而实际上租户改默认模型时，用的还是**组织共享的那一个**资产
- **注意 ①**：第一轮内部有三小步，次序写死：**先按[禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)滤，
  再按[「谁可以使用它」](circulation-and-entitlement.md#ul-usable-by--谁可以使用它--usable-by)滤（official 那一份不参与），最后同标识取最具体的一份**；
  被前两步滤掉的持有在替换次序上视为不存在，标识退回下一层
- **注意 ②**：**唯一会改组合的那项设置——[Plugin](capabilities-and-composition.md#ul-plugin--插件--plugin) 的「启用哪些成员」——在组装展开到它时就地求值**，其余属性项照常在第二轮

### UL-adoption-change-counter · 采用变更计数 · Adoption Change Counter

> **中**：参与装配求值的一类来源在一个作用域上的单调递增计数，由该来源的拥有者维护。
> 这个作用域的合法候选、生效选择、设置值或来源材料每变一次，计数加一，拥有者随之通知使用方。
> 一次采用记下当时各来源的计数；之后计数全部相同，就说明这次求值的输入没有变。
>
> **EN**: A monotonically increasing count that the owner of one kind of assembly source
> keeps for one scope. Each change to the lawful candidates, the effective selection, setting values, or source
> material in that scope increments it, and the owner notifies consumers. An adoption records
> the counts of every source at that time. If all counts are still equal later, the inputs of
> that evaluation have not changed.

- **形态**：属性
- **出处**：[会话与工作：定义版本可以更新](../../product/sessions-and-work/design.md#定义版本可以更新定义身份不随之改变)（rev 7） ·
  [资产与规则：变更后的生效范围](../../product/assets-and-rules/design.md#changes-and-failures)（rev 4） ·
  [工作区：J-WS06](../../product/workspaces/design.md#j-ws06-更换选择或显式采用新的来源)（rev 4）
- **别混**：不是全局版本号。每类来源、每个作用域各有自己的计数，彼此不比较大小
- **注意**：计数变化只说明来源变了，不构成采用。采用仍只在新 Run 开始或显式 reload 时发生

### UL-validated-assembly-candidate · 已校验装配候选 · Validated Assembly Candidate

> **中**：采用变更计数变化后，在下一个采用入口之前预先求值并通过校验的一份装配结果，以求值时的输入快照（会话选择与各来源的计数）为键缓存。
> 只有入口当时的快照与这个键全等，它才在入口处成为采用依据；任一项再变，它就失效。
>
> **EN**: An assembly result that is evaluated and validated ahead of the next adoption entry
> after an adoption change counter moves. It is cached under the input snapshot it was
> evaluated from: the session's own selections and the source counts. It becomes the adoption
> basis at the entry only if the snapshot at the entry equals that key. Any further change
> invalidates it.

- **形态**：视图
- **出处**：[会话与工作：定义版本可以更新](../../product/sessions-and-work/design.md#定义版本可以更新定义身份不随之改变)（rev 7）
- **别混**：与「保存的选择」不是一回事。保存的选择是用户的意图；已校验装配候选是系统按当时来源算好的结果。两者都不是采用依据
- **注意**：丢了可以按同样的计数重新求值，所以它不是一份另存的事实

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
- **出处**：[PF-001 §6.2 默认与强制](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#默认与强制immutable)（rev 26） · [PF-002 §5.4](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)（rev 32）
- **注意 ①**：对权限而言，`immutable(v)` 就是把允许集合**收窄到单元素** `{v}`——**强制是收窄的特例**；权限上**带它的配值是界、不带的只是挑选**，唯独配成「禁止」的不带也是界
- **注意 ③**：锁资产替换时**不问被锁的是 official 还是自定义**——组织或租户在自己那层把某份 official 的持有标上它，
  下面就换不掉；[工作区](#ul-workspace--工作区--workspace)那一级**配不了它**
- **注意 ②**：[禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)的析取语义
  **等价于「布尔设置 ＋ 真即 immutable」**——**不是第四处，也不是另一套机制**
- **注意 ③**：**[工作区](#ul-workspace--工作区--workspace)那一级同样压不动锁住的项**——
  它在设置这一维虽然[压过租户](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)，
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
- **出处**：[PF-002 §5.2「组织的设置」是视图，不是对象](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象) · [PF-002 flows §3.2](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值)（rev 32）
- **别混**：不是[属性投影](#ul-attribute-projection--属性投影--attribute-projection)——投影是**从一批配值算出来的视图**，配值是被投影的那一格。**裸写「配值」不作数**：正文也用它说「各层配值」这个动作
- **注意**：**每一级各配各的。**同一份资产在组织、租户、[工作区](#ul-workspace--工作区--workspace)上各是一份持有，各有各的配值；
  [几级都配了听谁的，看那一维的层序](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)

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
- **出处**：[PF-001 §4 设置、权限、资产](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)（rev 26） · [PF-002 §5.2](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)（rev 32）
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
- **出处**：[PF-002 §5.3 两个例子，两种合成](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) ·
  [§5.5 替换是一条路径](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#替换是一条路径不是一扇后门)（rev 32） ·
  [PF-001 §6.2 三种合成语义](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 26）
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
- **出处**：[PF-002 §5.3 两个例子，两种合成](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)（rev 32） ·
  [PF-001 §6.2 三种合成语义](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 26）
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
- **出处**：[PF-013 §5.10 合法目标集合与展示列表，是两件事](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) ·
  [§4 档案的身份](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名) ·
  [§5.11](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面) ·
  [§6.5](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)（rev 17）
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
- **出处**：[PF-013 §5.10 合法目标集合与展示列表，是两件事](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) ·
  [§6.3](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)（rev 17）
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
- **出处**：[PF-015 §4 runtime context](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#runtime-context)（rev 21）；块的两类来源沿用 [PF-001 §4 Context](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 26）
- **弃用说法**：~~会话上下文感知域~~——**同一个概念**，正文统一写 runtime context
- **别混 ①**：**不是 Cordis 的 `Context`**——那是依赖注入与生命周期的容器，属技术设计。指它时**必须写全 `Cordis Context`**
- **别混 ②**：**不是[给模型看的上下文](../index.md#记录与上下文)**，也**不是 [Request Context](record-and-context.md#ul-request-context--请求-context--request-context)**——那是一次模型请求输入的派生计算，它读本词条的块，不拥有任何一块。**裸写「上下文 / context」在跨 topic 的文字里一律不作数**，[已记为冲突](../conflicts.md#现有冲突)
- **⚠️ 别混 ③**：**不是[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)。**
  日志**只追加**、历史全都在、自己会说话；它**就地更新**、只回答「现在是什么」、
  **变了要专门通知**。**一个答「发生过什么」，一个答「现在是什么」**
- **注意 ①**：**判它进不进来只看一条**——**在 agent loop 内被那三个角色之一消费（依赖）**。
  不看形态、不看归谁维护、不看重不重要
- **注意 ②**：**「会话要维护的状态」是另一个圈，两者有交集不重合**——
  [模态投影](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#模态投影)是会话要维护的，
  但那是**提供给会话外的服务用的**，会话内没人消费，**因此不是它**。
  那一类的正名是[会话日志投影](record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection)
- **注意 ③**：**[当下可用性](reach-and-availability.md#ul-current-availability--当下可用性--current-availability)也不是**——
  **消费它的是 runtime 本身**，它在组装那一步就被用掉了
- **注意 ④**：**工具和拓展点也读它。**它**从来不只是「给模型的上下文」**
- **⚠️ 注意 ⑤**：**变更怎么被会话感知，有推与拉两条**——
  **推**由那一块的生产者发起，**只在这个会话还有[运行](agent-runtime-loop.md#ul-run--运行--run)没闭合时才进得来**，
  **会话空闲时推来的一律丢弃，不落日志**；**拉**由 [agent runtime](agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) 自己做，
  取当前快照的时点归 Context 与 Agent 的现行正文，本词条不另定；[Runtime Context 产品页](../../product/runtime-context/design.md#5-当前值与变化感知)与 Agent 一侧都以执行开始或挂接建立为时点，见 [C-63](../conflicts.md#c-63runtime-context-的拉取时点)。
  **因此[因果链记的是这个会话感知到的变化，不是世界上发生过的每一步](../../product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#610-注入的上下文变了没有运行在跑时什么都不做)**
- **⚠️ 注意 ⑥**：**除了实时算的那些，每一块都要能恢复**——
  [会话被重新加载、归档被撤销之后，它们必须还在](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#58-存储要守住的两件事)。
  **实时算的那些没有「恢复」这回事**

- **注意**：会话内的块注册与块内容分别变化；允许增删非必需注册，必需 meta 块保持在场。注册及恢复要求见 [PF-015 §6.18](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#618-runtime-context-注册与内容分别变化)（rev 21）。

### UL-meta-runtime-context · 元 runtime context · Meta Runtime Context

> **中**：**每个[会话](agent-runtime-loop.md#ul-session--会话--session)都必需携带、
> 并且必需持续更新的那些 [runtime context](#ul-runtime-context--运行时-context--runtime-context)。**
> 与装配无关、与运行模式无关：**不论装的是哪一份定义，这一批一样都不能少。**
>
> **EN**: The blocks of runtime context **every session must carry and keep updated**.
> Independent of assembly and of run mode: **whatever definition is assembled, none of them
> may be missing.**

- **形态**：总称
- **出处**：[PF-015 §4 meta runtime context](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#meta-runtime-context) · [§5.6 十四项](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)（rev 21）
- **注意 ①**：**与 [meta 能力](capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability)同构**——
  那边是每个 agent 必不可少的**能力**，这边是每个会话必不可少的**感知**。**两边都不可禁用、不可替换**
- **注意 ②**：现行必需感知为十五项（含当前落点），[逐项的键、类与语义拥有者见正文](../../product/runtime-context/design.md#3-必需感知按内容及消费者供给)（rev 4）；封存的 [PF-015 §5.6](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context) 列十四项
- **注意 ③**：**模型看见其中一块只有两种形态**——**完整的那一份**（会话刚开始、**上下文压缩之后**，即[上下文快照提醒](record-and-context.md#ul-context-snapshot-reminder--上下文快照提醒--context-snapshot-reminder)）
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
- **出处**：[PF-001 §4 Context](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 26）
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
- **出处**：[PF-001 §4 Context](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 26）
- **注意**：「**正交**」的意思是两者**独立变化**——切换组织不改界面语言，改界面语言也不影响自己在哪个组织。因此**不能用同一套层次去合成**

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)

### UL-session-settings · 会话级设置 · Session Settings

> **中**：归属于一个会话的设置取值及其继承声明，包括创建时确定的初值和此后在该会话内的覆盖；持久化后仍只作用于该会话，不因保存而成为租户默认值。
>
> **EN**: Setting values and inheritance declarations owned by a session, including its initial values and subsequent session-local overrides. Persisting them does not turn them into tenant defaults.

- **形态**：属性
- **出处**：[PF-015 §6.17](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#617-默认值会话值与共享修改)（rev 21）
- **别混**：当前求值结果、会话日志投影与外部共享配置不是同一份权威；具体取值仍受上级锁定及授权约束。

### UL-runtime-context-registration · 运行时 context 注册 · Runtime Context Registration

> **中**：作用域持有者为一个作用域固定下来的那份清单：这个作用域里有哪些 [runtime context 块](#ul-context-block--runtime-context-块--context-block)、每块对到哪些[需要](#ul-context-need--上下文需要--context-need)、带什么参数。必需项在作用域创建时固定，可选项可以增删。它的身份是作用域加块键。注册说的是「这里有这一块」，不是这一块当前的值。
>
> **EN**: The list a scope holder fixes for one scope: which context blocks the scope has, which needs each block is bound to, and with what parameters. Required items are fixed when the scope is created. Optional items can be added or removed. Its identity is the scope plus the block key. A registration says that the block is present here. It does not hold the block's current value.

- **形态**：对象
- **出处**：[运行感知与一次模型请求 §2.4](../../product/runtime-context/design.md#24-注册读取资格与绑定读者)（rev 4）；旧说法见 [PF-015 §6.18](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#618-runtime-context-注册与内容分别变化)（rev 21）
- **别混**：不是共享数据源的创建或删除；也不是[块声明](#ul-context-block-descriptor--块声明--context-block-descriptor)——声明说「这种块长什么样、谁拥有」，注册说「这个作用域用了它」
- **注意**：形态由属性改为对象的依据与影响见 [C-67](../conflicts.md#c-67运行时-context-注册是属性还是对象)。本版的作用域持有者是会话

### UL-context-block · runtime context 块 · Context Block

> **中**：[runtime context](#ul-runtime-context--运行时-context--runtime-context) 里可以单独指认的那个单位：一个作用域里按块键识别的一份**当前值**。它有一份[块声明](#ul-context-block-descriptor--块声明--context-block-descriptor)、至少一个供值或写值的参与者、若干类按资格读它的消费者。它随[注册](#ul-runtime-context-registration--运行时-context-注册--runtime-context-registration)进入作用域，随注册移除或作用域结束而退出；值就地更新，不是事实流。它的身份是[作用域引用](#ul-scope-ref--作用域引用--scope-reference)加块键。
>
> **EN**: The unit of runtime context that can be named on its own: one **current value** in one scope, identified by a block key. It has one block descriptor, at least one participant that supplies or writes its value, and consumer classes that read it under eligibility. It enters a scope with a registration and leaves when the registration is removed or the scope ends. Its value is updated in place. It is not a stream of facts. Its identity is the scope reference plus the block key.

- **形态**：对象
- **出处**：[运行感知与一次模型请求 §2.1](../../product/runtime-context/design.md#21-两类块供给块与状态块)（rev 4）
- **别混**：不是[内容块](record-and-context.md#ul-content-block--内容块--content-block)——内容块是一条消息里装的东西，落日志；它是消息之外的当前值，不落日志
- **注意**：两类见[供给块](#ul-supplied-block--供给块--supplied-block)与[状态块](#ul-stateful-block--状态块--stateful-block)。中文正文里在无歧义处可简称「块」；跨 topic、写规格时用全名

### UL-supplied-block · 供给块 · Supplied Block

> **中**：由**一个**生产者供当前值、读者只读的 [runtime context 块](#ul-context-block--runtime-context-块--context-block)。它的值来自生产者的最近一次发布；它能恢复的方式是持久保存、重读来源或重算三者之一，由块声明说明。
>
> **EN**: A context block whose current value is supplied by **one** producer and only read by consumers. Its value is the producer's latest publication. It recovers by one of three ways stated in its descriptor: persisted, reread from its source, or recomputed.

- **形态**：变体（父：[runtime context 块](#ul-context-block--runtime-context-块--context-block)）
- **出处**：[运行感知与一次模型请求 §2.1](../../product/runtime-context/design.md#21-两类块供给块与状态块)（rev 4）
- **别混**：与[状态块](#ul-stateful-block--状态块--stateful-block)的差别只有一条：谁能改它的值。供给块只有生产者能改

### UL-stateful-block · 状态块 · Stateful Block

> **中**：由多个参与者提出[上下文更新](#ul-context-update--上下文更新--context-update)、按块声明里的合并规则合并、由作用域持有者在步边界以[步提交](#ul-step-commit--步提交--step-commit)写成事实的 [runtime context 块](#ul-context-block--runtime-context-块--context-block)。它可以声明每步只许一个写者，也可以声明只在一次执行内有效、不持久。
>
> **EN**: A context block whose value is changed by context updates from several participants, merged by the reduce rule in its descriptor, and made fact by the scope holder's step commit at a step boundary. It may declare one writer per step. It may declare that it lives only within one execution and is not persisted.

- **形态**：变体（父：[runtime context 块](#ul-context-block--runtime-context-块--context-block)）
- **出处**：[运行感知与一次模型请求 §2.1](../../product/runtime-context/design.md#21-两类块供给块与状态块) · [§2.5](../../product/runtime-context/design.md#25-状态块的更新与步提交)（rev 4）
- **注意**：更新是提案，提交之前不是这一块的值

### UL-context-block-descriptor · 块声明 · Context Block Descriptor

> **中**：一种 [runtime context 块](#ul-context-block--runtime-context-块--context-block)的静态说明，由这个值的**语义拥有者**发布：块键、值的形状、允许的消费者类、是否必需、披露方式、能否带前值、变化的频率（稳定或逐请求）、恢复方式；状态块另有写者类、合并规则与持久方式。全系统一个块键只有一份声明。它的身份是块键，随发布它的包存在。
>
> **EN**: The static statement of one kind of context block, published by the value's **semantic owner**: the block key, the value shape, the allowed consumer classes, whether it is required, how it is disclosed, whether it may carry a previous value, how often it changes (stable or per request), and how it recovers. A stateful block also states its writer classes, reduce rule and persistence. One block key has exactly one descriptor in the whole system. Its identity is the block key. It lives with the package that publishes it.

- **形态**：对象
- **出处**：[运行感知与一次模型请求 §2.2](../../product/runtime-context/design.md#22-块声明归语义拥有者)（rev 4）
- **别混**：不是[注册](#ul-runtime-context-registration--运行时-context-注册--runtime-context-registration)。声明没有作用域，注册有
- **注意**：声明不安装块，也不授权读它。谁供值、谁能读，分别由[生产者句柄](#ul-producer-handle--生产者句柄--producer-handle)与[读取资格](#ul-read-eligibility--读取资格--read-eligibility)决定

### UL-context-need · 上下文需要 · Context Need

> **中**：一个消费者在自己的定义里写下的一条「我要一个这样形状的值」：形状、消费者类、用途、必需或可选。它不点名任何块键。必需的需要缺项时，依赖它的动作不可用。
>
> **EN**: One line a consumer writes in its own definition: "I need a value of this shape", with the shape, the consumer class, the purpose, and whether it is required or optional. It names no block key. When a required need is missing, the action that depends on it is unavailable.

- **形态**：属性
- **出处**：[运行感知与一次模型请求 §2.3](../../product/runtime-context/design.md#23-需要绑定与集成原则)（rev 4）
- **别混**：不是[块声明](#ul-context-block-descriptor--块声明--context-block-descriptor)。声明说「我供这个」，需要说「我要这个」，两边都不点名对方

### UL-need-binding · 需要绑定 · Need Binding

> **中**：集成方在[注册](#ul-runtime-context-registration--运行时-context-注册--runtime-context-registration)时写下的一条对应：这条[上下文需要](#ul-context-need--上下文需要--context-need)由哪一块满足，形状不同时附带怎样翻译。翻译是纯函数，结果带块的来源证据。消费者读到的是它自己声明的形状。
>
> **EN**: One mapping the integrator writes at registration time: which block satisfies this context need, and, when the shapes differ, how to translate. The translation is a pure function and its result carries the block's provenance. The consumer reads the shape it declared.

- **形态**：属性
- **出处**：[运行感知与一次模型请求 §2.3](../../product/runtime-context/design.md#23-需要绑定与集成原则)（rev 4）
- **注意**：翻译归集成方，不归生产者的契约，也不归消费者的契约

### UL-producer-handle · 生产者句柄 · Producer Handle

> **中**：一个生产者登记供给某一块之后拿到的那个代表：它有一个**代际**，用来发布新值、使当前值失效、撤销登记。登记随生产者所在插件的寿命存在。旧代际晚到的发布不被采用。
>
> **EN**: What a producer holds after it registers to supply one block: it has a **generation** and is used to publish a new value, to invalidate the current value, and to withdraw the registration. The registration lives as long as the producer's plugin. A late publication from an old generation is not adopted.

- **形态**：对象
- **出处**：[运行感知与一次模型请求 §2.2](../../product/runtime-context/design.md#22-块声明归语义拥有者)（rev 4）
- **注意**：使当前值失效只是唤醒读者；读者读到什么以读时为准

### UL-read-eligibility · 读取资格 · Read Eligibility

> **中**：作用域持有者签发给一次绑定的那份材料：作用域、消费者类、主体与租户、允许读的块键集合、允许的需要绑定集合、签发时的注册修订。读取时逐次核对它。持有者可以撤销它，撤销后按它读取被拒绝；持有者也可以签发一份新资格取代它（重签），重签后它失效，按它建立的读者沿新资格继续读取。它不是从运行环境推断出来的。
>
> **EN**: The material a scope holder issues for one binding: the scope, the consumer class, the principal and tenant, the set of block keys that may be read, the set of need bindings that may be read, and the registration revision at issue time. It is checked on every read. The holder can revoke it, and reads under it are then refused. The holder can also issue a new eligibility that replaces it (reissue). After a reissue it is no longer valid, and readers bound under it continue under the new one. It is never inferred from the runtime environment.

- **形态**：属性
- **出处**：[运行感知与一次模型请求 §2.4](../../product/runtime-context/design.md#24-注册读取资格与绑定读者)（rev 4）
- **别混**：不是动作授权。它只决定能读哪些块，不决定能做什么

### UL-bound-reader · 绑定读者 · Bound Reader

> **中**：按一份[读取资格](#ul-read-eligibility--读取资格--read-eligibility)建立的读取入口：消费者类固定，按[需要绑定](#ul-need-binding--需要绑定--need-binding)把块翻译成消费者的形状，给出当前快照与自上次游标以来的变化。每次读重核资格；资格被撤销或失效时它结束。
>
> **EN**: A reading entry established from one read eligibility: its consumer class is fixed, it translates blocks into the consumer's shapes through the need bindings, and it returns the current snapshot and the changes since a cursor. Eligibility is rechecked on every read. The reader ends when its eligibility is revoked or expires.

- **形态**：对象
- **出处**：[运行感知与一次模型请求 §2.4](../../product/runtime-context/design.md#24-注册读取资格与绑定读者)（rev 4）
- **注意**：游标属于一个绑定读者。授权范围变化、生产者换代、进程重建之后游标失效，读者要重新取完整快照

### UL-context-update · 上下文更新 · Context Update

> **中**：一个参与者对某个[状态块](#ul-stateful-block--状态块--stateful-block)提出的一条局部更新。它带着提出它的原动作身份，是**提案不是事实**；只有被作用域持有者的[步提交](#ul-step-commit--步提交--step-commit)合并之后才成为那一块的值。
>
> **EN**: One partial update a participant proposes for a stateful block. It carries the identity of the action that proposed it. It is a **proposal, not a fact**: it becomes part of the block's value only after the scope holder's step commit merges it.

- **形态**：属性
- **出处**：[运行感知与一次模型请求 §2.5](../../product/runtime-context/design.md#25-状态块的更新与步提交)（rev 4）
- **注意**：失败的步里成功动作提出的更新保留为待处理，由持有者处置，不进这一步的提交

### UL-step-commit · 步提交 · Step Commit

> **中**：作用域持有者在一个步边界把该步收到的全部[上下文更新](#ul-context-update--上下文更新--context-update)按各块的合并规则合成的一份结果，并把它写成作用域事实。一步一份；它的身份是作用域加步引用。合并是纯函数。
>
> **EN**: The result a scope holder produces at one step boundary by merging every context update received in that step with each block's reduce rule, and then records as scope fact. One per step. Its identity is the scope plus the step reference. The merge is a pure function.

- **形态**：对象
- **出处**：[运行感知与一次模型请求 §2.5](../../product/runtime-context/design.md#25-状态块的更新与步提交)（rev 4）
- **别混**：不是[注册](#ul-runtime-context-registration--运行时-context-注册--runtime-context-registration)的变更。注册变的是「有哪些块」，步提交变的是「状态块的值」

### UL-change-material · 变化材料 · Change Material

> **中**：一块值变化之后算出来、交给作用域持有者的变化消费路径的那份东西：块键、前后修订、按读者资格过滤过的前值。它是生成提醒的输入，**不是提醒消息本身**；交付即完。
>
> **EN**: What is computed after a block's value changes and handed to the scope holder's change-consumption path: the block key, the revisions before and after, and the previous value filtered by reader eligibility. It is the input for a reminder. It is **not the reminder message**. It is complete once delivered.

- **形态**：视图
- **出处**：[运行感知与一次模型请求 §5.1](../../product/runtime-context/design.md#51-首次注入锚定快照与追加提醒)（rev 4）
- **别混**：不是[上下文快照提醒](record-and-context.md#ul-context-snapshot-reminder--上下文快照提醒--context-snapshot-reminder)。快照是完整当前值，只进请求；变化材料变成的提醒追加进历史

### UL-scope-ref · 作用域引用 · Scope Reference

> **中**：指向一个作用域的不透明引用，可以带一个父引用。拿着它的人不解释它指的是租户、会话还是运行；子作用域读一个块键时先查自己再查父级，同键遮蔽。它是[注册](#ul-runtime-context-registration--运行时-context-注册--runtime-context-registration)、[读取资格](#ul-read-eligibility--读取资格--read-eligibility)与执行环境归属共用的键。
>
> **EN**: An opaque reference to one scope, optionally with a parent reference. Whoever holds it does not interpret whether it points at a tenant, a session or a run. A child scope reading a block key looks in itself first and then in its parent, and the same key shadows upward. It is the key shared by registrations, read eligibility and execution-environment ownership.

- **形态**：属性
- **出处**：[运行感知与一次模型请求 §2.4](../../product/runtime-context/design.md#24-注册读取资格与绑定读者)（rev 4）
- **别混**：不是[作用域层](#ul-scope-layer--作用域层--scope-layer)。作用域层是求值合成里的一级；作用域引用是一个具体作用域的名字
- **注意**：本版只有会话一个作用域持有者，父引用保留给将来的租户级与运行级持有者

### UL-scope-holder · 作用域持有者 · Scope Holder

> **中**：为一个作用域维护[注册](#ul-runtime-context-registration--运行时-context-注册--runtime-context-registration)、签发[读取资格](#ul-read-eligibility--读取资格--read-eligibility)、在步边界写出[步提交](#ul-step-commit--步提交--step-commit)的那一方。一个作用域只有一个持有者。`0.0.0 -> 0.1.0` 阶段只有一种持有者，就是会话。
>
> **EN**: The party that maintains the registration of one scope, issues its read eligibility, and writes its step commits at step boundaries. One scope has exactly one holder. In `0.0.0 -> 0.1.0` the session is the only kind of holder.

- **形态**：属性
- **出处**：[运行感知与一次模型请求 §2](../../product/runtime-context/design.md#2-来源会话选择和历史分别生效)（rev 4）
- **别混**：不是[集成方](#ul-integrator--集成方--integrator)。持有者在注册时也是集成方，但集成方还包括装配时接线的一方与为一次调用求设置的协调者

### UL-integrator · 集成方 · Integrator

> **中**：知道各参与者、负责把它们接在一起的那一方。它为每条[上下文需要](#ul-context-need--上下文需要--context-need)写下[需要绑定](#ul-need-binding--需要绑定--need-binding)并拥有翻译；被集成的各方只对外声明自己供什么、要什么，不知道被谁集成。作用域持有者在注册时、装配时负责接线的一方、为一次工具调用求设置的协调者，都是集成方。
>
> **EN**: The party that knows the participants and connects them. It writes a need binding for every context need and owns the translation. The integrated parties only declare what they supply and what they need, and do not know who integrates them. The scope holder at registration time, the party that wires at assembly time, and the coordinator that evaluates the settings for one tool call are all integrators.

- **形态**：属性
- **出处**：[运行感知与一次模型请求 §2.3](../../product/runtime-context/design.md#23-需要绑定与集成原则)（rev 4）
- **注意**：执行环境那边为一次获取翻译[环境要求](grounding-and-isolation.md#ul-environment-requirement--环境要求--environment-requirement)的也是集成方，同一个词、同一个含义

### UL-semantic-owner · 语义拥有者 · Semantic Owner

> **中**：决定一份值是什么意思的那一方。[块声明](#ul-context-block-descriptor--块声明--context-block-descriptor)归它，不归存放这份值的一方，也不一定归供值的生产者。
>
> **EN**: The party that decides what a value means. The block descriptor belongs to it, not to the party that stores the value, and not necessarily to the producer that supplies it.

- **形态**：属性
- **出处**：[运行感知与一次模型请求 §2.2](../../product/runtime-context/design.md#22-块声明归语义拥有者)（rev 4）
- **别混**：不是生产者。生产者供值，语义拥有者定义值的含义；两者可以是同一方，也可以不是

# data.identity-values v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.identity-values, 1)`——
  `family = data`、`topic = identity-values`、规范路径 `spec/data/identity-values/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：当前采用范围见 catalog——语义可被审阅；精确规范范围以 catalog 为准；消费者采用和实现须分别核对
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-001 rev 15** 为准
- **精确语义依赖**：**无 spec 依赖。**本契约是本基线的第一份身份值契约，不 `$ref` 任何其他 Schema，
  也不消费任何其他契约的条款。它的全部输入是产品正文与全局约束条款（非 spec 坐标），
  逐条列在[设计依据](#设计依据)。catalog 的 `dependencies` 为**空数组**，不是「待填」
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.identity-values/v1#S-5`

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 全局隔离义务 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | 「显式携带租户身份、跨租户访问默认拒绝」这条义务本身；本契约是它在数据层的展开，**不削弱它** |
| 部署边界 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | 「单机交付但语义不变地可扩展」——据此分出[装配给与协议给](#六装配给与协议给) |
| 规格形式 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) | JSON Schema 定义数据契约；语言无关表达优先于任何实现类型 |
| 账号的三个作用、登录标识、激活状态、两个账号之间无通路 | [PF-001 §4 账号](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号) | S-1、S-2、S-24 |
| 组织、上级组织属性、隶属链三条约束 | [PF-001 §4 组织](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织) | S-3、S-14、S-15 |
| 个人组织的结构性禁止 | [PF-001 §4 个人组织](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织) | S-4 |
| 租户 = (组织, 账号)、不含角色 | [PF-001 §4 租户](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户) | S-5 |
| 退出之后再加入回来的是同一个租户；租户级私有部分不可达不销毁 | [PF-001 §4 退出之后再加入](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户) · [flows §3.3 成员关系](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系) | S-6、S-10、S-26 |
| 当前租户身份是创建那一刻的环境值；切换只影响此后新建 | [PF-001 §4 当前租户身份](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份) | S-28、S-29 |
| 角色单值两取值、可变、不回溯 | [PF-001 §4 角色](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色) | S-8 |
| 个人 context 与协作范围 context 正交、不进层 | [PF-001 §4 Context](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息) | S-25 |
| 四层、账号不占一格 | [PF-001 §6.1 层次](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次) | S-11 |
| 隔离八条 | [PF-001 §6.4 隔离](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | S-16～S-21、S-24～S-26、S-29 |
| 路径是地址，不是钥匙 | [PF-001 §6.5 本地资源定位](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位) · [路径是地址，不是钥匙](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙) | S-22、S-34 |
| 旧菜单不当授权，撤销向后生效 | [PF-001 §6.6 撤销不等于强制停止](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止) | S-27 |
| 作者用租户身份标识、所有者与作者分记 | [PF-001 §6.7 创作与归属](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) · [作者用租户身份标识](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识) | [CS-2](#cs-2-作者与所有者分记) |
| 账号、登录状态、成员关系的状态流转 | [flows §3.1 账号](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号) · [§3.2 登录状态](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态) · [§3.3 成员关系](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系) | S-1、S-3、S-9、S-26 |
| 配值资格来自持有；「组织的设置」是视图 | [PF-002 rev 10 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性) · [「组织的设置」是视图，不是对象](../../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象) | [CS-1](#cs-1-资产持有的键与属性配值) |
| 工作区挂在租户下、同目录换租户身份即另一份；**工作区不是目录，目录是它的承载** | [PF-002 rev 10 §4 工作区](../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区) · [工作区不是目录](../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区不是目录) | S-22、[CS-6](#cs-6-工作区宿主为租户) |
| 工作区不是一重身份；三条层序 | [PF-002 rev 10 §5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题) · [它不因此多一重身份](../../../../product/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份) | S-11 |
| 边界是那棵隶属树 | [PF-003 rev 4 §5.2](../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织) | S-15、[CS-4](#cs-4-分享边界有共同上级) |
| 复制的通则：同一自然人的两个租户身份 | [PF-003 rev 4 §6.3](../../../../product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份) | S-13、[CS-3](#cs-3-资产复制的前提) |
| 关系解除之后：分享失效、复制留着 | [PF-003 rev 4 §6.12](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后) | S-26、[CS-5](#cs-5-成员无效时不可达但不销毁) |
| 会话持有创建那一刻的租户身份 | [PF-015 rev 9 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) | S-28、[CS-7](#cs-7-会话持有创建时的-tenantid) |
| 「全局」那一档落成租户层的权限设置值 | [PF-007 rev 15 §4 一笔授权表达有三个维度](../../../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度) | [CS-9](#cs-9-全局授权表达落成租户层配值) |
| 统一语言正式名与形态 | [主体与归属](../../../../ubiquitous_language/terms/subjects-and-ownership.md) · [作用域与求值](../../../../ubiquitous_language/terms/scope-and-resolution.md) · [流转与获权](../../../../ubiquitous_language/terms/circulation-and-entitlement.md) | 全部英文名 |
| 对象的宿主、身份依据与「正文未述」 | [domain_objects/objects.md 主体与归属](../../../../domain_objects/objects.md#主体与归属) | 各条的缺口标注 |

> **这张表里没有产品行的条款，逐条点名，免得「没有行」被读成「漏了」：**
>
> | 没有产品行的条款 | 它的依据来自哪 |
> |---|---|
> | **[S-35 交接凭证](#s-35-交接凭证-handoff-warrant)** | **哪一行都不来自**——产品正文只说注册要走到一个稳定点，没说两步之间怎样交接前置事实。它是**规格层为了让次序守卫在运行期有对应物**而立的构造，来源是三份能力/组合契约的共同需要（见[消费者表](#消费者)），**不是产品裁决**。**因此它也不立统一语言词条**，理由写在[条款正文](#s-35-为什么不立统一语言词条) |
> | [S-12](#s-12-缺席与空值都不是身份值)、[S-31](#s-31-不透明标识的交换表示)、[S-32](#s-32-判别式集合闭合)、[S-33](#s-33-表示层校验与判定分开)（另加 [S-7](#s-7-tenantid-的规范序列化形式)：它是 [S-5](#s-5-tenantid-的构成与相等) 那个值的**表示**判断，产品正文不定表示） | **由本表第三行 [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) 供给**：表示、校验与「表示层不等于判定」是规格形式的要求，产品正文不承诺这一层 |
> | [S-23](#s-23-不得冒充隔离) | **由本表第一行 [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) 供给**：「跨租户访问默认拒绝」要求判定落在真实的数据访问层，冒充隔离等于没有判定 |
> | [S-30](#s-30-跨边界须重新验证) | **由 [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) 与 [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 两行合起来供给**：默认拒绝要在跨进程之后仍成立，接收边界就得重新验证 |
>
> **「没有产品行」与「没有依据」是两件事：**只有 S-35 是前者且后者，其余各条的依据是 SYS-* 硬约束，
> 位置就在本表最上面三行，**不另起一行重复登记**。

## 一、目的与消费者

### 这份契约拥有什么

**两样东西，缺一不可：**

1. **身份值的含义与形状**——账号、组织、租户、登录状态、租户角色、组织变体、成员资格效力、
   作用域层身份，各是什么、取什么值、怎样判定相等、怎样交换。
2. **隔离义务条款**——**每一个持有租户范围对象的 owner 都要遵守的同形条款。**
   它们写在这里，因为[跨租户访问默认拒绝](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)
   这件事不需要跨 owner 的共同提交，需要的是**每个 owner 各自不漏**；
   写成一份共用契约，每个 owner 才能照着逐条自检。

**另有一条共用构造，不属于上面两样**：[S-35 交接凭证](#s-35-交接凭证-handoff-warrant)。
它既不是身份值（不指认任何对象），也不是隔离义务（不约束租户边界）；
它在这里，只因为**三份契约都要用它，而写三遍必然分叉**——与身份值落在这里的理由完全相同。

**身份值没有状态转移。**有状态的是**记录**——成员记录、登录状态记录、组织记录——
它们的生灭与写路径归相应能力契约。本契约只说：**那些记录用什么值作键、那些值怎样判定同一。**

它是一份**数据契约**：没有操作、没有状态转移、没有提交点，**因此不需要插件**。
它定义的东西被所有涉及租户归属的能力共享，写两遍必然分叉，所以它先定、其余契约引用它。

### 消费者

| 消费者 | 消费什么 |
|---|---|
| **资产领域**（**具名第一消费者**：[PF-002](../../../../product/PF-002-assets-settings-and-permissions/design.md) rev 9 与 [PF-003](../../../../product/PF-003-asset-transfer-and-sharing/design.md) rev 4 的契约，尚未建立） | 资产持有的归属层键、属性配值的宿主、作者与所有者的记录形式、复制前提与分享边界的输入 |
| [`data.offer-expiry` v1](../../offer-expiry/README.md)（四类[邀约](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-offer--邀约--offer)的过期语义） | **[S-1](#s-1-accountid)、[S-3](#s-3-organizationid)**——AccountId 与 OrganizationId 的形状与相等规则。它只取这两个名字，**不消费任何隔离义务** |
| [`capability.account-identity`](../../../capabilities/account-identity/README.md) v1（候选） | **[S-1](#s-1-accountid)、[S-2](#s-2-登录标识不是-accountid)、[S-9](#s-9-loginstateid)、[S-31](#s-31-不透明标识的交换表示)**——AccountId、LoginIdentifier、LoginStateId 的形状与唯一性范围；**[S-33](#s-33-表示层校验与判定分开)**——它八个操作统一的表示层拒绝值 `invalid-input` 按本条**不得被记成一次判定结果**；**[S-35](#s-35-交接凭证-handoff-warrant)**——激活依据与清除依据是它的两个实例，由该契约核实；**[S-30](#s-30-跨边界须重新验证)**——该契约的「装配给 vs 协议给」表两处带坐标引用本条，说的是跨进程后由谁重新兑现。**按本基线的判据，正文以坐标引用某条款即登记为消费，只有否定式提及（「不来自」「不同于」）不登**，所以 S-30 列为消费，**共七条**；catalog 的 `clauses` 已按七条登记（2026-09-22，[registry](../../../../registry/README.md)），**本行只作索引** |
| [`capability.organization-governance`](../../../capabilities/organization-governance/README.md) v1（候选） | OrganizationId、OrganizationKind、TenantId、TenantRole、MembershipStanding、MembershipStandingResult、ScopeLayerIdentity 的形状；[上级组织与上级链的结构约束](#s-14-上级组织与上级链)、[`shareAncestor`](#s-15-shareancestor)；**[S-35](#s-35-交接凭证-handoff-warrant)**——它是清除依据的**产出方**。它是这些值的**产生方**，并提供成员资格的读面。完整的消费 clauses 清单由该契约自己的依赖表与 catalog 登记 |
| [`composition.account-registration`](../../../compositions/account-registration/README.md) v1（候选） | **[S-1](#s-1-accountid)、[S-2](#s-2-登录标识不是-accountid)**——AccountId 与登录标识的分工（一次注册里产生哪个、用哪个作键）；**[S-35](#s-35-交接凭证-handoff-warrant)**——它是激活依据的**产出方**，也是清除依据的**携带方**。**catalog 已登记这条依赖**（2026-09-22，`clauses = S-1 / S-2 / S-35`）；**登记在 [registry](../../../../registry/README.md)，本行只作索引，不代替登记** |
| 会话领域的契约（[PF-015](../../../../product/PF-015-session-lifecycle-and-ownership/design.md) rev 8，尚未建立） | 会话创建时捕获并持有的 TenantId |
| meta 能力的契约（[PF-007](../../../../product/PF-007-meta-capabilities/design.md) rev 15，尚未建立） | 「全局」一档授权表达落成租户层配值时的键 |
| 计量（**无 topic**） | 每次调用携带的 TenantId；**口径本身是缺口**，见 [G-02](#十已知缺口) |
| **一切持有租户范围对象的 owner** | 全部[隔离义务](#五隔离义务) |

## 二、含义与使用范围

**适用范围**：**一个部署之内**。本版的完整交付是单机系统，但下面每一条的**领域语义在跨进程之后必须原样成立**；
哪些结论在单机由装配给出、分布式后必须由协议重新兑现，逐条列在[第六节](#六装配给与协议给)。

### 三类东西，不要混读

| 类 | 是什么 | 本契约给什么 |
|---|---|---|
| **不透明标识** | AccountId、OrganizationId、LoginStateId、LoginIdentifier | 唯一性范围、相等规则、**不可解析**；词法形式留 realization |
| **结构化值** | TenantId、MembershipStanding、ScopeLayerIdentity | 由分量确定的值；相等按分量；规范序列化形式 |
| **枚举** | OrganizationKind、TenantRole | 封闭取值域，无「其他」 |

**另有两个不是身份值的东西：**

- `MembershipStandingResult` 是**成员资格读面的操作结果**，不是一个效力取值——
  它把「判出来的效力」与「这一次判不出来」分成两支，见 [S-10](#s-10-membershipstanding)。
- `HandoffWarrant` 是**一步操作交给下一步的凭证**，不指认任何对象，见 [S-35](#s-35-交接凭证-handoff-warrant)。

> **`OrganizationKind` 与 `MembershipStandingResult` 是规格层的判别式名，不是统一语言词条。**
> 词表里没有也不会有这两条：前者是「个人组织／团队组织」这对已有词条在数据形状上的**判别字段**，
> 后者是一个**读面结果的包装**。因此本契约与 Schema 里**不给它们「中文 · English」那种词条式命名**——
> 那种写法会让读者以为词表里有个对应词条可查。
>
> **有词条的那些，token 与词条的对应写在这里，消费者不必自己猜：**
>
> | 规格层 token | 词条 | 词条英文 |
> |---|---|---|
> | `MembershipStanding.standing = "effective"` | [成员资格效力](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-membership-standing--成员资格效力--membership-standing)的「**有效**」 | **In force** |
> | `MembershipStanding.standing = "ineffective"` | 同上词条的「**无效**」 | **Not in force** |
> | `OrganizationKind = "personal"` | [个人组织](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-personal-organization--个人组织--personal-organization) | **Personal Organization** |
> | `OrganizationKind = "team"` | [团队组织](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-team-organization--团队组织--team-organization) | **Team Organization** |
>
> **token 与词条英文不必同形**：`effective` / `ineffective` 是一对**取值标识符**，
> 取的是「同一个词根的正反」这条最不易写错的形状；词条的正式英文名是 **In force / Not in force**，
> 那是给人读的。**两者不得互相替代**——对外文档用词条名，交换表示用 token。

**TenantId 是值，不是标识。**它不被谁分配、不被谁回收，也没有一张表登记它的存在。
它由 (OrganizationId, AccountId) 这一组合确定，因此两个分量相同的 TenantId 就是同一个租户身份——
这是[统一语言对租户的定义](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)的直接结果，
不是本契约新加的约定。**「这个租户此刻有没有效」是另一回事**，见 [S-10](#s-10-membershipstanding)。

### 「账号靠什么指认」问的是两个问题

[领域对象清单把账号的身份依据记作「登录标识」](../../../../domain_objects/objects.md#ul-account--账号)，
本契约又说跨对象引用一律用 AccountId。**这两句不冲突，它们回答的是两个不同的问题：**

| 问题 | 答案 | 谁拥有 |
|---|---|---|
| **产品层**：靠什么指认这个人 | [登录标识](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)——他注册时定下的那个对外名字，部署内唯一 | PF-001 §4 账号 |
| **规格层**：跨对象引用用什么键 | [AccountId](#s-1-accountid)——不透明、存储生成、不回收 | 本契约 |

**词表已经把这条界划开了**：登录标识那条词条明说它
**不是规格层用来引用一个账号的那个键**，那个键是什么「产品正文没说，词表也不定义它」——
[本契约就是定那个键的地方](#s-1-accountid)。

两者一一对应，**但不得互相替代**。把对外名字嵌进归属记录，等于把一个人选的名字复制到每一条资产、
每一笔账单上。**本版不提供修改登录标识**，因此这些引用即便用它也不会当场失效；
但 S-1 与 S-2 的分工使这件事**不依赖那个裁决继续成立**——这正是分开的收益。

### 与相近概念的差异

- **账号 ≠ 租户。**账号回答「你是谁」，租户回答「你的东西归哪儿」。一个 AccountId 对应多个 TenantId。
- **登录状态 ≠ 会话。**LoginStateId 指认一次通过鉴权的登录，不是一段协作；正文刻意不用「会话」称呼它。
- **当前租户身份 ≠ 租户。**前者是挂在一次登录状态上的**一项选择**，后者是被指向的那个身份值。
  本契约定义被指向的值以及**捕获它的时点规则**（[S-28](#s-28-当前租户身份在创建那一刻捕获)），
  选择本身的读写归组织治理契约。
- **成员资格效力 ≠ 租户角色。**角色答「这个身份**能做什么**」，效力答「这个身份**此刻算不算数**」；
  有效时两样同时成立，[角色调整不改变效力](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)。
- **作用域层身份 ≠ 作用域层。**层是那一格，层身份是**占着那一格的那个对象**；
  它也**不是**资产归属那条层序，见 [S-11](#s-11-scopelayeridentity) 的排除说明。

## 三、值、身份与结构关系

| 元素 | 精确含义 | 身份、相等或引用规则 |
|---|---|---|
| `AccountId` | [账号](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-account--账号--account)的标识 | [S-1](#s-1-accountid) |
| `LoginIdentifier` | [登录标识](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)：账号的一项属性，对外的名字 | [S-2](#s-2-登录标识不是-accountid) |
| `OrganizationId` | [组织](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-organization--组织--organization)的标识 | [S-3](#s-3-organizationid) |
| `OrganizationKind` | 组织的变体 | [S-4](#s-4-organizationkind) |
| `TenantId` | [租户](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)身份 | [S-5](#s-5-tenantid-的构成与相等)、[S-6](#s-6-tenantid-无生灭路径)、[S-7](#s-7-tenantid-的规范序列化形式) |
| `TenantRole` | [租户角色](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role) | [S-8](#s-8-tenantrole) |
| `LoginStateId` | [登录状态](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state)的标识 | [S-9](#s-9-loginstateid) |
| `MembershipStanding` | [成员资格效力](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-membership-standing--成员资格效力--membership-standing)：一个租户此刻算不算数 | [S-10](#s-10-membershipstanding) |
| `MembershipStandingResult` | 成员资格读面的**操作结果**（效力或「不可用」失败）；**不是效力值** | [S-10](#s-10-membershipstanding)、[S-19](#s-19-不可用即明确失败) |
| `ScopeLayerIdentity` | [作用域层身份](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer-identity--作用域层身份--scope-layer-identity)：[作用域层](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)的一格由哪重身份充当 | [S-11](#s-11-scopelayeridentity) |

**本节末尾另有一条不属于上表的条款**：[S-35 交接凭证](#s-35-交接凭证-handoff-warrant)。
它**不是身份值**，因此不在这张表里；放在本节，是因为它与上面这些一样，
是**跨契约共用、写两遍必然分叉**的那类东西。

### S-1 AccountId

**AccountId 是账号的标识：不透明、部署内唯一、由存储在产生账号那一刻生成。**

它不携带可被消费者解释的内部结构：消费者**不得解析它**、不得从它推断注册时间/顺序/归属，
也不得对两个 AccountId 做除相等之外的比较。相等即同一个账号，判定见 [S-31](#s-31-不透明标识的交换表示)。

它**不来自运行时对象**——运行实例身份（如 Cordis 的 `Fiber.uid`）只在本次 registry 内有效，
不能充当持久身份。账号[本版无终止路径](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)，
因此 AccountId **不被回收、不被复用**。

### S-2 登录标识不是 AccountId

**[登录标识](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)（Login Identifier）
是账号的一项属性，不是它的标识。**
它在**整个部署内唯一**，注册时定下，**未激活的账号同样占用它**。
它只承担「指认」这一件事——**不证明来者持有这个账号**，那是凭据的事。

- 任何引用账号身份的持久记录（尤其是 TenantId 的 `account` 分量）**只用 AccountId**；
- 登录标识**不得出现在 TenantId 中**，也**不得作为任何归属记录的键**。

**本版无变更路径**：产品负责人已裁定本版不提供修改登录标识，
[PF-001 已把它列入非目标](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#非目标)，
[§4 账号的属性表也写明「本版不可改」「注册时，此后不变」](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)。
本条因此从「已裁未落盘」变成**有正文依据**，**语义不变**；复核结论记在[验证入口](../verification.md#变化的影响)。
它的对外形式（是否邮箱、大小写是否有别）归账号能力契约。

> **「不可改」不等于「永远属于同一个账号」。**
> 一条[未激活的账号记录到期被清除之后，它占的登录标识随之释放](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)，
> 可以被**另一个账号**取得——那是一次新注册，得到的是**另一个 AccountId**。
> 本条约束的是「一条记录活着的时候它的名字不变」，**不是**「一个名字永远指向同一个 AccountId」。
> 这正是[登录标识不是引用键](#s-2-登录标识不是-accountid)的又一个后果：**可释放的东西不能当键**。
> 释放的精确条件与收场归账号能力契约。

### S-3 OrganizationId

**OrganizationId 是组织的标识：不透明、部署内唯一、由存储在创建组织那一刻生成。**
约束同 [S-1](#s-1-accountid)。**它不被回收、不被复用**——[本版组织只有一条终结路径](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)，
而那条路径**同样不回收标识**：一个[未激活账号的个人组织被清除之后，它的 OrganizationId 不复用](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)。

**这一条与[登录标识](#s-2-登录标识不是-accountid)正相反，差别要记住**：
登录标识是**产品层的名字**，未激活记录到期之后它**释放**、可以被另一个人取得；
OrganizationId 是**规格层的引用键**，它**永不复用**。
[两者回答的不是同一个问题](#s-2-登录标识不是-accountid)——
一个可复用的引用键会让一条指向已清除组织的历史记录悄悄指到另一个组织身上。

[个人组织](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-personal-organization--个人组织--personal-organization)与
[团队组织](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-team-organization--团队组织--team-organization)
**共用同一个标识空间**：它们是同一个对象的两个变体，不是两类对象，
因此没有两套标识，也**不能从 OrganizationId 的形状分辨变体**（要分辨读 [S-4](#s-4-organizationkind)）。

### S-4 OrganizationKind

**OrganizationKind 是组织的一项属性，取值恰两种：`personal` / `team`。创建时确定，此后不可改，无写路径。**

`personal` ⇒ 一组**结构性禁止**同时成立，**它们不是可被调整的权限设置**。

**这组禁止的权威不在本契约。**它恰有四条，逐条连同「在哪个失败值上兑现」
写在 `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1` 的
[S-6 两个变体与四条结构性禁止](../../../capabilities/organization-governance/v1/contract.md#s-6-两个变体与四条结构性禁止)，
与 [PF-001 §4 个人组织](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织)一致。
**本契约不自列一份**——自列一份就会在那边加第五条时悄悄过期，
而本契约既没有那些操作也没有那些失败值，判不出自己漏了。

本契约只取它的**数据形状后果**两句：

- 消费者判断这些事**读 `OrganizationKind` 这一个值**，**不另立标志位**（`invitable` 一类字段即为违反）；
- 由 S-6 的第 3 条（**上级恒空且不可作别人的上级**）直接得到：
  **个人组织的[上级链](#s-14-上级组织与上级链)恒空**，
  因此**任何两个不同的个人组织都不会[有共同上级](#s-15-shareancestor)**。
  这不是一条额外规定，是那一条的结果。

### S-5 TenantId 的构成与相等

**TenantId 是值类型，由 (OrganizationId, AccountId) 这一有序对确定。**

- **相等按分量**：两个 TenantId 相等，当且仅当 `organization` 分量相等且 `account` 分量相等。
  **不存在第三种相等依据**，也不存在「等价但不同」的两个 TenantId。
- **不另铸标识**：任何一方**不得**为租户再分配一个不透明 id 并声称它是租户身份；
  那会立刻产生两份权威，而其中一份会在成员关系断续时被重新分配。
- **不含角色。**[TenantRole](#s-8-tenantrole) 是租户在其组织内的一项属性，**不进身份**。
  据此：角色变更**不改变任何已记录的 TenantId**，也不使任何归属记录失效。
- **不含成员资格。**「这个 TenantId 此刻有没有效」不是它的分量，见 [S-10](#s-10-membershipstanding)。
- **不含时间。**同一对 (organization, account) 在任何时刻都是同一个 TenantId；
  [退出之后再被邀请回来，得到的仍是同一个](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)。

### S-6 TenantId 无生灭路径

**TenantId 没有生成路径，也没有销毁路径。**

它不被分配、不被回收、不存在「新建一个租户身份」这个动作：给定两个分量，这个值就存在，可被任何记录引用。
成员关系的建立与解除改变的是[成员资格效力](#s-10-membershipstanding)，**不改变这个值是哪一个**，
也不使已有记录中的 TenantId 变成悬空引用。

**因此消费者不得实现任何以「租户被删除」为前提的清理。**
一个引用了某 TenantId 的历史记录（作者、账单明细、资产持有）在成员关系解除之后**仍然是有效引用**，
只是没有任何身份能以它的名义发起动作。

> **[产品正文说「第一个租户随那条未激活记录一起消失」，这与本条不冲突。](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)**
> 消失的是**那条成员关系记录**与**它所在的个人组织**——**记录有生灭，值没有**。
> 按本条读那一句：删掉的是记录，`(OrganizationId, AccountId)` 这个**值**照旧是它自己；
> 只是那个 [OrganizationId 永不复用](#s-3-organizationid)，
> 于是**再没有任何东西能合法地引用回这个 TenantId**——
> 而这恰恰是安全的方向，因为[产品正文同时保证那三样从未承载任何东西](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#非目标)。
>
> **消费者不得因此写出一条「清除个人组织时顺带清理该 TenantId 名下数据」的路径**：
> 那条路径在这一个场景里扫不到任何东西（从未承载），却会成为一个**通用的按租户删除入口**，
> 而通用入口一旦存在，就会被用在本条禁止的场景上。

### S-7 TenantId 的规范序列化形式

**TenantId 的规范序列化形式恰有一种**：一个带两个成员的结构，成员名为 `organization` 与 `account`，
不含其他成员；两个成员**均必填、均非空**。**相等性与唯一性判定只在这个结构形式上定义。**

- 该形式在 Schema 中由 `TenantId` 定义，`additionalProperties: false`。
  **成员顺序不参与相等判定**——记录按成员名匹配，不按位置。
- **本版不定义任何把 TenantId 压成单一标量的形式**（拼接串、哈希、编码键都不是），
  见 [G-05](#十已知缺口)。消费者若在自己的实现里需要一个标量键，那是 realization 的事，且必须满足三条：
  **单射**（两个不同的 TenantId 不得编码成同一个标量）、**一个部署只有一条编码规则**、
  **编码结果不是身份**——不得把该标量作为身份对外发布，也不得把解析它的结果当作授权依据
  （[S-34](#s-34-语义身份与实现地址分开)）。

### S-8 TenantRole

**TenantRole 是租户角色，单值枚举，取值恰两种：`superAdministrator` / `member`。**

一个租户在其组织内**只持一个**。它**可变**，
[变更只影响此后的准入判定](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)，
不改变已发生的归属与既有事实。
[超级管理员](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-super-administrator--超级管理员--super-administrator)
的作用域**恰是该组织**，这一个值不表达平台范围的任何资格。

本契约只定义取值域与「单值」这一形状；谁能改、改的前置与并发收场归组织治理契约。

### S-9 LoginStateId

**LoginStateId 是登录状态的标识：不透明、部署内唯一、由存储生成。**约束同 [S-1](#s-1-accountid)。

[每次登录产生新的一个](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态)；
失效不可逆，**且失效在系统重启之后依然成立**；重新登录得到的是新的一个，**不是旧值复活**，因此不被复用。
它不是会话的标识，也不是账号的标识。

产品正文未述登录状态靠什么标识，只写明彼此可分辨（[domain_objects](../../../../domain_objects/objects.md#ul-login-state--登录状态)）——
本条给出「不透明、部署内唯一」这一最小形状以满足可分辨，**不补造任何结构**（[G-06](#十已知缺口)）。

### S-10 MembershipStanding

**MembershipStanding 是[成员资格效力](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-membership-standing--成员资格效力--membership-standing)——
一个租户此刻算不算数。恰两值，不得压成布尔或可空值：**

| 取值 | 含义 | 携带什么 | 消费者必须怎么做 |
|---|---|---|---|
| `effective` | 成员关系成立，该 TenantId 此刻有效 | **必须**携带该租户在其组织内恰持的那一个 [TenantRole](#s-8-tenantrole) | 按该角色继续判定 |
| `ineffective` | 从未建立，或已被解除 | 不携带其他字段 | 拒绝该次访问；**不得删除任何以该 TenantId 为键的数据**（[S-26](#s-26-成员无效使租户级持有不可达但不销毁)） |

`effective` **必带**角色、`ineffective` **必不带**角色——**没有「有效但角色未知」这一态**：
一个不带角色的 `effective` 无法用于任何准入判定，是无意义值。

成员关系的**断与续改变的是效力**，**不改变这个租户是哪一个**（[S-5](#s-5-tenantid-的构成与相等)、[S-6](#s-6-tenantid-无生灭路径)）；
[角色调整两样都不改](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)。

#### 读不到不是第三个取值

**成员资格读面返回一个 MembershipStanding，或以「不可用」失败。**
两者由 `MembershipStandingResult` 表达：

```text
MembershipStandingResult  ≝  MembershipStanding  |  { failure: "unavailable" }
```

**`{ failure: "unavailable" }` 是失败，不是效力值。**
`ineffective` 是一个**已经做出的判定**，`unavailable` 是**这一次判不出来**。
[产品正文把「目标范围不可用」与「成员失权」并列](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)，
两者**收场相同**——明确失败、不静默回退；但**来路不同，结果值也不同**。

把不可用读成无效，系统会在一次存储抖动中对着一个完全正常的成员回答「你不是成员」，
并据此执行本该拒绝的清理；读成有效则在依据不可读时放行。**两种折叠都禁止**，
消费者的义务见 [S-19](#s-19-不可用即明确失败)。

> **为什么是一个包装，而不是第三个 `standing` 取值**：包装让「不可用 ≠ 无效」在**类型上**就成立——
> 拿到 `MembershipStandingResult` 的消费者必须先分支，**分不掉**。
> 塞成第三个取值，一次 `switch` 漏掉 `default` 就把它折进了某一侧，而那正是本条要挡的事。

**表示层拒绝在本类型之外。**一次调用可能在**判定开始之前**就被拒（`TenantId` 缺席或不合形状），
那不是一个判定结果（[S-33](#s-33-表示层校验与判定分开)），因此**不是 `MembershipStandingResult` 的第三支**——
本类型恰两支，**不因为多了一种拒绝就多一支**。
它由**调用的那个操作自己的失败集合**承载，**同样以返回值承载、同样不走带外通道**：
**两种拒绝一旦走两条不同的通道，消费者就会只接住其中一条**，而漏掉的那条会沿着
「没拿到 standing ⇒ 当作没有」滑进 `ineffective` 那一侧。

#### 准入判定必须用的那个读面在哪，它的 `unavailable` 就是这一支

**准入判定必须用的那个成员资格读面是
`omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1` 的
[S-26 成员资格判定](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定)。**
两份契约在这一点上说的是同一件事，为免两处各写一套，这里写死对应关系：

| 本契约 | 组织治理 S-26 |
|---|---|
| `MembershipStandingResult` 的效力那一支 | 该操作返回的 `MembershipStanding` |
| `MembershipStandingResult` 的 `{ failure: "unavailable" }` 那一支 | 该操作失败集合里的 **`unavailable`** |
| **本类型之外**（见上一段） | 该操作失败集合里的 **`invalidInput`**——表示层拒绝，**判定没有发生** |

**S-26 的返回值是什么形状，归那份契约，本契约不自列一份**：
`omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1` 的
[S-26](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) 写明它的返回是一个闭合和
`invalidInput` **|** `MembershipStandingResult`——左项是「还没开始判」，右项是本类型。
**本契约拥有的只有右项**：它自己再分「判出来了」与「这一次判不出来」，**恰两支**。
消费者**先分那份契约定的和，再分右项的两支**；三种收场**都以返回值承载**，**没有一种走带外通道**。

> **为什么 `invalidInput` 不塞进 `MembershipStandingResult`。**
> 本类型是**判定结果**的类型——它的两支都发生在「判定已经开始」之后。
> 把一个根本没进判定的拒绝放进来，就得允许任何持有本类型的地方表达「我没判」，
> 而本类型**被别的契约当作判定结果直接消费**（[S-19](#s-19-不可用即明确失败) 那张表的第 1 行）。
> 两者分开之后，**S-33 那条界在类型上就成立**：判定结果里永远找不到一个「没判」的取值。

**`unavailable` 必须以返回值承载，不得走带外错误通道。**
写成抛异常、写进日志、或用一个「空结果 + 侧信道标志」表达，都会让调用方**有办法不分支**——
而一个没被分支的失败在多数语言里会沿着「没读到 ⇒ 当作没有」滑进 `ineffective` 那一侧，
正是 [S-19](#s-19-不可用即明确失败) 与上面那段要挡的事。**消费者据形状分支，不据错误类型分支。**

**「必须用的那个」不等于「唯一提到成员资格的那个」。**组织治理还有两个读面也会说到成员关系，
**它们的返回一概不得作准入依据**——[每道准入现读](#s-27-每道准入现读)，现读**一律走 S-26**：

| 别的读面 | 它给的是什么 | 为什么不能拿来准入 |
|---|---|---|
| `capability.organization-governance · v1` 的 [S-59 列出组织成员](../../../capabilities/organization-governance/v1/contract.md#s-59-列出组织成员) | 该组织的成员关系记录列表，每项 `{ TenantId, 角色, 有效性 }` | 那个**「有效性」是 [MembershipStanding](#s-10-membershipstanding) 的一个投影，不是同一形状**：它是成员关系记录上的一个字段，与角色**并列**而不是像 `effective` 那样**必带**角色，也没有 `MembershipStandingResult` 的失败支。拿它当依据，就是拿一份**为展示而取的名单**去做授权 |
| 同契约的 [S-27 我的租户](../../../capabilities/organization-governance/v1/contract.md#s-27-我的租户) | 某账号**此刻有效**的 `TenantId` 列表 | 它是一个**视图**，回答「我有哪些租户」，不是对**某一个** `TenantId` 的判定；它也不回答角色。列表在手与**这一次**访问能不能放行是两件事 |

**两条都不改变 S-26 的地位**：它们**可以**用来展示、用来让调用方拿到一个可以再去调 S-26 的值，
但**每一道准入仍要以那个 `TenantId` 现调一次 S-26**。
这不是重复劳动——[列表是上一刻的读数，准入要的是这一刻的判定](#s-27-每道准入现读)。

### S-11 ScopeLayerIdentity

**ScopeLayerIdentity 是[作用域层身份](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer-identity--作用域层身份--scope-layer-identity)的表示——
[作用域层](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)的一格由哪重身份充当。
本版供得出标识表示的恰两个变体：**

| 变体 | 由谁充当 | 携带 |
|---|---|---|
| `organization` | 组织 | 一个 [OrganizationId](#s-3-organizationid) |
| `tenant` | 租户 | 一个 [TenantId](#s-5-tenantid-的构成与相等) |

**刻意不含的四个，每一个都有理由，消费者不得自行补上：**

| 不含 | 理由 |
|---|---|
| **出厂默认** | 由**系统**充当，**没有一个身份对象占这一格**；[官方件没有租户](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)。给它铸一个身份值就等于凭空造出一个叫「平台租户」的主体，而没有任何自然人对应它 |
| **会话** | 词条已定它**由那个会话充当**；缺的是**用什么标识表示**——**已知缺口 [G-01](#十已知缺口)**，归 PF-015。Schema 的变体**不含** `session`，正是为了让它无法被静默构造出来：需要它的消费者应当被明确阻断，而不是照着一个猜测实施 |
| **账号** | 账号**不充当任何一格**；它的[求值是恒等的](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)，早已完成，也不接受任何配置。构造一个 `account` 变体等于把账号变回一层 |
| **工作区** | [不是一重身份](../../../../product/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份)；它只在**设置**与**资产归属**两条层序上各占一格，并**挂在租户下**。它的归属键含 TenantId 分量，见[CS-6](#cs-6-工作区宿主为租户) |

**ScopeLayerIdentity 不表达资产归属那条层序**（official < 组织 < 租户 < 工作区）。
那是另一条层序，成员对不齐；用本类型表达它会得到一个既缺 official 又缺工作区的残表。

**上级组织也不充当任何一格**：子组织不自动继承上级组织的任何东西，否则层数会随隶属链变化。

### S-12 缺席与空值都不是身份值

**字段不存在、字段为 `null`、字段为空字符串是三件事，但三者都不是有效身份值。**

本契约**一律视为「没有给出这个身份」**。
消费者不得把其中任何一种解释为「默认身份」「当前身份」「全部」或「无限制」。

**「一律触发 [S-18](#s-18-缺席即拒绝)」只在身份的*输入位置*成立**，即：
一次判定或一次访问**要拿这个身份去用**的那个参数、那个字段。
**不是每一处形状上可空的身份字段都是输入位置**——
[CS-2](#cs-2-作者与所有者分记) 的 `official` 资产就是现成的反例：
它的作者字段**合法地缺席**（平台没有租户），那是**记录里的一个合法取值组合**，
不是一次「没带身份的访问」，**不触发 S-18**。

**两者的分界只有一句：这个缺席的值本来要被拿去判定吗。**
要 ⇒ 拒绝（S-18）；不要 ⇒ 按各自契约定义的合法缺席读，
且**仍不得**把它读成某个空租户或默认身份（本条第一段照旧成立）。
合法缺席各自在哪，归持有那条记录的 owner 写明；**本契约不给一张清单**。

对 TenantId 另有一句：**两个分量都必需，缺一即非法值**——
**这一条在任何位置都成立**，与是不是输入位置无关：一个只有一半的 TenantId 从来就不是合法值。
**任何一方不得用「当前登录的账号」「当前组织」之类的环境值把缺的那一半补齐**——
那正是 [S-17](#s-17-身份参数没有默认值) 要挡住的事，只是发生在校验层。

### S-35 交接凭证 Handoff Warrant

**交接凭证是一步操作交给下一步的凭证：它断言「我这一步已经做完」，不断言别的。**
它**不是身份值**——不指认任何对象，也不能作任何记录的键。
它写在本契约，只因为**三份契约都要用它**，而[写三遍必然分叉](#这份契约拥有什么)。

#### 六条性质

| # | 性质 | 为什么非要这一条 |
|---|---|---|
| 1 | **不透明。**交换表示是非空字符串（[S-31](#s-31-不透明标识的交换表示) 同形：逐码点相等、禁首尾空白）；**核实方不解析它**，也不从中读出任何事实 | 一旦可解析，核实就会退化成「读里面写了什么」——而里面的内容是产出方写的 |
| 2 | **由一步操作产出。**每一个实例都要指名**哪一条操作、在什么成功条件下**产出它 | 说不出产出点的凭证，等于允许调用方自己造一个 |
| 3 | **绑定一个对象标识。**本版的两个实例**都绑定 [AccountId](#s-1-accountid)**。一份为 A 产出的凭证**不能**用在 B 身上 | 不绑定就只剩「有人做过这一步」，而次序守卫要的是「**为这个对象**做过」 |
| 4 | **只绑定对象标识，本版不作废。**两个实例都只绑定 [AccountId](#s-1-accountid)，**不绑定「那一次尝试」，也不因被核实过而作废**；重放一份旧凭证的安全，**由核实方在它自己那一次提交里的前置现读承担**（`omne-harness-lite-design-2026-09-15 · capability.account-identity · v1` 的 [S-14 前置③](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)／[S-38 前置②③](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)） | 「作废」是一份运行时状态（谁核实过、何时失效），只有在**重放会造成错误效果**时才有收益。两个实例断言的事实在本版都**一经成立不再变假**（[逐个论证见下](#性质-4-在两个实例上为什么站得住)），核实方又本来就要现读它自己的状态前置，所以重放造不成任何错误效果——为它加一份状态，只多出一处会失效的登记 |
| 5 | **由下一步操作核实三件事**：**存在**、**绑定该标识**、**由产出方签发** | 少核第三件，任何能构造字符串的调用方都能通过 |
| 6 | **核实方不核实它断言的领域事实。**核实通过只证明**「由该产出方签发」**。**这句话在两个实例上不对称**：产出方是**一条操作**时（清除依据），签发等于「那条操作在它自己那一次调用的判定边界内确认了它断言的事实」（含幂等路：事实本来就成立、没有写入）；产出方是**被守卫的组合本身**时（激活依据），组合没有自己的提交，「只在事实成立时才签发」**由产出方自己的契约承担**（`omne-harness-lite-design-2026-09-15 · composition.account-registration · v1` 的 [S-8 第 ② 步](../../../compositions/account-registration/v1/contract.md#s-8-三步次序与责任交接)）。**无论哪一种，那一步的前置、并发与失败，都由产出方自己的条款照判** | 反过来要求核实方去查，就得给它一条本不该有的依赖边——那正是引入凭证要避免的事 |

#### 它是一条契约承诺，不是一层安全机制

**「不可伪造」是本条的承诺，不是对实现的建议。**
守卫成立与否**全靠这一条**：调用方若能自造一份通得过的凭证，
所有以凭证为前置的次序条款**同时变成空条款**，而且**不会有任何观测报错**——
每一步都返回 `ok`，只是次序从来没被守住过。

**怎么做到不可伪造归 realization**，本契约不定机制，只给两条已知可行的路与各自的前提：

| 路 | 前提 | 分布式后 |
|---|---|---|
| **同进程 nonce 登记**：产出方生成一个随机值并在自己的内存里登记 `(值 → 标识)`，核实方向产出方查 | 产出方与核实方**在同一进程内**，且**进程不在两步之间重启** | **失效**——见下 |
| **签名或共享存储**：产出方用只有自己持有的密钥签 `(标识)`，或把登记写进双方都读得到的存储 | 密钥不外泄；或共享存储的写在核实读之前可见 | 可用 |

**装配给与协议给**：本版单机走哪一条归 realization，但[第六节](#六装配给与协议给)已写明——
**「凭证不可伪造」在单机是装配给的，跨进程后必须由协议重新兑现**。
凭证跨进程传递时另受 [S-30](#s-30-跨边界须重新验证) 约束：
**它是授权依据的一种，不是身份值**，接收边界照样要重新验证。

#### 本版的两个实例

**两个实例都不在本契约里**：本契约定形状与性质，产出方与核实方各自在自己的契约里写死。

| 实例 | 产出 | 核实 | 绑定与核实（性质 3、4、6 落在这一格） |
|---|---|---|---|
| **激活依据** | `omne-harness-lite-design-2026-09-15 · composition.account-registration · v1` 在 `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1` 的[创建个人组织](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)成功返回时产出（**含幂等返回既有组织那一路**） | `omne-harness-lite-design-2026-09-15 · capability.account-identity · v1` 的[激活账号](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) | 绑定该次注册的 AccountId。[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 核存在、绑定与签发方，**不核新鲜度、不核领域事实**。**产出方就是被守卫的组合本身**（性质 6 的非对称那一侧）：核实通过只证明「由该组合签发」，「个人组织此刻存在」由组合自己的 [S-8 第 ② 步](../../../compositions/account-registration/v1/contract.md#s-8-三步次序与责任交接)承担——它只在 `#S-20` 成功返回时签发。**本版不作废**；重放一份旧依据的安全由 `#S-14` 前置③在自己提交里现读「未过留存期限」承担（[理由见下](#性质-4-在两个实例上为什么站得住)） |
| **清除依据** | `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1` 的[清除未激活账号的个人组织](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)成功时产出（**含幂等成功，即组织本来就不存在那一路**） | `omne-harness-lite-design-2026-09-15 · capability.account-identity · v1` 的[清除到期的未激活账号记录](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) | 绑定待清除账号的 AccountId。[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 核存在、绑定与签发方。**产出方是一条操作**（性质 6 的对称那一侧）：核实通过等于「`#S-53` 在它自己那一次调用的判定边界内确认了事实」（含 ②乙／⑦乙的幂等路，那一路不写入）。**本版不作废**；重放一份旧依据的安全由 `#S-38` 前置②③在自己提交里现读「未激活 ∧ 已过留存期限」承担。**重扫仍须出示依据**——那是[幂等不豁免出示](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)，**不是一次性**：上一轮那一份与 `#S-53` 幂等成功再产出的那一份**同样有效** |

**幂等那一路同样产出凭证**，两个实例都是：那一路断言的是**同一件事实**
（「这个 AccountId 的个人组织此刻存在／此刻不存在」），不是一次更弱的成功。
不产出就会让重试卡死在一个已经达成的状态上。

#### 性质 4 在两个实例上为什么站得住

**[性质 4](#六条性质)（不作废、不绑定尝试）只有逐个实例说清「重放为什么造不成错误效果」才可自检。**
论证的形状两个实例相同：**凭证断言的事实一经成立不再变假**，
**核实方自己的状态前置又在同一提交里现读**，于是旧凭证要么仍然为真、要么被那道现读挡住。

| 实例 | 旧凭证断言什么 | 为什么这个断言一经成立不会变假 | 重放时核实方靠什么挡住「状态已变」 |
|---|---|---|---|
| **激活依据** | 「该 AccountId 的个人组织存在」 | 个人组织在本版**只有一条终结路径**（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)），而它**只对已过留存期限的记录成立**；「是否已过留存期限」[一旦为「是」就不回头](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)。所以断言变假**只能发生在记录过期之后** | [`#S-14` 前置③](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)在自己那一次提交里现读「未过留存期限」：过期 ⇒ `account-record-expired` 拒绝。**挡住它的是这个单调事实，不是凭证的新鲜度**——账号契约那一节写的就是这句 |
| **清除依据** | 「该 AccountId 的个人组织已不存在」 | 个人组织只由 [`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 为**未过留存期限**的记录创建；被 `#S-53` 清除时记录**已过期**，而过期不回头，所以**此后再也建不出来**；`#S-53` ②乙／⑦乙那一路（账号记录已被 `#S-38` 清掉后的重扫）产出的依据同样永真——AccountId 不复用（[S-1](#s-1-accountid)），`#S-20` 前置②「账号存在」再也满足不了。断言**永真** | [`#S-38` 前置②③](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)在自己那一次提交里现读「未激活 ∧ 已过留存期限」：已激活 ⇒ `not-expired` 拒绝；记录已被清 ⇒ 幂等 `ok`。**一份旧依据在任何交错下都造不成一次错误删除** |

**因此本版不给任何一个实例加「一次性」。**它此前被写在清除依据上，
理由是「若核实过的那一份还能再用，重扫就能不经 `#S-53` 现读直接调 ②」——
但那条现读要挡的两件事（账号已激活、记录未过期）**`#S-38` 自己的前置②③本来就现读**，
绕过 `#S-53` 绕不过 `#S-38`，作废因此没有收益。
**「同一次尝试内产出即用」若仍被组合当作自己的流程规则**
（`composition.account-registration · v1` 的 [S-8](../../../compositions/account-registration/v1/contract.md#s-8-三步次序与责任交接)），
那是**组合对自己动作链的要求**，不由凭证承载、不由核实方兑现——凭证本身**只绑定 AccountId**。

**性质 6 在这里最容易被读错**：清除依据只断言「组织那半已做」，
**不断言**那个账号此刻仍未激活、仍已过期——那两条由核实方在自己的提交里现读照判。
激活依据那一侧更进一步：**连「组织那半已做」都不是核实方证明的**，
核实只证明「由该组合签发」，事实由组合的 S-8 ② 承担。

#### S-35 为什么不立统一语言词条

**因为它没有产品出处。**
[词条的出处只许来自产品 topic 的某一小节，或产品负责人的一次裁决](../../../../ubiquitous_language/AGENTS.md)；
产品正文只说注册要走到一个稳定点，**从没说过两步之间怎样交接前置事实**——
那是规格层为「让次序守卫在运行期有对应物」自己立的构造。
给它建词条，等于在词表里放一条**出处栏填不出东西**的记录。

**代价要说清楚**：它因此**不是产品语言的一部分**，
不能出现在产品正文、验收判据或任何面向使用者的文字里；
它只在规格与实现之间流通，**读它的人一律是本批契约的消费者**。
**这不是把它降级**——本契约里其余条款的英文名都取自词表，唯独它由本契约自己拥有，
所以它的正式名（`HandoffWarrant` / 交接凭证）**以本条为准**，
将来产品若真需要这个概念，那时**先建词条再回头对齐**，不反过来。

## 四、派生谓词

**本节三条不是同一类，读它们的人必须先分清：**

| 条款 | 输入 | 要不要读记录 |
|---|---|---|
| [S-13](#s-13-sameaccountdistincttenants) `sameAccountDistinctTenants` | 两个 TenantId 的分量 | **不读。**纯值判定，先于一切存储访问即可算出 |
| [S-14](#s-14-上级组织与上级链) `ancestorChain` | 一个 OrganizationId | **要读组织记录**——上级组织属性是被写下来的字段，链要顺着它一路往上读 |
| [S-15](#s-15-shareancestor) `shareAncestor` | 两个 OrganizationId | **要读**，它建在 `ancestorChain` 上 |

**因此只有 S-13 可以在拒绝路径上「先算了再说」。**
S-14／S-15 是**读时求值**的：它们会失败，失败的收场由 [S-19](#s-19-不可用即明确失败) 管，
**不得**因为它们写成了数学式子就当成纯函数去用。

### S-13 sameAccountDistinctTenants

```text
sameAccountDistinctTenants(t1, t2)  ≝  t1.account = t2.account  ∧  t1.organization ≠ t2.organization
```

这就是「**同一账号的两个租户身份**」。它不读成员资格、不读持有记录，先于一切存储访问即可算出。
[资产复制](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)
把它作为**必要前提之一**（[CS-3](#cs-3-资产复制的前提)）；
**必要不充分**——两侧的成员资格效力与流转边界另有其人。

### S-14 上级组织与上级链

**上级组织（Parent Organization）是组织的一项属性，本契约给出它的结构约束：**

- **至多一个。**它是单值属性，不存在写入第二个值的形状。已有上级的组织要先解除才能建立新的。
- **不成环。**任一组织不得出现在自己的[上级链](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-ancestor-chain--上级链--ancestor-chain)上。
- **个人组织不参与**（[S-4](#s-4-organizationkind)）。

**上级链**：

```text
ancestorChain(o)  ≝  从 o 出发沿上级组织属性一路往上得到的组织序列（不含 o 自身）
```

**函数名以本条为准，全链只用 `ancestorChain` 这一个写法。**
本契约是[上级链](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-ancestor-chain--上级链--ancestor-chain)
与 [`shareAncestor`](#s-15-shareancestor) 的**定义权威**：消费者
（含 `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1` 的
[S-12](../../../capabilities/organization-governance/v1/contract.md#s-12-上级链与有共同上级)
及其结构模型）**带坐标引用本条，不各自复述一份定义**。
两处各写一份定义式，改一处就会分叉，而分叉出来的是一条**流转边界判据**。

**它是读时求值的派生视图，不是被写下来的字段。**
求值要**读组织记录**（每一跳读一次上级组织属性），因此它**会失败**：
任何一跳读不到 ⇒ **明确失败**，按 [S-19](#s-19-不可用即明确失败) 收场，
**不得**返回一条读到哪算哪的短链——一条被截断的上级链会让
[S-15](#s-15-shareancestor) 把同一棵树上的两个组织判成不同树，从而**拒绝本该放行的流转**；
反过来若实现把「读不到上级」写成「没有上级」，两条链都缩成自身，**又会放行本该拒绝的**。

本契约只定义这些结构约束与两个谓词的**表达**；
求值的操作面、建立与解除的授权、提交点与并发收场归组织治理契约。

### S-15 shareAncestor

```text
shareAncestor(o1, o2)  ≝  ({o1} ∪ ancestorChain(o1)) ∩ ({o2} ∪ ancestorChain(o2)) ≠ ∅
```

两个组织**有共同上级**，当且仅当**把各自算进自己的上级链之后**，两条链有交
（[PF-001 §4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)）。

**它建在 [`ancestorChain`](#s-14-上级组织与上级链) 上，因此同样读组织记录、同样会失败**：
两条链里任何一跳读不到 ⇒ **明确失败**（[S-19](#s-19-不可用即明确失败)），
**不得**用一条不完整的链算出一个 `false` 交上去——那是一次伪装成「判出来了」的读失败。

**「把自己算进来」这一步不能省。**[上级链按 S-14 不含自身](#s-14-上级组织与上级链)，
只比两条不含自己的链，**一个组织与它自己的上级就不算有共同上级**——
而它们分明在同一棵树上。

**它等价于「同一棵隶属树（根相同）」。**上级至多一个、链不成环（[S-14](#s-14-上级组织与上级链)），
所以每个组织顺着上级走必定终于唯一的一个根；两条含自身的链有交，当且仅当两个根是同一个。
**这与 [PF-003 §5.2 的流转边界是同一句话](../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)**，
不是两个判据。

由 [S-4](#s-4-organizationkind) 与 [S-14](#s-14-上级组织与上级链) 直接得到：
**任何含个人组织、且两者不同的一对都恒为假**——那把尺子量不到它们，不是把门放宽了。

> **「两者不同」这个限定是含自身的读法带来的，必须写出来。**
> `shareAncestor(o, o)` 对**任何**组织恒为真（一个组织当然与它自己同树），个人组织也不例外。
> **这不是把个人组织的门放宽了**：消费者拿这个谓词判的是**两个不同组织之间**能不能流转
> （[CS-4](#cs-4-分享边界有共同上级)），同一个组织内部不过这道判定。
> **实现不得把 `o` 与自己的那一次求值当成一条跨组织放行依据。**

## 五、隔离义务

> **这一节是本契约的核心。**它约束的不是本契约自己的数据，而是**每一个持有租户范围对象的 owner**。
> 每一条都写成可被另一个 owner 照着自检的形式：**谁在何处保护**回答「这条要落在你代码的哪个位置」，
> **违反时可观察到什么**回答「你怎么知道自己漏了」。没有第二栏，条款就只是一句愿望。
>
> 这些义务**不需要一个守门插件来集中兑现**——集中之后就会留下「守门通过但数据层没校验」的那条路。
> 它们要的是**每个 owner 各自不漏**，所以写成一份共用的同形条款。
>
> **适用对象**：一切受[租户](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)或组织所有权约束的对象，
> 以及一切跨范围操作。

### S-16 按归属层显式携带身份值

**受所有权约束的对象与跨范围操作，按对象所属的层显式携带对应的 [ScopeLayerIdentity](#s-11-scopelayeridentity) 值**：
租户级携带 TenantId，组织级携带 OrganizationId。**跨范围操作另外携带发起方的 TenantId。**

> 写成「按归属层携带对应的值」而不是「一律携带 TenantId」，是因为组织级对象的归属就是组织：
> 逼它塞一个 TenantId，那个值要么是编出来的，要么会被后来的人当成「这份东西归某个成员」。

**持久形状写死一种：存一个带判别式的 [`ScopeLayerIdentity`](#s-11-scopelayeridentity)。**
**不得**改存成「两个可空字段（`organizationId?` 与 `tenantId?`）＋ 谁不为空算谁」那种形状。
两种写法看起来等价，实际差三件事：

1. **后者能同时为空**，而那正是 [S-18](#s-18-缺席即拒绝) 要拒的输入——它在形状上就构造不出来才对；
2. **后者能同时非空**，于是「这份东西归哪一层」有了两个答案，读的人各挑各的；
3. **判别式是[闭合枚举](#s-32-判别式集合闭合)**，将来 [G-01](#十已知缺口) 补上会话那一格时，
   漏改的消费者会**当场拒绝未知取值**；两个可空字段那种形状只会**静默把新的一格读成「两个都空」**。

**判别式对不上载荷时按非法输入拒绝**（`layer = "tenant"` 却带 `organization`，反之亦然），
这一条 Schema 管得到，见[第七节](#schema-管得到什么)。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每个 owner 在**数据访问的那一层**（最贴近存储的那一层，不是它上面的服务门面）：对象的持久形状里有这个字段，且它是一个带判别式的 `ScopeLayerIdentity`；每条访问路径的入参里有这个值 | 取一条持久记录，其中**找不到**归属身份字段，**或找到的是两个可空的身份列而不是一个判别式**；或存在一条能读到租户范围对象、而调用签名里没有身份值的路径；或一个跨范围操作的签名里没有发起方身份参数 |

### S-17 身份参数没有默认值

**承载身份的参数与字段一律没有默认值，也不从别处推断。**

不得从环境变量、进程状态、当前工作目录、最近一次调用、线程/协程局部存储、Cordis Context、
**「当前登录状态上的那项选择」在使用点现取**——现取会让同一份工作在用户中途切换后改变归属
（[S-28](#s-28-当前租户身份在创建那一刻捕获)）。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每个 owner 的接口定义（该参数必需且无默认值）＋[静态检查](../verification.md#静态检查义务) | 某个调用不传身份也能成功；或该参数是可选的且省略时返回「全部」；或同一次流程的前后两步算出了不同的 TenantId |

### S-18 缺席即拒绝

**身份值缺席（[S-12](#s-12-缺席与空值都不是身份值)）、格式非法、分量不完整 ⇒ 拒绝。**
**不放行、不返回空集、不回退到任何其他范围、不选一个「合理的默认」。**

> **本条与 [S-19](#s-19-不可用即明确失败) 是两条，不能合并。**
> 本条给的是一个**授权结论**：没有身份就没有资格，这个答案是确定的，重试也不会变。
> S-19 给的是一个**错误**：判定根本没做出来，按当时实际状态重试是有意义的。
> 合成一条，消费者就只剩一个分支，而那个分支必然把其中一种情形讲成另一种。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每个 owner 的准入判定的**第一步** | 不带身份的请求得到了 `200` 与一个空列表——这比拒绝更危险，调用方会以为「这个租户下确实没有东西」 |

### S-19 不可用即明确失败

**判定依据读不到时，消费者明确失败。**

**「判定依据」不是一句概括，它恰是下面这张表里的四类读面。**
**适用面写成枚举，是为了让消费者能逐行自检**——写成「凡是读不到」，
每个 owner 都会按自己手上那一类去理解，而漏掉的那几类**不会有人报错**：

| # | 读面 | 读不到长什么样 | 失败要与什么分辨开 |
|---|---|---|---|
| 1 | **成员资格读面** | [S-10](#s-10-membershipstanding) 的 `{ failure: "unavailable" }`（准入判定必须用的那个读面见[那一节](#准入判定必须用的那个读面在哪它的-unavailable-就是这一支)；**表示层拒绝 `invalidInput` 不在本行**——它在 `MembershipStandingResult` 之外，是[没进过判定的拒绝](#s-33-表示层校验与判定分开)，不是「读不到」） | `ineffective`——**判出来的无效** |
| 2 | **[上级链](#s-14-上级组织与上级链)求值**（含 [`shareAncestor`](#s-15-shareancestor)） | 任何一跳读不到组织记录 | 「链走到头了」与「两条链无交」——**都是判出来的结果** |
| 3 | **当前租户身份查询**（[S-28](#s-28-当前租户身份在创建那一刻捕获) 说的那个查询面，即 `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1` 的 [S-36 当前租户身份查询](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)） | 登录状态校验读不到、或那项选择读不到 ⇒ [S-36](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) ⑧ 的 **`unavailable`** | **S-36 的两个已做出的出口**：④ 该登录状态**尚未切换过**时给出的**初值 `TenantId`**（`(该账号的个人组织, 该账号)`，**是一个答案，不是「还没选过」这种无值状态**）；⑧ 登录状态校验**说「拒绝」**时给出的 **`loginStateNotValid`**（**一次成立的校验结论**）。**两者都不是读失败** |
| 4 | **任何被本契约点名的其他判定依据读面**——持有记录（[S-21](#s-21-判定依据的构成封闭)）、组织记录、账号记录 | 读不到 | 「查出来没有这一条」 |

**每一行的右列都是一个已经做出的判定，左列都不是。**
本条要挡的正是把左列折进右列；**四类一视同仁，没有哪一类可以「读不到就当没有」。**

- **不得**视作 `ineffective` 继续；
- **不得**[静默回退到个人范围](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)或任何其他范围；
- **不得**降级为「只读」、返回空集，或用「稍后重试」掩盖成一次成功；
- **不得**返回缓存的旧结果（[S-27](#s-27-每道准入现读)）；
- 失败要能与上表右列分辨开——**两者在调用方看到的结果值不同**。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每个调用上表四类读面的 owner，在拿到结果之后的分支里——**成功与失败两支都要落地，不得合并**；成员资格那一类具体是拿到 `MembershipStandingResult` 之后的那次分支 | 把成员记录的存储停掉，某个入口开始表现得像「这个人被移出了组织」——甚至据此执行了清理；或把组织记录的存储停掉，一次跨组织分享被判成「不在同一棵树上」而拒绝，**收场与真的越界一模一样，没人看得出发生过读失败**；或调用成功并返回了个人范围的东西 |

### S-20 六条路径同一判定

**读、写、覆盖、删除、订阅、清理——六条路径走同一个判定，不是六份各写各的。**
订阅指事件订阅与推送；清理指后台任务、过期回收、批量迁移。

| 路径 | 容易漏在哪 |
|---|---|
| 读 | 一般不漏 |
| 写 | 一般不漏 |
| **覆盖** | 按键 upsert 时只校验「有没有这条」，不校验「这条是不是你的」 |
| **删除** | 批量删除按前缀/通配走，绕过单条判定 |
| **订阅** | 事件流按主题订阅，主题里没有身份分量；或有身份分量但**只用于过滤**（见 [S-23](#s-23-不得冒充隔离)） |
| **清理** | 后台任务、过期回收、迁移脚本**不经过准入判定** |

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每个 owner：**同一个判定函数被六条路径共同调用**；后台与批处理**不得**走绕过它的内部接口 | 对同一个对象：读被拒绝，但删除、订阅或后台清理没有被拒；或读路径有判定而清理任务直接按时间戳扫全表 |

### S-21 判定依据的构成封闭

**适用面：[租户范围对象](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object)的准入判定**——
「**这个身份此刻能不能碰这个对象**」。**本条只封闭这一种判定的输入。**

**这一种判定的依据构成是封闭的三样：`(显式携带的身份值, 持有记录, 成员资格效力)`。**

> **另有一种判定不在本条的封闭里，必须写出来，否则读者会以为它违反了本条：
> [流转边界判定](#s-15-shareancestor)**——「**这两个组织之间能不能流转**」。
> 它的输入是 **[上级链](#s-14-上级组织与上级链)**，那是**组织结构事实**，
> 既不是身份值、也不是持有记录、也不是成员资格效力。
>
> **两者是两道判定，通常都要过**：[CS-4](#cs-4-分享边界有共同上级) 先问流转边界，
> [CS-3](#cs-3-资产复制的前提)、[CS-5](#cs-5-成员无效时不可达但不销毁) 再问准入。
> **上级链不得被塞进准入判定的输入里**——那会让「你是不是这个租户的有效成员」
> 变成一个跟隶属树形状有关的问题，而[子组织不继承上级组织的任何东西](#s-11-scopelayeridentity)。
> 反过来，**组织结构事实同样受[读失败义务](#s-19-不可用即明确失败)约束**（那张表的第 2 行）。

**以下一概不构成资格**，出现在判定依据里即为违反：

- 物理路径、当前工作目录、同盘存放、目录归属；
- 操作系统用户、进程身份、容器/命名空间名称、进程环境变量；
- 存储位置、分片名、数据库/表/桶的名字；
- 网络位置、调用来源主机、请求头里未经验证的字段；
- **运行实例身份**（Cordis `Fiber.uid` 一类）。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每个 owner 的判定函数的**入参类型**——它只接得住这三样；[静态检查](../verification.md#静态检查义务)核对其输入集合 | 判定函数签名里出现路径或环境类型；或把进程换个工作目录启动、换个 OS 用户运行，同一个请求的放行结果变了 |

### S-22 路径是地址不是钥匙

**[工作区](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)当然要记路径**——
那是**指认它是哪一份**：路径指认的是[承载它的那个目录](../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区不是目录)，
**工作区本身不是目录**，是租户持有的一级归属。资格是另一回事：来自那条持有记录归哪个租户，以及来者此刻是不是该租户的有效成员。

**同一个宿主机目录被两个不同的 TenantId 分别挂上，那是两份工作区**，
各持各的资产、各配各的值、**互相看不见**。TenantId 是工作区身份的一个**必需分量**，不是一项可选标注。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 资产领域的 owner（持有记录以 TenantId 为分量）＋执行环境的 owner：**先**由身份值与持有记录求出适用范围，**再**用路径指认是哪一份 | 换一个租户身份进到同一个目录，看见了另一个租户的那一份；或工作区记录以路径为唯一键；或存在「按目录反查归属」的解析 |

> 本条定的是**谁有资格**，不是**用什么机制拦住越权的文件读写**——
> [后者不归身份模型](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位)。

### S-23 不得冒充隔离

**不得以服务可见性隔离、事件过滤、缓存键前缀或界面筛选冒充隔离。**

- **服务可见性隔离**（Cordis `isolate` 一类）隔的是**服务实例的可见性**。
  一个服务实例内部握着跨租户的数据句柄，隔离多少次都无效。
- **事件过滤**决定**谁收到通知**，不决定**谁有权读到内容**；绕过订阅面直接读，过滤器不在路径上。
- **缓存键前缀**只是把数据放在不同的格子里；没有判定，换个前缀就能取到别人的格子。

**任何声称提供隔离的接口，必须能指出隔离实施在哪一行、哪一层。指不出来，就是没有。**

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 数据访问层；每个 owner 在声明「本接口隔离」时给出实施位置，架构评审逐个核对 | **去掉那层 isolate 标签、过滤器或前缀之后，同一次调用仍然返回了跨租户的数据**——这说明判定本来就不在数据访问层 |

### S-24 账号记录不含跨账号关联字段

一个现实中的人可以持有多个账号；系统**不核验、不关联、也不记录**两个账号是否属于同一人。

账号记录里不得有「同一人的其他账号」「关联账号」「主账号」「合并自」这类字段，也不得有共享设备或
联系方式的聚类键；**任何 owner 也不得另建一张表来表达这种关联**。
[账号是一个自然人全部 context 的最大边界](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)，
这道边界是身份的推论，**边界上没有可配置的东西**。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 账号那一侧的 owner（数据形状）＋[静态检查](../verification.md#静态检查义务)逐字段核对；其余 owner 不引入跨账号依据 | 存在一条从 AccountId A 出发、不经过任何组织，就能到达 AccountId B 的数据的路径；或去重/合并逻辑把两个账号当成一个 |

### S-25 个人 context 不进任何层

**[个人 context](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-personal-context--个人-context--personal-context)
不是[范围化对象](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object)，不进任何层。**

它由账号承载，跟着人走，在所有组织里都一样；**不参与任何层的求值，也不被任何层配值**。
反向同样成立：账号的身份事实（登录标识、凭据、激活状态）**同样不是范围化对象**，
不得被当作某一层的设置或权限。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 账号那一侧的 owner（不把它挂进层）＋[属性配值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)的写入点（键里只有归属层身份与资产持有，容不下账号级的项） | 切换组织之后界面语言变了；或某个组织能为成员配「界面语言」；或「是否已激活」能被某一层配值 |

> 个人 context 里**具体有哪些项**是已知缺口 [G-03](#十已知缺口)。本条只定它在哪个轴上，**不列项**。

### S-26 成员无效使租户级持有不可达但不销毁

**解除成员关系只改成员记录的有效性**：**不铸新身份、不发出任何删除、不改任何持有的键。**

持有仍以那个 TenantId 为键留在原处；
[重新加入之后原样可用](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)，
**这不是一次恢复动作**——没有东西被删过，也就没有东西需要恢复。

`ineffective` **不是删除信号**。读面以**「不可用」失败**时**尤其不得**据此执行本条的任何清理
（[S-19](#s-19-不可用即明确失败)）。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 资产领域的 owner：以**成员资格效力**决定可达，以**持有记录**决定存在——两者不是同一个判断 | 解除成员触发了一次删除、迁移或改键；或重新加入之后需要重建；或「不可达」被实现成把持有记录的 TenantId 置空 |

### S-27 每道准入现读

**角色变更、退出、撤权、撤销分享影响的是[下一道尚未通过的准入](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)。**
旧菜单、缓存与历史成功不能继续当作授权。

允许缓存判定结果，但缓存必须：**写明失效条件与最大陈旧窗口**；
**以完整身份值为键**（不得跨身份复用一条缓存）；
**在读面以「不可用」失败时不写入**（否则把一次读不到固化成了一个答案）。
**不得**留一个「通常很快就会更新」。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每个 owner 的每一道准入判定点；缓存声明处写明失效条件 | 一个人已被移除或降级，下一次操作仍被放行；或找到一个授权缓存，**说不出它什么时候失效** |

### S-28 当前租户身份在创建那一刻捕获

**[当前租户身份](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity)
是创建那一刻捕获的值。**它本身**不是范围化对象**，不参与任何层求值。规则三句：

- **查询面给值**：「此刻以哪个租户身份行事」是挂在一次登录状态上的一项选择，
  由组织治理契约的查询面按 LoginStateId 给出一个 TenantId。
- **产生租户归属数据的流程，在开始时取一次这个值并随之固定**，此后一切以它计：
  归属记在它名下、成本算在它头上、能用什么按它求值。
- **此后这项选择被改成别的，已经创建的那些一概不跟着变。**

据此，任何在某个租户身份下创建的对象**持有创建那一刻的那个 TenantId 值**，
**不是一个指向「当前选择」的引用**。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每个创建租户归属数据的 owner：在**流程入口**取值、在对象的持久形状里**存值**，此后只读它自己持有的那个值 | 一次会话上午算在一个租户头上、下午算在另一个头上；或对象只存了 LoginStateId，归属靠「现在查一下这次登录选的是谁」算出来——那就是随人漂移 |

### S-29 层事实只以显式身份值为键

- 一层的事实**不因**切换组织被复制到另一层，**方向两边都算**；
- 任何层的事实以**调用方显式给出的 TenantId / OrganizationId** 为键写入，
  **不以 AccountId 为键**、也不以 LoginStateId 为键；
- 个人范围的权限与资产**不因**加入组织而共享；
  [组织的超级管理员身份](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)**不带来**成员个人范围的访问权。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每个持有层事实的 owner 的写路径 | 切换一次组织之后，另一个层里多出了原本不在那里的配值或资产；或某张层事实表的主键里出现了 AccountId；或存在「把我的设置带过去」这类跨层复制路径 |

### S-30 跨边界须重新验证

**持有一个 TenantId 不表示持有者有权以它行事：身份值只声称身份，不证明资格。**

进程内的归因信息**不自动成为远程凭证**：跨进程、跨队列、跨节点传递时，
**显式携带身份与授权依据，并在接收边界重新验证**。
缺失、冲突、未经授权的跨租户访问**一律默认拒绝**。

> **单机下这条不会被触发，分布式最容易漏**：进程内传参天然可信，于是没人写重验；
> 等到同一段代码被搬到队列消费者后面，那份信任就变成了一条没有判定的入口。
> 本条先立，是为了让那次搬运有据可依。

| 谁在何处保护 | 违反时可观察到什么 |
|---|---|
| 每一个接收边界（RPC 入口、队列消费者、事件处理器） | 构造一条**只带 TenantId、不带任何授权依据**的消息：接收方直接按该租户执行；或内部调用跳过验证，理由是「都是自己人」 |

## 六、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：
第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变的判定**——即**单机由装配（同一存储、同一进程）顺带给的**那些：
> 它们的兑现方式随部署形态改变，右列写**分布式必须由协议重新兑现什么**。
> 少数几行右列写的是「**不变**」（[S-5](#s-5-tenantid-的构成与相等)、[S-13](#s-13-sameaccountdistincttenants) 这类纯值判定不需要任何协调）——
> **那个结论本身也要写出来**，否则读者会以为它被漏掉了。
>
> **不在表里不等于不适用。**本契约的条款在任何部署形态下一律成立；
> **没有列出来，只说明它既不靠装配顺带给出、也不因跨进程而改变兑现方式**。

**这张表本身是契约的一部分，不是流程笔记**：装配给的那些，在演化到分布式时**不会自动成立**，
谁也不得因为「现在是单机」而省掉。

| 判定 | 单机由谁给 | 分布式必须由协议重新兑现什么 |
|---|---|---|
| AccountId / OrganizationId / LoginStateId **部署内唯一**（[S-1](#s-1-accountid)、[S-3](#s-3-organizationid)、[S-9](#s-9-loginstateid)） | 单一生成点 ＋ 存储的唯一约束 | **跨节点标识分配**。唯一性是承诺，不是「碰撞概率足够低」；碰撞的收场须写进契约 |
| **登录标识唯一**（[S-2](#s-2-登录标识不是-accountid)） | 存储的唯一索引；未激活也占用 | 同上；**占用与激活是两件事**，占用必须先于并跨节点可见 |
| **TenantId 结构相等**（[S-5](#s-5-tenantid-的构成与相等)） | 值比较 | **不变**——纯值判定，不需要任何协调。这是把 TenantId 做成值类型而不另铸标识的收益 |
| **规范序列化形式**（[S-7](#s-7-tenantid-的规范序列化形式)） | 不变 | 不变。**但标量编码的「一个部署一条规则」须成为显式协议**，否则同一租户在两处得到两个索引键 |
| **`sameAccountDistinctTenants`**（[S-13](#s-13-sameaccountdistincttenants)） | 值比较 | 不变 |
| **成员资格效力的新鲜度**（[S-10](#s-10-membershipstanding)） | 同一存储的现读；写后立即可见 | **可见性窗口**必须成为消费者契约的一部分：解除成员之后多久内旧节点仍可能读到 `effective`。未定义前，消费者不得把「刚才读到有效」当作「此刻有效」。**读面的「不可用」失败在任何部署下仍是失败，不因跨节点而变成一个效力值** |
| **上级链与 `shareAncestor`**（[S-14](#s-14-上级组织与上级链)、[S-15](#s-15-shareancestor)） | 同一存储多行读，读一致性由存储给 | **读一致性**须显式定义；陈旧读不得放行跨组织流转 |
| **六路径同判**（[S-20](#s-20-六条路径同一判定)） | 同一进程内同一判定函数 | **每个远端接收边界重新校验**（[S-30](#s-30-跨边界须重新验证)）。**不得**只在网关校验一次就认为全链成立——那正是 [S-23](#s-23-不得冒充隔离) 禁止的冒充 |
| **判定依据不含物理位置**（[S-21](#s-21-判定依据的构成封闭)） | 静态检查 | 不变——**且更要紧**：多节点部署下「同一台机器」这个巧合会更频繁地出现 |
| **缓存失效**（[S-27](#s-27-每道准入现读)） | 进程内失效即时 | **失效传播**须有上界并写进契约；跨节点缓存不得以「最终会过期」代替失效条件 |
| **归属层身份随请求到达数据访问层**（[S-16](#s-16-按归属层显式携带身份值)） | 同一进程内传参：值从入口一路传到最贴近存储的那一层，**中途不会丢** | **每一跳的传输格式**须显式承载那个带判别式的 `ScopeLayerIdentity`。**最常见的退化是在序列化时把它压平成两个可空字段**——那恰是 [S-16](#s-16-按归属层显式携带身份值) 禁止的形状，而压平发生在协议层，本地类型检查看不见 |
| **捕获的归属值随请求传播不被重算**（[S-28](#s-28-当前租户身份在创建那一刻捕获)） | 同一进程内，捕获到的那个 TenantId 沿调用栈传下去 | **下游节点不得就地重取「当前租户身份」**。跨进程后每一跳都能访问到那个查询面，于是「顺手查一下」变得极易写出，而它会让同一次工作的后半段算到另一个租户头上。**捕获值必须随消息传，且接收方按 [S-30](#s-30-跨边界须重新验证) 重验它有没有资格用这个值** |
| **不可达但不销毁**（[S-26](#s-26-成员无效使租户级持有不可达但不销毁)） | 单一存储：解除成员只写成员记录一行，持有记录**根本没被碰到** | **须显式约定「解除成员不产生任何面向持有方的删除指令」**。多节点下解除通常以事件广播，而一个名为「成员已失效」的事件**极易被持有方实现成一次清理**；本条在分布式必须写成「该事件的消费者不得删除、迁移或改键」，否则这条不变量会被一个各自实现的事件处理器悄悄破掉 |
| **读不到即明确失败，且失败以返回值到达调用方**（[S-19](#s-19-不可用即明确失败)） | 四类读面都在同一进程、同一存储内：读失败**就是那次调用的返回值**（成员资格那一类由 [`MembershipStandingResult`](#s-10-membershipstanding) 的失败支承载），**中途没有别的东西会把它变形** | **须显式约定读失败在协议上的形状**。跨进程后「读不到」先表现为**传输层的事**——超时、连接断开、反序列化失败、网关 5xx——而这些默认**不长成一个返回值**。协议须把它们**一律映射到同一个「不可用」失败支**并保证它以返回值到达调用方；**不得**在网关或客户端桩处折成空结果、默认值或一个异常，**那等于把 [S-19](#s-19-不可用即明确失败) 挡的事搬到本地类型检查看不见的地方做** |
| **不得冒充隔离**（[S-23](#s-23-不得冒充隔离)） | 判定在**数据访问层**；服务可见性隔离、事件过滤、缓存键前缀都在它之上，**把它们去掉判定仍在**（这正是本条的核对方式） | **不变，且多出一批新的冒充物**：按租户分主题、分片、分库，甚至每租户一套独立部署，**都不构成隔离**——它们是**地址**（[S-34](#s-34-语义身份与实现地址分开)）。**网关校验一次也不算**（见上面「六路径同判」那行）。**每一个远端的数据访问层仍须各自指出判定实施在哪一行**，指不出来就是没有 |
| **交接凭证不可伪造**（[S-35](#s-35-交接凭证-handoff-warrant)） | 同进程 nonce 登记：产出方与核实方在同一进程内，核实方直接向产出方查 | **须由协议兑现**——签名或双方可读的共享登记。**这条是所有次序守卫的地基**：伪造一旦可能，以凭证为前置的条款全部变成空条款，**且每一步仍返回 `ok`，没有任何观测会报错**。进程重启也在这里：nonce 登记只活在内存里，**重启即失效**，届时旧凭证一律核实不过（这是安全的方向，但重试要能重新产出） |

## 七、表示与边界校验

- **规范表示**：[`identity-values.schema.json`](identity-values.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/identity-values/v1/identity-values.schema.json`
- **定义项**（12 项）：`OpaqueIdentifier`（内部基）、`LoginIdentifier`、`AccountId`、`OrganizationId`、
  `LoginStateId`、`OrganizationKind`、`TenantRole`、`TenantId`、`MembershipStanding`、
  `MembershipStandingResult`、`ScopeLayerIdentity`、`HandoffWarrant`。
  消费者 `$ref` 这些定义，**不复制一份同义类型**。
  其中**十项是值**；`MembershipStandingResult` 是**读面的操作结果包装**，
  `HandoffWarrant` 是**步骤间的凭证**（[S-35](#s-35-交接凭证-handoff-warrant)）——**后两项都不是身份值**。
- **根模式不约束任何文档**：本文件是共享定义的登记处，不是某个消息的形状。
- **正反实例**：[`examples.md`](examples.md)。它是本版的规范工件，不是说明材料。

### S-31 不透明标识的交换表示

**不透明标识的交换表示是非空字符串，相等是逐码点精确相等。**

不做 Unicode 规范化、不做大小写折叠、不做首尾空白裁剪；**因此表示上禁止首尾空白**——
否则两个只差一个空格的串会在某些实现里被当成同一个。

#### 「空白」是一个显式码点集合，不是 `\s`

**本契约不用 `\s` 这个记号定义空白**，因为它**在不同正则引擎里是不同的集合**：
ECMA-262 的 `\s` 含 U+FEFF，Python 的不含；把定义交给 `\s`，
**同一个标识串会在两个实现里一个被收、一个被拒**，而这正是身份值最不能有的分歧。

**「空白」恰是下列码点，逐个列出：**

| 码点 | 是什么 |
|---|---|
| U+0009 – U+000D | TAB、LF、VT、FF、CR |
| U+0020 | 空格 |
| U+0085 | NEL |
| U+00A0 | 不换行空格 |
| U+1680 | OGHAM SPACE MARK |
| U+2000 – U+200A | 各种定宽空格 |
| U+2028、U+2029 | 行分隔符、段分隔符 |
| U+202F | 窄不换行空格 |
| U+205F | 数学空格 |
| U+3000 | 表意空格 |
| U+FEFF | 零宽不换行空格（BOM） |

**首字符与末字符都不得属于这个集合**；中间出现不受本条限制（词法归 [G-04](#十已知缺口)）。

**尾部的判定要用绝对结尾**：Schema 的 pattern 以 `(?![\s\S])` 收尾，**不用 `$`**。
理由是 `$` 同样不可移植——**Python 的 `$` 匹配到「末尾换行之前」**，
于是 `"acc_7f3c91\n"` 这种带尾随换行的串会被 Python 判为合法、被 JavaScript 判为非法。
`(?![\s\S])` 在两边都只匹配**真正的字符串末尾**。
两条反例（尾随换行、前导 U+FEFF）登记在
[`examples.md` 第 1 节](examples.md#1-accountid)，**它们正是这两处引擎差异的回归用例**。

**消费者不得解析标识的内容**推断任何事实：不得从中读出创建时间、序号、类型、所属，也不得按前缀分组。
它不透明，这是它唯一的约定。**具体词法形式（长度、字符集、是否 UUID）本契约不承诺**，
归 realization（[G-04](#十已知缺口)）。

### S-32 判别式集合闭合

`OrganizationKind`、`TenantRole`、`MembershipStanding.standing`、`ScopeLayerIdentity.layer`
各是一个**闭合枚举**。

遇到未知取值**一律作非法输入拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、
**不得**忽略该字段继续。理由——这四个枚举里每一个未知值都可能是一个更宽的资格，
静默降级会把它变成一次放行。

### S-33 表示层校验与判定分开

表示非法的输入**在进入任何判定之前**被拒绝。
这次拒绝**不表示**「该对象不存在」或「该主体无资格」，也**不得被记成一次判定结果**。

反过来：**表示合法不表示任何资格**——Schema 校验通过只说明形状合规，见下表。

### S-34 语义身份与实现地址分开

存储主键、表名、文件路径、目录名、缓存键、消息队列主题、度量标签，都是**地址**；
**身份只由本契约的值确定**。

任何一方**不得**把地址回读成身份，也不得因为两个对象地址相邻、同盘或同目录就认为它们同属一个租户。
进程内的某个对象引用同样不是 TenantId。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 表达不了的那部分归谁 |
|---|---|---|
| [S-1](#s-1-accountid)/[S-3](#s-3-organizationid)/[S-9](#s-9-loginstateid)/[S-31](#s-31-不透明标识的交换表示) 不透明标识 | **只管「非空、首尾不属于 [S-31](#s-31-不透明标识的交换表示) 那个显式空白码点集合的字符串」**；pattern 用显式字符类与 `(?![\s\S])` 绝对结尾，**不用 `\s` 与 `$`**，因此在不同引擎上判定一致 | 「部署内唯一」「不可解析」「不来自运行时」是行为约束：唯一性归存储与协议（[第六节](#六装配给与协议给)），其余归[静态检查](../verification.md#静态检查义务) |
| [S-2](#s-2-登录标识不是-accountid) 登录标识 | 管形状 | 「不作引用键、不进 TenantId」是用法约束，归静态检查与各消费者契约 |
| [S-4](#s-4-organizationkind) OrganizationKind | 管取值域 | 「personal ⇒ 不可邀请/上级恒空/不可作上级」是跨对象约束，归组织治理契约与其结构模型 |
| [S-5](#s-5-tenantid-的构成与相等)/[S-7](#s-7-tenantid-的规范序列化形式) TenantId | **完全管得到**：两个分量、均非空、无多余成员、无 role | — |
| [S-6](#s-6-tenantid-无生灭路径) 无生灭路径 | **管不到** | 「不存在销毁写路径」归静态检查 |
| [S-8](#s-8-tenantrole) TenantRole | 管取值域与单值 | — |
| [S-10](#s-10-membershipstanding) MembershipStanding | **完全管得到**：恰两值、`effective` 必带角色、`ineffective` 必不带 | 效力怎么算出来归组织治理契约 |
| [S-10](#s-10-membershipstanding) `MembershipStandingResult` | **管得到两支互斥**：效力值与 `{ failure: "unavailable" }` 形状不同，消费者分不掉。**恰两支**——`invalidInput` 不在本类型里，一个带它的实例会被拒（[`examples.md` 第 9 节](examples.md#9-membershipstandingresult) 的闭合取值那两行） | 「拿到失败之后必须怎么做」的**行为**归 [S-19](#s-19-不可用即明确失败)；**表示层拒绝那一支**由调用的那个操作自己的失败集合承载（[S-33](#s-33-表示层校验与判定分开)），**Schema 管不到那一层** |
| [S-11](#s-11-scopelayeridentity) ScopeLayerIdentity | 管两个变体与各自载荷；**不含 `session` / `workspace` / `account` / `factoryDefault`**；**判别式与载荷对不上即拒**（[S-16](#s-16-按归属层显式携带身份值) 要的那种持久形状） | 会话级由会话充当（词条已定），**标识表示**是缺口 [G-01](#十已知缺口) |
| [S-35](#s-35-交接凭证-handoff-warrant) HandoffWarrant | **只管「非空、首尾无空白的字符串」**，与不透明标识同形 | **六条性质一条也管不到**——产出点、绑定、核实义务、**不可伪造**，全部是行为约束。绑定字段的形状（凭证里怎么带 AccountId）**由 realization 定**，本契约只约束到非空；核实义务归产出方与核实方各自的契约 |
| [S-12](#s-12-缺席与空值都不是身份值) 缺席与空值 | 管 `required`、`minLength: 1`、不允许 `null` | 「拒绝」这个行为归 [S-18](#s-18-缺席即拒绝) |
| [S-32](#s-32-判别式集合闭合) 枚举闭合 | 管拒绝未知取值 | 「不得降级」这个行为归消费者 |
| [S-16](#s-16-按归属层显式携带身份值)～[S-30](#s-30-跨边界须重新验证) 隔离义务 | **一概管不到**——它们约束的是别的 owner 的路径与判定。**唯一沾边的一点**：S-16 要求的那个归属字段，其**取值形状**由 `ScopeLayerIdentity` 管（判别式与载荷必须对得上）；但「**每条路径的入参里有这个值**」这一半仍然管不到 | **静态检查 ＋ 消费者契约的条款**，见[验证入口](../verification.md)；持久形状那一半是 [SC-9](../verification.md#静态检查义务) |

**非法输入的含义**：Schema 校验失败 ⇒ 该输入**不是**一个身份值 ⇒ 触发 [S-18](#s-18-缺席即拒绝) 拒绝。
**校验失败不得降级为「按默认处理」或「尽力而为」。**

## 八、性质与消费者场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | TenantId 的相等恰由两个分量决定，规范形式唯一 | 不变量 | [PF-001 §4 租户](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户) | Schema（形状）＋各 owner 的比较实现（[S-5](#s-5-tenantid-的构成与相等)、[S-7](#s-7-tenantid-的规范序列化形式)） | 出现第二种相等判据；或两个分量相同的 TenantId 被当成两个租户 |
| P-2 | TenantId 无生灭路径，已记录的引用永不悬空 | 不变量 | [PF-001 §4 退出之后再加入](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户) | 各 owner：不存在以「租户被删」为前提的路径（[S-6](#s-6-tenantid-无生灭路径)、[S-26](#s-26-成员无效使租户级持有不可达但不销毁)） | 成员解除后，历史署名指向一个查不到的身份 |
| P-3 | 角色不进身份 | 不变量 | [PF-001 §6.7 作者用租户身份标识](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识) | Schema（`additionalProperties: false`）＋[S-5](#s-5-tenantid-的构成与相等) | 升降职之后此前产出的署名变了 |
| P-4 | 组织变体创建时定、无写路径 | 不变量 | [PF-001 §4 个人组织](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织) | 数据形状（[S-4](#s-4-organizationkind)）＋静态检查 | 存在把 `personal` 改成 `team` 的操作 |
| P-5 | 个人组织恒不在任何上级链上 | 不变量 | [PF-001 §4 个人组织](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织) | [S-4](#s-4-organizationkind)＋组织治理契约的写路径前置 | 存在一条含个人组织的隶属链 |
| P-6 | 上级链不成环、至多一个上级 | 不变量 | [PF-001 §4 组织](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织) | [S-14](#s-14-上级组织与上级链)＋组织治理契约的判环（与写入同提交） | 「谁是谁的上级」答不出来 |
| P-7 | 出厂默认层没有一个身份对象占那一格 | 不变量 | [PF-001 §6.1 层次](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次) · [§6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) | 闭合枚举（[S-11](#s-11-scopelayeridentity)、[S-32](#s-32-判别式集合闭合)） | 归属字段里出现一个没有自然人对应的「平台租户」 |
| P-8 | 受约束对象显式携带身份，缺席即拒绝 | 安全 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) · [PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | 各 owner 的数据访问入口（[S-16](#s-16-按归属层显式携带身份值)～[S-18](#s-18-缺席即拒绝)） | 存在不带身份也返回非空的入口 |
| P-9 | 六条路径同判 | 安全 | [PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | [S-20](#s-20-六条路径同一判定) | 覆盖、删除、订阅或清理能触及另一租户 |
| P-10 | 判定依据的构成封闭，物理位置不构成资格 | 安全 | [PF-001 §6.5 本地资源定位](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位) | [S-21](#s-21-判定依据的构成封闭)、[S-22](#s-22-路径是地址不是钥匙)＋静态检查 | 换目录或换 OS 用户改变放行结果 |
| P-11 | 读面的「不可用」失败不被折叠成 `ineffective` | 安全 | [PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | [S-10](#s-10-membershipstanding)（`MembershipStandingResult` 的两支）＋[S-19](#s-19-不可用即明确失败)（行为） | 存储抖动期间发生了本该拒绝的清理 |
| P-12 | 两个账号之间没有任何通路 | 安全 | [PF-001 §4 账号](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号) · [§6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | [S-24](#s-24-账号记录不含跨账号关联字段)＋静态检查 | 存在一条不经组织的跨账号读路径 |
| P-13 | 归属在创建那一刻被捕获，此后不漂移 | 安全 | [PF-001 §4 当前租户身份](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份) · [PF-015 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) | [S-28](#s-28-当前租户身份在创建那一刻捕获) | 同一会话的成本上午下午算在两个租户头上 |
| P-14 | [交接凭证](#s-35-交接凭证-handoff-warrant)不可伪造，且绑定对象标识 | 安全 | **无产品出处**——规格层为「让次序守卫在运行期有对应物」自立，[理由见 S-35](#s-35-为什么不立统一语言词条) | [S-35](#s-35-交接凭证-handoff-warrant) 的六条性质；核实由两个实例各自的契约兑现；机制归 realization，单机[装配给](#六装配给与协议给)、跨进程由协议兑现 | **自己编一份字符串就能通过核实**——此时以凭证为前置的次序条款**全部变成空条款，而每一步仍返回 `ok`**；或一份为 A 产出的凭证在 B 身上通过；或一份旧凭证重放之后，核实方**没有**在自己提交里现读状态前置就执行了被守卫的那一步（[性质 4](#性质-4-在两个实例上为什么站得住)） |

**进展性质：本契约不拥有任何进展性质。**值不会「最终成为」别的值；
一切与时间有关的推进（成员资格何时生效、撤销何时可见）归产生这些值的能力契约。

**本契约不建行为模型，也不建结构模型。**它没有状态转移（[S-6](#s-6-tenantid-无生灭路径) 无销毁路径、
[S-4](#s-4-organizationkind) 无变更路径，这两条本身就是「没有这条边」），
在这里建行为模型只会产出一份与 Schema 同义的平行工件。
[S-4](#s-4-organizationkind)、[S-14](#s-14-上级组织与上级链)、[S-15](#s-15-shareancestor)
的结构约束由**组织治理契约的结构模型**检查——**那份模型消费本契约的值定义，本契约不另造一份平行模型**。
证据义务与状态在[验证入口](../verification.md)。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**
> **这些场景是本契约的验收面**：任一条走不通，缺口在本契约，不在消费者那边。
>
> **编号 `CS-1`～`CS-10`（Consumer Scenario），本节是它们的唯一定义处。**
> **不要与 [`examples.md` 第 13 节](examples.md#13-隔离义务的规范场景)的 `IS-1`～`IS-10` 混读**：
> 那一组是**隔离义务的演练脚本**（怎么做、通过判据是什么），
> 本节这一组是**消费者路径的走查**（某个 owner 照着本契约能不能把事办成）。
> 两组各自登记在[验证入口](../verification.md#证据义务)，**证据不互相顶替**。

#### CS-1 资产持有的键与属性配值

**资产领域的 owner** 在**为一份[资产持有](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)建键、并在其上挂[属性配值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)**时，
依赖 [S-11](#s-11-scopelayeridentity)、[S-5](#s-5-tenantid-的构成与相等)、[S-7](#s-7-tenantid-的规范序列化形式)、[S-16](#s-16-按归属层显式携带身份值)、[S-20](#s-20-六条路径同一判定)，得到：

**持有的键是 (归属层身份, 资产)**——组织级那份以 OrganizationId 为分量、租户级那份以 TenantId 为分量，
两者**互不相等**。
**「归属层身份」那一半按 [S-16](#s-16-按归属层显式携带身份值) 存成一个带判别式的 `ScopeLayerIdentity`**
（`{"layer":"organization","organization":…}` 或 `{"layer":"tenant","tenant":{…}}`），
**不是**两个可空列加一句「谁不为空算谁」——后者在形状上就允许「两个都空」与「两个都非空」，
而这两种都不是合法的归属。
**配值挂在那份持有上**，因此**配值不需要自己的租户字段**——
它的归属由宿主持有决定，持有没了配值跟着没。
因为 TenantId 只有一种规范形式，同一份持有**不会因为写法不同被记成两份**。
[「组织的设置」是这批配值的投影，不是一个对象](../../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)，
所以也没有第二处需要校验身份的地方；
[几级都配了听谁的由那一维的层序决定](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)，
不是由键碰撞决定。

#### CS-2 作者与所有者分记

**资产领域的 owner** 在**记录一份资产是谁做的、归谁**时（成员在组织范围创作、此后被降级、再此后退出组织），
依赖 [S-5](#s-5-tenantid-的构成与相等)、[S-6](#s-6-tenantid-无生灭路径)、[S-11](#s-11-scopelayeridentity)，得到：

| 情形 | 所有者字段 | 作者字段 |
|---|---|---|
| 成员在组织范围创作 | OrganizationId | TenantId |
| 成员在自己的租户范围创作 | TenantId | 同一个 TenantId |
| agent 产出 | 它运行所在范围的所有者 | 它运行所在的那个 TenantId，另加「是 agent 产出」的标记 |
| official 资产 | 平台 | 平台，**没有租户**——该字段**缺席**，不是空值 |

并且：**作者字段不随角色变动而变**（[S-5](#s-5-tenantid-的构成与相等)：角色不进身份），
**不随成员关系解除而失效**（[S-6](#s-6-tenantid-无生灭路径)：无销毁路径，引用永不悬空，署名不会成为孤儿）。
`official` 那行的作者字段**缺席**，由 [S-12](#s-12-缺席与空值都不是身份值) 保证它不会被读成某个空租户。

> **这次缺席是合法的，不触发 [S-18](#s-18-缺席即拒绝)。**
> 它不是「一次没带身份的访问」，而是**记录里的一个合法取值组合**——
> official 资产本来就没有租户。[S-12 已把这条界划开](#s-12-缺席与空值都不是身份值)：
> **一律拒绝只在身份的输入位置成立。**
> 读到这一行的消费者该做的是**按「没有作者租户」呈现**，
> **不是**拒绝这次读，也**不是**给它补一个默认租户。

#### CS-3 资产复制的前提

**资产流转的 owner** 在**判断一次[资产复制](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)能不能发起**时，
依赖 [S-13](#s-13-sameaccountdistincttenants)、[S-10](#s-10-membershipstanding)、[S-19](#s-19-不可用即明确失败)，得到：

`sameAccountDistinctTenants(源, 目标)` 是一个**不读任何记录的纯值判定**，先于一切存储访问即可算出——
为假就直接拒，**不必也不应**去读成员资格。
为真则继续：两侧的成员资格效力都必须是 `effective`；任一侧的读面以**「不可用」失败**时**明确失败**，
**不当作「不允许」也不当作「允许」**；流转边界（[CS-4](#cs-4-分享边界有共同上级)）另判。

**本条是必要不充分条件**，消费者不得据此单独放行。
[同一自然人](../../../../product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份)
这个前提因此落成一个可判定的结构条件，**不需要引入「自然人」这个第三种身份**。

#### CS-4 分享边界有共同上级

**资产流转的 owner** 在**判断一次[资产分享](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)是否越界**时，
依赖 [S-15](#s-15-shareancestor)、[S-4](#s-4-organizationkind)、[S-3](#s-3-organizationid)，得到：

`shareAncestor(o1, o2)` 为真即[在同一棵隶属树内](../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)——
**两者是同一个判据，不是两个**（[S-15](#s-15-shareancestor)）。
谓词的输入是稳定的 OrganizationId（不回收、不复用）。
**含个人组织、两者不同的一对恒为假**——所以「两个个人组织之间的分享」必须走它自己那条规则，
**不能靠放宽共同上级的判据来兼容**（那把尺子量不到它们）。
**一个组织与它自己**恒为真，但那不是一次跨组织流转，**不构成放行依据**。
**祖先与后代那一对为真**——[团队与它所属的公司在同一棵树上](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)，
按不含自身的旧读法它会被判成假，那是本版已被否掉的读法。
关系解除之后该谓词转假，分享随之失效——**失效是这个求值条件的结果，不依赖任何事件送达**
（[S-27](#s-27-每道准入现读)：现读）。

**这次求值会读组织记录，因此会失败。**
任何一跳读不到 ⇒ **明确失败**（[S-19](#s-19-不可用即明确失败) 那张表的第 2 行），
**不得**把一条截断的[上级链](#s-14-上级组织与上级链)算出的 `false` 当成「不在同一棵树上」交上去——
那两种收场在调用方看来一模一样，**读失败会被完美伪装成一次越界拒绝**。
求上级链的操作面归 `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`；
[谓词的定义归本契约](#s-14-上级组织与上级链)，那边带坐标引用，不另写一份。

#### CS-5 成员无效时不可达但不销毁

**资产领域的 owner** 在**某个 TenantId 的成员关系被解除之后又被邀请回来**时，
依赖 [S-10](#s-10-membershipstanding)、[S-6](#s-6-tenantid-无生灭路径)、[S-26](#s-26-成员无效使租户级持有不可达但不销毁)、[S-19](#s-19-不可用即明确失败)，得到：

- 效力为 `ineffective` ⇒ **拒绝以该 TenantId 发起的一切访问**，
  且**不得删除任何以该 TenantId 为键的数据**——没有东西被删过，重新加入之后也就没有东西需要恢复；
- 读面以**「不可用」失败** ⇒ **明确失败**，**尤其不得据此执行上一条的任何清理**；
- 重新加入之后，[S-5](#s-5-tenantid-的构成与相等)/[S-6](#s-6-tenantid-无生灭路径) 保证回来的是同一个 TenantId，
  那些持有与配值**原样可用**，[分享失效而复制留着](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)按资产流转自己的规则。

**「不可达」与「销毁」分开的责任落在资产 owner 身上**：本契约只保证身份值永远指得回去。

#### CS-6 工作区宿主为租户

**资产领域与执行环境的 owner** 在**为一个工作区建身份、并判断谁能访问它**时（同一宿主机、同一 OS 用户，
两个租户身份先后挂上同一个目录），依赖 [S-22](#s-22-路径是地址不是钥匙)、[S-21](#s-21-判定依据的构成封闭)、[S-11](#s-11-scopelayeridentity)，得到：

**工作区的归属键含 TenantId 分量**，所以同一个目录换一个租户身份挂上就是另一份，两边互相看不见；
**目录本身只是地址**，换个 OS 用户、换个 cwd 进到同一个目录**不产生任何资格**。
并且 [S-11](#s-11-scopelayeridentity) 提醒：工作区**不是** ScopeLayerIdentity 的一个变体——
它不是一重身份，消费者不得为它造一个作用域层身份，只能用它自己那两条层序。

> **目录那一半靠什么标识，本契约不供**，见 [G-07](#十已知缺口)。

#### CS-7 会话持有创建时的 TenantId

**会话领域的 owner** 在**创建一个会话、随后账号切到另一个租户身份**时，
依赖 [S-28](#s-28-当前租户身份在创建那一刻捕获)、[S-17](#s-17-身份参数没有默认值)、[S-5](#s-5-tenantid-的构成与相等)、[S-6](#s-6-tenantid-无生灭路径)，得到：

创建流程在**开始时**从组织治理契约的查询面取一次 TenantId 并**存进会话**，此后一切以它计；
账号后来切到别的租户身份，这个会话**不跟着变**——成本、归属、可见性都不漂移。
会话**不得**只存 LoginStateId 而把归属留给「现在查一下这次登录选的是谁」，那就是随人漂移。
即便那个租户身份此刻失效，归属字段**仍然解析得回一个存在的身份**（[S-6](#s-6-tenantid-无生灭路径)）；
失效之后的收场（归档与否）归 PF-015 自己的规则，**本契约不定**。

#### CS-8 计量按 TenantId

**计量的 owner** 在**把一次调用的成本记到某个租户头上**时，
依赖 [S-28](#s-28-当前租户身份在创建那一刻捕获)（用的是创建那一刻捕获的值，不是此刻的选择）、
[S-5](#s-5-tenantid-的构成与相等)、[S-7](#s-7-tenantid-的规范序列化形式)（一种规范形式，明细可按它聚合而不分裂），得到：
**每一条明细都能携带一个稳定、可永久引用、可作聚合键且不漂移的 TenantId。**

**但「一次调用的成本怎么算、何时结算、明细怎么归集」没有 topic，是缺口 [G-02](#十已知缺口)**——
本契约只承诺 TenantId 可被每次调用携带且不漂移，**不填任何口径**。

#### CS-9 全局授权表达落成租户层配值

**meta 能力的 owner** 在**处理一笔作用域为「全局」的[授权表达](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression)**时，
依赖 [S-11](#s-11-scopelayeridentity)、[S-16](#s-16-按归属层显式携带身份值)、[S-27](#s-27-每道准入现读)、[S-29](#s-29-层事实只以显式身份值为键)，得到：

那一笔**不留在会话流水里**，而是写成**租户层的一个属性配值**——以 TenantId 为归属层身份、
挂在对应的资产持有上（[CS-1](#cs-1-资产持有的键与属性配值)）；这一笔落地时**显式携带 TenantId**，
且**不因为它来自某次会话就以 LoginStateId 或 AccountId 为键**。

**写这个值要有写它的权限**，那是另一道判定：资格按 [S-27](#s-27-每道准入现读) 现读，不足则失败——
[会话里坐着的那个人，未必是设权限的那个人](../../../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)。
本契约保证那个键是什么，**不保证谁写得了**。

#### CS-10 成员资格读不到

**任何持有租户范围对象的 owner** 在**调用成员资格读面却拿到 `{ failure: "unavailable" }`** 时，
依赖 [S-10](#s-10-membershipstanding)、[S-19](#s-19-不可用即明确失败)、[S-18](#s-18-缺席即拒绝)、[S-27](#s-27-每道准入现读)，得到：
**一个与任何效力值都不同形的失败**，调用方据此明确失败、不回退、不返回空集、不写缓存。
它**分不掉**——`MembershipStandingResult` 的两支在形状上互斥。

**同一次调用还有第三种收场，走查要一并走到**：读面
（`omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1` 的
[S-26](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定)）
的返回是一个**闭合和** `invalidInput` **|** `MembershipStandingResult`
（**那个和的形状归 S-26**，[S-10](#s-10-membershipstanding) 只拥有右项）。
`invalidInput` 是**表示层拒绝，判定没有发生**（[S-33](#s-33-表示层校验与判定分开)），
因此**不在 `MembershipStandingResult` 里**，也**不得被记成一次判定结果**；
但它**同样以返回值承载、同样不走带外通道**，调用方**同样明确失败**。
**三种收场，三个分支**：`invalidInput` / `{ failure: "unavailable" }` / 一个 `MembershipStanding`。
**走查要确认调用方先分和、再分右项的两支**——少分一层，`invalidInput` 就会沿着
「没拿到 standing ⇒ 当作没有」滑进 `ineffective` 那一侧，与本条要挡的是同一件事。

同理，某组织的超管尝试读取一位成员个人组织下的东西时，访问点显式携带那个个人组织的 TenantId 去读，
而超管的账号不是该个人组织的成员，效力为 `ineffective` ⇒ **拒绝**；
[超管的作用域恰是该组织](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)
这件事因此**不需要一条额外规则**，它是判定的自然结果。

**这一条是全部隔离义务共用的那个前提**——它不成立，其余条款都会在一次存储抖动时集体失守。

## 九、缺席与恢复

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是**值层面的缺席怎么收敛**：

| 缺席的是什么 | 收敛到哪 | 谁收口 |
|---|---|---|
| 身份值**缺席**或表示非法 | **拒绝**（[S-18](#s-18-缺席即拒绝)、[S-33](#s-33-表示层校验与判定分开)）；这次拒绝不记成一次判定结果 | 发生缺席的那个 owner 的准入判定 |
| 成员资格**读不到** | 读面以 `{ failure: "unavailable" }` 失败 ⇒ 消费者**明确失败**（[S-19](#s-19-不可用即明确失败)）；**不留下任何部分效果**、不写缓存 | 调用方 |
| 判定依据**暂时读不到**，随后恢复 | 值不因中断而改变：**同一组分量仍是同一个 TenantId**，恢复之后无需重建任何身份（[S-5](#s-5-tenantid-的构成与相等)） | 无人需要动作 |
| 系统**重启** | 身份值全部来自存储，**没有一个来自运行时**（[S-1](#s-1-accountid)）；登录状态的失效在重启之后依然成立（[S-9](#s-9-loginstateid)） | 存储 |
| 某个 TenantId 的成员关系**解除** | 数据**不可达但不销毁**（[S-26](#s-26-成员无效使租户级持有不可达但不销毁)）；它仍**永久可引用** | 资产领域的 owner |
| **会话级作用域层身份** | 由那个会话充当（词条已定），但**本版无标识表示**（[S-11](#s-11-scopelayeridentity)）；需要它的消费者**停在这里并报缺口**，不构造 | PF-015 的 owner（[G-01](#十已知缺口)） |
| [**交接凭证**](#s-35-交接凭证-handoff-warrant)缺席、不匹配或核实不过 | **核实方拒绝**，且**不执行它守卫的那一步**。这次拒绝**不表示**领域事实为假（性质 6），也**不得**降级成「那就跳过这道前置」 | 核实那一步的 owner；具体失败值由它自己的契约定 |
| 交接凭证的**登记随进程重启丢失** | 旧凭证**一律核实不过**；重试要由产出方**重新产出**一份（含幂等成功那一路） | 产出方；跨进程后归协议（[第六节](#六装配给与协议给)） |
| 标识的**具体形式**未定 | 消费者按「非空、不透明、不可解析」编码，**不假定长度/字符集/可排序** | realization（[G-04](#十已知缺口)） |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 十、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，
消费者读到这里应当知道**哪里在等裁决**，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-01** | **会话级作用域层身份的标识表示**：[这一格由那个会话充当，词条已定](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer-identity--作用域层身份--scope-layer-identity)；缺的是**用什么标识表示它** | 两处，**第二处此前没写出来**：① [S-11](#s-11-scopelayeridentity) 的第三个变体；② **[S-16](#s-16-按归属层显式携带身份值) 对会话级对象不给落点**——S-16 要求按归属层携带一个 `ScopeLayerIdentity`，而会话级那一格构造不出来，**于是一个归属在会话上的对象没有合法的持久形状可用**。合起来阻断：需要按会话级配值或求值的消费者，以及**任何要把对象归属记到会话这一层的 owner** | **[PF-015](../../../../product/PF-015-session-lifecycle-and-ownership/design.md) 的 owner** |
| **G-02** | **成本计量口径**：什么算一次、按什么单位、何时结算、怎么聚合成账单明细 | [CS-8](#cs-8-计量按-tenantid) 只到「TenantId 可被携带且不漂移」为止 | **产品负责人（当前无 topic）** |
| **G-03** | **个人 context 的内容**：具体有哪些项、各自语义、组织能不能影响它 | [S-25](#s-25-个人-context-不进任何层) 只定它在哪个轴上 | **产品负责人（当前无 topic）** |
| **G-04** | **不透明标识的具体词法形式**：字符集、长度上界、生成方式 | Schema 只到「非空、无首尾空白的字符串」；任何需要排序、分片或字面量拼接的实现 | **realization** |
| **G-05** | **TenantId 的标量键编码**：本版**不给**（[S-7](#s-7-tenantid-的规范序列化形式)）。需要标量键的消费者（索引、缓存键、计量聚合键）要一个单射编码，而它取决于 G-04——**先定词法，再定编码** | 需要标量键的消费者 | **realization**（在 G-04 裁定之后），届时**另立数据契约或出 v2**；本契约不在此版补 |
| **G-06** | **登录状态靠什么标识**：产品正文未述，只写明彼此可分辨（[domain_objects](../../../../domain_objects/objects.md#ul-login-state--登录状态)） | 不阻断——[S-9](#s-9-loginstateid) 给的是满足「可分辨」的最小形状，**不是产品裁决** | **PF-001 的 owner**（若需要更强的形状） |
| **G-07** | **工作区靠什么标识承载它的那个宿主机目录**（[objects.md](../../../../domain_objects/objects.md#ul-workspace--工作区) 记为「正文未述」；目录之外的承载形态 PF-002 rev 10 列为本版非目标）。**本契约不供工作区持有键** | [CS-6](#cs-6-工作区宿主为租户) 只定归属键含 TenantId 分量，目录那一半的形式未定 | **[PF-002](../../../../product/PF-002-assets-settings-and-permissions/design.md) 的 owner**；键的形状归资产领域契约 |

**两件曾经像缺口、现已不是的事，记在这里免得再被当成待裁：**

- **`MembershipStanding` 与 `ScopeLayerIdentity` 的正式名已进词表**——
  [成员资格效力](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-membership-standing--成员资格效力--membership-standing)
  与[作用域层身份](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer-identity--作用域层身份--scope-layer-identity)，
  本契约的英文名取自词条，**不另译**。词条把「读不到」明说成**不是效力的第三个取值**，
  本契约据此把它移出 [S-10](#s-10-membershipstanding) 的取值域、改用读面的失败表达。
- **「账号的身份是登录标识」不是一处冲突。**[领域对象清单](../../../../domain_objects/objects.md#ul-account--账号)
  记的是**产品层怎么指认这个人**，本契约 [S-1](#s-1-accountid)/[S-2](#s-2-登录标识不是-accountid)
  定的是**规格层跨对象引用用什么键**——[两个问题](#账号靠什么指认问的是两个问题)；
  [登录标识的词条已把这条界划开](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)。
  因此不登 conflicts，也不改对象清单。**登录标识能否更改**也不再是缺口：
  产品负责人已裁定**本版不提供修改**，[PF-001 已把它列入非目标](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#非目标)，
  [§4 账号的属性表也写明「本版不可改」](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)。

## 十一、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **不定义成员资格效力怎么算出来。**「一个 TenantId 此刻算不算数」是一条有状态、有写路径、有并发约束的记录，
  它的读面、写路径与失败集合归组织治理契约。本契约只定义**效力的两种取值**、
  **读面结果的两支**（[S-10](#s-10-membershipstanding)）和**消费者拿到每一支时必须怎么做**
  （[S-19](#s-19-不可用即明确失败)）。
- **不定义账号怎么鉴权。**凭据形式、校验方式、登录状态的签发与撤销归账号能力契约。
- **不定义资产持有本身。**持有关系的建立、移除、禁用，属性配值的读写、求值与层序，归资产领域的契约。
  本契约只定义**它们用来做键的那些身份值**。
- **不定义标识怎么生成。**字符集、长度、生成算法、存储主键选型归 realization（[G-04](#十已知缺口)）。
- **不定义[交接凭证](#s-35-交接凭证-handoff-warrant)靠什么机制做到不可伪造。**
  nonce 登记、签名、共享存储的取舍与参数归 realization；本契约只把**不可伪造**写成一条契约承诺，
  并写明它在单机由装配给、跨进程须由协议兑现（[第六节](#六装配给与协议给)）。
  **也不定义它的两个实例各自的失败值**——那归产出方与核实方自己的契约。
- **不定义登录标识的对外形式**；**本版它无变更路径**（[S-2](#s-2-登录标识不是-accountid)）。
- **不供工作区的持有键**（[G-07](#十已知缺口)）；不定义会话、运行各自的身份，也不定义计量口径。
- **不定义邀约的过期语义**——归 [`data.offer-expiry` v1](../../offer-expiry/README.md)。
- **不定义存储布局、索引、缓存实现、服务键与插件边界。**
- **不定义操作、状态转移、提交点与事件。**本契约没有操作。
- **不定义用什么机制在操作系统层拦住越权的文件读写。**
  本契约管**谁有资格**（[S-22](#s-22-路径是地址不是钥匙)），拦截机制归
  [PF-005 执行环境](../../../../product/PF-005-execution-environments-and-sandboxes/README.md)。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；
  Schema 与实例文件存在**不表示**形状已被校验过。

## 十二、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移。

此前已退役且未接受的候选不构成本契约的前身；本版不继承其条款，也不产生 lineage 关系。

**本版的规范工件**：本文件、[`identity-values.schema.json`](identity-values.schema.json)、
[`examples.md`](examples.md)。

**不建 `formal/`。**理由：本契约没有状态转移，也没有需要在给定规模里找反例的结构关系——
[S-4](#s-4-organizationkind)、[S-14](#s-14-上级组织与上级链)、[S-15](#s-15-shareancestor)
的结构约束归组织治理契约的结构模型，那份模型消费本契约的值定义。

**[S-35](#s-35-交接凭证-handoff-warrant) 不改变这个判断**：凭证的产出与核实是**两条操作之间**的事，
状态活在产出方与核实方那里，**本契约一步状态转移也没有多出来**。
那条次序守卫要在行为模型里检查，落点是
`omne-harness-lite-design-2026-09-15 · composition.account-registration · v1` 的行为模型——
**它消费本条的性质，本契约不另造一份平行模型。**
在这里建模型只会产出一份与 Schema 同义的平行工件。
**这不是把义务省掉**：[规格入口的要求](../../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务是**静态检查与消费者核对场景**，逐条登记在[验证入口](../verification.md)。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#十已知缺口)任一项被裁决后，凡改变本契约语义或表示的，都出 **v2**，
**推荐版本不自动升级消费者**。接受状态、冻结记录与执行结果都在本版本目录之外维护。

# data.identity-values v1

> 候选规格正文。接受/发布状态、当前推荐与执行结果由版本外入口记录，本文件不填。

- **契约坐标**：`baseline_id = omne-harness-lite-design-2026-09-15`；`contract_id = data.identity-values`；`version = v1`；
  `coordinate = data.identity-values/v1`；`family = data`；`topic = identity-values`；
  规范路径 `spec/data/identity-values/v1/contract.md`；资源 `identity-values.schema.json`。
  **状态 candidate**，未接受、未冻结；文件位置不代替这三元组身份。
- **设计依据**：见[下一节](#设计依据)。
- **精确语义依赖**：**无 spec 依赖。**本契约是本基线的第一份规格，不 `$ref` 任何其他 Schema，
  也不消费任何其他契约的条款。它的全部输入是产品正文与全局约束条款（非 spec 坐标），逐条列在[设计依据](#设计依据)。
  catalog 的 `dependencies` 为空数组，不是「待填」。

---

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 全局隔离义务 | [SYS-TENANT](../../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | 「显式携带租户身份、跨租户访问默认拒绝」这条义务本身；本契约是它在数据层的展开，**不削弱它** |
| 部署边界 | [SYS-DEPLOY](../../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | 「单机交付但不改变领域语义地可扩展」——据此分出[装配给 vs 协议给](#装配给-vs-协议给) |
| 规格形式 | [SYS-SPEC](../../../../../foundation/cross-system-constraints/requirements.md#sys-spec) | JSON Schema 定义数据契约；语言无关表达优先于任何实现类型 |
| 账号的三个作用、登录标识、激活状态、两个账号之间无通路 | [PF-001 rev 10 §4 账号](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号) | S-1、S-2、S-23 |
| 组织、上级组织属性、上级链、有共同上级 | [PF-001 rev 10 §4 组织](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织) | S-3、S-14、S-15 |
| 个人组织的结构性禁止 | [PF-001 rev 10 §4 个人组织](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织) | S-4 |
| 租户 = (组织, 账号)、不含角色 | [PF-001 rev 10 §4 租户](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户) | S-5 |
| 退出之后再加入回来的是同一个租户；租户级私有部分不可达不销毁 | [PF-001 rev 10 §4 退出之后再加入](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户) · [flows §3.3 成员关系](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系) | S-6、S-10、场景 5 |
| 当前租户身份是创建那一刻的环境值；切换只影响此后新建 | [PF-001 rev 10 §4 当前租户身份](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份) | S-27、S-28 |
| 角色单值两取值、可变、不回溯 | [PF-001 rev 10 §4 角色](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色) | S-8 |
| 个人 context 与协作范围 context 正交、不进层 | [PF-001 rev 10 §4 Context](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息) | S-24 |
| 四层、账号不占一格 | [PF-001 rev 10 §6.1 层次](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次) | S-11 |
| 隔离六条 | [PF-001 rev 10 §6.4 隔离](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | S-16～S-20、S-25、S-28 |
| 路径是地址，不是钥匙 | [PF-001 rev 10 §6.5 本地资源定位](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位) | S-21 |
| 旧菜单不当授权，撤销向后生效 | [PF-001 rev 10 §6.6](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止) | S-26 |
| 作者用租户身份标识、所有者与作者分记 | [PF-001 rev 10 §6.7 创作与归属](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) | 场景 2 |
| 账号、登录状态、成员关系的状态流转 | [PF-001 rev 10 flows §3.1](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号) · [§3.2](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态) · [§3.3](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系) | S-2、S-6、S-9 |
| 配值资格来自持有；「组织的设置」是视图 | [PF-002 rev 8 §5.2](../../../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性) | 场景 1 |
| 工作区挂在租户下、同目录换租户身份即另一份 | [PF-002 rev 8 §4 工作区](../../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区) | 场景 6、S-21 |
| 工作区不是一重身份；三条层序 | [PF-002 rev 8 §5.8](../../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题) | S-11 |
| 边界是那棵隶属树 | [PF-003 rev 3 §5.2](../../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织) | S-15、场景 4 |
| 复制的通则：执行者同时是源租户和目标租户 | [PF-003 rev 3 §6.3](../../../../../product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份) | S-13、场景 3 |
| 关系解除之后：分享失效、复制留着；目标租户不再有效 | [PF-003 rev 3 §6.12](../../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后) | S-10、场景 5 |
| 会话持有创建那一刻的租户身份 | [PF-015 rev 8 §6.12](../../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) | S-27、场景 7 |
| 「全局」那一档落成租户层的权限设置值 | [PF-007 §4 一笔授权表达有三个维度](../../../../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度) | 场景 9 |
| 统一语言正式名与形态 | [subjects-and-ownership](../../../../../ubiquitous_language/terms/subjects-and-ownership.md) · [scope-and-resolution](../../../../../ubiquitous_language/terms/scope-and-resolution.md) · [circulation-and-entitlement](../../../../../ubiquitous_language/terms/circulation-and-entitlement.md) | 全部英文名 |
| 对象的宿主、身份依据与「正文未述」 | [domain_objects/objects.md 主体与归属](../../../../../domain_objects/objects.md#主体与归属) | 各条的缺口标注 |

---

## 目的、消费者与责任

### 这份契约拥有什么

**身份值的含义与形状，以及隔离义务——每个租户范围对象的 owner 都要遵守的同形条款。**

它是一份**数据契约**：只拥有共享值、身份和结构关系的含义，以及消费者引用这些值时必须同时承担的义务。
**它没有操作，没有状态转移，没有提交点，因此不需要插件**。它定义的东西被所有涉及租户归属的能力共享，
写两遍必然分叉，所以它先定、其余契约引用它。

### 消费者

| 消费者 | 消费什么 |
|---|---|
| `capability.account-identity` v1 | AccountId、登录标识、LoginStateId 的含义与形状 |
| `capability.organization-governance` v1 | OrganizationId、OrganizationKind、TenantId、TenantRole、MembershipStanding、ScopeLayerIdentity；[上级组织的结构约束](#s-14) |
| `composition.account-registration` v1 | AccountId、OrganizationId、TenantId 的关系 |
| **资产领域**（PF-002 / PF-003 的契约，尚未建立） | **具名第一消费者**：资产持有的键、属性配值的归属、作者与所有者的记录形式、复制前提、分享边界 |
| 会话领域（PF-015 的契约，尚未建立） | 会话创建时捕获的 TenantId |
| 计量（无 topic） | 每次调用携带的 TenantId；**口径本身是缺口**，见 [G-02](#已知缺口) |

### 明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **不定义成员资格怎么判。**「一个 TenantId 此刻有没有效」是一条有状态、有写路径、有并发约束的记录，
  它的读面、写路径与失败集合归 `capability.organization-governance` v1。本契约只定义**判定结果的三种取值**（[S-10](#s-10)）
  和**消费者拿到每一种时必须怎么做**（[S-25](#s-25)）。
- **不定义账号怎么鉴权。**凭据形式、校验方式、登录状态的签发与撤销归 `capability.account-identity` v1。
- **不定义资产持有本身。**[资产持有](../../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)、
  [属性配值](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)、
  求值与层序归资产领域的契约。本契约只定义**它们用来做键的那些身份值**。
- **不定义标识怎么生成。**AccountId / OrganizationId / LoginStateId 的字符集、长度、生成算法归 realization（[G-04](#已知缺口)）。
- **不定义存储布局、索引、缓存实现、服务键与插件边界。**
- **不定义会话、运行、工作区各自的身份**，也不定义计量口径。

---

## 含义与使用范围

### 三类东西，不要混读

| 类 | 是什么 | 本契约给什么 |
|---|---|---|
| **不透明标识** | AccountId、OrganizationId、LoginStateId | 唯一性范围、相等规则、**不可解析**；形式留 realization |
| **结构化值** | TenantId、MembershipStanding、ScopeLayerIdentity | 由分量确定的值；相等按分量；规范序列化形式 |
| **枚举** | OrganizationKind、TenantRole | 封闭取值域，无「其他」 |

**TenantId 是值，不是标识。**它不被谁分配、不被谁回收，也没有一张表登记它的存在。
它由 (OrganizationId, AccountId) 这一组合确定，因此两个分量相同的 TenantId 就是同一个租户身份——
这是[统一语言对租户的定义](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)的直接结果，
不是本契约新加的约定。**「这个租户此刻有没有效」是另一回事**，见 [S-10](#s-10)。

### 与相近概念的差异

- **账号 ≠ 租户。**账号回答「你是谁」，租户回答「你的东西归哪儿」。一个 AccountId 对应多个 TenantId。
- **AccountId ≠ 登录标识。**见 [S-2](#s-2)。
- **登录状态 ≠ 会话。**LoginStateId 指认一次通过鉴权的登录，不是一段协作；正文刻意不用「会话」称呼它。
- **当前租户身份 ≠ 租户。**前者是挂在一次登录状态上的**一项选择**，后者是被指向的那个身份值。
  本契约定义被指向的值以及**捕获它的时点规则**（[S-27](#s-27)），选择本身的读写归治理契约。
- **作用域层 ≠ 资产归属层序。**见 [S-11](#s-11) 的排除说明。

---

## 值、身份与结构关系

### 值与身份

#### S-1

**AccountId 是[账号](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-account--账号--account)的标识：不透明、部署内唯一、由存储生成。**
它不携带可被消费者解释的内部结构：消费者不得解析它、不得从它推断注册时间/顺序/归属，也不得对两个 AccountId 做除相等之外的比较。
相等即同一个账号。它**不来自运行时对象**——运行实例身份（如 Cordis 的 `Fiber.uid`）只在本次 registry 内有效，不能充当持久身份。

#### S-2

**登录标识（Login Identifier）是账号的一项属性，不是 AccountId。**
登录标识在**整个部署内唯一**，注册时确定，未激活的账号同样占用它。
它是**对外的名字**；AccountId 是**内部的身份**。两者一一对应，但**不得互相替代**：

- 任何引用账号身份的数据（尤其是 TenantId 的 account 分量）**只用 AccountId**；
- 登录标识**不得出现在 TenantId 中**，也不得作为任何归属记录的键。

依据 [PF-001 §4 账号](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)把登录标识列为账号的一项**属性**。
分开的后果是实在的：归属记录遍布全系统，登录标识是人选的名字，把它嵌进归属记录等于把一个人的对外名字复制到每一条资产、每一笔账单上。

#### S-3

**OrganizationId 是[组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-organization--组织--organization)的标识：不透明、部署内唯一、由存储生成。**
约束同 [S-1](#s-1)。[个人组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-personal-organization--个人组织--personal-organization)与[团队组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-team-organization--团队组织--team-organization)**共用同一个标识空间**：
它们是同一个对象的两个变体，不是两类对象，因此没有两套标识、也不能从 OrganizationId 的形状分辨变体（要分辨读 [S-4](#s-4)）。

#### S-4

**OrganizationKind 是组织的一项属性，取值恰两种：`personal` / `team`。创建时确定，此后不可改，无写路径。**

`personal` ⇒ 三条结构性约束同时成立，**它们不是可被调整的权限设置**：

1. **不可邀请**——个人组织发不出[邀请](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-invitation--邀请--invitation)；
2. **上级恒空**——它的上级组织属性永远无值；
3. **不可作上级**——不存在任何组织以它为上级。

由 2、3 直接得到：**个人组织的上级链恒空**，因此**任何两个个人组织都不会[有共同上级](#s-15)**。
这不是一条额外规定，是 2、3 的结果。

#### S-5

**TenantId 是值类型，由 (OrganizationId, AccountId) 这一有序对确定。**

- **相等按分量**：两个 TenantId 相等，当且仅当 organization 分量相等且 account 分量相等。**不存在第三种相等依据。**
- **不含角色。**[TenantRole](#s-8) 是租户在其组织内的一项属性，**不进身份**。据此：角色变更**不改变任何已记录的 TenantId**，
  也不使任何归属记录失效。
- **不含成员资格。**「这个 TenantId 此刻有没有效」不是 TenantId 的分量，见 [S-10](#s-10)。
- **不含时间。**同一对 (organization, account) 在任何时刻都是同一个 TenantId。

#### S-6

**TenantId 没有生成路径，也没有销毁路径。**

它不被分配、不被回收、不存在「新建一个租户身份」这个动作：给定两个分量，这个值就存在，可被任何记录引用。
成员关系的建立与解除改变的是[判定结果](#s-10)，**不改变这个值是哪一个**，也不使已有记录中的 TenantId 变成悬空引用。

**因此消费者不得实现任何以「租户被删除」为前提的清理。**一个引用了某 TenantId 的历史记录（作者、账单明细、资产持有）
在成员关系解除之后**仍然是有效引用**，只是没有任何身份能以它的名义发起动作。

#### S-7

**TenantId 的规范序列化形式恰有一种：一个带两个成员的结构，成员名为 `organization` 与 `account`，不含其他成员。**

- 该形式在 Schema 中由 `TenantId` 定义，`additionalProperties: false`。
- **本版不定义任何把 TenantId 压成单一标量的形式**（拼接串、哈希、编码键都不是）。
  消费者若在自己的实现里需要一个标量键，那是 realization 的事，且必须满足两条：
  **不得把该标量作为身份对外发布**，**不得把解析该标量的结果当作授权依据**（见 [S-22](#s-22)）。
- 语义身份与实现对象地址分别处理：进程内的某个对象引用不是 TenantId。

#### S-8

**TenantRole 是[租户角色](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role)，单值枚举，取值恰两种：`super_administrator` / `member`。**
一个租户在其组织内**只持一个**。它**可变**，变更只影响此后的准入判定，不改变已发生的归属与既有事实。
本契约只定义取值域与「单值」这一形状；谁能改、改的前置与并发收场归 `capability.organization-governance` v1。

#### S-9

**LoginStateId 是[登录状态](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state)的标识：不透明、部署内唯一、由存储生成。**
约束同 [S-1](#s-1)。它不是会话的标识，也不是账号的标识。
产品正文未述登录状态靠什么标识，只写明彼此可分辨（[domain_objects](../../../../../domain_objects/objects.md#ul-login-state--登录状态)）——
本条给出「不透明、部署内唯一」这一最小形状以满足可分辨，**不补造任何结构**。

#### S-10

**MembershipStanding 是成员资格判定的结果，恰三值：**

| 取值 | 含义 | 消费者必须怎么做 |
|---|---|---|
| `effective` | 该 TenantId 此刻有效，**并同时给出 [TenantRole](#s-8)** | 按该角色继续判定 |
| `ineffective` | 该 TenantId 此刻无效（从未建立，或已解除） | 拒绝该次访问；**不得删除任何以该 TenantId 为键的数据** |
| `unavailable` | **判定不出来**——判定依据此刻读不到 | **明确失败**，见 [S-25](#s-25) |

**`unavailable` 与 `ineffective` 是两个值，不是一个。**把前者折叠成后者，系统会在一次存储抖动中
对着一个完全正常的成员回答「你不是成员」，并据此执行本该拒绝的清理。
`effective` 必带角色、另两值必不带角色——**没有「有效但角色未知」这一态**。

#### S-11

**ScopeLayerIdentity 是「[作用域层](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)及其身份值」的表示，本版恰两个变体：**

| 变体 | 携带 |
|---|---|
| `organization` | 一个 [OrganizationId](#s-3) |
| `tenant` | 一个 [TenantId](#s-5) |

**刻意排除的四个，每一个都有理由，消费者不得自行补上：**

| 排除 | 理由 |
|---|---|
| **账号** | 账号不在那四层里；它的求值是恒等的，不占一格（[PF-001 §6.1](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)）。构造一个 `account` 变体等于把账号变回一层 |
| **出厂默认** | 归属是「系统」，**没有身份值**。给它铸一个身份值就等于凭空造出一个叫「系统」的主体 |
| **工作区** | **不是一重身份**（[PF-002 §5.8](../../../../../product/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份)）；它只在设置那条层序上占一格。它的归属键含 TenantId 分量，见[场景 6](#场景-6工作区宿主为租户路径只是地址) |
| **会话** | **已知缺口 [G-01](#已知缺口)**，归 PF-015。Schema 的枚举**不含** `session`，正是为了让「会话级层身份」无法被静默构造出来 |

**ScopeLayerIdentity 不表达资产归属那条层序**（official < 组织 < 租户 < 工作区）。那是另一条层序，
成员对不齐；用本类型表达它会得到一个既缺 official 又缺工作区的残表。

#### S-12

**缺席、`null` 与空值是三件事，但三者都不是有效身份值。**

字段不存在、字段为 `null`、字段为空字符串——本契约**一律视为「没有给出这个身份」**，
由此触发 [S-18](#s-18)。消费者不得把其中任何一种解释为「默认身份」「当前身份」「全部」或「无限制」。

### 派生谓词（纯值判定，不读任何记录）

#### S-13

**`sameAccountDistinctTenant(t1, t2) ≝ t1.account = t2.account ∧ t1.organization ≠ t2.organization`。**

这就是「**同一账号的两个租户身份**」。它是纯值判定，不读成员资格、不读持有记录。
[资产复制](../../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)把它作为**必要前提之一**（[场景 3](#场景-3资产复制前提同一账号的两个-tenantid)）；
**必要不充分**——两侧的成员资格判定与流转边界另有其人。

#### S-14

**上级组织（Parent Organization）是组织的一项属性，本契约给出它的结构约束：**

- **至多一个。**它是单值属性，不存在写入第二个值的形状。
- **不成环。**任一组织不得出现在自己的[上级链](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-ancestor-chain--上级链--ancestor-chain)上。
- **个人组织不参与**（[S-4](#s-4)）。

**上级链** `ancestors(o)` ≝ 从 `o` 出发沿上级属性向上得到的组织序列（不含 `o` 自身）。
本契约只定义这些结构约束的**表达**；建立与解除的操作、授权、提交点与并发收场归 `capability.organization-governance` v1。
**上级组织不进[作用域层](#s-11)**：子组织不自动继承上级组织的任何东西。

#### S-15

**`shareAncestor(o1, o2) ≝ ancestors(o1) ∩ ancestors(o2) ≠ ∅`。**

两个组织**有共同上级**，当且仅当两条上级链有交。由 [S-4](#s-4) 与 [S-14](#s-14) 直接得到：
**任何含个人组织的一对都恒为假**——那把尺子量不到它们，不是把门放宽了。

---

## 隔离义务

> **这一节是本契约的核心。**它约束的不是本契约自己的数据，而是**每一个持有租户范围对象的 owner**。
> 每一条都写成可被另一个 owner 照着自检的形式：**谁在何处保护**、**违反时可观察到什么**。
>
> 这些义务不需要一个守门插件来集中兑现——集中之后就会留下「守门通过但数据层没校验」的路径。
> 它们要的是**每个 owner 各自不漏**，所以写成一份共用的同形条款。

### S-16

**受[租户](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)所有权约束的对象与跨边界操作，显式携带身份值。**

携带哪一个按对象所属的层定（[S-11](#s-11)）：租户级携带 TenantId，组织级携带 OrganizationId。

- **谁在何处保护**：每个 owner 在**数据访问的那一层**——对象的形状里有这个字段，每条访问路径的入参里有这个值。
- **违反时可观察到什么**：存在一条能读到租户范围对象、而调用签名里没有身份值的路径；
  或某个对象的记录形状里找不到它属于哪个租户。

### S-17

**身份参数没有默认值，也不从别处推断。**

不得从环境变量、进程状态、当前工作目录、最近一次调用、线程/协程局部存储、
「当前登录状态上的那项选择」**在使用点现取**——现取会让同一份工作在用户中途切换后改变归属（[S-27](#s-27)）。

- **谁在何处保护**：每个 owner 的接口定义（参数无默认值）+ 静态检查（[V-2](#验证义务)）。
- **违反时可观察到什么**：某个调用不传身份也能成功；或同一次流程的前后两步算出了不同的 TenantId。

### S-18

**缺席即拒绝。**身份值缺席（[S-12](#s-12)）、格式非法、分量不完整 ⇒ **拒绝或明确失败**。
**不放行、不返回空集、不回退到任何其他范围、不选一个「合理的默认」。**

- **谁在何处保护**：每个 owner 的准入判定的第一步。
- **违反时可观察到什么**：不带身份的请求得到了 `200` 与一个空列表（这比拒绝更危险——调用方会以为「这个租户下确实没有东西」）。

### S-19

**读、写、覆盖、删除、订阅、清理——六条路径同一判定。**

| 路径 | 容易漏在哪 |
|---|---|
| 读 | 一般不漏 |
| 写 | 一般不漏 |
| **覆盖** | 按键 upsert 时只校验「有没有这条」，不校验「这条是不是你的」 |
| **删除** | 批量删除按前缀/通配走，绕过单条判定 |
| **订阅** | 事件流按主题订阅，主题里没有身份分量；或有身份分量但**只用于过滤**（见 [S-22](#s-22)） |
| **清理** | 后台任务、过期回收、迁移脚本**不经过准入判定** |

- **谁在何处保护**：每个 owner；**后台与批处理路径与前台同一判定函数**。
- **违反时可观察到什么**：能构造一次覆盖/删除/订阅/清理，让 A 租户的动作触及 B 租户的数据，而同样内容的「读」会被拒。

### S-20

**判定依据的构成是封闭的：`(显式携带的身份值, 持有记录, 成员资格判定结果)`。**

**以下一概不构成资格**，出现在判定依据里即为违反：

- 物理路径、当前工作目录、同盘存放、目录归属；
- 操作系统用户、进程身份、容器/命名空间名称；
- 存储位置、分片名、数据库/表/桶的名字；
- 网络位置、调用来源主机；
- 运行实例身份（Cordis `Fiber.uid` 一类）。

- **谁在何处保护**：每个 owner 的判定函数；**静态检查**（[V-2](#验证义务)）核对判定函数的输入集合。
- **违反时可观察到什么**：把进程换个工作目录启动、或换个 OS 用户运行，同一个请求的放行结果变了。

### S-21

**路径是地址，不是钥匙。**

[工作区](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)当然要记路径——
那是**指认它是哪一份**。资格是另一回事：来自那条持有记录归哪个租户，以及来者此刻是不是该租户的有效成员。

**同一个目录被两个租户身份分别挂上，那是两份工作区**，互相看不见。

- **谁在何处保护**：资产领域的 owner（持有记录以 TenantId 为分量）+ 执行环境的 owner。
- **违反时可观察到什么**：换一个租户身份进到同一个目录，看见了另一个租户的那一份。

> 本条定的是**谁有资格**，不是**用什么机制拦住越权的文件读写**——后者不归身份模型。

### S-22

**不得以服务可见性隔离、事件过滤、缓存键前缀冒充隔离。**

- **服务可见性隔离**（Cordis `isolate` 一类）隔的是**服务实例的可见性**。一个服务实例内部握着跨租户的数据句柄，隔离多少次都无效。
- **事件过滤**决定**谁收到通知**，不决定**谁有权读到内容**；绕过订阅面直接读，过滤器不在路径上。
- **缓存键前缀**只是把数据放在不同的格子里；没有判定，换个前缀就能取到别人的格子。

**任何声称提供隔离的接口，必须能指出隔离在哪一行代码、哪一层实施。**指不出来，就是没有。

- **谁在何处保护**：每个 owner 在声明「本接口隔离」时给出实施位置；架构评审核对。
- **违反时可观察到什么**：拿掉那层 isolate/过滤器/前缀之后，数据访问层照样返回跨租户的数据。

### S-23

**账号记录不含跨账号关联字段。**

一个现实中的人可以持有多个账号；系统**不核验、不关联、也不记录**两个账号是否属于同一人。
账号记录里不得有「同一人的其他账号」「关联账号」「主账号」「合并自」这类字段，
任何 owner 也不得另建一张表来表达这种关联。**账号是一个自然人全部 context 的最大边界**，
这道边界是身份的推论，**边界上没有可配置的东西**。

- **谁在何处保护**：账号那一侧的 owner（数据形状）+ **静态检查**（[V-2](#验证义务)）；其余 owner 不引入跨账号依据。
- **违反时可观察到什么**：存在一条从 AccountId A 出发、不经过任何组织，就能到达 AccountId B 的数据的路径。

### S-24

**[个人 context](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-personal-context--个人-context--personal-context) 不是[范围化对象](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object)，不进任何层。**

它由账号承载，跟着人走，在所有组织里都一样；**不参与任何层的合成，也不被任何层配值**。
账号的身份事实（登录标识、凭据、激活状态）同理。

- **谁在何处保护**：账号那一侧的 owner（不把它挂进层）+ 资产领域的 owner（求值只按层序走，不去读账号）。
- **违反时可观察到什么**：切换组织之后界面语言变了；或某个组织能为成员配「界面语言」。

> 个人 context 里**具体有哪些项**是已知缺口 [G-03](#已知缺口)。本条只定它在哪个轴上，**不列项**。

### S-25

**不可用 ≠ 无效。**

[MembershipStanding](#s-10) = `unavailable` 时，消费者**明确失败**：

- **不得**视作 `ineffective`；
- **不得**静默回退到个人范围或任何其他范围；
- **不得**返回空集或「暂时没有权限」这类会被当作事实的回答；
- 失败要能与「真的无效」分辨开——两者在调用方看到的结果值不同。

- **谁在何处保护**：每个调用成员资格判定的 owner，在拿到三值之后的分支里。
- **违反时可观察到什么**：把成员记录的存储停掉，某个入口开始表现得像「这个人被移出了组织」——甚至据此执行了清理。

### S-26

**每道准入现读；缓存必须写明失效条件。**

角色变更、退出、撤权、撤销分享影响的是**下一道尚未通过的准入**。旧菜单、缓存与历史成功不能继续当作授权。
允许缓存判定结果，但缓存必须：**写明失效条件与最大陈旧窗口**；**以完整身份值为键**（不得跨身份复用一条缓存）；
**在 `unavailable` 时不写入**（否则把一次读不到固化成了一个答案）。

- **谁在何处保护**：每个 owner 在自己的缓存声明处。
- **违反时可观察到什么**：一个人已被移除，仍能在某个入口继续通过准入，且说不出这个结论会在什么时候失效。

### S-27

**当前租户身份是创建那一刻捕获的值。**

- **查询面给值**：「此刻以哪个租户身份行事」是挂在一次登录状态上的一项选择，由治理契约的查询面按 LoginStateId 给出一个 TenantId。
- **产生租户归属数据的流程，在开始时取一次这个值并随之固定**，此后一切以它计：归属记在它名下、成本算在它头上、能用什么按它求值。
- **此后这项选择被改成别的，已经创建的那些一概不跟着变。**

据此，任何在某个租户身份下创建的对象**持有创建那一刻的那个 TenantId**。

- **谁在何处保护**：每个创建租户归属数据的 owner，在流程入口处取值、在对象形状里存值。
- **违反时可观察到什么**：一次会话上午算在一个租户头上、下午算在另一个头上；或对象只存了 LoginStateId，
  归属靠「现在查一下这次登录选的是谁」算出来——那就是随人漂移。

### S-28

**切换不复制层事实；账号身份事实不进层。**

- 一层的事实**不因**切换组织被复制到另一层，**方向两边都算**。
- 任何层的事实以**显式的 TenantId / OrganizationId** 为键写入，**不以 AccountId 为键**、也不以 LoginStateId 为键。
- 个人范围的权限与资产**不因**加入组织而共享；组织管理资格**不带来**成员个人范围的访问权。

- **谁在何处保护**：每个持有层事实的 owner 的写路径。
- **违反时可观察到什么**：切换一次组织之后，另一个组织里多出了原本不在那里的东西；
  或某张层事实表的主键里出现了 AccountId。

---

## 装配给 vs 协议给

**SYS-DEPLOY**：第一版是单机，但语义不变地可扩展为分布式。下表把本契约的每项判定分成两类——
**单机由装配（同一存储、同一进程）顺带给的**，与**分布式必须由协议重新兑现的**。
**装配给的那些，在演化到分布式时不会自动成立。**

| 判定 | 单机由谁给 | 分布式必须由协议重新兑现什么 |
|---|---|---|
| AccountId / OrganizationId / LoginStateId **部署内唯一**（[S-1](#s-1)、[S-3](#s-3)、[S-9](#s-9)） | 单一生成点 + 存储的唯一约束 | **跨节点标识分配**。唯一性是承诺，不是「碰撞概率足够低」 |
| **登录标识唯一**（[S-2](#s-2)） | 存储的唯一索引；未激活也占用 | 同上；**占用与激活是两件事**，占用必须先于并跨节点可见 |
| **TenantId 结构相等**（[S-5](#s-5)） | 值比较 | **不变**——纯值判定，不需要任何协调 |
| **规范序列化形式**（[S-7](#s-7)） | 不变 | 不变 |
| **`sameAccountDistinctTenant`**（[S-13](#s-13)） | 值比较 | 不变 |
| **MembershipStanding 的新鲜度**（[S-10](#s-10)） | 同一存储的现读；写后立即可见 | **可见性窗口**必须成为消费者契约的一部分：解除成员之后多久内旧节点仍可能读到 `effective`。**`unavailable` 在任何部署下仍是 `unavailable`** |
| **上级链与 `shareAncestor`**（[S-14](#s-14)、[S-15](#s-15)） | 同一存储多行读，读一致性由存储给 | **读一致性**须显式定义；陈旧读不得放行跨组织流转 |
| **六路径同判**（[S-19](#s-19)） | 同一进程内同一判定函数 | **每个远端接收边界重新校验**。进程内归因不自动成为远程凭证；一个身份标识本身只说明声称的身份，不证明权限 |
| **判定依据不含物理位置**（[S-20](#s-20)） | 静态检查 | 不变——**且更要紧**：多节点部署下「同一台机器」这个巧合会更频繁地出现 |
| **缓存失效**（[S-26](#s-26)） | 进程内失效即时 | **失效传播**须有上界并写进契约；跨节点缓存不得以「最终会过期」代替失效条件 |

---

## 表示与边界校验

- **规范表示**：[`identity-values.schema.json`](identity-values.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/identity-values/v1/identity-values.schema.json`。
- **定义项**：`OpaqueIdentifier`（内部基）、`LoginIdentifier`、`AccountId`、`OrganizationId`、`OrganizationKind`、
  `TenantId`、`TenantRole`、`LoginStateId`、`MembershipStanding`、`ScopeLayerIdentity`。
  消费者 `$ref` 这些定义，**不复制一份同义类型**。
- **根模式不约束任何文档**：本文件是共享定义的登记处，不是某个消息的形状。
- **Schema 表达得了什么、表达不了什么**：

| 条款 | Schema 管得到吗 | 表达不了的那部分归谁 |
|---|---|---|
| [S-1](#s-1)/[S-3](#s-3)/[S-9](#s-9) 不透明 | **只管「是非空字符串」**。「部署内唯一」「不可解析」是行为约束 | 唯一性归存储与协议（见上表）；不可解析归**静态检查** [V-2](#验证义务) |
| [S-4](#s-4) OrganizationKind | 管取值域 | 「personal ⇒ 不可邀请/上级恒空/不可作上级」是跨对象约束，归 `capability.organization-governance` v1 与 Alloy 结构模型 |
| [S-5](#s-5)/[S-7](#s-7) TenantId | **完全管得到**：两个分量、无多余成员、无 role | — |
| [S-8](#s-8) TenantRole | 管取值域与单值 | — |
| [S-10](#s-10) MembershipStanding | **完全管得到**：三值、`effective` 必带角色、另两值必不带 | 「不可用 ≠ 无效」的**行为**归 [S-25](#s-25)，Schema 只保证两者形状不同 |
| [S-11](#s-11) ScopeLayerIdentity | 管两个变体与各自载荷；**枚举不含 `session` / `workspace` / `account` / `factory_default`** | 缺口本身见 [G-01](#已知缺口) |
| [S-12](#s-12) 缺席/null/空 | 管 `required`、`minLength: 1`、不允许 `null` | 「拒绝」这个行为归 [S-18](#s-18) |
| [S-16](#s-16)～[S-28](#s-28) 隔离义务 | **一概管不到**——它们约束的是别的 owner 的路径与判定 | **静态检查 + 消费者契约的条款**，见[验证义务](#验证义务) |

- **非法输入的含义**：Schema 校验失败 ⇒ 该输入**不是**一个身份值 ⇒ 触发 [S-18](#s-18) 拒绝。
  **校验失败不得降级为「按默认处理」或「尽力而为」。**

---

## 性质与规范场景

### 结构性质

| # | 性质 | 类 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|
| P-1 | TenantId 的相等恰由两个分量决定 | 不变量 | Schema（形状）+ 各 owner 的比较实现 | 两个分量相同的 TenantId 被当成两个租户，或反之 |
| P-2 | TenantId 无生灭路径；已记录的引用永不悬空 | 不变量 | 各 owner：不存在以「租户被删」为前提的路径（[S-6](#s-6)） | 成员解除后，历史署名指向一个查不到的身份 |
| P-3 | 角色不进身份 | 不变量 | Schema（`additionalProperties: false`）+ [S-5](#s-5) | 升降职之后此前产出的署名变了 |
| P-4 | 个人组织恒不在任何上级链上 | 不变量 | [S-4](#s-4) + 治理契约的写路径前置 | 存在一条含个人组织的隶属链 |
| P-5 | 上级链不成环、至多一个上级 | 不变量 | [S-14](#s-14) + 治理契约的判环（与写入同提交） | 「谁是谁的上级」答不出来 |
| P-6 | 判定依据的构成封闭 | 安全 | [S-20](#s-20) + 静态检查 | 换目录/换 OS 用户改变放行结果 |
| P-7 | 六路径同判 | 安全 | [S-19](#s-19) | 覆盖/删除/订阅/清理能触及另一租户 |
| P-8 | 不可用不被折叠成无效 | 安全 | [S-10](#s-10)（形状）+ [S-25](#s-25)（行为） | 存储抖动期间发生了本该拒绝的清理 |
| P-9 | 两个账号之间没有任何通路 | 安全 | [S-23](#s-23) + 静态检查 | 存在一条不经组织的跨账号读路径 |
| P-10 | 归属不随切换漂移 | 安全 | [S-27](#s-27) | 同一会话的成本上午下午算在两个租户头上 |

**本契约不建行为模型。**它没有状态转移；相关的行为权威在 `capability.organization-governance` v1 与
`composition.account-registration` v1 的 TLA+ 里，本契约的值定义被那些模型引用，不在这里复制一份状态机。
[S-4](#s-4)、[S-14](#s-14)、[S-15](#s-15) 的结构约束由治理契约的 Alloy 模型（`Affiliation.als`）检查——
**那份模型消费本契约的值定义，本契约不另造一份平行结构模型**。

### 合法实例

```json
{ "organization": "org_7fd2c1", "account": "acc_91ab40" }
```
合法的 TenantId：两个分量齐备、无多余成员。

```json
{ "standing": "effective", "role": "super_administrator" }
```
合法的 MembershipStanding：`effective` 带角色。

```json
{ "standing": "unavailable" }
```
合法：判定不出来。消费者据此**明确失败**（[S-25](#s-25)），不是「无效」。

```json
{ "layer": "tenant", "tenant": { "organization": "org_7fd2c1", "account": "acc_91ab40" } }
```
合法的 ScopeLayerIdentity：租户级。

```json
{ "layer": "organization", "organization": "org_7fd2c1" }
```
合法：组织级。

```json
"team"
```
合法的 OrganizationKind。

### 非法实例

| 实例 | 为什么非法 | 条款 |
|---|---|---|
| `{ "organization": "org_7fd2c1" }` | 缺 account 分量——**不完整的身份不是「部分身份」** | [S-5](#s-5)、[S-12](#s-12) |
| `{ "organization": "org_7fd2c1", "account": "acc_91ab40", "role": "member" }` | 角色不进身份 | [S-5](#s-5)、P-3 |
| `{ "organization": "", "account": "acc_91ab40" }` | 空串不是身份值 | [S-12](#s-12) |
| `{ "organization": "org_7fd2c1", "account": null }` | `null` 不是身份值 | [S-12](#s-12) |
| `"org_7fd2c1:acc_91ab40"` | 拼接串不是 TenantId 的规范形式；本版**没有**标量形式 | [S-7](#s-7) |
| `{ "standing": "effective" }` | `effective` 必带角色；没有「有效但角色未知」 | [S-10](#s-10) |
| `{ "standing": "ineffective", "role": "member" }` | 无效不带角色 | [S-10](#s-10) |
| `{ "standing": "invalid" }` | 三值之外无第四值；把 `unavailable` 折叠进来是最危险的一种 | [S-10](#s-10)、[S-25](#s-25) |
| `{ "layer": "session", "session": "…" }` | 会话级层身份是**缺口**，枚举刻意不含它 | [S-11](#s-11)、[G-01](#已知缺口) |
| `{ "layer": "workspace", … }` | 工作区不是一重身份 | [S-11](#s-11) |
| `{ "layer": "account", "account": "acc_91ab40" }` | 账号不占一格 | [S-11](#s-11) |
| `{ "layer": "factory_default", "system": "…" }` | 出厂默认没有身份值；不得铸一个「系统」主体 | [S-11](#s-11) |

**Schema 表达不了、必须由静态检查拒绝的反例**（[V-2](#验证义务)）：

- 某判定函数的输入里含 `cwd` / `process.getuid()` / 存储路径 → 违反 [S-20](#s-20)；
- 账号记录的类型里出现 `linkedAccounts` / `primaryAccountId` → 违反 [S-23](#s-23)；
- 某层事实表的主键含 `AccountId` → 违反 [S-28](#s-28)；
- 某访问函数的身份参数带默认值，或在函数体内部现取当前租户身份 → 违反 [S-17](#s-17)、[S-27](#s-27)。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**

#### 场景 1：资产持有的键与属性配值

**资产领域的 owner** 在**为一份[资产持有](../../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)建键、并在其上挂[属性配值](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)**时，
依赖 [S-11](#s-11)（归属层用哪个身份值）、[S-5](#s-5)（TenantId 按分量相等）、[S-16](#s-16)（显式携带）、[S-19](#s-19)（六路径同判），
得到：**持有的键是 (归属层身份, 资产)**，组织级那份以 OrganizationId 为分量、租户级那份以 TenantId 为分量；
**配值挂在那份持有上**，因此**配值不需要自己的租户字段**——它的归属由宿主持有决定，持有没了配值跟着没。
「组织的设置」是这批配值的投影，**不是一个对象**，所以也没有第二处需要校验身份的地方。

#### 场景 2：作者 = TenantId，所有者 = OrganizationId 或 TenantId

**资产领域的 owner** 在**记录一份资产是谁做的、归谁**时，依赖 [S-5](#s-5)、[S-6](#s-6)、[S-11](#s-11)，得到：

| 情形 | 所有者字段 | 作者字段 |
|---|---|---|
| 成员在组织范围创作 | OrganizationId | TenantId |
| 成员在自己的租户范围创作 | TenantId | 同一个 TenantId |
| agent 产出 | 它运行所在范围的所有者 | 它运行所在的那个 TenantId，另加「是 agent 产出」的标记 |
| official 资产 | 平台 | 平台，**没有租户**——该字段**缺席**，不是空值 |

并且：**作者字段不随角色变动而变**（[S-5](#s-5)：角色不进身份），
**不随成员关系解除而失效**（[S-6](#s-6)：TenantId 无销毁路径，引用永不悬空）。
`official` 那行的作者字段**缺席**，由 [S-12](#s-12) 保证它不会被读成某个空租户。

#### 场景 3：资产复制前提「同一账号的两个 TenantId」

**资产流转的 owner** 在**判断一次[资产复制](../../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)能不能发起**时，
依赖 [S-13](#s-13)，得到：`sameAccountDistinctTenant(源, 目标)` 是一个**不读任何记录的纯值判定**，
先于一切存储访问即可算出——为假就直接拒，**不必也不应**去读成员资格。
为真则继续：两侧的 [MembershipStanding](#s-10) 都必须是 `effective`（否则按 [S-25](#s-25) 失败或拒绝），
且流转边界（[场景 4](#场景-4分享边界有共同上级)）另判。**本条是必要不充分条件**，消费者不得据此单独放行。

#### 场景 4：分享边界「有共同上级」

**资产流转的 owner** 在**判断一次[资产分享](../../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)是否越界**时，
依赖 [S-15](#s-15) 与 [S-4](#s-4)，得到：`shareAncestor(o1, o2)` 为真即在同一棵隶属树内；
**含个人组织的一对恒为假**——所以「两个个人组织之间的分享」必须走它自己那条规则，
**不能靠放宽共同上级的判据来兼容**（那把尺子量不到它们）。
关系解除之后该谓词转假，分享随之失效——**失效是这个求值条件的结果，不依赖任何事件送达**（[S-26](#s-26)：现读）。

#### 场景 5：成员关系无效时，租户级持有不可达但不销毁

**资产领域的 owner** 在**某个 TenantId 的成员关系被解除之后**，依赖 [S-10](#s-10)、[S-6](#s-6)、[S-25](#s-25)，得到：

- 判定为 `ineffective` ⇒ **拒绝以该 TenantId 发起的一切访问**，且 **不得删除任何以该 TenantId 为键的数据**——
  没有东西被删过，重新加入之后也就没有东西需要恢复；
- 判定为 `unavailable` ⇒ **明确失败**，**尤其不得据此执行上一条的任何清理**；
- 重新加入之后，[S-5](#s-5)/[S-6](#s-6) 保证回来的是同一个 TenantId，那些持有与配值**原样可用**。

**这条把「不可达」和「销毁」分开的责任落在资产 owner 身上**：本契约只保证身份值永远指得回去。

#### 场景 6：工作区宿主为租户，路径只是地址

**资产领域与执行环境的 owner** 在**为一个[工作区](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)建身份、并判断谁能访问它**时，
依赖 [S-21](#s-21)、[S-20](#s-20)、[S-11](#s-11)，得到：**工作区的归属键含 TenantId 分量**（(TenantId, 宿主机目录)），
所以同一个目录换一个租户身份挂上就是另一份；**目录本身只是地址**，
换个 OS 用户、换个 cwd 进到同一个目录**不产生任何资格**。
并且 [S-11](#s-11) 提醒：工作区**不是** ScopeLayerIdentity 的一个变体——它不是一重身份，
消费者不得为它造一个层身份，只能用它自己那条层序。

#### 场景 7：会话持有创建时的 TenantId

**会话领域的 owner** 在**创建一个会话**时，依赖 [S-27](#s-27)、[S-17](#s-17)、[S-5](#s-5)，得到：
创建流程在**开始时**从治理契约的查询面取一次 TenantId 并**存进会话**，此后一切以它计；
账号后来切到别的租户身份，这个会话**不跟着变**。
会话**不得**只存 LoginStateId 而把归属留给「现在查一下这次登录选的是谁」——那就是随人漂移（[S-27](#s-27) 的违反观察）。
那个 TenantId 失效时的收场（归档与否）归 PF-015 自己的规则，**本契约不定**。

#### 场景 8：计量按 TenantId

**计量的 owner** 在**把一次调用的成本记到某个租户头上**时，依赖 [S-27](#s-27)（用的是创建那一刻捕获的值，不是此刻的选择）
与 [S-5](#s-5)（TenantId 是稳定的引用），得到：**每一条明细都能携带一个不漂移的 TenantId**。
**但「一次调用的成本怎么算、明细怎么归集」没有 topic，是缺口 [G-02](#已知缺口)**——
本契约只承诺 TenantId 可被每次调用携带且不漂移，**不填任何口径**。

#### 场景 9：全局授权表达落成租户层的权限设置值

**meta 能力的 owner** 在**处理一笔作用域为「全局」的[授权表达](../../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression)**时，
依赖 [S-11](#s-11)、[S-16](#s-16)、[S-28](#s-28)，得到：那一笔**不留在会话流水里**，
而是写成**租户层的一个[属性配值](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)**——
以 TenantId 为归属层身份、挂在对应的资产持有上（[场景 1](#场景-1资产持有的键与属性配值)）。
**写这个值要有写它的权限**，那是另一道判定；本契约保证的是：这一笔落地时**显式携带 TenantId**，
且**不因为它来自某次会话就以 LoginStateId 或 AccountId 为键**（[S-28](#s-28)）。

#### 场景 10：任何 owner 遇到成员资格读不到

**任何持有租户范围对象的 owner** 在**调用成员资格判定却得到 `unavailable`** 时，依赖 [S-10](#s-10)、[S-25](#s-25)、[S-18](#s-18)，
得到：**一个与「无效」不同的失败值**，调用方据此明确失败、不回退、不返回空集、不写缓存（[S-26](#s-26)）。
**这一条是 17 条「有前提地能」共用的那个前提**——它不成立，其余隔离条款都会在存储抖动时集体失守。

---

## 交接与缺席恢复

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是**值层面的缺席怎么收敛**：

| 缺席的是什么 | 收敛到哪 | 谁收口 |
|---|---|---|
| 身份值缺席 / 非法 | **拒绝或明确失败**（[S-18](#s-18)） | 发生缺席的那个 owner 的准入判定 |
| 成员资格判定读不到 | `unavailable` ⇒ 明确失败（[S-25](#s-25)）；**不留下任何部分效果** | 调用方 |
| 会话级层身份 | **本版无表示**（[S-11](#s-11)）；需要它的消费者**停在这里并报缺口**，不构造 | PF-015 的 owner（[G-01](#已知缺口)） |
| 某个 TenantId 的成员关系解除 | 数据**不可达但不销毁**（[场景 5](#场景-5成员关系无效时租户级持有不可达但不销毁)） | 资产领域的 owner |
| 标识的具体形式未定 | 消费者按「非空、不透明、不可解析」编码，**不假定长度/字符集/可排序** | realization（[G-04](#已知缺口)） |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

---

## 验证义务

> 本节只列**义务与其闭合条件**。**实际执行结果、工具版本与覆盖范围不写在这里**——
> 它们归版本外的验证入口与 `record/evidence/`。

| # | 义务 | 形式 | 覆盖哪些条款 | 状态 |
|---|---|---|---|---|
| V-1 | 形状校验：合法/非法实例逐条过 Schema | JSON Schema Draft 2020-12 + [规范场景](#合法实例)的实例集 | S-4、S-5、S-7、S-8、S-10、S-11、S-12 | **未登记。**起草期间跑过一次本地形状自检（Schema 自身通过 Draft 2020-12 元模式；本页列出的正反实例全部按预期通过/拒绝）。**该次执行没有输入快照、没有进 `record/evidence/`，因此不作为证据**；正式覆盖未开始 |
| V-2 | **静态检查**：判定函数的输入集合、账号记录的字段集合、层事实表的键、身份参数有无默认值 | 实现语言的静态检查（realization 提供具体形式） | S-17、S-20、S-23、S-27、S-28 | **未开始**；检查器形式归 realization |
| V-3 | 六路径核对：每个 owner 逐条列出读/写/覆盖/删除/订阅/清理的判定位置 | 结构化核对清单（评审对象） | S-19 | **未开始** |
| V-4 | 「声称隔离」的实施位置核对 | 架构评审 | S-22 | **未开始** |
| V-5 | 结构约束：至多一个上级、无环、个人组织不在链上、共同上级谓词 | Alloy，**归 `capability.organization-governance` v1 的 `Affiliation.als`** | S-4、S-14、S-15 | **未开始**；本契约**不另造平行模型** |
| V-6 | 不可用 ≠ 无效的行为核对：注入存储不可用，观察是否发生清理或回退 | 规范场景 + 故障注入 | S-10、S-25 | **未开始** |

**不能声称的**：V-1 通过只说明**形状**合规，**不说明**任何 owner 遵守了隔离义务——
[S-16](#s-16)～[S-28](#s-28) 一条也不在 Schema 的能力范围内；
V-5 在给定规模内未找到反例，**不是**任意规模的证明；
V-2～V-4 尚无检查器，**「未开始」不等于「不需要」**。

---

## 已知缺口

**以下都不填默认值。**消费者读到这里应当知道**哪里在等裁决**，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-01** | **会话级层身份**：[作用域层](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)的第四格「会话级」用什么身份值表示 | [S-11](#s-11) 的第三个变体；需要按会话级配值/求值的消费者 | **PF-015 的 owner** |
| **G-02** | **成本计量口径**：一次调用的成本怎么算、明细怎么归集与呈现 | [场景 8](#场景-8计量按-tenantid) 只到「TenantId 可被携带」为止 | **产品负责人（无 topic）** |
| **G-03** | **个人 context 的内容**：具体有哪些项、各自语义、组织能不能影响它 | [S-24](#s-24) 只定它在哪个轴上 | **产品负责人（无 topic）** |
| **G-04** | **不透明标识的具体形式**：AccountId / OrganizationId / LoginStateId 的字符集、长度、生成方式 | Schema 只到「非空字符串」；任何需要排序、分片或字面量拼接的实现 | **realization** |
| **G-05** | **登录状态靠什么标识**：产品正文未述，只写明彼此可分辨（[domain_objects](../../../../../domain_objects/objects.md#ul-login-state--登录状态)） | [S-9](#s-9) 给的是满足「可分辨」的最小形状，**不是产品裁决** | **PF-001 的 owner**（若需要更强的形状） |
| **G-06** | **工作区目录靠什么标识**：[objects.md](../../../../../domain_objects/objects.md#ul-workspace--工作区) 记为「正文未述」 | [场景 6](#场景-6工作区宿主为租户路径只是地址) 只定归属键含 TenantId 分量，目录那一半的形式未定 | **PF-002 的 owner** |
| **G-07** | **`MembershipStanding` 与 `ScopeLayerIdentity` 没有统一语言词条。**二者指的都是已有的产品事实（成员资格判定的结果、身份带来的层及其身份值），**但这两个正式英文名不是从词表取的** | 按[统一语言的红线](../../../../../ubiquitous_language/AGENTS.md)，**先有词条才能在正文里用**；本契约接受前须补词条或换用已有词 | **统一语言的 owner** |
| **G-08** | **AccountId 与「账号的身份是登录标识」的张力**：[objects.md](../../../../../domain_objects/objects.md#ul-account--账号) 记账号的**身份**是登录标识，本契约按 [S-2](#s-2) 把两者分开 | 若裁定为「账号的身份就是登录标识」，[S-1](#s-1)/[S-2](#s-2) 须重写，TenantId 的 account 分量随之改变 | **PF-001 的 owner**；应记入 [conflicts.md](../../../../../ubiquitous_language/conflicts.md) |

---

## 版本差异与规范工件

**本版是首版，没有前身。**

2026-09-17 建在 PF-001 rev 1 上的那批候选（账号身份、租户治理、账号注册组合）已于 2026-09-22
由产品负责人裁定**整体废弃**；它们从未被接受或冻结，**不构成本契约的前身，不继承任何条款，也不建立血缘关系**。
`registry/lineage.json` 不因本契约而增加条目。

**本版包含的规范工件**：`contract.md`（本文件）、`identity-values.schema.json`。
**本版不含行为模型与结构模型**——理由见[性质与规范场景](#性质与规范场景)：本契约没有状态转移，
结构约束由 `capability.organization-governance` v1 的 Alloy 模型检查，该模型消费本契约的值定义。

**发布后**：本目录下的规范正文与 Schema 不可原地覆盖；修改发布新版本。
[已知缺口](#已知缺口)任一项被裁决后，凡改变本契约语义或表示的，都出 **v2**，
**推荐版本不自动升级消费者**。

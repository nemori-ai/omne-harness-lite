# 身份值与隔离义务 · `data.identity-values` v1

- **契约坐标**：`baseline_id = omne-harness-lite-design-2026-09-15`；`contract_id = data.identity-values`；`version = v1`；状态 `candidate`。资源路径 `spec/data/identity-values/v1/`。
- **设计依据**：
  [PF-001 rev 10 §4 账号](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)、
  [§4 组织](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)、
  [§4 个人组织](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织)、
  [§4 租户](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户)、
  [§4 退出之后再加入，回来的是同一个租户](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)、
  [§4 当前租户身份](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份)、
  [§4 角色](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)、
  [§4 Context](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)、
  [§6.1 层次](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)、
  [§6.4 隔离](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)、
  [§6.5 本地资源定位](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位)（含[路径是地址，不是钥匙](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)）、
  [§6.6 撤销不等于强制停止](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)、
  [§6.7 创作与归属](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)；
  [flows §3.1 账号](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)、
  [§3.2 登录状态](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态)、
  [§3.3 成员关系](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)；
  [SYS-TENANT](../../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、
  [SYS-DEPLOY](../../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)、
  [SYS-SPEC](../../../../../foundation/cross-system-constraints/requirements.md#sys-spec)。
- **精确语义依赖**：**本版无 spec 内依赖**，catalog 的 `dependencies` 为空。本契约是租户相关领域五份契约里最先定的一份，其余四份引用它；词汇依据是[统一语言](../../../../../ubiquitous_language/index.md)，词表不是契约依赖项。

---

## 含义与使用范围

### 这份契约拥有什么

**两样东西，缺一不可：**

1. **身份值的含义与形状**——账号、组织、租户、登录状态、租户角色、组织变体、成员资格判定结果、作用域层身份，各是什么、取什么值、怎样判定相等、怎样交换。
2. **隔离义务条款**——**每一个持有租户范围对象的 owner 都要遵守的同形条款**。它们写在这里，因为[跨租户访问默认拒绝](../../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)这件事不需要跨 owner 的共同提交，需要的是**每个 owner 各自不漏**；写成一份共用契约，每个 owner 才能照着逐条自检。

**身份值没有状态转移。**有状态的是**记录**——成员记录、登录状态记录、组织记录——它们的生灭与写路径归相应能力契约。本契约只说：**那些记录用什么值作键、那些值怎样判定同一。**

### 谁是消费者

| 消费者 | 消费什么 |
|---|---|
| **资产领域**（具名第一消费者：[PF-002](../../../../../product/PF-002-assets-settings-and-permissions/design.md) 与 [PF-003](../../../../../product/PF-003-asset-transfer-and-sharing/design.md) 的契约） | 资产持有的归属层键、属性配值的键、作者与所有者记录、复制前提与分享边界的输入 |
| **账号与登录**（`capability.account-identity`） | AccountId、LoginStateId 的形状与唯一性范围 |
| **组织治理**（`capability.organization-governance`） | OrganizationId、OrganizationKind、TenantId、TenantRole、MembershipStanding、ScopeLayerIdentity 的形状；它是这些值的**产生方** |
| **会话领域**（[PF-015](../../../../../product/PF-015-session-lifecycle-and-ownership/design.md) 的契约） | 会话创建时捕获并持有的 TenantId |
| **一切持有租户范围对象的 owner** | 全部隔离义务条款 |

### 明确不承诺

- **不定义成员资格怎么判。**本契约只定 `MembershipStanding` 这个值的形状与消费义务；**判定本身归 `capability.organization-governance`**，加入、角色调整、解除的写路径与并发约束也在那里。
- **不定义账号怎么鉴权。**凭据形式、校验方式、登录反馈的失败集合归 `capability.account-identity`。
- **不定义资产持有本身。**持有关系、属性配值、求值与层序归资产领域的契约；本契约只供它们的键。
- **不定义标识怎么生成。**分配算法、序号形态、存储主键选型归 realization。
- **不定义用什么机制拦住越权读写。**本契约定的是**谁有资格**；操作系统层面文件防不防得住[不归身份模型](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位)。
- **不定义个人 context 的内容。**只承诺它不是范围化对象（见 S-25）。

---

## 值、身份与结构关系

### 不透明标识

| 元素 | 精确含义与取值约束 | 身份、相等或引用规则 |
|---|---|---|
| **AccountId** | [账号](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-account--账号--account)的规范标识 | S-1、S-2 |
| **OrganizationId** | [组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-organization--组织--organization)的规范标识 | S-3 |
| **LoginStateId** | [登录状态](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state)的规范标识 | S-8 |

**S-1 · AccountId 是账号的规范标识。**不透明、**部署内唯一**、由存储在产生账号那一刻分配，**不来自运行时对象**（Cordis 的 `Fiber.uid` 之类是本次 registry 内的实例身份，不是持久身份，一律不可用作本契约的任何标识）。账号[本版无终止路径](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)，因此 AccountId **不被回收、不被复用**。

**S-2 · 登录标识不是引用键。**[登录标识](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)是账号的**一项属性**：对外名字，部署内唯一，注册时确定，未激活也占用。**任何跨对象引用一律用 AccountId，不用登录标识。**产品正文给出了它的唯一性与确定时机，**没有给出它的变更路径，本契约据此不承诺它恒定**（见[已知缺口](#已知缺口) G-06）；把一个不承诺恒定的值当引用键，引用会在它变的那一刻集体失效。**登录标识的表示形式本契约不承诺**，归 `capability.account-identity`。

**S-3 · OrganizationId 是组织的规范标识。**不透明、部署内唯一、由存储在创建组织那一刻分配。组织[本版没有终结路径](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)，因此 OrganizationId 不被回收、不被复用。

**S-8 · LoginStateId 是登录状态的规范标识。**不透明、部署内唯一。[每次登录产生新的一个](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态)；**失效不可逆，且失效在系统重启之后依然成立**；重新登录得到的是新的一个 LoginStateId，**不是旧值复活**，因此 LoginStateId **不被复用**。

### 组织的变体

**S-4 · OrganizationKind 恰有两个取值：`personal`（[个人组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-personal-organization--个人组织--personal-organization)）与 `team`（[团队组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-team-organization--团队组织--team-organization)）。**它在**创建时确定、此后不可改**，没有任何写路径把一个取值改成另一个。`personal` 蕴含三条**结构性**事实，不是可被调整的设置：**不可邀请**、**上级组织恒空**、**不可作他人的上级**。消费者判断这三件事时读这一个值，**不另立标志位**。

### 租户身份

**S-5 · TenantId 是值，不是被铸出来的标识。**[租户](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)身份**就是 (OrganizationId, AccountId) 这一组合**。由此：

- **结构相等**：两个 TenantId 相等 ⟺ 两个分量各自相等。**不存在第二种相等判据**，也不存在"等价但不同"的两个 TenantId。
- **不含角色**：租户角色（本节 S-7）不进身份。角色变了，身份没变。
- **不另铸标识**：任何一方**不得**为租户再分配一个不透明 id 并声称它是租户身份；那会立刻产生两份权威，而其中一份会在成员关系断续时被重新分配。
- **不因成员关系断续而变**：[退出之后再被邀请回来，得到的仍是同一个 TenantId](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)。
- **无销毁路径**：只要它的两个分量存在，这个 TenantId 就**永久可引用**。成员关系解除改变的是它**此刻有没有效**，不改变它**是哪一个**。

**S-6 · TenantId 的规范序列化形式恰有一种。**即 Schema 里的 `TenantId`：一个恰含 `organization` 与 `account` 两个字段的对象。**相等性与唯一性判定只在这个结构形式上定义。**
实现若需要一个标量编码（存储索引键、日志字段、度量标签），那是 realization 的事，且必须满足三条：**单射**（两个不同的 TenantId 不得编码成同一个标量）、**一个部署只有一条编码规则**、**编码结果不是身份**——任何一方**不得**把标量编码解析回分量来作判定，判定一律走结构形式（见 S-17）。

**S-7 · TenantRole 恰有两个取值**：`superAdministrator`（[超级管理员](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-super-administrator--超级管理员--super-administrator)）与 `member`（普通成员）。[一个租户在其组织内恰持一个](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)；它**可变**，[变更只影响此后的准入判定](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)，不改变已发生的归属与既有事实。超级管理员的作用域**恰是该组织**，这一个值不表达平台范围的任何资格。

### 成员资格判定结果

**S-9 · MembershipStanding 是三值，不是布尔。**给定一个 TenantId，判定结果恰是下列之一：

| 取值 | 含义 | 携带什么 |
|---|---|---|
| `effective` | 该租户此刻是有效成员 | **必须**携带当前的 TenantRole |
| `ineffective` | 该租户此刻不是有效成员（从未加入，或成员关系已解除） | 不携带其他字段 |
| `unavailable` | **判定做不出来**（判定依据读不到） | 不携带其他字段 |

**S-10 · `unavailable` 不是 `ineffective`，消费者据它失败。**收到 `unavailable` 的一方**必须明确失败**，
**不得**：当作 `ineffective` 继续、[静默回退到个人范围](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)、返回空集合、返回缓存的旧结果、或以"稍后重试"掩盖成一次成功。
**理由**：`ineffective` 是一个**已经做出的判定**，`unavailable` 是**没有判定**。把后者当成前者，等于让一次读不到依据变成一次"他不是成员"的结论——而那个结论会被下游当作事实写进记录。

### 作用域层身份

**S-11 · ScopeLayerIdentity 恰有两个变体。**[身份带来的作用域层](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)里，**本契约供得出身份值的恰是两层**：

| 层 | 身份值 |
|---|---|
| 组织级 | OrganizationId |
| 租户级 | TenantId |

**S-12 · 另外两层各有各的理由，都不得被补上一个值。**

- **出厂默认层没有身份值。**它[归属于系统](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)，而[官方件没有租户](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)，[出厂默认层的设置与权限就是 official 资产自带的那一份，不需要另一套来源](../../../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)。**任何一方不得铸造"平台租户""系统组织"之类的值来填这一格**——一旦存在这样一个值，它就会出现在归属字段里，而没有任何自然人对应它。
- **会话级层身份是缺口**（G-01），归 [PF-015](../../../../../product/PF-015-session-lifecycle-and-ownership/design.md)。Schema **刻意不含** `session` 变体：需要它的消费者应当被明确阻断，而不是照着一个猜测实施。
- **[工作区](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)不是这里的一格**：它[不是一重身份](../../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)，[只在设置那条层序上占一格](../../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)。本契约只承诺**它的宿主是租户**（见 S-22 与消费者场景 C-06），它自己的身份形状归资产领域的契约。

---

## 表示与边界校验

规范交换表示见同目录 [`identity-values.schema.json`](identity-values.schema.json)（JSON Schema Draft 2020-12）。
`$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/identity-values/v1/identity-values.schema.json`。

**S-13 · 不透明标识的交换表示是非空字符串，相等是逐码点精确相等。**不做 Unicode 规范化、不做大小写折叠、不做首尾空白裁剪；因此表示上**禁止**首尾空白。**消费者不得解析标识的内容**推断任何事实——不得从中读出创建时间、序号、类型、所属，也不得按前缀分组。它不透明，这是它唯一的约定。**具体的词法形式（长度、字符集、是否 UUID）本契约不承诺**，归 realization（G-05）。

**S-14 · TenantId 的两个分量都必需，缺席即非法值。**只给 `organization` 或只给 `account` 的对象**不是**一个 TenantId，**一律拒绝**；**任何一方不得用"当前登录的账号""当前组织"之类的环境值把缺的那一半补齐**——那正是 S-18 要挡住的事，只是发生在校验层。TenantId 对象**不接受额外字段**：多出来的 `role`、`standing`、`displayName` 一律使该值非法（角色不进身份，见 S-5）。

**S-15 · 判别式集合是闭合的。**`OrganizationKind`、`TenantRole`、`MembershipStanding.standing`、`ScopeLayerIdentity.layer` 各是一个**闭合枚举**。遇到未知取值**一律作非法输入拒绝**，**不得**映射到"最接近"的已知值、**不得**当作缺省、**不得**忽略该字段继续。理由：这四个枚举里每一个未知值都可能是一个更宽的资格，静默降级会把它变成一次放行。

**S-16 · 表示层校验与判定分开。**表示非法的输入**在进入任何判定之前**被拒绝，其拒绝**不表示**"该对象不存在"或"该主体无资格"，也不得被记成一次判定结果。反过来，表示合法**不表示**任何资格——见 S-18。

**S-17 · 语义身份与实现地址是两件事。**存储主键、表名、文件路径、目录名、缓存键、消息队列主题、度量标签，都是**地址**；[身份只由本契约的值确定](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)。任何一方**不得**把地址回读成身份，也不得因为两个对象地址相邻/同盘/同目录就认为它们同属一个租户。

---

## 隔离义务

> **这一节是本契约的核心。**每一条都写成**另一个 owner 能照着自检**的形式：
> **谁在何处保护**回答"这条要落在你代码的哪个位置"，**违反时可观察到什么**回答"你怎么知道自己漏了"。
> 全部来源：[SYS-TENANT](../../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、
> [PF-001 §6.4 隔离](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)、
> [§6.5 本地资源定位](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位)、
> [§6.6 撤销不等于强制停止](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)。

**S-18 · 显式携带，无默认值，缺席即拒绝。**
受租户所有权约束的对象与跨范围操作，**在接口签名上显式携带** ScopeLayerIdentity（租户级即 TenantId，组织级即 OrganizationId）。该参数**没有默认值**，**不可省略**，**不从环境、线程上下文、Cordis Context、当前登录态或"上次用过的那个"推断**。缺席 ⇒ **拒绝**，不空集、不回退、不猜。
*谁在何处保护*：每个 owner 的**数据访问入口**——最贴近存储的那一层，不是它上面的服务门面。
*违反时可观察到什么*：存在一个不传该参数也能返回非空结果的入口；或该参数是可选的且省略时返回"全部"。

**S-19 · 六条路径同一判定。****读、写、覆盖、删除、订阅、清理**——六条路径走**同一个**判定，不是六份各写各的。订阅指事件订阅与推送；清理指后台任务、过期回收、批量迁移。
*谁在何处保护*：同一个判定函数被六条路径共同调用；后台任务与事件分发**不得**走绕过它的内部接口。
*违反时可观察到什么*：能构造一次删除、一次订阅或一次后台清理，触及另一个 TenantId 的行；或读路径有判定而清理任务直接按时间戳扫全表。

**S-20 · 判定依据只由三样东西构成。****身份值**（本契约的值）＋ **持有记录**（哪一份东西归哪个归属层）＋ **成员资格判定**（S-9）。
判定的**输入里不得出现**：物理路径、当前工作目录、操作系统用户、主机名、存储位置、进程环境变量、网络来源、请求头里未经验证的字段。
*谁在何处保护*：判定函数的**入参类型**——它只接得住这三样；这是一条可被静态检查的条款。
*违反时可观察到什么*：判定函数签名里出现路径或环境类型；或同一组身份值在两个目录下得到不同答案。

**S-21 · 物理位置不构成资格。**[路径是工作区的地址，用来指认它是哪一份，那不是资格](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)。**另一个账号或租户，哪怕用同一个操作系统用户、进到同一个目录，也不因此可以访问那份工作区。**
*谁在何处保护*：工作区/本地资源的解析点——先由身份值与持有记录求出适用范围，**再**用路径指认是哪一份。
*违反时可观察到什么*：切换到另一个租户身份后，进到同一目录仍读到上一个租户的资产或配值；或存在"按目录查归属"的反向解析。

**S-22 · 同一目录在两个租户下是两份。**工作区[挂在租户下](../../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区)：同一个宿主机目录被两个不同的 TenantId 挂上，**那是两份工作区**，各持各的资产、各配各的值、互相看不见。
*谁在何处保护*：工作区的身份构成——TenantId 是它的一个必需分量，不是一项可选标注。
*违反时可观察到什么*：工作区记录以路径为唯一键；或换一个租户身份挂上同一目录，看到的是同一批资产。

**S-23 · 不得以可见性隔离、事件过滤或缓存键前缀冒充隔离。**服务实例的可见性隔离（Cordis `isolate`）、事件过滤器、缓存键前缀、界面上的筛选，**都不是隔离**——它们决定**看不看得见**，不决定**够不够资格**。**任何声称隔离的接口，都要能指出判定实施在哪一行**。
*谁在何处保护*：数据访问层；上面那些只是便利。
*违反时可观察到什么*：把前缀、过滤器或 `isolate` 标签去掉之后，**同一次调用返回了跨租户的数据**——这说明判定本来就不在数据访问层。

**S-24 · 账号记录不含跨账号关联字段。**[两个账号之间没有任何通路](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)，哪怕背后是同一个自然人；系统**不核验、不关联、也不记录**两个账号是否属于同一人。
*谁在何处保护*：账号记录的**数据形状**——这是一条可被静态检查的条款（字段清单里不得出现指向另一个 AccountId 的引用、"同一人"标记、共享的设备或联系方式聚类键）。
*违反时可观察到什么*：存在一个查询，输入一个 AccountId 能得到另一个 AccountId；或去重/合并逻辑把两个账号当成一个。

**S-25 · 个人 context 不进任何层。**[个人 context 不是范围化对象](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)，**不参与任何层的求值，也不被任何层配值**；它挂在账号上，跟着人走。反向同样成立：[账号的身份事实（登录标识、凭据、激活状态）不是范围化对象](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)，不得被当作某一层的设置或权限。
*谁在何处保护*：属性配值的写入点——它的键里只有归属层身份与资产持有，容不下账号级的项。
*违反时可观察到什么*：界面语言或时区出现在某一层的属性配值里；或切换组织之后界面语言变了；或"是否已激活"能被某一层配值。

**S-26 · 成员关系无效使租户级私有部分不可达，但不销毁。**[解除只改成员记录的有效性](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)：**不铸新身份、不发出任何删除、不改任何持有的键**。持有仍以那个 TenantId 为键留在原处；[重新加入之后原样可用](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)，**这不是一次恢复动作**——没有东西被删过。
*谁在何处保护*：资产领域以**成员资格判定**决定可达，以**持有记录**决定存在；两者不是同一个判断。
*违反时可观察到什么*：解除成员触发了一次删除、迁移或改键；或重新加入之后需要重建；或"不可达"被实现成把持有记录的 TenantId 置空。

**S-27 · 每道准入现读；缓存须写明失效条件。**[角色变更、退出、撤权影响的是下一道尚未通过的准入](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)；**旧菜单、缓存与历史成功不能继续当作授权。**要缓存，就在契约里写明它的失效条件与上界，**不得**留一个"通常很快就会更新"。
*谁在何处保护*：每一道准入判定点。
*违反时可观察到什么*：解除成员或降级之后，下一次操作仍被放行；或存在一个没有失效条件的授权缓存。

**S-28 · 当前租户身份是创建那一刻捕获的值。**[它是登录状态上的一项选择](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份)，**本身不是范围化对象**、不参与任何层求值。规则两句：

- **查询面给值**：以 LoginStateId 问出当前的 TenantId（由 `capability.organization-governance` 提供）。
- **产生租户归属数据的流程，在开始时带着这个值，此后一切以它计**——成本算在它头上、归属记在它名下、能用什么按它求值。**切换只影响此后新建的东西。**

*谁在何处保护*：每一个**创建**入口——在创建那一刻把 TenantId 写进被创建对象，此后**只读它自己持有的那个值**，不再回头问"现在当前租户是谁"。
*违反时可观察到什么*：一个已经建起来的对象，其归属或计量在用户切换组织之后变了；或某段代码在运行中途重新读取当前租户身份来决定归属。

**S-29 · 层事实的写路径只以显式身份值为键。**[一层的事实不因切换组织被复制到另一层，方向两边都算](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)。切换**不复制**任何层的事实；账号的身份事实**不进**任何层。
*谁在何处保护*：写入层事实的每一处——键由调用方显式给出的 OrganizationId / TenantId 构成。
*违反时可观察到什么*：一次切换之后，新范围里出现了旧范围的配值或资产；或存在"把我的设置带过去"这类跨层复制路径。

**S-30 · TenantId 只声称身份，不证明资格；跨边界须重验。**持有一个 TenantId **不表示**持有者有权以它行事。进程内的归因信息**不自动成为远程凭证**：跨进程、跨队列传递时**显式携带身份与授权依据，并在接收边界重新验证**。缺失、冲突、未经授权的跨租户访问**一律默认拒绝**。
*谁在何处保护*：每一个接收边界（RPC 入口、队列消费者、事件处理器）。
*违反时可观察到什么*：一条消息里带的 TenantId 被直接信任；或内部调用跳过验证因为"都是自己人"。

---

## 性质与规范场景

### 性质表

| 性质 | 来源 | 谁在何处保护 | 违反时可观察到什么 | 证据形式 |
|---|---|---|---|---|
| P-1 租户身份 = (组织, 账号)，结构相等，不含角色 | [PF-001 §4 租户](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户) | 数据形状（S-5/S-6/S-14） | 出现第二种相等判据，或 TenantId 里带角色 | JSON Schema + 静态检查 |
| P-2 租户身份不因成员关系断续而变，无销毁路径 | [PF-001 §4 退出之后再加入](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户) | 数据形状：不存在"销毁租户"的写路径（S-5/S-26） | 解除成员之后历史记录里的作者指向一个查不到的身份 | 静态检查（无该写路径）＋ 规范场景 |
| P-3 租户角色单值两取值，变更只影响此后 | [PF-001 §4 角色](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色) | 闭合枚举（S-7/S-15） | 出现第三个角色值，或角色变更回溯改了署名 | JSON Schema |
| P-4 组织变体创建时定、不可改 | [PF-001 §4 个人组织](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织) | 数据形状：无写路径（S-4） | 存在把 `personal` 改成 `team` 的操作 | 静态检查 |
| P-5 成员资格判定三值，不可用 ≠ 无效 | [PF-001 §6.4 隔离](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | 返回值类型（S-9）＋ 各消费者的失败分支（S-10） | 存储不可用时返回"无资产"而不是失败 | JSON Schema + 规范场景 |
| P-6 受约束对象显式携带身份，缺席即拒绝 | [SYS-TENANT](../../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、[PF-001 §6.4](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | 各 owner 的数据访问入口（S-18/S-19） | 存在不带身份也返回非空的入口 | 静态检查（接口签名）＋ 真实组合检查 |
| P-7 判定依据不含物理位置 | [PF-001 §6.5](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位) | 判定函数入参类型（S-20/S-21） | 判定签名里出现路径或环境类型 | 静态检查 |
| P-8 账号之间无通路 | [PF-001 §4 账号](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)、[§6.4](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | 账号记录的数据形状（S-24） | 存在由一个 AccountId 查到另一个的路径 | 静态检查（字段清单） |
| P-9 个人 context 不进层 | [PF-001 §4 Context](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息) | 属性配值的键构成（S-25） | 界面语言随切换组织而变 | 静态检查 + 规范场景 |
| P-10 归属在创建那一刻被捕获，此后不漂移 | [PF-001 §4 当前租户身份](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份)、[PF-015 §6.12](../../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) | 各创建入口（S-28） | 已创建对象的归属随切换而变 | 规范场景 |
| P-11 出厂默认层无身份值 | [PF-001 §6.1](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)、[§6.7](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) | 闭合枚举（S-11/S-12） | 归属字段里出现一个没有自然人对应的"平台租户" | JSON Schema |

**进展性质**：本契约**不拥有任何进展性质**。值不会"最终成为"别的值；一切与时间有关的推进（成员资格何时生效、撤销何时可见）归产生这些值的能力契约。

### 装配给 vs 协议给（[SYS-DEPLOY](../../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)）

本契约是**数据契约**，领域语义在单机与分布式下是同一句话。但**支撑这些语义的判定**，一部分在单机由存储给、在分布式必须由协议重新兑现：

| 判定 | 单机由谁给 | 分布式必须由谁重新兑现 |
|---|---|---|
| TenantId 的结构相等、枚举闭合、标识逐码点相等 | **与部署形态无关** | 不需要新兑现。**它们是值的性质，不是协调的结果** |
| AccountId / OrganizationId / LoginStateId **部署内唯一** | 存储的唯一约束 ＋ 单点分配 | **标识分配协议**。不得依赖单节点自增或本地时钟；跨节点分配须保证全局不重、不回收、不复用 |
| 登录标识部署内唯一（未激活也占用） | 存储的唯一约束 | 同上 |
| TenantId 标量编码的"一个部署一条规则"（S-6） | 单一实现自然成立 | **须成为显式协议**：各节点用同一条编码规则，否则同一租户在两处得到两个索引键 |
| 成员资格判定的新鲜度（S-27 的"现读"） | 同一存储的读写顺序 | **可见性窗口的上界须被定义并写进消费它的契约**；未定义时，消费者不得把"刚才读到有效"当作"此刻有效" |
| 身份与授权依据的跨边界传递（S-30） | 同进程内传参 | **显式传递 ＋ 接收边界重验**；进程内归因不自动成为远程凭证 |

**这张表本身是契约的一部分**，不是流程笔记：装配给的保证在分布式演化时**必须**由协议重新兑现，谁也不得因为"现在是单机"而省掉。

### 缺席、不可用与恢复

| 情形 | 本契约的答案 |
|---|---|
| 身份值**缺席**（参数没传、字段没有） | **拒绝。**不补默认、不从环境推断、不空集（S-18/S-14） |
| 身份值**表示非法** | **拒绝**，且不记成一次判定结果（S-15/S-16） |
| 成员资格**判不出来** | 返回 `unavailable`，消费者**明确失败**（S-9/S-10） |
| 判定依据**暂时读不到**，随后恢复 | 值不因中断而改变：**同一组分量仍是同一个 TenantId**。恢复之后无需重建任何身份（S-5） |
| 系统**重启** | 身份值全部来自存储，**没有一个来自运行时**（S-1）；登录状态的失效在重启之后依然成立（S-8） |
| 一个租户身份**此刻无效** | 它仍**永久可引用**：历史记录照旧指向它，租户级持有不可达但不销毁（S-26） |

### 消费者核对场景

格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**

**C-01 · 资产持有的键与属性配值。**资产领域的契约，在"同一份资产同时被组织级与租户级持有、两级各自配了值"的情形下，依赖 **S-11、S-5、S-6、S-14**：得到两份持有的归属层键**互不相等**（一个是 OrganizationId，一个是 TenantId），因此[两级的属性配值各挂各的持有](../../../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)、互不覆盖，[几级都配了听谁的由那一维的层序决定](../../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)，而不是由键碰撞决定。

**C-02 · 作者 = TenantId，所有者 = OrganizationId 或 TenantId。**资产领域的契约，在"成员在组织范围创作、此后被降级、再此后退出组织"的情形下，依赖 **S-5（不含角色、无销毁路径）、S-7、S-26**：得到[所有者是该组织、作者是该租户](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识)，**署名不随角色变动而变、不随成员关系解除而失效**，且那个作者值**永远解析得回一个存在的身份**，不会成为孤儿。

**C-03 · 资产复制的前提「同一账号的两个 TenantId」。**资产流转的契约，在"某人要把个人组织里的资产复制到他所在的团队"的情形下，依赖 **S-5、S-6**：[同一自然人](../../../../../product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份)这个前提落成一个**可判定的结构条件**——源 TenantId 与目标 TenantId 的 `account` 分量**相等**且 `organization` 分量不等；两侧成员资格是否 `effective` 另由治理契约给（S-9）。**不需要"必须本人操作"这类额外规定**，也不需要引入"自然人"这个第三种身份。

**C-04 · 分享边界「有共同上级」。**资产流转的契约，在"判断两个组织之间能不能分享"的情形下，依赖 **S-3、S-4**：得到[上级链谓词](../../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)的输入是稳定的 OrganizationId（不回收、不复用），且 `personal` 这个不可改的变体值直接蕴含"上级恒空"，因此**任何两个个人组织永远没有共同上级**——不是把门放宽，是那把尺子量不到它们。谓词本身归 `capability.organization-governance`。

**C-05 · 成员关系无效时租户级持有不可达、不销毁。**资产领域的契约，在"成员被移除之后又被邀请回来"的情形下，依赖 **S-26、S-5、S-9**：得到持有记录的键（那个 TenantId）**自始至终没变**，不可达是**成员资格判定**的结果而不是删除的结果，[重新加入之后原样可用](../../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)，**没有任何恢复动作需要被实现**。

**C-06 · 工作区宿主为租户，路径只是地址。**资产领域与执行环境的契约，在"同一台宿主机上，一个账号切到另一个租户身份、进到同一个目录"的情形下，依赖 **S-21、S-22、S-17、S-20**：得到[那是两份工作区](../../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区)，各持各的资产与配值、互相看不见；路径用来**指认是哪一份**，资格来自持有记录归哪个租户、来者此刻是不是该租户的有效成员。

**C-07 · 会话持有创建那一刻的 TenantId。**会话领域的契约，在"用户在租户 A 下建了会话，随后切到租户 B"的情形下，依赖 **S-28、S-5**：得到[这个会话一直是租户 A 的](../../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)——成本、归属、可见性都不漂移；而且即便那个租户身份此刻失效，会话的归属字段**仍然解析得回一个存在的身份**（S-5 无销毁路径），失效之后的收场按会话领域自己的规则。

**C-08 · 计量按 TenantId。**计量的消费者，在"一次模型调用要算到某个租户头上"的情形下，依赖 **S-5、S-28、S-6**：得到每条计量记录都能携带**一个稳定、可永久引用、可作聚合键**的 TenantId，且这个值**在动作开始时就被捕获**，不随派发层级或后续切换漂移。
**口径是缺口**（G-02）：算什么、何时结算、怎么聚合成[账单明细](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)，本契约**不承诺**，也不给一个看起来合理的默认。

**C-09 · 全局授权表达落成租户层的权限设置值。**meta 能力的契约，在"用户说'以后所有会话都这样'"的情形下，依赖 **S-11、S-18**：得到那一档[落成租户层的权限设置值](../../../../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)，其归属层键是 TenantId，写入点显式携带它；**写得成写不成，由权限判定给**——[会话里坐着的那个人，未必是设权限的那个人](../../../../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)。本契约只保证那个键是什么，不保证谁写得了。

**C-10 · 超级管理员读不到成员的个人范围。**任一持有租户范围对象的 owner，在"某组织的超管尝试读取一位成员个人组织下的东西"的情形下，依赖 **S-18、S-9、S-10、S-30**：访问点显式携带那个个人组织的 TenantId 去判，而超管的账号**不是该个人组织的成员**，判定返回 `ineffective` ⇒ **拒绝**；[超管的作用域恰是该组织](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)这件事因此**不需要一条额外规则**，它是判定的自然结果。若判定返回 `unavailable`，**同样拒绝**（S-10），而不是"读不到成员资格所以按无权处理"之外的任何变通。

### 合法实例

```json
{ "organization": "org_7f3c", "account": "acc_91ab" }
```
合法的 TenantId：两个分量齐全、无额外字段。

```json
{ "standing": "effective", "role": "superAdministrator" }
```
合法的 MembershipStanding：`effective` 携带当前角色。

```json
{ "standing": "unavailable" }
```
合法的 MembershipStanding：**判不出来**。消费者据 S-10 明确失败。

```json
{ "layer": "tenant", "tenant": { "organization": "org_7f3c", "account": "acc_91ab" } }
```
```json
{ "layer": "organization", "organization": "org_7f3c" }
```
合法的 ScopeLayerIdentity：两个变体各一。

### 非法实例

| 实例 | 为什么非法 | 条款 |
|---|---|---|
| `{ "organization": "org_7f3c" }` | 缺 `account` 分量。**不得用"当前登录账号"补齐** | S-14 |
| `{ "organization": "org_7f3c", "account": "acc_91ab", "role": "member" }` | 角色不进身份 | S-5 · S-14 |
| `"org_7f3c:acc_91ab"` | 拼接字符串不是规范序列化形式；标量编码不是身份 | S-6 · S-17 |
| `{ "standing": "effective" }` | `effective` 必须携带角色 | S-9 |
| `{ "standing": "unknown" }` | 闭合枚举遇未知取值一律拒绝，**不得降级为 `ineffective`** | S-15 · S-10 |
| `{ "standing": "ineffective", "reason": "storage down" }` | 把一次"读不到"表达成了一次判定 | S-10 · S-15 |
| `{ "layer": "session", "session": "ses_1" }` | 会话级层身份是缺口，本版**不可表示** | S-12 · G-01 |
| `{ "layer": "factoryDefault" }` | 出厂默认层**没有**身份值；不得铸造平台租户 | S-12 |
| `{ "layer": "workspace", "path": "/srv/proj" }` | 工作区不是身份带来的层；路径不是身份 | S-12 · S-17 · S-21 |
| `{ "organization": " org_7f3c ", "account": "acc_91ab" }` | 标识禁止首尾空白（相等是逐码点精确相等） | S-13 |
| `{ "organization": "", "account": "acc_91ab" }` | 空标识 | S-13 |
| `{ "kind": "personal", "invitable": false }`（作为组织变体传入） | `invitable` 是从 `personal` 推出来的，不另立标志位 | S-4 |

---

## 版本差异与规范工件

### 版本差异

**首版。**没有被采用的旧版本，因此**没有含义或表示上的差异可陈述**，也没有消费者迁移。2026-09-17 那批候选从未被接受或冻结，**不构成前身、不继承任何条款**。

### 规范工件

| 工件 | 覆盖什么 | 状态 |
|---|---|---|
| [`identity-values.schema.json`](identity-values.schema.json) | S-4～S-9、S-11～S-15 的形状；P-1、P-3、P-5、P-11 | 随本候选交付 |
| 静态检查清单（下表） | S-4、S-20、S-21、S-24、S-25、S-29；P-2、P-4、P-7、P-8、P-9 | **待建**，归 realization |
| 规范场景 C-01～C-10 | 消费者可观察结果 | 随本候选交付（文本） |

**不建 TLA+，不建 Alloy，理由写在这里而不是留白**：本契约的值**没有状态转移**（S-5 无销毁路径、S-4 无变更路径，这两条本身就是"没有这条边"），也**没有需要在给定规模里找反例的结构关系**——上级链的无环与至多一个上级归 `capability.organization-governance` 的 `Affiliation.als`。**在这里建模型只会产出一份与 Schema 同义的平行工件。**

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**：

| # | 检查什么 | 对应条款 |
|---|---|---|
| SC-1 | 判定函数的入参类型里不出现路径、目录、OS 用户、主机名、环境变量类型 | S-20 · S-21 |
| SC-2 | 账号记录的字段清单里不出现指向另一个 AccountId 的引用，或任何跨账号聚类键 | S-24 |
| SC-3 | 受租户约束的数据访问入口，身份参数**必需且无默认值** | S-18 |
| SC-4 | 读/写/覆盖/删除/订阅/清理六条路径调用**同一个**判定函数 | S-19 |
| SC-5 | 不存在把 OrganizationKind 从一个取值改成另一个的写路径 | S-4 |
| SC-6 | 不存在"销毁租户身份"的写路径；解除成员的实现里不含删除、迁移或改键 | S-5 · S-26 |
| SC-7 | 属性配值的键构成里不含账号级的项 | S-25 · S-29 |
| SC-8 | 不存在第二处把 TenantId 编码成标量的规则 | S-6 |

**覆盖与实际证据归版本外的 `verification.md`；本版所有检查义务状态为「未开始」，不得以"已列出"充当"已通过"。**

### 已知缺口

**以下各条一律不填默认值。**下游据此知道哪里在等裁决，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| G-01 | **会话级层身份**：会话这一层的身份值是什么形状 | ScopeLayerIdentity 的第三格；会话级的设置与权限归属 | [PF-015](../../../../../product/PF-015-session-lifecycle-and-ownership/design.md) |
| G-02 | **成本计量口径**：算什么、何时结算、怎么聚合成账单明细 | C-08；一切计量消费者 | 产品负责人（**当前无 topic**） |
| G-03 | **个人 context 的内容**：具体有哪些项 | S-25 的另一半（本契约只承诺"不进层"） | 产品负责人（**当前无 topic**） |
| G-04 | **工作区靠什么标识那个宿主机目录**（[正文未述](../../../../../domain_objects/objects.md)） | S-22 的目录分量 | [PF-002](../../../../../product/PF-002-assets-settings-and-permissions/design.md) |
| G-05 | **不透明标识的具体词法形式**（长度、字符集、是否 UUID）与分配算法 | 无（本契约不依赖它） | realization |
| G-06 | **登录标识是否可改**：正文给了唯一性与确定时机，**未给变更路径** | 不阻断——S-2 已用 AccountId 作引用键绕开它 | [PF-001](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md) owner |
| G-07 | **`MembershipStanding`、`ScopeLayerIdentity` 无统一语言词条**，二者的正式中英文名尚未在词表里落定 | 跨 topic 引用这两个词时无权威译名 | [统一语言](../../../../../ubiquitous_language/README.md)；**本契约只在契约内使用这两个名字，不视作已立词条** |
| G-08 | **登录标识的正式英文名**无词条 | 同上 | 同上 |

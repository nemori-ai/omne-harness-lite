# 身份值与隔离义务（`data.identity-values` v1）

- **契约坐标**：baseline `omne-harness-lite-design-2026-09-15` · contract_id `data.identity-values` · version `v1`
  （资源位置 `spec/data/identity-values/v1/`；文件位置不代替三元组身份）
- **状态**：candidate。接受依据与采用关系归 registry 的 catalog，本页不登记。
- **设计依据**：
  [SYS-TENANT](../../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) ·
  [SYS-DEPLOY](../../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) ·
  [SYS-SPEC](../../../../../foundation/cross-system-constraints/requirements.md#sys-spec) ·
  [PF-001 rev 10](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md)
  §4（[账号](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)、
  [组织](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)、
  [个人组织](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织)、
  [租户](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户)、
  [退出之后再加入](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)、
  [当前租户身份](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份)、
  [角色](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)）、
  [§6.1](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)、
  [§6.4](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)、
  [§6.5](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位)（含
  [路径是地址，不是钥匙](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)）、
  [§6.7](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)；
  [flows §3.1](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)–[§3.3](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)
- **词汇依据**：统一语言
  [主体与归属](../../../../../ubiquitous_language/terms/subjects-and-ownership.md) 全卷 ·
  [作用域与求值](../../../../../ubiquitous_language/terms/scope-and-resolution.md)
  （UL-scope-layer、UL-workspace、UL-attribute-assignment、UL-collaboration-scope-context、UL-personal-context）；
  英文名一律取自词条，不另译。本契约**未引入新产品概念**；两处需要词条而尚无词条的表示名见[已知缺口](#十已知缺口)。
- **精确语义依赖**：**无**。本契约是本次租户相关领域五份契约中的第一份，不依赖其他规格版本；
  其余四份反过来依赖它（消费 clauses 由各自 catalog 条目登记）。

## 一、目的、消费者与责任

**本契约拥有两样东西：**

1. **身份值的含义与形状**——账号、组织、租户、登录状态这些身份在跨能力交换与持久保存时**是什么形状、什么时候算同一个**；
2. **隔离义务**——每一个持有租户范围对象的 owner 都要遵守的**同形条款**，
   它是 [SYS-TENANT](../../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) 与
   [PF-001 §6.4](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)/[§6.5](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位)
   在数据层的精确表述。

**隔离不是某一个能力能兑现的东西。**它不需要跨 owner 的共同提交，需要的是**每个 owner 各自不漏**——
所以它写成一份共用的数据契约，而不是一道守门插件：把判定从数据访问点挪到门口，
就会留下「守门通过、数据层未校验」的那条路。

| 消费者 | 从这里取什么 |
|---|---|
| `capability.account-identity` v1 | AccountId、LoginStateId 的形状与相等规则；S-20 的账号记录形状约束 |
| `capability.organization-governance` v1 | OrganizationId、OrganizationKind、TenantId、TenantRole、MembershipStanding、ScopeLayerIdentity |
| `data.offer-expiry` v1 的消费者 | 邀约指向的主体用本契约的身份值表达 |
| **资产领域（具名第一消费者）**：[PF-002](../../../../../product/PF-002-assets-settings-and-permissions/design.md) rev 8、[PF-003](../../../../../product/PF-003-asset-transfer-and-sharing/design.md) rev 3 的契约 | 资产持有的键、属性配值的宿主、作者与所有者的记法、复制与分享的边界判据 |
| [PF-015](../../../../../product/PF-015-session-lifecycle-and-ownership/design.md) rev 8 的契约 | 会话创建时捕获并持有的 TenantId |
| [PF-007](../../../../../product/PF-007-meta-capabilities/design.md) 的契约 | 「全局」一档授权表达落成租户层配值时的键 |
| 一切产生租户归属数据的流程 | S-24 的捕获规则 |

**本契约没有操作。**它不定义状态转移、授权判定与提交点，因此不出现「前置/提交点/幂等/事件」表；
凡写路径一律归相应能力契约。值本身也不持有生命周期，它的「缺席与恢复」语义见[第八节](#八缺席与恢复)。

## 二、含义与使用范围

**适用范围**：一个部署（deployment）之内。本版的完整交付是单机系统
（[SYS-DEPLOY](../../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)），
但下面每一条的**领域语义在跨进程之后必须原样成立**；哪些结论在单机由装配给出、
分布式后必须由协议重新兑现，逐条列在[第七节](#七装配给-vs-协议给)。

**明确不表示的内容**见[第十一节](#十一明确不承诺)。与相近概念的分别：

| 这个值 | **不是** |
|---|---|
| AccountId | 不是登录标识（S-2）；不是自然人。两个账号背后是不是同一个人，系统**不核验、不关联、也不记录** |
| TenantId | 不是组织，也不是账号，是两者的组合；不是「成员关系此刻有没有效」（那是 MembershipStanding，S-12） |
| ScopeLayerIdentity | 不是[作用域层](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)本身，是**身份带来的那两层各自的身份值** |
| 「当前租户身份」 | 不是范围化对象，不参与任何一层的求值，也不被任何一层配值（S-24 注） |

## 三、值、身份与结构关系

### 3.1 不透明标识

| 元素 | English | 精确含义与取值约束 | 身份、相等或引用规则 |
|---|---|---|---|
| **AccountId** | Account Id | [账号](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-account--账号--account)的标识 | S-1 |
| **OrganizationId** | Organization Id | [组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-organization--组织--organization)的标识 | S-3 |
| **LoginStateId** | Login State Id | [登录状态](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state)的标识 | S-11 |

- **S-1**（AccountId）：非空字符串，**不透明**——消费者不得解析其内部结构、不得从中推断任何账号事实。
  **部署内唯一**，**由存储生成**，**不来自运行时**：任何运行实例身份（例如 Cordis 的 `Fiber.uid`）
  不得充当 AccountId，因为它只在本次 registry 内有意义，跨重启不再指同一个。
  相等是**按字节精确相等**，不做大小写折叠、Unicode 归一化或空白裁剪。
- **S-2**（AccountId ≠ 登录标识）：**登录标识是账号的一项属性，不是它的标识**。
  登录标识[在整个部署内唯一、注册时确定](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)，
  是**用户提供的对外名字**；AccountId 是系统生成的不透明值。两者**不得互相替代，也不得互相推导**。
  引用一个账号的所有持久记录一律用 AccountId。登录标识的词法与可变性归
  `capability.account-identity` v1；本契约不定义它的形状。
- **S-3**（OrganizationId）：约束同 S-1（非空、不透明、部署内唯一、存储生成、字节相等）。
- **S-11**（LoginStateId）：约束同 S-1。**每次登录产生新的一个**；
  [失效不可逆](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态)，
  **不得复用**——一个曾经失效的 LoginStateId 永远不再指向一个有效的登录状态。

> **「不透明」不等于「随便什么形状」。**本契约给出的是**最小身份语义**（非空、字节相等、部署内唯一、
> 不来自运行时）。**字符集、长度上界与生成算法本版未定**，留 realization，见[缺口 G-ID-LEXICAL](#十已知缺口)。
> 这不是疏漏，是拒绝填一个看起来合理的默认值——它一旦被填，S-9 的序列化与跨节点分配都会被它锁死。

### 3.2 组织的种类

- **S-4**（OrganizationKind）：单值枚举，**恰两个取值**：
  `personal`（[个人组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-personal-organization--个人组织--personal-organization)）、
  `team`（[团队组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-team-organization--团队组织--team-organization)）。
  **创建时确定，此后不可改**：不存在把个人组织改成团队组织的值转换。
- **S-5**（personal 的结构谓词）：`kind = personal` 蕴含三条**值域上的结构约束**——
  **不可邀请**、**[上级组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-parent-organization--上级组织--parent-organization)恒空**、
  **不可作他人的上级**。三条**不是权限设置**，是结构性禁止，任何角色都不能放开。
  本契约只承诺这三条是**可从 kind 判定的谓词**；**执行这些判定的写路径前置**归
  `capability.organization-governance` v1。

### 3.3 租户身份

- **S-6**（TenantId 的构成）：`TenantId ≝ (OrganizationId, AccountId)`。
  它是**值类型，不另铸标识**：不存在第三个由存储生成的「租户主键」。
  **相等是结构相等**——两个 TenantId 相等，当且仅当两个分量分别按 S-1/S-3 相等。
- **S-7**（不含角色）：TenantId **不含[租户角色](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role)**，
  也不含任何可变属性。角色变更**不产生新的 TenantId**，因此不回溯任何已记录的归属与署名。
- **S-8**（跨断续同一、无销毁路径）：TenantId 的身份由那一组合确定，
  **不因成员关系断续而变**——退出后再被邀请加入同一组织，得到的是**同一个** TenantId。
  本版**没有销毁 TenantId 的路径**，因此**任何历史记录对它的引用永久可解析**。
  「此刻有没有效」是另一件事，由 S-12 表达。
- **S-9**（规范序列化形式唯一）：TenantId 的**规范序列化形式只有一种**：
  一个**恰含两个成员** `organization`、`account` 的记录，**不得有附加成员**，
  两个成员**均必填、均不可为空**。**不存在第二种规范形式**——特别是，
  本契约**不定义**任何把 TenantId 压成单个标量的编码（见[缺口 G-TENANT-KEY](#十已知缺口)）。
  **顺序不参与相等判定**，因为记录按成员名匹配，不按位置。

### 3.4 角色与成员资格判定结果

- **S-10**（TenantRole）：单值枚举，**恰两个取值**：`superAdministrator`
  （[超级管理员](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-super-administrator--超级管理员--super-administrator)）、
  `member`（普通成员）。一个租户在其组织内**只持一个**。
  它是**可变属性**，变更只影响此后的准入判定。本契约只定义取值域与「单值」这一形状；
  **谁能改、改的前置条件**归 `capability.organization-governance` v1。
- **S-12**（MembershipStanding 三值）：成员资格判定的结果**恰有三个取值，不得压成布尔**：

  | 取值 | 含义 | 消费者必须怎么做 |
  |---|---|---|
  | `valid` **携带一个 TenantRole** | 这个 TenantId 此刻是有效成员，角色是携带的那个 | 按角色继续判定 |
  | `invalid` | 这个 TenantId 此刻不是有效成员（从未加入，或成员关系已解除） | 拒绝，且**不回退到任何其他范围** |
  | `unavailable` | **判定做不出来**（依据不可读、提供者不可用） | **明确失败**，把失败报出去 |

  **`unavailable` 不是 `invalid`**，也不是 `valid`：它是**失败**，不是一个答案。
  把它折成 `invalid` 会把一次「读不到」讲成一次「你不是成员」，
  把它折成 `valid` 会在依据不可读时放行。**两种折叠都禁止。**
  `valid` **必须**携带角色，`invalid` 与 `unavailable` **必须不**携带角色——
  一个不带角色的 `valid` 无法用于任何准入判定，是无意义值。

### 3.5 身份带来的层

- **S-13**（ScopeLayerIdentity）：[作用域层](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)中
  **由身份带来的那两层**，各有一个身份值：

  | 层 | 身份值 |
  |---|---|
  | 组织级（Organization） | 一个 OrganizationId |
  | 租户级（Tenant） | 一个 TenantId |

  **出厂默认层归系统，没有身份值**，因此不在这张表里——它不是「身份带来的」。
  **会话级的层身份本版无表示**，见[缺口 G-SESSION-LAYER](#十已知缺口)：
  本契约**不给它一个占位值**，Schema 对会话级的层身份**一律拒绝**。
  **[工作区](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)不是一格**——
  它不是一重身份，[只在设置那条层序上占一格](../../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)；
  它的宿主是租户，见消费者场景 C-6。
  **[上级组织](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-parent-organization--上级组织--parent-organization)不进这两层**：
  子组织不自动继承上级的任何东西，否则层数会随隶属链变化。

## 四、隔离义务

**这一节是本契约的核心。**每一条都写成**另一个 owner 能照着自检**的形式：
「谁在何处保护」说清实施位置，「违反时可观察到什么」给出一个**会失败的观察**——
没有这个观察，条款就只是一句愿望。

**适用对象**：一切**受租户或组织所有权约束的对象**，以及**一切跨范围操作**。

| 条款 | 规范内容 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|
| **S-14** 显式携带 | 受所有权约束的对象与跨范围操作**显式携带**其归属层的 ScopeLayerIdentity 值：租户级对象携带 TenantId，组织级对象携带 OrganizationId。跨范围操作**另外**携带发起方的 TenantId | 每个 owner 的**数据访问点**（读写该对象的那一层），在对象的持久形状与操作签名上 | 取一条持久记录，其中**找不到**归属身份字段；或取一个跨范围操作的签名，其中**没有**发起方身份参数 |
| **S-15** 无默认值、缺席即拒绝 | 承载身份的参数与字段**一律没有默认值**，**不从环境、线程本地、进程配置或「上次用的那个」回填**。缺席 ⇒ **拒绝**，不放行、不返回空集、不回退 | 同上，在**参数解析与入口校验**处 | 构造一次**不带身份**的调用：它**成功了**，或返回了空集合而不是失败 |
| **S-16** 六路径同判 | **读、写、覆盖、删除、订阅、清理**六条路径适用**同一条判定**。不得只在读路径校验 | 每个 owner，**逐路径**；后台任务、批处理与清理作业与前台同判 | 对同一个对象：读被拒绝，但**删除、订阅或后台清理**没有被拒绝 |
| **S-17** 判定依据的构成封闭 | 判定依据**只由三样构成**：身份（S-13 的值）、持有记录、成员资格判定结果（S-12）。**此外一律不算依据** | 每个 owner 的判定函数；由静态检查核对其输入集合 | 判定函数的输入里出现第四样东西（路径、请求头、调用方进程、部署配置……） |
| **S-18** 物理位置不构成资格 | **物理路径、当前工作目录、同一操作系统用户、同盘存放本身都不构成**跨账号或跨租户的访问资格。一条路径是[工作区的**地址**](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)——**用来指认是哪一份，不是钥匙** | 每个 owner 的判定函数（S-17 的推论）；执行环境（[PF-005](../../../../../product/PF-005-execution-environments-and-sandboxes/README.md)）同守 | 同一台宿主机上，**另一个租户身份**进到同一个目录，**读到了**那份工作区的资产或配值 |
| **S-19** 不得冒充隔离 | **不得以服务可见性隔离、事件过滤、缓存键前缀冒充租户隔离。**任何声称隔离的接口**必须能指出实施位置** | 架构与提供者设计；接口文档须逐个指出实施点 | 指着一个声称隔离的接口问「判定在哪一行」，**答不出来**；或：一个服务实例内部握着跨租户的数据句柄，隔离标签换多少次都还读得到 |
| **S-20** 账号记录无跨账号关联字段 | 账号记录**不含任何跨账号关联字段**。现实持有人相同**不构成**任何跨账号依据 | `capability.account-identity` v1 的数据形状；**静态检查**逐字段核对 | 账号记录里出现一个指向**另一个账号**的字段，或一个「同一人」标记 |
| **S-21** 个人 context 不进层 | [个人 context](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-personal-context--个人-context--personal-context) **不是范围化对象**：不参与任何一层的求值，也不被任何一层配值。账号的身份事实（登录标识、凭据、激活状态）同样不是 | 账号 owner 的数据形状；资产 owner 的求值输入集合 | 求值输入里出现界面语言、时区一类偏好；或某一层能对它们配值 |
| **S-22** 不可用 ⇒ 失败，不回退 | 目标范围不可用或成员失权时**明确失败**，**不静默回退到个人范围**，不降级为「只读」，不返回空集合冒充「没有东西」 | 每个 owner 的判定调用点，按 S-12 消费三值 | 把成员资格提供者置为不可读：调用**成功返回了个人范围的东西**，或返回空集合而不是失败 |
| **S-23** 每道准入现读 | **每一道准入现读**成员资格与持有记录。允许缓存，但**任何缓存必须写明失效条件**；旧菜单、预览与历史成功**不构成授权** | 每个 owner 的准入点；缓存实现须在契约或提供者设计里写明失效条件 | 解除成员关系后，**下一道准入仍然放行**；或找到一个缓存，**说不出它什么时候失效** |
| **S-24** 创建那一刻捕获 | **当前租户身份是创建那一刻捕获的值。**查询面按 LoginStateId 给出当前值；**产生租户归属数据的流程，在开始时取一次并捕获它**，此后一切以捕获的那个值计——成本算在它头上、归属记在它名下、求值按它算。切换**只影响此后新建的东西** | 产生归属数据的每个流程，在**入口**捕获；被创建对象的持久形状里**存的是捕获值**，不是一个指向「当前选择」的引用 | 切换当前组织之后，**一个已经建起来的对象的归属或计费跟着变了**；或在对象里找到的是一个指向当前选择的引用而不是一个值 |
| **S-25** 层事实不横向复制 | 一层的事实**不因切换组织被复制到另一层**，**两个方向都算**；账号的身份事实不进任何层 | 每个 owner 的写路径：层事实的键**只以显式的 OrganizationId / TenantId 构成** | 切换一次当前组织，**另一层出现了原本不在那里的配值或持有** |
| **S-26** 跨边界身份需重新验证 | 跨进程、跨队列、跨节点传递时，身份值**只说明所声称的身份，不证明权限**。**接收边界必须重新验证**；进程内归因信息不自动成为远程凭证 | 每个接收边界（消息消费者、远程入口）；分布式化时由协议兑现，见[第七节](#七装配给-vs-协议给) | 构造一条**只带 TenantId、不带任何授权依据**的消息：接收方**直接按该租户执行** |

> **S-19 与 S-17 一起读。**Cordis 的 `isolate` 隔离的是**服务实例的可见性**，不是数据本身：
> 一个服务实例内部握着跨租户的数据句柄，隔离多少次都无效。
> **租户判定归数据访问点的身份校验**，这是 S-17 把依据构成写成封闭清单的原因。

## 五、消费者核对场景

每条写成「**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z**」。
**这些场景是本契约的验收面**：任一条走不通，缺口在本契约，不在消费者那边。

**C-1 资产持有的键与属性配值。**
消费者：资产领域契约（[PF-002 §5.2](../../../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)、
[「组织的设置」是视图](../../../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)）。
情形：某一级要为一份资产配一项[属性配值](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)。
依赖 **S-13**（归属层的身份值）、**S-9**（TenantId 唯一的规范形式）、**S-14**（显式携带）。
得到：[资产持有](../../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)的键是
**（归属层的 ScopeLayerIdentity 值，资产）**，配值挂在这份持有上而**不是独立对象**；
因为 TenantId 只有一种规范形式，同一份持有**不会因为写法不同被记成两份**。

**C-2 作者与所有者分记。**
消费者：资产领域契约（[PF-001 §6.7](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)）。
情形：一份资产在组织范围被创作，之后作者升职、降职或换岗。
依赖 **S-6/S-7/S-8**。
得到：**作者记 TenantId**（那个组织里的谁），**所有者记 OrganizationId 或 TenantId**（组织范围创作归组织、租户范围创作归该租户）；
角色变动不改 TenantId，**署名照旧**；没有销毁路径，**署名也不会变成指向一个没人对应的旧身份的孤儿**。

**C-3 资产复制的前提。**
消费者：[PF-003 §6.3](../../../../../product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份) 的契约。
情形：判断一次[资产复制](../../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)是否允许。
依赖 **S-6**（TenantId 的两个分量可分别取出）、**S-12**（两侧成员资格三值）。
得到：前提可以精确写成「源 TenantId 与目标 TenantId 的 `account` 分量**结构相等**，
且两侧 MembershipStanding 均为 `valid`」——即**同一账号的两个 TenantId**。
两个个人组织必属两个不同账号，因此这条前提**天然挡住**它们之间的复制。
若任一侧为 `unavailable`，按 **S-22 明确失败**，不当作「不允许」也不当作「允许」。

**C-4 分享边界「有共同上级」。**
消费者：[PF-003 §5.2](../../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织) 的契约。
情形：判断一次[资产分享](../../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)是否出了那棵隶属树。
依赖 **S-3**（OrganizationId 相等规则）、**S-5**（personal 的上级恒空）。
得到：判据只在 OrganizationId 上求值；
**任何两个个人组织永不满足「有共同上级」**——这是 S-5 的直接结果，不是一条额外规定。
**求出上级链与共同上级谓词的操作**归 `capability.organization-governance` v1，本契约只保证判据的输入形状。

**C-5 成员关系无效时，租户级持有不可达但不销毁。**
消费者：资产领域契约（[PF-001 §4 退出之后再加入](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)、
[flows §3.3](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)）。
情形：某账号退出组织后又被邀请回来。
依赖 **S-8**（身份跨断续同一、无销毁路径）、**S-12**（`invalid` 只说此刻无效）、**S-16**（删除与清理同判）。
得到：解除期间该 TenantId 的租户级持有与配值**不可达**（没有任何身份到得了），
但**不销毁**——`invalid` **不是删除信号**，成员关系解除**不得触发任何删除或清理**。
重新加入后**原样可用**，且**不需要一次恢复动作**：没有东西被删过。

**C-6 工作区：宿主是租户，路径只是地址。**
消费者：资产领域契约（[PF-002 §4 工作区](../../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区)、
[PF-001 §6.5](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#65-本地资源定位)）。
情形：同一台宿主机、同一个操作系统用户，两个租户身份先后挂上同一个目录。
依赖 **S-18**（物理位置不构成资格）、**S-17**（依据构成封闭）、**S-14**（持有记录显式携带 TenantId）。
得到：那是**两份工作区**，各持各的资产、各配各的值、**互相看不见**；
路径用来**指认是哪一份**，资格来自「那条持有记录归哪个 TenantId」以及「来者此刻是不是该租户的有效成员」。
**工作区不因此成为第五重身份**，也不进 S-13 的两层。

**C-7 会话持有创建时的 TenantId。**
消费者：[PF-015 §6.12](../../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) 的契约。
情形：账号在会话创建之后切换到另一个租户身份。
依赖 **S-24**（创建那一刻捕获）、**S-8**（TenantId 无销毁路径）。
得到：会话**存的是捕获下来的那个 TenantId 值**，不是一个指向「当前选择」的引用；
切换**不动它**，成本、归属与求值一概照它算。
那个租户身份**失效**时的收场（会话不消失、只能归档）归 PF-015 自己的契约——
本契约只保证**那个值仍然可解析**（S-8），失效**不使它变成无法解释的引用**。

**C-8 计量按 TenantId。**
消费者：使用成本与账单明细的契约（[PF-001 §6.4](../../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)）。
情形：一次模型调用发生在某个会话中。
依赖 **S-24**（每次调用携带发起它的那个捕获值）、**S-9**（一种规范形式，明细可按它聚合而不分裂）。
得到：这次调用的成本**能算到那一个 TenantId 头上**，且**不随派发层级或后续切换漂移**。
**计量口径本身（什么算一次、按什么单位、怎样归集）不在本契约，也暂无 topic** ——
见[缺口 G-METERING](#十已知缺口)。本契约只承诺**TenantId 可被每次调用携带且可被精确聚合**。

**C-9 「全局」一档授权表达落成租户层的权限配值。**
消费者：[PF-007 §4 一笔授权表达有三个维度](../../../../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度) 的契约。
情形：用户用嘴说「以后所有会话都这样」。
依赖 **S-13**（租户级的身份值是 TenantId）、**S-14**（写路径显式携带）、**S-23**（写这个值要现读他此刻的资格）。
得到：这一档**不落在本会话那份流水里**，而是落成**租户层的一条权限属性配值**，键是那个 TenantId；
**说得出这句话不等于他有权改整个租户**——资格按 S-12/S-23 现读，不足则失败（S-22）。

## 六、性质与规范场景

| 性质 | 谁在何处保护 | 需要什么证据 | 尚未兑现的前提 |
|---|---|---|---|
| TenantId 结构相等且规范形式唯一（S-6/S-9） | 本契约的 Schema + 消费者的键构造 | JSON Schema 校验 + [正反实例](examples.md) | — |
| TenantId 跨断续同一、永久可引用（S-8） | 数据形状：无销毁写路径 | 静态检查：全链**不存在**删除 TenantId 的写路径 | 成员资格写路径归治理契约，其 `解除` 操作**不得**发出删除 |
| MembershipStanding 三值不被压成两值（S-12） | 每个消费者的判定调用点 | 规范场景 + 静态检查：判定结果类型**不得**是布尔或可空值 | 各 owner 据 `unavailable` 失败，不自行回退（S-22） |
| 账号记录无跨账号关联字段（S-20） | 账号 owner 的数据形状 | **静态检查**逐字段核对 | 其他 owner 不引入跨账号依据 |
| 判定依据构成封闭（S-17）、物理位置不构成资格（S-18） | 每个 owner 的判定函数 | **静态检查**：判定函数的输入集合 ⊆ {身份, 持有记录, 成员资格} | 执行环境（PF-005）同守；本契约管的是**谁有资格**，不是**用什么机制拦住越权读写** |
| 六路径同判（S-16） | 每个 owner，逐路径 | 规范场景：对同一对象逐路径各走一次拒绝分支 | 后台清理作业也走同一判定 |
| 创建那一刻捕获（S-24） | 产生归属数据的每个流程入口 | 规范场景：创建 → 切换 → 复核归属与计费不变 | 「当前租户身份」的查询面归治理契约 |

**规范表达与验证义务**：

- **JSON Schema**（[`identity-values.schema.json`](identity-values.schema.json)）：表达形状、枚举与结构相等所需的规范形式。
  **它不能单独说明**跨请求的权限、生命周期与最终进展——那些在能力契约里。
- **静态检查清单**（本契约触发，**尚未执行**）：
  1. 账号记录字段集合中无跨账号关联字段（S-20）；
  2. 每个判定函数的输入集合 ⊆ {身份, 持有记录, 成员资格}（S-17、S-18）；
  3. 承载身份的参数**无默认值**（S-15）；
  4. 成员资格判定结果的类型**恰有三个取值**（S-12）；
  5. 全链无销毁 TenantId 的写路径（S-8）；
  6. 声称隔离的接口**逐个**登记了实施位置（S-19）。
- **不建行为模型**：本契约无状态转移与并发，TLA+ 与 Alloy 的义务落在
  `capability.organization-governance` v1（`Membership.tla`、`Affiliation.als`）与
  `composition.account-registration` v1（`Registration.tla`），**不在这里复制一份状态机**。
- 实际执行结果、工具版本与覆盖范围归版本外的 `verification.md` 与 record 的 evidence；
  **本页不填通过状态**。

## 七、装配给 vs 协议给

[SYS-DEPLOY](../../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：
第一版是单机系统，但**领域语义不得改变**。下表是步骤 F 第四问的结论，
**它是契约的一部分，不是流程笔记**：左列在单机由**同一个存储**顺手给出，
分布式之后必须由**协议**重新兑现，否则同一句话不再成立。

| 判定 | 单机由**装配**给 | 分布式必须由**协议**兑现 |
|---|---|---|
| AccountId / OrganizationId / LoginStateId **部署内唯一**（S-1/S-3/S-11） | 单一存储的唯一约束与单一生成源 | **跨节点的标识分配**：多个生成源之间不得碰撞；碰撞的收场须写进契约 |
| **登录标识部署内唯一**（S-2 的前提，由账号契约兑现） | 同上 | 跨节点分配 |
| TenantId **结构相等**（S-6） | 值语义，**不依赖存储** | **不变**——这是把 TenantId 做成值类型而不另铸标识的收益 |
| TenantId **无销毁路径 / 永久可引用**（S-8） | 不存在删除路径 | **不变**（仍是「没有这条路」，不是「有条路但加了锁」） |
| **成员资格判定的可见性**（S-12/S-23 的「现读」） | 单一存储的读即最新 | **读的新鲜度须定义**：现读到底现到什么程度，成为契约条款；陈旧读的收场须明确（按 S-22 失败，不得放行） |
| **身份跨边界只声称、不证明**（S-26） | 进程内调用，归因信息即可信 | **必须**显式传递身份**与授权依据**，并在接收边界验证；进程内归因不自动成为远程凭证 |
| **六路径同判**（S-16） | 同一存储的同一判定函数 | 每个节点各自实施；**不得**只在网关校验一次就认为全链成立（那正是 S-19 禁止的冒充） |

## 八、缺席与恢复

数据契约不拥有操作，但它必须回答「提供者不在时，这些值还剩什么」：

- **值不依赖运行时。**AccountId、OrganizationId、TenantId、LoginStateId 一概**不来自运行时**（S-1），
  因此**重启之后仍指同一个**。任何以运行实例身份充当持久身份的实现都违反 S-1。
- **提供者缺席不改变值的含义，但会改变判定的可得性。**
  成员资格判定不可得时，结果是 `unavailable`（S-12），消费者**明确失败**（S-22）；
  **不得**在提供者缺席期间用缓存冒充现读，除非该缓存写明了失效条件（S-23）。
- **不可达 ≠ 已销毁。**成员关系无效时租户级持有不可达（C-5），这**不是**缺席恢复问题，
  没有东西需要被恢复；把它当成恢复问题就会写出一个删除路径来配对。
- **在途工作的归属不因提供者换代而改变**：已捕获的 TenantId 是值（S-24），不随任何重载重算。

## 九、版本差异

**首版，无前身。**

2026-09-17 建在 PF-001 rev 1 上的那批候选（账号身份、租户治理、账号注册组合）
已于 2026-09-22 由产品负责人裁定**整体废弃**，它们从未被接受或冻结。
**它们不构成本契约的前身，本契约不继承其任何条款，也不建立 lineage 关系。**

## 十、已知缺口

**以下各条一律不填默认值。**填一个看起来合理的值，下游会把它当成已定事实实施出来。

| gap | 是什么 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-SESSION-LAYER** | **会话级的层身份无表示**。S-13 只给出组织级与租户级两层 | 需要按会话级层身份做键的消费者 | [PF-015](../../../../../product/PF-015-session-lifecycle-and-ownership/README.md) |
| **G-METERING** | **成本计量口径未定**：什么算一次、按什么单位、怎样归集（C-8） | 使用成本与账单明细的契约 | 产品负责人（**当前无 topic**） |
| **G-PERSONAL-CONTEXT** | **个人 context 具体有哪些项**、各自语义、组织能否施加影响（S-21 只定它不进层） | 个人 context 的契约 | 产品负责人（**当前无 topic**） |
| **G-ID-LEXICAL** | **不透明标识的具体形式**：字符集、长度上界、生成算法（S-1/S-3/S-11 只给最小身份语义） | realization 的存储绑定；不阻断本契约 | realization |
| **G-TENANT-KEY** | **TenantId 的标量键编码**。S-9 只定了一种规范形式（记录）。需要标量键的消费者（索引、缓存键、计量聚合键）要一个**双射**编码，而它取决于 G-ID-LEXICAL——**先定词法，再定编码** | 需要标量键的消费者 | realization（在 G-ID-LEXICAL 裁定之后） |
| **G-UL-STANDING** | **`MembershipStanding` 尚无统一语言词条**。统一语言里与它最近的是 [UL-tenant 的「并入」注](../../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)（成员关系是租户「此刻有没有效」那一面），但那是**对象的一面**，不是**判定结果的三值域**。**按「先词条、后正文」的规矩，本契约接受之前须补词条**；本页先用它，并在此登记 | 本契约的接受 | 统一语言区（`ubiquitous-language` skill） |
| **G-UL-LAYER-IDENTITY** | **`ScopeLayerIdentity` 同上**。它是 [UL-scope-layer](../../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer) 在规格里的**表示名**（层 + 该层的身份值），不引入新产品概念；仍须在接受前确定它是词条还是纯表示名 | 本契约的接受 | 统一语言区 |

## 十一、明确不承诺

- **不定义成员资格怎么判。**本契约只定义判定**结果**的三值域（S-12）。
  谁是有效成员、怎么加入、怎么解除、并发怎么收场，归 `capability.organization-governance` v1。
- **不定义账号怎么鉴权。**凭据形式、校验方式、登录状态怎么签发与撤销，归 `capability.account-identity` v1。
  本契约只定义 AccountId 与 LoginStateId 的形状。
- **不定义资产持有本身。**持有关系的建立、移除、禁用与配值的读写，归资产领域契约。
  本契约只定义**持有的键用什么身份值构成**（C-1）。
- **不定义邀约的过期语义。**归 `data.offer-expiry` v1。
- **不定义登录标识的词法与可变性**（S-2）。
- **不定义操作、状态转移、提交点与事件。**本契约没有操作（第一节）。
- **不定义用什么机制在操作系统层拦住越权的文件读写。**
  本契约管**谁有资格**（S-18），拦截机制归
  [PF-005 执行环境](../../../../../product/PF-005-execution-environments-and-sandboxes/README.md)。
- **不承诺任何已执行的验证。**第六节列的静态检查与规范场景**尚未执行**；
  Schema 存在不表示形状已被校验过。

---

规范实例见 [examples.md](examples.md)；起草过程中的非显然选择与对简报的异议见 [notes.md](notes.md)。

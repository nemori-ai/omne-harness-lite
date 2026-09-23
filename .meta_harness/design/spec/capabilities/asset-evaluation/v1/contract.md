# capability.asset-evaluation v1

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-evaluation, 1)`
- **状态**：`candidate`（2026-09-23 起草），**未经独立评审，未接受**
- **设计依据**（PF-002 rev 16）：
  [§4 工作区](../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区)及其四小节
  （[工作区不是目录](../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区不是目录)、
  [它挂在租户下](../../../../product/PF-002-assets-settings-and-permissions/design.md#它挂在租户下)、
  [它是会话选用的，不指定就是空](../../../../product/PF-002-assets-settings-and-permissions/design.md#它是会话选用的不指定就是空)、
  [挂上之后，它的内容在装配时自动进来](../../../../product/PF-002-assets-settings-and-permissions/design.md#挂上之后它的内容在装配时自动进来)）、
  [§5.2 三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值)、
  [§5.2「组织的设置」是视图](../../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)、
  [§5.2 设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)、
  [§5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)、
  [§5.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)、
  [§5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)、
  [§5.6](../../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)、
  [§5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)、
  [§5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)
  （含[工作区不是会话级](../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区不是会话级两者在设置那条层序上是一前一后的两级)、
  [它不因此多一重身份](../../../../product/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份)）、
  [§6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)、
  [§6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)
  （含[对 agent 两者一样](../../../../product/PF-002-assets-settings-and-permissions/design.md#但对-agent-来说两者一样都不可见)、
  [禁用是逐层配的布尔设置](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)）；
  [flows §二 分支与异常](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)、
  [flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)～[§3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)
- **相邻依据**：
  PF-001 rev 16 [§4 设置、权限、资产](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)、
  [§4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)、
  [§6.1](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)、
  [§6.2](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)、
  [§6.3](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#63-依赖与组合)；
  PF-003 rev 4 [§6.1](../../../../product/PF-003-asset-transfer-and-sharing/design.md#61-一条不变量团队资产不出那棵树)、
  [§6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)、
  [§6.12](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)；
  PF-004 rev 10 [§4 装配](../../../../product/PF-004-agent-definition-and-assembly/design.md#装配)、
  [§6.1](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)、
  [§6.2](../../../../product/PF-004-agent-definition-and-assembly/design.md#62-装配)、
  [flows §二](../../../../product/PF-004-agent-definition-and-assembly/flows.md#二分支与异常)；
  PF-007 rev 16 [§6.11](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人)、
  [meta 与常驻的关系](../../../../product/PF-007-meta-capabilities/design.md#meta-与常驻的关系)；
  PF-012 rev 10 [干预力三档](../../../../product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的)；
  PF-015 rev 11 [§6.13](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#613-工作区在创建时显式指定不指定就是空)；
  [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、
  [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)
- **起草裁定**：主线 2026-09-23 的三条自决（会话那一格的值归会话记录、写面本版只有会话创建参数；
  求值链触发 Alloy；承载目录是 `<dir>/.omne/workspace.json` 一份显式清单、滤掉的项留痕），
  以及同日的**追加裁定**（权限项按能力标识跨层取交集、替换件缺的项取最严；权限的声明默认值只是作者建议；
  输入带成员资格作「谁可以用」的求值输入，取值域是租户角色加 `self`；持有的 `versionSelection` 定第 3 步读哪一版）
  **尚无决定记录可链**，本契约按它们写，**不把它们当作产品依据**；它们与产品正文对不上的地方记在 [G-16](#十一已知缺口)、[G-17](#十一已知缺口)
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)）：
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`
  - `omne-harness-lite-design-2026-09-15 · data.asset-model · v1`——**同批并行起草、未定型，catalog 依赖未登记**，见[缺口 G-12](#十一已知缺口)
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用写全坐标，如
  `capability.asset-evaluation/v1#S-18`。编号在本版本内只追加、不重排

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**本契约是一项纯计算**：给定一个租户此刻在四格上的[资产持有](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)、
可选的会话格配值与一个根 Agent Definition，**算出这次装配实际用了哪些资产、每一项设置与权限取什么值、各来自哪一格、谁被滤掉以及为什么**；
另加一件：**把工作区承载清单读成工作区那一格的持有**。

| # | 拥有的计算 | 正文 |
|---|---|---|
| 1 | **[作用域求值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)的四步**：资产求值 → 组装 → 投影 → 层级计算，[次序不可换](../../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)；它就是[两轮求值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-two-pass-resolution--两轮求值--two-pass-resolution)——第 1 步作用在资产上，第 4 步作用在资产的属性项上 | [S-15](#s-15-evaluate)、[S-17](#s-17-第一步之一先按禁用滤)～[S-26](#s-26-每份持有都有去处) |
| 2 | **工作区承载清单的读入**：清单 → 工作区那一格的持有；只对清单自己列的资产生效；丢掉的项留痕 | [S-16](#s-16-readworkspacecarrier)、[S-27](#s-27-自带资产变成工作区那一格的持有)、[S-28](#s-28-配值与禁用只对自带资产生效丢掉的留痕) |

**它回答的问题只有一个：「此刻、对这个租户、照这份输入，求出来是什么」。**
它不读存储、不记住任何东西、不产生任何外部效果（[S-11](#s-11-纯计算)）。

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| 资产、持有、属性声明与属性配值的**形状**，工作区承载清单的**形状** | `data.asset-model` v1（本契约**只引它的 `$defs` 名**，[S-4](#s-4-依赖方向与被消费的面)） |
| 持有与配值**怎么被写**：加入、移除、禁用、配值、加锁，以及谁有资格做 | `capability.asset-governance`（同批起草） |
| 复制、分享、分享何时失效 | `capability.asset-transfer`（同批起草） |
| 注册表：会话或运行时按类别的那几张表、reload 一族怎么重填 | `capability.asset-registry`（块 B） |
| 把求值结果装进会话、[装配清单](../../../../product/PF-004-agent-definition-and-assembly/design.md#装配清单)的生与失效、装配失败怎么收场 | PF-004 的契约（**尚无**） |
| 各类资产正文里**声明了哪些引用、推得出哪些属性项** | 各类正文契约（[S-10](#s-10-各类正文契约须供的两条规则)；多数尚无，[G-3](#十一已知缺口)） |
| 承载目录里那份文件**怎么被找到、读出、解析成 JSON**；清单里 `source` 指向的资产包**怎么解析成资产定义** | 提供者（读文件）；各类正文契约（解析资产包，[G-6](#十一已知缺口)） |
| 会话格配值**存在哪、怎么写** | PF-015 的契约（写面本版只有会话创建参数，其余 [G-7](#十一已知缺口)） |
| 一个权限项的允许集合**落到哪一档**、空集意味着什么 | 消费它的放行判定（[PF-007 §6.11](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人)），[G-9](#十一已知缺口) |
| 设置页 | 设置页是[属性投影](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection)的呈现；本契约只供它要的那几个字段（[十二](#十二消费者核对)） |

### S-3 本契约明确不承诺什么

- **不读存储、不读时钟、不读文件。**输入里没有的事实，本契约一概不知道；它不替调用方现读任何东西。
- **不复核资格。**租户此刻是不是有效成员、一份被分享来的持有此刻是否仍然成立、调用方是不是那个租户——
  这些**都是前提**（[第七节](#七性质与前提)），由组输入的一方兑现，本契约**不检查**。
- **不铸任何持久身份、不写任何东西。**求值结果是数据，不是对象；它没有标识，也不被本契约保存。
- **不承诺结果的新鲜度。**结果只对那一份输入成立；输入变了由消费者决定何时重求（[S-30](#s-30-本能力没有在途工作)）。
- **不产生事件。**没有通知，也没有控制类扩展点。
- **不产出装配清单，也不决定求不出来的引用挡不挡装配**——那是装配的事，但装配那一侧已有产品原话（[S-31](#s-31-unresolved-交到装配手上怎么收场)）。
- **不定义界面。**「设置页上看得到来自哪一层、替换了哪一层」由本契约供字段（`from`、`replaced`、`lockedAt`），怎么呈现不归这里。

### S-4 依赖方向与被消费的面

**依赖方向是单向的**：本契约引用 `data.identity-values` v1 与 `data.asset-model` v1，**它们不得反向依赖本契约**。

#### 身份值侧（`data.identity-values` v1，11 条）

下表每个 `#S-n` 的完整坐标是 `omne-harness-lite-design-2026-09-15 · data.identity-values · v1 · S-n`。

| 被消费的条款 | 用在哪 |
|---|---|
| `#S-5` TenantId 的构成与相等 | [S-7](#s-7-输入的一致性条件) C3：组织那一格必须是 `tenant` 的组织那一半，工作区键的租户那一半必须等于 `tenant` |
| `#S-8` TenantRole | 「谁可以用」一类权限项的取值域由租户角色加 `self` 构成（[S-25](#s-25-工作区自带资产的权限项一律取最严值)） |
| `#S-10` MembershipStanding | 输入的 `standing`（[S-6](#s-6-求值输入-evaluationinput)）；C12 要求它是 `effective` |
| `#S-12` 缺席与空值都不是身份值 | [S-12](#s-12-缺席时的默认答案) 的身份参数行 |
| `#S-15` shareAncestor | [第七节](#七性质与前提)前提 P2 的判据：「所有者在租户那棵隶属树内」**就是**它，本契约不另写一份 |
| `#S-17` 身份参数没有默认值 | [S-12](#s-12-缺席时的默认答案)：`tenant` 不从环境补 |
| `#S-18` 缺席即拒绝 | [S-12](#s-12-缺席时的默认答案)、两个操作的⑧ |
| `#S-27` 每道准入现读 | [S-15](#s-15-evaluate) ⑦「结果可以缓存，但要写明失效条件」；前提 P2 的现读 |
| `#S-30` 跨边界须重新验证 | [S-29](#s-29-装配给的保证-vs-协议须给的保证) 右列 |
| `#S-32` 判别式集合闭合 | [S-7](#s-7-输入的一致性条件) C1；`Layer`、`FilterReason`、`DropReason` 三个枚举同样闭合 |
| `#S-33` 表示层校验与判定分开 | [S-13](#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) |

#### 资产形状侧（`data.asset-model` v1，按 `$defs` 名引用）

**那份契约与本契约同批并行起草，条款号未定，因此只按 `$defs` 名引用**（[G-12](#十一已知缺口)）：
`CapabilityId`、`AssetCategory`、`AssetRecordId`、`AssetOrigin`、`AssetDefinition`、`AssetVersion`、`AssetContent`、
`AttributeDeclaration`、`AttributeKind`、`SettingCategory`、`AttributeDomain`、`AttributeAssignment`、`PermissionValue`、
`HoldingScope`、`WorkspaceKey`、`AssetHolding`、`WorkspaceCarrierManifest`。
**本契约不复述它们的定义**；用到其中某条判定条款（例如「同一 holder × capability 至多一份持有」「`disabled` 是保留项名」）时，
在正文里点名它是那份契约的条款，登记待 G-12 闭合时补齐。

#### 各类正文契约（按规则引用，不按坐标）

[S-10](#s-10-各类正文契约须供的两条规则) 要求每一类资产的正文契约供两条规则。**那是本契约对它们的要求，不是本契约对它们的消费登记**——
它们多数尚未起草（[G-3](#十一已知缺口)），起草之后按坐标补登。

---

## 二、概念、输入与输出

**本节的值类型一律引用 `data.asset-model` v1 与 `data.identity-values` v1，不复制其定义。**
本契约自己命名的只有输入输出的外壳与三个枚举；**本版不发布 Schema**——
[能力契约的操作输入与返回用散文写清含义，值类型引用 data 契约的 Schema](../../../README.md#准入门槛与停止条件)；
一旦某份组合契约把这两个操作投影到进程外，线上形状归那份组合契约。

### S-5 层与三条层序

**`Layer` 是一个闭合枚举，恰五个值**：`factory` `organization` `tenant` `workspace` `session`。
它是[作用域层](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)的四格，
加上设置那条层序上多出的[工作区](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)那一格。
**其中能持有资产的是前四个**（`data.asset-model` 的 `HoldingScope` 四个变体），**会话不持有资产**，它只在设置与权限两条层序上有值。

**三条层序，各答一个问题，成员对不齐**（[PF-002 §5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)）：

| 层序 | 回答什么 | 由外到里 |
|---|---|---|
| **资产归属** | 同一能力标识下谁替换得了谁 | `factory` < `organization` < `tenant` < `workspace` |
| **设置** | 一项设置取什么值 | `factory` < `organization` < `tenant` < `workspace` < `session` |
| **权限** | 一项权限的允许集合多大 | `factory` · `organization` · `tenant` · `session`——**工作区不在其中** |

「由外到里」读作：越靠右越具体。**资产与设置**：越具体的覆盖越外面的——**除非外面锁了**（[S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断)、[S-22](#s-22-第四步设置)）；
**权限**：各格给出的允许集合取交集，没有方向，层序只用来定「值来自哪一格」（[S-23](#s-23-第四步权限)）。
**工作区不是一重身份**（[PF-002 §5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份)），
所以 `workspace` 这个值**只是层序上的一格**，不对应任何 `ScopeLayerIdentity` 变体。

### S-6 求值输入 EvaluationInput

| 成员 | 含义 | 必需 |
|---|---|---|
| `tenant` | 这次求值为哪个租户求，一个 `TenantId`（`data.identity-values` v1）。它同时定了组织那一格是哪个组织（租户的组织那一半） | **必需** |
| `standing` | 这个租户此刻的成员资格效力，一个 `MembershipStanding`（`data.identity-values` v1），**必须是 `effective`、带角色**（C12）。它是「谁可以用」一类权限项的求值输入（主线追加裁定；怎么用见 [G-15](#十一已知缺口)）。**成员名是本契约起的**，账本未给（[G-7](#十一已知缺口)） | **必需** |
| `workspace` | 会话创建时挂上的那份工作区，一个 `WorkspaceKey`（`data.asset-model`）。**缺席就是没挂，那一格为空**（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#它是会话选用的不指定就是空)） | 可选 |
| `holdings` | 出厂、组织、租户、工作区四格此刻的全部持有，每份一个 `AssetHolding`。工作区那一格的持有是 [S-16](#s-16-readworkspacecarrier) 的读入结果 | **必需**（可为空集，但出厂那一格见前提 P4） |
| `definitions` | 被持有的每份资产的定义，`AssetDefinition`；**可以多带**，多带的不进结果（[S-7](#s-7-输入的一致性条件) C5） | **必需** |
| `session` | 会话格的配值。**每一条是一对：它所配的能力标识，和一条 `AttributeAssignment`**——`AttributeAssignment` 自己不带能力标识，项名只在一份资产内唯一，单凭它指不到项（[G-7](#十一已知缺口)）。值归会话记录，**本版的写面只有会话创建参数** | 可选；缺席即会话格没有值 |
| `root` | 从哪个 Agent Definition 展开，一个 `CapabilityId`（[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)：类别 ＋ name，**不是某一份具体资产**），**类别必为 `agent_definition`** | **必需** |

**选用版本**：第 2、3 步要读资产**某一个已发布版本**的正文——那个版本是[版本选用](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection)的结果。
**主线已裁：持有上带一项 `versionSelection`，取 `current` 或 `pinned`**（`data.asset-model` 的下一版才有这个成员，[G-2](#十一已知缺口)）。本契约据此定：

- **决定取哪一版的，是第 1 步选中的那份持有**（`EffectiveAsset.from` 那一格的持有）——它是这个能力标识最具体的消费方，
  [选用哪个版本是消费方的决定](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)；
- **`current`**：那份资产定义里**编号最大的已发布版本**——「最新」是相对这份输入而言的，同输入同结果；
- **`pinned`**：钉住的那个编号，**它必须在定义的已发布版本里**；
- **工作区自带资产没有版本线**，它的正文来自承载目录里的资产包（[G-6](#十一已知缺口)）。

**确定不了就是不合法的输入**（[S-7](#s-7-输入的一致性条件) C9）：钉住的版本不存在、`current` 却一版都没发布——**不以别的版本代替**，
[发现有新版本不静默替换已选用的版本](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)。

### S-7 输入的一致性条件

**下列任一条不满足，输入就不是一份合法的求值输入，[evaluate](#s-15-evaluate) 以 `invalidInput` 失败，不产出任何结果。**
前两条是形状，其余是 Schema 管不到的跨成员条件。

| # | 条件 | 依据 |
|---|---|---|
| C1 | 各成员合 `data.asset-model` v1、`data.identity-values` v1 对应定义的形状；判别式与枚举取值在闭合集合内 | `data.identity-values/v1#S-32` |
| C2 | `root` 的类别是 `agent_definition` | [PF-002 §5.1](../../../../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种)：只有它组装出 agent |
| C3 | **每份持有都属于这次求值的四格之一**：出厂；组织 = `tenant` 的组织那一半；租户 = `tenant`；工作区 = `workspace`。给了 `workspace` 时，**它的租户那一半必须等于 `tenant`**；没给 `workspace` 却有工作区那一格的持有，不合法 | [PF-002 §4 它挂在租户下](../../../../product/PF-002-assets-settings-and-permissions/design.md#它挂在租户下)、[SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、[PF-015 §6.13](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#613-工作区在创建时显式指定不指定就是空)、`data.identity-values/v1#S-5` |
| C4 | 同一格、同一能力标识至多一份持有；一份持有上同一项至多一条配值 | `data.asset-model` 的同名判定条款 |
| C5 | 每份持有指向的资产在 `definitions` 里**恰有一份**，且那份定义的能力标识等于持有的能力标识 | — |
| C6 | **出厂那一格只持有官方件，且不带配值**——出厂那一格的值就是资产声明里的默认值（[S-22](#s-22-第四步设置)） | [PF-002 §5.2 推论二](../../../../product/PF-002-assets-settings-and-permissions/design.md#由此得到两个推论) |
| C7 | **指向官方件的持有，保留项 `disabled` 不得配成真** | [PF-001 §4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)：官方件不可禁用，任何角色都不行 |
| C8 | **本版：工作区那一格持有的资产，不被其他任何一格持有**——工作区那一格的持有都是[工作区自带资产](#s-9-工作区自带资产)的持有 | [G-4](#十一已知缺口)（工作区给别层资产配值本版没有承载） |
| C9 | **每份在效持有**（没有被 [S-17](#s-17-第一步之一先按禁用滤) 禁用滤掉、没有被 [S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) 以 `locked_below` 挡下；工作区那一格除外）按它自己的 `versionSelection` **确定得出一个已发布版本**（[S-6](#s-6-求值输入-evaluationinput)）。被选中的那份定第 2、3 步读哪一版；其余几份的版本只用来读它们对权限项的声明（[S-23](#s-23-第四步权限)） | 主线追加裁定；[G-2](#十一已知缺口) |
| C10 | **第 4 步用到的每条配值，值落在它所在那份持有所指资产对那一项声明的取值域内**——按那份持有选用的版本读声明，工作区自带资产按它的正文；会话格的配值按生效资产的声明核。设置满足声明的 schema；权限的允许集合是声明枚举的子集 | [PF-002 §5.2 三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值)：资产定取值域 |
| C11 | 会话格的每条配值带能力标识；同一能力标识、同一项至多一条 | [G-7](#十一已知缺口) |
| C12 | `standing` 是 `effective`、带角色（它是不是 `tenant` 此刻的那一份，是前提 P3，本契约核不到） | `data.identity-values/v1#S-10`；求值只对有效成员有定义 |

**C7 为什么是不合法输入而不是「当它没禁」。**禁用官方件的写入本该在写入面就被拒（`capability.asset-governance`）；
它出现在求值输入里，说明上游已经坏了。**当它没禁是静默吞掉一个缺陷**，照它禁掉则破坏官方件是底座这条结构性质——
两条路都不对，只有明确失败对。C10 同理：一条落在域外的值是写入面或版本切换漏判的产物，**不能被悄悄换成声明的默认值**。

**C8 是本版的收窄，不是产品规则。**产品要工作区能为别层提供的资产配设置（[PF-002 §5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)「设置它压过租户」），
本版的持有形状与清单形状接不上这件事（[G-4](#十一已知缺口)）。**C8 让这种输入明确失败，而不是按一个猜出来的语义求值。**

### S-8 求值结果 EffectiveAssembly

| 成员 | 元素 | 含义 | 出自 |
|---|---|---|---|
| `assets` | `EffectiveAsset` = `{ capability, asset, from, replaced, lockedAt? }` | 每个能力标识**一份**生效资产：它是哪份资产（`AssetRecordId`）、来自哪一格、**替换了哪几格的那一份**、锁在哪一格 | 第 1 步，[S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) |
| `composition` | `CapabilityId` | 从 `root` 沿组合图展开、**实际装上的**能力标识 | 第 2 步，[S-20](#s-20-第二步组装) |
| `values` | `EffectiveValue` = `{ capability, item, value, from, lockedAt? }` | `composition` 里每份生效资产的每个属性项——以及外层约束过、它却没声明的权限项（[S-23](#s-23-第四步权限)）——取什么值、来自哪一格、锁在哪一格。设置的 `value` 是一个 JSON 值；权限的 `value` 是一个 `PermissionValue`（允许集合） | 第 3、4 步，[S-21](#s-21-第三步投影)～[S-25](#s-25-工作区自带资产的权限项一律取最严值) |
| `filteredOut` | `FilteredOut` = `{ capability, from, reason }` | 某一格的某样东西**没有进入结果**，以及为什么 | 第 1、4 步 |
| `unresolved` | `Unresolved` = `{ capability, referencedBy? }` | **引用了、却没有生效资产的能力标识**，以及是谁引用了它 | 第 2 步，[S-20](#s-20-第二步组装) |

**`FilterReason` 是闭合枚举，恰五个值**：

| 值 | 什么被滤掉 | 条款 |
|---|---|---|
| `disabled` | 一份持有：它指向的资产在这次求值里被禁用 | [S-17](#s-17-第一步之一先按禁用滤) |
| `locked_below` | 一份持有：它在一把锁以内、指向另一份资产 | [S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) |
| `workspace_permission` | 工作区那一格对一个权限项的配值 | [S-24](#s-24-工作区那一格在第四步只贡献设置) |
| `workspace_placement` | 工作区那一格对一个落点与身份类设置项的配值 | [S-24](#s-24-工作区那一格在第四步只贡献设置) |
| `workspace_immutable` | 工作区那一格配值或持有上的 `immutable` 标记（值本身照常参与） | [S-24](#s-24-工作区那一格在第四步只贡献设置) |

**五个列表一律按集合读**：元素不重复，**顺序不承载含义**，两份结果相等就是五个集合各自相等。
`filteredOut` 以 `(capability, from, reason)` 为一个元素——同一格对同一能力标识因同一个理由滤掉了好几项配值，记一条。
`EffectiveValue` 与 `FilteredOut` **不带项的「种类」**：一项是设置还是权限、属于哪一类设置，看生效资产对它的声明（第 3 步）。

**`lockedAt` 缺席与出现是两件事**：缺席 = 这一处没有任何锁起作用；出现 = 锁在那一格，更里面的格改不了。

### S-9 工作区自带资产

**工作区自带资产**（无词条）指：**由工作区承载清单的 `assets` 列出、经 [S-16](#s-16-readworkspacecarrier) 读入、只被工作区那一格持有的资产**。
产品正文叫它「工作区提供的资产」（[PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)、[§6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)），
本契约用到它的三处都是产品规则：**它的权限项一律取最严值**（[S-25](#s-25-工作区自带资产的权限项一律取最严值)）；
**工作区配的「禁用」只对它生效**（[S-17](#s-17-第一步之一先按禁用滤)）；**它的落点类设置随资产一起来**，不由工作区配值改（[S-24](#s-24-工作区那一格在第四步只贡献设置)）。

**它在求值输入里怎么被认出来**：本版由 [S-7](#s-7-输入的一致性条件) C8 保证——**工作区那一格持有的，恰是工作区自带资产**。
它的记录号怎么铸、它的定义里所有者与来源两格填什么，归 `data.asset-model`（[G-6](#十一已知缺口)）。

### S-10 各类正文契约须供的两条规则

第 2、3 步读资产正文。**正文长什么样按类别各有其家**（`data.asset-model` 的 `AssetContent` 八个变体），
**本契约不解析正文，只要求每一类的正文契约供两条规则**：

| 规则 | 输入 | 输出 | 要求 |
|---|---|---|---|
| **规则一：正文里声明的引用** | 一个类别的一份正文 | 一个 `CapabilityId` 集合——这份正文组合了谁（plugin 的成员、agent definition 组合的各类、skill 声明要用的 tool、tool 声明配套的 skill、斜杠命令绑定的 skill……） | **确定、可重放**：同一份正文永远给出同一个集合；**只能是[谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)表里打勾的类别** |
| **规则二：正文推得出的属性项** | 同上 | 一个 `AttributeDeclaration` 集合，项名在这份资产内唯一 | **确定、可重放**；每项设置必标类别（[PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)） |

**这两条规则缺席时的默认答案是「这一类求不了」，不是「没有引用」「没有属性项」**（[S-12](#s-12-缺席时的默认答案)）。
本版 `skill` `mcp` `slash_command` `connector` `agent_definition` 五类在 `data.asset-model` 里是不透明壳，
`tool` 与 `loop_extension` 的正文契约并行起草中——**两条规则多数尚无**，这是 [G-3](#十一已知缺口)，**它挡住第 2、3 步的实施**。

---

## 三、贯穿全部操作的规矩

### S-11 纯计算

**两个操作都是输入的函数：同一份输入，永远得到同一份结果**（五个列表按集合比）。
由此三条：

1. **不读存储、不读时钟、不读文件、不读任何进程状态**——求值要的每一个事实都在输入里；
2. **不产生任何外部效果**——不写、不发、不缓存到共享的地方；
3. **不因为调用次数、调用顺序或并发而给出不同结果**。

**这一条不是实现建议，是契约承诺**：[PF-004 的装配清单要能回答「当时那个 agent 是什么样」](../../../../product/PF-004-agent-definition-and-assembly/design.md#装配清单)，
而那份回答要能被重放——**只有输入的函数才重放得出同一个答案**。

### S-12 缺席时的默认答案

**一律拒绝或明确失败，不放行、不空集、不回退、不填初值。**「判不出来」与「判出来是否」是两个值。

| 缺席的是什么 | 结果 | 为什么 |
|---|---|---|
| `tenant`，或任何身份值的一半 | `invalidInput` | `data.identity-values/v1#S-12`、`#S-17`、`#S-18`：身份参数没有默认值，**不从「当前登录」之类的环境补** |
| `workspace` | **工作区那一格为空**：没有持有、没有配值、**不去找任何目录** | 这是产品规则，不是回退：[不指定就是空](../../../../product/PF-002-assets-settings-and-permissions/design.md#它是会话选用的不指定就是空) |
| `session` | 会话格没有值 | 同上：会话格的值只来自会话记录（文首「起草裁定」第一条） |
| 某一格对某能力标识没有持有 | 那一格不参与这个能力标识 | **不当作「默认持有官方件」**；官方件由出厂那一格自己持有 |
| 某一项在任何一格都没配 | 取生效资产声明的默认值，`from = factory` | 这是产品规则：[出厂默认层的设置与权限就是资产自带的那一份](../../../../product/PF-002-assets-settings-and-permissions/design.md#由此得到两个推论)。**例外：工作区自带资产的权限项**，[S-25](#s-25-工作区自带资产的权限项一律取最严值) |
| 一个引用求不出生效资产 | 进 `unresolved`，**不补一份，也不静默略去** | [S-20](#s-20-第二步组装) |
| 这次用哪一个已发布版本（钉住的不存在、`current` 却一版都没发布） | `invalidInput`（C9） | **不以别的版本代替**：[不静默替换已选用的版本](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本) |
| `standing`，或它是 `ineffective` | `invalidInput`（C1、C12） | 「谁可以用」要按角色求；**不当作「普通成员」补上**——`data.identity-values/v1#S-17` |
| 某一类的两条规则（[S-10](#s-10-各类正文契约须供的两条规则)） | **本契约对这一类不给结果**；实现**不得**把「抽不出引用」当作「没有引用」、把「推不出属性项」当作「没有属性项」 | 前者会让一个缺零件的 agent 看起来完整，后者会让一项权限不经求值就不存在（[G-3](#十一已知缺口)） |
| 工作区自带资产上、[S-25](#s-25-工作区自带资产的权限项一律取最严值) 表外的一个权限项的最严值 | **空集**（没有任何一档被允许） | 最严的允许集合是空集；**不取资产自己声明的出厂值**（[G-8](#十一已知缺口)） |
| 读入时判不出一项是不是权限项、是不是落点与身份类（[S-28](#s-28-配值与禁用只对自带资产生效丢掉的留痕)） | 照常读入，**由第 4 步 [S-24](#s-24-工作区那一格在第四步只贡献设置) 滤掉并留痕** | 读入面手上没有属性声明（[G-5](#十一已知缺口)）；第二道滤一定会走，所以这不是放行 |

### S-13 invalidInput 是没开始判，filteredOut 与 unresolved 是判出来的结果

口径取 [`data.identity-values/v1#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开)：

- **`invalidInput`**：输入不是一份合法的输入——形状不合，或违反 [S-7](#s-7-输入的一致性条件) 的一致性条件。
  **求值根本没有发生**，操作**不返回任何结果，也不返回半份**。它不表示「这个租户什么都没有」，**不得被当成一个空的 `EffectiveAssembly`**。
- **`filteredOut` 与 `unresolved`**：求值发生了，这是它**判出来的结果**的一部分。
  一个悬空引用、一份被禁用的持有、一条被滤掉的工作区配值**都不是失败**。

**两者不走同一条通道**：`invalidInput` 是操作的失败，`filteredOut`／`unresolved` 在成功返回的结果里。
**不得**把一条 `unresolved` 升级成 `invalidInput`（那会让一次合法求值无从得知缺的是哪个），
也**不得**把一次 `invalidInput` 降成一份带着空列表的成功结果（那会让一个坏输入看起来像「没有资产」）。

---

## 四、操作

### S-14 这一节每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | **输入** |
| ② | **前置与授权** |
| ③ | **结构性禁止**（不适用写「无」） |
| ④ | **提交点与原子性**（纯计算写「无提交」） |
| ⑤ | **成功返回** |
| ⑥ | **失败集合**（枚举封闭，**没有「其他」**） |
| ⑦ | **幂等与重复** |
| ⑧ | **缺席时的默认答案**（[S-12](#s-12-缺席时的默认答案)） |
| ⑨ | **事件** |

**本节共两个操作**：[S-15 evaluate](#s-15-evaluate)、[S-16 readWorkspaceCarrier](#s-16-readworkspacecarrier)。

### S-15 evaluate

| # | 内容 |
|---|---|
| ① | 一份 `EvaluationInput`（[S-6](#s-6-求值输入-evaluationinput)） |
| ② | **无授权前置**——这是一个纯计算，放行与否由消费者自己决定。**前提**（不由本操作检查，[第七节](#七性质与前提)）：`tenant` 此刻是有效成员、调用方有权以它求值（P3）；交进来的每份持有此刻仍然成立（P2）；四格的持有是同一时刻读出来的（P1） |
| ③ | 无。官方件不可禁用、工作区不参与权限这类结构性规则**体现在求值规则里**（[S-17](#s-17-第一步之一先按禁用滤)～[S-25](#s-25-工作区自带资产的权限项一律取最严值)），不是拒绝 |
| ④ | **无提交**：不读不写任何存储，不改输入 |
| ⑤ | 一份 `EffectiveAssembly`（[S-8](#s-8-求值结果-effectiveassembly)），按四步 [S-17](#s-17-第一步之一先按禁用滤)～[S-26](#s-26-每份持有都有去处) 求出 |
| ⑥ | `invalidInput`（[S-7](#s-7-输入的一致性条件) 任一条不满足）· **组合图成环的收场值——名待定，[G-1](#十一已知缺口)**。**没有别的失败**：求不出来的引用不是失败，是 `unresolved`；被滤掉的东西不是失败，是 `filteredOut` |
| ⑦ | **天然可重复**：同输入同输出（[S-11](#s-11-纯计算)）。结果可以被消费者缓存，**缓存必须以整份输入为键**——任何一份持有、配值、定义、选用版本、会话配值、`standing` 或 `workspace` 变了都要重求；**不得**只以 `(tenant, root)` 为键（`data.identity-values/v1#S-27`：缓存要写明失效条件） |
| ⑧ | 见 [S-12](#s-12-缺席时的默认答案)。**判不出来的一律不当作判出来了**：版本选用确定不了 ⇒ `invalidInput`；某一类的正文规则缺席 ⇒ 本契约对那一类不给结果；**不产出一份把这些缺口填成空集的 `EffectiveAssembly`** |
| ⑨ | 不发 |

**`⑥` 里那一格空着，这是有意的。**[产品原话要求成环时拒绝并指出环在哪](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)，
但本契约的账本只有 `invalidInput`，而成环**不是表示层问题**——它是第 2 步判出来的，把它收进 `invalidInput` 会违反 [S-13](#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果)。
**「哪些环算」同样未定**：[Skill 与 Tool 互相引用是产品明写允许的](../../../../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种)，
而[组合图不得成环](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)。**G-1 闭合前，本契约对含环输入的结果不作承诺，实现不得据猜测选一个值或一个范围。**

### S-16 readWorkspaceCarrier

| # | 内容 |
|---|---|
| ① | `manifest`：一份 `WorkspaceCarrierManifest` **值**（`data.asset-model`）——承载目录里那份文件**已经被读出并解析成 JSON**；`workspace`：一个 `WorkspaceKey`，这份清单所在的那份工作区 |
| ② | 无授权前置。**前提**：`workspace` 是调用方已核实**归会话租户持有、且挂在这次会话上**的那一份（[PF-015 §6.13](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#613-工作区在创建时显式指定不指定就是空)，前提 P5）；`manifest` 就是从那份工作区的承载目录里读出来的那份文件（前提 P7） |
| ③ | 无 |
| ④ | **无提交**。**不读文件**：`source` 指向的资产包**不在这里解析**（[S-27](#s-27-自带资产变成工作区那一格的持有)）；不读时钟 |
| ⑤ | 一份 `CarrierReadResult` = `{ holdings, dropped }`：`holdings` 是工作区那一格的持有（`AssetHolding` 的集合，[S-27](#s-27-自带资产变成工作区那一格的持有)）；`dropped` 是**没有读进来的东西**，每条一个 `DroppedEntry` = `{ capability, item?, reason }`（[S-28](#s-28-配值与禁用只对自带资产生效丢掉的留痕)） |
| ⑥ | `invalidInput`，当且仅当：`manifest` 或 `workspace` 不合 `data.asset-model` 的形状（**含它的清单表示层拒绝：格式版本不认、`source` 越出承载目录**——这些拒绝值作诊断信息附带，**失败值仍只有 `invalidInput` 一个**）；`assets` 里同一能力标识出现两次；`assignments` 里同一 `(能力标识, 项)` 出现两次；`assignments` 里出现保留项 `disabled`（清单写禁用只有 `disabled` 那一个成员，一件事一种写法） |
| ⑦ | 同输入同输出（[S-11](#s-11-纯计算)）；可重复 |
| ⑧ | `assignments` 或 `disabled` 缺席或为空 ⇒ 没有配值、没有禁用；**判不出是不是权限项、是不是落点与身份类的配值照常读入**，由第 4 步兜住（[S-12](#s-12-缺席时的默认答案)、[S-24](#s-24-工作区那一格在第四步只贡献设置)） |
| ⑨ | 不发 |

**`DropReason` 是闭合枚举，恰四个值**：`permission_item` `placement_identity_setting` `immutable_flag` `unknown_asset`，含义见 [S-28](#s-28-配值与禁用只对自带资产生效丢掉的留痕)。
**其中前两个本版不会产生**：判断一项是不是权限项、是不是落点与身份类，要看那份资产的属性声明，
而本操作的输入里没有它（[G-5](#十一已知缺口)）。**那两类配值照常读入，在第 4 步被 [S-24](#s-24-工作区那一格在第四步只贡献设置) 滤掉并以 `workspace_permission`／`workspace_placement` 留痕**——
[「那条路根本不走」](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)的承诺由那一道兑现，这一道只是本版做不到提前。

---

## 五、四步的求值规则

记号：`c` 是一个能力标识；一份持有 `h` 有它的格 `L(h)`、能力标识与资产 `A(h)`；「外」「里」按 [S-5](#s-5-层与三条层序) 的对应层序。

### S-17 第一步之一：先按禁用滤

**[禁用](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)是资产上的一项布尔设置，逐格配、按析取合成**（[PF-002 §6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)）；
它挂在持有上，项名是 `data.asset-model` 定的保留项 `disabled`。**一份资产 `a` 在这次求值里被禁用，当且仅当**：

- 组织或租户那一格有一份指向 `a` 的持有，其 `disabled` 为真；**或者**
- 工作区那一格有一份指向 `a` 的持有，**`a` 是[工作区自带资产](#s-9-工作区自带资产)**，且其 `disabled` 为真。

**被禁用资产的每一份持有，在第 1 步之二之前退出**：在替换次序上视为不存在、它上面的锁不起作用、它上面的配值不参与第 4 步；
**每一份各记一条** `filteredOut (c, L(h), disabled)`。

四条后果，都是产品原话或它的直接推论：

1. **任一格为真即为真。**下层开不回上层禁的（[PF-002 §6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)）；
   反过来，**租户把组织那份资产配成禁用，在这个租户的求值里它同样不可见**——析取没有方向。
2. **被禁用的那份退出替换，标识退回外一层**（[§5.6](../../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)）：
   工作区借「同名替换再禁用」藏不掉租户的资产（[S-34](#s-34-先禁用后替换)）。
3. **工作区配的禁用只管它自带的那批。**本版由 C8 保证工作区那一格只持有自带资产，所以这条在输入层面就成立；
   G-4 闭合、工作区能持有别层资产之后，本条的第二个分句仍是那条限定的兑现处。
4. **官方件不会被禁用**：C7 已保证；出厂那一格不带配值（C6），不贡献任何一个真。

> **一个要让产品看一眼的后果**：禁用先于替换，所以**更具体的一格可以让外层锁住的那份资产在自己这里不可见**——
> 它换不成自己的（[S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断)），但能让那个标识退回更外一层、或者整个消失。
> 这是 §5.6 次序的字面结果，本契约照写，**已报给主线**。

### S-18 第一步之二：再取最具体的一份，锁在最外那一把处截断

对每个能力标识 `c`，在经过 [S-17](#s-17-第一步之一先按禁用滤) 留下的 `c` 的持有里：

1. **找锁**：持有上 `immutable` 为真、**且不在工作区那一格**的，是一把锁（工作区配的 `immutable` 不加载，[S-24](#s-24-工作区那一格在第四步只贡献设置)）。
   有锁时取**资产归属层序上最外的那一把** `k`。**锁的是「持有它的那一格以里不许再替换」，不问锁住的是官方件还是自定义件**（[§5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)）。
2. **截断**：`k` 那一格以里的持有，**指向的资产与 `k` 相同的留下**——那是更具体的一格为了给它配值而持有它，不是替换；
   **指向别的资产的退出**，每份记一条 `filteredOut (c, L(h), locked_below)`。
3. **取最具体的一份** `s`：剩下的持有里资产归属层序上最里的那一份。它给出 `EffectiveAsset`：

| 成员 | 取值 |
|---|---|
| `capability` | `c` |
| `asset` | `A(s)` |
| `from` | `L(s)` |
| `replaced` | **比 `from` 外、仍留下、且指向另一份资产的那些格**。非空即「同标识替换发生了」——[那件事必须可见](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)，这一列就是它的数据 |
| `lockedAt` | 有锁时是 `L(k)`；没有锁时缺席 |

**`c` 没有留下任何持有，`c` 就不进 `assets`**——它的每一份持有都已在 `filteredOut` 里有一条（[S-26](#s-26-每份持有都有去处)）。

**替换只在「指向另一份资产」时发生。**同一份资产在几格上各被持有一次，是[同一份资产在各格各有一份持有、各有各的配值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)，
不是几次替换；所以 `replaced` 与 `locked_below` 都只看资产不同的那些持有。

**meta 能力任何一格都替换不了**（[PF-002 §5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)、[PF-007](../../../../product/PF-007-meta-capabilities/design.md#meta-与常驻的关系)）。
**本契约不认得哪些能力标识是 meta 能力**：它落成**出厂那一格对 meta 能力的持有带锁**，由上面第 1 条截断兑现。
那份锁由出厂那一格持有的供给方给出——**那是前提 P4，本契约不检查**（[G-11](#十一已知缺口)）。

### S-19 官方件是下界

**出厂那一格持有的每个能力标识，求值后在 `assets` 里都有一份。**
出厂那一格持有的就是[官方件](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-official-asset--官方件--official-asset)（C6）——组装的最小必需、不可禁用，可被同能力标识的自定义件替代，但替代不是移除。

它不是一条额外规则，是前面几条的直接结果：出厂那一格只持有官方件（C6）、官方件不会被禁用（C7），
所以出厂那一份持有**永远过得了 [S-17](#s-17-第一步之一先按禁用滤)**；它在资产归属层序的最外格，**永远不在任何一把锁以里**，
所以也**永远过得了 [S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) 的截断**——候选里至少有它。
这就是[任何层都不能把 official 清空](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)在求值里的兑现处。

**它依赖一个本契约看不见的前提：出厂那一格的持有是齐全的**（每一份官方件都在输入里，前提 P4）。
输入里压根没有某份官方件的持有时，本契约**无从发现**——
[产品把那种情形定为缺陷](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)，它的观测点在出厂持有的供给方（[G-11](#十一已知缺口)）。

### S-20 第二步：组装

**从 `root` 的生效资产起，沿「选用版本正文里声明的引用」（[S-10](#s-10-各类正文契约须供的两条规则) 规则一）走，求可达的能力标识集合。**
这就是[资产组合](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)从一个 Agent Definition 展开求值的结果——[组装不是第二种机制](../../../../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种)。
每走一步，被引用的那个能力标识**用第 1 步求出的生效资产**——[引用指向能力标识，不指向具体资产](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)，
所以组织换上的那一份自动进入所有引用它的 plugin 与 agent definition。

| 结果 | 定义 |
|---|---|
| `composition` | 可达、且在 `assets` 里有生效资产的能力标识，**含 `root` 自己** |
| `unresolved` | 可达、却**没有**生效资产的能力标识：每条 `{ capability, referencedBy }` 记下被引用的那个与**引用它的那一个**（被几个引用就记几条）；**`root` 自己求不出时记一条，`referencedBy` 缺席**，此时 `composition` 为空 |

- **求不出的不再往下走**：它没有正文，无从展开。
- **plugin 的成员就是 plugin 正文里的引用**，同样经第 1 步求值；「成员随 plugin 一并持有」是写入面（`capability.asset-governance`）的事，这里只看持有。
- **一个能力标识被禁用了（第 1 步没有它），它就求不出**——[禁用对 agent 就是不可见](../../../../product/PF-002-assets-settings-and-permissions/design.md#但对-agent-来说两者一样都不可见)；
  它进 `unresolved`，引用它的那一个照常装上。
- **权限项的值不影响本步**：本步在第 4 步之前，**`assets` 与 `composition` 只由持有、禁用、锁与正文决定**——
  这是 [PF-004 I-4「动作空间只由构成决定」](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)在求值里的兑现处。
- **可达集合的定义不因环而不终止**；成环的收场与范围见 [S-15](#s-15-evaluate) ⑥ 与 [G-1](#十一已知缺口)。
- **配成了别的值的绑定类设置**（斜杠命令的绑定目标、plugin 启用哪些成员）**改不改本步的引用，未定**——
  本步只看正文声明的引用；它们是设置，值在第 4 步才求得（[G-13](#十一已知缺口)）。

### S-21 第三步：投影

**对 `composition` 里每个能力标识的生效资产，用它选用版本的正文按 [S-10](#s-10-各类正文契约须供的两条规则) 规则二推出属性项集合。**
它就是 [PF-002 §5.6](../../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算) 第 3 步「投影」：**项的存在性由组装决定**，不由任何一格配没配值决定。

- **保留项 `disabled` 不是这里的一项**：它由写入面挂在每份持有上，第 1 步已经用掉，不进 `values`。
- **一格对一个不存在的项配了值，那条配值不参与**：项不存在，就没有它的值。这不是滤掉，不进 `filteredOut`。

> **用词提醒**：统一语言的[属性投影](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection)
> 说的是「某一格的设置或权限是它持有资产的属性在这一格上的视图」；§5.6 第 3 步也叫「投影」，说的是「装上的资产各带哪些项」。
> **两处指的是否同一个概念未经词条裁定**，本契约只在引 §5.6 时用「第 3 步投影」这个说法，已报给主线。

### S-22 第四步：设置

对 `composition` 里的能力标识 `c`、它的生效资产 `A`、`A` 的一项设置 `i`：

**各格给出的值**：

| 格 | 值从哪来 |
|---|---|
| `factory` | `A` 对 `i` 声明的默认值——[出厂默认层就是资产自带的那一份](../../../../product/PF-002-assets-settings-and-permissions/design.md#由此得到两个推论) |
| `organization`、`tenant`、`workspace` | 那一格对 `c` 的持有**指向 `A`** 时，那份持有上 `i` 的配值；**指向别的资产、或没有持有，这一格不给值**。工作区那一格的配值先过 [S-24](#s-24-工作区那一格在第四步只贡献设置) |
| `session` | 会话格对 `(c, i)` 的配值 |

**合成**：按设置层序由外到里（`factory` < `organization` < `tenant` < `workspace` < `session`），
**第一格带 `immutable` 的配值截断**——值取它，`from` 与 `lockedAt` 都是那一格；
没有锁时取**最里面给了值的那一格**，`from` 是那一格；每一格都没给值时取出厂那一格。
这就是[覆盖](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)加[不可覆盖标记](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)。

**设置按资产取值，「指向 `A` 才给值」这一格不能省**：
真正被读写的最小单位是[（身份层，具体资产，属性项）→ 值](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)，
被分享方配的值[属于（他的组织, 资产, 项）](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)。
**它还挡住一条实在的泄漏**：落点与身份类是设置；若设置按能力标识跨实现沿用，租户给自己那份 MCP 接入点配的[凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)
会被带到仓库自带的同名接入点上、送到仓库指定的地址去（[S-33](#s-33-四格齐全的一次求值) 核对它没有发生）。

**权限不这样取**，它按能力标识跨层取交集（[S-23](#s-23-第四步权限)，主线裁定）。**两条规则的分界就是设置与权限的分界**，由生效资产对这一项的声明决定。
**「设置按资产」是本契约推导的**，施工简报的追加裁定只裁了权限；它的来源记录另写了「设置项同理按标识覆盖链」——两处对不上，记为 [G-17](#十一已知缺口)，闭合前按本条。

**设置这一侧的代价要写出来**：更具体的一格**换了实现**之后，外层为原实现配的**设置**不跟过去——
包括外层锁住的设置值。外层要让自己的设置管住这个能力标识，**杠杆是锁替换**（[S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断)），见 [S-36](#s-36-换了实现设置不跟过去权限的约束跟过去)。

### S-23 第四步：权限

对 `composition` 里的 `c`、生效资产 `A`、`A` 声明的一项权限 `i`：

**这一项按能力标识跨层取交集**（主线 2026-09-23 追加裁定）：外层对**这个能力标识**配的允许集合，约束**任何一格的同标识实现**——
不论生效的是哪一份。**换一份实现逃不出外层对权限的收窄。**

**各格给出的约束**：

| 格 | 约束 |
|---|---|
| `factory` | **不给约束**：`A` 声明的取值域 `D` 是界；`A` 声明的默认值只是作者建议（见下）。**例外**：`A` 是工作区自带资产时，这一格给出 [S-25](#s-25-工作区自带资产的权限项一律取最严值) 的最严值，它是约束 |
| `organization`、`tenant` | 那一格对 `c` 的持有**在效**时，那份持有上 `i` 的配值——**不论它指向哪一份资产**。「在效」= 没有被 [S-17](#s-17-第一步之一先按禁用滤) 禁用滤掉、没有被 [S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) 以 `locked_below` 挡下 |
| `workspace` | **不在其中**（[S-24](#s-24-工作区那一格在第四步只贡献设置)） |
| `session` | 会话格对 `(c, i)` 的配值 |

**一格的配值按那份持有所指资产的声明读**：那份资产没有把 `i` 声明为权限项，这一格对 `i` 不给约束（与 [S-21](#s-21-第三步投影) 同理）；
它的允许集合里出了 `D` 的值，交集自然把它收掉——**只会更窄，不会更宽**。

**合成**：

1. `X` = `D` ∩ 各格约束之交——[收窄，取交集，没有方向](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)。
2. **值**：`A` 声明的默认值（按允许集合读）与 `X` 有交集时，取那个交集；没有交集时取 `X`——**默认值只是作者建议，不在交集里时以交集为准**（主线裁定）。
   工作区自带资产**不取**它声明的默认值作建议，值就是 `X`。
3. `from` = 给了约束的最里面那一格；没有一格给约束时取 `factory`。
   `lockedAt` = 给了约束、且那条配值带 `immutable` 的最外那一格（有时）。按交集求值时锁**不改变值**——
   「下层改不了」由写入面兑现（`capability.asset-governance` 拒绝写界外的值），`lockedAt` 只让它可见。

**空集是一个合法的值**：没有任何一档被允许。**它落到放行判定是什么、多于一个值的允许集合落到哪一档**，归消费它的判定（[G-9](#十一已知缺口)）。

**「不在效」的持有不给约束，这一格是本契约推导的**：被禁用的持有是[关起来的](../../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)，
在锁以里退出的那份也不在这一次求值里起作用——两者的配值都原样保留、都不参与；**「被替换」不在此列**：
被更具体一格换掉的那份持有仍然在效，外层正是靠它约束新实现。

**外层约束过、生效资产却没声明的项**：比 `A` 的 `from` 更外的某一格，在它对 `c` 的在效持有上配了 `A` 没声明的权限项 `j`——
**替换件缺该项，`j` 视为取最严**（主线裁定）：`values` 里有 `(c, j)`，值 = `j` 的最严值 ∩ 那些约束之交，
最严值按 [S-25](#s-25-工作区自带资产的权限项一律取最严值) 的表（`j` 的种类看那一格所持资产对它的声明；表外、或几格的声明对种类说法不一，都取空集），`from` 取给了约束的最里面那一格。
**这一格让「换一份没有这一项的实现」逃不掉外层的约束**；比 `from` 更里的格对 `A` 没声明的项配的值不参与（没有替换发生在它们与 `A` 之间）。

**产品原话在这条规则下各求出什么**：

| 产品原话 | 本条求出 |
|---|---|
| [出厂默认「问一下」，组织没配，租户配成「自动」⇒ 组装时生效：自动](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) | `X = {自动}`；默认 `{问一下}` 与它不交 ⇒ `{自动}`，`from = tenant` |
| [组织收窄为空集，租户再怎么设也拿不到](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) | `X` = 空集 ⇒ 空集，`from` 取给了约束的最里面那一格 |
| [组织只许「问一下或禁止」，成员选「禁止」](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用) | `X = {禁止}` ⇒ `{禁止}`，`from = tenant`——[低层只能在界内进一步收紧](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义) |
| [组织锁死「问一下」，成员改不了](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用) | 成员写 `{自动}` 本该在写入面被拒；若它仍在输入里（锁是后加的）⇒ `X` = 空集 ⇒ **空集，不是「问一下」** |
| [组织说默认「问一下」（不锁），成员可改成「自动」](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用) | `X = {问一下} ∩ {自动}` = 空集 ⇒ **空集——与这一行的字面相抵**，见 [G-16](#十一已知缺口) |

### S-24 工作区那一格在第四步只贡献设置

**授权与权限、落点与身份类设置项、`immutable`——这三样工作区一概不参与**（[PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)）。
**不是「加载了但不许放宽」，是那条路根本不走**；每一处没走的路都在 `filteredOut` 留一条：

| 工作区那一格的什么 | 怎么办 | 留痕 |
|---|---|---|
| 对一个**权限项**的配值 | 不参与 | `(c, workspace, workspace_permission)` |
| 对一个**落点与身份类**设置项的配值 | 不参与 | `(c, workspace, workspace_placement)` |
| 配值上的 `immutable` | **标记不加载，值照常按不带锁参与** | `(c, workspace, workspace_immutable)` |
| 持有上的 `immutable`（锁替换） | 不是一把锁（[S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断)） | `(c, workspace, workspace_immutable)` |

其余设置（偏好、绑定）照常参与，**按设置层序压过租户，压不动外层锁住的项**（[§5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)）。
治理类的 `disabled` 由 [S-17](#s-17-第一步之一先按禁用滤) 管，只对工作区自带资产生效。

**工作区自带资产的落点与身份类设置「随资产一起来」**（[§5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)）：
那是它的声明默认值（出厂那一格），**不是工作区那一格的配值**；本条挡的是**改别人资产的落点**，也挡住了仓库在清单里改自己那份的落点——后者本来就不需要。

**判定依据是生效资产对这一项的声明**（第 3 步）：一项是不是权限项、是哪一类设置，看的是 `A` 的 `AttributeDeclaration`，**不看配值长什么样**。

### S-25 工作区自带资产的权限项一律取最严值

**`composition` 里的能力标识，生效资产是工作区自带资产时，它的每一个权限项以最严值为出厂那一格的约束**（[S-23](#s-23-第四步权限) 表第一行的例外）：

| 权限项 | 最严值 | 依据 |
|---|---|---|
| **执行权限**（Tool 的；MCP 每一个动作的） | `{问一下}`（[三档：问一下 / 自动 / 禁止](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人)） | [PF-002 §5.7 表](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) |
| **干预力**（Loop Extension） | `{只观察}`（[三档：只观察 / 可改写 / 可否决](../../../../product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的)） | 同上 |
| **「能不能用」「谁可以用」**（MCP 能不能用、Skill 谁可以使用它、Slash Command 谁可以用这个入口） | `{self}`——**只有挂上这份工作区的那个租户**。这一类项的取值域是租户角色（`data.identity-values/v1#S-8`）加 `self`（主线裁定）；`self` 怎么判到一个租户，[G-15](#十一已知缺口) | 同上；[「谁可以用」的最严值不取「无人」](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) |
| **表外的其余权限项** | **空集** | [S-12](#s-12-缺席时的默认答案)；产品未给这些项的最严值（[G-8](#十一已知缺口)） |

- **值永远落在最严值之内**：`X` ⊆ 最严值。组织、租户、会话对这个能力标识的约束**照常按 [S-23](#s-23-第四步权限) 参与，只会更严**——
  [PF-002 §5.7「没有任何一层配得了它」](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)在这里读作「没有任何一层放宽得了它」。
- **不认它自己声明的出厂值**——[那等于让仓库替自己定权限](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)；它连作者建议的身份都没有（[S-23](#s-23-第四步权限) 合成第 2 条）。
- **`from`**：有别的格给约束时取其中最里面那一格，否则取 `factory`——值由系统按这条规则定，不来自工作区那一格。
- **它的设置照常按 [S-22](#s-22-第四步设置) 求**：工作区那一格配的偏好压过出厂默认值。

**要放宽，把这份资产收进租户层再配**——那是复制或另建，不是求值能做的事。

### S-26 每份持有都有去处

**输入里的每一份持有，在结果里恰有一处交代**：

| 它是 | 在结果里 |
|---|---|
| 被选中的那一份 | `assets` 里那个能力标识的 `from` |
| 与被选中的指向同一份资产 | 不单列；它的配值参与第 4 步 |
| 比 `from` 外、指向另一份资产 | 它那一格出现在 `replaced` 里；它上面的权限配值照常约束这个能力标识（[S-23](#s-23-第四步权限)），设置配值不参与（[S-22](#s-22-第四步设置)） |
| 被禁用滤掉 | `filteredOut (c, L(h), disabled)` |
| 在一把锁以里、指向另一份资产 | `filteredOut (c, L(h), locked_below)` |

**工作区那一格没走的每一条路也都有一条**（[S-24](#s-24-工作区那一格在第四步只贡献设置)）。
**没有第六种去处**：一份持有既不在上表任何一行、又没有进结果，就是一次静默丢弃——**那是本契约不允许的**。

---

## 六、读入工作区承载清单

### S-27 自带资产变成工作区那一格的持有

**清单 `assets` 里的每一条 `(c, source)`，读成工作区那一格对 `c` 的一份持有**：

| 持有的成员 | 取值 |
|---|---|
| holder | 工作区那一格，键是输入的 `workspace` |
| capability | `c` |
| asset | **这份工作区自带资产的记录号**：由 `(workspace, c)` 确定——同一份清单、同一个工作区读两次得到同一个；**不与任何非工作区资产的记录号相等**。怎么铸归 `data.asset-model`（[G-6](#十一已知缺口)） |
| immutable | **恒为假**——工作区配不了 `immutable` |
| assignments | [S-28](#s-28-配值与禁用只对自带资产生效丢掉的留痕) 读进来的那些 |

**`source` 不在这里解析。**调用方按 `source` 把资产包解析成一份 `AssetDefinition`（**它的 `id` 就是上面那个记录号**），
与这些持有一起放进求值输入——解析规则归各类正文契约（[G-6](#十一已知缺口)）。
**本契约对持有的另外两个成员（使用权来路、起始时刻）不作承诺**：求值不读它们，它们对工作区那一格该填什么归 `data.asset-model`（[G-6](#十一已知缺口)）。

**清单显式列举，不扫目录**（文首「起草裁定」第三条）：目录里有、清单没列的东西**不存在**于这一格。

### S-28 配值与禁用：只对自带资产生效，丢掉的留痕

**`assignments` 里的每一条 `(c, item, value)`**：

| 情形 | 怎么办 | `dropped` |
|---|---|---|
| `c` 不在 `assets` 里 | **不读入** | `{ c, item, unknown_asset }` |
| 带 `immutable` 标记 | **标记丢掉，值读入为不带锁的配值** | `{ c, item, immutable_flag }` |
| 其余 | 读入为 `c` 那份持有上的一条配值，`immutable` 为假 | — |

**`disabled` 里的每一个 `c`**：

| 情形 | 怎么办 | `dropped` |
|---|---|---|
| `c` 在 `assets` 里 | 那份持有的保留项 `disabled` 为真 | — |
| `c` 不在 `assets` 里 | **不读入**——[工作区配的禁用只管它自己提供的那批](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见) | `{ c, —, unknown_asset }`（`item` 缺席） |

**`DropReason` 四个值的含义**：

| 值 | 什么没读进来 | 本版产生吗 |
|---|---|---|
| `unknown_asset` | 一条配值或一条禁用，指向清单自己没列的能力标识 | **产生** |
| `immutable_flag` | 一条配值上的 `immutable` 标记（值读进来了） | **产生** |
| `permission_item` | 一条对权限项的配值 | **不产生**（[G-5](#十一已知缺口)）；同一件事由 [S-24](#s-24-工作区那一格在第四步只贡献设置) 以 `workspace_permission` 留痕 |
| `placement_identity_setting` | 一条对落点与身份类设置项的配值 | **不产生**（[G-5](#十一已知缺口)）；同一件事由 [S-24](#s-24-工作区那一格在第四步只贡献设置) 以 `workspace_placement` 留痕 |

**`unknown_asset` 的第一行挡掉的正是产品想要、本版给不了的那件事**：工作区为别层提供的资产配设置（[G-4](#十一已知缺口)）。
**它留痕，不静默**——仓库作者据此知道自己写的那一条没有生效。

---

## 七、性质与前提

性质的来源一律引 PF 小节；**编号只在本表内作行标，不是可外部引用的条款号**。

### 不变量

| 性质 | 谁在何处保护 | 前提 | 证据 | 来源 |
|---|---|---|---|---|
| **每个能力标识至多一份生效资产** | [S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) 第 3 条 ＋ C4 | — | Alloy：`effective` 的定义（按构造） | [PF-001 §6.2](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义) |
| **官方件是下界**：出厂持有的每个能力标识都有生效资产 | [S-19](#s-19-官方件是下界) | P4 | Alloy (v) `OfficialLowerBound` | [PF-001 §6.2](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义) |
| **生效资产只来自输入的持有**，不来自 `definitions` 里多带的、plugin 里的或别处的一份 | [S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) | — | Alloy (i) 的一半 | [PF-003 §6.1](../../../../product/PF-003-asset-transfer-and-sharing/design.md#61-一条不变量团队资产不出那棵树) |
| **团队资产不出那棵树**：每份生效资产要么是官方件，要么所有者在租户那棵隶属树内 | [S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) ＋ 前提 P2 | **P2** | Alloy (i) `TeamAssetsStayInTree`（**在 P2 之下**） | [PF-003 §6.1](../../../../product/PF-003-asset-transfer-and-sharing/design.md#61-一条不变量团队资产不出那棵树) |
| **权限项的值从不来自工作区那一格** | [S-23](#s-23-第四步权限)、[S-24](#s-24-工作区那一格在第四步只贡献设置)、[S-25](#s-25-工作区自带资产的权限项一律取最严值) | — | Alloy (iv) `WorkspaceNeverSourcesPermission` | [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) |
| **落点与身份类设置项的值从不来自工作区那一格** | [S-24](#s-24-工作区那一格在第四步只贡献设置) | — | Alloy (iv′) `WorkspaceNeverSourcesPlacement` | 同上 |
| **权限项的值不改变 `assets` 与 `composition`** | [S-20](#s-20-第二步组装)：第 2 步先于第 4 步 | — | 规范场景 [S-33](#s-33-四格齐全的一次求值)（改一项权限重求，比对前两列） | [PF-004 I-4](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) |
| **每份持有都有去处** | [S-26](#s-26-每份持有都有去处) | — | 规范场景 [S-33](#s-33-四格齐全的一次求值)～[S-35](#s-35-清单读入的留痕) | [PF-002 §5.5「静默的替换」](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级) |
| **同输入同输出** | [S-11](#s-11-纯计算) | — | 规范场景 [S-33](#s-33-四格齐全的一次求值)（同一输入跑两次比对）＋ 静态检查（不读存储、时钟、文件） | [PF-004 §4 装配清单](../../../../product/PF-004-agent-definition-and-assembly/design.md#装配清单) |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 证据 | 来源 |
|---|---|---|---|---|
| **一份被禁用的资产出现在结果里** | [S-17](#s-17-第一步之一先按禁用滤) | — | Alloy (iii) `DisableIsDisjunction` | [PF-002 §6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见) |
| **锁以里换进了另一份** | [S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) | — | Alloy (ii) `LockTruncates` | [PF-002 §5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级) |
| **换一份实现，就逃出外层对这个能力标识的权限收窄**（含换一份没有那一项的实现） | [S-23](#s-23-第四步权限) | — | Alloy (vi) `ReplacementCannotEscapePermission`（只核来源那一格）；规范场景 [S-36](#s-36-换了实现设置不跟过去权限的约束跟过去)（核值） | [PF-001 §6.2 收窄](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)；主线追加裁定 |
| **工作区借「同名替换再禁用」藏掉租户的资产** | [S-17](#s-17-第一步之一先按禁用滤) 先于 [S-18](#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) | — | 规范场景 [S-34](#s-34-先禁用后替换) | [PF-002 §5.6](../../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算) |
| **仓库给自己提权、改别人的落点、锁死更里面的一格** | [S-24](#s-24-工作区那一格在第四步只贡献设置)、[S-25](#s-25-工作区自带资产的权限项一律取最严值) | — | Alloy (iv)(iv′)；规范场景 [S-33](#s-33-四格齐全的一次求值) | [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) |
| **租户配在自己那份资产上的凭据，被仓库自带的同名接入点拿到** | [S-22](#s-22-第四步设置)「指向 `A` 才给值」 | — | 规范场景 [S-33](#s-33-四格齐全的一次求值) | [PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) |
| **别的租户或别的组织的持有进入这次求值** | [S-7](#s-7-输入的一致性条件) C3 | — | 规范场景 [S-37](#s-37-输入不合法时整体拒绝) | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| **一个求不出的引用被静默略去**，装出一个缺零件却看似完整的构成 | [S-20](#s-20-第二步组装) | — | 规范场景 [S-33](#s-33-四格齐全的一次求值) | [PF-004 I-9](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) |
| **一份不合法的输入产出半份结果**，或被当成「什么都没有」 | [S-13](#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果)、[S-15](#s-15-evaluate) ⑥ | — | 规范场景 [S-37](#s-37-输入不合法时整体拒绝) | [PF-004 acceptance §一 装配](../../../../product/PF-004-agent-definition-and-assembly/acceptance.md#装配) |
| **目录里清单没列的东西进了工作区那一格** | [S-27](#s-27-自带资产变成工作区那一格的持有) | P7 | 规范场景 [S-35](#s-35-清单读入的留痕) | [PF-002 §4 工作区](../../../../product/PF-002-assets-settings-and-permissions/design.md#挂上之后它的内容在装配时自动进来)（文首「起草裁定」第三条） |

### 进展性质

| 性质 | 上界 | 前提 |
|---|---|---|
| 两个操作对任何输入**都在一次调用内返回**：一份结果或一个失败值 | 那一次调用；步数以输入的大小为界（可达集合的求法不因环而不停） | [S-10](#s-10-各类正文契约须供的两条规则) 的两条规则本身在有限步内返回（各类正文契约的承诺） |

### 前提（由别人兑现，本契约不检查）

| # | 前提 | 谁兑现 | 不成立会怎样 |
|---|---|---|---|
| P1 | 四格的持有、配值、定义与选用版本是**同一时刻的一致读** | 组输入的一方（读持有的面归 `capability.asset-governance`） | 一次求值看到租户新加的持有、却看到组织旧的锁，**锁截断在效果上被绕过** |
| P2 | **交进来的每份持有此刻仍然成立**：被分享来的，分享方与被分享方此刻仍有共同上级（`data.identity-values/v1#S-15`，现读）；**不成立的不交进来** | 组输入的一方 ＋ `capability.asset-transfer`（[G-10](#十一已知缺口)） | 隶属关系解除之后，[分享本该失效](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)，**团队资产却继续出现在求值结果里** |
| P3 | `tenant` 此刻是有效成员，调用方有权以它求值 | 组输入的一方（`capability.organization-governance` v1 的成员资格判定） | 一个已被解除的成员照旧拿到那个组织的生效配置；或一次求值替别人算出了别人的配置 |
| P4 | 出厂那一格的持有**齐全**，且 meta 能力的出厂持有带锁 | 出厂持有的供给方（[G-11](#十一已知缺口)） | 官方件缺一份时[本该是缺陷](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)，本契约看不见；meta 能力被替换 |
| P5 | `workspace` 归会话租户持有、确实挂在这次会话上 | 会话创建（[PF-015 §6.13](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#613-工作区在创建时显式指定不指定就是空)） | C3 只核得到键的租户那一半；挂错了一份，读进来的是别人目录里的东西 |
| P6 | [S-10](#s-10-各类正文契约须供的两条规则) 的两条规则**确定、可重放** | 各类正文契约 | [S-11](#s-11-纯计算) 的「同输入同输出」不成立 |
| P7 | `manifest` 就是那份工作区承载目录里那份文件读出来的 | 读文件的提供者 | 一份伪造的清单往这一格塞进资产 |

---

## 八、装配给的保证 vs 协议须给的保证

### S-29 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 要求领域语义在分布式演化中不变。
**本契约的计算本身不随部署形态改变**；会变的是它的**输入**怎么来——下表逐条点名。

| 保证 | 本版（单机）由谁给 | 跨进程之后谁重新兑现 | 做不到会怎样 |
|---|---|---|---|
| **同输入同输出**（[S-11](#s-11-纯计算)） | 不变 | **不变**——纯计算不需要任何协调 | — |
| **输入是同一时刻的一致读**（P1） | **装配给**：同一存储、一次读事务 | **协议给**：须定义跨服务读快照的一致性级别，并随输入携带快照标记 | 看到新持有与旧锁的混合，**锁截断在效果上被绕过** |
| **分享此刻仍然成立**（P2） | **装配给**：组输入与读上级链在同一存储 | **协议给**：上级链的读一致性须显式定义，陈旧读不得放行（`data.identity-values` v1 第六节同一行） | 关系解除后团队资产仍出现在结果里 |
| **调用方身份与资格已核实**（P3） | **装配给**：本契约的面是能力间内部面，不是终端 API；入口层先核实再调 | **协议给**：跨进程调用须携带授权依据、在接收边界重新验证（`data.identity-values/v1#S-30`） | 谁拿到一个 `TenantId` 就能替那个租户算出他的全部生效配置——**一次信息泄漏** |
| **清单就是目录里那份**（P7） | **装配给**：读文件与读入在同一台宿主机、同一进程 | **协议给**：求值若在另一个节点，清单须带完整性依据传过去，接收方核实 | 一份伪造的清单向工作区那一格塞进资产 |
| **工作区键的租户那一半就是会话的租户**（C3、P5） | 本契约核键；会话创建核归属 | **不变**（键比较）＋ 会话一侧按 P3 同样重验 | — |

**这张表是契约的一部分，不是流程笔记**：装配给的那几行，演化到分布式时**不会自动成立**；缺口见 [G-14](#十一已知缺口)。

---

## 九、交接、缺席与恢复

### S-30 本能力没有在途工作

**两个操作都是纯计算，没有提交、没有在途的多步事务、没有定时器、没有需要按顺序释放的资源。**因此：

- **提供者被撤除或替换**：没有任何事实只活在它的运行实例里，**没有东西要交接**；换一个提供者，同输入仍得同输出（P6 之下）。
- **一次调用被取消或中途失败**：没有外部效果需要收口；调用方拿不到结果，重调一次即可。
- **结果的新鲜度归消费者**：结果只对那一份输入成立。持有、配值、版本选用变了，**何时重求是消费者的事**——
  装配清单[只在它赖以成立的构成变了时失效](../../../../product/PF-004-agent-definition-and-assembly/design.md#67-装配清单的生与失效)，
  reload 一族[按此刻的求值结果重填对应的那一张](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)。

**这不是运气，是 [S-11](#s-11-纯计算) 的直接结果**，并且它是一条可被推翻的承诺：任何让本能力记住东西的修改都会使它失效，那时必须回到本节重写交接责任。

### S-31 unresolved 交到装配手上怎么收场

**`unresolved` 非空的结果不是一份完整的构成。**本契约只负责**不漏记、不静默略去**；挡不挡由消费者决定，但**装配那一侧已有产品原话**：

- [装配缺少必需的东西时明确失败，不产生残缺的装配清单（I-9）](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)；
  [定义引用的能力标识无人提供 ⇒ 明确失败，指出缺哪个](../../../../product/PF-004-agent-definition-and-assembly/flows.md#二分支与异常)。
  **所以装配拿到非空的 `unresolved` 必须失败**，失败信息里的「缺哪个」就是 `unresolved` 的 `capability` 与 `referencedBy`。
- **其余消费者**（注册表按类别重填、设置页）**可以照常用 `assets` 与 `values`**，但**不得**把 `unresolved` 里的能力标识当作有生效资产。

**本契约不把「求不出」收成失败**，理由是它有不止一个消费者：设置页要看「这个租户此刻有哪些资产生效」，
一个 agent definition 引用悬空不该让它什么都看不到。**失败的决定权在唯一需要失败的那一个消费者手上，而它的规则产品已经写了。**

---

## 十、规范表达与验证义务

### S-32 本版选用哪些形式工件

| 性质 | 表达 | 理由 |
|---|---|---|
| 禁用析取、锁截断、官方件下界、工作区滤权、团队资产不出那棵树、权限约束按能力标识跟到替换件 | **Alloy 结构模型**（[`formal/Evaluation.als`](formal/Evaluation.als)） | 这是**输入之间的结构关系**：给定四格持有与锁、禁用、配值，结果里什么能出现、什么不能。在给定规模内找反例正是 Alloy 的用法 |
| 值的合成（设置的覆盖、权限的交集与作者建议） | **规范场景**（[S-33](#s-33-四格齐全的一次求值)、[S-36](#s-36-换了实现设置不跟过去权限的约束跟过去)） | 那是值域上的计算；模型只核「值来自哪一格」，不算值 |
| 读入 | **规范场景**（[S-35](#s-35-清单读入的留痕)） | 一个映射，没有结构约束可反驳 |
| 其余 | 规范场景 [S-34](#s-34-先禁用后替换)、[S-37](#s-37-输入不合法时整体拒绝) | — |

**本版不建 TLA+ 模型**：本能力没有状态、没有交错、没有时间——行为模型会是一个只有一步的空状态机。
**本版不发布 Schema**：输入输出的值类型归 `data.asset-model` v1 与 `data.identity-values` v1，外壳用散文写清（[二](#二概念输入与输出)）；
一旦某份组合契约把这两个操作投影到进程外，线上形状归它（[规格入口](../../../README.md#准入门槛与停止条件)）。

**Alloy 模型不登记为 formal task**：`alloy exec` 的退出码与断言结果无关（找到反例照样退出 0），
[检查器只以退出码判成败](../../../../registry/README.md#当前状态)——登记它会得到一个永远通过的任务。
条款到模型的映射、检查范围、非平凡核对与盖不到的部分在 [`formal/README.md`](formal/README.md)；执行结果在[验证入口](../verification.md)，**不写进本版本目录**。

### 规范场景

**五条场景的输入与期望结果逐字写在 [`examples.md`](examples.md)**；它是本版的规范工件，不是说明材料。
每条场景**必须在同一次演练里比对它列出的每一项**——分开跑证明不了「恰好这些」。

#### S-33 四格齐全的一次求值

[`examples.md` E-1](examples.md#e-1-四格齐全的一次求值)：租户替换出厂的一个 tool、组织锁住一个 skill、工作区自带一个 MCP 接入点并被最严化、根引用了一个没人持有的能力标识。

**必须观察到**：`assets`、`composition`、`values`、`filteredOut`、`unresolved` **五个集合与 E-1 逐项相等**；
其中**租户配在自己那份 MCP 上的凭据没有出现在仓库那份的值里**，**租户对那个 MCP 的执行权限约束却跟到了仓库那份上**（`from = tenant`）；
工作区配的执行权限与连接目标**没有生效且各有一条留痕**。
**同一次演练再跑两支**：同一输入再求一次，五个集合逐项相同（[S-11](#s-11-纯计算)）；
把租户那份 tool 的执行权限改一个值再求，**`assets` 与 `composition` 不变**，只有那一项的 `values` 变（PF-004 I-4）。

#### S-34 先禁用后替换

[`examples.md` E-2](examples.md#e-2-先禁用后替换)：工作区自带一份与租户同标识的 skill，再在清单里把它禁用。

**必须观察到**：生效的是**租户那一份**，`from = tenant`；工作区那份有一条 `disabled` 留痕。
**绝不能观察到**这个能力标识从结果里消失——那就是「先替换再禁用」的次序，[§5.6 点名要挡的](../../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)。

#### S-35 清单读入的留痕

[`examples.md` E-3](examples.md#e-3-一次清单读入)：一份清单，给没列的资产配值、禁用没列的资产、给自带资产的一条配值加 `immutable`。

**必须观察到**：`holdings` 与 `dropped` 与 E-3 逐项相等；**加了 `immutable` 的那一条值读进来了、标记没读进来**；
清单里对权限项与连接目标的配值**读进来了**（本版读入面判不出，[G-5](#十一已知缺口)），并在 E-1 的求值里被 [S-24](#s-24-工作区那一格在第四步只贡献设置) 滤掉。

#### S-36 换了实现，设置不跟过去，权限的约束跟过去

[`examples.md` E-4](examples.md#e-4-换了实现设置不跟过去权限的约束跟过去)：组织为出厂那份 tool 锁住了一项设置与执行权限、另许了一项新实现没有的权限，租户换上自己的实现。

**必须观察到**：三支同跑。
**不锁替换**时，生效的是租户那份；**组织锁住的设置不跟过去**（取新实现的声明默认值），**组织锁住的执行权限跟过去**（`from = organization`），
**新实现没有的那一项取最严值**，组织许的那一档不算数；
**组织把持有也锁上**时，租户那份以 `locked_below` 退出，生效的是出厂那份，组织的设置与权限都照常生效；
**租户在锁住的执行权限上又配了别的档**时，交集为空集——这一支的结果受 [G-16](#十一已知缺口) 影响。
**这条场景是 [S-22](#s-22-第四步设置) 代价那一段与 [S-23](#s-23-第四步权限) 按能力标识取交集的共同证据**：两条规则的分界在这里被看见，而不是在实现里被偶然发现。

#### S-37 输入不合法时整体拒绝

[`examples.md` E-5](examples.md#e-5-不合法的输入)：以 E-1 为底、每份只改一处的八份输入，各违反 [S-7](#s-7-输入的一致性条件) 的一条（C2、C3 两例、C5、C6、C7、C10、C12）。

**必须观察到**：八份都以 `invalidInput` 失败，**没有一份返回任何 `EffectiveAssembly`**，也没有一份返回五个空集合。

---

## 十一、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **组合图成环的收场值与「成环」的范围。**产品原话要求拒绝并指出环在哪，账本只有 `invalidInput` 而成环不是表示层问题；[Skill 与 Tool 互相引用](../../../../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种)是否算环也未定。闭合前本契约对含环输入的结果不作承诺（[S-15](#s-15-evaluate) ⑥） | 主线账本（收场值名，或 `EffectiveAssembly` 上一个与 `unresolved` 同口径的成员）；PF-002 的 owner（范围） | 给出值名与范围；[S-15](#s-15-evaluate) ⑥、[S-20](#s-20-第二步组装) 随之补齐 |
| G-2 | **版本选用的承载。**主线已裁持有上带 `versionSelection`（`current`／`pinned`），但 `data.asset-model` v1 还没有这个成员——它在那份契约的下一版；工作区自带资产没有版本线。**挡住第 2、3 步的实施** | `data.asset-model`（形状）＋ `capability.asset-governance`（写面） | 那份契约发布带 `versionSelection` 的版本；C9 随之落成具体的形状条件，本契约按新坐标补登 |
| G-3 | **各类正文契约的两条规则**（[S-10](#s-10-各类正文契约须供的两条规则)）。五类是不透明壳，两类在起草。**挡住第 2、3 步的实施** | 各类正文契约：`data.tool-definition`、`data.loop-extension`、skill 包 / MCP 接入点 / 斜杠命令三份（本程另起）、agent_definition（PF-004）、connector | 每一类的正文契约有「引用」与「属性项」两节，满足确定、可重放 |
| G-4 | **工作区给别层提供的资产配设置**（[§5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)「设置它压过租户」、[§5.4 锁的例子](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)）**本版没有承载**：持有必须指定一份资产，清单只写能力标识。本版由 C8 与 [S-28](#s-28-配值与禁用只对自带资产生效丢掉的留痕) 的 `unknown_asset` 明确挡下 | `data.asset-model`（持有与清单形状）＋ 主线 | 定出「工作区持有别层资产」在输入里的表示；C8 撤除，[S-22](#s-22-第四步设置) 与 [S-17](#s-17-第一步之一先按禁用滤) 的工作区分句随之生效 |
| G-5 | **读入面判不出权限项与落点类设置项**：`readWorkspaceCarrier` 的输入里没有自带资产的属性声明，`permission_item`、`placement_identity_setting` 本版不产生 | 主线（二选一：给读入操作加一个输入「自带资产的定义」；或从 `DropReason` 删去这两个值、以 [S-24](#s-24-工作区那一格在第四步只贡献设置) 的留痕为唯一一道） | 裁定落成，[S-16](#s-16-readworkspacecarrier)、[S-28](#s-28-配值与禁用只对自带资产生效丢掉的留痕) 随之改 |
| G-6 | **工作区自带资产的记录号怎么铸、定义里所有者与来源填什么、持有的使用权来路与起始时刻填什么**；`source` 怎么解析成资产定义 | `data.asset-model`；各类正文契约（解析） | 那份契约给出规则；本契约 [S-27](#s-27-自带资产变成工作区那一格的持有) 只保留两条要求（确定、不与非工作区记录号相等） |
| G-7 | **两个本契约起的名**：会话格配值的形状（能力标识 ＋ 一条属性配值）、输入成员 `standing`；以及**会话创建参数之外的写面** | 主线账本（两个名）；PF-015 / PF-016 的 owner（写面；文首「起草裁定」第一条） | 账本给名；写面有契约家 |
| G-8 | **[S-25](#s-25-工作区自带资产的权限项一律取最严值) 表外权限项的最严值**（「谁可以用」的取值域主线已裁，不在此列） | PF-002 的 owner | 每类资产的每个权限项都有最严值 |
| G-9 | **允许集合落到一档**：多于一个值时落哪一档、空集算什么。[PF-007 §6.11](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人) 预期求值给出一档，[PF-002 §5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) 给的是集合 | PF-007 / PF-002 的 owner | 规则写进消费它的放行判定契约 |
| G-10 | **组输入时谁现读「分享此刻仍然成立」**（前提 P2） | `capability.asset-transfer` ＋ 组输入的一方（PF-004 装配、注册表重填） | 有契约写明组输入时的现读与它的失败收场 |
| G-11 | **出厂那一格持有的供给方**：官方件齐全、meta 能力带锁（前提 P4），以及「官方件求值后没有东西」这个缺陷的观测点 | 主线指定（候选：`capability.asset-governance` 或 `capability.asset-registry`） | 有契约拥有出厂持有的供给 |
| G-12 | **`data.asset-model` v1 的 catalog 依赖未登记**：那份契约同批并行起草，本分支的 catalog 里还没有它的坐标，登了检查器即报未知坐标 | 对齐波（主线） | 那份契约登记后，按 [S-4](#s-4-依赖方向与被消费的面) 的 `$defs` 名换成它的条款号补登 |
| G-13 | **绑定类设置改不改组合**：斜杠命令的绑定目标、plugin 启用哪些成员是设置，值在第 4 步才求得，而组合在第 2 步 | PF-002 的 owner | 产品写明配成别的值的绑定是否改组合；若改，[S-20](#s-20-第二步组装) 须重写（四步次序会受影响） |
| G-14 | **跨进程的读快照一致性、清单完整性依据**（[S-29](#s-29-装配给的保证-vs-协议须给的保证) 右列） | 架构设计（本版单机不阻断） | 分布式演化启动时给出协议，并作为本契约的新版本发布 |
| G-15 | **「谁可以用」怎么用 `standing` 求**：主线裁了取值域（租户角色加 `self`）与「成员资格进输入」，没裁三件事——`self` 对组织、租户那一格的持有指谁（工作区自带资产上它是挂上工作区的那个租户）；结果是留在 `values` 里的允许集合、还是对这个租户判出的「能用／不能用」；判为不能用时是不是不进 `composition`（那会让权限值影响组装，与 [PF-004 I-4](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) 冲突）。**闭合前 `standing` 只核 C12，不参与任何一项的值**；「谁可以用」一类的项与别的权限项一样求出允许集合 | 主线 | 三件事有裁定；[S-23](#s-23-第四步权限)、[S-25](#s-25-工作区自带资产的权限项一律取最严值) 随之补写 |
| G-16 | **按交集求值与 [PF-002 §5.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用) 的两行字面相抵**：「组织说默认『问一下』，成员可改成『自动』」——不锁的外层配值在交集下是约束，成员改成「自动」求出空集；「组织锁死『问一下』，成员改不了」——成员那条配值若仍在输入里，求出空集而不是「问一下」。**另一种形式化**（供裁定）：只有带 `immutable` 的外层配值是约束，不锁的外层配值与声明默认值一样只是建议，由里到外取第一格落在约束之交里的建议 | 主线；PF-002 的 owner | 二选一落定；若取后者，[S-23](#s-23-第四步权限) 与 E-4 第三支随之改 |
| G-17 | **设置是按资产还是按能力标识取值**：施工简报的追加裁定只裁了权限；它引的来源记录（读数报回的产品缺口 A-G2）另写了「设置项同理按标识覆盖链」。按能力标识沿用设置，租户配在自己那份 MCP 上的[凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)会跟到仓库自带的同名接入点上（[S-22](#s-22-第四步设置)、E-1 第一件必须观察到的事）。**闭合前按资产取值** | 主线 | 裁定落定；若改按能力标识，须同时给出落点与身份类设置怎么不跟过去，[S-22](#s-22-第四步设置)、E-1、E-4 随之改 |

---

## 十二、消费者核对

本节不新增承诺，只走一遍具名消费者的路径，核对本契约给的面是否够用。

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **Agent 装配**（[PF-004 §6.2](../../../../product/PF-004-agent-definition-and-assembly/design.md#62-装配)）：输入是「依据的定义版本 ＋ 当时该作用域的求值结果」 | 装哪些资产、各项设置与权限的值、缺了什么 | `assets` ∩ `composition`、`values`、`unresolved`（[S-31](#s-31-unresolved-交到装配手上怎么收场)） | **够，挡在 G-2、G-3**：第 2、3 步要选用版本与两条规则 |
| **装配时读入工作区**（[PF-004 §4 装配](../../../../product/PF-004-agent-definition-and-assembly/design.md#装配)） | 清单 → 工作区那一格 | [S-16](#s-16-readworkspacecarrier) | **不完全**：工作区给别层资产配设置接不上（G-4）；自带资产的定义要调用方另行解析（G-6） |
| **注册表重填**（reload 一族，[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)） | 此刻每类有哪些生效资产 | `assets`（含 `from`）、`composition` | **够**。**斜杠命令「没有权限就等于不存在」**要那一项权限的值，见下一行 |
| **准入判断**（[PF-007 §6.11](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人) 第 ② 步） | 这个动作的执行权限求值结果：三档之一 | `values` 里那一项的允许集合；换了实现时外层的约束已经交进去（[S-23](#s-23-第四步权限)） | **不够**：从集合到一档的规则缺（G-9） |
| **「谁可以用」的判断**（Skill、斜杠命令、MCP 能不能用） | 这个租户能不能用 | `values` 里那一项的允许集合（租户角色与 `self`）；输入里有 `standing` | **不够**：`self` 指谁、结果落成什么，缺（G-15） |
| **设置页**（[§6.1](../../../../product/PF-002-assets-settings-and-permissions/design.md#61-设置页是长出来的不是画出来的)、[§5.5 替换必须可见](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)） | 某个租户此刻生效的是哪一份、来自哪一格、替换了哪一格、锁在哪一格；每项值来自哪一格 | `EffectiveAsset` 的 `from`／`replaced`／`lockedAt`，`EffectiveValue` 的 `from`／`lockedAt`，`filteredOut` | **够**。「组织的设置」那一页是[属性投影](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection)——组织自己持有的那批与其配值，**不需要求值**，直接读持有 |
| **块 B / 块 C 运行时读设置** | 某项设置此刻的值 | `values` | **够**；新鲜度按 [S-30](#s-30-本能力没有在途工作) 由它们自己管 |

---

## 十三、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记。

**本版的规范工件**：本文件、[`examples.md`](examples.md)、[`formal/Evaluation.als`](formal/Evaluation.als)，映射在 [`formal/README.md`](formal/README.md)。
接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。

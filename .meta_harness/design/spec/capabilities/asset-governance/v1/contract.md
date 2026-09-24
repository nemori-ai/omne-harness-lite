# capability.asset-governance v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-governance, 1)`——
  `family = capabilities`、`topic = asset-governance`、规范路径 `spec/capabilities/asset-governance/v1/contract.md`
- **状态**：`candidate`，2026-09-23 起草，2026-09-24 整批对齐，同日按 PF-003 rev 5 与 PF-002 rev 18 的凭据一条原地修订，同日修订第二轮（主线裁定 R2-7、R2-8、R2-9、R2-16，及追加的 G-24 裁定与资产流转 S-52 的同提交写入）；未评审、未接受、未冻结
- **设计依据**（PF-002 rev 16，其中 MCP 凭据与连接件鉴权绑定「归谁」按 **rev 18** · PF-001 rev 16 · PF-003 **rev 5**）：
  PF-002 rev 17 §5.3 的界与挑选（主线裁定 2026-09-24 R2-9，落进 [S-38](#s-38-assign-配值)、[S-41](#s-41-unlockassignment-解除该项的锁)）与 PF-001 rev 17 §6.7「提升只换所有者，不动任何一份持有」（R2-16，[S-27](#s-27-promotetoorganization-提升到组织)）已吸收；PF-002 rev 17、19、20 与 PF-001 rev 17 的其余改动**本轮没有逐条复核**（已报主线）
  - PF-002：[§二 非目标](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标)、
    [§4 八类资产](../../../../product/PF-002-assets-settings-and-permissions/design.md#八类资产)、
    [身份是「类别 ＋ name」](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)、
    [Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)、
    [Plugin](../../../../product/PF-002-assets-settings-and-permissions/design.md#plugin)、
    [MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)、
    [Connector](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector)（鉴权绑定只在租户那一层配，rev 18）、
    [谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)、
    [§5.2 设置与权限是资产的两种属性](../../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)（含[三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值)、[「组织的设置」是视图](../../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)、[设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)）、
    [§5.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)、
    [§5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)、
    [§6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)、
    [§6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)（含[禁用是逐层配的布尔设置](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)）、
    flows [§1.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#11-给组织加一个资产)～[§1.7](../../../../product/PF-002-assets-settings-and-permissions/flows.md#17-创作一个资产)、
    [§二 分支与异常](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)、
    [§3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)、
    [§3.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值)、
    [§3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)、
    [§四 角色与操作](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)；
    [acceptance](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md)
  - PF-001：[§4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)、
    [§4 拥有、获权、选用](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)、
    [§4 角色](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)、
    [§6.4 隔离](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)、
    [§6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)、
    [§6.7 创作与归属](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)、
    [§6.8 管理结果](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)；
    flows [§3.3 成员关系](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)、
    [§四 角色与操作](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#四角色与操作)
  - PF-003（**rev 5**）：
    [§4 资产复制](../../../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制)、
    [§4 分享](../../../../product/PF-003-asset-transfer-and-sharing/design.md#分享)、
    [§6.4](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)、
    [§6.5](../../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制)、
    [§6.8 能力标识撞车但没有血缘](../../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘)、
    [§6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)、
    [§6.11](../../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保)、
    [flows §1.10](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#110-把我租户级的工具分享给同事)、
    [flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)、
    [flows §四](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#四角色与操作)
  - 全局约束：[SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、
    [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)）：
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`
  - `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`
  - `omne-harness-lite-design-2026-09-15 · data.asset-model · v1`（2026-09-24 整批对齐按条款号补登）
  - `omne-harness-lite-design-2026-09-15 · capability.asset-evaluation · v1`（只取 S-23 的界、挑选与分档，[S-38](#s-38-assign-配值) 的写时守卫据它；2026-09-24 修订第二轮新增，catalog 已登）
  - 各类正文契约的两条规则（属性项推出、组合引用）与斜杠命令的保留区：`data.tool-definition` v1、`data.skill-package` v1、
    `data.slash-command` v1、`data.mcp-endpoint` v1、`data.connector` v1（同上；凭据类项的取值域另引 `data.mcp-endpoint/v1#S-13`、`data.connector/v1#S-12`，2026-09-24 修订补登）
- **主线裁定 2026-09-23，待产品负责人确认**（整批对齐 2026-09-24 落地）：
  租户格以 `organization` 依据持有本组织可用的那一份——拥有的或经分享持有的（账本 S11-G2，原 G-2 闭合）；
  替换是同一能力标识的**另一份**记录，同一份记录不算替换（S11-G19，原 G-19 闭合）；
  所有者一侧对本组织成员租户层的持有只见份数，删除的告知发给各持有租户本人（S11-G18，原 G-18 闭合）；
  组合图成环按「沿谁能组合谁的有向引用回到自身」读（S11-G6，G-6 ① 闭合）；
  新增 `readAsset`／`readVersion`（S11-G9，原 G-9 闭合）；配值带 `since`（S11-G14，原 G-14 闭合）；审计就是事件落成的记录条目（S11-G17，原 G-17 闭合）；
  `hold` 缺省 `current`，读面看得见即不算静默（S11-1）；钉官方件的旧版本允许（S11-5）；
  `unavailable`、`versionNotPublished`、`assignmentNotFound` 与 `version_pinned`／`version_unpinned` 采纳（S11-names）；
  官方件在装配启动时按部署清单登记，不是运行时操作（A-M17）；创建类操作带幂等键——`createDraft` 的 `creationKey` 即是，配值写的过期编辑守卫缺名字，记 G-21（A-M15）；
  组合入口的写入并入资产流转确认的那一次提交，两份契约同一提供者（A-M5、PA-3）；
  分享结束之后被分享方那份持有留着（A-M21）；「资产不存在」指记录被删除（A-M22）；删除之后已发布版本作不可解引用的归档保留，引用方读到「已删除」（A-M25）
- **条款编号**：`S-n`，只在本契约本版本内有效；外部引用写全坐标，如 `capability.asset-governance/v1#S-30`。
  缺口编号 `G-n`，同一作用域

---

## 一、含义与使用范围

### S-1 本契约拥有什么

本契约拥有**资产怎样被做出来、被谁持有、在持有上配了什么值**这三件事的**写面**，以及回答「现在是什么样」的读面：

| # | 拥有的事实 | 正文 |
|---|---|---|
| 1 | **创作与发布**：一份资产记录的草稿、版本线、所有者与作者；租户→组织的提升；删除前告知引用方 | [S-5](#s-5-资产记录与它的两个标识)～[S-7](#s-7-所有者与作者)、[S-24](#s-24-createdraft-创建草稿)～[S-28](#s-28-delete-删除一份资产记录) |
| 2 | **official 登记**：出厂默认层那一份的产生 | [S-8](#s-8-official-记录与出厂默认层的持有)、[S-29](#s-29-registerofficial-登记官方件) |
| 3 | **持有治理**：组织层与租户层的加入、移除、禁用、启用、锁替换、解锁、[版本选用](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection) | [S-9](#s-9-持有本契约写得到的两层与写不到的两层)、[S-11](#s-11-禁用)、[S-30](#s-30-hold-加入持有)～[S-37](#s-37-unpinversion-回到追随当前版本) |
| 4 | **配值治理**：组织层与租户层的配值、清除、加锁、解锁 | [S-10](#s-10-属性配值与两把锁)、[S-38](#s-38-assign-配值)～[S-41](#s-41-unlockassignment-解除该项的锁) |
| 5 | **拒绝规则与角色矩阵**：[PF-002 flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)落在写面上的那几条，与 [flows §四](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作) 逐格落成的「谁能做」 | [S-14](#s-14-可见与不泄漏存在性)～[S-22](#s-22-先告知再移除或删除) |
| 6 | **读面**：某范围持有了什么、一份持有的配值、「组织的设置」这个视图、一份记录的引用方、一份记录与它的已发布版本 | [S-12](#s-12-组织的设置是视图不是对象)、[S-13](#s-13-引用方)、[S-42](#s-42-listholdings-列出某范围的持有)～[S-45](#s-45-listreferrers-列出一份记录的引用方)、[S-64](#s-64-readasset-读一份资产记录)、[S-65](#s-65-readversion-读一个已发布版本) |

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| 资产记录、版本、持有、配值、属性声明**长什么样**（全部数据形状） | `data.asset-model` v1。本契约只写**怎样被写、谁能写、写不了时收什么** |
| **求值**：禁用析取、替换次序与锁截断、属性投影、层级计算、工作区滤权、「这次实际用了什么」 | `capability.asset-evaluation` v1。**本契约写下的锁、禁用与配值，要到求值里才产生效果**；本契约的写时守卫（[S-38](#s-38-assign-配值) 的 `lockedAbove` 等）是**提前拒绝**，不是效果的权威 |
| 复制与分享（复制通知、分享邀请、分享、血缘判定） | `capability.asset-transfer` v1。本契约只给它**落地用的写入**（[S-46](#s-46-组合入口资产流转的确认步骤)）；两份契约由同一提供者提供（PA-3） |
| 八类正文**内部**的校验与语义 | 各类正文契约（`data.tool-definition`、`data.loop-extension`、`data.skill-package`、`data.slash-command`、`data.mcp-endpoint`、`data.connector`，都是候选；`agent_definition` 归 PF-004，[G-5](#十二已知缺口)） |
| 工作区那一级的持有与配值 | **不经本契约写**：它们由承载目录读入，归 `capability.asset-evaluation` v1 的读入面（[UL-workspace](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)） |
| 组织、成员关系、角色、层身份 | `capability.organization-governance` v1（本契约**消费**它两个读面，[S-4](#s-4-依赖方向与被消费的面)） |
| 身份值的形状与隔离义务 | `data.identity-values` v1 |
| 设置页的界面、注册表、运行时装载与卸载 | 交付面、`capability.asset-registry` v1（候选）、PF-004 的契约 |

### S-3 本契约明确不承诺什么

- **不承诺资产的开发与发布流程、市场与上架、计量。**[PF-002 §二](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标)把开发与发布流程列为非目标，
  至今无 topic；本契约的 [S-24](#s-24-createdraft-创建草稿)～[S-26](#s-26-publish-发布) 是**创作与发布这两个动作本身**，不是一条流程。
- **不承诺投递。**事件是通知（[S-48](#s-48-事件都是通知)）；「注册表知道了」「会话看到了」都不挂在事件上。
- **不承诺任何效果可逆。**移除丢掉的配值不能恢复（[PF-002 §6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)：
  要保留就禁用，不要就移除）；提升不能退回（[S-7](#s-7-所有者与作者)）；删除不留可恢复的入口。
- **不停止任何正在运行的工作**（[S-52](#s-52-撤销不发出停止信号)）。
- **不写求值结论。**哪一份生效、某一项取什么值，本契约一概不答。
- **不附 Schema**：操作的输入与返回用散文写清含义，值的形状引 `data.asset-model` v1 与 `data.identity-values` v1
  （[规格入口的口径](../../../README.md#准入门槛与停止条件)：能力契约自己不发布 Schema）。
- **不另立审计记录。**[PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果) 要求「审计保留操作者、范围、对象、变更与依据」：
  **审计就是本契约的事件（[S-48](#s-48-事件都是通知)）落成的[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)**
  （[PF-000 记录条目](../../../../product/PF-000-occurrences-and-record-entries/design.md#记录条目)；主线裁定 2026-09-23，待产品负责人确认；账本 S11-G17，原 G-17 闭合）。
  事件为此带齐那五样（[S-48](#s-48-事件都是通知)）；**条目随写入同一次提交落下**，不靠任何监听者收到事件——事件本身仍只是通知。

### S-4 依赖方向与被消费的面

**依赖方向单向：本契约 → 组织治理、身份值、过期语义、资产数据形状、资产求值（一条）、各类正文契约。**它们都不得反向依赖本契约。

#### 组织治理侧（`capability.organization-governance` v1，三条）

| 被消费的条款 | 用在哪 | 出口怎样映射到本契约 |
|---|---|---|
| [`#S-26` 成员资格判定](../../organization-governance/v1/contract.md#s-26-成员资格判定) | [S-16](#s-16-谁能做角色矩阵落成的四种资格) 的全部资格判定（有效成员、角色） | `effective`（带角色）⇒ 继续判角色；`ineffective` ⇒ **`notPermitted`**；`unavailable` ⇒ **`unavailable`**；`invalidInput` ⇒ 本契约这一侧先做了同一条词法校验（`data.identity-values/v1#S-31`），**到不了**；前提失效时收 `invalidInput` |
| [`#S-22` 读组织](../../organization-governance/v1/contract.md#s-22-读组织) | [S-19](#s-19-判定次序) 第 3 步：目标范围所在的组织在不在 | 返回组织 ⇒ 继续；`organizationDoesNotExist` ⇒ **`scopeNotFound`**；`unavailable` ⇒ **`unavailable`**；`invalidInput` 同上，到不了 |
| [`#S-38` 解除只改成员关系的有效性](../../organization-governance/v1/contract.md#s-38-解除只改成员关系的有效性) | [S-47](#s-47-解除成员不动任何持有)：本契约**承接**「租户级持有不可达但不销毁」那一半 | —（本契约兑现它的前提，不调用它） |

> **简报只点了 `#S-26`，这里多消费 `#S-22`，理由是一条硬要求**：范围不存在、资产不存在、持有不存在要各有一个失败值、不得合并。
> 「组织不存在」只有 `#S-22` 判得出——`#S-26` 对它答 `ineffective`，与「不是成员」同值，**合并了就正是被禁止的那件事**。

#### 身份值侧（`data.identity-values` v1）

**下表每个 `#S-n`／`#CS-n` 的完整坐标是 `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`；catalog 的 `clauses` 以本表为准。**

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-3`](../../../data/identity-values/v1/contract.md#s-3-organizationid) OrganizationId | `owner`、`organization` 参数；[S-15](#s-15-结构性禁止不是权限判定) 的组织相等 |
| [`#S-5`](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等) TenantId 的构成与相等 | [S-15](#s-15-结构性禁止不是权限判定) 的 `crossTenant`：**纯值比较**，不读任何记录 |
| [`#S-6`](../../../data/identity-values/v1/contract.md#s-6-tenantid-无生灭路径) TenantId 无生灭 | [S-7](#s-7-所有者与作者)「作者引用永不悬空」 |
| [`#S-8`](../../../data/identity-values/v1/contract.md#s-8-tenantrole) TenantRole | [S-16](#s-16-谁能做角色矩阵落成的四种资格) 的超级管理员判定 |
| [`#S-10`](../../../data/identity-values/v1/contract.md#s-10-membershipstanding) MembershipStanding 与它的结果两支 | 上一张表里 `effective`／`ineffective`／`unavailable` 三路映射的形状依据；「读不到不是第三个效力值」 |
| [`#S-11`](../../../data/identity-values/v1/contract.md#s-11-scopelayeridentity) ScopeLayerIdentity | 写操作的 `scope` 参数**恰是它**：组织或租户两个变体；出厂与工作区因此**在写面上构造不出来**（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)） |
| [`#S-12`](../../../data/identity-values/v1/contract.md#s-12-缺席与空值都不是身份值)、[`#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)、[`#S-18`](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝) | [S-17](#s-17-缺席时的默认答案) 的「身份参数没有默认值、缺席即拒绝」 |
| [`#S-16`](../../../data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值) 按归属层显式携带 | 每个写操作的 `scope`／`owner` 是带判别式的值，不是两个可空字段 |
| [`#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败) 不可用即明确失败 | [S-18](#s-18-失败值闭合) 的 `unavailable`；各操作的⑧ |
| [`#S-20`](../../../data/identity-values/v1/contract.md#s-20-六条路径同一判定) 六条路径同一判定 | [S-16](#s-16-谁能做角色矩阵落成的四种资格)：读、写、覆盖、删除走同一套资格判定；[S-48](#s-48-事件都是通知) 的订阅 |
| [`#S-21`](../../../data/identity-values/v1/contract.md#s-21-判定依据的构成封闭) 判定依据封闭 | [S-16](#s-16-谁能做角色矩阵落成的四种资格)：资格只看（身份值, 持有记录, 成员资格效力），不看路径、进程或运行实例 |
| [`#S-23`](../../../data/identity-values/v1/contract.md#s-23-不得冒充隔离) 不得冒充隔离 | [S-48](#s-48-事件都是通知)：事件携带的范围不是隔离 |
| [`#S-26`](../../../data/identity-values/v1/contract.md#s-26-成员无效使租户级持有不可达但不销毁) 不可达但不销毁 | [S-47](#s-47-解除成员不动任何持有) |
| [`#S-27`](../../../data/identity-values/v1/contract.md#s-27-每道准入现读) 每道准入现读 | [S-20](#s-20-每道准入现读) |
| [`#S-29`](../../../data/identity-values/v1/contract.md#s-29-层事实只以显式身份值为键) 层事实只以显式身份值为键 | [S-9](#s-9-持有本契约写得到的两层与写不到的两层)：持有与配值以 `scope` 为键，不以 AccountId 或 LoginStateId 为键 |
| [`#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证) 跨边界须重新验证 | [S-50](#s-50-装配给的保证-vs-协议须给的保证) 右列 |
| [`#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) 不透明标识 | `AssetRecordId`、创建键的词法与相等（逐码点） |
| [`#S-32`](../../../data/identity-values/v1/contract.md#s-32-判别式集合闭合) 判别式闭合 | `scope`、`owner`、`versionSelection` 的判别式收到集合外取值 ⇒ `invalidInput` |
| [`#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) 表示层与判定分开 | [S-18](#s-18-失败值闭合) 的 `invalidInput` |
| [`#S-34`](../../../data/identity-values/v1/contract.md#s-34-语义身份与实现地址分开) 身份与地址分开 | `AssetRecordId` 是身份不是存储位置；[S-5](#s-5-资产记录与它的两个标识) 的不回收 |
| [`#CS-1`](../../../data/identity-values/v1/contract.md#cs-1-资产持有的键与属性配值) 持有的键与属性配值 | [S-9](#s-9-持有本契约写得到的两层与写不到的两层)、[S-10](#s-10-属性配值与两把锁)：持有键是（归属层身份, 能力标识），配值不另带租户字段 |
| [`#CS-2`](../../../data/identity-values/v1/contract.md#cs-2-作者与所有者分记) 作者与所有者分记 | [S-7](#s-7-所有者与作者) 的四行表 |
| [`#CS-5`](../../../data/identity-values/v1/contract.md#cs-5-成员无效时不可达但不销毁) 成员无效时不可达但不销毁 | [S-47](#s-47-解除成员不动任何持有) |

#### 过期语义侧（`data.offer-expiry` v1，两条）

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-6` 指向的对象](../../../data/offer-expiry/v1/contract.md#s-6-指向的对象) | 复制通知与分享邀请指向的是**一份资产记录**——本契约是那个对象的持有者 |
| [`#S-19` 规则与读面归属](../../../data/offer-expiry/v1/contract.md#s-19-规则与读面归属) | 那条写明「**资产**：标识不回收、不复用——这条承诺本版无人给」。**本契约是 `AssetRecordId` 的分配方，这条由 [S-5](#s-5-资产记录与它的两个标识) 给**。同一条要求的**存在性读面**归资产流转（[它的 S-7](../../asset-transfer/v1/contract.md#s-7-两类待确认件共用的过期语义)，读本契约的 [S-42](#s-42-listholdings-列出某范围的持有)、[S-43](#s-43-readholding-读一份持有)） |

#### 资产数据形状侧（`data.asset-model` v1）

**下表每个 `#S-n` 的完整坐标是 `omne-harness-lite-design-2026-09-15 · data.asset-model · v1`；catalog 的 `clauses` 以本表为准。**本契约只引它的定义，不复述。

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-1`](../../../data/asset-model/v1/contract.md#s-1-资产类别恰八类) 八类、[`#S-2`](../../../data/asset-model/v1/contract.md#s-2-能力标识名的词法) 能力标识名的词法、[`#S-3`](../../../data/asset-model/v1/contract.md#s-3-能力标识与它的规范串) `CapabilityId` | [S-24](#s-24-createdraft-创建草稿) ③、[S-29](#s-29-registerofficial-登记官方件) ③ 的类别对照；[S-18](#s-18-失败值闭合) `invalidInput` 的能力标识词法 |
| [`#S-4`](../../../data/asset-model/v1/contract.md#s-4-资产记录号) `AssetRecordId` | [S-5](#s-5-资产记录与它的两个标识)：本契约是它的产生方 |
| [`#S-5`](../../../data/asset-model/v1/contract.md#s-5-资产来源) `AssetOrigin` | [S-5](#s-5-资产记录与它的两个标识)：来源产生时定 |
| [`#S-6`](../../../data/asset-model/v1/contract.md#s-6-所有者与作者分记) 所有者与作者分记、[`#S-7`](../../../data/asset-model/v1/contract.md#s-7-所有者至多变一次) 所有者至多变一次 | [S-7](#s-7-所有者与作者)、[S-27](#s-27-promotetoorganization-提升到组织) |
| [`#S-8`](../../../data/asset-model/v1/contract.md#s-8-资产记录) `AssetDefinition`（含 `byAgent`） | [S-24](#s-24-createdraft-创建草稿) ④、[S-64](#s-64-readasset-读一份资产记录) ⑤ |
| [`#S-9`](../../../data/asset-model/v1/contract.md#s-9-版本线) `AssetVersion` 与版本线 | [S-6](#s-6-草稿与版本线)、[S-26](#s-26-publish-发布)、[S-65](#s-65-readversion-读一个已发布版本) |
| [`#S-10`](../../../data/asset-model/v1/contract.md#s-10-八类正文的外壳) `AssetContent` 八个壳、[`#S-11`](../../../data/asset-model/v1/contract.md#s-11-plugin-的成员) plugin 的成员 | [S-24](#s-24-createdraft-创建草稿) ③；[S-13](#s-13-引用方) 的组合引用 |
| [`#S-12`](../../../data/asset-model/v1/contract.md#s-12-属性声明由正文推出) 属性声明由正文推出、[`#S-13`](../../../data/asset-model/v1/contract.md#s-13-设置项类别) 设置项类别 | [S-10](#s-10-属性配值与两把锁)、[S-38](#s-38-assign-配值) 的取值域、[S-44](#s-44-organizationsettingsview-组织的设置视图) 的表单 |
| [`#S-14`](../../../data/asset-model/v1/contract.md#s-14-属性配值) `AttributeAssignment`（含 `since`）、[`#S-15`](../../../data/asset-model/v1/contract.md#s-15-disabled-是保留项名) `disabled`、[`#S-36`](../../../data/asset-model/v1/contract.md#s-36-usableby-是保留项名) `usableBy` | [S-10](#s-10-属性配值与两把锁)、[S-11](#s-11-禁用)、[S-38](#s-38-assign-配值)～[S-41](#s-41-unlockassignment-解除该项的锁) |
| [`#S-16`](../../../data/asset-model/v1/contract.md#s-16-持有范围) `HoldingScope` | [S-9](#s-9-持有本契约写得到的两层与写不到的两层)、[S-42](#s-42-listholdings-列出某范围的持有) |
| [`#S-18`](../../../data/asset-model/v1/contract.md#s-18-资产持有) `AssetHolding`（含 `versionSelection`、`immutable`、`since`；同一格同一能力标识至多一份） | [S-9](#s-9-持有本契约写得到的两层与写不到的两层)、[S-30](#s-30-hold-加入持有) |
| [`#S-19`](../../../data/asset-model/v1/contract.md#s-19-使用权来路) `HoldingBasis` 五支 | [S-9](#s-9-持有本契约写得到的两层与写不到的两层) 的依据表；`shared` 落组织格或租户格（2026-09-24 那份契约随主线裁定 R2-10 放开，[G-23](#十二已知缺口) 闭合） |
| [`#S-20`](../../../data/asset-model/v1/contract.md#s-20-出厂格与工作区格的持有) 出厂格与工作区格的持有 | [S-8](#s-8-official-记录与出厂默认层的持有)、[S-29](#s-29-registerofficial-登记官方件) |
| [`#S-21`](../../../data/asset-model/v1/contract.md#s-21-复制血缘) `CopyLineage`、[`#S-22`](../../../data/asset-model/v1/contract.md#s-22-血缘号与分享号) `SharingId` | [S-46](#s-46-组合入口资产流转的确认步骤) |
| [`#S-23`](../../../data/asset-model/v1/contract.md#s-23-凭据引用) `CredentialRef`（第 2 条：凭据类项的取值域就是它；第 7 条：组织格上的配值由写面拒） | [S-38](#s-38-assign-配值) 认出凭据类项、拒组织层的那一格 |
| [`#S-25`](../../../data/asset-model/v1/contract.md#s-25-规范表示) 规范表示：全部值可序列化、没有进程内身份 | [S-50](#s-50-装配给的保证-vs-协议须给的保证) 末行：本契约的事实可整体导出、导入 |

#### 资产求值侧（`capability.asset-evaluation` v1，一条）

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-23`](../../asset-evaluation/v1/contract.md#s-23-第四步权限) 第四步：权限——界与挑选的分法（带锁的、以及执行权限上恰 `{forbid}` 的是界）、分档的权限、「落在界内」 | [S-38](#s-38-assign-配值) ② 的 `selectionNotSingleTier` 与租户层权限项的 `lockedAbove`；[S-41](#s-41-unlockassignment-解除该项的锁) ②。**写时守卫，效果的权威仍在求值**（[S-2](#s-2-本契约不拥有什么)）；本契约不另写一份定义（主线裁定 2026-09-24 R2-9） |

#### 各类正文契约侧（两条规则与斜杠命令的保留区）

[S-10](#s-10-属性配值与两把锁) 的属性项推出与 [S-13](#s-13-引用方) 的组合引用抽取，按类别取自下面各条；**缺的那几格就是 [G-5](#十二已知缺口)**。

| 类别 | 属性项推出 | 组合引用 |
|---|---|---|
| `tool` | [`data.tool-definition/v1#S-31`](../../../data/tool-definition/v1/contract.md#s-31-属性项的推出规则) | [`#S-16`](../../../data/tool-definition/v1/contract.md#s-16-组合)：`composes.skills` |
| `skill` | [`data.skill-package/v1#S-17`](../../../data/skill-package/v1/contract.md#s-17-属性项投影规则) | [`#S-13`](../../../data/skill-package/v1/contract.md#s-13-组合的工具清单)：`definition.tools` |
| `slash_command` | [`data.slash-command/v1#S-11`](../../../data/slash-command/v1/contract.md#s-11-属性项的推出规则)；保留区 [`#S-3`](../../../data/slash-command/v1/contract.md#s-3-保留区与它唯一的拼法)、[`#S-4`](../../../data/slash-command/v1/contract.md#s-4-保留区只归系统提供的命令型) 用在 [S-24](#s-24-createdraft-创建草稿)、[S-25](#s-25-updatedraft-修订草稿)、[S-29](#s-29-registerofficial-登记官方件) 的 ③ | [`#S-6`](../../../data/slash-command/v1/contract.md#s-6-三种绑定目标)：`skill` 型绑定的那一个能力标识 |
| `mcp` | [`data.mcp-endpoint/v1#S-14`](../../../data/mcp-endpoint/v1/contract.md#s-14-推出规则五类项)、[`#S-15`](../../../data/mcp-endpoint/v1/contract.md#s-15-推出规则的输入正文与动作集)：逐动作项另要一份动作集；凭据那一项的取值域 [`#S-13`](../../../data/mcp-endpoint/v1/contract.md#s-13-凭据配值的取值域) 用在 [S-38](#s-38-assign-配值) ② | 不组合任何资产 |
| `connector` | [`data.connector/v1#S-11`](../../../data/connector/v1/contract.md#s-11-推出规则)；鉴权绑定那一项 [`#S-12`](../../../data/connector/v1/contract.md#s-12-鉴权绑定那一项) 用在 [S-38](#s-38-assign-配值) ② | 不组合任何资产 |
| `loop_extension` | **缺**：`data.loop-extension` v1 只标了哪几个成员是设置、属哪一类，没有推出规则 | 不组合任何资产 |
| `agent_definition` | **缺**（PF-004） | **缺**（PF-004） |
| `plugin` | 它自己的项**缺**（`data.asset-model/v1#S-11` 与它的 G-9） | 成员清单（`data.asset-model/v1#S-11`） |

#### 不消费什么

- **不消费 `data.identity-values/v1#S-13`**（`sameAccountDistinctTenants`）：那是复制前提，消费者是资产流转。
- **不消费组织治理的层身份读面**（`#S-35`）：`scope` 由调用方显式给出，本契约只判它与调用方身份的关系。
- **不消费上级链**：分享边界归资产流转。
- **不消费 `capability.asset-transfer` 的条款**：组合入口（[S-46](#s-46-组合入口资产流转的确认步骤)）是它调本契约；同一次提交的约定引它的 S-18、删除与提升那一次提交里一并写下的分享结束引它的 [S-52](../../asset-transfer/v1/contract.md#s-52-分享方删除资产或所有权易手分享随之结束)，**都只作指路**——那份契约反过来消费本契约的 S-27、S-28，本契约登它就成环；两者同一提供者，提交边界是装配给的（[S-50](#s-50-装配给的保证-vs-协议须给的保证)）。

---

## 二、概念、身份与必要状态

**本节的数据形状一律引 `data.asset-model` v1，不复述。**本节只说本契约对这些对象承担什么写路径义务。

### S-5 资产记录与它的两个标识

一份**资产记录**（无词条）是某一个[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)的**一份具体实现**，
由 `AssetRecordId` 标识。两个标识答两个问题，**不互相替代**：

| 标识 | 回答 | 本契约据它做什么 |
|---|---|---|
| `CapabilityId`（类别 ＋ name） | **是不是同一个东西**——同标识的两份互相替代（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)） | 持有的键（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)）、锁的对象、引用方的判据（[S-13](#s-13-引用方)） |
| `AssetRecordId` | **是哪一份**——同一标识在出厂、组织、租户各可有一份，同一组织里也可以有两份（下一段） | 创作、发布、提升、删除的对象；持有**指向**它 |

**同一所有者之下，同一能力标识可以有多份记录。**[PF-003 §6.8](../../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘)
明写「目标组织里已经有一个能力标识相同的资产……这不是覆盖，这是新增，它就是目标组织里的又一个资产，和对方自己那份并存」。
**哪一份生效由持有决定**：同一范围对同一能力标识至多持有一份（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)，`data.asset-model/v1#S-18`）。
**唯一性只在持有上，不在记录上**：[S-24](#s-24-createdraft-创建草稿) 不因同一所有者下已有同标识的记录而拒。

**`AssetRecordId` 由本契约分配：部署内唯一，不回收、不复用。**删除之后那个标识**永不再指向另一份记录**。
这一条兑现 [`data.offer-expiry/v1#S-19`](../../../data/offer-expiry/v1/contract.md#s-19-规则与读面归属) 点名「本版无人给」的那一项：
被复用的标识会让一份指向已删除资产的邀约在下一次读时「复活」，指到另一份东西上。
它的词法与相等按 [`data.identity-values/v1#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)；
它是身份，不是存储位置（[`#S-34`](../../../data/identity-values/v1/contract.md#s-34-语义身份与实现地址分开)）。

**`origin` 在产生时定、此后没有写路径**（[PF-001 §4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)：「来源也不能靠任意请求自报来冒充」）：[S-24](#s-24-createdraft-创建草稿) 只产生 `customized`，[S-29](#s-29-registerofficial-登记官方件) 只产生 `official`。
[来源不能靠任意请求自报](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-origin--资产来源--asset-origin)——**没有任何操作收一个 `origin` 参数**。

### S-6 草稿与版本线

**自定义件的记录一直带着一份草稿**（无词条）。[S-24](#s-24-createdraft-创建草稿) 产生它，[S-25](#s-25-updatedraft-修订草稿) 整体替换它，
**[S-26](#s-26-publish-发布) 把它此刻的内容定为下一个[版本](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-version--资产版本--asset-version)，草稿本身留着、可以接着改**——
[flows §3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本) 那条「已发布 ──再改──→ 新的草稿」就是接着改。
**草稿不是版本**：它不进求值，复制与分享也不认它。

| 性质 | 由谁兑现 |
|---|---|
| **版本号从 1 起、逐一连续** | [S-26](#s-26-publish-发布)：调用方说出他要发成的那个号，只有「末尾 ＋ 1」写得进去 |
| **已发布版本不可变** | 本契约**没有任何改写或删除某一个版本的写路径**；删除的是整份记录（[S-28](#s-28-delete-删除一份资产记录)） |
| **每份记录各数各的** | 版本号只在一份记录内有意义；复制过来的记录从 1 开始（[PF-003 §6.4](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)） |
| **发布不改变任何持有** | [S-26](#s-26-publish-发布) ④只写这份记录。**持有用的是哪一版**（[版本选用](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection)）记在持有自己的 `versionSelection` 上（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)）：`current` 的此后按新版本求值，`pinned` 的不动——**这是选用本身的含义，不是发布写了持有** |

**official 记录没有草稿**：它的版本只由 [S-29](#s-29-registerofficial-登记官方件) 追加。

### S-7 所有者与作者

[所有者](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-definition-ownership--定义所有权--definition-ownership)与作者（无词条）**分别记录**，
按 [PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) 与
[`data.identity-values/v1#CS-2`](../../../data/identity-values/v1/contract.md#cs-2-作者与所有者分记)：

| 情形 | 所有者 | 作者 | 本契约的写路径 |
|---|---|---|---|
| 成员在**组织范围**创作 | 该组织 | 该租户 | [S-24](#s-24-createdraft-创建草稿)，`owner = {organization}`、`byAgent = false` |
| 成员在**自己的租户范围**创作 | 该租户 | 该租户 | [S-24](#s-24-createdraft-创建草稿)，`owner = {tenant}`、`byAgent = false` |
| **agent 产出** | 它运行所在范围的所有者 | 它运行所在的那个租户，**并标明是 agent 产出** | [S-24](#s-24-createdraft-创建草稿)，`caller` = 它运行所在的那个租户、`owner` = 那个范围、**`byAgent = true`**。`byAgent` 如实由[装配给](#s-50-装配给的保证-vs-协议须给的保证) |
| official | 平台 | 平台，**没有租户** | [S-29](#s-29-registerofficial-登记官方件)；两个字段怎样表示「不是租户」归 `data.asset-model` v1 |

**作者与 `byAgent` 在产生时定、此后没有写路径。**[作者用租户身份标识](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识)：角色变化、成员关系解除都不动它（[`data.identity-values/v1#S-6`](../../../data/identity-values/v1/contract.md#s-6-tenantid-无生灭路径)：TenantId 无生灭，引用永不悬空）。

**所有者恰有一条写路径：[S-27](#s-27-promotetoorganization-提升到组织) 把租户改成它所在的组织。**
[PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)：「提升之后它是组织的，不能再退回租户范围」——
**本契约没有任何把所有者从组织写回租户的路径，也没有把所有者改成另一个组织或另一个租户的路径。**

> **初始所有者由调用方在组织与自己的租户之间指定，不固定为作者的租户**（推导）。
> [PF-001 §6.7 的表](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)第一行就是「成员在**组织范围**创作 ⇒ 所有者是该组织」，
> [flows §四](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)有「在组织范围创作、发布资产」一行，
> 资产流转的首次复制也要求「所有者 = 落进的那一层」——落组织级时是那个组织（[PF-003 §6.5](../../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制)）。
> **只留「先建在租户、再提升」一条路，这三处都要绕一个产品没写过的弯**；产品正文为准。

### S-8 official 记录与出厂默认层的持有

**official 记录只由 [S-29](#s-29-registerofficial-登记官方件) 产生；每个能力标识至多一份 official 记录。**
[S-29](#s-29-registerofficial-登记官方件) 在第一次登记某个能力标识时同时产生**出厂默认层的那份持有**
（`holder = {layer: factory}`、`basis = official`、`versionSelection = current`，**`immutable` 等于部署清单对这个能力标识的 meta 标记**；此后只有 [S-29](#s-29-registerofficial-登记官方件) 按清单改写这一个标记）；[那一层的设置与权限就是官方件自带的那一份](../../../../product/PF-002-assets-settings-and-permissions/design.md#由此得到两个推论)，
所以这份持有上**没有配值**。

[官方件](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-official-asset--官方件--official-asset)身上的五条**结构性禁止**，失败值一律 **`officialImmutable`**：

| # | 禁止 | 依据 | 在哪条操作上兑现 |
|---|---|---|---|
| 1 | **任何一层都不能禁用它** | [PF-001 §4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)：「不可被禁用——组织的超级管理员同样没有这项权力」；[PF-002 §6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见) | [S-32](#s-32-disable-禁用) |
| 2 | **不能被编辑、发布新版本或删除** | [PF-001 §4 角色](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)：超级管理员「不因此取得……官方原件的编辑权」 | [S-25](#s-25-updatedraft-修订草稿)、[S-26](#s-26-publish-发布)、[S-28](#s-28-delete-删除一份资产记录) |
| 3 | **不能被提升** | 它的所有者是平台，不是某个租户 | [S-27](#s-27-promotetoorganization-提升到组织) |
| 4 | **出厂默认层的那份持有不能被移除** | [PF-001 §6.1](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)：「任何层不得清空」 | **结构兑现**：写操作的 `scope` 是 `ScopeLayerIdentity`，出厂层**在写面上构造不出来**（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)） |
| 5 | **meta 能力不能被替换** | [PF-002 §5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级) 的第一个例外；[UL-meta-capability](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability)「不可禁用、不可替换」 | [S-30](#s-30-hold-加入持有)：以出厂层带锁的能力标识持有**另一份**记录 ⇒ 拒绝。**出厂层只对 meta 能力带锁**，锁由 [S-29](#s-29-registerofficial-登记官方件) 按部署清单的 meta 标记写（[`data.asset-model/v1#S-20`](../../../data/asset-model/v1/contract.md#s-20-出厂格与工作区格的持有)；原 G-11 闭合） |

**「official 不可移除」不等于「组织不能不持有它」。**组织或租户为了配值或锁替换而持有一份官方件（`basis = official`），
[S-31](#s-31-unhold-移除持有) 照常能把**这一层的**那份持有移掉——出厂层那份还在，[那个能力标识下仍然有东西](../../../../product/PF-002-assets-settings-and-permissions/flows.md#13-用自定义资产替换-official)。

**替换 official 不是一次对官方件的写入**：它是在组织或租户层持有一份同标识的自定义件（[S-30](#s-30-hold-加入持有)），
[PF-001 §4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)：「替代不是移除」。

### S-9 持有：本契约写得到的两层与写不到的两层

[资产持有](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)的形状是 `data.asset-model` v1 的 `AssetHolding`；
它的 `holder` 是 `HoldingScope` 的四格之一。**本契约对四格的写路径不对称，逐格写明**：

| 格 | 谁写 | 为什么 |
|---|---|---|
| 出厂默认 | **只有 [S-29](#s-29-registerofficial-登记官方件)** 写，且只加不删 | [S-8](#s-8-official-记录与出厂默认层的持有) 第 4 条 |
| **组织** | [S-30](#s-30-hold-加入持有)～[S-41](#s-41-unlockassignment-解除该项的锁) | 本契约的写面 |
| **租户** | [S-30](#s-30-hold-加入持有)～[S-41](#s-41-unlockassignment-解除该项的锁) | 本契约的写面 |
| 工作区 | **不经本契约写** | 它的持有与配值[来自承载目录里的文件，装配时读入](../../../../product/PF-002-assets-settings-and-permissions/design.md#挂上之后它的内容在装配时自动进来)，[「没有人在这一级操作配值」](../../../../product/PF-002-assets-settings-and-permissions/flows.md#12-配置一个资产的设置或权限) |

**写操作的 `scope` 参数因此是 `ScopeLayerIdentity`（`data.identity-values/v1#S-11`），不是 `HoldingScope`**：
那个类型只有组织与租户两个变体，**出厂与工作区在写面上根本构造不出来**。读面（[S-42](#s-42-listholdings-列出某范围的持有)、[S-43](#s-43-readholding-读一份持有)）另收出厂那一格。

**同一范围对同一能力标识至多一份持有**（`data.asset-model/v1#S-18`）。本契约在 [S-30](#s-30-hold-加入持有) 兑现它（`alreadyHeld`），
存储上的唯一约束是[装配给](#s-50-装配给的保证-vs-协议须给的保证)的。持有的键因此是（`scope`, `CapabilityId`），
[`data.identity-values/v1#CS-1`](../../../data/identity-values/v1/contract.md#cs-1-资产持有的键与属性配值)；**写路径以调用方显式给的 `scope` 为键**，不以 AccountId、LoginStateId 为键（[`#S-29`](../../../data/identity-values/v1/contract.md#s-29-层事实只以显式身份值为键)）。

**`basis` 回答使用权从哪来**（[拥有、获权、选用](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)）。
**调用方不给 `basis`**：[S-30](#s-30-hold-加入持有) 按这一格与记录此刻的事实**自动定**，按下表自上而下取第一个成立的：

| `basis` | 何时成立 | 谁写 |
|---|---|---|
| `official` | 记录是 official | [S-30](#s-30-hold-加入持有)；出厂层那一份由 [S-29](#s-29-registerofficial-登记官方件) |
| `owned` | 记录的所有者**就是**这一格（组织层 ↔ 该组织；租户层 ↔ 该租户） | [S-30](#s-30-hold-加入持有) |
| `organization` | 这一格是租户层 `T`，而记录**归 `T` 所在的组织所有**，或 **`T` 所在组织的组织层持有同一份记录**（含经分享持有的那一份；[`data.asset-model/v1#S-19`](../../../data/asset-model/v1/contract.md#s-19-使用权来路)，主线裁定 S11-G2） | [S-30](#s-30-hold-加入持有)；以及 [S-27](#s-27-promotetoorganization-提升到组织) 在所有者改为组织时把 `T` 自己那份的依据由 `owned` 重算成它（**不是一次持有变更**） |
| `shared{sharing}` | **本契约不核对**：只经[组合入口](#s-46-组合入口资产流转的确认步骤)由资产流转的确认步骤（本人型分享：发起步骤）带着 `sharing` 写入，分享成不成立由那一侧在它自己的提交里判。**这一格是被分享方那一层**：组织—组织、个人—个人的分享落在**组织格**；[组织内分享](../../../../product/PF-003-asset-transfer-and-sharing/design.md#分享)与本人型分享落在被分享的那个**租户格**——那个租户的使用权来自分享，不来自他的组织（[PF-003 flows §1.10](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#110-把我租户级的工具分享给同事)）。`data.asset-model/v1#S-19` 的 `shared` 支落组织格或租户格（主线裁定 2026-09-24 R2-10；原 [G-23](#十二已知缺口) 闭合） | 组合入口；直接入口够不着（[装配给](#s-50-装配给的保证-vs-协议须给的保证)） |
| `carrier` | 工作区从承载目录提供 | **不经本契约写** |

**一个都不成立 ⇒ `notOwner`**：这一格对这份记录没有任何使用权依据。

**`organization` 的第二种来路靠组织层那一份持有。**组织层移除它（[S-31](#s-31-unhold-移除持有)），或那段分享不再生效（`capability.asset-transfer`），
成员租户层那份就失去依据——**本契约不删它**：组织层的写入碰不到成员的租户层（[S-15](#s-15-结构性禁止不是权限判定)）。它留在原处，
读到它的一方按 [`data.asset-model/v1#S-19`](../../../data/asset-model/v1/contract.md#s-19-使用权来路) 当作这一格没有持有；成员自己能 [S-31](#s-31-unhold-移除持有) 它；组织层再持有同一份，它的依据就又成立。
**被分享方那一层（组织格或租户格）那份 `shared` 持有在分享结束之后同样留着**，配值随它留（主线裁定 2026-09-23，待产品负责人确认；账本 A-M21）；可不可用由求值按分享的判据定。

**每份持有带一个[版本选用](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection)** `versionSelection`：
`current`（追随所指记录此刻最新的已发布版本）或 `pinned`（钉在某个已发布版本号上）。
**`shared` 的持有恒为 `current`**：[被分享方选用的是「分享方当前发布的那一版」这个动态目标，不提供钉在某个版本上](../../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保)——
钉住就是要一份 fork，那个动作叫复制。其余依据的持有都可以钉：[选用哪个版本是消费方的决定](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)。
写路径是 [S-30](#s-30-hold-加入持有)（加入时给定）、[S-36](#s-36-pinversion-钉住一个版本)、[S-37](#s-37-unpinversion-回到追随当前版本)。

**plugin 的成员不各自成为持有。**[内含成员随 plugin 一并持有、不取得独立生命周期](../../../../product/PF-002-assets-settings-and-permissions/design.md#plugin)：
加入一个 plugin 只写一份持有；[单独卸载其中一个](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)在本契约里**没有对象可卸**（[S-31](#s-31-unhold-移除持有) 收 `holdingNotFound`）。

### S-10 属性配值与两把锁

[属性配值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)挂在持有上（`data.asset-model` v1 的 `AttributeAssignment`），
**不脱离持有存在**：移除持有，它上面的配值一并消失；禁用不动它们（[flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)）。
配值没有自己的租户字段——它的归属就是宿主持有的 `holder`。

[不可覆盖标记](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)在本契约里是**两把锁**，落在不同的地方：

| 锁 | 落在哪 | 锁什么 | 写路径 |
|---|---|---|---|
| **替换锁** | 持有本身的 `immutable` | 「这一层以下不许再替换这个能力标识」（[§5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)）；**不问被锁的是官方件还是自定义件** | [S-34](#s-34-lockreplacement-加替换锁)／[S-35](#s-35-unlockreplacement-解除替换锁) |
| **项锁** | 这一层某一项配值的 `immutable` | 「这一项必须这样，下层改不了」（[§5.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)） | [S-40](#s-40-lockassignment-锁住该项)／[S-41](#s-41-unlockassignment-解除该项的锁) |

**两把锁都「解锁不回溯」**（[flows §3.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值)）：
解锁只影响此后的求值与此后的写入，**不改动解锁之前写下的任何东西**；上锁也**不删、不改下层已经写下的东西**——
那些值与持有留在原处，求值时被截断（归 `capability.asset-evaluation` v1）。

**配值的取值域来自资产正文推出的属性声明**（`AttributeDeclaration`；[三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值)「资产定形状」）。
声明**不存在记录上**，由各类正文契约给出的**属性项投影规则**从正文推出（逐类的出处见 [S-4](#s-4-依赖方向与被消费的面) 的正文契约侧），再加 `data.asset-model` 保留的两项——`disabled`（[`#S-15`](../../../data/asset-model/v1/contract.md#s-15-disabled-是保留项名)，只经 [S-32](#s-32-disable-禁用)／[S-33](#s-33-enable-启用) 写）与 `usableBy`（[`#S-36`](../../../data/asset-model/v1/contract.md#s-36-usableby-是保留项名)，八类都有，经 [S-38](#s-38-assign-配值) 照常配）；本契约写入前按它校验（[S-38](#s-38-assign-配值)）：

- 设置项：值过该项声明的 `domain.schema`；
- 权限项：值是 `PermissionValue`，其允许集合是该项枚举的**子集**（[「选择就是收窄到只剩一个」](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#两轮合成作用对象不同)）；**分档的权限上，一条挑选恰是一档**，租户层的挑选落在组织那一层的界内；**随值加锁写下的是一条界，可以多档或空集**（[S-38](#s-38-assign-配值) 的 `immutable`；主线裁定 2026-09-24 R2-9 与 G-24 裁定）；
- **拿哪一版正文推**：**这份持有选用的那一版**——`current` 取所指记录此刻最新的已发布版本，`pinned` 取那个号。写时校验与求值因此对着同一版正文。

**配值可以比它的项活得久**：新版本删掉了某一项（或 [S-36](#s-36-pinversion-钉住一个版本) 钉到了没有这一项的旧版本），已配的值留着、不参与求值（[PF-003 §6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)）。
本契约**不因为发布了新版本、或改了版本选用就清理配值**。

### S-11 禁用

[资产禁用](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)是每份持有上**名为 `disabled` 的布尔设置项**
（`data.asset-model` v1 定它为保留项名）。本契约对它承担三件事：

1. **只有 [S-32](#s-32-disable-禁用)／[S-33](#s-33-enable-启用) 写它。**通用的配值面（[S-38](#s-38-assign-配值)～[S-41](#s-41-unlockassignment-解除该项的锁)）收到 `item = disabled` 一律 `invalidInput`——
   同一个事实只有一条写路径。
2. **每层只写得到自己那一个真。**[PF-002 §6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)：「本层改回假，只是去掉本层自己那一个真」。
   本契约没有任何一条写路径能改另一层的 `disabled`（[S-15](#s-15-结构性禁止不是权限判定) 的 `crossTenant`）。
3. **它不需要项锁。**析取合成「等价于布尔设置 ＋ 真即 immutable」（[§5.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)）；[S-40](#s-40-lockassignment-锁住该项) 对它收 `invalidInput`——
   **不另立一个失败值**：保留项走错了面，与上一条是同一种收场，一个值。
4. **官方件的持有上没有它的真值**：[S-32](#s-32-disable-禁用) 对官方件收 `officialImmutable`，出厂层那一份不带配值，其余写面碰不到它。

「上层为真、本层启用之后仍不可见」是求值的结论，**不是 [S-33](#s-33-enable-启用) 的失败**。

### S-12 「组织的设置」是视图，不是对象

[PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)：系统里不存在「组织设置」这个对象，
它是[该组织持有的资产集合上的投影](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection)。本契约据此：

- **没有任何存储对象叫「组织设置」**，也没有它的写路径。[S-44](#s-44-organizationsettingsview-组织的设置视图) 每次调用**现读现算**，结果不落盘；
- **设置页是长出来的**（[§6.1](../../../../product/PF-002-assets-settings-and-permissions/design.md#61-设置页是长出来的不是画出来的)）：加入一份持有，下一次读视图就多一块表单；
  移除，下一次读就少一块——**本契约不需要任何「登记表单」的动作**。

### S-13 引用方

一份资产记录的**引用方**（无词条）是**移除或删除它会影响到的那些东西**，恰两类：

| 类 | 是什么 | 为什么算 |
|---|---|---|
| **持有方** | 每一份 `asset` 指向这份记录的持有（`holder` ＋ `basis`） | 删了记录，这些持有就指向一份不存在的东西 |
| **组合引用方** | 在**列入的范围**里，被该范围持有、且[组合引用](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)了这份记录的**能力标识**的每一份资产（这份记录是 plugin 时，也算引用了它任一成员能力标识的那些） | [引用指向能力标识](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)：移走这一层的提供者，它们在这一层就换了一个提供者或没有提供者 |

**组合引用怎样从正文取出来，归各类正文契约**（逐类的出处见 [S-4](#s-4-依赖方向与被消费的面) 的正文契约侧）：tool 的 `composes.skills`、skill 的 `definition.tools`、slash_command 的 `skill` 型绑定、plugin 的成员清单；
[PF-002「谁能组合谁」](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)写死**不组合任何资产**的三类（MCP、Connector、Loop Extension）**不必抽取**。
**agent_definition 的规则缺席**是 [G-5](#十二已知缺口)；**缺席时引用方求不出，以 `unavailable` 失败，不返回一份少了几项的清单**。

**只在调用方看得见的范围里求**：调用方治理的范围（它是管理者的组织层或它自己的租户层），
外加——**当调用方是这份记录所有者一侧时**——经分享持有它的其他层：被分享方是组织的，列出那个组织；被分享方是租户的（[组织内分享与本人型分享](../../../../product/PF-003-asset-transfer-and-sharing/design.md#分享)），列出那个租户。
都只列层与 `basis`，**不列它们里面的组合引用方**。分享方本来就看得见自己分享给了谁（`capability.asset-transfer` 的分享记录），列出它们不泄漏什么；
[分享方删除之前要先告知受影响的一方](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)，漏掉租户格的被分享方就告知不到他（推导）。
[超级管理员管不到成员租户级的私有部分](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)，所以**除上面那一类以外**，别人的租户层**不列**。
**本组织成员租户层的持有方对所有者一侧只给份数**（主线裁定 2026-09-23，待产品负责人确认；账本 S11-G18，原 G-18 闭合）：
记录归组织 `O` 所有时，`O` 的成员以 `organization` 依据持有它的那些租户层，给所有者一侧的只是「**租户层持有 N 份**」，**不给是哪些租户**；
份数进删除的确认比对（[S-22](#s-22-先告知再移除或删除)），**删除的告知发给各持有租户本人**（[S-48](#s-48-事件都是通知) 的 `AssetDeleted`）。
**别的组织里成员的租户层不计份数**：那个组织以分享持有它的那一层已经列出，份数再跨组织给，就是把另一个组织的内部透露给所有者（推导）。
本契约不为了告知而泄漏成员租户级的持有。

**资产之外的引用方不在其列**：[PF-001 acceptance](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#一可观察场景) 点名的「被日程引用」，本版无 owner（[G-13](#十二已知缺口)）。

---

## 三、贯穿全部操作的规矩

### S-14 可见与不泄漏存在性

**按 `AssetRecordId` 定位的操作**（[S-25](#s-25-updatedraft-修订草稿)～[S-28](#s-28-delete-删除一份资产记录)、[S-30](#s-30-hold-加入持有)、[S-45](#s-45-listreferrers-列出一份记录的引用方)、[S-64](#s-64-readasset-读一份资产记录)、[S-65](#s-65-readversion-读一个已发布版本)），
对调用方**看不见**的记录返回 **`assetNotFound`**，与记录真的不存在**逐字相同**。一份记录对调用方 `T = (O, a)` **可见**，当且仅当：

- 它是 official；或
- 它的所有者是 `{tenant: T}` 或 `{organization: O}`；或
- 它被组织 `O` 的那一层、或 `T` 那一层持有着。

**理由与[组织治理的同名规矩](../../organization-governance/v1/contract.md#s-24-撤回邀请)同一条**：`AssetRecordId` 不透明、猜不出，
但一旦拿到一个，`notOwner` 与 `assetNotFound` 的差别就是一次存在性泄漏——「有这么一份，只是不归你」。
**成员的租户级私有记录因此对同组织的任何其他人（含超级管理员）都不可见。**

**按范围定位的操作**（持有与配值那一族、读面）**不适用本条**：调用方给的是自己要碰的范围，没有存在性可泄漏，越界由 [S-15](#s-15-结构性禁止不是权限判定) 结构性拒绝。

### S-15 结构性禁止不是权限判定

四个失败值**与调用方的角色无关**，照[组织治理的分法](../../organization-governance/v1/contract.md#s-15-结构性禁止不是权限判定)写成失败集合里的具名项，**不写成授权判定**：

| 值 | 判据 | 为什么不是权限判定 |
|---|---|---|
| **`crossTenant`** | 目标范围（`scope`、`owner`、`organization`）**不是调用方自己的租户，也不是调用方所在的组织**；**租户层只能是调用方自己**。**纯值比较**（[`data.identity-values/v1#S-5`](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等)），不读任何记录 | [超级管理员的作用域是该组织](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#角色)，**管不到成员租户级的私有部分**——那不是「超管权限不够」，是那一层根本不在他的作用域里；换任何角色答案都一样 |
| **`officialImmutable`** | [S-8](#s-8-official-记录与出厂默认层的持有) 的五条 | [「这不是一条可以调整的权限设置，是结构性的」](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized) |
| **`layerNotAllowed`** | **这一层不收这一项**：组织层写凭据类项（取值域为 `CredentialRef` 的项，[S-38](#s-38-assign-配值) ②）——[组织那一层不持有 MCP 凭据，也不配连接件的鉴权绑定](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)（PF-002 rev 18） | 超管同样被拒：那两项[只在租户那一层配、每个成员自己取](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)，换任何角色答案都一样。值名与资产流转「这一层不收」同名（主线裁定 2026-09-24 R2-8：同类失败同名；此前沿用 `notPermitted` 作废） |
| **`notOwner`** | 调用方（或要持有它的那个范围）对这份记录**没有它所需的那种权利依据**：改、发、删、提升要求所有者是调用方本人或调用方所在的组织；持有要求这一格与记录之间有一种依据成立（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)）；钉版本要求依据不是 `shared` | 由所有权与使用权依据的事实决定。**被分享方不能改它**（[PF-003 §6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)）——被分享方的超级管理员同样改不了 |

**角色不够是另一件事，收 `notPermitted`**：普通成员去写组织层、去组织范围创作。
**界面据读面就能在不发起操作的前提下得出同一结论**：[S-42](#s-42-listholdings-列出某范围的持有)～[S-44](#s-44-organizationsettingsview-组织的设置视图) 返回的持有带着 `basis` 与记录来源，
官方件、被分享来的、上层已锁的都看得出。**读面说不能，操作就必须拒；操作侧的失败值是兜底。**

### S-16 谁能做：角色矩阵落成的四种资格

[PF-002 flows §四](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)与
[PF-001 flows §四](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#四角色与操作)逐格落成下面四种资格。
**每一种都以 [`capability.organization-governance/v1#S-26`](../../organization-governance/v1/contract.md#s-26-成员资格判定) 现读判定**（[S-20](#s-20-每道准入现读)），
**依据只有（身份值, 持有记录, 成员资格效力）三样**（[`data.identity-values/v1#S-21`](../../../data/identity-values/v1/contract.md#s-21-判定依据的构成封闭)），
**读、写、覆盖、删除走同一套判定**（[`#S-20`](../../../data/identity-values/v1/contract.md#s-20-六条路径同一判定)）：

| 资格 | 谁有 | 出处 |
|---|---|---|
| **范围的管理者** | 组织层 `O`：`O` 的**有效超级管理员**。租户层 `T`：**`T` 本人**，此刻有效，任一角色 | 原话：PF-002 flows §3.1「组织层是超级管理员，租户层是本人」；flows §四「给组织加入／移除资产」「配置组织级的设置与权限」「把组织级的值标为 immutable」三行只有超管可；PF-001 flows §四「管理组织的设置、权限、资产」「管理自己的租户级设置与资产」 |
| **组织范围创作权** | 组织 `O` 的**有效超级管理员**。普通成员「**有条件：按被授予的权限**」——**授予机制本版无定义**（[G-3](#十二已知缺口)），**在它闭合前普通成员一律 `notPermitted`** | 原话：PF-002 flows §四「在组织范围创作、发布资产」；PF-001 flows §四「在组织范围创作资产」 |
| **租户范围创作权** | **`T` 本人**，此刻有效，任一角色 | 推导：[PF-001 §6.7 表第 2 行](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)「成员在自己的租户范围创作 ⇒ 所有者是该租户」＋ PF-001 flows §四「管理自己的租户级设置与资产：可／可」 |
| **读者** | 出厂层：**任何此刻有效的调用方**。组织层 `O`：`O` 的**有效成员，任一角色**。租户层 `T`：**`T` 本人** | 出厂与组织层是推导：[成员要知道自己少了什么、能不能去申请，看的是设置页](../../../../product/PF-002-assets-settings-and-permissions/design.md#但对-agent-来说两者一样都不可见)；flows §四「覆盖组织级的值：看组织有没有加锁」要求成员**看得见**锁。租户层是原话：超管「管不到成员租户级的私有部分」 |

**「在自己个人组织里做上述一切：可」不需要另一条资格**：个人组织唯一的成员就是它的超级管理员
（[`capability.organization-governance/v1`](../../organization-governance/v1/contract.md#s-20-创建个人组织) 建个人组织时一并建立），上面四条已经覆盖它。

**非成员**：调用方身份所在的组织与目标范围不同 ⇒ `crossTenant`（结构性，[S-15](#s-15-结构性禁止不是权限判定)）；
调用方身份此刻 `ineffective` ⇒ `notPermitted`。

**这张表之外的组合回产品正文**（[flows §四](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)末句），本契约不自行补一条。
逐操作的「谁能做」与每格的出处标注在 [`examples.md` 第四节](examples.md#四角色矩阵--操作)。

### S-17 缺席时的默认答案

**一律拒绝或明确失败，不放行、不空集、不回退。**

**身份参数没有默认值**：`caller`、`owner`、`scope`、`organization`、`asset`、`capability`、`item`
缺席、为空或不合形状 ⇒ `invalidInput`；不得由「当前租户身份」、环境、进程上下文补齐
（[`data.identity-values/v1#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)、[`#S-18`](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝)）。
[`#S-12`](../../../data/identity-values/v1/contract.md#s-12-缺席与空值都不是身份值) 的「合法缺席」只在**记录里**出现（official 的作者），**不在任何一个输入位置上**。

**非身份参数，逐一列出，穷举**：

| 参数 | 在哪 | 缺席时 |
|---|---|---|
| `acknowledged`（调用方确认过的引用方集合） | [S-28](#s-28-delete-删除一份资产记录)、[S-31](#s-31-unhold-移除持有) | **空集**——「我什么都没确认」。有任何引用方即 `hasReferrers`，所以这个默认**只会拒，不会放** |
| `creationKey` | [S-24](#s-24-createdraft-创建草稿) | **本次不去重**。它不是一个值被补上，是「不带键」这种取值 |
| `lineage`、`sharing` | [S-24](#s-24-createdraft-创建草稿)、[S-30](#s-30-hold-加入持有) | **不是复制落地、不是分享确认**（直接入口永远缺席，[S-46](#s-46-组合入口资产流转的确认步骤)） |
| `versionSelection` | [S-30](#s-30-hold-加入持有) | **`current`**。**这一格是主线裁定**（账本 S11-1），不是起草者补的初值；它与「缺席即拒绝」不冲突的理由与 `creationKey` 同型：不带它是「不钉版本」这种取值，不是一个身份被补上。它与「不静默替换已选用的版本」的关系见 [S-30](#s-30-hold-加入持有) 末段 |
| `byAgent` | [S-24](#s-24-createdraft-创建草稿) | **必填，缺席即 `invalidInput`**。**不得默认为 `false`**——那正是把 agent 产出记成人产出 |
| `meta` | [S-29](#s-29-registerofficial-登记官方件) | **必填，缺席即 `invalidInput`**。**不得默认为 `false`**——那正是让一个 meta 能力可被替换 |
| `immutable`（随值加锁） | [S-38](#s-38-assign-配值) | **不加锁**：写下的是一条不带锁的配值——[PF-002 两步流程](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值)的第一步（先配值、再可选地标 `immutable`）。它是「不随值加锁」这种取值，不是补上一个身份，也不会放行任何本该拒的写入（主线裁定 2026-09-24，G-24） |
| `basedOn`、`expected`、`number`、`value`、`content` | [S-25](#s-25-updatedraft-修订草稿)、[S-26](#s-26-publish-发布)、[S-36](#s-36-pinversion-钉住一个版本)／[S-65](#s-65-readversion-读一个已发布版本)、[S-38](#s-38-assign-配值)、[S-24](#s-24-createdraft-创建草稿)／[S-25](#s-25-updatedraft-修订草稿)／[S-29](#s-29-registerofficial-登记官方件) | **必填，缺席即 `invalidInput`**——它们各自是那次写入的实质，缺了就没有可写的东西 |

**判不出来与判为拒绝永远是两个值**：依据读不到 ⇒ `unavailable`（[S-18](#s-18-失败值闭合)），不得折成 `notPermitted`、`…NotFound` 或空列表。

### S-18 失败值（闭合）

**本契约全部操作的失败值恰是下面十九个，没有「其他」。**每个操作的⑥是它的子集。

| 值 | 类 | 含义 | 与谁分开、为什么 |
|---|---|---|---|
| `invalidInput` | 表示层 | 输入不合形状：缺席、类型不对、判别式在集合外、不透明标识不合词法、能力标识不合 `data.asset-model/v1#S-2` 的词法、`versionSelection` 不合形状（`pinned` 的号不是正整数）、`content` 过不了它那一类正文的校验、`content` 的类别与能力标识不符、写面收到出厂或工作区的 `scope`、配值面与项锁收到保留项名 `disabled`、斜杠命令违反保留区规则（[`data.slash-command/v1#S-4`](../../../data/slash-command/v1/contract.md#s-4-保留区只归系统提供的命令型)）、`registerOfficial` 缺 `meta` | [`data.identity-values/v1#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开)：**不是判定结果**，不表示对象不存在或主体无资格；重试一万次也不会成功，所以不能收成 `unavailable` |
| `crossTenant` | 结构性 | [S-15](#s-15-结构性禁止不是权限判定) | 与 `notPermitted` 分开：它与角色无关 |
| `scopeNotFound` | 判定 | 目标范围所在的组织不存在（[`organization-governance/v1#S-22`](../../organization-governance/v1/contract.md#s-22-读组织) 的 `organizationDoesNotExist`） | 与 `notPermitted` 分开：不是「你不是成员」，是那个范围不在了 |
| `notPermitted` | 授权 | 调用方此刻 `ineffective`，或角色不够（[S-16](#s-16-谁能做角色矩阵落成的四种资格)） | 不区分「不是成员」与「是成员但不是超管」——两者都是成立的授权拒绝 |
| `assetNotFound` | 判定 | 记录不存在，或对调用方不可见（[S-14](#s-14-可见与不泄漏存在性)） | 与 `holdingNotFound` 分开：记录在不在，与某个范围持不持有它，是两件事 |
| `holdingNotFound` | 判定 | 该范围没有该能力标识的持有（含：想单独卸载 plugin 的一个成员） | 与 `assetNotFound` 分开，同上 |
| `assignmentNotFound` | 判定 | 这一层该持有上**该项没有配值**，没有值可锁（仅 [S-40](#s-40-lockassignment-锁住该项)） | 主线裁定采纳（账本 S11-names）。与 `holdingNotFound` 分开：持有在，只是这一级对这一项「没意见」（[flows §3.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值) 的「未配」没有「加锁」这条边） |
| `alreadyHeld` | 判定 | 该范围已持有该能力标识的**另一份**记录；或同一份记录，但依据或版本选用与这次不同 | 完全相同的重放不是失败（[S-30](#s-30-hold-加入持有) ⑦）；要换版本走 [S-36](#s-36-pinversion-钉住一个版本)／[S-37](#s-37-unpinversion-回到追随当前版本) |
| `lockedAbove` | 判定 | 上层锁住了：租户层要持有组织层已加替换锁的能力标识的**另一份**记录、以 `pinned` 持有它、或要钉它的版本；或租户层要配组织层已加项锁的**设置项**；或租户层给一项**权限**配的值（挑选或界，带不带锁）落在组织那一层给的**界外**——界是带锁的配值，**以及执行权限上配成恰 `{forbid}` 的配值，锁不锁都是**（[S-38](#s-38-assign-配值)；主线裁定 2026-09-24 R2-9） | [flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)：「拒绝，说明是组织锁定的——让成员知道这不是系统故障，也不是他权限不够可以去申请」。**所以它不能是 `notPermitted`** |
| `lockedHere` | 判定 | 本层这一项已上锁，**不带锁的**改值或清除之前先解锁；随值加锁（[S-38](#s-38-assign-配值) 的 `immutable`）不受它挡——它替换这一层自己的锁（主线裁定 2026-09-24，G-25） | 与 `lockedAbove` 分开：自己解得开，上层的解不开 |
| `officialImmutable` | 结构性 | [S-8](#s-8-official-记录与出厂默认层的持有) 的五条 | 与 `notOwner` 分开：官方件对**任何**人都不可动 |
| `notOwner` | 结构性 | [S-15](#s-15-结构性禁止不是权限判定) | 与 `notPermitted` 分开：所有权事实，不随角色变 |
| `hasReferrers` | 判定 | 移除或删除时，**此刻的引用方不在调用方确认过的集合里**（[S-22](#s-22-先告知再移除或删除)）。提升不收它（主线裁定 2026-09-24 R2-7，[S-27](#s-27-promotetoorganization-提升到组织)）。**随失败返回此刻的引用方集合** | 它是「先告知」本身：拒绝的同时把该告知的交给调用方 |
| `versionSequenceBroken` | 判定 | 调用方说的版本号与版本线此刻的末尾对不上：发布时 `expected ≠ 末尾 + 1`（且不是认回）；修订草稿时 `basedOn ≠ 末尾` | [PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)「过期编辑不得静默覆盖他人已确认的修改」 |
| `versionNotPublished` | 判定 | 要持有的记录**一个已发布版本都没有**；或要钉、要读（[S-65](#s-65-readversion-读一个已发布版本)）的那个号**不是**这份记录的已发布版本 | 与资产流转同名（主线裁定采纳，账本 S11-names）——它的「复制草稿被拒」是同一件事，同一收场一个值 |
| `valueOutOfDomain` | 判定 | （项, 值）不在该持有所指记录声明的取值域里：**该项未声明**，或值过不了该项的 `domain`，或权限值不是该项枚举的子集 | 与 `invalidInput` 分开：值本身形状合法，判的是它**对这一项**合不合 |
| `layerNotAllowed` | 结构性 | [S-15](#s-15-结构性禁止不是权限判定)：组织层写凭据类项 | 与 `notPermitted` 分开：与角色无关（主线裁定 2026-09-24 R2-8，账本名） |
| `selectionNotSingleTier` | 判定 | 给一项**分档的权限**配的**挑选**（不带锁写下的值）不恰是一档：多于一档或空集（[S-38](#s-38-assign-配值)）；解锁会把这样一条界变成挑选时同判（[S-41](#s-41-unlockassignment-解除该项的锁)） | 与 `valueOutOfDomain` 分开：每一档都在取值域里，判的是「挑选只挑一档」；**界可以是集合**——随值加锁（`immutable` 为真）写下的可以多档或空集（主线裁定 2026-09-24 R2-9 与 G-24 裁定，账本名 R2-8） |
| `unavailable` | 失败 | 判定依据读不到：存储、组织治理的读面、某一类正文的属性项投影规则或组合引用抽取规则缺席 | **即 [`data.identity-values/v1#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败) 要求的那个失败、与组织治理同名**（主线裁定采纳，账本 S11-names）。不是结论，按当时状态重试可能不同 |

**三样一律以返回值承载，不走带外通道**：成功结果、具名拒绝、`unavailable`。
**不得把任何失败折进成功支**（空列表、`ok`、缺了字段的结果）。

### S-19 判定次序

**同一输入同一答案。**多个失败条件同时成立时，按下面的次序取**第一个**：

**按范围定位的操作**（[S-24](#s-24-createdraft-创建草稿)、[S-27](#s-27-promotetoorganization-提升到组织)、[S-30](#s-30-hold-加入持有)～[S-44](#s-44-organizationsettingsview-组织的设置视图)）：

1. 表示层 ⇒ `invalidInput`（**在任何读取之前**）；
2. 目标范围与调用方身份的关系 ⇒ `crossTenant`（**纯值比较，仍不读存储**）；
3. 目标范围所在的组织在不在（`organization-governance/v1#S-22`）⇒ `scopeNotFound`／`unavailable`；出厂层跳过；
4. 调用方资格（`organization-governance/v1#S-26` ＋ 角色）⇒ `notPermitted`／`unavailable`；
5. 记录（按 [S-14](#s-14-可见与不泄漏存在性) 的可见）⇒ `assetNotFound`；持有 ⇒ `holdingNotFound`；配值 ⇒ `assignmentNotFound`——同一步里有两个的，**先判用来定位的那个，再判被它定位到的**（[S-30](#s-30-hold-加入持有) 先记录；[S-36](#s-36-pinversion-钉住一个版本) 先持有、再它所指的记录），各操作⑥照此排；
6. 结构性的记录规则 ⇒ `officialImmutable`，再 `notOwner`；
7. 状态前置 ⇒ `versionNotPublished`、`alreadyHeld`、`lockedHere`、`lockedAbove`、`valueOutOfDomain`、`layerNotAllowed`、`selectionNotSingleTier`、`hasReferrers`，按各操作⑥列出的先后。**`layerNotAllowed` 是结构性的，却排在这一步**：要先由声明认出这一项是凭据类，它才判得出（[S-38](#s-38-assign-配值) ⑥）。

**按记录定位的操作**（[S-25](#s-25-updatedraft-修订草稿)、[S-26](#s-26-publish-发布)、[S-28](#s-28-delete-删除一份资产记录)、[S-45](#s-45-listreferrers-列出一份记录的引用方)、[S-64](#s-64-readasset-读一份资产记录)、[S-65](#s-65-readversion-读一个已发布版本)）：
表示层 ⇒ 调用方此刻有效（否则 `notPermitted`）⇒ 记录可见（否则 `assetNotFound`）⇒ `officialImmutable` ⇒ `notOwner` ⇒ 角色（`notPermitted`）⇒ 状态前置。
**「调用方有效」排在「记录可见」之前**，所以一个失效的身份拿到的永远是 `notPermitted`，**从它身上问不出任何记录在不在**。

**任何一步读不到 ⇒ `unavailable`，并在那一步停下**——不得跳过这一步去判后面的。

### S-20 每道准入现读

**成员资格、角色、持有、锁与引用方，在每一次写入与读取时现读。**
撤销、降级、移除只影响**下一道尚未通过的准入**（[`data.identity-values/v1#S-27`](../../../data/identity-values/v1/contract.md#s-27-每道准入现读)、
[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)）。
**任何缓存了本契约读面结果的地方要写明失效条件**，读面以 `unavailable` 失败时不写入缓存。
[旧菜单或预览不构成永久授权](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)——
[S-22](#s-22-先告知再移除或删除) 的确认集合同样只是一份读数，**写入以提交时现求的为准**。

### S-21 读到的依据与写入落在同一次可串行化的提交里

**本契约每个写操作把它据以放行的依据与它的写入放在同一次提交里，且这些提交可串行化。**
逐条点名**两个写入者共同触碰的那个存储对象**，否则「同一提交」排不出次序：

| 依据 | 与哪个写入者冲突 | 共同触碰的对象 |
|---|---|---|
| 同一范围 × 能力标识至多一份持有（[S-30](#s-30-hold-加入持有)） | 另一次对同一（范围, 能力标识）的 [S-30](#s-30-hold-加入持有) | 那个（范围, 能力标识）的持有行 |
| 上层没锁（[S-30](#s-30-hold-加入持有)、[S-36](#s-36-pinversion-钉住一个版本)、[S-38](#s-38-assign-配值) 的 `lockedAbove`） | 组织层的 [S-34](#s-34-lockreplacement-加替换锁)、[S-40](#s-40-lockassignment-锁住该项) | 组织层（组织, 能力标识）那一行持有 |
| 本层没锁（`lockedHere`） | 本层的 [S-40](#s-40-lockassignment-锁住该项) | 本层那一行持有 |
| 记录的所有者、存在、版本线（[S-30](#s-30-hold-加入持有) 定的 `basis`、[S-30](#s-30-hold-加入持有)／[S-36](#s-36-pinversion-钉住一个版本) 的 `versionNotPublished`） | [S-27](#s-27-promotetoorganization-提升到组织)、[S-28](#s-28-delete-删除一份资产记录)、[S-26](#s-26-publish-发布) | 那份记录那一行 |
| 版本号连续（[S-26](#s-26-publish-发布)）、`basedOn`（[S-25](#s-25-updatedraft-修订草稿)） | 另一次对同一记录的 [S-26](#s-26-publish-发布) | 那份记录那一行 |
| 依据 `organization` 的第二种来路：组织层持有同一份记录（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)） | 组织层对同一能力标识的 [S-31](#s-31-unhold-移除持有)、[S-30](#s-30-hold-加入持有) | 组织层（组织, 能力标识）那一行持有 |
| 引用方集合（[S-28](#s-28-delete-删除一份资产记录)、[S-31](#s-31-unhold-移除持有)） | 同时在列入范围里写入一份新持有的 [S-30](#s-30-hold-加入持有) | **「该范围的全部持有」这个谓词读**。存储须保护它（谓词锁或等价物），或让同一范围的持有写入串行化——**只锁已存在的行挡不住新插进来的那一行** |

**这是[装配给](#s-50-装配给的保证-vs-协议须给的保证)的保证**：单机由同一存储兑现，跨进程须由协议重新兑现。
**上锁与下层写入的竞争不产生错误的求值**：锁不删下层，求值按锁截断；本条保证的是「**锁生效之后写不进去**」这句写时承诺不被竞争打破。

### S-22 先告知，再移除或删除

[flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)：「移除一个还被其他资产引用的东西——**先告知受影响的引用，不默认级联删除**」；
[PF-003 flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)：「分享方删除了被分享出去的资产——**先告知受影响的一方，不默认级联**」；
[PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)：「改版、移除或退役前核对相关依赖」「旧菜单或预览不构成永久授权」。

**本契约读正文为「告知之后照做，不级联」**：告知不是否决，但必须**先于**移除或删除发生，且被告知的集合**要与提交那一刻的一致**。落成三步：

1. 调用方先读 [S-45](#s-45-listreferrers-列出一份记录的引用方)，把引用方呈现给做决定的人；
2. 发起 [S-31](#s-31-unhold-移除持有)／[S-28](#s-28-delete-删除一份资产记录) 时带上他**确认过的那个集合** `acknowledged`；
3. 提交内现求引用方：**此刻的集合 ⊆ `acknowledged` 才写**（份数那一项：此刻的份数不大于确认过的份数）；否则 `hasReferrers`，**连同此刻的集合一并返回**，不写任何东西。

| 操作 | 算哪些引用方 | 收不收确认 |
|---|---|---|
| [S-31 移除](#s-31-unhold-移除持有) | 落在**被移除的那个范围里**的组合引用方 | 收 |
| [S-28 删除](#s-28-delete-删除一份资产记录) | [S-45](#s-45-listreferrers-列出一份记录的引用方) 给所有者一侧的全部：持有方 ＋ 组合引用方 ＋ 本组织成员租户层的持有份数（[S-13](#s-13-引用方)） | 收 |

**提升不在此列**：它不被引用方挡（主线裁定 2026-09-24 R2-7；此前「调用方自己租户层那一份之外有持有方就拒」作废），理由在 [S-27](#s-27-promotetoorganization-提升到组织)。

**「不级联」写死**：移除只删那一份持有与它上面的配值；删除只删那一份记录；**两者都不改动任何引用方**。
引用方此后怎样（换一个提供者、在装配时「无人提供」明确失败）是求值的事。
**删除之后仍指向它的持有**留在原处，读到的是「已删除」（[S-64](#s-64-readasset-读一份资产记录)），求值怎样对待它们本版未定（[G-7](#十二已知缺口)）。

> **「确认过的集合」而不是一个「我已知悉」的布尔**，理由是正文那一句「旧菜单或预览不构成永久授权」：
> 布尔会让一次旧预览为此后出现的新引用方一并放行。集合比对使**新冒出来的引用方一定会再被告知一次**。
> **这一格是推导**：正文只给了「先告知、不级联」，没给确认的形状。

---

## 四、操作

### S-23 这一节每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | 输入（`caller: TenantId` 是调用方身份，[装配给](#s-50-装配给的保证-vs-协议须给的保证)：入口层已核实过） |
| ② | 前置与授权 |
| ③ | 结构性禁止（[S-15](#s-15-结构性禁止不是权限判定)；不适用写「无」） |
| ④ | 提交点与原子性 |
| ⑤ | 成功返回 |
| ⑥ | 失败集合（[S-18](#s-18-失败值闭合) 的子集，**按 [S-19](#s-19-判定次序) 的次序排**） |
| ⑦ | 幂等与重复 |
| ⑧ | 缺席时的默认答案（[S-17](#s-17-缺席时的默认答案)） |
| ⑨ | 事件（[S-48](#s-48-事件都是通知)） |

**本节二十四个操作**：创作与发布五个（[S-24](#s-24-createdraft-创建草稿)～[S-28](#s-28-delete-删除一份资产记录)），official 登记一个（[S-29](#s-29-registerofficial-登记官方件)），
持有八个（[S-30](#s-30-hold-加入持有)～[S-37](#s-37-unpinversion-回到追随当前版本)），配值四个（[S-38](#s-38-assign-配值)～[S-41](#s-41-unlockassignment-解除该项的锁)），
读面六个（[S-42](#s-42-listholdings-列出某范围的持有)～[S-45](#s-45-listreferrers-列出一份记录的引用方)、[S-64](#s-64-readasset-读一份资产记录)、[S-65](#s-65-readversion-读一个已发布版本)）。
**每个操作的⑥都含 `invalidInput`；除 [S-29](#s-29-registerofficial-登记官方件) 外都含 `unavailable`**，下面逐条列出、不省略。
**除提交成功外，任何一支都不留下部分效果。**

#### 创作与发布

### S-24 createDraft 创建草稿

| # | 内容 |
|---|---|
| ① | `caller`（**即作者**）、`owner`（`AssetOwner`：组织或租户）、`capability`（`CapabilityId`）、`content`（`AssetContent`）、`byAgent`（布尔：这次创作是不是 agent 产出，[S-7](#s-7-所有者与作者)）；**可选** `creationKey`（调用方生成的不透明去重标识，[`data.identity-values/v1#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的词法）。组合入口另收 `author` 与 `lineage`（[S-46](#s-46-组合入口资产流转的确认步骤)） |
| ② | `owner = {tenant: caller}` ⇒ caller 有**租户范围创作权**；`owner = {organization: caller 的组织}` ⇒ caller 有**组织范围创作权**（[S-16](#s-16-谁能做角色矩阵落成的四种资格)） |
| ③ | `owner` 既不是 caller 本人也不是 caller 所在的组织 ⇒ `crossTenant`。`content` 的类别与 `capability.category` 不符、`content` 过不了它那一类正文的校验、**`capability` 是斜杠命令而违反 [`data.slash-command/v1#S-4`](../../../data/slash-command/v1/contract.md#s-4-保留区只归系统提供的命令型)**——① ② 型的名字在保留区 `omne-official:` 里（[`#S-3`](../../../data/slash-command/v1/contract.md#s-3-保留区与它唯一的拼法)），或 ③ 型出现在自定义件里 ⇒ `invalidInput`（[PF-002 Slash Command「名字与撞名」](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)：「① ② 型的名字不得使用这个前缀，发布时带了就被拒」；原 G-15 闭合） |
| ④ | **单次提交**：一份新记录——新分配的 `AssetRecordId`（[S-5](#s-5-资产记录与它的两个标识)）、`capability`、`origin = customized`、`owner`、作者 = `caller`、`byAgent`、草稿 = `content`、版本线为空；**带键时**创建键登记与记录同提交。这是 [flows §1.7](../../../../product/PF-002-assets-settings-and-permissions/flows.md#17-创作一个资产) 第 1 步「在某个范围里创作 ⇒ 产生草稿」 |
| ⑤ | `AssetRecordId` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `unavailable` |
| ⑦ | **带键**：（`caller`, `creationKey`）在保留期 `asset_creation_key_retention`（部署配置，具名参数，本契约不填值）内重放 ⇒ **返回首次那个 `AssetRecordId`，不写任何东西**——这是 [PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)「未知结果后的重试认回同一逻辑操作」在本操作上的兑现处；重放时其余输入与首次不同，**仍认回首次那一份**，以返回值为准。**不带键 ⇒ 不幂等**：每次调用一份新记录。**同一 `owner` 下同一 `capability` 可以有多份记录**（[S-5](#s-5-资产记录与它的两个标识)），重复调用不会被当成冲突拒掉 |
| ⑧ | 组织存在性、成员资格或**创建键登记读不到** ⇒ `unavailable`；**不得在读不到键登记时当成「没见过这个键」去创建**。身份参数缺席或不合形状、`byAgent` 缺席、`creationKey` 给了但不合形状 ⇒ `invalidInput` |
| ⑨ | **不发**：草稿不进求值，没有消费者需要知道它 |

> **创建键是推导**：简报的签名里没有它。[组织治理的创建团队组织](../../organization-governance/v1/contract.md#s-21-创建团队组织)在同一条产品规则下被评审阻断过一次（该契约 G-12），
> 本契约照那次的闭合方式写，不另立失败值。

### S-25 updateDraft 修订草稿

| # | 内容 |
|---|---|
| ① | `caller`、`asset`、`basedOn`（整数 ≥ 0：调用方这次编辑**据以出发的**那个已发布版本号；0 = 尚无已发布版本）、`content` |
| ② | caller 此刻有效；记录可见（[S-14](#s-14-可见与不泄漏存在性)）；caller 对记录所有者有创作权（所有者是 caller 本人 ⇒ 租户范围创作权；是 caller 的组织 ⇒ 组织范围创作权）；**`basedOn` 等于版本线此刻的末尾** |
| ③ | 记录是 official ⇒ `officialImmutable`；所有者既不是 caller 本人也不是 caller 的组织 ⇒ `notOwner`（被分享方改不了，[PF-003 §6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)）；`content` 类别与记录的能力标识不符、过不了正文校验，或违反斜杠命令的保留区规则（同 [S-24](#s-24-createdraft-创建草稿) ③）⇒ `invalidInput` |
| ④ | **单次提交**：草稿整体替换为 `content`；`basedOn` 的比对与写入同提交（[S-21](#s-21-读到的依据与写入落在同一次可串行化的提交里)）。能力标识、所有者、作者、血缘、版本一概不动 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `notPermitted` · `assetNotFound` · `officialImmutable` · `notOwner` · `versionSequenceBroken` · `unavailable` |
| ⑦ | 同一内容重放 ⇒ `ok`，无二次效果。**`basedOn` 已落后 ⇒ `versionSequenceBroken`，不写**：别人已经发布过一版，这份编辑是照着旧的改的 |
| ⑧ | 读不到 ⇒ `unavailable`；身份参数缺席、`basedOn` 不是非负整数 ⇒ `invalidInput` |
| ⑨ | 不发 |

> **`basedOn` 是推导，它兑现的是 [PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)「过期编辑不得静默覆盖他人已确认的修改」**，
> 本契约把「已确认的修改」读成「**已发布的版本**」：A 照 v2 改、B 期间发了 v3，A 的修订被拒，v3 的改动不会被 A 静默盖掉再发成 v4。
> **两个人同时改一份还没发布的草稿，本条不挡**——那不是「已确认的修改」。

### S-26 publish 发布

| # | 内容 |
|---|---|
| ① | `caller`、`asset`、`expected`（整数 ≥ 1：调用方要发布成的那个版本号） |
| ② | 同 [S-25](#s-25-updatedraft-修订草稿) ②，把最后一条换成：**`expected` 等于版本线末尾 ＋ 1**（空线则为 1） |
| ③ | 同 [S-25](#s-25-updatedraft-修订草稿) ③（不含 `content` 那一条） |
| ④ | **单次提交**：追加版本 `{ number: expected, content: 此刻的草稿, publishedAt: 本次提交时刻, publishedBy: caller }`（`AssetVersion`）；**草稿原样留着**（[S-6](#s-6-草稿与版本线)）；版本号比对与追加同提交。**不写任何持有**。[flows §3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)：「已发布（不可变）」 |
| ⑤ | 版本号 `expected` |
| ⑥ | `invalidInput` · `notPermitted` · `assetNotFound` · `officialImmutable` · `notOwner` · `versionSequenceBroken` · `unavailable` |
| ⑦ | **认回**：版本 `expected` 已存在，**它的 `publishedBy` 是 caller、内容与此刻草稿相等** ⇒ 返回 `expected`，无二次效果。其余 `expected ≠ 末尾 + 1` 的情形 ⇒ `versionSequenceBroken`，不写。「内容相等」是 JSON 值相等（对象成员无序、数组有序、数值按数值、字符串逐码点） |
| ⑧ | 读不到 ⇒ `unavailable`；`expected` 不是正整数 ⇒ `invalidInput` |
| ⑨ | `AssetPublished`（**只在追加了版本时**） |

**两次并发发布同一个号，恰一次成**：两次都说 `expected = n`，先提交的写下 v`n`，后提交的看到末尾已是 `n`——
它不是认回（草稿或发布者不同）就收 `versionSequenceBroken`。**版本线上不会出现空号，也不会出现两个 v`n`。**

**组合图成环在定义时拒绝**（[flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)、[acceptance §三](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#三判据)「在定义时就被拒」）**本版不在这里兑现**，理由见 [G-6](#十二已知缺口)。

### S-27 promoteToOrganization 提升到组织

| # | 内容 |
|---|---|
| ① | `caller`、`asset`、`organization`（`OrganizationId`） |
| ② | caller 有**组织范围创作权**（[S-16](#s-16-谁能做角色矩阵落成的四种资格)）；记录可见；记录的所有者是 `{tenant: caller}`。**不看还有谁持有它**：提升不被分享挡住（主线裁定 2026-09-24 R2-7） |
| ③ | `organization` 不是 caller 所在的组织 ⇒ `crossTenant`；记录是 official ⇒ `officialImmutable`；所有者既不是 caller 本人也不是 caller 的组织 ⇒ `notOwner` |
| ④ | **单次提交**：所有者改为 `{organization}`；**caller 租户层那一份持有（若有）的依据随之由 `owned` 重算为 `organization`——这不是一次持有变更**：它的范围、能力标识、所指记录、版本选用、锁、配值与 `since` 一概不动；作者、`byAgent`、草稿、版本、血缘都不动。**同一提交里，caller 作为分享方、以这份记录为资产的全部 `active` 分享随之结束**（记录置 `revoked`、原因 `ownerChanged`——那份记录与规则归 [`capability.asset-transfer/v1#S-52`](../../asset-transfer/v1/contract.md#s-52-分享方删除资产或所有权易手分享随之结束)；两份契约同一提供者，与 [S-46](#s-46-组合入口资产流转的确认步骤) 同一约定）；被分享方那一层的 `shared` 持有**不动**（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)，账本 A-M21），此后按分享的判据不可用。读到的所有者与写入同提交（[S-21](#s-21-读到的依据与写入落在同一次可串行化的提交里)） |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `assetNotFound` · `officialImmutable` · `notOwner` · `unavailable` |
| ⑦ | 记录的所有者**已是** `{organization}` ⇒ `ok`，无二次效果（认回）；这一路**仍要过②的组织范围创作权** |
| ⑧ | 读不到 ⇒ `unavailable`；**分享结束那一步写不下去 ⇒ 整次 `unavailable`，所有者不改**（不留「所有者已改、分享仍 `active`」的状态）；身份参数缺席 ⇒ `invalidInput` |
| ⑨ | `AssetPromoted`（它一并通知 caller 那份持有的依据重算，**不另发** `HoldingChanged`：那不是持有变更，求值用的记录与版本都没变）。分享结束的通知归资产流转 |

**不可逆写死在路径上**：本契约**没有任何把所有者从组织写回租户的操作**，[S-7](#s-7-所有者与作者)。

**依据重算与 PF-001 rev 17 一致**（主线裁定 2026-09-24 R2-16）：[提升只换所有者，不动任何一份持有](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)——
「提升之前哪一层持有它、各自配了什么值，提升之后原样还在：交出它的那个租户照常持有、配的值一个不丢」。
`basis` 答的是「资格从哪来」，[S-9](#s-9-持有本契约写得到的两层与写不到的两层) 按这一格与记录此刻的事实**自动定**、调用方从不给；所有者这条事实变了，`owned` 不再成立而 `organization` 恰好成立，
**重算它是让那份持有继续合法，不是替租户做了一次持有上的决定**——持有的键、所指、选用、锁与配值都在原处。组织层要不要随之持有，由组织自己加入（「组织那一层没有因此多出一份持有」）。
**提升不被分享挡住**（主线裁定 2026-09-24 R2-7，待产品负责人过目；此前「其余持有方只可能是被分享出去的那些，有就拒」作废）：
所有权易手之后分享方不再是所有者，那几段分享随之结束——类推「分享方不再是有效成员则分享结束」；被分享方那一层的持有照 A-M21 留着、此后不可用。
**经本契约的写面还有别的持有方指向它的，只可能是被分享方**：记录归 caller 租户所有时，组织层与别的成员租户层都没有 `owned`／`organization` 依据持有它（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)）。

### S-28 delete 删除一份资产记录

| # | 内容 |
|---|---|
| ① | `caller`、`asset`、**可选** `acknowledged`（引用方集合，缺席 = 空集，[S-17](#s-17-缺席时的默认答案)） |
| ② | caller 此刻有效；记录可见；caller 对记录所有者有创作权（同 [S-25](#s-25-updatedraft-修订草稿) ②）；**此刻的引用方（[S-45](#s-45-listreferrers-列出一份记录的引用方) 给所有者一侧的全部）⊆ `acknowledged`**（[S-22](#s-22-先告知再移除或删除)） |
| ③ | 记录是 official ⇒ `officialImmutable`；所有者既不是 caller 本人也不是 caller 的组织 ⇒ `notOwner` |
| ④ | **单次提交**：这份记录不再存在——草稿与血缘随之不再可读；**已发布版本的内容作为不可解引用的归档保留**：本契约没有任何读面再返回它，仍指向它的持有方读到的是「已删除」（[S-64](#s-64-readasset-读一份资产记录)、[S-65](#s-65-readversion-读一个已发布版本)、[S-44](#s-44-organizationsettingsview-组织的设置视图)；主线裁定 2026-09-23，待产品负责人确认；账本 A-M25）；**任何持有、任何引用方都不被改动**（不级联）；引用方现求与删除同提交。**同一提交里，以这份记录为资产、记录为 `active` 的全部分享随之结束**（置 `revoked`、原因 `sourceDeleted`——那份记录与规则归 [`capability.asset-transfer/v1#S-52`](../../asset-transfer/v1/contract.md#s-52-分享方删除资产或所有权易手分享随之结束)，两份契约同一提供者；主线裁定 2026-09-24 R2-4）；这不是级联：被分享方那一层的 `shared` 持有与配值不动（账本 A-M21），此后读到「已删除」。`AssetRecordId` 不回收（[S-5](#s-5-资产记录与它的两个标识)） |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `notPermitted` · `assetNotFound` · `officialImmutable` · `notOwner` · `hasReferrers`（携此刻的引用方集合） · `unavailable` |
| ⑦ | 重放 ⇒ `assetNotFound`，无二次效果 |
| ⑧ | 读不到、**或引用方求不出**（某一类的组合引用抽取规则缺席，[S-13](#s-13-引用方)）⇒ `unavailable`，不删。**不得在求不出时当成「没有引用方」**。**分享结束那一步写不下去 ⇒ 整次 `unavailable`，不删**（不留「记录已删、分享仍 `active`」的状态） |
| ⑨ | `AssetDeleted`；它的订阅者含每个在自己租户层持有这份记录的租户本人——**这就是对他们的告知**（[S-13](#s-13-引用方)，账本 S11-G18） |

**删除之后的三件事，写明谁的**：指向它的**待确认邀约**按 [`data.offer-expiry/v1#S-19`](../../../data/offer-expiry/v1/contract.md#s-19-规则与读面归属) 过期（判定与存在性读面都归资产流转，[它的 S-7](../../asset-transfer/v1/contract.md#s-7-两类待确认件共用的过期语义)）；
**仍指向它的持有**留在原处、读到「已删除」、由持有方自己移除（[S-31](#s-31-unhold-移除持有) 对它照常成立），求值怎样对待它归 [G-7](#十二已知缺口)；
**从它复制出去的那些**不受影响——[复制之后各走各的](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#33-一份资产在源侧与目标侧的关系)。

#### official 登记

### S-29 registerOfficial 登记官方件

| # | 内容 |
|---|---|
| ① | `capability`、`content`、`meta`（布尔：部署的官方件清单是否把这个能力标识标为 [meta 能力](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability)）。**没有调用方身份**：这是**装配启动时**按部署的官方件清单登记的面，不是运行时操作，也不是任何租户的操作（主线裁定 2026-09-23，待产品负责人确认；账本 A-M17） |
| ② | **无授权前置**。它的授权是「够得着」：只有装配启动时的官方件登记调用得到它（[装配给](#s-50-装配给的保证-vs-协议须给的保证)） |
| ③ | `content` 的类别与 `capability.category` 不符、过不了它那一类正文的校验 ⇒ `invalidInput`。斜杠命令按 [`data.slash-command/v1#S-4`](../../../data/slash-command/v1/contract.md#s-4-保留区只归系统提供的命令型) 判：官方的 ① ② 型也不得在保留区里（[PF-002 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)「官方提供的 ① ② 型也一样」），③ 型必须在保留区里；违反 ⇒ `invalidInput`（原 G-15 闭合） |
| ④ | **单次提交**。该能力标识**尚无** official 记录 ⇒ 建一份（`origin = official`；所有者与作者按 `data.asset-model` v1 对官方件的表示——平台，不是租户，[`data.identity-values/v1#CS-2`](../../../data/identity-values/v1/contract.md#cs-2-作者与所有者分记)；没有草稿；v1 = `content`）**并**建出厂默认层的那份持有（[S-8](#s-8-official-记录与出厂默认层的持有)），`immutable = meta`。**已有** ⇒ `content` 与最新版本内容相等（[S-26](#s-26-publish-发布) ⑦的相等）则不写版本，否则追加下一个版本；出厂层那份持有的 `immutable` 与 `meta` 不同则改写成 `meta`——部署清单是它唯一的依据 |
| ⑤ | （`AssetRecordId`, 版本号）：新建或追加的那一个，或不写时的最新那一个 |
| ⑥ | `invalidInput` · `unavailable` |
| ⑦ | **幂等到内容与标记为止**：同内容、同标记重放不写，返回同一对值。装配每次启动都跑一遍，**不会因此多出版本** |
| ⑧ | 读不到 ⇒ `unavailable`，不写；`meta` 缺席 ⇒ `invalidInput`（[S-17](#s-17-缺席时的默认答案)） |
| ⑨ | `AssetPublished`（追加或新建了版本时）；`HoldingChanged`（建出厂层持有时 `change = added`；改写了标记时 `replacement_locked`／`replacement_unlocked`） |

**official 记录只加不删**：本契约没有退役一个官方能力标识的路径（[S-3](#s-3-本契约明确不承诺什么)）。

**登记是装配启动的一部分**：清单里任何一份登记失败，这次启动就不成立（[PF-017 §6.6](../../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)「要么整个起来，要么不起来」）——
`capability.asset-evaluation` 的前提「出厂那一格的持有齐全、meta 能力的出厂持有带锁」在这里兑现（原 G-11 闭合）。

#### 持有

### S-30 hold 加入持有

| # | 内容 |
|---|---|
| ① | `caller`、`scope`（`ScopeLayerIdentity`）、`asset`；**可选** `versionSelection`（缺席 ⇒ `current`，[S-17](#s-17-缺席时的默认答案)）。**不收 `basis`**（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)）。组合入口另收 `sharing`（`SharingId`，[S-46](#s-46-组合入口资产流转的确认步骤)） |
| ② | caller 是该范围的**管理者**；记录可见（带 `sharing` 时例外，[S-46](#s-46-组合入口资产流转的确认步骤)）；**记录至少有一个已发布版本**，`pinned` 时那个号是它的已发布版本；该范围**尚无**该能力标识的持有；**这一格与记录之间有一种依据成立**（[S-9](#s-9-持有本契约写得到的两层与写不到的两层) 那张表，自上而下取第一个）；**`scope` 是租户层而所在组织层对该能力标识的持有加了替换锁时，这次持有的是组织层那同一份记录、且版本选用是 `current`**（下文） |
| ③ | `scope` 越界 ⇒ `crossTenant`；以出厂层带锁（meta）的能力标识持有另一份记录 ⇒ `officialImmutable`（[S-8](#s-8-official-记录与出厂默认层的持有) 第 5 条）；没有一种依据成立，或带 `sharing` 而 `versionSelection` 是 `pinned` ⇒ `notOwner`；`scope` 是出厂或工作区 ⇒ `invalidInput`（构造不出来，[S-9](#s-9-持有本契约写得到的两层与写不到的两层)） |
| ④ | **单次提交**：写入持有 `{ holder: scope, capability: 记录的能力标识, asset, basis: 按 S-9 定的那一支, versionSelection, immutable: false, assignments: [], since: 本次提交时刻 }`（`AssetHolding`）；唯一性、上层替换锁、记录的三项事实（所有者与来源、存在、版本线）与写入同提交（[S-21](#s-21-读到的依据与写入落在同一次可串行化的提交里)）。plugin 的成员随它进来，**不各自成为持有**。这是 [flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)「未持有 ──加入──→ 持有·启用」、[flows §1.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#11-给组织加一个资产) 第 2 步 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `assetNotFound` · `officialImmutable` · `notOwner` · `versionNotPublished` · `alreadyHeld` · `lockedAbove` · `unavailable` |
| ⑦ | 该范围已持有**同一份记录、同一依据、同一版本选用** ⇒ `ok`，无二次效果（**即使组织层此后加了替换锁**：那份持有早于锁，求值时被截断）。持有的是另一份记录 ⇒ `alreadyHeld`——要换，先 [S-31](#s-31-unhold-移除持有) 再加入；同一份记录而依据或版本选用不同 ⇒ `alreadyHeld`——要换版本走 [S-36](#s-36-pinversion-钉住一个版本)／[S-37](#s-37-unpinversion-回到追随当前版本) |
| ⑧ | 读不到 ⇒ `unavailable`；判别式在集合外、`versionSelection` 不合形状 ⇒ `invalidInput`；`versionSelection` 缺席 ⇒ `current` |
| ⑨ | `HoldingChanged`（`change = added`） |

**`lockedAbove` 是 [flows §1.4](../../../../product/PF-002-assets-settings-and-permissions/flows.md#14-组织锁死一个自定义资产) 的「租户层的替换被拒绝」**：
组织层把某个能力标识的持有标了替换锁，租户层持有同标识的**另一份**记录就写不进来——换成官方件、换成自己的，[都算替换](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)。
**同一份记录不算替换**（主线裁定 2026-09-23，待产品负责人确认；账本 S11-G19，原 G-19 闭合）：租户以 `organization` 依据持有组织层那一份，是为了在自己那一层配值，配值仍受组织层的项锁（[S-38](#s-38-assign-配值)）；
这与求值的截断同一个判据——`capability.asset-evaluation` 只截断指向另一份资产的持有。**它只能以 `current` 进来**：以 `pinned` 进来会让这一层用上与组织层不同的一版，与 [S-36](#s-36-pinversion-钉住一个版本) 在锁下钉不了同一个理由；
锁下的版本选用能不能与组织层不同，是 [G-20](#十二已知缺口)。
出厂层只对 meta 能力带锁，那一支收 `officialImmutable`（[S-8](#s-8-official-记录与出厂默认层的持有) 第 5 条），所以组织层的 [S-30](#s-30-hold-加入持有) 没有 `lockedAbove`。

**替换 official 就是这一条**：组织或租户持有一份与官方件同标识的自定义件（依据 `owned` 或 `organization`）。
[成员在个人组织里替换 official 是允许的](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)——个人组织的成员就是那里的超级管理员（[S-16](#s-16-谁能做角色矩阵落成的四种资格)）。

**租户持有「本组织拥有的那一份」也是这一条**（依据 `organization`）：[PF-002 §5.3 的例子](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)里租户为组织共享的 agent definition 配自己的默认模型，
先要在自己那一层持有它，再在那份持有上配值。

**缺省 `current` 的依据是主线裁定（账本 S11-1），不是产品正文。**正文那一句是「发现有新版本**不静默替换**已选用的版本——[选用哪个版本是消费方的决定](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)」：
`current` 本身是一个选择（「追随」），**只有让做选择的人看得见它才不算静默**。所以本契约的读面（[S-42](#s-42-listholdings-列出某范围的持有)～[S-44](#s-44-organizationsettingsview-组织的设置视图)）返回的每份持有都带着 `versionSelection`。

### S-31 unhold 移除持有

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability`、**可选** `acknowledged` |
| ② | caller 是该范围的管理者；该范围持有该能力标识；**落在这个范围里的组合引用方 ⊆ `acknowledged`**（[S-22](#s-22-先告知再移除或删除)） |
| ③ | `scope` 越界 ⇒ `crossTenant` |
| ④ | **单次提交**：删掉这一份持有**与它上面的全部配值**（含 `disabled` 那一项）；plugin 的成员随之退场；引用方现求与删除同提交。**不改动任何引用方**，不碰任何别的范围。这是 [flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)「持有（任一）──移除──→ 未持有」、[flows §1.5](../../../../product/PF-002-assets-settings-and-permissions/flows.md#15-不让成员用某个工具)的「移除」 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `hasReferrers`（携此刻的引用方） · `unavailable` |
| ⑦ | 重放 ⇒ `holdingNotFound`，无二次效果 |
| ⑧ | 读不到、或引用方求不出 ⇒ `unavailable`，不删 |
| ⑨ | `HoldingChanged`（`change = removed`） |

**移掉的配值回不来**：要留着就用 [S-32](#s-32-disable-禁用)（[§6.4 的判据：收回持有，还是暂时关掉](../../../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)）。

**单独卸载 plugin 的一个成员 ⇒ `holdingNotFound`**：成员没有自己的持有（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)），
这正是 [flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)「plugin 的内含成员被单独卸载：拒绝」在本契约的落点。

**移除一份 `basis = official` 的持有是允许的**：那是组织或租户自己那一层的持有，出厂层那份原样在（[S-8](#s-8-official-记录与出厂默认层的持有)）。

**持有所指的记录已被删除，本操作照常成立**：引用方按这份持有的能力标识求。

**组织层移除一份它经分享持有的记录，成员租户层以 `organization` 依据持有同一份的那些不被删**：它们失去依据、留在原处（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)）。

### S-32 disable 禁用

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability` |
| ② | caller 是该范围的管理者；该范围持有该能力标识 |
| ③ | `scope` 越界 ⇒ `crossTenant`；这份持有所指的记录是 official ⇒ `officialImmutable` |
| ④ | **单次提交**：这一层这份持有上 `disabled` 为真。**配值一个不动**，持有不解除。这是 [flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)「持有·启用 ──禁用──→ 持有·禁用」、[flows §1.5](../../../../product/PF-002-assets-settings-and-permissions/flows.md#15-不让成员用某个工具)的「禁用」 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `officialImmutable` · `unavailable` |
| ⑦ | 已为真 ⇒ `ok`，无二次效果 |
| ⑧ | 读不到 ⇒ `unavailable` |
| ⑨ | `HoldingChanged`（`change = disabled`） |

**禁用一份替换了官方件的自定义件是允许的**：它是自定义件；被禁的持有在替换次序上视为不存在，那个能力标识退回官方件——[official 仍不可被清空](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)。

### S-33 enable 启用

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability` |
| ② | caller 是该范围的管理者；该范围持有该能力标识 |
| ③ | `scope` 越界 ⇒ `crossTenant` |
| ④ | **单次提交**：这一层这份持有上 `disabled` 不再为真。**只动这一层这一项**（[S-11](#s-11-禁用)）。这是 [flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)「持有·禁用 ──启用──→ 持有·启用」：「只去得掉本层自己配的那个真」 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `unavailable` |
| ⑦ | 这一层本来不为真 ⇒ `ok`，无二次效果 |
| ⑧ | 读不到 ⇒ `unavailable` |
| ⑨ | `HoldingChanged`（`change = enabled`）——只在真的改了时 |

**「上面一层禁掉的，下面一层开不回来」不是本操作的失败**：租户启用之后那份资产仍不可见，是求值按析取算出来的（[acceptance](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)那一行）。
本操作的承诺只是「**这一层不再为真**」；它**不告诉**调用方求值结果。

### S-34 lockReplacement 加替换锁

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability` |
| ② | caller 是该范围的管理者；该范围持有该能力标识 |
| ③ | `scope` 越界 ⇒ `crossTenant` |
| ④ | **单次提交**：这份持有的 `immutable` 为真。**不删、不改任何更具体那一层已有的持有**——它们留在原处，求值时被截断。这是 [flows §1.4](../../../../product/PF-002-assets-settings-and-permissions/flows.md#14-组织锁死一个自定义资产) 第 2 步「标记为 immutable」 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `unavailable` |
| ⑦ | 已上锁 ⇒ `ok`，无二次效果 |
| ⑧ | 读不到 ⇒ `unavailable` |
| ⑨ | `HoldingChanged`（`change = replacement_locked`） |

**锁不问被锁的是官方件还是自定义件**（[§5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)）：
组织或租户为锁住官方件而持有它（`basis = official`）再上锁，是成立的用法。**租户层上的锁只挡工作区**，本契约不写工作区，所以它只在求值里起作用。

### S-35 unlockReplacement 解除替换锁

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability` |
| ② | caller 是该范围的管理者；该范围持有该能力标识 |
| ③ | `scope` 越界 ⇒ `crossTenant` |
| ④ | **单次提交**：这份持有的 `immutable` 为假。**不回溯**：锁着期间被拒的写入不会因此补上 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `unavailable` |
| ⑦ | 本来没锁 ⇒ `ok`，无二次效果 |
| ⑧ | 读不到 ⇒ `unavailable` |
| ⑨ | `HoldingChanged`（`change = replacement_unlocked`）——只在真的改了时 |

### S-36 pinVersion 钉住一个版本

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability`、`number`（正整数：要钉住的已发布版本号） |
| ② | caller 是该范围的管理者；该范围持有该能力标识；这份持有所指的记录存在；**`number` 是它的已发布版本**；**这份持有的依据不是 `shared`**；**`scope` 是租户层时，所在组织层对该能力标识的持有没有加替换锁** |
| ③ | `scope` 越界 ⇒ `crossTenant`；依据是 `shared` ⇒ `notOwner`（[被分享方不钉版本](../../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保)：钉住就是要一份 fork，那个动作叫复制） |
| ④ | **单次提交**：这份持有的 `versionSelection` 为 `{pinned, number}`；版本号的核对、上层替换锁与写入同提交（[S-21](#s-21-读到的依据与写入落在同一次可串行化的提交里)）。**配值一个不动**（[S-10](#s-10-属性配值与两把锁)：新选的那一版没有的项，值留着、不参与求值）。这是 [flows §3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)「选用哪个版本是消费方的决定」 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `assetNotFound`（所指记录已被删除） · `notOwner` · `versionNotPublished` · `lockedAbove` · `unavailable` |
| ⑦ | 已钉在同一个号上 ⇒ `ok`，无二次效果 |
| ⑧ | 读不到 ⇒ `unavailable`；`number` 缺席或不是正整数 ⇒ `invalidInput` |
| ⑨ | `HoldingChanged`（`change = version_pinned`）——只在真的改了时 |

**钉官方件的版本是允许的**（主线裁定采纳，账本 S11-5）：依据 `official` 的持有是组织或租户自己那一层的，选哪一版是那一层的决定；出厂层那一份恒为 `current`（[S-8](#s-8-official-记录与出厂默认层的持有)），**钉住不是编辑，也不是替换**。
**租户层在组织加了替换锁之后钉不了**：它换的是那个能力标识在这一层实际用的内容，与 [S-30](#s-30-hold-加入持有) 以 `pinned` 进来收 `lockedAbove` 同一个理由（[G-20](#十二已知缺口)）。
组织层钉自己那一份不受自己的替换锁约束：替换锁锁的是「这一层**以下**」（[§5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)）。

### S-37 unpinVersion 回到追随当前版本

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability` |
| ② | caller 是该范围的管理者；该范围持有该能力标识 |
| ③ | `scope` 越界 ⇒ `crossTenant` |
| ④ | **单次提交**：这份持有的 `versionSelection` 为 `{current}`。**配值一个不动** |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `unavailable` |
| ⑦ | 本来就是 `current`（含全部 `shared` 的持有）⇒ `ok`，无二次效果 |
| ⑧ | 读不到 ⇒ `unavailable` |
| ⑨ | `HoldingChanged`（`change = version_unpinned`）——只在真的改了时 |

**回到追随从不让下层绕过任何锁**，所以**没有 `lockedAbove`**（与 [S-39](#s-39-clearassignment-清除配值) 同理）；所指记录已被删除时照常成立。

#### 配值

**四个操作都以（`scope`, `capability`）定位那份持有，以 `item` 定位那一项；`item = disabled` 一律 `invalidInput`**（[S-11](#s-11-禁用)）。

### S-38 assign 配值

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability`、`item`、`value`（设置项：JSON 值；权限项：`PermissionValue`）、**可选** `immutable`——**随值加锁**：为真时同一次提交里写下这个值并锁上，等价于先配值、再 [S-40](#s-40-lockassignment-锁住该项) 加锁两步原子化；缺席即不加锁（[S-17](#s-17-缺席时的默认答案)；主线裁定 2026-09-24，G-24） |
| ② | caller 是该范围的管理者；该范围持有该能力标识；**（`item`, `value`）在这份持有选用的那一版推出的声明里**（[S-10](#s-10-属性配值与两把锁)）；**不带 `immutable` 时，这一层该项没上锁**（`lockedHere`）——**带 `immutable` 为真时，这一层自己的锁不挡**：随值加锁替换这一层自己已上锁的值（权限的界，或设置项上锁的值），`lockedHere` 只挡不带锁的改值与清除（主线裁定 2026-09-24，G-25）；**`scope` 是组织层且该项是凭据类项时，这一层不收**（`layerNotAllowed`）——[组织那一层不持有 MCP 凭据，也不配连接件的鉴权绑定](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)（PF-002 rev 18；[flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)「拒绝，说明这两项只在租户那一层配、每个成员自己取」；原 G-10 闭合）。**凭据类项**是声明的取值域为 `CredentialRef` 的那一项（`data.asset-model/v1#S-23` 第 2 条），本版恰两项：MCP 的凭据（[`data.mcp-endpoint/v1#S-13`](../../../data/mcp-endpoint/v1/contract.md#s-13-凭据配值的取值域)）与连接件的鉴权绑定（[`data.connector/v1#S-12`](../../../data/connector/v1/contract.md#s-12-鉴权绑定那一项)）；**按取值域判，不按项名或类别列举**——以后另一类有了同性质的项，同一条自动覆盖它；**该项是分档的权限、`value` 是一条挑选时，恰是一档**（`selectionNotSingleTier`）——**随值加锁写下的不是挑选，不受这一条**；**`scope` 是租户层时**：设置项——组织层对同一能力标识的持有上该项没有项锁；权限项——`value` **不论是挑选还是界、带不带锁**，都**落在组织那一层给的界内**（两者不成立都是 `lockedAbove`）。**界、挑选、分档照 [`capability.asset-evaluation/v1#S-23`](../../asset-evaluation/v1/contract.md#s-23-第四步权限)**，本契约不另写一份：界是带锁的配值，**以及执行权限上配成恰 `{forbid}` 的配值，锁不锁都是**；其余不锁的配值是挑选；分档的权限是取值域恰为执行权限三档或干预力三档的那一项。不带 `immutable` 时写下的值不带锁：**要么是一条挑选，要么是执行权限上的恰 `{forbid}`——一条界**；**带 `immutable` 为真时写下的是一条界**，它可以多档（[「锁下一个允许集合」](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)），也可以是空集——原话：「如果组织把工具 X 的这项权限**锁成空集**，租户再怎么挑也拿不到：空集与任何集合的交集还是空集，**每一次调用都被拒**」（[PF-002 §5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)）。**落在界内**：值 `P`（挑选或界）与组织那一层该项的界之交 `X` 相交，或 `P` 是空集（「一档都不许」在任何界内都成立）——与那份契约 S-23 第 2 条同一个判据；组织那一层对这一项没有界时，任何值都在界内。**界也要落在外层界内**（主线裁定 2026-09-24，G-25「前置仍是新界落在外层界内」；早先「写一条界不查外层的界」的推导作废）：组织锁「问一下」、租户配「禁止」——配成「禁止」锁不锁都是界——落在界外 ⇒ `lockedAbove`；租户锁成空集照收。一项是不是权限、分档、执行权限，按**这份持有**选用的那一版推出的声明认；组织那一层的值按项名对齐、**不看组织层那份持有禁没禁用**（与设置项的项锁守卫同一口径）。**配值的资格来自持有**（[flows §1.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#12-配置一个资产的设置或权限)） |
| ③ | `scope` 越界 ⇒ `crossTenant`；`item = disabled` ⇒ `invalidInput` |
| ④ | **单次提交**：写入或替换这一层该项的配值 `{ item, value, immutable, since: 本次提交时刻 }`（[`data.asset-model/v1#S-14`](../../../data/asset-model/v1/contract.md#s-14-属性配值)），`immutable` 取输入的那一个、缺席为假；**值与此刻相同而只是加锁时，`since` 不动**（与 [S-40](#s-40-lockassignment-锁住该项) 同）；**随值加锁替换这一层自己已上锁的值时，值变了 `since` 取本次提交时刻**；两道锁的判定与写入同提交 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `lockedHere` · `valueOutOfDomain` · `layerNotAllowed` · `selectionNotSingleTier` · `lockedAbove` · `unavailable`。**后四个都要先由声明知道这一项是什么**（设置还是权限、是不是凭据类、是不是分档、写的是界还是挑选），所以一律排在 `valueOutOfDomain` 之后（2026-09-24 改：`lockedAbove` 原先排在它之前）。`layerNotAllowed` 先于 `selectionNotSingleTier`：这一层根本不收这一项，谈不上挑得对不对；`selectionNotSingleTier` 先于 `lockedAbove`：一条多档的挑选与界比较没有意义 |
| ⑦ | **同值同锁重放**——这一层该项此刻恰是这一对（`value`，`immutable`）⇒ `ok`，无二次效果，**`since` 不动**、不发事件。不带锁的同值写遇到这一层已上锁的同一个值，不是这一对，照 `lockedHere` |
| ⑧ | 读不到 ⇒ `unavailable`。**声明推不出**（这一类的属性项投影规则缺席，[G-5](#十二已知缺口)）⇒ `unavailable`——**不得当成 `valueOutOfDomain`，也不得不校验就写**。**`mcp` 的逐动作项**（`execute:` 开头）写时拿哪一份动作集推声明本版未定（[`data.mcp-endpoint/v1#S-15`](../../../data/mcp-endpoint/v1/contract.md#s-15-推出规则的输入正文与动作集)）⇒ 这一类项 `unavailable`（[G-5](#十二已知缺口)）。持有所指的记录已被删除 ⇒ 没有任何声明 ⇒ `valueOutOfDomain` |
| ⑨ | `AssignmentChanged`——值变了（带不带锁）发 `change = assigned`；值不变、只由不带锁变为带锁发 `change = locked`；只在真的改了时发，一次提交一条 |

**`lockedAbove` 在这里是 [acceptance](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景) 的「组织给某 tool 的执行权限配『问一下』并加锁 ⇒ 成员改不了，且被告知这是组织锁定的」**：成员挑「自动」落在界外 ⇒ `lockedAbove`；挑「问一下」落在界内，照写，与组织锁下的值一样。组织给执行权限配「禁止」、**不锁**，成员挑「自动」⇒ 同样 `lockedAbove`（acceptance「仍然禁止」那一行；主线裁定 2026-09-24 R2-9）。
「组织层的同一项」按（能力标识, 项名）对齐——求值也按它把两层的值叠起来；它是写时守卫，[效果的权威在求值](#s-2-本契约不拥有什么)。

**租户的挑选只要落在界内，不必是界的子集**：非分档的项上，一条多值的挑选与界相交即算数，值是交集（`capability.asset-evaluation/v1#S-23` 第 2 条）；分档的项上挑选恰一档，落在界内就是那一档在界里。**2026-09-24 改**（主线裁定 R2-9）：此前「租户配的值不必是组织那一层允许集合的子集，选了组织没给的那一档结果就是空集、本契约只校验是枚举的子集」按「不锁的也是界、一起取交集」读，作废——[PF-002 §5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) 起不锁的只是挑选，挑到界外的不生效，写入面就在门口挡下它。
**多档的界与空集的界一步写下**：带 `immutable` 为真的一次配值（主线裁定 2026-09-24，关闭 [G-24](#十二已知缺口)）——「组织把执行权限锁成『问一下』『禁止』两档」就是 `assign(…, value: {"allowed": ["ask", "forbid"]}, immutable: true)`。[PF-002 flows §1.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#12-配置一个资产的设置或权限) 与 [§3.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值) 的两步流程不变，只是允许一步完成；不带锁的一步仍只收一档。

**配值不经工作区**（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)），所以「工作区配不了 `immutable`、权限、落点与身份类」在本契约里**没有要挡的写入**；那道过滤在工作区的读入面。

**凭据类配值的值是 `CredentialRef`，不是凭据本身**（`data.asset-model` v1）。本契约的读面原样返回这个引用、**从不返回凭据本体**；
[呈现得出的只有有没有、哪一层的、什么时候取的](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)那一半归交付面——
「什么时候取的」就是那条配值的 `since`（主线裁定 2026-09-23，待产品负责人确认；账本 S11-G14，原 G-14 闭合）。

**配值写没有过期编辑守卫**：同一项的两次并发配值，后提交的照写（[G-21](#十二已知缺口)）。

### S-39 clearAssignment 清除配值

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability`、`item` |
| ② | caller 是该范围的管理者；该范围持有该能力标识；这一层该项没上锁 |
| ③ | `scope` 越界 ⇒ `crossTenant`；`item = disabled` ⇒ `invalidInput` |
| ④ | **单次提交**：删掉这一层该项的配值，回到「未配」（[flows §3.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值)） |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `lockedHere` · `unavailable` |
| ⑦ | 本来没配 ⇒ `ok`，无二次效果 |
| ⑧ | 读不到 ⇒ `unavailable` |
| ⑨ | `AssignmentChanged`（`change = cleared`）——只在真的改了时 |

清除从不覆盖任何人，所以**没有 `lockedAbove`**。

### S-40 lockAssignment 锁住该项

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability`、`item` |
| ② | caller 是该范围的管理者；该范围持有该能力标识；**这一层该项有配值** |
| ③ | `scope` 越界 ⇒ `crossTenant`；`item = disabled` ⇒ `invalidInput` |
| ④ | **单次提交**：这一层该项配值的 `immutable` 为真，`since` 不动（值没变）。**不动下层已写下的值**：它们留着，求值时被截断 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `assignmentNotFound` · `unavailable` |
| ⑦ | 已上锁 ⇒ `ok`，无二次效果 |
| ⑧ | 读不到 ⇒ `unavailable` |
| ⑨ | `AssignmentChanged`（`change = locked`） |

**一步写下带锁的值走 [S-38](#s-38-assign-配值) 的 `immutable`**：与本操作接在一次配值之后等价，只是原子——分档权限上多档或空集的界只能这样写下，因为不带锁的那一步只收一档。
**组织层这一格是 [flows §四](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)「把组织级的值标为 immutable：只有超管」**；租户层由本人锁，只挡工作区与会话那两格（推导：[§5.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)「每一层对一个东西可以做两件事」）。

### S-41 unlockAssignment 解除该项的锁

| # | 内容 |
|---|---|
| ① | `caller`、`scope`、`capability`、`item` |
| ② | caller 是该范围的管理者；该范围持有该能力标识；**解锁之后这条值若成了分档权限上的一条挑选，它恰是一档**（`selectionNotSingleTier`；解锁把一条界变成挑选，[S-38](#s-38-assign-配值) 挡的那种挑选不能从这扇门进来——主线裁定 2026-09-24 R2-9，G-25 维持）。只在这条值是一个不恰一档的允许集合时才要读声明。**多档或空集的界的出路是两步**：先以 [S-38](#s-38-assign-配值) 随值加锁改成恰一档的界（这一层自己的锁不挡），再解锁——[flows §3.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值)「已配·immutable → 解锁」这条边在这种界上走两步（主线裁定 2026-09-24，G-25） |
| ③ | `scope` 越界 ⇒ `crossTenant`；`item = disabled` ⇒ `invalidInput` |
| ④ | **单次提交**：这一层该项配值的 `immutable` 为假；值与 `since` 不变。**不回溯** |
| ⑤ | `ok` |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `selectionNotSingleTier` · `unavailable`（要读声明而推不出 ⇒ `unavailable`） |
| ⑦ | 没锁、或这一层没有配值 ⇒ `ok`，无二次效果（「没有锁」这个结果本来就成立） |
| ⑧ | 读不到 ⇒ `unavailable` |
| ⑨ | `AssignmentChanged`（`change = unlocked`）——只在真的改了时 |

#### 读面

**六个读面都现读，都不写，都不发事件。**读不到 ⇒ `unavailable`，**不得返回空列表或少了几项的列表**；空列表在能成立的地方是一个正常答案。

### S-42 listHoldings 列出某范围的持有

| # | 内容 |
|---|---|
| ① | `caller`、`scope`：`{layer: factory}`，或一个 `ScopeLayerIdentity`；工作区 ⇒ `invalidInput`（不经本契约） |
| ② | caller 是该范围的**读者**（[S-16](#s-16-谁能做角色矩阵落成的四种资格)） |
| ③ | `scope` 越界 ⇒ `crossTenant`（出厂层不越界） |
| ④ | 只读，现读 |
| ⑤ | 该范围的全部持有（`AssetHolding` 列表，各带它的依据、版本选用、配值与锁）；**可以为空** |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `unavailable` |
| ⑦ | 只读；结果不得缓存复用而不写明失效条件（[S-20](#s-20-每道准入现读)） |
| ⑧ | 读不到 ⇒ `unavailable`，不得返回空列表或残缺列表 |
| ⑨ | 不发 |

**求值的输入从这里取**：装配以会话捕获的那个 `TenantId` 为 `caller`，分别读出厂层、它所在的组织层、它自己的租户层（工作区那一级另由读入面给）。
**超级管理员读成员的租户层 ⇒ `crossTenant`**（[acceptance §二](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#二绝不能发生的事)「超级管理员能读到成员租户级的私有配置」）。

### S-43 readHolding 读一份持有

| # | 内容 |
|---|---|
| ① | `caller`、`scope`（同 [S-42](#s-42-listholdings-列出某范围的持有) ①）、`capability` |
| ② | caller 是该范围的读者 |
| ③ | `scope` 越界 ⇒ `crossTenant` |
| ④ | 只读，现读 |
| ⑤ | 那一份 `AssetHolding`（带配值与锁） |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `unavailable` |
| ⑦ | 只读 |
| ⑧ | 读不到 ⇒ `unavailable`，**不得收成 `holdingNotFound`** |
| ⑨ | 不发 |

### S-44 organizationSettingsView 组织的设置视图

| # | 内容 |
|---|---|
| ① | `caller`、`organization` |
| ② | caller 是该组织层的读者：该组织的有效成员，任一角色 |
| ③ | `organization` 不是 caller 所在的组织 ⇒ `crossTenant` |
| ④ | 只读，**现读现算、不落盘**（[S-12](#s-12-组织的设置是视图不是对象)） |
| ⑤ | 该组织持有的**每一份**：`{ 持有（同 [S-43](#s-43-readholding-读一份持有) ⑤）, 表单 }`。**表单**是这份持有选用的那一版推出的属性声明（`AttributeDeclaration` 列表）；**已禁用的照样在、标着已禁用**（[§6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)）；plugin 的那份另列它的成员能力标识。**某一份的表单推不出**（投影规则缺席）或**所指记录已被删除**，那一份的表单位置上是一个**显式的「推不出」／「记录已不存在」**，不是空表单 |
| ⑥ | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `unavailable` |
| ⑦ | 只读；不得缓存复用而不写明失效条件 |
| ⑧ | **持有读不到** ⇒ `unavailable`，不返回一份少了几块的视图。单份表单推不出**不是**整次失败——那一份在、标着推不出；**「推不出」与「没有任何项」是两个值** |
| ⑨ | 不发 |

**plugin 成员的表单**：[加入 plugin，内含成员的表单一并出现](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)。
成员靠哪份正文推出表单、它们的配值挂在哪，取决于 `data.asset-model` v1 怎样表示 plugin 成员，本版未定（[G-12](#十二已知缺口)）；本视图**只列成员能力标识**。

### S-45 listReferrers 列出一份记录的引用方

| # | 内容 |
|---|---|
| ① | `caller`、`asset` |
| ② | caller 此刻有效；记录可见；caller 是**记录所有者一侧**（所有者是 caller 本人，或是 caller 的组织而 caller 有组织范围创作权），**或**是某个持有它的范围的管理者 |
| ③ | 无 |
| ④ | 只读，现读 |
| ⑤ | `{ 持有方: [ { holder, basis } ], 组合引用方: [ { holder, asset, capability } ], 租户层持有份数: N }`——前两段**只含 [S-13](#s-13-引用方) 给 caller 列入的范围**，都**可以为空**；**份数只在 caller 是所有者一侧时出现**（[S-13](#s-13-引用方)），其余调用方的结果里没有这一项，**不是 0** |
| ⑥ | `invalidInput` · `notPermitted` · `assetNotFound` · `unavailable` |
| ⑦ | 只读。**它是给「先告知」用的一次读数**，写操作以提交时现求为准（[S-22](#s-22-先告知再移除或删除)） |
| ⑧ | 读不到、**或某一类的组合引用抽取规则缺席** ⇒ `unavailable`，**不得返回一份少了几项的清单**。记录已不存在 ⇒ `assetNotFound` |
| ⑨ | 不发 |

**②不满足时给 `notPermitted`，不给 `assetNotFound`**：走到②的调用方已经看得见这份记录（[S-14](#s-14-可见与不泄漏存在性)），没有存在性可泄漏。

### S-64 readAsset 读一份资产记录

| # | 内容 |
|---|---|
| ① | `caller`、`asset` |
| ② | caller 此刻有效；记录可见（[S-14](#s-14-可见与不泄漏存在性)） |
| ③ | 无 |
| ④ | 只读，现读 |
| ⑤ | 这份记录：能力标识、来源、所有者与作者（official 两者缺席，[`data.asset-model/v1#S-6`](../../../data/asset-model/v1/contract.md#s-6-所有者与作者分记)）、`byAgent`、血缘（有则给，[`#S-21`](../../../data/asset-model/v1/contract.md#s-21-复制血缘)）、版本线上每一版的号、`publishedAt`、`publishedBy`——**不含各版正文**（经 [S-65](#s-65-readversion-读一个已发布版本) 读）。**草稿只给对所有者有创作权的调用方**（同 [S-25](#s-25-updatedraft-修订草稿) ②）；其余调用方的结果里草稿位置是一个显式的「不向你展示」，**不是**「没有草稿」。**记录已被删除而调用方那一层仍持有它** ⇒ 结果是「已删除」，不返回任何内容（[S-28](#s-28-delete-删除一份资产记录) ④） |
| ⑥ | `invalidInput` · `notPermitted` · `assetNotFound` · `unavailable` |
| ⑦ | 只读；结果不得缓存复用而不写明失效条件（[S-20](#s-20-每道准入现读)）——草稿与版本线都会变 |
| ⑧ | 读不到 ⇒ `unavailable`，**不得收成 `assetNotFound`** |
| ⑨ | 不发 |

**它是创作界面、资产流转与求值组输入读记录的那个面**（原 G-9 闭合，账本 S11-G9）。**它不是指向资产的邀约要的存在性读面**：那一个归资产流转自己（[它的 S-7](../../asset-transfer/v1/contract.md#s-7-两类待确认件共用的过期语义)），不带本条的授权前置。

### S-65 readVersion 读一个已发布版本

| # | 内容 |
|---|---|
| ① | `caller`、`asset`、`number`（正整数） |
| ② | caller 此刻有效；记录可见（[S-14](#s-14-可见与不泄漏存在性)）；**`number` 是它的已发布版本** |
| ③ | 无 |
| ④ | 只读，现读 |
| ⑤ | 那一版 `AssetVersion`（[`data.asset-model/v1#S-9`](../../../data/asset-model/v1/contract.md#s-9-版本线)：号、正文、`publishedAt`、`publishedBy`）。**记录已被删除而调用方那一层仍持有它** ⇒ 结果是「已删除」，**不返回正文**——归档不可解引用（[S-28](#s-28-delete-删除一份资产记录) ④） |
| ⑥ | `invalidInput` · `notPermitted` · `assetNotFound` · `versionNotPublished` · `unavailable` |
| ⑦ | 只读。已发布版本不可变，**唯一的失效条件是记录被删除或调用方不再看得见它** |
| ⑧ | 读不到 ⇒ `unavailable`；`number` 缺席或不是正整数 ⇒ `invalidInput` |
| ⑨ | 不发 |

**`current` 落到哪个号**：读 [S-64](#s-64-readasset-读一份资产记录) 的版本线取末尾，再用本条读那一版；两次读之间有新发布时，按第二次读到的为准——求值要的「此刻」由组输入的一方写明（`capability.asset-evaluation`）。

---

## 五、组合入口

### S-46 组合入口：资产流转的确认步骤

资产流转在**落地那一步**要写资产（[PF-003 §6.5](../../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制)～[§6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)、[§6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)），它**调用本契约**，不另写一份。
落地那一步有两种（[PF-003 §4 资产复制](../../../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制)的两条通则）：**本人型**是发起的那一次提交，`caller` 是发起者**在落点组织的那个租户**；**组织型**与要点头的分享是确认的那一次提交，`caller` 是**确认的那个人**。
**两种里 `caller` 都是落进那一层的一侧的租户身份，也都就是作者**——[PF-003 §6.5](../../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制)：本人型的作者是我在那个组织里的租户身份，组织型的作者是 (目标组织, 确认的那位超管)：

| 落地 | 调用 | 与直接入口的差别 |
|---|---|---|
| 首次复制 | [S-24](#s-24-createdraft-创建草稿) ＋ [S-26](#s-26-publish-发布) ＋ [S-30](#s-30-hold-加入持有)（依据自动定为 `owned`：所有者就是落进的那一层） | [S-24](#s-24-createdraft-创建草稿) 另收 `lineage`（`CopyLineage`）。`owner` 是落进那一层的所有者：本人型落他自己的租户级 ⇒ 他这个租户；落组织级（他是那个组织的超管）⇒ 那个组织；组织型 ⇒ 目标组织。`byAgent` 由资产流转照它那一侧的事实给 |
| 重复复制 | [S-25](#s-25-updatedraft-修订草稿) ＋ [S-26](#s-26-publish-发布) | 无差别：`caller` 是落地的行为人，`publishedBy` 因此记他。**配值不动**——本契约的发布本来就不碰配值（[S-10](#s-10-属性配值与两把锁)） |
| 分享成立 | [S-30](#s-30-hold-加入持有) 带 `sharing` | `scope` 是**被分享方那一层**：组织格（组织—组织、个人—个人），或租户格（组织内分享、本人型分享）；`caller` 是那一层的管理者——组织的超管，或那个租户本人。依据是 `shared{sharing}`，版本选用恒为 `current`（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)）。**本契约不核对分享成不成立**，也不要求记录对 caller 可见；那是这一侧的前置 |

**资格照直接入口判，不另开一条**：落他自己的租户级要 [S-16](#s-16-谁能做角色矩阵落成的四种资格) 的**租户范围创作权**（他本人，任一角色）；落组织级要**组织范围创作权**（超管）；分享取持有要**范围的管理者**。
所以[「普通成员把个人组织里的东西复制进自己的租户级，不需要超管确认」](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#四角色与操作)在本契约里**没有要额外放行的东西**，「普通成员选组织级」在资产流转那一侧先以 `notPermitted` 拒掉，到了这里也过不了资格。

**本条对组合入口承担的**：三种写入各自的前置照原条款判（资格、`crossTenant`、唯一性……），写下的东西与直接入口相同。
**它们不自成提交**：本契约与资产流转由**同一提供者**提供，组合入口的写入与资产流转自己的确认落在**同一次提交**里——任何一步被拒，整次确认不留任何效果
（主线裁定 2026-09-23，待产品负责人确认；拆分提案 PA-3、账本 A-M5；[`capability.asset-transfer/v1#S-18`](../../asset-transfer/v1/contract.md#s-18-确认是一次提交同一落点的确认序列化)）。那一次提交覆盖的全部存储对象由提供者设计逐一指出。
**直接入口够不着 `lineage` 与 `sharing`**（[装配给](#s-50-装配给的保证-vs-协议须给的保证)）。
**分享结束之后，经它写下的那份 `shared` 持有留着**，配值随它留（账本 A-M21）；可不可用由求值按分享的判据定，本契约不因分享结束写任何东西。

**撞标识的那一种要由那一侧处理**：落进的那一层已持有同一能力标识时，[S-30](#s-30-hold-加入持有) 给 `alreadyHeld`；
[PF-003 flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)要的是「新增，并告知现在同一能力标识下有两份」——
**新记录可以建（[S-5](#s-5-资产记录与它的两个标识) 允许并存），持有要不要换由那一层自己决定**。

---

## 六、解除成员之后

### S-47 解除成员不动任何持有

**本契约没有任何以成员关系变化为触发的写路径。**成员关系被解除（[`capability.organization-governance/v1#S-38`](../../organization-governance/v1/contract.md#s-38-解除只改成员关系的有效性)）之后：

- 他租户层的持有、配值、他拥有的记录**原样留着**，**不被删、不被迁、不被改键**（[`data.identity-values/v1#S-26`](../../../data/identity-values/v1/contract.md#s-26-成员无效使租户级持有不可达但不销毁)、[`#CS-5`](../../../data/identity-values/v1/contract.md#cs-5-成员无效时不可达但不销毁)）；
- **不可达**由 [S-16](#s-16-谁能做角色矩阵落成的四种资格) 兑现：他的身份此刻 `ineffective`，本契约对它的每一个读写都给 `notPermitted`；**成员资格读不到时给 `unavailable`，绝不据此清理**；
- 他在组织范围创作的记录**留在组织**，作者照旧（[S-7](#s-7-所有者与作者)）；
- 再次加入，回来的是同一个 `TenantId`，那些东西**原样可用**（[PF-001 flows §3.3](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)）。

**这是 `capability.organization-governance/v1#S-38` 那张「三件不做」要资产 owner 承担的那一半**；那一条写明「资产 owner 必须以成员关系的有效性判可达、且不因无效而删持有」，本条就是这个 owner 的承诺。

---

## 七、事件

### S-48 事件都是通知

| 事件 | 何时发出 | 携带什么 |
|---|---|---|
| `AssetPublished` | [S-26](#s-26-publish-发布)、[S-29](#s-29-registerofficial-登记官方件) 追加或新建了版本之后 | `AssetRecordId`、`CapabilityId`、版本号 |
| `AssetPromoted` | [S-27](#s-27-promotetoorganization-提升到组织) 改写了所有者之后 | `AssetRecordId`、新的所有者（组织） |
| `AssetDeleted` | [S-28](#s-28-delete-删除一份资产记录) 之后 | `AssetRecordId`、`CapabilityId`；订阅者含在自己租户层持有它的租户本人（[S-13](#s-13-引用方)） |
| `HoldingChanged` | [S-29](#s-29-registerofficial-登记官方件)（建出厂层持有）、[S-30](#s-30-hold-加入持有)～[S-37](#s-37-unpinversion-回到追随当前版本) 改变了状态之后 | `holder`、`CapabilityId`、`change` ∈ `added` `removed` `disabled` `enabled` `replacement_locked` `replacement_unlocked` `version_pinned` `version_unpinned`（闭合） |
| `AssignmentChanged` | [S-38](#s-38-assign-配值)～[S-41](#s-41-unlockassignment-解除该项的锁) 改变了状态之后 | `holder`、`CapabilityId`、`item`、`change` ∈ `assigned` `cleared` `locked` `unlocked`（闭合） |

**必发，只在状态真的改变时发，每次改变恰一次**；幂等的重放不发。**事件不携带配值的值**——要值就去读，读要过资格。

**每个事件另带操作者与依据**：操作者是这次写入的 `caller`（组合入口是落地的行为人——本人型的发起者在落点组织的那个租户，组织型与要点头的分享是确认的那个人；[S-29](#s-29-registerofficial-登记官方件) 没有调用方，读作装配）；依据是放行它的那一种资格（[S-16](#s-16-谁能做角色矩阵落成的四种资格)；组合入口是资产流转的落地（发起或确认），[S-29](#s-29-registerofficial-登记官方件) 是部署清单）。连同表里的范围、对象与变更，[PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果) 要的五样齐了——**这些事件落成的记录条目就是审计**（[S-3](#s-3-本契约明确不承诺什么)，账本 S11-G17）。

**五个都是通知，含义是三条负向承诺**（与[组织治理 S-40](../../organization-governance/v1/contract.md#s-40-事件都是通知)同一口径）：
发出方不等待、不读返回值；监听者失败、缺席或没有，不改变已提交的事实；**没有任何一条性质靠「某个监听者收到了它」成立**。

- **注册表的重填不靠它成立。**reload 一族按[此刻的求值结果](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)重填，
  事件只是一个「该刷了」的提示；漏一次，下一次 reload 或装配照样读到新状态。
- **撤销不靠它成立**（[S-20](#s-20-每道准入现读)）。
- **事件携带的 `holder` 不是隔离**（[`data.identity-values/v1#S-23`](../../../data/identity-values/v1/contract.md#s-23-不得冒充隔离)）：租户层的事件只能给那个租户的订阅者，订阅走与读同一套资格判定（[`#S-20`](../../../data/identity-values/v1/contract.md#s-20-六条路径同一判定)）。

### S-49 本版不开控制类事件

**锁、禁用、引用方确认都是操作自身的同步前置，在同一提交内判**（[S-21](#s-21-读到的依据与写入落在同一次可串行化的提交里)）。
将来若开成扩展点，**任何参与放行判定的扩展点要么是同步前置，要么是逐个等待结论的顺序派发，不得用「发出即不等待」的派发**。
它在本项目内核上的投影是提供者设计的事，不是本契约的条款。

---

## 八、性质与前提

性质的来源一律引 PF 小节；**编号只在本表内作行标，不是可外部引用的条款号**。

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **同一范围 × 能力标识至多一份持有** | [S-30](#s-30-hold-加入持有) 的 `alreadyHeld` ＋ 存储唯一约束 | 存储兑现唯一约束（[S-50](#s-50-装配给的保证-vs-协议须给的保证)） | [PF-002 Connector](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector)「同一身份在同一层只有一份持有、一份配值」 |
| **版本号从 1 起逐一连续，已发布版本不可变** | [S-26](#s-26-publish-发布) 的 `expected` 比对 ＋ 本契约无改写版本的路径 | 比对与追加同提交 | [flows §3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)、[PF-001 §6.7 其余](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#其余) |
| **来源产生时定、此后不变；official 只由登记产生；每个能力标识至多一份 official 记录** | [S-5](#s-5-资产记录与它的两个标识)、[S-29](#s-29-registerofficial-登记官方件)：没有收 `origin` 的操作 | — | [PF-001 §4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized) |
| **作者不变；所有者只从租户变成它所在的组织，且只一次** | [S-7](#s-7-所有者与作者)、[S-27](#s-27-promotetoorganization-提升到组织) | — | [PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) |
| **任何一层都没有为官方件配过 `disabled = 真`** | [S-32](#s-32-disable-禁用) 的 `officialImmutable` | — | [PF-001 §4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized) |
| **出厂层的持有只增不减** | [S-9](#s-9-持有本契约写得到的两层与写不到的两层)：写面构造不出出厂层 | — | [PF-001 §6.1](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次) |
| **出厂层持有带锁，当且仅当它的能力标识是 meta 能力** | [S-29](#s-29-registerofficial-登记官方件) 按部署清单写 `immutable`；别的写面构造不出出厂层 | `meta` 如实（[S-50](#s-50-装配给的保证-vs-协议须给的保证)） | [PF-002 §5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)、[`data.asset-model/v1#S-20`](../../../data/asset-model/v1/contract.md#s-20-出厂格与工作区格的持有) |
| **配值只存在于存在的持有上** | [S-31](#s-31-unhold-移除持有) 同提交删掉配值；[S-38](#s-38-assign-配值) 要求持有在 | — | [flows §3.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值) |
| **所指记录存在时，每份 `owned`／`official` 持有与靠所有权的 `organization` 持有，依据此刻成立**；靠组织层持有同一份的 `organization` 持有，依据在写入那一刻成立，此后只会因组织层那份被移除或分享不再生效而失去，失去时读作这一格没有持有（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)） | [S-30](#s-30-hold-加入持有) 自动定依据；所有者唯一的写路径 [S-27](#s-27-promotetoorganization-提升到组织) 同提交重算 caller 那一份的依据；经写面持有它的其余各方只可能是被分享方，它们的分享在同一提交里结束 | 同提交（[S-21](#s-21-读到的依据与写入落在同一次可串行化的提交里)）。`shared` 成不成立归资产流转 | [PF-001 §4 拥有、获权、选用](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用) |
| **`shared` 的持有版本选用恒为 `current`；`pinned` 的号是所指记录的已发布版本** | [S-30](#s-30-hold-加入持有)、[S-36](#s-36-pinversion-钉住一个版本) 的 `notOwner` 与 `versionNotPublished`；本契约没有删除单个版本的路径 | — | [PF-003 §6.11](../../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保)、[flows §3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本) |
| **`AssetRecordId` 不指向第二份记录** | [S-5](#s-5-资产记录与它的两个标识) | 单一生成点（[S-50](#s-50-装配给的保证-vs-协议须给的保证)） | [`data.offer-expiry/v1#S-19`](../../../data/offer-expiry/v1/contract.md#s-19-规则与读面归属) |

**写明一条不是不变量的**：「每份持有指向的记录都存在」**不成立**——删除不级联（[S-22](#s-22-先告知再移除或删除)），被删记录的持有方可能还没移除它。求值怎样对待这种持有是 [G-7](#十二已知缺口)。

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **一个租户写进或读到另一个租户那一层——含超级管理员读写成员的租户层** | [S-15](#s-15-结构性禁止不是权限判定) 的 `crossTenant`：纯值比较，先于一切读取 | 调用方身份已核实（[S-50](#s-50-装配给的保证-vs-协议须给的保证)） | [acceptance §二](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#二绝不能发生的事)、[PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) |
| **普通成员写组织层** | [S-16](#s-16-谁能做角色矩阵落成的四种资格) 的管理者资格 | 成员资格现读 | [flows §四](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作) |
| **组织加了替换锁或项锁之后，租户层的替换（持有另一份记录）、改版本或覆盖设置项写得进去；租户层把一项权限的值（挑选或界）写到组织那一层的界外写得进去（界含执行权限上不锁的 `{forbid}`）** | [S-30](#s-30-hold-加入持有)、[S-36](#s-36-pinversion-钉住一个版本)、[S-38](#s-38-assign-配值) 的 `lockedAbove`，与组织层的锁与配值写入串行化（[S-21](#s-21-读到的依据与写入落在同一次可串行化的提交里)） | 可串行化 | [acceptance §二](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#二绝不能发生的事)「成员绕过组织的 immutable」；[PF-002 §5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)「锁不锁都是界」 |
| **分档的权限上写进一条不恰一档的挑选** | [S-38](#s-38-assign-配值)、[S-41](#s-41-unlockassignment-解除该项的锁) 的 `selectionNotSingleTier` | 声明推得出 | [PF-002 §5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)「分档的权限，求出来都恰好是一档」；主线裁定 2026-09-24 R2-9 |
| **一个层为它不持有的资产配值** | [S-38](#s-38-assign-配值) 的 `holdingNotFound` | — | [flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常) |
| **被分享方改了被分享来的资产** | [S-25](#s-25-updatedraft-修订草稿)、[S-26](#s-26-publish-发布)、[S-28](#s-28-delete-删除一份资产记录) 的 `notOwner` | — | [PF-003 flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常) |
| **官方件被禁用、编辑、删除，或出厂层那份被移除** | [S-8](#s-8-official-记录与出厂默认层的持有) 的五条 | — | [PF-001 acceptance §二](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#二绝不能发生的事) |
| **没告知就移除或删除了一份有引用方的资产；或静默级联删除了引用方** | [S-22](#s-22-先告知再移除或删除) | 引用方现求与写入同提交 | [flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)、[PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果) |
| **过期的编辑静默盖掉别人已发布的修改** | [S-25](#s-25-updatedraft-修订草稿) 的 `basedOn`、[S-26](#s-26-publish-发布) 的 `expected` | 比对与写入同提交 | [PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果) |
| **被分享方把被分享来的资产钉在某个版本上** | [S-30](#s-30-hold-加入持有)、[S-36](#s-36-pinversion-钉住一个版本) 的 `notOwner` | — | [PF-003 §6.11](../../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保) |
| **agent 产出被记成人产出** | [S-24](#s-24-createdraft-创建草稿) 的 `byAgent` 必填、无默认 | `byAgent` 如实（[S-50](#s-50-装配给的保证-vs-协议须给的保证)） | [PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识) |
| **已发布的版本被就地改写** | 本契约没有这条路径 | — | [acceptance §二](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#二绝不能发生的事) |
| **一条 ① ② 型斜杠命令带着系统保留前缀创建或发布成功** | [S-24](#s-24-createdraft-创建草稿)、[S-25](#s-25-updatedraft-修订草稿)、[S-29](#s-29-registerofficial-登记官方件) 按 [`data.slash-command/v1#S-4`](../../../data/slash-command/v1/contract.md#s-4-保留区只归系统提供的命令型) 收 `invalidInput` | — | [acceptance §二](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#二绝不能发生的事) |
| **解除成员把他的租户级持有清掉** | [S-47](#s-47-解除成员不动任何持有)：没有这条写路径 | — | [PF-001 acceptance §二](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#二绝不能发生的事) |
| **读不到被说成「没有」「无权」或空列表** | [S-18](#s-18-失败值闭合) 的 `unavailable`、各操作⑧ | — | [`data.identity-values/v1#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败) |
| **从拒绝值里试探出别人的私有记录在不在** | [S-14](#s-14-可见与不泄漏存在性) | — | [PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) |
| **拒绝之后留下部分效果** | 全部写操作的④：依据与写入同提交 | 存储原子性 | [PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果) |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| 加入、移除、禁用、启用、锁、配值成功返回之后，**下一次**读面即反映它 | 下一次读 | 存储可用 | [flows §1.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#11-给组织加一个资产)（表单「自动长出」）、[§1.5](../../../../product/PF-002-assets-settings-and-permissions/flows.md#15-不让成员用某个工具) |
| 提升成功返回之后，**下一道**准入按组织所有判 | 下一道准入 | 同上 | [PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) |
| 被拒的操作**立即**返回一个具名值，且不留部分效果 | 该次返回 | 存储原子性 | [PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果) |
| 状态改变的每次提交之后，**恰发一次**对应事件 | 提交之后 | 发出方存活到派发（**不约束送达**） | [S-48](#s-48-事件都是通知) |

---

## 九、装配给的保证 vs 协议须给的保证

### S-50 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：右列是本契约已记下的待兑现项，**每一行都写做不到会怎样**。

| 保证 | 本版（单机）由谁给 | 跨进程之后谁重新兑现 | 做不到会怎样 |
|---|---|---|---|
| **调用方身份已经核实过**（除 [S-29](#s-29-registerofficial-登记官方件) 外全部操作） | **装配给**：本契约的面是能力间内部面；入口层先把登录状态换成当前租户身份，再带着 `caller` 调本契约 | **协议给**：携带授权依据，在接收边界重新验证（[`data.identity-values/v1#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)） | 谁拿到一个 `TenantId` 就能以它的名义改那一层的持有与配值——**全部资格判定都以「身份值是真的」为前提** |
| **[S-29](#s-29-registerofficial-登记官方件) 只在装配启动时按部署的官方件清单调用，`meta` 如实取自清单** | **装配给**：只有装配够得着它 | **协议给**：在接收边界鉴别调用方是这一份部署的装配 | 任何人都能往出厂层塞一份官方件，**它不可禁、不可删**（[S-8](#s-8-official-记录与出厂默认层的持有)）；或把一个 meta 能力标成非 meta，让它可被替换 |
| **`byAgent` 如实**（[S-24](#s-24-createdraft-创建草稿)） | **装配给**：入口层按这次调用从哪来定它——agent 的运行里发起的为真，人经交付面发起的为假；**不取自请求体** | **协议给**：随授权依据携带，在接收边界重新验证 | agent 产出被记成人产出（或反之）：[PF-002 acceptance](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)的「记录标明由 agent 产出」与审计一起失真 |
| **组合入口只由资产流转的落地步骤调用**（[S-46](#s-46-组合入口资产流转的确认步骤)） | **装配给**：直接入口不暴露 `lineage`、`sharing` | **协议给**：鉴别调用方是资产流转能力 | 任何人都能伪造血缘（让下一次复制覆盖错的那一份）、以别人的名义署名、凭空声称「被分享」而持有别人的资产 |
| **组合入口的写入与资产流转的落地同一次提交**（[S-46](#s-46-组合入口资产流转的确认步骤)） | **装配给**：同一提供者、同一存储、同一事务 | **协议给**：两份契约若分到两个节点，要跨节点原子提交，或重新合到同一个写者 | 记录建了、通知还悬着，或通知确认了、记录没建；本人型：分享记录建了、持有没写 |
| **删除、提升与资产流转结束分享同一次提交**（[S-27](#s-27-promotetoorganization-提升到组织) ④、[S-28](#s-28-delete-删除一份资产记录) ④；[`capability.asset-transfer/v1#S-52`](../../asset-transfer/v1/contract.md#s-52-分享方删除资产或所有权易手分享随之结束)） | **装配给**：同一提供者、同一存储、同一事务——资产记录与分享记录在同一个存储里，删除或所有者改写与分享记录置 `revoked` 落在同一个事务 | **协议给**：两份契约若分到两个节点，要跨节点原子提交，或重新合到同一个写者 | 记录已删或所有者已改，那段分享却仍是 `active`：提升之后组织级的东西经原所有者的分享落在别人的租户级（`shared` 的生效判据不看「分享方此刻仍是所有者」）；删除之后分享指向一份不存在的资产 |
| **同一范围 × 能力标识至多一份持有** | **装配给**：存储唯一约束 | **协议给**：跨节点唯一分配 | 同一层出现两份同标识持有，「谁生效」有两个答案 |
| **读到的依据与写入同提交、可串行化**（[S-21](#s-21-读到的依据与写入落在同一次可串行化的提交里)，含谓词读） | **装配给**：同一存储 | **协议给**：跨节点协调（单一写者或等价协议），并定义谓词读的一致性 | 锁生效之后租户层照样写进去；两次发布写出两个 v`n`；确认过的引用方集合之外冒出一个新的而删除照样成功 |
| **`AssetRecordId` 部署内唯一、不回收** | **装配给**：单一生成点 | **协议给**：跨节点分配 | 一份指向已删除资产的邀约在别的节点上「复活」、指到另一份东西（[`data.offer-expiry/v1#S-19`](../../../data/offer-expiry/v1/contract.md#s-19-规则与读面归属)） |
| **成员资格与角色的新鲜度**（[S-20](#s-20-每道准入现读)） | **装配给**：写后即可被下一次读看到 | **协议给**：传播时延上界，写进契约 | 被降级的超管在上界内仍能改组织层——**上界不能默认为零** |
| **本契约拥有的全部事实可整体导出、在另一处导入后原样成立**（记录、版本、持有、配值、锁、创建键登记；[S-51](#s-51-依赖的提供者不可用)） | **装配给**：它们都在同一存储里，以显式身份值为键，值按 `data.asset-model/v1#S-25` 可序列化，没有一条只活在运行实例内 | **协议给**：云端存储与双向同步时，导出与导入保持标识不回收、版本线只增、同一格同一能力标识至多一份 | 一次迁移或同步之后同一个 `AssetRecordId` 指到两份东西，或一份持有指到一个从没分配过的号 |
| **事件在提交之后才派发** | **装配给**：同进程里提交返回之后再派发 | **协议给**：跨进程派发不得早于提交可见（本契约本来就**不承诺送达**，这一行只管「不早于」） | 监听者据一次随后被回滚的变化去重填或提示——**重填读的是此刻状态，结果仍对，但人会看到一次没发生过的「已变更」** |

---

## 十、交接、缺席与恢复

### S-51 依赖的提供者不可用

**组织治理的两个读面、存储、某一类正文的两条规则不可用时，依赖它的操作以 `unavailable` 明确失败，不静默降级**：
不得跳过成员资格判定直接写、不得把「读不到锁」当成「没锁」、不得不校验就写配值、不得把求不出的引用方当成没有。

**本能力自己被撤除或替换时**，它拥有的全部事实都在存储里（记录、版本、持有、配值、锁、创建键登记），
**没有一条只活在运行实例内**；所有写操作都在单次提交内结算，**没有在途的多步事务需要交接**。
组合入口的写入与资产流转的落地（发起或确认）同一次提交（[S-46](#s-46-组合入口资产流转的确认步骤)），**也没有在途的交接**。
**这是一条可被推翻的承诺**：任何引入跨提交在途状态的修改都会使它失效，那时回到本节重写交接责任。

### S-52 撤销不发出停止信号

移除、禁用、锁、删除、提升**都只影响下一道尚未通过的准入与此后的求值**。本契约**不发出任何停止、中断或取消信号**，
也不承诺任何正在运行的工作因此停下（[flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)「资产在运行中被替换或移除：不影响已经开始的调用」、
[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)）。

---

## 十一、规范表达与验证义务

### S-53 本版选用哪些形式工件

**不建行为模型，不建结构模型，不附 Schema。**

| 性质 | 表达 | 理由 |
|---|---|---|
| 每个操作的前置、失败与收场 | **规范场景**（[S-54](#s-54-结构性禁止与权限判定分得开)～[S-63](#s-63-钉住的不随发布走分享来的钉不住)）＋ [`examples.md`](examples.md) | [flows §3.1～§3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里) 的三张状态机，**每条转移都是一步守卫、一次提交**，没有两步合起来才违反的不变量 |
| [S-21](#s-21-读到的依据与写入落在同一次可串行化的提交里) 的串行化 | **并发演练**（[S-55](#s-55-上层锁住的下层写不进去解锁不回溯)、[S-58](#s-58-先告知再移除)、[S-59](#s-59-版本号连续与认回)） | 要证的是**存储真的兑现了可串行化**，它是装配给的前提，不是一条自定义并发协议；模型证不了存储 |
| 锁截断、禁用析取、工作区滤权、团队资产不出那棵树 | **不在本契约** | 它们是求值的结构性质，模型归 `capability.asset-evaluation` v1 |
| 数据形状 | **不在本契约** | 归 `data.asset-model` v1 的 Schema；在这里再建一份就是第二份权威 |

执行状态与结果在[验证入口](../verification.md)，不写进本版本目录。

### 规范场景

#### S-54 结构性禁止与权限判定分得开

组织 `O` 的超级管理员 `S` 与普通成员 `M`。依次：`S` 调 [S-38](#s-38-assign-配值) 写 `M` 的租户层；`S` 调 [S-42](#s-42-listholdings-列出某范围的持有) 读 `M` 的租户层；`M` 调 [S-30](#s-30-hold-加入持有) 写组织层；另一组织的超管 `P` 调 [S-30](#s-30-hold-加入持有) 写组织层 `O`。

**必须观察到**：前两次 `crossTenant`，第三次 `notPermitted`，第四次 `crossTenant`；**四次都不写任何东西**。
**`S` 必须是超管**——这是区分「结构性」与「权限不够」的那个输入。

#### S-55 上层锁住的，下层写不进去；解锁不回溯

组织层持有能力标识 `C` 并对**设置项** `x` 配值加锁、对持有加替换锁。租户层 `T`（已先持有 `C` 并配过 `x = v0`）随后：
[S-38](#s-38-assign-配值) 配 `x` ⇒ `lockedAbove`；另一个租户 `T'` [S-30](#s-30-hold-加入持有) 一份同标识自己的记录 ⇒ `lockedAbove`；第三个租户 `T''` [S-30](#s-30-hold-加入持有) 以 `current` 持有组织层那**同一份** ⇒ `ok`（依据 `organization`；同一份记录不算替换），以 `pinned` 持有 ⇒ `lockedAbove`，它配 `x` ⇒ `lockedAbove`（项锁照挡）；
组织解除两把锁之后，`T` 配 `x` ⇒ `ok`，`T'` 持有 ⇒ `ok`。**`T` 那条 `x = v0` 在加锁、解锁前后都原样在**（锁不删下层，解锁不回溯）。
**权限一支**（主线裁定 2026-09-24 R2-9）：组织层把 `C` 的执行权限配成「问一下」并加锁。`T` 挑「自动」⇒ `lockedAbove`；挑「问一下」⇒ `ok`；挑「问一下」「禁止」两档 ⇒ `selectionNotSingleTier`；配「禁止」⇒ `lockedAbove`（它也是界，但界也要落在外层界内，G-25 裁定）。组织解锁并改配「禁止」、**不锁**之后，`T` 挑「自动」⇒ `lockedAbove`。组织再以**随值加锁**一步写下「问一下」「禁止」两档（`immutable: true`）⇒ `ok`，不收 `selectionNotSingleTier`；`T` 挑「自动」⇒ `lockedAbove`，挑「禁止」⇒ `ok`，随值加锁写「自动」⇒ `lockedAbove`。组织以**不带锁**的配值改那条两档的界 ⇒ `lockedHere`；对它 [S-41](#s-41-unlockassignment-解除该项的锁) 解锁 ⇒ `selectionNotSingleTier`；**出路是两步**：随值加锁改成「问一下」一档 ⇒ `ok`（这一层自己的锁不挡，事件 `assigned`），再解锁 ⇒ `ok`。组织以随值加锁写下空集 ⇒ `ok`（PF-002 §5.3「锁成空集」）。**每一次被拒都不写任何东西**。
**并发一支**：`T` 的配值与组织的加锁**真并发**，**必须观察到**要么配值先成（随后被锁截断），要么被拒，**不出现「锁已提交而配值在它之后写进去」**。

#### S-56 移除与禁用可分辨

组织层对 `C` 配好两项值。一次 [S-32](#s-32-disable-禁用) 后 [S-44](#s-44-organizationsettingsview-组织的设置视图)：那一份**还在、标着已禁用、两项值原样**；[S-33](#s-33-enable-启用) 之后值还是那两项。
另一次 [S-31](#s-31-unhold-移除持有) 后读：那一份**不在了**；再 [S-30](#s-30-hold-加入持有) 加回来，**配值是空的**。

#### S-57 official 动不了，但可以不持有

对一个官方件：组织层 `basis = official` 持有它（[S-30](#s-30-hold-加入持有)）⇒ `ok`；[S-32](#s-32-disable-禁用) ⇒ `officialImmutable`；
[S-25](#s-25-updatedraft-修订草稿)／[S-26](#s-26-publish-发布)／[S-28](#s-28-delete-删除一份资产记录)／[S-27](#s-27-promotetoorganization-提升到组织) ⇒ `officialImmutable`；
[S-31](#s-31-unhold-移除持有) 移除组织层那份 ⇒ `ok`，**随后 [S-42](#s-42-listholdings-列出某范围的持有) 读出厂层，那一份还在**。
**另跑一支**：[S-29](#s-29-registerofficial-登记官方件) 以同一内容连调两次 ⇒ 版本数不变、只有一份出厂层持有。

#### S-58 先告知再移除

组织层持有 plugin `P` 与 skill `K`，`P` 的成员含 `K` 的能力标识。[S-31](#s-31-unhold-移除持有) 移除 `K` 不带确认 ⇒ `hasReferrers`，**返回的集合里有 `P`**，`K` 那份持有还在；
带上那个集合再调 ⇒ `ok`，**`P` 原样还在**（不级联）。**并发一支**：在读到集合之后、提交之前，另一方在同一组织层加入一份也引用 `K` 的资产 ⇒
**必须观察到**这次移除 `hasReferrers`，返回的集合里有那份新的。

#### S-59 版本号连续与认回

记录尚无版本。两方**真并发**以 `expected = 1` 调 [S-26](#s-26-publish-发布)：**恰一方** `ok(1)`，另一方 `versionSequenceBroken`。
成功那一方以同一输入重放 ⇒ `ok(1)`，版本数仍为 1。另一方以 `basedOn = 0` 调 [S-25](#s-25-updatedraft-修订草稿) ⇒ `versionSequenceBroken`，草稿不变。
**必须观察到**版本线是 `[1]`，不是 `[1, 1]` 也不是 `[1, 3]`。

#### S-60 提升不可逆

租户 `T`（超管）拥有记录 `R`、`T` 层持有它（依据 `owned`，配了一项值、钉在 v1）。[S-27](#s-27-promotetoorganization-提升到组织) ⇒ `ok`；再提升 ⇒ `ok`（认回）。
**必须观察到**：所有者是组织、作者仍是 `T`；`T` 层那份持有**还在**，依据是 `organization`，**那一项值与 v1 原样**；本契约的全部操作里**没有一条**能把所有者改回 `T`（静态核对：写所有者的路径恰一条）。
**另跑一支**（主线裁定 2026-09-24 R2-7；此前这一支期望 `hasReferrers`）：`T` 的另一份记录 `R'` 已组织内分享给同组织的成员 `M`、`M` 那一层以 `shared` 持有它 ⇒ 提升 `R'` ⇒ `ok`。**必须观察到**：`R'` 的所有者是组织；那段分享的记录为 `revoked`、原因 `ownerChanged`（资产流转的读面），且与所有者改写**同一提交**——**不存在「所有者已改、分享仍 `active`」的读**；`M` 那份 `shared` 持有与它的配值**还在**（A-M21）。

#### S-61 判不出来与判为拒绝分得开

**故障注入三路**：(a) 成员资格读面以 `unavailable` 失败，调 [S-30](#s-30-hold-加入持有)、[S-38](#s-38-assign-配值)、[S-42](#s-42-listholdings-列出某范围的持有)；
(b) 存储部分不可用，调 [S-42](#s-42-listholdings-列出某范围的持有)、[S-45](#s-45-listreferrers-列出一份记录的引用方)；
(c) 某一类的属性项投影规则缺席，调 [S-38](#s-38-assign-配值)，并读 [S-44](#s-44-organizationsettingsview-组织的设置视图)。
**必须观察到**：(a) 三处 `unavailable`，**不是 `notPermitted`**；(b) `unavailable`，**不是空列表或少了几项的列表**；
(c) [S-38](#s-38-assign-配值) `unavailable`、**不是 `valueOutOfDomain`、也没有写入**，[S-44](#s-44-organizationsettingsview-组织的设置视图) 那一份标着「推不出」、**不是空表单**。

#### S-62 不泄漏存在性

成员 `M` 在自己租户层建一份记录 `R`（不持有到别处）。同组织的超管 `S` 以 `R` 调 [S-25](#s-25-updatedraft-修订草稿)、[S-28](#s-28-delete-删除一份资产记录)、[S-45](#s-45-listreferrers-列出一份记录的引用方)；
再以一个**从未分配过**的 `AssetRecordId` 各调一次。**必须观察到**六次都是 `assetNotFound`，**两组逐字相同**。

#### S-63 钉住的不随发布走，分享来的钉不住

组织 `O` 拥有记录 `R`（v1），组织层持有它（缺省 `current`），成员 `M` 在租户层以 `organization` 依据持有它并 [S-36](#s-36-pinversion-钉住一个版本) 钉在 v1。`R` 发布 v2 之后读两层：
**必须观察到**组织层那份仍是 `current`、表单按 v2 推；`M` 那份仍是 `pinned 1`、表单按 v1 推；**发布没有改动任何一份持有**。`M` 钉 3 ⇒ `versionNotPublished`；[S-37](#s-37-unpinversion-回到追随当前版本) 之后表单按 v2 推，配值原样。
**另跑一支**：组织 `O'` 以分享持有 `R`（组合入口），对它 [S-36](#s-36-pinversion-钉住一个版本) ⇒ `notOwner`，持有仍是 `current`；组合入口带 `pinned` 加入一份分享 ⇒ `notOwner`，不写。

---

## 十二、已知缺口

**缺口不填默认值。**实现不得据一个看起来合理的猜测推进；**每条写明在它闭合前本契约怎么收**。

| # | 缺口 | 本版怎么收 | owner |
|---|---|---|---|
| G-1 | **已闭合**（2026-09-23 本候选内）：版本选用落在持有的 `versionSelection` 上（[S-9](#s-9-持有本契约写得到的两层与写不到的两层)、[S-36](#s-36-pinversion-钉住一个版本)、[S-37](#s-37-unpinversion-回到追随当前版本)）。**编号保留不复用** | — | — |
| G-2 | **已闭合（2026-09-24 整批对齐）**：租户格以 `organization` 依据持有本组织可用的那一份——拥有的或经分享持有的（主线裁定 2026-09-23，待产品负责人确认；账本 S11-G2；[`data.asset-model/v1#S-19`](../../../data/asset-model/v1/contract.md#s-19-使用权来路)），[S-9](#s-9-持有本契约写得到的两层与写不到的两层) 那一行已改。原缺口：租户层持有「被分享给本组织的那一份」：[PF-003 flows §四](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#四角色与操作)末行要「目标侧普通成员在自己租户级配置被分享资产」，`HoldingBasis` 五支里没有这一支（`organization` 只认本组织拥有的，`shared` 只落在组织层）。**本组织拥有的那一份已由 `organization` 闭合**。**编号保留不复用** | — | — |
| G-3 | **普通成员「按被授予的权限」在组织范围创作**：授予的是什么、由谁授予，正文无定义 | 普通成员一律 `notPermitted` | PF-002／PF-001 产品负责人 |
| G-4 | **已闭合**（2026-09-23 本候选内）：`AssetDefinition` 的 `byAgent`，由 [S-24](#s-24-createdraft-创建草稿) 必填写入，如实由装配给（[S-50](#s-50-装配给的保证-vs-协议须给的保证)）。**编号保留不复用** | — | — |
| G-5 | **各类正文契约的两条规则缺的那几格**（[S-4](#s-4-依赖方向与被消费的面) 正文契约侧那张表）：属性项推出缺 `loop_extension`（`data.loop-extension` v1 只标了类别）、`agent_definition` 与 plugin 自己的项；组合引用缺 `agent_definition`。**另有一处输入未定**：`mcp` 的逐动作项在写时拿哪一份动作集推（[`data.mcp-endpoint/v1#S-15`](../../../data/mcp-endpoint/v1/contract.md#s-15-推出规则的输入正文与动作集)、它的 G-4）。tool、skill、slash_command、mcp 的固定项与 connector 已有规则（2026-09-24 整批对齐收窄） | 缺的那一格：[S-38](#s-38-assign-配值) `unavailable`；[S-44](#s-44-organizationsettingsview-组织的设置视图) 那一份标「推不出」；范围里有 `agent_definition` 时 [S-45](#s-45-listreferrers-列出一份记录的引用方)、[S-28](#s-28-delete-删除一份资产记录)、[S-31](#s-31-unhold-移除持有) 求引用方 `unavailable`；`mcp` 的 `execute:` 项 [S-38](#s-38-assign-配值) `unavailable` | `data.loop-extension` v1（推出规则）；PF-004 的契约（agent_definition）；`data.asset-model` v1（plugin 自己的项，它的 G-9）；`data.mcp-endpoint` v1（动作集，它的 G-4） |
| G-6 | **组合图成环在定义时拒绝**本版不兑现。① 「环」怎么读已裁：沿[谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)的有向引用回到自身；那张表允许的互相引用（如 [§5.1 的 Skill ⇄ Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种)）不算环（主线裁定 2026-09-23，待产品负责人确认；账本 S11-G6，产品修订 PF-002 owner 澄清）；② `agent_definition` 的组合引用规则缺（G-5）；③ 失败值不在账本 | [S-26](#s-26-publish-发布) 不判环；环只能在求值那一侧被发现 | 主线账本（③，与 `capability.asset-evaluation` 的 G-1 同名）＋ G-5（②）＋ PF-002 产品负责人（① 的确认） |
| G-7 | **删除之后仍指向它的持有，求值怎样对待**（「删除之后如何，正文未述」，[对象清单](../../../../domain_objects/objects.md#ul-asset--资产)；删除语义本身已裁：已发布版本作不可解引用的归档保留、持有方读到「已删除」，账本 A-M25） | [S-28](#s-28-delete-删除一份资产记录) 不改动它们；[S-31](#s-31-unhold-移除持有) 能移除它们；[S-38](#s-38-assign-配值) 对它们给 `valueOutOfDomain`。**求值怎样对待它们不由本契约答** | `capability.asset-evaluation` v1 ＋ PF-002 产品负责人 |
| G-8 | **已闭合**（2026-09-23 本候选内）：[S-27](#s-27-promotetoorganization-提升到组织) 在同一提交把 caller 那一份持有的依据改为 `organization`，配值不动。**编号保留不复用** | — | — |
| G-9 | **已闭合（2026-09-24 整批对齐）**：资产记录的读面是 [S-64 readAsset](#s-64-readasset-读一份资产记录) 与 [S-65 readVersion](#s-65-readversion-读一个已发布版本)（主线裁定 2026-09-23，待产品负责人确认；账本 S11-G9）；指向资产的邀约要的存在性读面归资产流转（[它的 S-7](../../asset-transfer/v1/contract.md#s-7-两类待确认件共用的过期语义)）。**编号保留不复用** | — | — |
| G-10 | **已闭合（2026-09-24，PF-002 rev 18）**：组织那一层不持有 MCP 凭据，也不配连接件的鉴权绑定——[S-38](#s-38-assign-配值) ② 对组织层的凭据类项（取值域为 `CredentialRef` 的项）一律拒，由缺口转为规则。**编号保留不复用** | — | — |
| G-11 | **已闭合（2026-09-24 整批对齐）**：哪些能力标识是 meta 能力由部署的官方件清单给出，[S-29](#s-29-registerofficial-登记官方件) 按它写出厂层持有的锁（装配给，账本 A-M17 与 S10-f）；[S-30](#s-30-hold-加入持有) 据锁收 `officialImmutable`，与求值的截断同一把锁。**编号保留不复用** | — | — |
| G-12 | **plugin 成员的表单与配值挂在哪** | [S-44](#s-44-organizationsettingsview-组织的设置视图) 只列成员能力标识；成员配值本版写不进来 | `data.asset-model` v1 ＋ `capability.asset-evaluation` v1 |
| G-13 | **资产之外的引用方**（日程等，[PF-001 acceptance](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#一可观察场景)） | [S-13](#s-13-引用方) 不列 | 产品负责人（日程尚无 topic） |
| G-14 | **已闭合（2026-09-24 整批对齐）**：配值带 `since`，[S-38](#s-38-assign-配值) 写、锁与解锁不动（账本 S11-G14）。**编号保留不复用** | — | — |
| G-15 | **已闭合（2026-09-24 整批对齐）**：保留前缀是 `omne-official:`（[`data.slash-command/v1#S-3`](../../../data/slash-command/v1/contract.md#s-3-保留区与它唯一的拼法)），[S-24](#s-24-createdraft-创建草稿)、[S-25](#s-25-updatedraft-修订草稿)、[S-29](#s-29-registerofficial-登记官方件) 按它的 [S-4](../../../data/slash-command/v1/contract.md#s-4-保留区只归系统提供的命令型) 判。**编号保留不复用** | — | — |
| G-16 | **跨进程的协调、传播上界与谓词读一致性**（[S-50](#s-50-装配给的保证-vs-协议须给的保证) 右列） | 本版单机不阻断 | 架构设计 |
| G-17 | **已闭合（2026-09-24 整批对齐）**：审计就是本契约的事件落成的记录条目，不另立（[S-3](#s-3-本契约明确不承诺什么)、[S-48](#s-48-事件都是通知)；账本 S11-G17）。**编号保留不复用** | — | — |
| G-18 | **已闭合（2026-09-24 整批对齐）**：所有者一侧只见本组织成员租户层的持有份数，份数进删除的确认比对，删除的告知发给各持有租户本人（[S-13](#s-13-引用方)、[S-45](#s-45-listreferrers-列出一份记录的引用方)、[S-28](#s-28-delete-删除一份资产记录)；账本 S11-G18）。**编号保留不复用** | — | — |
| G-19 | **已闭合（2026-09-24 整批对齐）**：同一份记录不算替换，[S-30](#s-30-hold-加入持有) 在替换锁之下放行租户以 `organization` 依据、`current` 持有组织层那同一份，配值仍受项锁（账本 S11-G19）。锁下的版本选用见 G-20。**编号保留不复用** | — | — |
| G-20 | **替换锁之下，同一份记录的版本选用能不能与组织层不同**：主线裁定只说同一份记录不算替换，没说版本 | [S-30](#s-30-hold-加入持有) 在锁下只收 `current`、[S-36](#s-36-pinversion-钉住一个版本) 在锁下 `lockedAbove`、[S-37](#s-37-unpinversion-回到追随当前版本) 照常。**组织层自己钉着一版而租户层追随当前版时，两层用的版本不同**——锁没有挡住版本上的分歧；求值取租户层那份的选用 | PF-002 产品负责人 ＋ `capability.asset-evaluation` v1 |
| G-21 | **配值写的过期编辑守卫**（账本 A-M15 后半：配值写带 `expectedVersion`）：守的是配值上的哪个值、对不上收什么失败值，账本都没有 | [S-38](#s-38-assign-配值)～[S-41](#s-41-unlockassignment-解除该项的锁) 不收 `expectedVersion`；同一项的并发配值后提交的照写——**[PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)「过期编辑不得静默覆盖」在配值上本版没有兑现**，这是承认的缺口 | 主线账本（输入与失败值的名字）＋ `data.asset-model` v1（配值上的版本） |
| G-22 | **个人组织被清除之后，它名下的资产记录与持有去向**：[`capability.organization-governance/v1#S-53`](../../organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 只清未激活账号的个人组织，产品正文没说那里的资产怎么办（对账报回 R-A1，低） | 本契约没有以组织清除为触发的写路径（与 [S-47](#s-47-解除成员不动任何持有) 同）；那些记录与持有留在存储里，对它们的按范围操作在 [S-19](#s-19-判定次序) 第 3 步收 `scopeNotFound` | PF-001／PF-002 产品负责人 |
| G-23 | **已闭合（2026-09-24 修订第二轮，主线裁定 R2-10）**：`data.asset-model/v1#S-19` 的 `shared` 支放开到租户格，组织内分享与本人型分享落在被分享的那个租户格上；[S-9](#s-9-持有本契约写得到的两层与写不到的两层)、[S-46](#s-46-组合入口资产流转的确认步骤) 原本就按租户格写，不改。**编号保留不复用** | — | — |
| G-24 | **已闭合（2026-09-24，主线裁定 R2-9 与 G-24 裁定）**：[S-38](#s-38-assign-配值) 加可选的 `immutable`（随值加锁）——同一次提交里写值并锁上，等价于配值→加锁两步原子化；带锁写下的是界，可以多档或空集（空集的依据是 PF-002 §5.3「锁成空集……每一次调用都被拒」原话）；不带锁的仍须恰一档。**编号保留不复用** | — | — |
| G-25 | **已闭合（2026-09-24，主线裁定 G-25）**：一条多档或空集的界原本这一层自己解不开、改不了、清不掉。裁定取「随值加锁可以替换这一层自己已上锁的界」：[S-38](#s-38-assign-配值) 带 `immutable` 为真时这一层自己的锁不构成 `lockedHere`（`lockedHere` 只挡不带锁的改值与清除），前置仍是新界落在外层界内；[S-41](#s-41-unlockassignment-解除该项的锁) 解锁多档或空集的界仍收 `selectionNotSingleTier`，出路是先随值加锁改成恰一档的界、再解锁——[flows §3.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值)「已配·immutable → 解锁」这条边在多档或空集的界上走两步。**编号保留不复用** | — | — |

---

## 十三、消费者核对

本节不新增承诺，只走一遍具名消费者的路径；**不够用的回到上面的缺口，不在消费者那边自己算一份**。

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **治理中心，组织层写面**（[flows §1.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#11-给组织加一个资产)、[§1.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#13-用自定义资产替换-official)～[§1.5](../../../../product/PF-002-assets-settings-and-permissions/flows.md#15-不让成员用某个工具)） | 加入、替换、锁、禁用、移除、配值；设置页 | [S-30](#s-30-hold-加入持有)～[S-41](#s-41-unlockassignment-解除该项的锁)、[S-44](#s-44-organizationsettingsview-组织的设置视图) | **够**；plugin 成员的表单 **不够**（G-12） |
| **治理中心与 CLI/TUI，创作**（[flows §1.7](../../../../product/PF-002-assets-settings-and-permissions/flows.md#17-创作一个资产)） | 建草稿、改、发布、提升 | [S-24](#s-24-createdraft-创建草稿)～[S-27](#s-27-promotetoorganization-提升到组织)、[S-64](#s-64-readasset-读一份资产记录)、[S-65](#s-65-readversion-读一个已发布版本) | **够**：草稿与各版经两个读面；普通成员在组织范围创作仍是 G-3。agent 创作经 `byAgent` 写得进来 |
| **CLI/TUI，租户层** | 自己那一层的持有与配值 | 同组织层那一套，`scope` 换成自己 | **够**：本组织拥有的与经分享持有的那一份都以 `organization` 依据持有、再配值；组织加了替换锁的也能以 `current` 持有同一份（[S-30](#s-30-hold-加入持有)），锁下的版本选用见 G-20 |
| **资产流转（复制落地、分享成立）** | 建落点那一层的记录并带血缘、覆盖成新版本、在组织格或租户格写持有 | [S-46](#s-46-组合入口资产流转的确认步骤) | **够**：写经组合入口、与它的落地同一次提交；租户格的 `shared` 已由 `data.asset-model` 放开（原 G-23 闭合）（[S-46](#s-46-组合入口资产流转的确认步骤)）；提升那一次提交里一并结束分享方的分享（[S-27](#s-27-promotetoorganization-提升到组织)，主线裁定 R2-7）；复制源的内容经 [S-65](#s-65-readversion-读一个已发布版本)；指向的资产在不在由它自己的存在性读面判，读的是 [S-42](#s-42-listholdings-列出某范围的持有)、[S-43](#s-43-readholding-读一份持有) |
| **注册表（reload 一族）** | 知道该刷了；刷时读到此刻的持有 | [S-48](#s-48-事件都是通知) ＋ [S-42](#s-42-listholdings-列出某范围的持有) | **够**：事件只是提示，重填靠读 |
| **资产求值** | 出厂、组织、租户三层此刻的持有与配值；被引用的记录；各持有用哪一版 | [S-42](#s-42-listholdings-列出某范围的持有) | **够**：持有与版本选用经 [S-42](#s-42-listholdings-列出某范围的持有)；`current` 落到哪个号、那一版的正文经 [S-64](#s-64-readasset-读一份资产记录)、[S-65](#s-65-readversion-读一个已发布版本) |
| **`data.offer-expiry/v1#S-19`**（指向资产的邀约） | 标识不回收；存在性读面 | [S-5](#s-5-资产记录与它的两个标识) | **够**：标识不回收由 S-5 给；存在性读面归资产流转（[它的 S-7](../../asset-transfer/v1/contract.md#s-7-两类待确认件共用的过期语义)） |
| **`data.identity-values/v1#CS-1`／`#CS-2`／`#CS-5`** | 持有键、作者与所有者分记、不可达不销毁 | [S-9](#s-9-持有本契约写得到的两层与写不到的两层)、[S-7](#s-7-所有者与作者)、[S-47](#s-47-解除成员不动任何持有) | **够**；CS-2 的 agent 那一行由 `byAgent` 兑现 |
| **`data.identity-values/v1#CS-9`**（「全局」一档授权表达落成租户层配值） | 写租户层的权限配值，写的人要有资格 | [S-38](#s-38-assign-配值)，`scope` 是那个租户、`caller` 必须是他本人 | **够**：[会话里坐着的那个人未必是设权限的那个人](../../../data/identity-values/v1/contract.md#cs-9-全局授权表达落成租户层配值)——本契约只认 `caller` |
| **`capability.organization-governance/v1#S-38`**（资产 owner 不因无效删持有） | 资产一侧的承诺 | [S-47](#s-47-解除成员不动任何持有) | **够** |

---

## 十四、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，没有语义或表示差异可记，不建 lineage。

**本版的规范工件**：本文件与 [`examples.md`](examples.md)。接受状态、冻结记录与执行结果在本版本目录之外维护，本文件不填进度、通过状态或哈希。

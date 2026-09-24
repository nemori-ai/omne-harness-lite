# capability.asset-transfer v1

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-transfer, 1)`
- **状态**：`candidate`——2026-09-23 起草，2026-09-24 整批对齐，**未经独立评审、未接受、未冻结**；接受与采用只从 [catalog](../../../../registry/README.md) 读
- **设计依据**（PF-003 rev 4）：
  [§4 资产复制](../../../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制)、
  [§4 分享](../../../../product/PF-003-asset-transfer-and-sharing/design.md#分享)、
  [§4 复制血缘](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘)、
  [§5.1](../../../../product/PF-003-asset-transfer-and-sharing/design.md#51-两种需要两个动作)、
  [§5.2](../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)、
  [§6.1](../../../../product/PF-003-asset-transfer-and-sharing/design.md#61-一条不变量团队资产不出那棵树)～[§6.14](../../../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)；
  [flows §1.1](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#11-把个人组织里的东西复制给团队)～[§1.8](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#18-隶属关系解除之后)、
  [flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)、
  [flows §3.1](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#31-一份复制来的资产在目标组织里)～[§3.4](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#34-一份待确认的邀约复制通知与分享邀请同形)、
  [flows §四](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#四角色与操作)；
  [acceptance](../../../../product/PF-003-asset-transfer-and-sharing/acceptance.md)
- **相邻依据**：PF-002 rev 16 的
  [flows §1.1 给组织加一个资产](../../../../product/PF-002-assets-settings-and-permissions/flows.md#11-给组织加一个资产)、
  [flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)、
  [flows §四](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)、
  [§4 Plugin](../../../../product/PF-002-assets-settings-and-permissions/design.md#plugin)、
  [§6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)、
  [§6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)；
  PF-001 rev 16 的
  [§4 拥有、获权、选用](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)、
  [§6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)、
  [§6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)、
  [§6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)；
  [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、
  [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)
- **精确语义依赖**（五项，消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)，catalog 按它登记）：
  - `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`
  - `omne-harness-lite-design-2026-09-15 · data.asset-model · v1`（candidate；2026-09-24 整批对齐按条款号登记）
  - `omne-harness-lite-design-2026-09-15 · capability.asset-governance · v1`（candidate；本契约组合它的写面与读面，2026-09-24 整批对齐登记）
- **主线裁定 2026-09-23，待产品负责人确认**（整批对齐 2026-09-24 落地）：确认路径三种来路同收 `offerNoLongerValid`、撤回路径已终结同收 `alreadyConcluded`，与组织治理同名（账本 T-1）；接收方的发现面 `listPendingForOrganization`，本契约不发自己的事件、落地与持有变化由资产治理的事件承载（T-2，G-1、G-6 闭合）；落地由同一提供者在确认的同一次提交内完成（PA-3）；租户格以 `organization` 支持有被分享给本组织的那一份（S11-G2）；`unavailable`、`versionNotPublished` 与资产治理同名（S11-names）；分享结束后被分享方的持有保留、不可用（A-M21）；资产删除后已发布版本作不可解引用的归档保留（A-M25）；分享因隶属解除失效后重新同树是否复活，本版按甲（复活）写、乙并列（U-3，G-4）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用写全坐标，如 `capability.asset-transfer/v1#S-22`。
  缺口编号 `G-n`，见[十一](#十一已知缺口)
- **三个用到但没有词条的概念**，本文一律标「（无词条）」，**不在这里下定义**，只给它们在本契约里的记录形状：
  **复制通知**（[资产复制](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)的待确认件）、
  **分享邀请**（[资产分享](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)的待确认件）、
  **分享**（确认之后那份获权的记录）。类型名 `CopyNotice`／`SharingInvitation`／`Sharing` 取自施工账本

---

## 一、含义与使用范围

### S-1 本契约拥有什么

本契约拥有**资产怎么跨组织流动**这一件事的两个动作，以及它们共同守的那条边界：

| # | 拥有的事实与判定 | 正文 |
|---|---|---|
| 1 | **复制通知**（无词条）的全生命周期：发起、撤回、确认、读；确认那一刻的**落地**——首次、重复、撞标识无血缘 | [S-5](#s-5-复制通知)、[S-10](#s-10-复制血缘怎么判怎么记)、[S-11](#s-11-复制的收场)、[S-20](#s-20-发起复制)～[S-23](#s-23-读复制通知) |
| 2 | **分享邀请**（无词条）的全生命周期 | [S-6](#s-6-分享邀请)、[S-24](#s-24-发起分享)～[S-27](#s-27-读分享邀请) |
| 3 | **分享**（无词条）：确认之后那份获权记录、它**此刻是否生效**、三种结束 | [S-8](#s-8-分享)、[S-9](#s-9-分享此刻是否生效)、[S-28](#s-28-撤销分享)～[S-31](#s-31-隶属解除分享在使用时失效不靠事件) |
| 4 | [复制血缘](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-copy-lineage--复制血缘--copy-lineage)**怎么判、何时产生、此后怎么记**（形状归 `data.asset-model` 的 `CopyLineage`） | [S-10](#s-10-复制血缘怎么判怎么记) |
| 5 | **团队资产不出那棵树**在复制与分享两条路径上的守卫：发起、确认、使用三个时点 | [S-12](#s-12-流转边界团队资产不出那棵树) |
| 6 | 两类待确认件的**指向对象存在性读面**——`data.offer-expiry/v1#S-19` 派给「持有该对象的契约」的那一格，资产那两类由本契约承担 | [S-7](#s-7-两类待确认件共用的过期语义) |

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| 资产记录、版本、持有、复制血缘、分享标识的**形状** | `data.asset-model` v1（`AssetDefinition`、`AssetVersion`、`AssetHolding`、`HoldingBasis`、`CopyLineage`、`LineageId`、`SharingId`…），本契约只引名 |
| 创作、发布、提升、删除、持有与配值的**一般写面**及其角色矩阵 | `capability.asset-governance` v1。复制落地与分享取持有时本契约**组合**它的写面（[S-18](#s-18-确认是一次提交同一落点的确认序列化)），不复述那些写面的规则 |
| 一次组装里**哪份资产生效、值取什么** | `capability.asset-evaluation`。本契约只给它一条判据：basis 为 shared 的持有什么时候可用（[S-9](#s-9-分享此刻是否生效)） |
| 组织、成员关系、隶属关系本身及上级链读面 | `capability.organization-governance` v1；**判据**归 `data.identity-values` v1 |
| 一份待确认件**何时不再可被确认** | `data.offer-expiry` v1，整块引用不复制（[S-7](#s-7-两类待确认件共用的过期语义)） |
| 导出、另存为模板、打包下载等**其他**能把资产带出范围的路径 | 各自的 owner。[PF-003 §6.1](../../../../product/PF-003-asset-transfer-and-sharing/design.md#61-一条不变量团队资产不出那棵树)那条不变量对它们同样成立，**它们引用 [S-12](#s-12-流转边界团队资产不出那棵树) 自证，本契约不替它们兑现** |

### S-3 本契约明确不承诺什么

- **不承诺投递。**「对方收到了一份复制通知／分享邀请」的含义**只是对方查询得到它**（[S-23](#s-23-读复制通知)、[S-27](#s-27-读分享邀请)）。
  接收方靠 [S-48](#s-48-列出组织收到的待确认件) 发现一份它还不知道标识的待确认件（原 G-1 闭合）；本契约不推送。
- **不发出任何停止信号**（[S-36](#s-36-撤销不发出停止信号)）。
- **不提供钉住某一版**（[PF-003 §2 非目标](../../../../product/PF-003-asset-transfer-and-sharing/design.md#非目标)）、**不做冲突探测与合并**、**不提示「源侧有更新」**、**分享不带强制**。
- **不承诺对外交换格式，本版不附 Schema。**操作的输入与返回用散文写含义，值类型引用 data 契约；
  线上形状归把这些操作送过进程边界的那份 composition（[规格容器的规矩](../../../README.md#准入门槛与停止条件)）。
- **不定义界面。**「个人组织 → 团队组织的分享没有这个动作」是界面不给入口的事；本契约给的是一个可预先求出的判定（[S-15](#s-15-结构性禁止不是权限判定)）。

### S-4 依赖方向与被消费的面

**依赖方向**：本契约 → 组织治理、身份值、过期语义、资产数据形状、资产治理。
**反方向一条也没有**：资产治理的通用写面**不读本契约**——basis 为 shared 的持有由谁写都行，
**它可不可用在使用那一刻按 [S-9](#s-9-分享此刻是否生效) 判**，写入时不需要回头问本契约（理由见 [S-9](#s-9-分享此刻是否生效) 末段）。
**求值也不读本契约**：组输入的一方在组输入时按 [S-9](#s-9-分享此刻是否生效) 的判据现读，不成立的持有不交进去（`capability.asset-evaluation` 的前提 PRE-2）；求值本身是纯计算。

#### `capability.organization-governance` v1 侧

| 被消费的条款 | 用在哪 |
|---|---|
| `#S-6` 个人组织的结构性禁止（禁止 3：上级恒空、不作上级） | [S-12](#s-12-流转边界团队资产不出那棵树)「个人组织永远不在任何树上」 |
| `#S-12` 上级链与有共同上级 | [S-12](#s-12-流转边界团队资产不出那棵树) 的边界判据（定义式引 `data.identity-values`，本契约不复述） |
| `#S-22` 读组织 | 目标／被分享方组织的**变体与存在**（[S-20](#s-20-发起复制)、[S-24](#s-24-发起分享) 的边界一步） |
| `#S-26` 成员资格判定 | 每一处「发起者／确认者成员资格有效、持什么角色」 |
| `#S-33` 解除隶属 | [S-31](#s-31-隶属解除分享在使用时失效不靠事件)：解除只清上级组织属性，分享随求值条件转假 |
| `#S-34` 上级链与有共同上级（读面） | [S-12](#s-12-流转边界团队资产不出那棵树) 在三个时点求 `shareAncestor` 用的就是这一支，**不自己从链上算** |
| `#S-38` 解除只改成员关系的有效性 | [S-32](#s-32-成员关系解除复制执行不了已确认的不动)：成员退出不删他的租户级持有，所以不使指着它的待确认件过期 |
| `#S-40` 事件都是通知（含「PF-003 的分享失效不靠 `affiliation.dissolved`」） | [S-31](#s-31-隶属解除分享在使用时失效不靠事件) 的整条写法 |

#### `data.identity-values` v1 侧

| 被消费的条款 | 用在哪 |
|---|---|
| `#S-3` OrganizationId、`#S-4` OrganizationKind、`#S-5` TenantId 的构成与相等 | 全部输入；「目标侧租户 = (目标组织, 发起者账号)」由 `#S-5` 的结构得出 |
| `#S-13` sameAccountDistinctTenants | [S-20](#s-20-发起复制) ① 的纯值判定（它的消费者核对是那份契约的 [CS-3](../../../data/identity-values/v1/contract.md#cs-3-资产复制的前提)） |
| `#S-14` 上级链、`#S-15` shareAncestor | [S-12](#s-12-流转边界团队资产不出那棵树) 的判据权威（消费者核对 [CS-4](../../../data/identity-values/v1/contract.md#cs-4-分享边界有共同上级)） |
| `#S-16` 按归属层显式携带身份值、`#S-17` 身份参数没有默认值、`#S-18` 缺席即拒绝 | [S-16](#s-16-缺席时的默认答案) |
| `#S-19` 不可用即明确失败 | [S-16](#s-16-缺席时的默认答案) 与各操作的 ⑧ |
| `#S-26` 成员无效使租户级持有不可达但不销毁 | [S-32](#s-32-成员关系解除复制执行不了已确认的不动) |
| `#S-27` 每道准入现读 | [S-17](#s-17-每道准入现读确认时再判一遍) |
| `#S-30` 跨边界须重新验证 | [S-34](#s-34-装配给的保证-vs-协议须给的保证) 右列 |
| `#S-31` 不透明标识的交换表示 | `CopyNoticeId`／`SharingInvitationId` 的词法与相等；[S-20](#s-20-发起复制) ①「目标即源组织」的逐码点比较 |
| `#S-32` 判别式集合闭合、`#S-33` 表示层校验与判定分开 | [S-16](#s-16-缺席时的默认答案) 的 `invalidInput` |

#### `data.offer-expiry` v1 侧

**整块引用不复制**（[S-7](#s-7-两类待确认件共用的过期语义)）：
`#S-2`、`#S-4`～`#S-14`、`#S-16`～`#S-20`，由正文里按号引用的位置收齐。
**`#S-19` 与 `#S-20` 是本契约的一格落点**：那两条把「指向对象的存在性读面」派给持有该对象的契约，
资产那两类由本契约兑现（[S-7](#s-7-两类待确认件共用的过期语义)）——这正是那份契约[缺口 G-6](../../../data/offer-expiry/v1/contract.md#八已知缺口)点名的五件事。

#### `data.asset-model` v1 侧（2026-09-24 整批对齐由 `$defs` 名换成条款号）

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-4`](../../../data/asset-model/v1/contract.md#s-4-资产记录号) 资产记录号（不回收不复用） | 全部输入；[S-7](#s-7-两类待确认件共用的过期语义) 的存在性 |
| [`#S-5`](../../../data/asset-model/v1/contract.md#s-5-资产来源) 资产来源、[`#S-6`](../../../data/asset-model/v1/contract.md#s-6-所有者与作者分记) 所有者与作者、[`#S-7`](../../../data/asset-model/v1/contract.md#s-7-所有者至多变一次) 所有者至多变一次 | [S-11](#s-11-复制的收场) 的写集合、[S-13](#s-13-发起者一侧的资产) 的「自己的」 |
| [`#S-8`](../../../data/asset-model/v1/contract.md#s-8-资产记录) 资产记录、[`#S-9`](../../../data/asset-model/v1/contract.md#s-9-版本线) 版本线 | [S-11](#s-11-复制的收场)、[S-20](#s-20-发起复制) 的已发布版本 |
| [`#S-18`](../../../data/asset-model/v1/contract.md#s-18-资产持有) 资产持有（同一格同一能力标识至多一份；`shared` 只能 `current`） | [S-7](#s-7-两类待确认件共用的过期语义)、[S-11](#s-11-复制的收场)、[S-26](#s-26-确认分享) |
| [`#S-19`](../../../data/asset-model/v1/contract.md#s-19-使用权来路) 使用权来路（`shared` 与租户格的 `organization` 支） | [S-9](#s-9-分享此刻是否生效) 的匹配 |
| [`#S-21`](../../../data/asset-model/v1/contract.md#s-21-复制血缘) 复制血缘、[`#S-22`](../../../data/asset-model/v1/contract.md#s-22-血缘号与分享号) 血缘号与分享号 | [S-10](#s-10-复制血缘怎么判怎么记)、[S-26](#s-26-确认分享) ④ |

#### `capability.asset-governance` v1 侧（2026-09-24 整批对齐由施工账本名换成条款号）

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-46`](../../asset-governance/v1/contract.md#s-46-组合入口资产流转的确认步骤) 组合入口：首次复制（`createDraft` 另收 `author`、`lineage`，`byAgent` 由这一侧给）、重复复制、分享确认（`hold` 带 `sharing`、恒 `current`） | [S-18](#s-18-确认是一次提交同一落点的确认序列化) 的落地 |
| [`#S-24`](../../asset-governance/v1/contract.md#s-24-createdraft-创建草稿)、[`#S-25`](../../asset-governance/v1/contract.md#s-25-updatedraft-修订草稿)、[`#S-26`](../../asset-governance/v1/contract.md#s-26-publish-发布)、[`#S-30`](../../asset-governance/v1/contract.md#s-30-hold-加入持有)、[`#S-31`](../../asset-governance/v1/contract.md#s-31-unhold-移除持有) | 组合入口调用的那几个写面；[S-29](#s-29-移除收到的分享) 的 `unhold` |
| [`#S-27`](../../asset-governance/v1/contract.md#s-27-promotetoorganization-提升到组织) 提升在还有别的持有时以 `hasReferrers` 拒 | [S-8](#s-8-分享)：已分享出去的记录不能被提升 |
| [`#S-42`](../../asset-governance/v1/contract.md#s-42-listholdings-列出某范围的持有)、[`#S-43`](../../asset-governance/v1/contract.md#s-43-readholding-读一份持有) 读面 | [S-7](#s-7-两类待确认件共用的过期语义) 的存在性、[S-13](#s-13-发起者一侧的资产)、[S-14](#s-14-plugin-的复制与分享) 的告知清单 |
| [`#S-48`](../../asset-governance/v1/contract.md#s-48-事件都是通知) 事件都是通知（`AssetPublished`、`HoldingChanged`） | [S-33](#s-33-本版不发本契约自己的事件)：落地与持有变化由它们承载 |


---

## 二、概念、身份与必要状态

**本节的身份值一律引用 `data.identity-values` v1**：`OrganizationId`、`OrganizationKind`、`TenantId`；
**资产侧的值一律引用 `data.asset-model` v1**（[S-4](#s-4-依赖方向与被消费的面) 末表），**不复制定义**。
本契约自己铸的标识只有两个：`CopyNoticeId`、`SharingInvitationId`，**不透明、部署内唯一、由存储生成、不回收不复用**，
词法与相等按 `data.identity-values/v1#S-31`。**`SharingId` 的形状归 `data.asset-model`，铸它的是本契约**（[S-26](#s-26-确认分享) ④），同样不复用。

### S-5 复制通知

**复制通知**（无词条）是一次[资产复制](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)在确认之前的那份持久记录，由 `CopyNoticeId` 标识。它携带：

| 字段 | 含义 | 何时定、可变吗 |
|---|---|---|
| 发起者 | `TenantId`——**源侧**那个租户身份 (源组织, 账号) | 发起时，不变 |
| 源 | `{ AssetRecordId, 版本号 }`——那份资产与它的**某一个已发布版本** | 发起时，不变 |
| 目标 | `OrganizationId`——一个团队组织；**目标侧租户**由 (目标, 发起者的账号) 确定，不另存 | 发起时，不变 |
| 指向的那份持有 | 发起时**所有者那一层**持有源记录的那一份——[S-7](#s-7-两类待确认件共用的过期语义) 的存在性按它判；**它靠什么被指认待 [G-3](#十一已知缺口)** | 发起时，不变 |
| `OfferTiming` | `data.offer-expiry/v1#S-4`，两个时刻在发起的同一提交内定死（`#S-5`） | 发起时，不变 |
| 终结记录 | 至多一条：确认（带确认者 `TenantId`、确认时刻与 [S-11](#s-11-复制的收场) 的 `CopyOutcome`）或撤回（带时刻） | 一经写下不改写 |

**它不是资产，也不是持有**：确认之前目标组织里什么都没有（[flows §3.1](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#31-一份复制来的资产在目标组织里)）。

### S-6 分享邀请

**分享邀请**（无词条）是一次[资产分享](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)在确认之前的那份持久记录，由 `SharingInvitationId` 标识。它携带：

| 字段 | 含义 | 何时定、可变吗 |
|---|---|---|
| 发起者 | `TenantId`——**分享方**那侧发起这次分享的租户身份 | 发起时，不变 |
| 分享方组织 | `OrganizationId` = 发起者的组织那一半 | 同上 |
| 被分享方 | `OrganizationId`——**被分享的是组织**，不是某个租户（[PF-003 §4 分享](../../../../product/PF-003-asset-transfer-and-sharing/design.md#分享)） | 同上 |
| 资产 | `AssetRecordId`——**不带版本**：确认之后跟随的是分享方当前发布的那一版（[S-8](#s-8-分享)） | 同上 |
| 指向的那份持有 | 同 [S-5](#s-5-复制通知) | 同上 |
| `OfferTiming` | 同 [S-5](#s-5-复制通知) | 同上 |
| 终结记录 | 至多一条：确认（带确认者、时刻与因此成立或被认回的 `SharingId`）或撤回 | 一经写下不改写 |

> **两类待确认件各自有身份、各自一张表，只有过期规则相同。**
> [UL-offer](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-offer--邀约--offer) 已写明这四样「不共享一套身份机制」；
> 本契约不为它们造一个共同的超类型，**两类的标识互不相等、不可混用**。
> 那个词条还写着「后两样**不是对象**，是两个过程状态机上的待确认那一态」——
> **本契约给了它们可标识的持久记录**，因为 `data.offer-expiry` v1 要求一份**可被标识、可被读到、可被写终结记录**的持久件
> （[它的缺口 G-2](../../../data/offer-expiry/v1/contract.md#八已知缺口)）。**这两种说法怎么对齐，已报主线**，本契约不改词条。

### S-7 两类待确认件共用的过期语义

**过期语义整块引用 `data.offer-expiry` v1，不复制、不改写**：派生状态四值（`#S-7`）、判定式（`#S-8`）、
读时派生且不回退（`#S-9`）、确认在同一提交内重判（`#S-10`）、到期不可确认（`#S-11`）、
过期与撤回收场相同（`#S-12`）、确认路径上三种来路同值（`#S-13`）、时长参数（`#S-14`）、同一时间源（`#S-16`）、
存在性读面归属与「不可用 ≠ 不存在」（`#S-19`、`#S-20`）。

**本契约只补它明文留给消费者的四格：**

1. **派生状态用 `OfferState`**（`data.offer-expiry` 的 `$defs/OfferState`）。**PF-003 说的「确认」就是它的 `accepted`**——
   不另起一个 `confirmed` 取值，那会是同一个状态的第二份定义。
2. **判定用的指向对象**（`data.offer-expiry/v1#S-2`、`#S-6`）：复制通知指**源那份资产**，分享邀请指**被分享的那份资产**。
   目标组织、被分享方组织、发起者**都不进判定式**。
3. **「那份资产还在」怎么判**——本契约提供的存在性读面：

   ```text
   存在(待确认件 x)  ≝  x 指向的资产记录存在
                        ∧ 它的所有者那一层此刻持有它
                        ∧ 那份持有就是 x 发起时的那一份（此后重新持有的不算）
   ```

   **第二个合取项来自原话**：「它指向的那份资产不存在了（**被移除**、被删除）」
   （[PF-003 §6.14](../../../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)）——
   所有者把它从自己那一层[移除](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-removal--资产移除--asset-removal)，记录还在，但对这份邀约而言它**已经不在了**。
   「所有者那一层」：所有者是租户 ⇒ 那个租户的租户层；所有者是组织 ⇒ 那个组织的组织层。
   **第三个合取项是 `data.offer-expiry/v1#S-9` 的「不回退」要的**：移除之后再持有同一份记录，若算「又在了」，
   一份已经 `expired`（派生状态）的邀约会翻回 `pending`。**它要求持有能区分「这一份」与「后来那一份」，而 `data.asset-model` 的持有形状目前没有实例身份**——
   [缺口 G-3](#十一已知缺口)；**资产记录号不复用**（`#S-19` 对标识分配方的要求）同在那一格。
4. **失败值的名字**（`#S-13`、`#S-14` 留给消费者取）：确认路径上三种来路同收 **`offerNoLongerValid`**，撤回路径上已终结（已确认或已过期）同收 **`alreadyConcluded`**——都与 `capability.organization-governance` v1 的同一收场同名（[S-19](#s-19-这一节每个操作写全九件事) 的总表写明它们的全部含义；账本 T-1）；
   非法时长收 **`invalidInput`**（[S-16](#s-16-缺席时的默认答案)）。

**两类各有各的默认时长**，都是 `offer_ttl` 的一类默认值（部署配置，**本契约不填值**）；发起时可以指定这一份的（[S-20](#s-20-发起复制)、[S-24](#s-24-发起分享) ①）。
**指定值是这份数据的参数，不进作用域层**（`#S-14`）。

**确认之后没有期限，也没有暂停。**`data.offer-expiry` 只管确认之前那一段（`#S-3`）；
[确认之后的使用权不过期](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)，复制下来的那一份是目标组织自己的。

### S-8 分享

**分享**（无词条）是**被分享方确认之后**那份获权的记录，由 `SharingId` 标识。它携带：

| 字段 | 含义 |
|---|---|
| 分享方组织、被分享方组织、资产 | 从那份分享邀请抄过来，**不变** |
| 发起者、确认者、确认时刻、来自哪份分享邀请 | 审计要的「谁、何时、依据什么」（[PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)） |
| 记录状态 | `active` / `revoked` / `removed` 三值；后两值一经写下不改写，并带写下者与时刻 |

**它给的是[使用权](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-usage-right--使用权--usage-right)，不是[定义所有权](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-definition-ownership--定义所有权--definition-ownership)。**
资产记录的所有者、作者、版本一概不动；被分享方不能改内容（[§6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)）。

**它跟随的是「分享方当前发布的那一版」这个动态目标**，记录里**没有版本字段**——
[没有「钉在某一版」这个选项](../../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保)。
被分享方的自保手段是**收窄自己那一层的权限**或**移除**（[S-29](#s-29-移除收到的分享)）；前者归资产治理的配值面。

**已分享出去的记录不能被提升**：资产治理的提升在还有别的持有指向这份记录时以 `hasReferrers` 拒（`capability.asset-governance/v1#S-27`）——提升会让分享方从租户变成组织，这份分享还作不作数本版不答，所以不让它发生。两边同一个判断。

**同一 (资产, 被分享方组织) 至多一份记录状态为 `active` 的分享。**已有时，再确认一份同对的分享邀请**认回那一份**，不新建（[S-26](#s-26-确认分享) ⑦）。
理由：两份并存时，被分享方[移除](#s-29-移除收到的分享)一份、另一份仍给着使用权——「我不要了」就不再是一个动作能说完的事。

### S-9 分享此刻是否生效

**`SharingState` 四值，三个是记录、一个是派生：**

| 值 | 是记录还是派生 | 含义 |
|---|---|---|
| `active` | 记录为 `active`，**且此刻**流转边界成立 | 生效中 |
| `dissolved` | **派生**：记录仍为 `active`，但**此刻**流转边界不成立 | 隶属关系解除之后的样子（[S-31](#s-31-隶属解除分享在使用时失效不靠事件)）。**不是一个被写下的值** |
| `revoked` | 记录 | 分享方撤销（[S-28](#s-28-撤销分享)） |
| `removed` | 记录 | 被分享方移除（[S-29](#s-29-移除收到的分享)） |

```text
生效(s)  ≝  s 的记录状态 = active  ∧  边界(s.分享方组织, s.被分享方组织)      \* 边界按 S-12，读时求值
```

**给求值的那一条判据**——`capability.asset-evaluation` 据以认一份 basis 为 shared 的持有（`data.asset-model` 的 `HoldingBasis`）：

> **一份 basis 为 shared 的持有，在使用的那一刻可用，当且仅当存在一份分享 s，
> s 的资产就是这份持有的资产，s 的被分享方就是这份持有所在的那个组织层，且 生效(s)。**
> 求值读不到分享记录或读不到边界 ⇒ **以不可用失败**，不得当作可用，也不得当作「这份持有不存在」（`data.identity-values/v1#S-19`）。

**被分享方组织里的租户格以 `organization` 支持有同一份记录的那份**（`data.asset-model/v1#S-19`；主线裁定 2026-09-23，待产品负责人确认，账本 S11-G2）**随它所在组织那份 shared 持有一起判**：那份此刻不可用，这份也不可用；它不另立一条判据。

**为什么按 (资产, 被分享方) 对，而不按持有上记着的那个 `SharingId`**：
被分享方撤销后重新接受同一份资产的分享，它那层的持有与配值**原样还在**（本契约从不删对方的配值，[S-28](#s-28-撤销分享)），
按对判就不需要回头改那份持有的 basis；持有上记着的 `SharingId` 只作来路记录。
**同一对至多一份 `active`**（[S-8](#s-8-分享)），所以按对判不会有两个答案。

**为什么这条判据放在使用那一刻，而不放在写持有那一刻**：写持有时判一次，之后隶属一断、分享一撤，那份持有照样被当成可用——
这正是 [S-31](#s-31-隶属解除分享在使用时失效不靠事件) 要挡的。**使用时判，写入就不必判**，资产治理的写面因此不需要读本契约（[S-4](#s-4-依赖方向与被消费的面) 开头）。

### S-10 复制血缘怎么判、怎么记

**判首次还是重复，只看血缘，不看能力标识**（[§6.8](../../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘)）：

```text
重复(源记录 r, 目标组织 t)  ≝  t 此刻拥有一份资产记录，它的血缘对应 r
```

「对应」是本契约私有的关系：**首次复制时铸一个 `LineageId`，记下 (源记录, 目标组织) ↔ `LineageId` 的对应，并把它写进新记录的 `CopyLineage`**。

| 性质 | 写法 |
|---|---|
| **一条血缘由它挂着的那份目标侧资产确定** | 每个 (源记录, 目标组织) 至多一份带对应血缘的目标记录——[S-18](#s-18-确认是一次提交同一落点的确认序列化) 的序列化兑现，[模型检查](formal/README.md) |
| **`LineageId` 首次产生后不变** | 重复复制不改它（`data.asset-model` 的判定条款「血缘首次产生后不变」） |
| **不可反推源** | 目标侧拿到的只有 `LineageId` 与下面四项，**拿不到源记录号、源组织、源侧的发起者租户身份**；(源记录, 目标组织) ↔ `LineageId` 的对应**只在本契约内部**，不经任何读面返回给目标侧 |
| **目标侧看得见的四项** | 源版本号、送进来的租户身份、送进来的时刻、第几次送进来——`CopyLineage` 的 `sourceVersion`／`importedBy`／`importedAt`／`imports`。**每次确认复制都在同一提交里改写这四项**（`imports` 加一），`LineageId` 不动 |
| **不传递** | 复制下来的那份再被复制出去（它是目标组织的组织级资产，[本来就复制不了](#s-13-发起者一侧的资产)），或被分享出去，都**不带**这条血缘 |

**`importedBy` 是 (目标组织, 发起者账号)，不是源侧那个租户**——后者会把源组织暴露给目标侧
（[§6.5](../../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制) 同一理由）。

> **「此后不变」与「四项每次改写」不矛盾，但要对齐措辞**：本契约读「血缘首次产生后不变」为**那条对应关系（`LineageId`）不变**；
> 那四项答的是「由某租户在某时送进来第几版」，只记第一次就答错了。`data.asset-model` 若把四项也读成冻结，**两处要对齐**——已报主线。

**目标组织删掉了那份目标记录**（资产治理的删除面）：对应还在也没有东西可更新，下一次确认按**首次**处理，铸新的 `LineageId`——
「一份资产要么有一条血缘，要么没有」，删掉的那份带走了它的那一条。

### S-11 复制的收场

**`CopyOutcome`** 两支，由系统判定、不由发起者选（[§4 资产复制](../../../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制)）：

| 支 | 什么时候 | 写集合（全在确认那一次提交里） |
|---|---|---|
| **`created`**，带新记录的 `AssetRecordId`、「是否取得了持有」与「目标组织此刻是否已有同一能力标识的另一份」 | [S-10](#s-10-复制血缘怎么判怎么记) 判为首次 | ① 新资产记录：**所有者 = 目标组织**、**作者 = (目标组织, 发起者账号)**、来源 `customized`、能力标识与源相同、带新血缘；② 它的 **v1**，内容**整体等于**源那一版的内容；③ 目标组织层**此刻没有这个能力标识的持有** ⇒ 为它取得持有（basis `owned`），**已有** ⇒ **不动那份持有**，新记录不取得持有。目标组织此刻已拥有或已在组织层持有同一能力标识的另一份时，返回里如实告知「同一能力标识下现在有两份」（[flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)） |
| **`overwritten{newVersion}`** | 判为重复 | 在那份目标记录上**发布一个新版本**，内容整体等于源那一版的内容，版本号接着它自己的线往下数；**只改写血缘那四项**。**不碰任何持有、不碰任何属性配值**（包括标了 `immutable` 的） |

**三条逐字取自正文的边界**：

- **源侧什么都不动**——源记录、源的作者、源的版本线（[§4](../../../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制)「源保留」）。
- **撞标识无血缘是新增，不是覆盖**：目标组织自己那份同标识的资产**一个字节都不动**（[§6.8](../../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘)）；同一标识下谁生效，由该组织自己按层级与替换规则决定。
- **覆盖的是内容，配置不动**（[§6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)）：新版本删掉的属性项不参与求值、新增的走默认，这是求值的事，本契约不写配值。

**新版本「立即生效」**（[§6.6](../../../../product/PF-003-asset-transfer-and-sharing/design.md#66-重复复制全量覆盖替换)）的前提在求值那边：
目标组织持有的是**记录**，求值取它**当前发布的那一版**。那一侧若另有「选用某一版」的规则，这一条要回来核——见[十二](#十二消费者核对)。

**每个版本的发布者**（`AssetVersion.publishedBy`）记**确认者**——这一版是确认那一刻由目标组织写下的；
送进来的人记在血缘的 `importedBy`。**这一格正文没有原话，是推导**（[§6.6](../../../../product/PF-003-asset-transfer-and-sharing/design.md#66-重复复制全量覆盖替换)：「复制是目标组织**自己确认接收**的一次写入」）。

### S-12 流转边界：团队资产不出那棵树

**这是一条贯穿条款**，[PF-003 §6.1](../../../../product/PF-003-asset-transfer-and-sharing/design.md#61-一条不变量团队资产不出那棵树) 的不变量在本契约两条路径上的全部落点。

```text
复制边界(源组织 s, 目标组织 t)  ≝  s ≠ t
                                 ∧ t 存在且是团队组织
                                 ∧ ( s 是个人组织  ∨  shareAncestor(s, t) )

分享边界(分享方 o, 被分享方 t)  ≝  o ≠ t
                                 ∧ ( (o, t 都是个人组织)  ∨  (o, t 都是团队组织 ∧ shareAncestor(o, t)) )
```

两式的第一个合取项（`≠`）在操作 ① 就以 `invalidInput` 判掉（[S-16](#s-16-缺席时的默认答案)），写在这里只为定义完整；其余各项不成立收 `outsideTree`。
`shareAncestor` 的定义式归 `data.identity-values/v1#S-15`（**把各自算进自己的链再求交，即同一棵树**），
求值用 `capability.organization-governance/v1#S-34` 那一支，**不自己从上级链上算**。

**逐格对到正文**（[§6.2](../../../../product/PF-003-asset-transfer-and-sharing/design.md#62-谁能流向谁)）：

| 路径 | 从 → 到 | 结果 | 依据 |
|---|---|---|---|
| 复制 | 他的个人组织 → 他所在的团队组织 | 放行，**无树条件** | §6.2 第一行 |
| 复制 | 团队 → 同树的另一个团队 | 放行 | §6.2 第二行 |
| 复制 | 任何 → 个人组织 | **`outsideTree`** | §6.1；个人组织[永远不在任何树上](../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)（`capability.organization-governance/v1#S-6` 禁止 3） |
| 分享 | 团队 → 同树的另一个团队 | 放行 | §6.2 分享第一行 |
| 分享 | 个人组织 → 另一个个人组织 | 放行，**无限制** | §6.2 分享第二行 |
| 分享 | 个人组织 → 团队、团队 → 个人组织 | **`outsideTree`** | §6.2 空着的两格 |
| 任一 | 两个团队不同树 | **`outsideTree`** | §5.2 |

**三个时点都判，缺一个就有一条绕过去的路**：

| 时点 | 在哪 | 为什么不能只判前一个 |
|---|---|---|
| **发起** | [S-20](#s-20-发起复制)、[S-24](#s-24-发起分享) | 早拒，不让一份注定落不了地的待确认件悬着 |
| **确认**（与落地同一提交） | [S-22](#s-22-确认复制)、[S-26](#s-26-确认分享) | 发起与确认之间隶属可能已解除；**不重判，团队资产就在树外落地了**——[模型给出过这条反例](formal/README.md) |
| **使用**（每一次） | [S-9](#s-9-分享此刻是否生效) | 确认之后隶属可能解除；**只对分享成立**——复制下来的那份已经是目标组织自己的，[关系解除之后留着](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后) |

**「目标或被分享方组织不存在」收 `outsideTree`**：本版唯一会不存在的组织是[被清除的个人组织](../../organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)，它本就在所有边界之外。
**读不到 ≠ 不存在**：组织读面或上级链读不到 ⇒ `unavailable`，**不得把一条截断的链算出来的「不同树」当成越界拒绝交上去**（`data.identity-values/v1#S-19` 第 2 行）。

### S-13 发起者一侧的资产

**资产复制与分享都只能给出「自己的」**（[§6.4](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)、[§6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)）。
「自己的」按所有者判（`AssetDefinition` 的所有者，[PF-001 §6.7 表](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识)）：

| 所有者 | 对**复制**而言 | 对**分享**而言 |
|---|---|---|
| 发起者这个租户（团队里他**租户级**的，或他个人组织里的租户级） | 他的 | 他的 |
| 发起者的组织，**而它是个人组织** | **他的**——[「他个人组织里的资产」](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)；个人组织只有他一个成员 | 他的 |
| 发起者的组织，**而它是团队组织** | **`organizationAssetNotCopyable`**——[组织的财产，要流动走分享](../../../../product/PF-003-asset-transfer-and-sharing/design.md#62-谁能流向谁)。**超级管理员也一样**，这不是权限不够，是这个动作不存在 | 组织的，**要发起者是该组织的超级管理员**，否则 `notPermitted`（[flows §四](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#四角色与操作)「分享组织拥有的资产」） |
| 平台（`origin = official`） | **`officialNotTransferable`** | **`officialNotTransferable`** |
| 别人（同组织的另一个租户、别的组织） | `sourceNotOwned`；**若发起者的组织是这份资产某次分享的被分享方 ⇒ `notTransitive`** | 同左 |

再加两条，缺一条都不算「他的现有资产」，收 **`sourceNotOwned`**：
**记录存在**；**所有者那一层此刻持有它**（与 [S-7](#s-7-两类待确认件共用的过期语义) 的存在性同一个判断——一份所有者自己都已移除的资产，发出去的邀约生来就是过期的）。

**判定次序固定**，同一输入同一答案：记录不存在 ⇒ `sourceNotOwned` → 官方件 ⇒ `officialNotTransferable` →
所有者是发起者所在的团队组织 ⇒ 复制 `organizationAssetNotCopyable`、分享而发起者不是超管 ⇒ `notPermitted` →
所有者在发起者一侧 ⇒ 所有者那一层不持有它 ⇒ `sourceNotOwned`，持有则通过 →
其余：发起者的组织是这份资产某份分享（任何记录状态）的被分享方 ⇒ `notTransitive`，否则 `sourceNotOwned`。

**`sourceNotOwned` 不区分「不存在」「不归你」「你已移除」。**`AssetRecordId` 是不透明标识；
分开报会让调用方据失败值探出**别人的**租户级资产在不在——那是[他在这个组织里的私有部分](../../../../product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份)。
**`notTransitive` 与 `organizationAssetNotCopyable` 可以分开报**：前者说的是发起者的组织自己收到过的东西，后者说的是他所在组织的组织级资产，**两样他本来就看得见**，没有存在性可泄漏。

**被分享来的，既不能再分享，也不能复制出去**（[§6.13](../../../../product/PF-003-asset-transfer-and-sharing/design.md#613-分享不可传递)）——
它从来不归被分享方，上表已经挡住；`notTransitive` 只是把这一支的**原因**说清楚。

### S-14 plugin 的复制与分享

**[plugin](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-plugin--插件--plugin) 的内含成员随它一并过去，不取得独立的记录、血缘、分享或持有**（[§6.9](../../../../product/PF-003-asset-transfer-and-sharing/design.md#69-复制或分享一个-plugin)；
[PF-002 §4 Plugin](../../../../product/PF-002-assets-settings-and-permissions/design.md#plugin)：内含成员「随 Plugin 的版本与使用权一起治理」）。
本契约搬运与授权的**始终是 plugin 那一份记录的那一版内容**；成员在不在那份内容里，是 plugin 正文形状的事。

**plugin 里「引用」的能力标识不跟着走**，由目标侧自己求值（[PF-002 §6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)）。
**发起时就告知**哪些引用在目标侧**没有提供者**（[flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)）：
[S-20](#s-20-发起复制)、[S-24](#s-24-发起分享) 的 ⑤ 在返回标识之外另带一份**告知清单**——
那一版内容引用的能力标识里，目标组织**此刻在组织层与出厂默认层都没有持有**的那些。
**它是告知，不是拒绝**：清单非空也照常发出。
**「内含」与「引用」怎么从 plugin 正文里分出来**，取决于 `data.asset-model` 的 plugin 外壳；那份形状目前只列一种成员——[缺口 G-5](#十一已知缺口)。
在它闭合之前，**告知清单按「引用」一支为空处理，不得把内含成员当成引用去报缺提供者**。

---

## 三、贯穿全部操作的四条规矩

### S-15 结构性禁止不是权限判定

`outsideTree`、`officialNotTransferable`、`organizationAssetNotCopyable`、`notTransitive` 是**结构性禁止**：
答案由组织变体、隶属树、资产来源与所有者决定，**与发起者的角色无关**——超级管理员来做也是同一个答案。
`notPermitted` 是**权限判定**：答案随成员资格与角色变化。**两类不合并**：
[flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)把「不在同一条隶属链上」与「没有加入资产的资格」写成两行，收场与该去做的事都不同。

**结构性禁止可以不发起操作就预先求出**：组织变体与上级链（`capability.organization-governance/v1#S-22`、`#S-34`）、
资产的来源与所有者（资产治理的读面）都有读面。界面据此不呈现「个人组织 → 团队组织的分享」入口；操作侧仍以同一个值兜底，**两处必须同答**。

### S-16 缺席时的默认答案

**一律拒绝或明确失败，不放行、不空集、不回退、不填初值。**三类分开：

| 情形 | 结果 | 为什么不合并 |
|---|---|---|
| 判定得出「不该放行」 | 一个**具名拒绝值** | 成立的结论，重试不会改变答案 |
| 判定**做不出来**（存储、成员资格读面、组织读面、上级链、时间源、资产治理读面任一读不到） | **`unavailable`** | 没有结论；按当时实际状态重试可能不同（`data.identity-values/v1#S-19`、`data.offer-expiry/v1#S-16`、`#S-20`） |
| 输入**根本不构成这个请求**：字段缺席、类型不对、标识不合 `data.identity-values/v1#S-31` 的词法、判别式不在闭合集合内（`#S-32`）、时长非正或不合形状；**以及目标／被分享方就是发起者自己的组织** | **`invalidInput`**，在任何判定之前 | 表示层校验不是判定结果（`data.identity-values/v1#S-33`）；「错在这次调用本身」，重试一万次也不会成 |

**最后那一格要单独说**：「目标即源组织」「被分享方即分享方」不读任何记录、只比两个身份值即可判出
（复制那边就是 `data.identity-values/v1#S-13` 的 `sameAccountDistinctTenants` 为假，[CS-3](../../../data/identity-values/v1/contract.md#cs-3-资产复制的前提)：「为假就直接拒，不必也不应去读成员资格」）。
它说的**不是「对象不存在」也不是「主体无资格」**，而是「这不是一次复制／分享」——按定义两者都在**两个不同组织**之间。
**账本没有为它单列一个值，本契约收进 `invalidInput`，已报主线**；若主线另给名，只改这一格与 [S-20](#s-20-发起复制)／[S-24](#s-24-发起分享) 的 ⑥。

**`unavailable` 这个名字取自 `capability.organization-governance` v1 的同一收场**，与资产治理同名（主线裁定 2026-09-23，待产品负责人确认；账本 S11-names）。
没有它，「判不出来」就只能被折进某个拒绝值——那正是本条要禁的。

**任何身份参数都没有默认值**：`TenantId`、`OrganizationId`、`AssetRecordId`、`CopyNoticeId`、`SharingInvitationId`、`SharingId`
缺席即 `invalidInput`，不得由当前租户身份、进程上下文或环境补齐（`data.identity-values/v1#S-17`、`#S-18`）。

**带默认值的非身份参数，逐一列出，这张表是穷举的**：

| 参数 | 在哪 | 缺席时 |
|---|---|---|
| 这一份的有效时长 | [S-20](#s-20-发起复制) ①、[S-24](#s-24-发起分享) ① | 该类的默认 `offer_ttl`（部署配置，`data.offer-expiry/v1#S-14`）。**缺席按默认，非法拒绝**——两件事 |
| 列表的过滤开关 | [S-30](#s-30-列出组织的分享) ① | 只要此刻 `active` 的，写死在条款里，不是部署配置 |

### S-17 每道准入现读，确认时再判一遍

**成员资格、角色、隶属关系、资产的所有者与持有，在每一次准入时现读**（`data.identity-values/v1#S-27`）。
**确认是一道准入**：发起那一刻判过的条件，在确认的同一次提交里**再判一遍**，能变的那几条逐一列在 [S-22](#s-22-确认复制) ②、[S-26](#s-26-确认分享) ②。

**这条不是谨慎，是 [PF-003 §6.12](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后) 的原话落点**：
成员退出之后「**他再也执行不了复制**——目标侧的那个租户随成员关系解除而不再有效」。
复制在**确认那一刻**落地，那一刻就是「执行」；只在发起时判，一份他退出之前发出的通知就会在他退出之后以他的名义落地。

**确认时再判失败，待确认件保持原状**：不写终结记录，仍可被撤回、会照常过期；条件恢复（比如隶属重建）之后仍可再确认。

### S-18 确认是一次提交；同一落点的确认序列化

**确认的全部效果在一次提交里同时成立**，没有中间态：

| 一起成立的 | 复制（[S-22](#s-22-确认复制)） | 分享（[S-26](#s-26-确认分享)） |
|---|---|---|
| 过期重判（`data.offer-expiry/v1#S-10`，含 [S-7](#s-7-两类待确认件共用的过期语义) 的存在性） | ✓ | ✓ |
| [S-17](#s-17-每道准入现读确认时再判一遍) 的再判 | ✓ | ✓ |
| 落地 | [S-10](#s-10-复制血缘怎么判怎么记) 的判定 ＋ [S-11](#s-11-复制的收场) 的写集合 | 新建或认回分享 ＋（能取则）被分享方组织层的持有 |
| 终结记录 `accepted` | ✓ | ✓ |

**落地的写集合落在资产治理的存储对象上**（资产记录、版本、持有），**终结记录落在本契约的存储对象上**；
**两者由同一提供者在确认的同一次提交内完成**（主线裁定 2026-09-23，待产品负责人确认；拆分提案 PA-3：资产治理与资产流转同一个提供者），经资产治理的组合入口（[`capability.asset-governance/v1#S-46`](../../asset-governance/v1/contract.md#s-46-组合入口资产流转的确认步骤)）写，**不另写一份写面**；单机由装配给（同一存储、同一事务，[S-34](#s-34-装配给的保证-vs-协议须给的保证)），
提供者设计必须指出这次事务覆盖的**全部存储对象**——少一个，就会留下「记录建了、通知还悬着」或「通知确认了、记录没建」的中间态。

**同一落点上的确认序列化**：

- 对同一 (源记录, 目标组织) 的两次复制确认**不得交错**——否则两次都读到「还没有带这条血缘的记录」、各建一份，下一次重复复制不知道该覆盖哪一份；
- 对同一 (资产, 被分享方组织) 的两次分享确认同理——否则各建一份 `active`，违反 [S-8](#s-8-分享)。

**两条都有模型反例撑着**：把确认拆成「读—写」两步，TLC 给出正是这两种局面（[formal 入口](formal/README.md)）。

---

## 四、操作

### S-19 这一节每个操作写全九件事

①输入 · ②前置与授权 · ③结构性禁止（[S-15](#s-15-结构性禁止不是权限判定)，不适用写「无」）· ④提交点与原子性 · ⑤成功返回 ·
⑥失败集合（**闭合枚举，没有「其他」；按判定次序排列**，同一输入同一答案）· ⑦幂等与重复 · ⑧缺席时的默认答案 · ⑨事件。

**每个操作的 ⑥ 都含 `invalidInput` 与 `unavailable`**，逐条列出、不省略。

**失败值总表**（本契约的全部失败值，含义以这里为准）：

| 值 | 含义 | 类 |
|---|---|---|
| `invalidInput` | 输入不构成这个请求（[S-16](#s-16-缺席时的默认答案) 第三行） | 表示层 |
| `notPermitted` | 行为人条件不成立：发起者／确认者／撤回者的成员资格此刻无效、角色不够、缺[加入资产的资格](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)；**确认复制时也包括发起者两侧的成员资格**（[S-17](#s-17-每道准入现读确认时再判一遍)） | 权限 |
| `outsideTree` | [S-12](#s-12-流转边界团队资产不出那棵树) 的边界不成立（含目标／被分享方组织不存在） | 结构 |
| `sourceNotOwned` | 不是发起者一侧的现有资产（[S-13](#s-13-发起者一侧的资产)），不区分原因 | 结构 |
| `versionNotPublished` | 复制：给的版本号不是那份记录的已发布版本（草稿不可复制）；分享：那份资产一个已发布版本都没有。与资产治理的同名值同义（账本 S11-names） | 结构 |
| `organizationAssetNotCopyable` | 复制：源是发起者所在**团队组织**的组织级资产 | 结构 |
| `officialNotTransferable` | 源是官方件 | 结构 |
| `notTransitive` | 源是发起者的组织**被分享来**的 | 结构 |
| `noticeNotFound` / `invitationNotFound` / `sharingNotFound` | 按标识找不到，**或调用方不是有权看见它的那几类人**（不泄漏存在性，同 `capability.organization-governance/v1` 按不透明标识定位的那一组） | 定位 |
| `offerNoLongerValid` | **确认路径**：这份待确认件已不可被确认——**过期、已撤回、已确认过三种来路给同一个值**（`data.offer-expiry/v1#S-13`） | 结论 |
| `alreadyConcluded` | **撤回路径**：它已被确认，或已按 `data.offer-expiry/v1#S-8` 过期——已有一条本操作不会再写的结论，撤不了，**不写终结记录** | 结论 |
| `unavailable` | 判定做不出来（[S-16](#s-16-缺席时的默认答案)） | 失败 |

> **两个值都取 `capability.organization-governance` v1 的同一收场的名字**（主线裁定 2026-09-23，待产品负责人确认；账本 T-1）：`data.offer-expiry/v1#S-13` 要求**确认路径上三种来路收同一个值**——再确认一份已确认的，与确认一份过期的，可观察结果完全相同：没有新效果，要它成立只能重发一份；
> 撤回路径上「已确认」与「已过期」对撤回者也只有一个后果：撤不了，也不必撤。**同一收场一个失败值**，所以两处都不另起名字。

**谁能做**（逐格标来源）：

| 操作 | 谁 | 来源 |
|---|---|---|
| 发起复制 | 源侧租户本人（任一角色），**且**他在目标组织是超级管理员 | [flows §四](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#四角色与操作)「复制自己租户级的资产：可（目标侧还要有资格）」＋ [PF-002 flows §四](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)「给组织加入资产：只归超管」——**原话** |
| 确认复制 | 目标组织的超级管理员 | 原话；普通成员「有条件：按被授予的权限」**本版无授予机制**，收 `notPermitted`（[G-2](#十一已知缺口)） |
| 撤回复制通知 | 发起者本人 | 原话 |
| 发起分享 | 所有者是他这个租户 ⇒ 他本人；所有者是他的组织 ⇒ 该组织的超级管理员 | 原话（「分享组织拥有的资产」「分享自己租户级的资产」两行） |
| 确认分享、移除收到的分享 | 被分享方组织的超级管理员 | 原话 |
| 撤回分享邀请、撤销分享 | 发起者本人；资产此刻归组织所有时，**另加**该组织的任一超级管理员 | **推导**：原话「撤销自己发出的分享（含待确认的）：源侧超管 可；源侧普通成员 对自己分享出去的：可」——组织的东西由组织的超管收回，个人的东西只有本人收回；**分享方是租户、而他已不在组织里时谁能收回**，原话没有（[G-7](#十一已知缺口)） |
| 读复制通知 | 发起者本人；目标组织的超级管理员 | **推导**（接收方要看得见才能决定，[flows §3.4](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#34-一份待确认的邀约复制通知与分享邀请同形)「接收方那边可见」） |
| 读分享邀请 | 发起者本人；资产归组织时该组织的超级管理员；被分享方组织的超级管理员 | 推导，同上 |
| 列出组织的分享 | 见 [S-30](#s-30-列出组织的分享) ② | 推导 |
| 列出组织收到的待确认件 | 该组织的有效超级管理员——就是能确认它们的那一类人 | 推导（同 [S-23](#s-23-读复制通知)／[S-27](#s-27-读分享邀请) ②） |

### S-20 发起复制

`issueCopyNotice`

| # | 内容 |
|---|---|
| ① | 发起者 `TenantId`（**源侧**）、源 `{ AssetRecordId, 版本号 }`、目标 `OrganizationId`、**可选：这一份的有效时长**（缺席按复制通知这一类的默认值，[S-16](#s-16-缺席时的默认答案)） |
| ② | 发起者源侧成员资格**有效**（任一角色）；源是**发起者一侧的现有资产**（[S-13](#s-13-发起者一侧的资产)）；版本号是它的**已发布版本**；**目标侧租户 (目标, 发起者账号) 成员资格有效且是超级管理员**——[「执行者须在该组织有租户身份与相应资格」](../../../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制)，资格即[加入资产只归超管](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作) |
| ③ | **有**：`officialNotTransferable`、`organizationAssetNotCopyable`、`notTransitive`、`outsideTree`（[S-12](#s-12-流转边界团队资产不出那棵树) 的复制边界） |
| ④ | 写一份复制通知，`OfferTiming` 在这次提交内定死（`data.offer-expiry/v1#S-5`）。单次提交。**发起不求过期判定式**（`#S-20`），但②的「所有者那一层此刻持有它」在这次提交内现读 |
| ⑤ | `CopyNoticeId`；**源是 plugin 时另带告知清单**（[S-14](#s-14-plugin-的复制与分享)），否则清单为空 |
| ⑥ | 按判定次序：`invalidInput`（含目标即源组织）→ `notPermitted`（源侧成员资格）→ `sourceNotOwned` · `officialNotTransferable` · `organizationAssetNotCopyable` · `notTransitive`（[S-13](#s-13-发起者一侧的资产) 的表）→ `versionNotPublished` → `outsideTree` → `notPermitted`（目标侧成员资格与角色）；**任一步读不到 ⇒ `unavailable`** |
| ⑦ | **不幂等**：每次调用一份新的通知；**不去重未决通知**——过期与撤回是它们的收场，多几份不制造新状态；两份都被确认时第二份按血缘判为重复，[S-18](#s-18-确认是一次提交同一落点的确认序列化) 保证不会建出第二份记录 |
| ⑧ | 成员资格、资产治理读面、组织读面、上级链任一读不到 ⇒ `unavailable`，**不得按「读不到就不是成员／不在树上／不是他的」拒绝**——那会把失败说成结论；身份参数缺席或不合形状、时长非正 ⇒ `invalidInput` |
| ⑨ | 不发（[S-33](#s-33-本版不发本契约自己的事件)） |

**先判纯值、再读记录**：目标即源组织在 ① 就拒（[S-16](#s-16-缺席时的默认答案)）；源侧成员资格先于任何资产读面——一个此刻不在源组织里的人，拿不到关于那份资产的任何回答。

### S-21 撤回复制通知

`withdrawCopyNotice`

| # | 内容 |
|---|---|
| ① | 撤回者 `TenantId`、`CopyNoticeId` |
| ② | 撤回者**就是**这份通知的发起者；他的源侧成员资格**有效** |
| ③ | 无 |
| ④ | 单次提交，**先现读一次过期判定**（`data.offer-expiry/v1#S-8` 的反方向）：`pending` ⇒ 写终结记录 `withdrawn`；其余不写 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` → `noticeNotFound`（不存在，或撤回者不是发起者）→ `notPermitted`（发起者此刻不是源组织的有效成员）→ `alreadyConcluded`；读不到 ⇒ `unavailable` |
| ⑦ | **幂等到本操作自己写的那条记录**：已 `withdrawn` ⇒ `ok`，无二次效果。已 `accepted` 或已过期 ⇒ `alreadyConcluded`，**不写终结记录** |
| ⑧ | 通知读不到、时间源读不到、**存在性读面读不到**（`data.offer-expiry/v1#S-20`）⇒ `unavailable`，**不写终结记录**，**不得据读不到判成已过期**；缺席或不合形状 ⇒ `invalidInput` |
| ⑨ | 不发 |

**发起者退出源组织之后撤不了**（②）：那份通知只能等它过期，或在确认时因 [S-17](#s-17-每道准入现读确认时再判一遍) 的再判被拒——**两条收场都不留效果**。

### S-22 确认复制

`confirmCopy`

| # | 内容 |
|---|---|
| ① | 确认者 `TenantId`、`CopyNoticeId` |
| ② | 确认者的组织**就是**这份通知的目标组织，成员资格**有效**且是**超级管理员**；这份通知按 `data.offer-expiry/v1#S-8` 求值为 `pending`——**这次求值在落地的同一次提交内做**（`#S-10`）。**再判**（[S-17](#s-17-每道准入现读确认时再判一遍)）：发起者**两侧**成员资格仍有效；源仍是发起者一侧的资产（所有者可能已被提升到组织）；[S-12](#s-12-流转边界团队资产不出那棵树) 的复制边界仍成立 |
| ③ | **有**：`organizationAssetNotCopyable`（发起后被提升）、`outsideTree`（发起后隶属解除） |
| ④ | **单次提交**（[S-18](#s-18-确认是一次提交同一落点的确认序列化)）：过期重判 ＋ 再判 ＋ [S-10](#s-10-复制血缘怎么判怎么记) 的首次／重复判定 ＋ [S-11](#s-11-复制的收场) 的写集合 ＋ 终结记录 `accepted`（带确认者、时刻与 `CopyOutcome`），**全部同时成立**；受同一 (源记录, 目标组织) 的序列化约束 |
| ⑤ | `CopyOutcome`（[S-11](#s-11-复制的收场)） |
| ⑥ | `invalidInput` → `noticeNotFound`（不存在，或确认者的组织不是目标组织）→ `notPermitted`（确认者不是目标组织的有效超管）→ `offerNoLongerValid`（过期、已撤回、已确认，三路同值）→ `notPermitted`（发起者任一侧成员资格已无效）· `organizationAssetNotCopyable` · `sourceNotOwned` · `outsideTree`（再判）；读不到 ⇒ `unavailable` |
| ⑦ | **同一份通知再确认 ⇒ `offerNoLongerValid`**（`accepted` 是 `data.offer-expiry/v1#S-13` 的第三条来路），**不产生第二份效果**。**再判失败不写任何东西**，通知仍 `pending` |
| ⑧ | 过期判定读不到（时间源、存在性读面）⇒ `unavailable`，**不得放行，也不得判成已过期**（`#S-20`）；成员资格、组织读面、上级链、资产治理读面任一读不到 ⇒ `unavailable`，**不得在读不到的情况下落地，也不得把它说成越界**；缺席或不合形状 ⇒ `invalidInput` |
| ⑨ | 本契约不发。落地的发布与持有变化由资产治理那一侧的事件承载（`AssetPublished`、`HoldingChanged`，名字归那份契约） |

**确认这一步点头的是「用源侧这一版整个盖掉我这份」**（[flows §1.2](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#12-改好了再复制一次)）——
**它要在 [S-23](#s-23-读复制通知) 读得到那一版的内容与「这次是首次还是重复」之后做**，否则确认者无从知道自己点头的是什么。

### S-23 读复制通知

`readCopyNotice`

| # | 内容 |
|---|---|
| ① | 读者 `TenantId`、`CopyNoticeId` |
| ② | **两类人之一**：发起者本人（源侧成员资格有效）；目标组织的有效超级管理员。**其余一律 `noticeNotFound`** |
| ③ | 无 |
| ④ | 只读，**派生状态在本次读取的时点求值**（`data.offer-expiry/v1#S-9`） |
| ⑤ | **按读者分两种投影**。**发起者**：通知的全部字段 ＋ 此刻的 `OfferState` ＋ 已确认时的 `CopyOutcome`。**目标侧**：`CopyNoticeId`、**目标侧租户身份** (目标, 发起者账号)、能力标识、源版本号、**那一版的内容**、`OfferTiming`、此刻的 `OfferState`、**此刻确认会是首次还是重复**（按 [S-10](#s-10-复制血缘怎么判怎么记) 现判；重复时带被覆盖的那份目标记录的 `AssetRecordId`）、已确认时的 `CopyOutcome`——**不含源记录号、源组织、源侧的发起者租户身份** |
| ⑥ | `invalidInput` → `noticeNotFound`；读不到 ⇒ `unavailable` |
| ⑦ | 只读；**返回的派生状态与首次／重复判断都不得被缓存后复用** |
| ⑧ | 通知、时间源、存在性读面、成员资格任一读不到 ⇒ `unavailable`，**不得把派生状态填成 `pending`，不得据存在性读不到判成 `expired`**，也**不得把成员资格读不到收成 `noticeNotFound`**——那是把失败说成「没有这份」；缺席或不合形状 ⇒ `invalidInput` |
| ⑨ | 不发 |

**目标侧那种投影为什么要去掉源**：[「能看到由某租户在某时送进来第几版，看不到源资产本身」](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘)。
**而它必须带着内容与首次／重复**：目标侧超管据此决定要不要让这一版「整个盖掉」自己那一份——[那正是把判定交给系统、却把点头留给目标组织的原因](../../../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制)。

### S-24 发起分享

`issueSharingInvitation`

| # | 内容 |
|---|---|
| ① | 发起者 `TenantId`、`AssetRecordId`、被分享方 `OrganizationId`、**可选：这一份的有效时长**（缺席按分享邀请这一类的默认值） |
| ② | 发起者成员资格**有效**；资产是**分享方一侧的现有资产**（[S-13](#s-13-发起者一侧的资产) 的「分享」一列：归他本人，或归他的组织而他是该组织的超级管理员）；那份资产**至少有一个已发布版本** |
| ③ | **有**：`officialNotTransferable`、`notTransitive`、`outsideTree`（[S-12](#s-12-流转边界团队资产不出那棵树) 的分享边界） |
| ④ | 写一份分享邀请，`OfferTiming` 在这次提交内定死。单次提交 |
| ⑤ | `SharingInvitationId`；资产是 plugin 时另带告知清单（[S-14](#s-14-plugin-的复制与分享)） |
| ⑥ | `invalidInput`（含被分享方即分享方组织）→ `notPermitted`（成员资格）→ `sourceNotOwned` · `officialNotTransferable` · `notTransitive` · `notPermitted`（资产归组织而发起者不是超管）→ `versionNotPublished` → `outsideTree`；读不到 ⇒ `unavailable` |
| ⑦ | **不幂等**，理由同 [S-20](#s-20-发起复制) ⑦；同一对的第二份邀请被确认时认回已有的那份分享（[S-26](#s-26-确认分享) ⑦） |
| ⑧ | 同 [S-20](#s-20-发起复制) ⑧ |
| ⑨ | 不发 |

**分享不要求双方是同一个人**（[§6.3](../../../../product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份)）：这里没有目标侧成员资格那一步，被分享方由它自己的超管在 [S-26](#s-26-确认分享) 点头。

### S-25 撤回分享邀请

`withdrawSharingInvitation`

| # | 内容 |
|---|---|
| ① | 撤回者 `TenantId`、`SharingInvitationId` |
| ② | 撤回者是这份邀请的发起者（成员资格有效），**或**资产此刻归分享方组织所有而撤回者是该组织的有效超级管理员（[S-19](#s-19-这一节每个操作写全九件事) 的「谁能做」，推导） |
| ③ | 无 |
| ④ | 同 [S-21](#s-21-撤回复制通知) ④ |
| ⑤ | `ok` |
| ⑥ | `invalidInput` → `invitationNotFound`（不存在，或撤回者不属于②那两类人）→ `alreadyConcluded`；读不到 ⇒ `unavailable` |
| ⑦ | 同 [S-21](#s-21-撤回复制通知) ⑦ |
| ⑧ | 同 [S-21](#s-21-撤回复制通知) ⑧ |
| ⑨ | 不发 |

### S-26 确认分享

`confirmSharing`

| # | 内容 |
|---|---|
| ① | 确认者 `TenantId`、`SharingInvitationId` |
| ② | 确认者的组织就是被分享方组织，成员资格**有效**且是**超级管理员**；邀请求值为 `pending`，**同提交重判**。**再判**：发起者仍有权分享这份资产（[S-24](#s-24-发起分享) ②，按资产**此刻**的所有者）；[S-12](#s-12-流转边界团队资产不出那棵树) 的分享边界仍成立 |
| ③ | **有**：`outsideTree`（发起后隶属解除） |
| ④ | **单次提交**（[S-18](#s-18-确认是一次提交同一落点的确认序列化)）：过期重判 ＋ 再判 ＋ **新建或认回**分享 ＋ **被分享方组织层此刻没有这个能力标识的持有 ⇒ 为它取得持有**（basis `shared`，带这份分享的 `SharingId`，版本选用恒为 `current`——组合 `capability.asset-governance/v1#S-30` 带 `sharing`）；**已有 ⇒ 不动那份持有** ＋ 邀请写终结记录 `accepted`，全部同时成立；受同一 (资产, 被分享方) 的序列化约束 |
| ⑤ | `SharingId` ＋「是否取得了持有」 |
| ⑥ | `invalidInput` → `invitationNotFound`（不存在，或确认者的组织不是被分享方）→ `notPermitted`（确认者不是被分享方的有效超管）→ `offerNoLongerValid`（三路同值）→ `notPermitted`（发起者已无权分享）· `sourceNotOwned` · `outsideTree`（再判）；读不到 ⇒ `unavailable` |
| ⑦ | **同一份邀请再确认 ⇒ `offerNoLongerValid`**，不产生第二份效果。**同一 (资产, 被分享方) 已有一份 `active` 的分享 ⇒ 认回那一份**：返回它的 `SharingId`，不新建；这份邀请照样写 `accepted`（[S-8](#s-8-分享)） |
| ⑧ | 同 [S-22](#s-22-确认复制) ⑧ |
| ⑨ | 本契约不发；取得持有由资产治理的 `HoldingChanged` 承载 |

**「已有同标识的持有就不动它」**与复制撞标识是同一条道理：[被分享方对自己的求值链有支配权](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)，
确认一份分享**不得静默替换**它那层已经选用的东西。使用权照样建立；它要用这份，自己用资产治理的写面换上——
那份持有可用与否，按 [S-9](#s-9-分享此刻是否生效) 在使用时判，**不回头问本契约**。

### S-27 读分享邀请

`readSharingInvitation`

| # | 内容 |
|---|---|
| ① | 读者 `TenantId`、`SharingInvitationId` |
| ② | 发起者本人；资产此刻归分享方组织时该组织的有效超级管理员；被分享方组织的有效超级管理员。其余 `invitationNotFound` |
| ③ | 无 |
| ④ | 只读，读时求值 |
| ⑤ | 邀请的全部字段 ＋ 此刻的 `OfferState` ＋ 已确认时的 `SharingId`；**两端看到的是同一个投影**——被分享方用的就是分享方那份记录，没有需要对它藏的源 |
| ⑥ | `invalidInput` → `invitationNotFound`；读不到 ⇒ `unavailable` |
| ⑦ | 只读，不得缓存复用 |
| ⑧ | 同 [S-23](#s-23-读复制通知) ⑧ |
| ⑨ | 不发 |

### S-28 撤销分享

`revokeSharing`

| # | 内容 |
|---|---|
| ① | 撤销者 `TenantId`、`SharingId` |
| ② | 撤销者是这份分享的发起者（成员资格有效），**或**资产此刻归分享方组织而撤销者是它的有效超级管理员 |
| ③ | 无 |
| ④ | 记录为 `active`（含派生为 `dissolved` 的）⇒ 写 `revoked`（带撤销者与时刻）。单次提交。**不碰被分享方的任何持有与配值**——那是对方那一层的事实，分享方写不到那里 |
| ⑤ | `ok` |
| ⑥ | `invalidInput` → `sharingNotFound`（不存在，或撤销者不属于②那两类人）；读不到 ⇒ `unavailable` |
| ⑦ | **已结束**（`revoked` 或 `removed`）⇒ `ok`，**不改写已有的结束记录**：三种结束[效果相同](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#32-一段分享关系)，撤销者要的「对方不再有使用权」已经成立 |
| ⑧ | 读不到 ⇒ `unavailable`；缺席或不合形状 ⇒ `invalidInput` |
| ⑨ | 不发 |

**撤销向后生效**：影响的是被分享方**下一次**使用（[S-9](#s-9-分享此刻是否生效)），[不强停正在运行的工作](#s-36-撤销不发出停止信号)。
被分享方那层的持有与配值留着、**不可用**；它愿意可以自己[移除](#s-29-移除收到的分享)。

### S-29 移除收到的分享

`removeShared`

| # | 内容 |
|---|---|
| ① | 移除者 `TenantId`、`SharingId` |
| ② | 移除者的组织就是被分享方组织，成员资格有效且是超级管理员 |
| ③ | 无 |
| ④ | **单次提交**：记录为 `active` ⇒ 写 `removed`；**并且**被分享方组织层若以 basis `shared` 持有这份资产，**移除那份持有**（组合资产治理的 `unhold`，配值随之消失——[移除就是不再持有](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-removal--资产移除--asset-removal)） |
| ⑤ | `ok` |
| ⑥ | `invalidInput` → `sharingNotFound`（不存在，或移除者不是被分享方的有效超管）；读不到 ⇒ `unavailable` |
| ⑦ | **已结束 ⇒ 不改写结束记录**；若那份 shared 持有还在，照样移除它，返回 `ok`——被分享方在对方撤销之后清掉自己那层的残留，走的就是这条 |
| ⑧ | 读不到 ⇒ `unavailable`；缺席或不合形状 ⇒ `invalidInput` |
| ⑨ | 本契约不发；持有变化由资产治理的 `HoldingChanged` 承载 |

### S-30 列出组织的分享

`listSharings`

| # | 内容 |
|---|---|
| ① | 调用方 `TenantId`、`OrganizationId`、**可选过滤**：只要此刻 `active` 的，还是全部（**默认只要此刻 `active` 的**） |
| ② | 调用方是该组织的有效成员。**看得见哪些**：该组织是**被分享方**的全部分享——**任一有效成员可见**，他们用的就是这些（推导）；该组织是**分享方**的分享里，**资产归该组织的那些只有超级管理员可见**，**资产归某个租户的那些只有那个租户本人可见**——[团队里他租户级的是他的私有部分](../../../../product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份)，超管也看不到 |
| ③ | 无 |
| ④ | 只读，**每一项的 `SharingState` 在本次读取的时点求值**（[S-9](#s-9-分享此刻是否生效)：`dissolved` 是这一刻算出来的） |
| ⑤ | 列表，每项：`SharingId`、分享方组织、被分享方组织、`AssetRecordId`、能力标识、确认时刻、此刻的 `SharingState` |
| ⑥ | `invalidInput` → `notPermitted`（调用方不是该组织的有效成员）；读不到 ⇒ `unavailable` |
| ⑦ | 只读 |
| ⑧ | 分享记录、成员资格、组织读面、上级链任一读不到 ⇒ `unavailable`，**不得返回空列表或少了几项的列表**，也**不得把求不出边界的那几项判成 `dissolved`**；过滤开关不在集合内 ⇒ `invalidInput` |
| ⑨ | 不发 |

**失败值是 `notPermitted`，不是 `sharingNotFound`**：本条按组织定位，调用方本来就拿着自己的 `TenantId`，没有存在性可泄漏。

### S-48 列出组织收到的待确认件

`listPendingForOrganization`（主线裁定 2026-09-23，待产品负责人确认；账本 T-2，原 G-1 闭合）

| # | 内容 |
|---|---|
| ① | 调用方 `TenantId`、`OrganizationId` |
| ② | 调用方是该组织的**有效超级管理员**——能确认复制与分享的就是这一类人（[S-22](#s-22-确认复制)、[S-26](#s-26-确认分享) ②） |
| ③ | 无 |
| ④ | 只读，**每一项的 `OfferState` 在本次读取的时点求值**（`data.offer-expiry/v1#S-9`） |
| ⑤ | 列表：目标是该组织、此刻 `pending` 的复制通知，与被分享方是该组织、此刻 `pending` 的分享邀请；每项只带**它是哪一类、它的标识（`CopyNoticeId` 或 `SharingInvitationId`）与 `OfferTiming`**——内容、首次还是重复、谁送来的，按标识调 [S-23](#s-23-读复制通知)／[S-27](#s-27-读分享邀请) 读，投影规则只在那两条里。可以为空 |
| ⑥ | `invalidInput` → `notPermitted`（调用方不是该组织的有效超管）；读不到 ⇒ `unavailable` |
| ⑦ | 只读；派生状态不得缓存后复用 |
| ⑧ | 待确认件、时间源、存在性读面、成员资格任一读不到 ⇒ `unavailable`，**不得返回空列表或少了几项的列表**，也**不得据存在性读不到把一项判成已过期而不列**；缺席或不合形状 ⇒ `invalidInput` |
| ⑨ | 不发 |

**只列收到的一侧，只列 `pending` 的**：发起的一方拿着自己发出的标识，按 [S-23](#s-23-读复制通知)／[S-27](#s-27-读分享邀请) 读得到；已终结的在各自的终结记录里，不是「等着人去点头」的那一类。
**失败值是 `notPermitted`**，理由同 [S-30](#s-30-列出组织的分享)：按组织定位，没有存在性可泄漏。

---

## 五、关系变化之后

### S-31 隶属解除：分享在使用时失效，不靠事件

**隶属关系解除（`capability.organization-governance/v1#S-33`）之后，此前在那两个团队组织之间确认的分享失效**
（[§6.12](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)）；**复制下来的留着**。

**失效的兑现点是 [S-9](#s-9-分享此刻是否生效) 的使用时判定，不是一个事件的反应。**
`capability.organization-governance/v1#S-40` 已写死 PF-003 的分享失效**不靠 `affiliation.dissolved`**，
`data.identity-values` 的 [CS-4](../../../data/identity-values/v1/contract.md#cs-4-分享边界有共同上级) 同一句话：「失效是这个求值条件的结果，不依赖任何事件送达」。
靠事件，漏一次通知就留下一份仍在生效的分享——[模型在去掉使用时判定时给出了这条反例](formal/README.md)。

**因此本版不对 `affiliation.dissolved` 做任何写入反应**：
`dissolved` 是读时算出来的（[S-9](#s-9-分享此刻是否生效)），**没有一条被写下的「已解除」记录**。
写一条会让「发了事件的部署」与「没发的部署」对同一份分享给出不同的后续答案——那是两份不同的契约。

**由此带出一个本版不承诺的后果**：两个组织此后**重新**建立隶属，那份记录仍为 `active` 的分享**重新生效**。
[flows §3.2](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#32-一段分享关系) 把「结束」画成终态，
**而本版给不出一个不依赖事件、又能记住「中间断过」的判定**——隶属关系只有「此刻的上级」这一个属性，没有历史。
**这是一个显式缺口，不是默认答案**：[G-4](#十一已知缺口)。它不越界——重新生效那一刻两者就在同一棵树上——但它让一段已结束的关系不经对方点头就恢复。
被分享方不想要，可以在断开期间[移除](#s-29-移除收到的分享)；分享方可以[撤销](#s-28-撤销分享)，二者都写下终态记录。

### S-32 成员关系解除：复制执行不了，已确认的不动

| 情形 | 结果 | 依据 |
|---|---|---|
| 发起者退出源组织或目标组织，他发出的复制通知还悬着 | 确认时 [S-17](#s-17-每道准入现读确认时再判一遍) 再判不过 ⇒ `notPermitted`，**不落地**；他也撤不了（[S-21](#s-21-撤回复制通知) ②），通知等它过期 | [§6.12](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)「他再也执行不了复制」 |
| 发起者退出分享方组织，他发出的分享邀请还悬着 | 确认时再判不过 ⇒ `notPermitted`（[S-26](#s-26-确认分享) ②）；资产归组织时该组织的超管可以撤回，归他本人时没人撤得了，等它过期 | 同上，推导：确认是一道准入 |
| 他退出之前复制下来的那份 | **不动**：所有者是目标组织，作者记录照旧 | [PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) |
| 他退出，他的租户级资产 | 不删、不迁（`capability.organization-governance/v1#S-38`、`data.identity-values/v1#S-26`）。**所以指着它的待确认件不因他退出而过期**——[S-7](#s-7-两类待确认件共用的过期语义) 的存在性看的是记录与持有，不是成员资格 | 同上 |
| 他退出，他发起的、以他租户级资产为对象的分享 | **不因此结束**——结束只有三个来路；被分享方照常使用 | [§6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有) |
| 同上，**分享方那侧谁还能撤销它** | 本版没有人（[S-28](#s-28-撤销分享) ②：他已不是有效成员；资产不归组织，超管不在②里）；被分享方仍可移除 | **[G-7](#十一已知缺口)** |

---

## 六、事件

### S-33 本版不发本契约自己的事件

**本契约的操作 ⑨ 一律「不发」。**落地与持有的变化由资产治理那一侧的事件承载（`AssetPublished`、`HoldingChanged`，`capability.asset-governance/v1#S-48`；账本 T-2）；
待确认件与分享的送达面是**读面**（[S-23](#s-23-读复制通知)、[S-27](#s-27-读分享邀请)、[S-30](#s-30-列出组织的分享)、[S-48](#s-48-列出组织收到的待确认件)）——
[内核不提供可靠投递](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)，本契约的任何性质都不靠某个监听者收到了什么。

**注册表与审计的需要都由别处接住**：注册表按资产治理的事件与读时现读收窄（`capability.asset-registry` 的 `onAssetChange`），分享撤销与隶属解除不产生持有变化、下一次使用时显现；审计读两类待确认件与分享的终结／结束记录（原 G-6 闭合）。将来开本契约自己的事件，**只能是通知**：
任何参与放行判定的扩展点要么是同步前置、要么是逐个等待其结论的顺序派发，与 `capability.organization-governance` v1 同一口径。

---

## 七、性质与前提

性质的来源一律引 PF 小节；**本节行不编号，不是可外部引用的条款**。

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **团队资产不出那棵树**：复制只在复制边界成立时落地；分享只在分享边界此刻成立时被使用 | [S-12](#s-12-流转边界团队资产不出那棵树) 的三个时点：发起、确认同提交、使用时 [S-9](#s-9-分享此刻是否生效) | 组织读面与上级链读得到且与写入同源；求值按 [S-9](#s-9-分享此刻是否生效) 判 shared 持有（**求值 owner 的责任**）；其他出口的 owner 引用本条自证 | [§6.1](../../../../product/PF-003-asset-transfer-and-sharing/design.md#61-一条不变量团队资产不出那棵树)、[§5.2](../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)、[acceptance §二](../../../../product/PF-003-asset-transfer-and-sharing/acceptance.md#二绝不能发生的事) |
| **同一 (源记录, 目标组织) 至多一份带对应血缘的目标记录** | [S-18](#s-18-确认是一次提交同一落点的确认序列化) 的同提交与序列化 | 存储兑现序列化 | [§4 复制血缘](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘)（「它只用来回答再复制一次该更新哪一份」） |
| **同一 (资产, 被分享方) 至多一份 `active` 的分享** | [S-26](#s-26-确认分享) ⑦ ＋ [S-18](#s-18-确认是一次提交同一落点的确认序列化) | 同上 | [flows §1.7](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#17-结束一段分享)（「移除」是一个动作） |
| **终结记录与结束记录一经写下不改写** | 各写操作 ④ 的「先读再写」与 ⑦ | 单次提交原子性 | [flows §3.4](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#34-一份待确认的邀约复制通知与分享邀请同形)「结束不可回到待确认」 |
| **复制下来的记录：所有者目标组织、作者 (目标组织, 发起者账号)、来源 customized、自己的版本线；源侧一字节不动** | [S-11](#s-11-复制的收场) 的写集合 | 资产治理的落地面照写（[G-10](#十一已知缺口)） | [§6.5](../../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制)、[§6.4](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象) |
| **`LineageId` 一经产生不变，且目标侧拿不到源记录号** | [S-10](#s-10-复制血缘怎么判怎么记) | (源, 目标) ↔ `LineageId` 的对应不出本契约 | [§4 复制血缘](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘) |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **一份过期、已撤回或已确认的待确认件被确认之后产生了效果** | [S-22](#s-22-确认复制)／[S-26](#s-26-确认分享) 的同提交重判，三路同收 `offerNoLongerValid` | 时间源同源可用；存在性读面可辨持有实例（[G-3](#十一已知缺口)） | [§6.14](../../../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)、[acceptance §二](../../../../product/PF-003-asset-transfer-and-sharing/acceptance.md#二绝不能发生的事) |
| **一次复制冲掉了目标组织配好的值（含 immutable）或它的持有** | [S-11](#s-11-复制的收场)：`overwritten` 的写集合不含持有与配值 | 资产治理的发布面只写版本 | [§6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)、[acceptance §三](../../../../product/PF-003-asset-transfer-and-sharing/acceptance.md#三判据) |
| **一次复制冲掉了目标组织自己做的同名组件** | [S-10](#s-10-复制血缘怎么判怎么记)：只看血缘；[S-11](#s-11-复制的收场)：撞标识不碰那一份、也不碰它的持有 | — | [§6.8](../../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘) |
| **团队组织的组织级资产被复制出去** | [S-13](#s-13-发起者一侧的资产) ＋ [S-22](#s-22-确认复制) 的再判（发起后被提升的也挡） | — | [§6.4](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象) |
| **被分享来的被再分享或复制出去** | [S-13](#s-13-发起者一侧的资产) | — | [§6.13](../../../../product/PF-003-asset-transfer-and-sharing/design.md#613-分享不可传递) |
| **隶属解除之后分享出去的还能用** | [S-9](#s-9-分享此刻是否生效)（使用时判）＋ [S-31](#s-31-隶属解除分享在使用时失效不靠事件) | **求值按 S-9 判 shared 持有**；上级链读一致 | [acceptance §二](../../../../product/PF-003-asset-transfer-and-sharing/acceptance.md#二绝不能发生的事) |
| **隶属解除之后复制过去的被收回** | 本契约没有任何写目标组织记录的路径，除了确认那一步 | — | 同上 |
| **一个已不是有效成员的租户身份被用来执行一次复制** | [S-22](#s-22-确认复制) 的再判 | 成员资格现读 | [§6.12](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后) |
| **读不到被当成「不存在」「不在树上」「不是他的」「不是成员」** | [S-16](#s-16-缺席时的默认答案) ＋ 各操作 ⑧ | 各读面以失败返回，不以空值返回 | `data.identity-values/v1#S-19` |
| **目标侧从任何读面拿到源记录号或源组织** | [S-23](#s-23-读复制通知) 的目标侧投影、[S-10](#s-10-复制血缘怎么判怎么记) | — | [§4 复制血缘](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘) |
| **确认之后留下部分效果**（记录建了通知还悬着，或反之） | [S-18](#s-18-确认是一次提交同一落点的确认序列化) | 两个 owner 的写集合在同一次提交里（[S-34](#s-34-装配给的保证-vs-协议须给的保证) 第一行） | [PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果) |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| 未确认也未撤回的待确认件，**不迟于 `issuedAt + offer_ttl`** 进入不可确认 | `offer_ttl`，**不依赖定时器** | 时间源可用、同源、`now` 不后退（`data.offer-expiry/v1#S-17`） | [§6.14](../../../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期) |
| 指向的资产被移除或删除之后，**下一次**读即见派生状态 `expired`、确认即收 `offerNoLongerValid` | 下一次读／确认 | 存在性读面可辨持有实例（[G-3](#十一已知缺口)） | 同上 |
| 确认复制成功返回之后，目标组织**下一次**求值就用到落地的内容 | 下一次求值 | 求值取持有记录当前发布的那一版（[十二](#十二消费者核对)） | [§6.6](../../../../product/PF-003-asset-transfer-and-sharing/design.md#66-重复复制全量覆盖替换) |
| 分享方发布新版本之后，被分享方**下一次**求值就用到新版本 | 下一次求值 | 同上 | [§6.11](../../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保) |
| 撤销、移除成功返回之后，或隶属解除提交之后，被分享方的**下一次**使用被拒 | 下一次使用 | 求值按 [S-9](#s-9-分享此刻是否生效) 现读，缓存写明失效条件 | [flows §1.7](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#17-结束一段分享)、[§6.12](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后) |
| 被拒的操作**立即**返回一个具名值，且不留部分效果 | 该次返回 | 单次提交原子性 | [PF-001 §6.8](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果) |

---

## 八、装配给的保证 vs 协议须给的保证

### S-34 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：右列是本契约已经记下的待兑现项（[G-8](#十一已知缺口)），不是「以后再说」。

| 保证 | 本版（单机）由谁给 | 跨进程之后谁重新兑现 | 做不到会怎样 |
|---|---|---|---|
| **确认的同提交**：过期重判、再判、落地、终结记录（[S-18](#s-18-确认是一次提交同一落点的确认序列化)） | **装配给**：本契约与资产治理的写集合落在同一存储的同一事务 | **协议给**：两个 owner 分属两个进程时，须有等价的原子提交协议；「同一个函数调用」不构成原子 | 记录建了、通知还悬着（下一次确认再建一份），或通知确认了、记录没建（目标组织以为收到了） |
| **同一落点的确认序列化**（血缘唯一、同对至多一份 `active`） | **装配给**：同一存储对同一键的写入序列化 | **协议给**：跨节点协调（单一写者或等价协议） | 同一 (源, 目标) 出现两份带血缘的记录，重复复制不知道覆盖哪份；同一对两份 `active`，「移除」一次说不完 |
| **边界读一致性**：确认与使用时求的 `shareAncestor` 与刚提交的隶属变化同源 | **装配给**：同一存储读写同源 | **协议给**：须定义读一致性级别；陈旧读**不得放行**跨组织流转（`data.identity-values` 装配表同一行） | 隶属刚解除，陈旧读判成同树：一次复制落在树外，或一次使用越界 |
| **成员资格与角色的可见性** | **装配给**：写入即可被下一次读看到 | **协议给**：须定义传播时延上界并写进契约 | 刚退出的人的通知在上界内仍可能落地 |
| **待确认件的时钟同源与存在性读数新鲜度** | 由 `data.offer-expiry/v1#S-17` 给 | 同左，本契约不重复承诺 | — |
| **边界判定与隶属变更的先后**（确认时的再判、使用时的 [S-9](#s-9-分享此刻是否生效)） | **装配给**：确认的提交与组织治理的隶属写入由同一把隶属哨兵串行（组织治理节点登记的外部依赖，实现映射阶段；拆分提案 PA-4） | **协议给**：跨节点时这把哨兵要有等价的协调；读到的上级链必须不早于最近一次提交的隶属变更 | 解除隶属与一次确认交错：确认按解除之前的上级链放行，**团队资产落在树外** |
| **调用方身份已经核实过**（全部操作） | **装配给**：本契约的面是能力间内部面；入口层先把登录状态换成当前租户身份，再带着身份值来调 | **协议给**：跨进程时携带授权依据，**在接收边界重新验证**（`data.identity-values/v1#S-30`） | 谁拿到一个 `TenantId` 就能以那个身份发起、确认、撤销；**本契约的面因此不得直接暴露成终端 API** |
| **(源, 目标) ↔ `LineageId` 的对应不出本契约** | **装配给**：对应只存在本契约的存储里，没有读面返回它 | **协议给**：本契约的存储分到别的节点后，对应仍不得随任何发往目标组织一侧的消息流出 | 目标组织据血缘反推源记录号与源组织——[那正是血缘被做浅的原因](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘) |

---

## 九、交接、缺席与恢复

### S-35 依赖的提供者不可用

组织治理、资产治理的读面或时间源不可用时，依赖它的操作**以 `unavailable` 明确失败，不静默降级**：
不得跳过成员资格判定、不得把读不到当成「在同一棵树上」或「不在」、不得把读不到的存在性当成「在」或「不在」。
**资产治理的写面在确认那次提交里失败**，整次确认失败、不写终结记录——[S-18](#s-18-确认是一次提交同一落点的确认序列化) 没有「先确认、落地稍后补」这一支。

### S-36 撤销不发出停止信号

撤销分享、移除分享、隶属解除、成员退出，**都只影响下一道尚未通过的准入**（[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)、
[flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)「资产在 agent 运行中被覆盖、撤销或移除——不影响已经开始的调用」）。
本契约**不发出任何停止、中断或取消信号**；已经开始的调用是否停止，归独立的运行控制。

### S-37 本能力自己被撤除、替换或重启

本契约拥有的事实——两类待确认件、分享记录、血缘对应——**全在存储里**，没有一条只活在运行实例内：
没有定时器承担正确性（过期是读时求的，`data.offer-expiry/v1#S-18`），没有跨提交的在途工作（全部操作单次提交结算）。
**重启不改变任何判定结果，也没有在途工作需要交接。**
**这是一条可被推翻的承诺**：引入任何跨提交在途状态（例如「先确认、后台再落地」）都会使它失效，那时必须回到本节重写交接责任。

---

## 十、规范表达与验证义务

### S-38 本版选用哪些形式工件

| 性质 | 表达 | 理由 |
|---|---|---|
| [S-7](#s-7-两类待确认件共用的过期语义) 确认／撤回／过期互斥、[S-10](#s-10-复制血缘怎么判怎么记) 血缘唯一、[S-8](#s-8-分享) 同对至多一份 `active`、[S-12](#s-12-流转边界团队资产不出那棵树) 复制落地与分享使用的边界 | **TLA+ 行为模型**（[`formal/Transfer.tla`](formal/Transfer.tla)，主配置 [`Transfer.cfg`](formal/Transfer.cfg)） | 每一条都是**交错**问题：确认的读与写之间、发起与确认之间、确认与使用之间，隶属、成员资格、时间与资产都在变。**每条保护都配了一个去掉它就给出反例的有效性核对**，见 [formal 入口](formal/README.md) |
| [S-31](#s-31-隶属解除分享在使用时失效不靠事件) 解除之后恢复同树会重新生效（[G-4](#十一已知缺口)） | 同一模型，配置 [`Transfer_Revival.cfg`](formal/Transfer_Revival.cfg)，**预期给出反例** | 把缺口写成一条会被执行的陈述；**不登记为 formal task** |
| 覆盖不碰配值、plugin 随行、失败值与读面、`unavailable` | **规范场景**（[S-39](#s-39-两类待确认件的三种收场)～[S-47](#s-47-不可用时明确失败)） | 写集合的约束在模型里写成 `UNCHANGED` 就被吸收了，**那不是证据**；失败值与投影要真跑才看得见 |

**本版不附 JSON Schema、不建 Alloy。**数据形状归 `data.asset-model` 与 `data.offer-expiry`；
边界判据的结构性质已由 `capability.organization-governance` v1 的 Alloy 模型覆盖，本契约引用判据不复述。
执行状态与结果在[验证入口](../verification.md)，**不写进本版本目录**。

### 规范场景

#### S-39 两类待确认件的三种收场

对复制通知与分享邀请**各**演练一遍：发出一份，分别让它 ① 被确认 ② 被撤回 ③ 放到过期（**关掉任何后台清理**），然后再确认；**同一次**再跑第四支：对①那份再确认一次。
**必须观察到**：① 产生约定的那一个效果；②③④ 确认被拒，值**逐字相同**（`offerNoLongerValid`），**且没有任何效果**；③ 显式给时长 `T`、在 `issuedAt + T` 之后确认。
**另跑两支**：不给时长的那份按该类默认值算出 `expiresAt`；给非正时长 ⇒ `invalidInput`、**不写入任何东西**。
撤回路径：撤回已确认的、撤回已过期的 ⇒ 同为 `alreadyConcluded`，**不写终结记录**；再撤回已撤回的 ⇒ `ok`。

#### S-40 首次、重复、撞标识无血缘

同一人把个人组织里一个 skill 的 v1 复制给团队 T（首次）→ 源侧发布 v2 再复制（重复）→ 另一个团队 U 里**自己先建一个同能力标识的 skill**，然后把同一源复制给 U。
**必须观察到**：T 里出现**一份**新记录，所有者 T、作者 (T, 他)、v1、带血缘；重复那次 T 那份出 v2、**记录号不变、血缘号不变**、`imports = 2`；
U 那次返回 `created`、**U 自己那份一字节不动、它的持有不动**，新记录**未取得持有**，返回里告知同一标识下有两份；**源侧什么都没变**。

#### S-41 覆盖不碰配值

目标组织为复制来的那份配一项权限并加锁、禁用它，再被重复复制一次。
**必须观察到**：新版本立即是那份记录当前发布的那一版；**那一项配值与锁照旧、禁用照旧、持有照旧**（[acceptance §三](../../../../product/PF-003-asset-transfer-and-sharing/acceptance.md#三判据)「覆盖不碰配置」）。

#### S-42 边界在每条路径上都挡住

构造：无共同上级的两个团队；个人组织 → 团队的分享；团队 → 个人组织的复制与分享；团队的组织级资产复制；被分享来的再分享与再复制；官方件复制；草稿版本复制。
**必须观察到**：各自拿到 [S-19](#s-19-这一节每个操作写全九件事) 总表里对应的那一个值，**发起者都是超级管理员**——结构性禁止不随角色变（[S-15](#s-15-结构性禁止不是权限判定)）。
**再跑一支**：同树时发出复制通知，解除隶属后再确认 ⇒ `outsideTree`，**不落地**；重建隶属之后仍在有效期内的同一份通知可以确认。

#### S-43 分享的建立、跟随与三种结束

集团把一个组件分享给同树的子公司并被确认 → 集团发布新版本 → 子公司为它配执行权限 → 集团撤销；另起一份分享，子公司移除；再起一份，确认前撤回。
**必须观察到**：确认之后子公司的下一次求值用到它、发布之后**不经任何操作**用到新版本；撤销之后下一次使用被拒、**子公司那层的持有与配值还在**；移除之后持有与配值**一起没了**；同一对第二份邀请被确认时**认回同一个 `SharingId`**。

#### S-44 隶属解除之后：分享失效，复制留着

A 同时把一份资产**分享**给 B、把另一份**复制**给 B，然后解除隶属。
**必须观察到**：分享那份下一次使用被拒、`listSharings` 里它此刻是 `dissolved`；复制那份照常用、照常改；**没有任何一步依赖 `affiliation.dissolved` 被谁收到**——把事件派发关掉重跑，结果相同。
**再跑一支**（[G-4](#十一已知缺口) 的观测）：重建隶属，记录仍为 `active` 的那份分享重新生效——**如实记下，不当作通过也不当作缺陷**，等产品裁。

#### S-45 资产被移除即过期

发出一份复制通知与一份分享邀请，确认之前让**所有者那一层移除**那份资产，然后确认。
**必须观察到**：读到派生状态 `expired`、确认被拒且值为 `offerNoLongerValid`，不是一个点头之后的当场失败。
**再跑一支**：移除之后**重新持有同一份记录**，那两份读到的仍是 `expired`（[G-3](#十一已知缺口) 闭合之前这一支可能失败，**失败要如实记**）。
**这条与 `data.offer-expiry/v1` 的 S-26 可一次执行两边兑现**，两边各自记结果。

#### S-46 plugin 随行与引用告知

分享（与复制）一个 plugin，它引用一个目标组织没有提供者的能力标识。
**必须观察到**：发起成功，⑤ 的告知清单列出那个能力标识；确认之后目标侧**只有 plugin 那一份**记录／分享／持有，成员没有各自的。**受阻于 [G-5](#十一已知缺口)**。

#### S-47 不可用时明确失败

分别让成员资格读面、组织读面、上级链、时间源、资产治理读面**不可用**（故障注入），调发起、确认、撤回、读与列表。
**必须观察到**：一律 `unavailable`；**没有一次被收成 `notPermitted`、`outsideTree`、`sourceNotOwned`、`offerNoLongerValid`、`noticeNotFound` 或空列表**，也没有任何写入。

---

## 十一、已知缺口

**缺口不填默认值。**下列各项等具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **已闭合（2026-09-24 整批对齐）**：接收方的发现面 `listPendingForOrganization`（[S-48](#s-48-列出组织收到的待确认件)；主线裁定 2026-09-23，待产品负责人确认，账本 T-2）。「列出我发出的」没有裁定，发起方按手上的标识读 | — | — |
| G-2 | **目标侧普通成员「有条件：按被授予的权限」确认复制**：本版没有可授予的资格（[UL-super-administrator](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-super-administrator--超级管理员--super-administrator)「本版没有可被授予的管理资格」）。本契约收 `notPermitted` | 产品负责人（PF-003 / PF-002 flows §四同一句） | 产品写明授予的是什么、由谁授予；本契约 [S-22](#s-22-确认复制) ② 随之补一格 |
| G-3 | **指向对象的身份**：[S-7](#s-7-两类待确认件共用的过期语义) 的存在性要求①资产记录号不回收不复用；②所有者那一层的持有能区分「发起时那一份」与「移除后再持有的那一份」。①已由 `data.asset-model/v1#S-4` 与 `capability.asset-governance/v1#S-5` 承诺；②仍缺——持有形状没有实例身份（同一键上先后两份持有的 `since` 是否严格递增，没有人承诺）。**在它闭合之前**，移除后再持有同一份记录可能让一份已过期的待确认件读回 `pending` | `data.asset-model` / `capability.asset-governance`（对齐） | 形状给出持有的实例身份（或承诺同一键上先后两份持有的 `since` 严格递增），并承诺记录号不复用 |
| G-4 | **隶属解除之后又恢复同树，已因解除失效的分享要不要重新生效**。[S-31](#s-31-隶属解除分享在使用时失效不靠事件)：本版会；[flows §3.2](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#32-一段分享关系) 把「结束」画成终态。模型把它写成了一条会被反驳的陈述（`Transfer_Revival.cfg`） | 产品负责人（PF-003；账本 U-3：**甲 复活**——读时谓词，本版现状；**乙 终态**——要组织治理出新版持久「解除过」的事实。两种表述并列，本版按甲）；若裁「不复活」，再由 `capability.organization-governance` 出新版本给一个**单调的隶属事实**（如隶属关系的实例身份或解除历史的读面） | 产品裁定；裁「复活」则本缺口改写成性质入第七节，裁「不复活」则本契约随那个单调事实出新版本 |
| G-5 | **plugin 正文里「内含成员」与「引用」怎么分**：[S-14](#s-14-plugin-的复制与分享) 的告知清单只对「引用」一支；`data.asset-model` 的 plugin 外壳目前只列一种成员 | `data.asset-model` | plugin 外壳把两种关系分开；告知清单按它求值 |
| G-6 | **已闭合（2026-09-24 整批对齐）**：本契约不发自己的事件（[S-33](#s-33-本版不发本契约自己的事件)）；落地与持有变化由资产治理的事件承载（`capability.asset-governance/v1#S-48`，账本 T-2）；分享撤销与隶属解除不产生持有变化，只在下一次使用时显现——正确性靠使用时判 | — | — |
| G-7 | **分享方是租户、而他已不是有效成员时，谁能撤销他发出的分享与分享邀请**：[flows §四](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#四角色与操作)那一行没覆盖到。本版分享方侧没人能撤，被分享方仍可移除 | 产品负责人（PF-003） | 产品写明；[S-25](#s-25-撤回分享邀请)／[S-28](#s-28-撤销分享) ② 随之补 |
| G-8 | **跨进程**：[S-34](#s-34-装配给的保证-vs-协议须给的保证) 右列——确认的原子提交协议、同落点序列化、边界读一致性、成员资格传播上界、血缘对应的私有性 | 架构设计（本版单机不阻断） | 分布式演化启动时给出，**作为本契约的新版本发布** |
| G-9 | **被分享出去的资产被分享方删除之后，那份已确认的分享是什么**：[flows §二](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)只说「先告知受影响的一方，不默认级联」；删除语义已裁：告知后照删，已发布版本内容作不可解引用的归档保留，引用方读到「已删除」（主线裁定 2026-09-23，待产品负责人确认；账本 A-M25）。照删之后那份分享**记录仍为 `active`、[S-9](#s-9-分享此刻是否生效) 仍判生效**，但它跟随的资产已被删除——求值拿到的是「已删除」，不是内容；**这份分享该读成什么、怎么结束，本版没有答案** | `capability.asset-governance`（删除语义），必要时产品 | 删除语义定下；照删则本契约补一条「资产不存在的分享」怎么读、怎么结束 |
| G-10 | **已闭合（2026-09-24 整批对齐）**：落地面就是资产治理的组合入口（`capability.asset-governance/v1#S-46`：`createDraft` 另收 `author` 与 `lineage`、`hold` 带 `sharing`），由同一提供者在确认的同一次提交内完成（PA-3）；同一所有者之下同一能力标识可以有多份记录（它的 S-5），「撞标识是新增」不再冲突 | — | — |

---

## 十二、消费者核对

本节不新增承诺，只走一遍具名消费者的路径，核对本契约给的面够不够。

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **CLI/TUI：个人 → 团队的复制**（[flows §1.1](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#11-把个人组织里的东西复制给团队)～§1.3） | 发起、看状态、撤回 | [S-20](#s-20-发起复制)、[S-23](#s-23-读复制通知)、[S-21](#s-21-撤回复制通知) | **够**，但**发起者须是目标组织的超管**——原话如此（[S-19](#s-19-这一节每个操作写全九件事) 的「谁能做」），普通成员往团队里交东西本版做不到 |
| **治理中心：目标组织的超管确认复制** | 知道有一份在等、看清要盖掉什么、然后点头 | [S-48](#s-48-列出组织收到的待确认件) 的发现面、[S-23](#s-23-读复制通知) 的目标侧投影、[S-22](#s-22-确认复制) | **够**（原 G-1 闭合） |
| **治理中心：组织间分享** | 发起、对方发现并确认、双方看现状、撤销与移除 | [S-24](#s-24-发起分享)～[S-30](#s-30-列出组织的分享)、[S-48](#s-48-列出组织收到的待确认件) | **够** |
| **`capability.asset-evaluation`：认 basis 为 shared 的持有** | 「这份持有此刻能不能用」 | [S-9](#s-9-分享此刻是否生效) 的判据 ＋ [S-30](#s-30-列出组织的分享) 的读面 | **够**。**它必须在使用时判、不得缓存成永久答案**；「持有记录取当前发布的那一版」已由形状给出：shared 持有恒为 `current`（`data.asset-model/v1#S-18` 第 6 条），求值按持有的版本选用读（它的 C9）——[§6.6](../../../../product/PF-003-asset-transfer-and-sharing/design.md#66-重复复制全量覆盖替换)「立即生效」对追随当前版的持有成立，钉了版本的持有照它钉的那一版 |
| **`capability.asset-governance`：复制落地与取持有** | 被组合进确认的同一次提交 | [S-11](#s-11-复制的收场)、[S-26](#s-26-确认分享) ④ 列出的写集合 | **够**：`capability.asset-governance/v1#S-46` 的组合入口（原 G-10 闭合） |
| **注册表：变化后重填** | 知道什么时候该重填 | 本版没有本契约的事件（[S-33](#s-33-本版不发本契约自己的事件)）；落地与持有变化走资产治理的事件；分享因撤销或解除而不可用**不产生持有变化**，只能在下一次求值时显现 | **够**：落地与持有变化走资产治理的事件；撤销与解除不产生持有变化，下一次使用时显现，不另发事件（原 G-6 闭合）。正确性靠使用时判 |
| **审计** | 谁、何时、对什么、依据什么 | 两类待确认件的终结记录与分享的确认／结束记录都带行为人与时刻 | **够**（读面）；主动推送同 G-6 |
| **`data.offer-expiry/v1`**（[G-6](../../../data/offer-expiry/v1/contract.md#八已知缺口) 点名的五件事） | 非法时长的拒绝值、三路同收的那个值、派生状态读面、存在性读面、资产标识不复用 | `invalidInput`、`expired`、[S-23](#s-23-读复制通知)／[S-27](#s-27-读分享邀请)、[S-7](#s-7-两类待确认件共用的过期语义) | **前四件够**；第五件资产记录号不复用已由 `data.asset-model/v1#S-4` 与资产治理给出；持有实例身份仍在 [G-3](#十一已知缺口) |

---

## 十三、版本差异与规范工件

**本版是首版**，没有被采用的旧版本。
**本版的规范工件**：本文件、[`examples.md`](examples.md)、[`formal/Transfer.tla`](formal/Transfer.tla) 与它的七个检查配置，映射在 [`formal/README.md`](formal/README.md)。
接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。

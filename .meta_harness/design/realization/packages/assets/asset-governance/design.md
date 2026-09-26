# asset-governance 实现设计

> 本批设计已接受（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-045](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

本页回答：两份资产契约由哪个插件、哪几个服务面兑现；每条契约责任的兑现点与缺口；「同一提交」碰到哪些存储对象、按什么次序取锁；
事件会不会越过租户边界；官方件怎么登记；装载与撤除怎样成对。契约的九件事**不复述**，只写兑现点。
**尚未建包**：下文插件名、服务名、方法名、表名、列名全部是**候选**；「实现／源码」一列一律写「尚未建包」。
下文 AG 指 [`capability.asset-governance/v1`](../../../../spec/capabilities/asset-governance/v1/contract.md)，AT 指 [`capability.asset-transfer/v1`](../../../../spec/capabilities/asset-transfer/v1/contract.md)，OG v1／v2 指组织治理两版契约；三者的 S-n 各在各的作用域。

## 实现路径与来源

**自建一个 Cordis 插件。**两份契约拥有的是资产记录、版本线、持有、配值、两类待确认件、分享、血缘对应、两类幂等键登记八组持久事实与它们的提交语义；DSH 没有对应上层包，没有可 fork 的对象。
可复用的部分全是别的节点：数据形状、校验与属性声明（[`packages/core/asset-model`](../../core/asset-model/design.md)，`data.asset-model` v1；「组织的设置」视图的表单由它推出）、求值契约 S-23 的界、挑选与分档（[`packages/core/asset-evaluation`](../../core/asset-evaluation/design.md#s-23-的界与挑选单独导出) 单独导出的三个函数，写时守卫用它们；**本插件不调 `evaluate`**）、六类正文的规则与判定（六个正文数据契约节点 [`tool-definition`](../../core/tool-definition/design.md)、[`loop-extension`](../../core/loop-extension/design.md)、[`skill-package`](../../core/skill-package/design.md)、[`slash-command`](../../core/slash-command/design.md)、[`mcp-endpoint`](../../core/mcp-endpoint/design.md)、[`connector`](../../core/connector/design.md)，D-040 §八 M41 一契约一包；各自导出本类那一份，由 `core/asset-evaluation` 组成 `defaultBodyContracts`（候选名，D-040 §八 M51：组合根只此一处）经 asset-model 的端口进来）——都是本批候选、尚未建包——
以及已存在的 [identity-values](../../core/identity-values/design.md)、[offer-expiry](../../core/offer-expiry/design.md)、[core/storage](../../core/storage/design.md) 与[组织治理](../../tenancy/organization-governance/design.md)导出的事务内读函数（本批随 OG v2 修订新增，[下文](#跨-owner-的同一提交组织治理的隶属哨兵组织行与事务内读)）。

**一个插件、一条 fiber、四个服务面。**形状照被接受的候选 B（[D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3)、[提案「资产提供者内部」](../../../../record/proposals/capability-split-assets/design.md#资产提供者内部一个插件四个服务面)），与[组织治理节点](../../tenancy/organization-governance/design.md#实现路径与来源)同一先例：四个面是**同一实例的四个入口**，不是四个变化原因。

|          | 治理一个插件、流转一个插件（落选，提案候选 C） | **一个插件、一条 fiber（选，候选 B）** |
| -------- | -------------------------------------------- | ------------------------------------- |
| 最强论证 | 变化原因不同（PF-002 对 PF-003）；「血缘对应不出流转一方」能写成包边界上的结构保护 | 五处同一提交（复制确认、分享确认、资产没了使邀约过期、被分享方移除、删除与提升结束分享）都在一个 owner 内；拆开之后流转插件只能直接写治理的三张表（[P-13](../../core/storage/design.md#协议)），封装不了任何东西 |
| 本方弱点 | — | 血缘对应的私有性从结构保护降为模块边界加读面测试（D-039 原话「从结构保护降为测试保护」；X-3 的结构检查能不能写成未定，缺口 N-9）；两份契约的代码在同一个包里，一次修改可能碰两边 |
| 置信度   | — | **高**：D-039 已接受；改票条件见[提案 N-1](../../../../record/proposals/capability-split-assets/design.md#n-1-资产治理与资产流转契约两份提供者一个插件) |

**Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）；机制语义逐条引 basis，basis 没有的标「待核对主张」或「假设」（[依赖表](#依赖作用域与绑定)末段）。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open) 要求分清公开函数面与 Cordis 服务面、前者不被后者吞没。本节点把**判定**——求值（asset-evaluation 的 S-23 三函数）、正文契约（`defaultBodyContracts`）与锁次序之外、本能力自己的纯判断——与**写面**分开：判定从包的候选子入口 `./judgments` 导出；写面、读面、事件与装卸留在服务面。**服务面的方法在自己的事务里（写事务在锁下）读齐事实之后，调的就是这些函数**，不另写一份。

|      | 公开函数面（候选子入口 `@omne-harness-lite/asset-governance/judgments`） | Cordis 服务面（包主入口） |
| ---- | --- | --- |
| 形态 | 纯函数：输入是调用方已经读好的值，输出是判定结果或契约失败值；不读存储、不取时刻、不发事件 | 插件 `assetGovernancePlugin`：inject `storage`、`clock`、`memberships`、`organizations`；provide `assets`、`asset-holdings`、`asset-transfer`、`asset-snapshot`；emit 五个通知事件；插件体登记官方件；迁移片段 `assetGovernanceMigrations`（[下节](#能力到-cordis-的投影)） |
| 依赖 | 只 import 纯模块 `core/asset-model`、`core/asset-evaluation`、`core/identity-values`、`core/offer-expiry`；**不 import** Cordis、`kernel-basis`、`core/storage`、组织治理的 `./tx-reads` | 另加 Cordis、`kernel-basis`、`core/storage`、组织治理的 `./tx-reads` |
| 承诺 | 对交进来的值给出契约规定的那一个结论，同输入同输出 | 下文「只在运行时层成立」的全部 |

函数面导出（候选名；契约的九件事不复述）：

| 函数 | 输入 → 输出 | 契约坐标 | 服务面里谁调 |
| --- | --- | --- | --- |
| `qualificationsOf(standing, role, scope)` | 调用方的成员资格效力与角色、目标范围 → 四种资格各成立与否 | AG [S-16](../../../../spec/capabilities/asset-governance/v1/contract.md#s-16-谁能做角色矩阵落成的四种资格) | 资产面、持有面全部方法（[S-19](../../../../spec/capabilities/asset-governance/v1/contract.md#s-19-判定次序) 的角色那一步）；流转确认时输入改由事务内读给 |
| `holdingBasisFor(scope, record, organizationLayerHolds)` | 这一格、记录的来源与所有者、所在组织的组织层此刻是否持有同一份 → `official`／`owned`／`organization`，或 `notOwner` | AG [S-9](../../../../spec/capabilities/asset-governance/v1/contract.md#s-9-持有本契约写得到的两层与写不到的两层)（`shared` 只经组合入口带进来，不在此判） | `hold`；提升时重算调用方那一份的依据 |
| `guardAssignment(declaration, write, here, above)` | 推出的声明、要写的值与锁、这一层该项、组织层同项的配值 → 通过，或按 ⑥ 次序的第一个失败值（`lockedHere`、`valueOutOfDomain`、`selectionNotSingleTier`、`lockedAbove` 之一） | AG [S-38](../../../../spec/capabilities/asset-governance/v1/contract.md#s-38-assign-配值)～[S-41](../../../../spec/capabilities/asset-governance/v1/contract.md#s-41-unlockassignment-解除该项的锁) ⑥；权限项上调 asset-evaluation 的 S-23 三函数 | 配值四个 |
| `referrersAcknowledged(current, acknowledged)` | 提交内现求的引用方集合与份数、调用方确认过的 → 通过，或 `hasReferrers` 连同此刻的集合 | AG [S-22](../../../../spec/capabilities/asset-governance/v1/contract.md#s-22-先告知再移除或删除) | `unhold`、`assets.delete` |
| `offerTargetExists(record, ownerLayerHolding, pointedHoldingSince)` | 资产记录、所有者那一层此刻那份持有、发起时记下的 `since` → 存在与否；派生状态再交 offer-expiry 的 `deriveState` | AT [S-7](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-7-两类待确认件共用的过期语义) | 确认、撤回、读待确认件 |
| `transferAllowed(direction, source, target, parents)` | 方向、源与落点（组织与层）、事务内读出的上级链快照 → 通过，或结构性拒绝值（如 `outsideTree`）；边界用 identity-values 的 `shareAncestor` | AT [S-12](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-12-流转边界团队资产不出那棵树)、[S-49](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-49-方向与落点矩阵逐格) | 发起与确认 |
| `sharingEffective(sharing, facts)` | 分享记录，上级链、隶属建立时刻、成员资格与成员关系生效时刻 → 生效、不生效，或任一时刻缺席时判不出 | AT [S-9](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-9-分享此刻是否生效) | 确认分享（含认回）、`listSharings`、快照面 |

**只在运行时层成立、函数层不承诺的**，全在服务面（[跨 owner 一节](#跨-owner-的同一提交组织治理的隶属哨兵组织行与事务内读)、[锁次序](#锁次序与插件内的同一提交)、[时刻](#时刻确认时刻与组织治理的两个时刻可比)）：读到的依据与写入同一提交（AG S-21，L-1～L-6）；AT S-18 同提交与三个序列化键；`sharingEffective` 的 ① 与 ② 在一次事务里取齐——**函数只对交进来的值判，不知道它们是不是同一时刻读的**；三个时刻可比且严格递增（AT S-34，C-15）；持有键唯一、版本号连续、所有者至多变一次（写函数统一守）；AG S-29 只有装配够得着；组合入口只由流转的落地调用（AG S-46）；事件在提交之后才发、不越租户（AG S-48）。

**写函数不进公开面**：

|          | 写函数（收写事务句柄）也作公开面导出（落选） | **只导出纯判定，写路径留在服务面（选）** | 不设函数面，全部经服务面（落选） |
| -------- | --- | --- | --- |
| 最强论证 | SYS-OPEN「内部构件同样可单独取用」：别人可以在自己的事务里复用同一条写路径 | 判定可单独取用、可单测，服务面与函数面是同一份实现；写路径的保证只在服务面成立，写明函数层不承诺 | 导出面最小，判定签名改了不牵动外部 |
| 弱点     | 写函数收 `lineage`、`sharing` 两个参数——公开出去，「组合入口只由资产流转的落地调用」（AG S-46、S-50）就不再由公开方法的签名兑现（verification C-4 失效）；写函数依赖 `core/storage` 的事务句柄与本插件的表，本来就不是「不依赖存储」 | 要换一种存储或一种运行时的使用方得自己重写写路径与锁次序——判定可复用，提交语义不可复用；多一个子入口要守它的 import 白名单 | 违反 SYS-OPEN：写时守卫与分享判据只有经插件才能取用 |
| 置信度   | — | **中高** | — |

**装配不变**：插件边界、四个服务面、inject 边、事件与装卸都不因本节改动；[tenancy-host](../../../apps/tenancy-host/design.md#公开面) 照旧只装包主入口。

## 能力到 Cordis 的投影

插件 `assetGovernancePlugin`（候选；插件名 `asset-governance`；经 [`core/kernel-basis` 的 `definePlugin`](../../core/kernel-basis/design.md#能力到-cordis-的投影) 定义）：
**inject** `storage`、`clock`、`memberships`、`organizations`，四个都必需；**config**（候选 `AssetGovernanceConfig`）五项——`copyNoticeTtlDefault`、`sharingInvitationTtlDefault`、`assetCreationKeyRetention`、`copyAttemptKeyRetention`、`officialManifest`；
**provide** 四个服务面（候选服务名）：

| 面（候选服务名） | 承载的操作 | 契约 |
| --- | --- | --- |
| 资产面 `assets` | AG [S-24](../../../../spec/capabilities/asset-governance/v1/contract.md#s-24-createdraft-创建草稿)～[S-28](../../../../spec/capabilities/asset-governance/v1/contract.md#s-28-delete-删除一份资产记录)、[S-64](../../../../spec/capabilities/asset-governance/v1/contract.md#s-64-readasset-读一份资产记录)、[S-65](../../../../spec/capabilities/asset-governance/v1/contract.md#s-65-readversion-读一个已发布版本) | AG |
| 持有面 `asset-holdings` | AG [S-30](../../../../spec/capabilities/asset-governance/v1/contract.md#s-30-hold-加入持有)～[S-45](../../../../spec/capabilities/asset-governance/v1/contract.md#s-45-listreferrers-列出一份记录的引用方) | AG |
| 流转面 `asset-transfer` | AT [S-20](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-20-发起复制)～[S-30](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-30-列出组织的分享)、[S-48](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-48-列出组织收到的待确认件) | AT |
| 快照面 `asset-snapshot` | 某个租户此刻的出厂、组织、租户三层持有与被选版本的正文，外加每份 `shared` 持有此刻是否生效（[下文](#快照面两份契约读面的一次读事务投影)） | **无契约条款**（N-4） |

**emit** AG 的五个通知事件，提交返回之后、包一层（[事件](#事件提交之后包一层没有进程内订阅者)）。**import**：`packages/core/asset-model`、`packages/core/asset-evaluation`（只取 S-23 的三个函数与组好的 `defaultBodyContracts`）这些本批节点——六个正文数据契约包**不直接 import**，经 `defaultBodyContracts` 间接依赖——与 `core/offer-expiry`、`core/identity-values`、`core/storage`、组织治理包的事务内读入口。
**AG S-29 不在任何面上**：官方件由插件体按 `officialManifest` 登记（[下文](#官方件登记插件体按装配给的清单登记)）。**组合入口（AG S-46）也不在任何面上**：它是插件内部的写函数，公开方法的签名里没有 `lineage`、`sharing` 两个输入（[下文](#组合入口插件内部的写函数不在任何面上)）。

**每个写操作恰一次 `storage.write`，事件在提交返回之后 `emit`**；写事务开头先按[锁次序](#锁次序与插件内的同一提交)取全部锁，再读、再判、再写。下表不再逐行重复。

### 持久记录（候选逻辑名）

| 记录（候选表名） | 关键列（候选） | 对应条款 |
| --- | --- | --- |
| 资产记录 `asset_record` | `record_id`（主键，提交内生成、不回收）、能力标识两列、`origin`、所有者（组织或租户，两列）、作者、`by_agent`、草稿（可空）、血缘四项与 `lineage_id`（可空）、**`deleted_at`（可空，删除即落这一列，行不物理删除）** | AG [S-5](../../../../spec/capabilities/asset-governance/v1/contract.md#s-5-资产记录与它的两个标识)～[S-7](../../../../spec/capabilities/asset-governance/v1/contract.md#s-7-所有者与作者)、[S-28](../../../../spec/capabilities/asset-governance/v1/contract.md#s-28-delete-删除一份资产记录) ④「已发布版本作不可解引用的归档保留」 |
| 版本 `asset_version` | 复合主键（`record_id`, `number`）、正文、`published_at`、`published_by` | AG [S-6](../../../../spec/capabilities/asset-governance/v1/contract.md#s-6-草稿与版本线)、[S-26](../../../../spec/capabilities/asset-governance/v1/contract.md#s-26-publish-发布) |
| 持有 `asset_holding` | 持有方（层身份，三列）、能力标识、`record_id`、依据（含 `sharing_id`）、版本选用、替换锁、`since` | AG [S-9](../../../../spec/capabilities/asset-governance/v1/contract.md#s-9-持有本契约写得到的两层与写不到的两层)；唯一索引「持有方 × 能力标识」 |
| 配值 `attribute_assignment` | 复合主键（持有方, 能力标识, 项）、值、项锁、`since`；禁用是 `disabled` 那一项 | AG [S-10](../../../../spec/capabilities/asset-governance/v1/contract.md#s-10-属性配值与两把锁)、[S-11](../../../../spec/capabilities/asset-governance/v1/contract.md#s-11-禁用) |
| 创建键登记 `asset_creation_key` | 复合主键（调用方, `creation_key`）、`record_id`、登记时刻 | AG S-24 ⑦ |
| 审计条目 `asset_audit_entry` | 条目号、时刻、操作者、依据、范围、对象、变更 | AG [S-3](../../../../spec/capabilities/asset-governance/v1/contract.md#s-3-本契约明确不承诺什么)「条目随写入同一次提交落下」；条目形状无契约（N-8） |
| 复制通知 `copy_notice`、分享邀请 `sharing_invitation` | 标识、发起者、源或资产、落点或被分享方、`issued_at`、`expires_at`、`by_agent`（复制通知）、**`pointed_holding_since`**、终结记录（`settled` 与写下者、时刻、结果） | AT [S-5](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-5-复制通知)、[S-6](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-6-分享邀请)、[S-7](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-7-两类待确认件共用的过期语义) ③ |
| 分享 `sharing` | `sharing_id`、分享方、被分享方、资产、发起者、确认者、**`confirmed_at`**、来自哪份邀请、记录状态与结束原因、写下者、时刻 | AT [S-8](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-8-分享)、[S-9](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-9-分享此刻是否生效) |
| 血缘对应 `lineage_correspondence` | 复合主键（源记录, 落进的层）、`lineage_id`、目标记录 | AT [S-10](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-10-复制血缘怎么判怎么记)；**只由流转模块读写**（N-9） |
| 尝试键登记 `copy_attempt_key` | 复合主键（发起者, `attempt_key`）、首次结果、登记时刻 | AT [S-20](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-20-发起复制) ⑦ |

**不建指向组织治理任何表的外键**，也不在本组表之间建外键：理由与 [tenancy-host「为什么只建一条外键」](../../../apps/tenancy-host/design.md#为什么只建一条外键)相同——每条 `RESTRICT` 都是一条契约失败集合里没有的拒绝路径（OG S-53 首当其冲，AG G-22）；删除落成 `deleted_at` 一列，持有指向的记录行一直在。
迁移片段由本包导出（候选 `assetGovernanceMigrations`），[tenancy-host](../../../apps/tenancy-host/design.md#合成规则) 追加在合成序列末尾；唯一约束一律 `CREATE UNIQUE INDEX <显式名>`、主键名 `<table>_pkey`（tenancy-host M-2、M-3）。「每个能力标识至多一份 official 记录」是 `asset_record` 上一条 `origin = 'official'` 的部分唯一索引（两方言都支持）。

### 操作

契约的九件事不复述；「实现／源码」一列全部是**尚未建包**，不再逐行写。

| 契约责任 | 插件、服务／贡献或公开操作（候选） | 兑现点 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| AG [S-14](../../../../spec/capabilities/asset-governance/v1/contract.md#s-14-可见与不泄漏存在性)～[S-20](../../../../spec/capabilities/asset-governance/v1/contract.md#s-20-每道准入现读) 贯穿规矩 | 资产面、持有面全部方法 | 判定次序按 [S-19](../../../../spec/capabilities/asset-governance/v1/contract.md#s-19-判定次序) 写成一条固定流水：表示层 → 调用方此刻有效（OG v1 `memberships.standing`，事务之外现读）→ 记录可见 → `officialImmutable` → `notOwner` → 角色 → 依赖记录的 `invalidInput` → 状态前置；四种资格（[S-16](../../../../spec/capabilities/asset-governance/v1/contract.md#s-16-谁能做角色矩阵落成的四种资格)）是一个纯函数，输入是 `MembershipStandingResult` 与角色 | 成员资格在事务之外现读，窗口按 AG [S-50](../../../../spec/capabilities/asset-governance/v1/contract.md#s-50-装配给的保证-vs-协议须给的保证)「成员资格与角色的新鲜度」一行（写后即可被下一次读看到）读成可接受，与[提案](../../../../record/proposals/capability-split-assets/design.md#同一提交与共同存储对象)末行、OG 节点对自己 S-36 的读法相同。S-62「两组逐字相同」由同一个 `assetNotFound` 常量与「失效身份先于记录可见」的次序兑现 |
| AG [S-21](../../../../spec/capabilities/asset-governance/v1/contract.md#s-21-读到的依据与写入落在同一次可串行化的提交里) 七行依据 | 每个写方法 | 逐行的共同存储对象见[锁次序与插件内的同一提交](#锁次序与插件内的同一提交) | 谓词读那一行（引用方集合）由 L-3 组织级持有哨兵兑现，**不是**「只锁已存在的行」 |
| AG [S-22](../../../../spec/capabilities/asset-governance/v1/contract.md#s-22-先告知再移除或删除) 先告知 | `asset-holdings.listReferrers` ＋ `unhold`／`assets.delete` 的 `acknowledged` | 提交内现求引用方（持 L-3、L-4），`此刻 ⊆ acknowledged` 才写；份数一项按「不大于确认过的份数」比 | 组合引用经判定对象按类别调「列引用」（六个正文包各给本类那一份）；plugin 的引用就是它的成员（`data.asset-model` S-11）；组合引用缺席的那一类（本版 `agent_definition`）⇒ `unavailable`，不当成「没有」（AG G-5） |
| AG [S-24](../../../../spec/capabilities/asset-governance/v1/contract.md#s-24-createdraft-创建草稿)～[S-26](../../../../spec/capabilities/asset-governance/v1/contract.md#s-26-publish-发布) 创作与发布 | `assets.createDraft`／`updateDraft`／`publish` | 带键创建取 L-5 键哨兵（调用方, 键）再查登记；`basedOn`／`expected` 与版本线末尾在 L-4 记录行锁下比对；`publish` 追加版本、不碰持有 | 正文校验、斜杠命令保留区与名字收窄经 `packages/core/asset-model` 节点的判定对象（它收一个 `BodyContracts` 端口；本插件交进去的是 `core/asset-evaluation` 导出的 `defaultBodyContracts`，见装卸表）；**不判组合图成环**（AG S-26、G-6：环只在求值那一侧以 `compositionCycle` 发现）；「内容相等」按 JSON 值相等（S-26 ⑦），实现归 `packages/core/asset-model` 节点 |
| AG [S-27](../../../../spec/capabilities/asset-governance/v1/contract.md#s-27-promotetoorganization-提升到组织) 提升 | `assets.promoteToOrganization` | 同一提交：改所有者、重算调用方那一份持有的依据、**把以它为资产的 `active` 分享写 `revoked`／`ownerChanged`**（AT S-52，同一插件的流转模块）；分享那一步写不下去 ⇒ 整次 `unavailable` | 写所有者的路径只此一条（AG S-60 的静态核对）；S-52 的故障注入见 verification F-2 |
| AG [S-28](../../../../spec/capabilities/asset-governance/v1/contract.md#s-28-delete-删除一份资产记录) 删除 | `assets.delete` | 同一提交：落 `deleted_at`、清草稿与血缘、**分享写 `revoked`／`sourceDeleted`**；持有、引用方一概不动；引用方现求持 L-3（所有者所在组织）与 L-4 | 已发布版本行保留，任何读面不再返回正文（S-64、S-65 读到「已删除」）。指向它的待确认件由 AT S-7 存在性派生为过期，不写 |
| AG [S-29](../../../../spec/capabilities/asset-governance/v1/contract.md#s-29-registerofficial-登记官方件) 官方件登记 | **无服务面**；插件体按 `officialManifest` 逐条登记 | 见[官方件登记](#官方件登记插件体按装配给的清单登记) | 「只有装配够得着」是结构性的：没有任何方法能被调到 |
| AG [S-30](../../../../spec/capabilities/asset-governance/v1/contract.md#s-30-hold-加入持有)～[S-37](../../../../spec/capabilities/asset-governance/v1/contract.md#s-37-unpinversion-回到追随当前版本) 持有八个 | `asset-holdings.hold`／`unhold`／`disable`／`enable`／`lockReplacement`／`unlockReplacement`／`pinVersion`／`unpinVersion` | 依据由 S-9 那张表自上而下自动定，调用方不给；`lockedAbove` 读组织层同能力标识那一行，与组织层的锁写入在 L-3 上排次序；`since` 取提交内的 `clock.now()` | `alreadyHeld` 由唯一索引兜底（并发插入撞索引 ⇒ 提交内重读后按 ⑦ 收场）；S-9 `organization` 依据的第二种来路读组织层持有同一份记录那一行 |
| AG [S-38](../../../../spec/capabilities/asset-governance/v1/contract.md#s-38-assign-配值)～[S-41](../../../../spec/capabilities/asset-governance/v1/contract.md#s-41-unlockassignment-解除该项的锁) 配值四个 | `asset-holdings.assign`／`clearAssignment`／`lockAssignment`／`unlockAssignment` | 写时守卫按 ⑥ 的次序：`lockedHere` 读这一层该项；`valueOutOfDomain` 由推出的声明判；**权限项**上 `classifyPermissionAssignment(declaration, { value, immutable })`（asset-evaluation 节点单独导出，候选名）判这一条是界还是挑选、给出档序——挑选落在分档项上而不恰一档 ⇒ `selectionNotSingleTier`；租户层写权限项（挑选或界，带不带锁）时读组织层同（能力标识, 项名）的配值（L-3 下），其中是界的交给 `boundOf(declaration, bounds)` 求 X，要写的值不落在 X 内（`pickWithinBound(value, X)` 为假）⇒ `lockedAbove`（AG S-18 `lockedAbove` 一行）；**设置项**上组织层该项带锁 ⇒ `lockedAbove`。三个函数与求值第 4 步是同一份实现；「界写在界外」也用 `pickWithinBound` 判，是本节点对 S-23 第 2 条「落在界内」的读法，签名与这一用法由两边共同对齐（asset-evaluation 节点 AE-6） | 过期编辑守卫缺名字（AG G-21）：本版照契约不收 `expectedVersion`，同一项并发配值后提交的照写 |
| AG [S-42](../../../../spec/capabilities/asset-governance/v1/contract.md#s-42-listholdings-列出某范围的持有)～[S-45](../../../../spec/capabilities/asset-governance/v1/contract.md#s-45-listreferrers-列出一份记录的引用方)、[S-64](../../../../spec/capabilities/asset-governance/v1/contract.md#s-64-readasset-读一份资产记录)、[S-65](../../../../spec/capabilities/asset-governance/v1/contract.md#s-65-readversion-读一个已发布版本) 读面六个 | `asset-holdings.listHoldings`／`readHolding`／`organizationSettingsView`／`listReferrers`，`assets.readAsset`／`readVersion` | 每个读面一次读事务（快照一致，R-6）；读不到 ⇒ `unavailable`，不返回空列表或残缺列表；设置视图的表单由 `packages/core/asset-model` 节点的 `attributeDeclarationsOf`（候选）经正文判定端口推出，推不出的那一份显式标「推不出」——**不经 `evaluate`**：S-44 ⑤ 的表单是「那一版推出的属性声明」，不是求值结果；`agent_definition` 与 `plugin` 这两类在视图里是「推不出」，与 `evaluate` 走到它们时的 `categoryUnsupported` 是同一个缺口（AG G-5、求值 G-21）的两种呈现 | 读面不引用血缘对应表（N-9）；`readAsset` 的血缘只给 `CopyLineage` 四项与 `lineage_id`，不给源记录号 |
| AG [S-46](../../../../spec/capabilities/asset-governance/v1/contract.md#s-46-组合入口资产流转的确认步骤) 组合入口 | 插件内部写函数，由流转模块在落地那一次提交里调 | 见[组合入口](#组合入口插件内部的写函数不在任何面上) | 「直接入口够不着 `lineage`、`sharing`」由公开方法签名兑现（类型测试 C-4） |
| AG [S-47](../../../../spec/capabilities/asset-governance/v1/contract.md#s-47-解除成员不动任何持有) | 无写路径 | 本插件不订阅任何成员关系事件、没有以成员关系变化为触发的写 | 静态可查：插件里没有监听者（装卸表） |
| AG [S-48](../../../../spec/capabilities/asset-governance/v1/contract.md#s-48-事件都是通知)／[S-49](../../../../spec/capabilities/asset-governance/v1/contract.md#s-49-本版不开控制类事件) 与 AT [S-33](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-33-本版不发本契约自己的事件) | `ctx.emit` 五个事件（候选事件名 `asset.published`、`asset.promoted`、`asset.deleted`、`asset.holding-changed`、`asset.assignment-changed`）；流转模块不发自己的事件 | 见[事件](#事件提交之后包一层没有进程内订阅者)；审计条目在同一提交里写 `asset_audit_entry`，不靠任何监听者 | 不开控制事件、不开扩展点；将来开须 `serial`（红线） |
| AT [S-7](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-7-两类待确认件共用的过期语义) 过期与存在性 | 存在性判定：判定是函数面的 `offerTargetExists`（[公开面](#公开面)），读在流转模块的事务里、不在任何服务面上 | 派生状态由 `core/offer-expiry` 的 `deriveState` 求；存在性 = 记录行无 `deleted_at` ∧ 所有者那一层此刻持有它 ∧ **那份持有的 `since` 等于发起时记下的 `pointed_holding_since`**；确认时持 L-3、L-4 在提交内读（PA-1） | 第三个合取项靠「同一键上先后两份持有的 `since` 严格递增」——这正是 AT [G-3](../../../../spec/capabilities/asset-transfer/v1/contract.md#十一已知缺口) 的闭合条件之一，本节点在实现层兑现、契约的形状缺口仍开着；它依赖 N-1 的严格时刻 |
| AT [S-9](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-9-分享此刻是否生效) 判据 | 一个纯函数（候选 `sharingEffective`），输入是分享记录与**同一事务里**经组织治理事务内读函数取得的上级链、隶属建立时刻、成员资格与成员关系生效时刻 | 流转面的 S-30、快照面、S-26 确认时判「同对已有生效的一份」都调它；**① 与 ② 在一次读（或写）事务里取齐**——契约写明这即满足先后 | **不经 OG v2 的 S-22、S-59 两个读面，也就没有「运行时代行」这一调用主体**（AT S-34 代行行在单机下以「不经读面」兑现，[下文](#跨-owner-的同一提交组织治理的隶属哨兵组织行与事务内读)）；任一时刻读不到（含 v1 存量记录没有时刻）⇒ 不可用 |
| AT [S-12](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-12-流转边界团队资产不出那棵树) 边界、[S-49](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-49-方向与落点矩阵逐格) 矩阵 | 流转面发起与确认 | 纯值判定（落点在自己组织、别人的租户级）先于任何读；边界用 `core/identity-values` 的 `shareAncestor` 纯函数，输入是 L-1 下事务内读出的两条上级链 | 矩阵逐格是发起时一次性的纯判定 |
| AT [S-15](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-15-结构性禁止不是权限判定)～[S-17](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-17-每道准入现读确认时再判一遍) | 流转面全部写方法 | 确认时的再判全部在确认那一次写事务里，成员资格、角色与上级链经事务内读函数在 L-1、L-2 下读 | 与 AG 直接入口不同：流转的再判**不走** OG 服务面，理由见跨 owner 一节 |
| AT [S-18](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-18-确认是一次提交同一落点的确认序列化) 同提交与三个序列化键 | `asset-transfer.confirmCopy`／`confirmSharing`／`issueCopyNotice`／`issueSharing` | 一次写事务覆盖的全部存储对象：待确认件行（终结记录）、`asset_record`／`asset_version`／`asset_holding`（经组合入口）、`lineage_correspondence`、`sharing`、`copy_attempt_key`、`asset_audit_entry`；三个序列化键各一把 L-5 哨兵，唯一约束兜底 | 「少一个存储对象就留中间态」：以上清单即 AT S-18 要提供者指出的「全部存储对象」 |
| AT [S-20](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-20-发起复制)～[S-23](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-23-读复制通知) 复制四个 | `asset-transfer.issueCopyNotice`／`withdrawCopyNotice`／`confirmCopy`／`readCopyNotice` | 本人型在发起那一次提交落地；组织型写通知、`OfferTiming` 在提交内定死；尝试键与这一次写入同提交；目标侧投影不带源记录号与源资产本身 | `byAgent` 取这一次调用的上下文、**缺席 ⇒ `unavailable`**（组织型在发起时收）；这个上下文本版没有来路（N-6） |
| AT [S-24](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-24-发起分享)～[S-30](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-30-列出组织的分享)、[S-48](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-48-列出组织收到的待确认件) 分享与列表 | `asset-transfer.issueSharing`／`withdrawSharingInvitation`／`confirmSharing`／`readSharingInvitation`／`revokeSharing`／`removeReceivedSharing`／`listSharings`／`listPendingForOrganization` | 确认：同对哨兵下查同对 `active` 记录，调 `sharingEffective`——生效即认回、不生效即新建；被分享方那一层能取持有就经组合入口取；移除：分享写 `removed` 与被分享方持有及配值删除同提交 | `listSharings` 的 `SharingState` 与快照面同一个纯函数、同一种事务内读 |
| AT [S-31](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-31-隶属解除分享在使用时失效不靠事件)、[S-32](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-32-成员关系解除复制执行不了已确认的不动) | 无写路径、无监听者 | 失效只在使用时由 `sharingEffective` 判 | 本插件不订阅 `affiliation.dissolved` 与 `membership.changed`（装卸表：一个监听者都没有） |
| AT [S-52](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-52-分享方删除资产或所有权易手分享随之结束) | 流转模块的结束分享写函数，被 AG S-27、S-28 在同一提交里调 | 已结束（`revoked`、`removed`）的不改写 | 模型只核了删除那一支（bindings）；提升那一支的证据是场景 AT S-53 |
| AT [S-35](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-35-依赖的提供者不可用)～[S-37](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-37-本能力自己被撤除替换或重启)、AG [S-51](../../../../spec/capabilities/asset-governance/v1/contract.md#s-51-依赖的提供者不可用)／[S-52](../../../../spec/capabilities/asset-governance/v1/contract.md#s-52-撤销不发出停止信号) | 全部方法 | 失败映射见[状态、并发与失败映射](#状态并发与失败映射)；无定时器、无跨提交在途状态、不发任何停止信号 | 「重启不改变任何判定」成立的前提：全部事实在存储里（装卸表「保留」一列） |
| 政策参数 | config 五项 | 两个时长默认值与两个保留期经 `core/offer-expiry` 的 `parseOfferTtl` 校验为正；`officialManifest` 外层形状在 Config 里校验，条目在插件体里经判定对象过表示层校验（[装卸表](#成对的装载与撤除)第二行） | **任一不合法 ⇒ 启动失败**，与租户批同一政策（[装卸表](#成对的装载与撤除)）；值由 tenancy-host 下发 |

### 跨 owner 的「同一提交」：组织治理的隶属哨兵、组织行与事务内读

流转的确认（与本人型发起）要在**同一次提交**里再判一遍成员资格、角色与流转边界（AT [S-17](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-17-每道准入现读确认时再判一遍)），同对确认还要判一份已有分享此刻是否生效（S-9 的第三个合取项要读两个时刻）。
这些事实归组织治理；[P-13](../../core/storage/design.md#协议) 不许在本插件的事务里调 OG 的服务面。**两个写入者共同触碰的存储对象**因此只能是 OG 自己用来序列化那些写入的锁对象，加上在同一事务里读 OG 的行：

| # | 冲突的一对 | 共同触碰的存储对象 | 本插件在事务里做什么 |
| --- | --- | --- | --- |
| X-1 | 确认（复制、分享）或本人型发起 **vs** OG [S-32](../../../../spec/capabilities/organization-governance/v2/contract.md#s-32-接受隶属请求)／[S-33](../../../../spec/capabilities/organization-governance/v2/contract.md#s-33-解除隶属) 隶属写 | OG 的隶属哨兵 `organization-governance/affiliation`（OG 节点 R-3b） | 事务开头 `lockSentinel` 取它（L-1），再逐行读两条上级链（`parent` 与 `parent_established_at`），`shareAncestor` 用纯函数判——**主线裁定 [D-040 §一 PA-4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-a-拆分提案报回的推荐-bcore-纯模块--治理与流转一个插件)** 点名的两项 |
| X-2 | 同对确认判「已有那份此刻是否生效」 **vs** 同一条隶属解除又重建 | 同上哨兵，加 `organization.parent_established_at` 一列 | 在 L-1 下读连接两端的每个组织的隶属建立时刻——PA-4 由 D-040 §八 N-19 扩到此处 |
| X-3 | 确认或发起的成员资格再判、同对判定里的成员关系生效时刻 **vs** OG [S-25](../../../../spec/capabilities/organization-governance/v2/contract.md#s-25-接受邀请)／[S-28](../../../../spec/capabilities/organization-governance/v2/contract.md#s-28-调整角色)／[S-29](../../../../spec/capabilities/organization-governance/v2/contract.md#s-29-解除成员)／[S-53](../../../../spec/capabilities/organization-governance/v2/contract.md#s-53-清除未激活账号的个人组织) 成员写 | 相关组织的**组织行**（OG 节点 R-3a：OG 的成员写在事务开头锁组织行） | 按组织标识排序 `lockRow('organization', …)` 取它们（L-2），再读成员关系行的有效性、角色与生效时刻——PA-4 由 D-040 §八 N-19 扩到此处 |

**本插件不直接写 OG 的列名**：三项都经 OG 包导出的**事务内读函数**（候选子路径入口 `./tx-reads`：取隶属哨兵、按序锁组织行、读一个组织的变体与上级及隶属建立时刻、读一条成员关系的有效性与角色及生效时刻），它们接收调用方的事务句柄、只读、不自己开事务；OG 自己的 S-22、S-26、S-34、S-59 实现也调同一组函数（[OG 节点 v2 修订](../../tenancy/organization-governance/design.md#v2-修订候选尚未实现)登记这组入口与三项外部依赖）。

|          | 本插件直接读 OG 的列（落选，PA-4 字面） | **OG 导出事务内读函数（选）** | 事务之外调 OG 服务面、窗口按「影响下一道准入」读成可接受（落选，提案「其余操作」一行） |
| -------- | ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| 最强论证 | 最少的新公开入口；PA-4 原话就是「直接读 `organization.parent`」 | 表形状仍只在 OG 包里：OG 改列，改的是它自己的函数，编译期就能暴露；OG 自己的读面与本插件读到的是同一段代码的结果 | 最少的耦合：不碰 OG 的锁与表；[iv S-27](../../../../spec/data/identity-values/v1/contract.md#s-27-每道准入现读) 本来就说撤销只影响下一道尚未通过的准入 |
| 本方弱点 | OG 的列成了本包源码里的字面量，OG 改列时本包静默读错 | OG 的公开入口多一组**绕过服务面**的存储级函数，谁 import 都能读，须结构检查限定只有本包可以 import（N-3）；它们没有双版本（直接读 v2 的列） | 同对确认要判「已有那份是否生效」：两读之间「解除—重建」会让本插件认回一份其实已断过的分享（S-26 ⑦ 要求新建）；pg 上确认与重新加入不在同一把锁下，确认时刻与生效时刻可能乱序——**复活**。这不是撤销时序的问题 |
| 置信度   | — | **中高**：X-2、X-3 两项要主线确认 | — |

**X-2、X-3 为什么必要（PA-4 原话只及 X-1），各构造一条交错反证**：

- **(i) 去掉 X-2 的时刻读**（改为事务之外读 OG S-22）：同对邀请 s2 待确认、已有 s1 由 t1 在 T0 确认；读出 t1 的隶属建立时刻 T_a < T0 之后、确认事务开始之前，OG 解除又重建 t1 的隶属（新时刻 T_b > T0）；确认事务里判 s1「未断过」、认回 s1——而 s1 按 S-9 已经 `dissolved`，被分享方拿到一份用不上的分享、没有新建。**反证成立**，X-2 必要。
- **(ii) 去掉 X-3 的组织行锁**（成员关系在确认事务里读、但不锁组织行）：pg 上 READ COMMITTED，确认事务 A 在 T_c 取时刻、读到被分享租户有效；并发的 OG 解除（S-29）先于 A 的读提交、再加入（S-25）在 A 取时刻**之前**取了自己的时刻 T_r < T_c、在 A 提交之后才提交——A 判那段成员关系「生效时刻 ≤ 确认时刻」成立，而实际上确认之前它断过又接上。锁住组织行之后，S-25 与 A 在组织行上排出次序、时刻随之同序。**反证成立**，X-3 必要。sqlite 上写事务 `BEGIN IMMEDIATE` 库级串行，两条交错都构造不出来——**pg 一侧只能靠真并发演练**（verification D-4、D-8）。

**这三项都是装配给**（同一存储、同一约束域，[tenancy-host「三件事」](../../../apps/tenancy-host/design.md#同一存储同一约束域本节点要保证的三件事)）：跨进程之后由协议重新兑现（AT S-34 右列、AT G-8）。

**AT S-34 代行那一行**：契约写的单机读法是运行时代行、经 OG v2 的 S-22、S-59 读两个时刻，并写明「同一存储内一次可串行化读（含事务内直读）即满足，不要求经服务面代行」（OG v2 S-42 同名行同一半句，D-040 §八 M59）。本节点在中心进程里走的就是事务内直读——**读到的是同一份事实**（OG v2 S-7、S-8），代行主体因此不出现。**据点那一侧**（跨进程、读不了中心的存储）仍须按契约走读面与代行，那一半归据点装配与入口契约 v2（N-5）。

### 锁次序与插件内的同一提交

**一个写事务开头一次取齐全部锁，按下表的全序取**；先读不可变的键（待确认件行上的源、落点、资产；记录的所有者所在组织——提升只在同一组织内换所有者，所在组织不变），据此算出锁集，锁下重读、再判、再写。
L-6 的 `sharing` 行不是不可变的键，但**在前面的锁下它们的集合不会再变**：新的分享行只由确认（与本人型发起）在 L-4 与 L-5 同对哨兵下插入，所以「以某资产为资产的分享」在 L-4 下读、「某一对的分享」在 L-5 下读，读出的标识排序后再逐行 `lockRow`、锁下重读状态。锁前读到的键在锁下重读时变了（例如重复复制的血缘对应已随目标记录删除而清掉）⇒ 放掉这次事务、按新的键重来，不在已取的锁上补取更前的锁。

| 次序 | 锁（候选名） | 协议原语 | 序列化的是什么 |
| --- | --- | --- | --- |
| L-1 | OG 隶属哨兵 `organization-governance/affiliation` | `lockSentinel` | X-1、X-2 |
| L-2 | 相关组织的 OG 组织行（按标识排序） | `lockRow('organization', …)` | X-3 |
| L-3 | 组织级持有哨兵 `asset-governance/holdings/<组织标识>`（按标识排序） | `lockSentinel` | 同一组织内（组织层与它全部成员的租户层）的**全部持有写入**与**引用方谓词读**：AG S-21 的唯一性、`lockedAbove`、`lockedHere`、依据的第二种来路、引用方集合五行 |
| L-4 | 资产记录行（按标识排序） | `lockRow('asset_record', …)` | AG S-21 的「记录的所有者、存在、版本线」「版本号连续、`basedOn`」两行；AT S-7 存在性（PA-1 的记录行） |
| L-5 | 键哨兵：血缘（源记录, 落进的层）、同对（资产, 被分享方）、尝试键（发起者, 键）、创建键（调用方, 键） | `lockSentinel` | AT S-18 三个序列化键；AG S-24 ⑦ |
| L-6 | 待确认件行（`copy_notice`／`sharing_invitation`，按标识）在前，`sharing` 行（按标识排序）在后 | `lockRow` | 终结记录与结束记录「一经写下不改写」（AT S-21／S-25 ⑦、S-28 ⑦、S-29 ⑦、S-52）：撤回、确认、撤销、移除、删除与提升对**同一行**的先读后写 |

**每个写操作的锁集**（按上表全序取；成员资格与角色除确认与本人型发起之外都在事务之外经 OG 服务面现读，同 AG 直接入口，AT S-34「成员资格与角色的可见性」一行）：

| 写操作 | 锁集 | 与谁在哪个对象上排次序 |
| --- | --- | --- |
| 组织型发起复制、分享（AT S-20、S-24） | L-1（边界读上级链）；L-3（资产所有者所在组织：「所有者那一层此刻持有它」与记下的 `pointed_holding_since`）；L-4（资产）；复制带键时 L-5 尝试键 | 新建待确认件行，不锁已有行；与删除、所有者那一层移除：L-4、L-3 |
| 确认复制（AT S-22） | L-1；L-2（源组织、目标组织）；L-3（源资产所有者所在组织、目标组织）；L-4（源记录；重复复制时还有血缘对应指向的目标记录）；L-5 血缘（源, 目标层）；L-6 这份通知行 | 与撤回：通知行（另有 L-3、L-4）；与同落点的另一次落地：L-5；与删除：L-4 |
| 确认分享（AT S-26，含认回支） | L-1；L-2（被分享方所在组织、资产所有者所在组织、发起者所在组织）；L-3（资产所有者所在组织与**被分享方所在组织，恒含**——「被分享方那一层此刻有没有这个能力标识的持有」在新建与认回两支都要读）；L-4（资产）；L-5 同对（资产, 被分享方）；L-6 这份邀请行 ＋ L-5 下读出的这一对全部 `active` 分享行 | 与撤回：邀请行；与撤销：L-4 ＋ 分享行；与被分享方移除：L-3（被分享方所在组织）＋ 分享行；与同对另一次确认：L-5 |
| 本人型发起复制、分享（AT S-20、S-24 的本人型） | 同对应的确认，没有待确认件行；复制带键时加 L-5 尝试键 | 同对应的确认 |
| 撤回（AT S-21、S-25） | L-3（资产所有者所在组织）、L-4（资产）——过期判定里的存在性与确认在同一组锁下读；L-6 这份待确认件行 | 与确认：**待确认件行**（终结记录那一列就在它上面） |
| 撤销（AT S-28） | L-4（资产：「此刻归分享方组织」的所有者读，与提升排序）；L-6 这条分享行 | 与确认认回、删除、提升：L-4 ＋ 分享行；与移除：分享行 |
| 被分享方移除（AT S-29） | L-3（被分享方所在组织：移除那份 `shared` 持有与配值）；L-6 这条分享行 | 与删除、提升、撤销：**分享行**；与确认认回：L-3 ＋ 分享行 |
| 删除、提升（AG S-27、S-28，含 AT S-52 结束分享） | L-3（所有者所在组织：引用方谓词）；L-4（资产）；L-6 在 L-4 下读出的以它为资产的全部 `active` 分享行 | 与撤销、移除：**分享行**；与确认：L-4 |

OG 自己的写事务只取 L-1（S-32、S-33）或组织行（R-3a），然后取它自己的请求或邀请行，**从不在持有组织行之后再取 L-1**——所以上表的全序与 OG 相容，pg 上不成环（verification D-9 演练）；L-6 的行只属本插件，OG 不碰。sqlite 上 `lockRow`、`lockSentinel` 都是空操作，写事务库级串行（[core/storage 协议](../../core/storage/design.md#协议)）。

**插件内每一处「同一提交」的存储对象**（它们都在本插件的表里，同一个事务）：

| 要一起成立的 | 事务覆盖的存储对象 | 与之冲突的写入者靠什么排次序 |
| --- | --- | --- |
| 复制确认 ⇒ 落地（AT S-22、S-11） | 通知行（终结记录）、新记录或新版本、目标层持有（首次且那一格没有该能力标识时）、血缘对应、审计条目 | 同 (源, 层) 的另一次落地：L-5 血缘哨兵 ＋ 对应表主键；源被删除或所有者那一层移除：L-4 ＋ L-3（PA-1） |
| 分享确认 ⇒ 使用权建立（AT S-26） | 邀请行、`sharing` 新建或认回、被分享方那一层的 `shared` 持有、审计条目 | 同对另一次成立：L-5 同对哨兵（「至多一份生效」是派生谓词，**不能写成唯一索引**，哨兵是它唯一的共同对象）；资产被删除或提升：L-4 |
| 本人型复制与分享（AT S-20、S-24） | 同上两行，外加尝试键登记 | L-5 尝试键哨兵 ＋ 登记表主键 |
| 删除、提升 ⇒ 分享结束（AG S-27、S-28，AT S-52） | 记录行（`deleted_at` 或所有者）、调用方那一份持有的依据（提升）、以它为资产的 `active` 分享 | 同对确认：L-4；引用方谓词：L-3；撤销与移除：L-6 分享行（锁下重读，已结束的不改写） |
| 被分享方移除（AT S-29） | `sharing` 写 `removed`、被分享方那一层的持有与全部配值 | L-3（被分享方所在组织）；L-6 分享行 |
| 撤回、撤销（AT S-21、S-25、S-28） | 待确认件行的终结记录；`sharing` 行的结束记录 | L-6（那一行）；锁下重读派生状态或记录状态，已终结、已结束的不写 |
| 资产没了 ⇒ 指向它的邀约过期（AT S-7 ③） | 无写入：确认事务在 L-4、L-3 下读记录与所有者那一层的持有 | 删除（L-4）、移除（L-3） |

**自构的反证**：(a) 同对的两次确认都不取 L-5 同对哨兵（pg）——两边都读到「这一对还没有生效的分享」、各建一份，违反 AT S-8「至多一份生效」；形式模型的去保护配置 `Transfer_NoSameCommit_Sharing.cfg` 给出的正是这条（契约 formal 入口）。
(b) 引用方谓词只锁已存在的持有行（pg）——删除读到的引用方集合之后，另一方在同一组织层插入一份也引用它的持有，删除照样提交；AG S-58 并发一支要观察到的正是它被挡住。
(c) 撤回不取 L-6（pg）——确认读到通知 `pending`，撤回提交 `withdrawn`，确认按标识写 `accepted` 并落地：撤回之后照样落地，AT「终结记录一经写下不改写」破；同形的还有撤销与确认认回（被分享方拿到一份已撤销的分享）、移除与删除（`removed` 被覆写成 `revoked`）。三条都反证成立；**pg 上的兑现只能靠真并发演练**（verification D-2、D-5、D-10～D-12）。

### 时刻：确认时刻与组织治理的两个时刻可比

AT [S-34](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-34-装配给的保证-vs-协议须给的保证)「三个时刻可比」一行与 OG v2 [S-42](../../../../spec/capabilities/organization-governance/v2/contract.md#s-42-装配给的保证-vs-协议须给的保证) 末行要求：分享确认时刻、隶属建立时刻、成员关系生效时刻取自同一个时间源，且**先后两次串行提交写下的时刻不相等**。

- **同一个时间源**：本插件与 OG 都 inject 同一个 `clock` 实例（tenancy-host 只装一份），在**写事务里、取完锁之后**调 `now()` 作为这次提交的时刻——冲突的两个事务在锁上排了先后，后者的 `now()` 调用必在前者提交之后。
- **严格不相等**：[`infra/clock`](../../infra/clock/design.md#能力到-cordis-的投影) 的 `now()` 是整数毫秒、只保证不后退；同一毫秒里先确认、再解除重加入，两个时刻相等，「≤」判定把断过的关系读成没断过——**分享复活**。手段由主线定为时钟（[D-040 §八 M58](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：同一进程内后一次 `now()` ≥ 上一次＋1 ms，其余情形仍等于墙钟读数，登为 [`infra/clock` 的缺口 C-15](../../infra/clock/design.md#实施缺口与消费者影响)（下一程实施，N-1）。**C-15 闭合之前**，AT S-34 这一行与 OG v2 S-42 末行在本节点兑现不了，依赖它的 AT S-9、S-31、S-32 在 README 标「有前提：C-15」。
- **持有的 `since` 也吃这一条**：AT S-7 存在性第三个合取项用 `since` 区分「发起时那一份」与「移除后再持有的那一份」，同样要求严格递增。

|          | 持久化一行「时刻高水位」，两个 owner 的写事务都锁它、取 `max(now, 高水位 + 1)`（落选） | **`clock` 同一进程内逐次严格递增（选；主线 M58，`infra/clock` C-15）** | 用存储的提交序号代替时刻（落选） |
| -------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| 最强论证 | 不依赖进程内状态，跨进程也成立 | 一处改动覆盖全部消费者；冲突的事务已在锁上排序，进程内严格递增就足够；不新增共同存储对象 | 语义最干净：先后就是提交序 |
| 本方弱点 | 又一个跨 owner 的共同存储对象（谁拥有那一行？）；全部盖时刻的写事务在一行上串行 | 一毫秒内调用超过一次时返回值略超前墙钟；两个进程各起一个 `clock` 时不成立（本版单机，跨进程归 AT G-8、OG G-7）；改的是另一个节点 | `core/storage` 协议没有提交序号；契约要的是「时刻」，要换成序号须两份契约写明 |
| 置信度   | — | **中高**：手段已由 M58 选定；实施在 `infra/clock`（C-15，下一程） | — |

### 事件：提交之后、包一层、没有进程内订阅者

- **派发**：`ctx.emit(事件名, 载荷)`，同步、丢弃返回值（basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md) 的 emit 行）；不用 `serial`／`bail`／`waterfall`，不设 `thisArg` 过滤、不用 `global`——它们只是通知，没有谁凭返回值放行。
- **包一层**：监听者同步抛出会穿回发出方、截断本轮派发（basis [`emit-listener-throw-propagates`](../../../../basis/cordis/emit-listener-throw-propagates.md)）；本插件的 `notify` 捕获后记 error 级日志（basis [`logger-level-order-error-lowest`](../../../../basis/cordis/logger-level-order-error-lowest.md)：error 是最低的数值级、总被导出），已提交的事实不变、调用照常返回。
- **只在提交返回之后发**：AG S-50「事件在提交之后才派发」由「先 `await storage.write`、再 `emit`」兑现；提交失败不发。审计条目不靠事件：它在写事务里写进 `asset_audit_entry`（AG S-3）。
- **有没有一条事件越过租户边界**：**有**。Cordis 的 `emit` 把事件交给同一进程里这个事件名的**全部**监听者，没有按租户的过滤；`asset.holding-changed` 与 `asset.assignment-changed` 带 `holder`（某个租户的层身份）与能力标识。AG S-48 末条要求「租户层的事件只能给那个租户的订阅者，订阅走与读同一套资格判定」——**这一条 `emit` 兑现不了**。本版的处置：**本插件的事件没有任何进程内订阅者**（中心进程里没有注册表，据点在另一个进程；Cordis 事件不跨进程是**假设 H-2，须按 source-check 取证**），所以此刻没有一条事件被交给不该收到的一方。**「没有订阅者」写成两条会失败的检查**（[D-040 §八 M60](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)，义务落 [tenancy-host verification](../../../apps/tenancy-host/verification.md)）：`tools/ts-checks` 规则——`packages/`（除本包）与 `apps/tenancy-host` 内不得订阅 `asset.*`；tenancy-host 启动期断言中心进程内这些事件的监听者集合为空。所以 S-48 末条在本版是**结构给**的，不是 `emit` 给的；**将来加任何订阅者**（例如给据点推「该刷了」的提示），按订阅资格过滤必须落在那条推送边上，不能靠 `emit`（N-7）。事件不携带会话标识，不涉会话边界。

### 官方件登记：插件体按装配给的清单登记

AG [S-29](../../../../spec/capabilities/asset-governance/v1/contract.md#s-29-registerofficial-登记官方件) 是「装配启动时按部署的官方件清单登记」的面，授权是「只有装配够得着」；PF-017 §6.6 要求清单里任何一份登记失败则整次启动不成立。

|          | 单列一个服务名只给装配，`boot()` 在全部 `ACTIVE` 之后调它（落选） | **清单作为 config 交给插件，插件体逐条登记（选）** |
| -------- | ----------------------------------------------------------- | ----------------------------------------------- |
| 最强论证 | 插件重跑不会重登；登记失败的收场由装配统一写 | 「只有装配够得着」是结构性的——**没有任何方法**能被调到，不需要调用点检查；失败即插件体抛出 ⇒ fiber `FAILED` ⇒ tenancy-host 现有的整体启动失败与快照恢复（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）；与模型档案目录 P-1 在插件体装入官方清单同形 |
| 本方弱点 | tenancy-host 的 `boot()` 至今不解析任何服务面，要为它破例；要再写一条调用点结构检查 | **插件体重跑会重登**：S-29 ⑦ 幂等到内容与标记，重跑不多出版本；但若重跑发生在运行期（`storage`、`clock`、OG 换代）而那一次登记读不到存储，fiber 会 `FAILED`、四个面一起消失，而不是答 `unavailable`——本版这些提供者都不换代（tenancy-host 依赖表），这一支记为 N-2 |
| 置信度   | — | **中高** |

登记是一次持久写，**不是 effect**：撤除时什么都不做，登记的事实留在存储里。
**整体成或整体不成（PF-017 §6.6、§6.9）分两支兑现**：有待跑迁移的启动，登记发生在迁移之后、确认之前，失败随 tenancy-host 的升级快照一并撤回；**非首次、无迁移、只改了清单**的升级没有快照——新增条目中途登记失败时，启动失败，已登记的几条官方记录与出厂层持有留在库里（官方件只加不删）——运维者若回到旧版本，旧版本会把它们当出厂层的持有读出，这是这一支的可观察后果；下一次带同一份清单启动，逐条重登不多出版本（S-29 ⑦），整体性由**幂等＋重登**兑现，不靠快照（[D-040 §八 M62](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。清单的内容（哪些官方件、哪些是 meta 能力）是随程序发布的数据，由 tenancy-host 从发布物读出后交进 config；**官方件清单本身还没有产品上的内容**（N-10）。

### 组合入口：插件内部的写函数，不在任何面上

AG S-46 的三种写入（首次复制 = 建草稿 ＋ 发布 ＋ 持有；重复复制 = 改草稿 ＋ 发布；分享成立 = 带 `sharing` 的持有）与直接入口**共用插件内部同一组写函数**：写函数接收一个已开的写事务，直接入口的方法开事务、取锁、判资格后调它们；流转的落地在自己的确认事务里调同一组函数、**资格照直接入口判**（S-46「不另开一条」）——成员资格与角色此时来自事务内读函数，不是 OG 服务面，判定仍是同一个纯函数。
`lineage` 与 `sharing` 只是写函数的参数；**资产面与持有面的公开方法签名里没有这两个输入**，所以「直接入口够不着」由类型兑现（verification C-4）。版本号接着自己的线往下数、持有键唯一、所有者至多变一次——这些由写函数统一守，两条写路径不各写一份。

### 快照面：两份契约读面的一次读事务投影

快照面（候选方法 `snapshotFor(caller)`）在**一次读事务**里给出：出厂层、调用方所在组织层与调用方自己租户层的全部持有（同 AG S-42 ⑤）、每份持有被选版本的正文（同 S-64／S-65，`current` 落到读事务里的末尾）、以及每份 `shared` 持有与随它一起判的租户格 `organization` 持有此刻是否生效（AT S-9，经事务内读函数取 OG 事实）。
授权与 S-42 相同（调用方是组织层的读者、租户层就是他本人），**任何一步读不到 ⇒ 整份 `unavailable`**，不交一份缺了分享判定的快照（提案前提 P-3）。
它兑现的是求值契约的前提 PRE-1（四格一致读）与 PRE-2（交进去的持有此刻成立）在**中心那一半**的读法——**没有契约条款定义这个面，也不另立条款**（D-040 §八 N-19 接受）：跨进程的形状与调用方随入口契约 v2 定（N-4）。在那之前它只是两份契约读面的组合，不产生任何新判定。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
| --- | --- | --- | --- |
| `capability.organization-governance/v1` 的 S-22、S-26（AG 钉 v1） | **必需 inject** `organizations`、`memberships`（[OG 节点](../../tenancy/organization-governance/design.md)；v1 服务名），只用于 AG 直接入口的判定次序第 2、3 步 | OG 换代 ⇒ 本插件重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）；插件体只校验 config、登记官方件、provide，可重跑 | 缺席 ⇒ `PENDING`（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)），四个面不可见；运行期读到 `unavailable` ⇒ 各操作 `unavailable`（AG S-51） |
| `capability.organization-governance/v2` 的 S-7、S-8、S-12、S-26、S-34 的事实（AT 钉 v2） | **包依赖**：OG 包的事务内读入口（候选 `./tx-reads`），在本插件自己的事务里调；限定只有本包可以 import（N-3） | 随 OG 包版本；OG 改列、改锁对象 ⇒ 须同步改本包（OG 节点外部依赖登记 X-1～X-3） | 读不到（存储不可用）⇒ `unavailable`；v1 写路径写下的存量记录没有时刻 ⇒ S-9 判不可用（OG v2 §十三，N-11） |
| `data.identity-values/v1` | 包依赖 `core/identity-values`：身份值类型与解析、`shareAncestor`、`ancestorChain` | 随包版本 | — |
| `data.offer-expiry/v1` | 包依赖 `core/offer-expiry`：`timingFrom`、`deriveState`、`acceptable`、`parseOfferTtl`、`Instant` | 随包版本 | — |
| `data.asset-model/v1` | 包依赖 `packages/core/asset-model` 节点：形状、表示层校验、属性声明推出（S-44 的表单）；它的正文判定经端口注入，**本插件在插件体里用 `core/asset-evaluation` 导出的 `defaultBodyContracts`（候选名）构造一次判定对象**，不自组端口（D-040 §八 M51 把 asset-model 节点 AM-5 的组合根收成那一处；S-27「同一值在每个接收边界得同一个拒绝值」由单一来源保证） | 构造时绑定，此后不变 | 端口按类别判别，缺一类在编译期失败；构造仍抛出 ⇒ 插件体 `FAILED` ⇒ 启动失败（同一政策） |
| `capability.asset-evaluation/v1` 的 S-23 | 包依赖 `packages/core/asset-evaluation` 节点单独导出的 `classifyPermissionAssignment`、`boundOf`、`pickWithinBound`（候选名；S-38～S-41 写时守卫）。**不调 `evaluate`**：写一条配值时手上没有、也不组整份求值输入；S-44 的表单只要推出的声明 | 随包版本 | 纯函数，无缺席；签名一改，本插件与求值第 4 步一起改（该节点 AE-6）。`evaluate` 的四种收场（`ok`、`invalidInput`、`compositionCycle`、`categoryUnsupported`）**在本插件没有入口**，不需处置 |
| 六份正文数据契约的两条规则与斜杠命令保留区 | 六个正文数据契约节点（`packages/core/{tool-definition,loop-extension,skill-package,slash-command,mcp-endpoint,connector}`，D-040 §八 M41）经 `defaultBodyContracts` 间接进来，只经上一行的端口用，本插件不直接 import、不另调 | 同上 | `agent_definition` 与 plugin 自己的项是「推不出」，依赖它的操作按 AG G-5 `unavailable`；不是缺实现 |
| 存储（无契约，`storage`；[`core/storage` 协议](../../core/storage/design.md#协议)） | 必需 inject；要求清单见下；`StorageUnavailable` 经 `mapStorageError` 映射为 `unavailable`，其余存储异常原样上抛 | 换代 ⇒ 重跑 | 缺席 ⇒ `PENDING` |
| 时间源（`clock`，offer-expiry S-16 形状） | 必需 inject；`'unavailable'` ⇒ 涉时刻或过期判定的操作 `unavailable` | 装配启动 provide 一份 | 缺席 ⇒ `PENDING`；**严格递增待 `infra/clock` C-15**（N-1） |
| 政策参数与官方件清单 | 插件私有 config（五项），由 [tenancy-host](../../../apps/tenancy-host/design.md#本程追加资产治理与模型档案目录的中心侧候选尚未实现) 下发 | 启动（加载时校验） | 任一不合法 ⇒ **启动失败**，与租户批同一政策；不做成运行期 `unavailable` |

**上游语义的依据**：basis 条目（4.0.4）——`plugin-body-reruns-on-provider-change`、`inject-has-no-optional-form`、`plugin-throw-fails-fiber`、`emit-listener-throw-propagates`、`async-control-not-bail`、`effect-disposal-concurrent-not-ordered`（本插件不建 effect，撤除时无并发释放要排）、`isolate-hides-instances-not-data`（**不用 isolate**：租户、组织之间的差别全是数据）、`logger-level-order-error-lowest`。
**待核对主张**：H-1「`ctx.provide` 由 effect 纳管、fiber 撤除时服务一并消失」——`core/kernel-basis` 的 probe `provide-is-effect-managed` 已通过，未升格为 basis 条目。
**假设，须按 source-check 取证**（kernel-basis 里没有对应 probe，列为待补 probe）：H-2「Cordis 事件不跨进程」；H-4「`ctx.intercept` 的合并顺序是装配链」——本插件不用 `intercept`，设置层序是数据层次，只作为「为什么不用」的依据。
**本项目内的前提**（不是上游）：H-3「`lockRow`／`lockSentinel` 在 sqlite 与 pg 下都给出同一对象上的次序」——`core/storage` 协议与一致性套件（[其验证入口](../../core/storage/verification.md#覆盖缺口)）；本节点没有核那套测试是否覆盖 `lockSentinel` 在 pg 上按名字哈希串行。

### 对存储提供者的要求清单

| # | 要求 | 对应条款 |
| --- | --- | --- |
| R-1 | 单次提交原子：一个写事务里多表写同成同败 | AG 全部写操作 ④ 与 S-50「组合入口同一次提交」「删除、提升与结束分享同一次提交」；AT S-18、S-34 前两行 |
| R-2 | 唯一约束（显式命名、可被识别为 `UniqueViolation`）：持有「持有方 × 能力标识」、每个能力标识至多一份 official 记录、版本复合主键、创建键、尝试键、血缘对应主键、各记录主键 | AG S-50「同一范围 × 能力标识至多一份持有」「`AssetRecordId` 部署内唯一」；AT S-34「同一落点的落地序列化」 |
| R-3 | `lockRow` 与 `lockSentinel` 在同一对象上排出次序，且**对尚不存在的行**也能由哨兵排序 | AG S-21（含谓词读）；AT S-18 三个序列化键；X-1～X-3 |
| R-4 | 提交内读写同源：锁下重读看得到全部已提交写 | AG S-20、S-50「成员资格与角色的新鲜度」在本插件表上的那一半 |
| R-5 | 语句级失败不废事务（撞唯一索引之后在同一事务里重读、按 ⑦ 收场） | AG S-30 ⑦、S-24 ⑦；AT S-20 ⑦ |
| R-6 | 只读事务快照一致：一次读事务里读到的是同一个已提交状态 | AG 读面「不返回残缺列表」；AT S-9「一次可串行化的读里取齐 ① 与 ②」；快照面 |
| R-7 | 持久；不可用可识别（不返回空结果或旧快照） | AG S-51、AT S-35、S-37「全部事实在存储里」 |
| R-8 | **与组织治理的表同一存储、同一约束域**：OG 的隶属哨兵、组织行锁与本插件的锁在同一个存储实例上，事务内读到的 OG 行与本插件的写在同一事务 | X-1～X-3；装配给（tenancy-host「三件事」第 1 条），与 OG 节点 v2 的外部依赖登记互指 |

## 状态、并发与失败映射

**写权**全在本插件的写方法与插件体的官方件登记里；**提交点**每写操作一次。**不加进程内锁**：全部序列化落在 L-1～L-6 这些存储锁上——进程内锁随插件实例生灭，插件体重跑后新旧实例互不相知（basis `plugin-body-reruns-on-provider-change`），且管不到 OG 那一侧的写入者。
**没有「时间谓词」替身**：`now` 不参与冲突检测，时刻只在锁下取、只用于写下与比较（[时刻一节](#时刻确认时刻与组织治理的两个时刻可比)）。

**失败映射**：`storage` 不可用 ⇒ `unavailable`；OG 服务面答 `unavailable` ⇒ `unavailable`（不得收成 `notPermitted`，AG S-61 (a)）；`clock` 答 `'unavailable'` ⇒ 涉时刻的写与涉过期判定的读 `unavailable`；
事务内读函数读不到或读到存量记录缺时刻 ⇒ `unavailable`（S-9：不可用，不是「没断过」）；正文规则缺席 ⇒ `unavailable`；存储里读出的行形状不对、上级链成环 ⇒ 缺陷，上抛、不折成契约失败值。**没有 catch-all**。

**装配给 vs 协议给——两份契约左列在本节点单机上怎样兑现**（右列全部不兑现，AG G-16、AT G-8）：

| 契约行 | 本节点单机兑现 | 由谁 |
| --- | --- | --- |
| AG S-50「调用方身份已经核实过」、AT S-34 同名行 | 本插件的面是能力间内部面；本版**没有任何对外路径**到达它（入口契约 v1 路由表封闭），进程内没有调用者 | 装配（tenancy-host）；对外开放归入口契约 v2（N-5） |
| AG S-50「S-29 只在装配启动时调用」 | 没有方法；清单只经 config 进来 | 本节点（结构） |
| AG S-50「`byAgent` 如实」、AT S-11 调用上下文 | 本版没有来路：公开方法收这一项，来自入口层按调用来路定；**进程内无调用者，入口 v1 不投影** | 入口契约 v2（N-6） |
| AG S-50「组合入口只由资产流转的落地调用」 | 公开方法签名里没有 `lineage`、`sharing` | 本节点（类型） |
| AG S-50「组合入口与落地同一次提交」、「删除、提升与结束分享同一次提交」；AT S-34 第一行、「删除与提升同提交结束分享」 | 同一插件、同一 `storage` 实例、同一写事务（R-1） | 本节点 ＋ 装配给恰一个 `storage` |
| AG S-50「同一范围 × 能力标识至多一份持有」、「`AssetRecordId` 部署内唯一、不回收」 | 唯一索引（R-2）；标识在提交内生成、删除只落 `deleted_at` | 本节点 ＋ 存储 |
| AG S-50「读到的依据与写入同提交、可串行化（含谓词读）」 | L-3、L-4 ＋ R-3 | 本节点 ＋ 存储 |
| AG S-50「成员资格与角色的新鲜度」、AT S-34「成员资格与角色的可见性」 | 直接入口：OG 服务面现读（写后即可被下一次读看到，OG 节点 R-3c）；流转：事务内读 ＋ L-2 | 转交 OG 节点 ＋ 本节点 |
| AG S-50「全部事实可整体导出、导入后原样成立」 | 全部事实都在本插件的表里，以显式身份值为键，值按 `data.asset-model` 可序列化；没有只活在实例里的事实 | 本节点；导出导入工具不在本版 |
| AG S-50「事件在提交之后才派发」 | 先 `await` 提交、再 `emit` | 本节点 |
| AT S-34「同一落点的落地序列化」 | L-5 三个键哨兵 ＋ R-2 | 本节点 ＋ 存储 |
| AT S-34「边界读一致性」、「边界判定与隶属变更的先后」 | L-1 下事务内读上级链（X-1，PA-4） | 本节点 ＋ OG 节点外部依赖 |
| AT S-34「三个时刻可比」 | 同一 `clock` 实例、锁下取时刻；**严格递增待 `infra/clock` C-15**（N-1） | 本节点 ＋ `infra/clock`（C-15，下一程） |
| AT S-34「两读先后」 | 一次事务里取齐 ① 与 ② | 本节点 |
| AT S-34「读两个时刻的调用主体」 | 中心进程内不经读面、没有代行主体；据点那一侧归入口契约 v2 | 本节点（中心）；N-5（据点） |
| AT S-34「尝试键的登记与这一次写入同提交」 | 同一写事务 ＋ L-5 尝试键哨兵 | 本节点 |
| AT S-34「待确认件的时钟同源与存在性读数新鲜度」 | 同一 `clock` ＋ 存在性在确认事务里读（L-3、L-4） | 本节点 ＋ `infra/clock` |
| AT S-34「(源, 层) ↔ `LineageId` 的对应不出本契约」 | 对应只在 `lineage_correspondence`，只由流转模块读写，没有读面返回它 | 本节点；结构检查能否写成未定（N-9） |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
| --- | --- | --- | --- |
| config 校验：两个时长默认值、两个保留期为正；`officialManifest` 外层形状 | `definePlugin` 的 `Config` 在插件体之前校验，不过即 fiber `FAILED`、一个面都不 provide（basis `plugin-throw-fails-fiber`） | 无部分状态 | — |
| 正文判定对象（插件体第一步：以 `core/asset-evaluation` 导出的 `defaultBodyContracts` 构造 `packages/core/asset-model` 的判定对象；清单条目的表示层校验用它） | 插件体局部值，随实例生灭；**不是 effect**，没有外部资源 | 端口缺一类 ⇒ 构造抛出 ⇒ `FAILED`、不 provide | 撤除时随实例丢弃；重跑时重建，同一实现、同一结果 |
| 官方件登记（插件体里、provide 之前，逐条一次写事务；**持久写，不是 effect**） | 插件体；登记完才 provide，所以面可见时出厂层已齐 | 任一条读不到存储或不合法 ⇒ 插件体抛出 ⇒ `FAILED`；**已登记的那几条留在存储里**——它们幂等，下一次启动重登不多出版本；有迁移的启动由 tenancy-host 的升级快照一并撤回（首次登记发生在迁移之后、确认之前）；无迁移、只改清单的启动靠幂等＋重登（[官方件登记](#官方件登记插件体按装配给的清单登记)末段） | 撤除时不做任何事；**保留**：官方记录与出厂层持有（官方件只加不删，AG S-29） |
| 四个 `ctx.provide`：`assets`、`asset-holdings`、`asset-transfer`、`asset-snapshot` | 本 fiber；`ACTIVE` 后可解析 | 任一 provide 失败 ⇒ 抛出，已 provide 的随 fiber 撤（待核对主张 H-1） | 服务消失，消费者重跑或 `PENDING`。**在途调用跑完**——内核不取消在途调用，每个调用的收场由它那一次 `storage` 提交决定（已提交的就成立；撤除开始后新发起的存储调用得 `StorageUnavailable` ⇒ `unavailable`）；本插件无锁要放、无排空、无补偿。**保留**：全部记录（AG S-51、AT S-37） |
| 迁移片段（表、唯一索引；由 tenancy-host 合成） | 装配期，`provide('storage')` 之前 | 迁移失败 ⇒ 整体启动失败、快照恢复（tenancy-host 升级的整体性） | 表与数据不随插件撤除 |
| 五个事件的派发 | 本 fiber 的 `notify`；只在提交之后 | — | 本插件不登记任何监听者；撤除之后不再发 |
| 定时器、监听者、文件监听、连接 | **一个都没有**：过期读时派生、分享失效读时判、不订阅成员与隶属事件（提案 N-6） | — | — |

## 实施缺口与消费者影响

| # | 缺口 | 挡住什么 | owner 与闭合条件 |
| --- | --- | --- | --- |
| N-1 | **时刻严格递增**：`infra/clock` 的 `now()` 只保证不后退；同一毫秒里的「确认—解除—重加入」写下相等的时刻 | AT S-34「三个时刻可比」、OG v2 S-42 末行、AT S-7 存在性第三个合取项（`since`）在本节点兑现不了；**受阻**：AT「不复活」在同一毫秒内的那一支 | [`infra/clock` 的 C-15](../../infra/clock/design.md#实施缺口与消费者影响)（D-040 §八 M58 已选手段，下一程实施）；闭合前 README 把 AT S-9、S-31、S-32 标「有前提：C-15」，D-8 同一毫秒那一支按原样记失败 |
| N-2 | 运行期换代时插件体重登官方件读不到存储 ⇒ fiber `FAILED`、面消失（不是 `unavailable`） | 本版无（`storage`、`clock`、OG 不换代） | 本节点：若将来运行期换代成为需要，改为「登记失败只在启动期抛出」或转装配调用 |
| N-3 | **OG 事务内读入口的导入限定**：须一条 `tools/ts-checks` 规则只许本包（与 OG 自己的测试）import `./tx-reads`，带「故意违反即失败」的自测 | 未写之前，任何包都能绕过 OG 服务面读它的表 | `tools/ts-checks` ＋ OG 节点；未开始 |
| N-4 | **快照面没有契约条款**：D-040 §八 N-19 接受它是两份读面在一次读事务里的投影、不另立条款；余下的是跨进程的形状 | 据点求值的组输入（PRE-1、PRE-2 的中心那一半）经入口契约 v2 投影时要有线上形状 | 主线：随入口契约 v2 定（PA-5、PC-3；D-040 M43 C-4 留给下一程）；在那之前不对外 |
| N-5 | **资产四个面对外不可达**：入口契约 v1 路由表封闭（D-040 PA-5、PC-3）；据点那一侧读 S-9 须经读面与代行 | **受阻消费者**：治理中心与 CLI/TUI 的全部资产流程、据点的求值组输入 | 主线：入口契约出 v2 追加路由、入口层 inject 追加四个面 |
| N-6 | **`byAgent` 与调用上下文没有来路**：AG S-24、AT S-11 要它由入口层按来路定 | 本版没有调用者，不阻断；入口 v2 投影写面时必须带上 | 入口契约 v2 |
| N-7 | **事件越过租户边界**：`emit` 无按租户过滤，AG S-48 末条（订阅走资格判定）`emit` 兑现不了 | 本版无订阅者，不阻断；**任何新增订阅者**都会收到全部租户的持有变化 | 本版保护点：tenancy-host verification 的两条义务（`tools/ts-checks` 不得订阅 `asset.*` 的规则、启动期监听者集合为空的断言，M60）；将来的推送：主线／入口契约 v2 在推送边上按订阅资格过滤 |
| N-8 | **审计条目的形状与读面无契约**：AG S-3 只说「事件落成的记录条目」，记录条目在中心没有数据契约 | 审计读不出来 | 主线：记录条目的数据契约（PF-000）定稿后本节点改写 `asset_audit_entry` |
| N-9 | **血缘对应的私有性只有模块边界**：X-3 的结构检查（资产面、持有面的查询模块不引用 `lineage_correspondence`）能不能写成未定 | AT S-34 末行在本节点是测试保护（D-039 已接受这一降级） | 实现者 ＋ `tools/ts-checks`：试写规则；写不成则 INV-4 读面反例测试（verification） |
| N-10 | **官方件清单没有产品内容**；中心与据点程序版本不一致时出厂格取哪一份未定（提案交接缺口 11） | 出厂层为空时求值「出厂那一格齐全」的前提空真 | 产品负责人（哪些官方件）；主线（版本不一致的收场，求值契约「装配给」表） |
| N-11 | **OG v1 写路径写下的存量成员关系与隶属没有时刻**：S-9 对它们判不可用（OG v2 §十三「不补一个时刻」） | **受阻**：v2 采用之前建立的成员与隶属上的分享一律不可用。**半径是被分享方的整个组织**：快照面「任何一步读不到 ⇒ 整份 `unavailable`」，被分享方组织只要有一份这样的分享，该组织全部成员的快照整份不可用、求值组输入随之不可用。**出路**：被分享方按 AT S-29 移除那份分享，或那段成员关系、隶属重新建立（新时刻落下） | **收场已接受**（D-040 §八 N-19；半径按 M61 写明，未上线、库可重建，不重新标价）；上线前若出现须迁移的存量库，报产品负责人按这个半径重新标价 |
| N-12 | **据点不 import 本包**：结构检查未写 | 候选 B 的代价之一（D-039） | `tools/ts-checks` ＋ `apps/cli` 节点：一条规则 ＋ 自测；未开始 |
| N-13 | **已关闭**：asset-evaluation 节点已单独导出 S-23 的三个函数（`classifyPermissionAssignment`、`boundOf`、`pickWithinBound`），写时守卫改用它们（上文 S-38～S-41 一行）；余下的签名对齐归该节点 AE-6 | — | — |
| N-14 | **函数面与「据点不 import 本包」（N-12）的边界未定**：`./judgments` 不装插件、只依赖纯模块，而 N-12 的规则按「本包」整体禁；SYS-OPEN 要函数面可单独取用，候选 B（D-039）要据点够不着治理实现 | 本版不阻断：据点不需要这些判定（它经读面拿结论，N-5）；将来据点要在本地判 `sharingEffective` 时撞上 | 主线：N-12 的规则是禁「本包任何入口」还是只禁主入口；定之前规则按整包写 |

**受阻消费**：资产的全部用户流程挡在 N-5（入口契约 v2）上；「不复活」在同一毫秒内的那一支挡在 N-1（`infra/clock` C-15）上；存量组织上的分享挡在 N-11 上。本节点不挡别的节点：OG v2 修订与 tenancy-host 修订只需要本页的外部依赖清单与迁移片段名。

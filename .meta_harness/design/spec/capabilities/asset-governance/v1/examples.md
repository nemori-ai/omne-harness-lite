# capability.asset-governance v1 · 规范实例

本文件是 [`contract.md`](contract.md) 的规范工件：五条产品旅程逐步走通（创作那一条附带提升与版本选用）、十七个失败值各一个反例、角色矩阵逐格对到操作。
**它不是说明材料**——哪一步的结果与这里对不上，要么实现错了，要么契约要改，不能两边各说各的。

**记号**：值的形状一律是 `data.asset-model` v1 与 `data.identity-values` v1 的（本契约不发布 Schema）；
下面的 JSON 只写到看得清是哪个值为止，**成员名以那两份契约的 Schema 为准**。
标识都是示意的不透明串。

## 一、演员与起点

| 记号 | 是谁 | 值 |
|---|---|---|
| `O` | 一个团队组织 | `"org_O"` |
| `S` | `O` 的超级管理员 | `{"organization":"org_O","account":"acc_s"}` |
| `M` | `O` 的普通成员 | `{"organization":"org_O","account":"acc_m"}` |
| `P`、`X` | 另一个团队组织，与它的超级管理员 | `"org_P"`；`{"organization":"org_P","account":"acc_x"}` |
| `Q`、`Qs` | 某人的个人组织，与他在那里的租户（**他就是 `Q` 的超级管理员**） | `"org_Q"`；`{"organization":"org_Q","account":"acc_q"}` |
| `T_off` | 官方的 tool `read_file` 那份记录 | `"ar_off_read"`，出厂层持有它 |
| `K_off` | 官方的 skill `code_review` 那份记录 | `"ar_off_review"`，出厂层持有它 |

**`scope` 的两种写法**（`ScopeLayerIdentity`）：组织层 `{"layer":"organization","organization":"org_O"}`；租户层 `{"layer":"tenant","tenant":M}`。

## 二、五条旅程

### 2.1 给组织加一个资产（[flows §1.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#11-给组织加一个资产)）

`S` 把一份组织自己的 tool `lint`（记录 `ar_lint`，所有者 `O`，已发布 v1）加入组织层。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | [S-30](contract.md#s-30-hold-加入持有) `hold(caller: S, scope: 组织层 O, asset: "ar_lint")` | `ok`，依据自动定为 `owned`、版本选用缺省 `current`；发 `HoldingChanged{holder: 组织层 O, capability: {tool, lint}, change: added}` | ②管理者 = 超管；依据 `owned` 成立（所有者就是 `O`，[S-9](contract.md#s-9-持有本契约写得到的两层与写不到的两层)）；有已发布版本 |
| 2 | [S-44](contract.md#s-44-organizationsettingsview-组织的设置视图) `organizationSettingsView(caller: M, organization: "org_O")` | 多出一块：`{ 持有: { capability: {tool, lint}, asset: "ar_lint", basis: owned, versionSelection: current, immutable: false, assignments: [] }, 表单: [lint 当前已发布版推出的属性声明] }` | [S-12](contract.md#s-12-组织的设置是视图不是对象)：**没有人登记过表单**；普通成员读得到（[S-16](contract.md#s-16-谁能做角色矩阵落成的四种资格) 读者） |
| 3 | 同 1 再调一次 | `ok`，**不发事件** | ⑦同记录、同依据、同版本选用的重放 |

**加入的是 plugin 时**：只写**一份**持有；成员随它进来，不各自成为持有（[S-9](contract.md#s-9-持有本契约写得到的两层与写不到的两层)）。视图里那一份另列成员能力标识；成员的表单见 [G-12](contract.md#十二已知缺口)。

### 2.2 用自定义资产替换 official（[flows §1.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#13-用自定义资产替换-official)）

`S` 做一份组织自己的 `{skill, code_review}`，替掉官方那份。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | [S-24](contract.md#s-24-createdraft-创建草稿) `createDraft(caller: S, owner: {"kind":"organization","organization":"org_O"}, capability: {skill, code_review}, content: {...}, byAgent: false)` | `"ar_cr_O"`；草稿 = 那份内容；版本线空；作者 `S`，所有者 `O`；**不发事件** | ②组织范围创作权 = 超管 |
| 2 | [S-26](contract.md#s-26-publish-发布) `publish(caller: S, asset: "ar_cr_O", expected: 1)` | `1`；发 `AssetPublished` | ②末尾 0，`expected` = 1 |
| 3 | [S-30](contract.md#s-30-hold-加入持有) `hold(caller: S, scope: 组织层 O, asset: "ar_cr_O")` | `ok`（依据 `owned`）；发 `HoldingChanged(added)` | 组织层此前没持有 `{skill, code_review}` |
| 4 | [S-42](contract.md#s-42-listholdings-列出某范围的持有) `listHoldings(caller: M, scope: {"layer":"factory"})` | 出厂层那份 `K_off` **原样还在** | [S-8](contract.md#s-8-official-记录与出厂默认层的持有)：替换不是移除 |

**「这一层及以下生效的是新的那份」「所有引用该标识的 plugin 与 agent definition 自动用上新的」是求值的结论**（`capability.asset-evaluation` v1），本契约只写下了第 3 步那份持有。

**在个人组织里做同一件事也行**：`Qs` 是 `Q` 的超级管理员，上面三步把 `S`／`O` 换成 `Qs`／`Q` 照样成立（[acceptance](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)「成员在个人组织里替换 official：允许」）。

### 2.3 组织锁死一个自定义资产（[flows §1.4](../../../../product/PF-002-assets-settings-and-permissions/flows.md#14-组织锁死一个自定义资产)）

接 2.2：`S` 不许任何成员换掉 `{skill, code_review}`。`M` 自己有一份 `{skill, code_review}`（记录 `ar_cr_m`，所有者 `M`，已发布 v1）。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | [S-34](contract.md#s-34-lockreplacement-加替换锁) `lockReplacement(caller: S, scope: 组织层 O, capability: {skill, code_review})` | `ok`；发 `HoldingChanged(replacement_locked)` | — |
| 2 | [S-30](contract.md#s-30-hold-加入持有) `hold(caller: M, scope: 租户层 M, asset: "ar_cr_m")` | **`lockedAbove`**，不写 | ②「组织层没有加替换锁」不成立；**不是 `notPermitted`**——那是组织锁定的，不是他权限不够 |
| 3 | [S-30](contract.md#s-30-hold-加入持有) `hold(caller: M, scope: 租户层 M, asset: "ar_off_review")` | **`lockedAbove`** | 换回官方件同样是替换（[acceptance](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)「无法把它换回 official，也无法换成自己的」） |
| 3a | [S-30](contract.md#s-30-hold-加入持有) `hold(caller: M, scope: 租户层 M, asset: "ar_cr_O")` | `ok`，依据 `organization`、版本选用 `current` | **同一份记录不算替换**（账本 S11-G19）：他要在自己那一层配值；配值仍受组织层的项锁 |
| 3b | 同 3a，但 `versionSelection: {"kind":"pinned","number":1}`（先移除 3a 那份） | **`lockedAbove`** | 锁下以 `pinned` 进来会用上与组织层不同的一版（[S-30](contract.md#s-30-hold-加入持有)；[G-20](contract.md#十二已知缺口)） |
| 4 | [S-35](contract.md#s-35-unlockreplacement-解除替换锁) 解锁，再重试第 2 步 | 解锁 `ok`；第 2 步 `ok` | **不回溯**：解锁前那次被拒的不会被补上，要重新调 |

### 2.4 不让成员用某个工具：移除与禁用（[flows §1.5](../../../../product/PF-002-assets-settings-and-permissions/flows.md#15-不让成员用某个工具)）

接 2.1：组织层持有 `{tool, lint}`，并配了两项：`timeout = 30`、执行权限 `{"allowed":["ask"]}`。

**禁用那一路**：

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | [S-32](contract.md#s-32-disable-禁用) `disable(caller: S, scope: 组织层 O, capability: {tool, lint})` | `ok`；发 `HoldingChanged(disabled)` | 自定义件可以禁用 |
| 2 | [S-44](contract.md#s-44-organizationsettingsview-组织的设置视图) 读视图 | 那一份**还在**、`disabled` 为真、**两项值原样** | [S-11](contract.md#s-11-禁用) |
| 3 | [S-33](contract.md#s-33-enable-启用) `enable(...)` | `ok`；发 `HoldingChanged(enabled)`；值还是那两项 | [acceptance](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)「用的还是禁用之前配好的那些值」 |

**移除那一路**（从头来）：

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | [S-45](contract.md#s-45-listreferrers-列出一份记录的引用方) `listReferrers(caller: S, asset: "ar_lint")` | `{ 持有方: [组织层 O · owned], 组合引用方: [], 租户层持有份数: 0 }` | [S-13](contract.md#s-13-引用方)：组织层没有别的资产引用 `{tool, lint}`；`S` 是所有者一侧，所以有份数这一项 |
| 2 | [S-31](contract.md#s-31-unhold-移除持有) `unhold(caller: S, scope: 组织层 O, capability: {tool, lint})` | `ok`；发 `HoldingChanged(removed)` | 落在组织层的组合引用方为空，`acknowledged` 缺席（空集）也放行 |
| 3 | [S-43](contract.md#s-43-readholding-读一份持有) 读那一份 | `holdingNotFound` | 持有与**两项值一起没了** |
| 4 | [S-30](contract.md#s-30-hold-加入持有) 再加回来，读 | `assignments: []` | 移掉的值回不来（[S-31](contract.md#s-31-unhold-移除持有)） |

**「agent 那一侧两者一样都不可见」是求值的结论**，本契约不答；它给的是**设置页上看得出的差别**（第一路表单还在、第二路没了）。

**同一路里，租户开不回组织禁掉的**：组织禁用之后，`M` 若在自己租户层持有同一份并 `enable`，那只是「他这一层不为真」，
**资产照样不可见**——那不是 [S-33](contract.md#s-33-enable-启用) 的失败，是求值的析取。

### 2.5 创作一个资产（[flows §1.7](../../../../product/PF-002-assets-settings-and-permissions/flows.md#17-创作一个资产)）

**租户范围**：`M` 在自己的租户里写一份 skill。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | [S-24](contract.md#s-24-createdraft-创建草稿) `createDraft(caller: M, owner: {"kind":"tenant","tenant":M}, capability: {skill, notes}, content: c1, byAgent: false, creationKey: "k-01")` | `"ar_notes"`；作者 `M`，所有者 `M` | 租户范围创作权 = 本人（推导，[S-16](contract.md#s-16-谁能做角色矩阵落成的四种资格)） |
| 2 | 回执丢了，同一调用重放 | **`"ar_notes"`**，不写第二份 | ⑦创建键认回 |
| 3 | [S-25](contract.md#s-25-updatedraft-修订草稿) `updateDraft(caller: M, asset: "ar_notes", basedOn: 0, content: c2)` | `ok` | 版本线空，末尾 0 |
| 4 | [S-26](contract.md#s-26-publish-发布) `publish(caller: M, asset: "ar_notes", expected: 1)` | `1`；草稿仍是 `c2` | [S-6](contract.md#s-6-草稿与版本线)：草稿留着 |
| 5 | [S-25](contract.md#s-25-updatedraft-修订草稿) `updateDraft(..., basedOn: 1, content: c3)`，[S-26](contract.md#s-26-publish-发布) `publish(..., expected: 2)` | `ok`；`2` | 「再改形成新版本」 |
| 6 | [S-64](contract.md#s-64-readasset-读一份资产记录) `readAsset(caller: M, asset: "ar_notes")` | 版本线 `[1, 2]`（各带 `publishedAt`、`publishedBy: M`）、草稿 `c3`、不含各版正文 | 本人有租户范围创作权，草稿给他 |
| 7 | [S-65](contract.md#s-65-readversion-读一个已发布版本) `readVersion(caller: M, asset: "ar_notes", number: 1)` | v1：正文 `c2` | 已发布版本不可变 |
| 8 | [S-64](contract.md#s-64-readasset-读一份资产记录) `readAsset(caller: S, asset: "ar_notes")` | **`assetNotFound`** | 成员的租户级私有记录对超管不可见（[S-14](contract.md#s-14-可见与不泄漏存在性)） |

**agent 在 `M` 的租户里运行时写的一份**：同第 1 步，`caller` 仍是 `M`（它运行所在的租户），`byAgent: true`；记录上作者 `M`、标着 agent 产出（[S-7](contract.md#s-7-所有者与作者)）。
**`byAgent` 缺席 ⇒ `invalidInput`**，不当成人写的。

**组织范围**：`S` 直接以 `owner = {organization: O}` 创建（2.2 第 1 步）。**`M` 做同一件事 ⇒ `notPermitted`**：
普通成员「按被授予的权限」在组织范围创作，授予机制本版无定义（[G-3](contract.md#十二已知缺口)）。

**同一所有者下同一能力标识可以再建一份**：`S` 再以 `owner = {organization: O}`、`{skill, code_review}` 调一次 [S-24](contract.md#s-24-createdraft-创建草稿) ⇒ 一份新的 `AssetRecordId`，**不是冲突**；组织层用哪一份由它的持有决定（[S-5](contract.md#s-5-资产记录与它的两个标识)）。

**提升**：`S` 把他自己租户里的一份（`ar_s1`，所有者 `S`，`S` 的租户层持有着它、配了 `timeout = 20`）交给组织。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | [S-27](contract.md#s-27-promotetoorganization-提升到组织) `promoteToOrganization(caller: S, asset: "ar_s1", organization: "org_O")` | `ok`；所有者 `O`，**作者仍是 `S`**；`S` 租户层那份持有**还在**，依据由 `owned` 变为 `organization`，`timeout = 20` 原样；发 `AssetPromoted`（不另发 `HoldingChanged`） | [PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)；依据改写见 [S-27](contract.md#s-27-promotetoorganization-提升到组织) 末段 |
| 2 | 同一调用重放 | `ok`，不发事件 | ⑦认回 |
| 3 | 想退回租户 | **没有这条操作** | [S-7](contract.md#s-7-所有者与作者) |

**版本选用**（[flows §3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)「选用哪个版本是消费方的决定」）：接上面，`ar_s1` 已有 v1、v2；组织层以 `current` 持有它，`S` 的租户层持有着它。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | [S-36](contract.md#s-36-pinversion-钉住一个版本) `pinVersion(caller: S, scope: 租户层 S, capability: <ar_s1 的标识>, number: 1)` | `ok`；发 `HoldingChanged(version_pinned)` | 依据 `organization`，可以钉 |
| 2 | `S` 发布 v3 | 组织层那份按 v3 求值；`S` 租户层那份**仍是 v1**；**两份持有都没被写** | [S-6](contract.md#s-6-草稿与版本线)：发布不改变任何持有 |
| 3 | [S-36](contract.md#s-36-pinversion-钉住一个版本) 同上，`number: 7` | **`versionNotPublished`** | 7 不是已发布版本 |
| 4 | [S-37](contract.md#s-37-unpinversion-回到追随当前版本) `unpinVersion(caller: S, scope: 租户层 S, capability: ...)` | `ok`；此后按 v3；配值原样 | — |
| 5 | 组织层 `O` 以分享持有着 `P` 的 `ar_std`（[`notOwner` 那一行](#三十七个失败值各一个反例)），`S` 对组织层 `O` 的这份 [S-36](contract.md#s-36-pinversion-钉住一个版本) 钉 v1 | **`notOwner`**，仍是 `current` | [被分享方不钉版本](../../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保)：钉住就是要一份 fork，那个动作叫复制 |
| 6 | `M` 在自己租户层以 `organization` 依据持有 `ar_std`（组织层经分享持有着它，账本 S11-G2） | `ok` | [S-9](contract.md#s-9-持有本契约写得到的两层与写不到的两层)：租户格持有本组织可用的那一份，被分享来的也算 |

**删除与告知**：以 2.3 第 3a 步之后的状态为起点——`M` 的租户层以 `organization` 依据持有 `ar_cr_O`。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | [S-45](contract.md#s-45-listreferrers-列出一份记录的引用方) `listReferrers(caller: S, asset: "ar_cr_O")` | `{ 持有方: [组织层 O · owned], 组合引用方: [...], 租户层持有份数: 1 }`——**不说是 `M`** | [S-13](contract.md#s-13-引用方)：所有者一侧只见份数（账本 S11-G18） |
| 2 | [S-28](contract.md#s-28-delete-删除一份资产记录) `delete(caller: S, asset: "ar_cr_O", acknowledged: 第 1 步那一份)` | `ok`；发 `AssetDeleted`，`M` 是它的订阅者之一 | 此刻的集合 ⊆ 确认过的、份数不大于确认过的；删除的告知发给持有它的租户本人 |
| 3 | [S-64](contract.md#s-64-readasset-读一份资产记录) `readAsset(caller: M, asset: "ar_cr_O")`；[S-65](contract.md#s-65-readversion-读一个已发布版本) `readVersion(caller: M, asset: "ar_cr_O", number: 1)` | 两次都是「已删除」，**不返回正文** | 他那一层仍持有它；已发布版本作不可解引用的归档保留（账本 A-M25） |
| 4 | [S-64](contract.md#s-64-readasset-读一份资产记录) `readAsset(caller: X, asset: "ar_cr_O")` | **`assetNotFound`** | 对 `X` 本来就不可见，与从未分配过的标识逐字相同 |
| 5 | [S-43](contract.md#s-43-readholding-读一份持有) `readHolding(caller: M, scope: 租户层 M, capability: {skill, code_review})` | 那份持有**原样在** | 删除不级联（[S-22](contract.md#s-22-先告知再移除或删除)） |

## 三、十七个失败值，各一个反例

每行都是**只让那一个条件不成立**的最小输入；其余前置都满足。

| 失败值 | 反例 | 为什么是它而不是相邻的那个 |
|---|---|---|
| `invalidInput` | [S-30](contract.md#s-30-hold-加入持有) `hold(caller: S, scope: {"layer":"workspace", ...}, ...)` | 写面的 `scope` 是 `ScopeLayerIdentity`，工作区那一格**构造不出来**——表示层拒，不是「无权」 |
| `crossTenant` | [S-38](contract.md#s-38-assign-配值) `assign(caller: S, scope: 租户层 M, capability: {tool, lint}, item: "timeout", value: 10)` | `S` 是超管，**照样**写不进 `M` 的租户层——与角色无关，不是 `notPermitted` |
| `scopeNotFound` | 一个带着旧身份的调用 `G = {"organization":"org_gone","account":"acc_g"}`，`org_gone` 是一个已被清除的个人组织：[S-42](contract.md#s-42-listholdings-列出某范围的持有) `listHoldings(caller: G, scope: 组织层 org_gone)` | 不越界（是他自己的组织），组织却不存在（组织治理 `#S-22` 的 `organizationDoesNotExist`）——不是「你不是成员」 |
| `notPermitted` | [S-30](contract.md#s-30-hold-加入持有) `hold(caller: M, scope: 组织层 O, asset: "ar_lint")` | `M` 是 `O` 的成员但不是超管——[flows §四](../../../../product/PF-002-assets-settings-and-permissions/flows.md#四角色与操作)「给组织加入资产：普通成员不可」 |
| `assetNotFound` | [S-25](contract.md#s-25-updatedraft-修订草稿) `updateDraft(caller: S, asset: "ar_notes", ...)`（`ar_notes` 是 `M` 租户里的私有记录） | 对 `S` 不可见——**与一个从未分配过的标识逐字相同**，不是 `notOwner`（[S-14](contract.md#s-14-可见与不泄漏存在性)） |
| `holdingNotFound` | [S-31](contract.md#s-31-unhold-移除持有) `unhold(caller: S, scope: 组织层 O, capability: <组织层某个 plugin 的成员>)` | 成员没有自己的持有——这就是「单独卸载 plugin 的成员：拒绝」 |
| `assignmentNotFound` | [S-40](contract.md#s-40-lockassignment-锁住该项) `lockAssignment(caller: S, scope: 组织层 O, capability: {tool, lint}, item: "concurrency")`，组织层从没配过 `concurrency` | 持有在，只是这一级对这一项「没意见」——没有值可锁，不是 `holdingNotFound` |
| `alreadyHeld` | [S-30](contract.md#s-30-hold-加入持有) 组织层已持有 `ar_cr_O`，再 `hold(... asset: "ar_off_review")` | 同一能力标识换另一份记录——要换，先移除；**完全相同的重放是 `ok`**，同记录只换版本选用走 [S-36](contract.md#s-36-pinversion-钉住一个版本) |
| `lockedAbove` | 2.3 第 2 步 | 上层锁的，自己解不开——不是 `lockedHere` |
| `lockedHere` | 组织层已对 `timeout` 加了项锁，`S` 再 [S-38](contract.md#s-38-assign-配值) `assign(... item: "timeout", value: 60)` | 自己这一层锁着，先 [S-41](contract.md#s-41-unlockassignment-解除该项的锁) 解锁 |
| `officialImmutable` | [S-32](contract.md#s-32-disable-禁用) `disable(caller: S, scope: 组织层 O, capability: {tool, read_file})`，组织层那份持有指向 `T_off` | 官方件任何一层都不能禁用——超管也不行（[PF-001 §4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)） |
| `notOwner` | `P` 把它拥有的 `ar_std` 分享给了同树的 `O`（组织—组织；`O` 组织层经组合入口以 `shared` 依据持有它）；`S` 调 [S-25](contract.md#s-25-updatedraft-修订草稿) `updateDraft(caller: S, asset: "ar_std", ...)` | `S` 看得见它（组织层持有着），所以不是 `assetNotFound`；它不归 `O`——被分享方不能改（[PF-003 §6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)） |
| `hasReferrers` | 组织层持有 plugin `ar_pack`（成员含 `{skill, code_review}`）与 `ar_cr_O`；[S-31](contract.md#s-31-unhold-移除持有) `unhold(caller: S, scope: 组织层 O, capability: {skill, code_review})` 不带 `acknowledged` | 返回 `{ 组合引用方: [组织层 O · ar_pack] }`，不写；带上它再调 ⇒ `ok`，**`ar_pack` 原样在**（不级联） |
| `versionSequenceBroken` | `ar_notes` 已有 v2；[S-26](contract.md#s-26-publish-发布) `publish(caller: M, asset: "ar_notes", expected: 2)`，且 v2 不是 `M` 以同一内容发的 | 说的号不是末尾 ＋ 1，也不是认回 |
| `versionNotPublished` | [S-30](contract.md#s-30-hold-加入持有) 把 2.5 第 1 步刚建、还没发布的 `ar_notes` 加进 `M` 的租户层 | 草稿不进求值，没有可选用的版本 |
| `valueOutOfDomain` | [S-38](contract.md#s-38-assign-配值) 给执行权限配 `{"allowed":["always"]}`，而该项枚举只有 `ask` `auto` `deny` | 形状合法（是 `PermissionValue`），对这一项不合；**不是 `invalidInput`** |
| `unavailable` | 成员资格读面以 `unavailable` 失败时，[S-30](contract.md#s-30-hold-加入持有) 2.1 第 1 步 | **不是 `notPermitted`**——判不出来，不是判为无权（[S-18](contract.md#s-18-失败值闭合)） |

**判定次序的两个对照**（[S-19](contract.md#s-19-判定次序)）：

| 输入 | 同时成立的条件 | 结果 | 为什么 |
|---|---|---|---|
| `X`（组织 `P` 的超管）调 `hold(caller: X, scope: 组织层 O, asset: "ar_nonexistent", ...)` | 越界 ＋ 记录不存在 | `crossTenant` | 第 2 步纯值比较先于任何读取——**越界的调用方问不出 `O` 里有什么** |
| 已被解除的 `M'` 调 `updateDraft(caller: M', asset: "ar_whatever", ...)` | 身份失效 ＋ 记录可能不存在 | `notPermitted` | 按记录定位的操作，「调用方有效」排在「记录可见」之前 |

## 四、角色矩阵 × 操作

**列**：`O` 的超级管理员 · `O` 的普通成员 · 非成员（另一个组织的人）。**格里写对哪一层**。
**标注**：**原话** = 产品正文的那一格直接给出；**推导** = 由原话推出，理由在末列。

| 操作 | 超级管理员 | 普通成员 | 非成员 | 标注与出处 |
|---|---|---|---|---|
| [S-24](contract.md#s-24-createdraft-创建草稿) 创建草稿，所有者 = 组织 | 可 | **不可**（`notPermitted`，[G-3](contract.md#十二已知缺口)） | 不可（`crossTenant`） | **原话**：PF-002 flows §四「在组织范围创作、发布资产：超管可；普通成员有条件：按被授予的权限；非成员不可」。普通成员那格的「有条件」**授予机制无定义**，本版取拒绝 |
| [S-24](contract.md#s-24-createdraft-创建草稿) 创建草稿，所有者 = 自己的租户 | 可 | 可 | — | **推导**：PF-001 §6.7 表第 2 行 ＋ PF-001 flows §四「管理自己的租户级设置与资产：可／可」 |
| [S-25](contract.md#s-25-updatedraft-修订草稿)／[S-26](contract.md#s-26-publish-发布) 修订、发布组织的记录 | 可 | 不可（同上） | 不可（看不见 ⇒ `assetNotFound`） | **原话**同第一行（「创作、发布」） |
| [S-25](contract.md#s-25-updatedraft-修订草稿)／[S-26](contract.md#s-26-publish-发布) 修订、发布自己租户的记录 | 可（他自己的） | 可（他自己的） | — | **推导**同第二行。**别人的租户记录谁都碰不到**（不可见） |
| [S-27](contract.md#s-27-promotetoorganization-提升到组织) 提升到组织 | 可（他自己的记录） | 不可（`notPermitted`） | 不可（`crossTenant`） | **推导**：提升 = 把东西放进组织范围，资格取「在组织范围创作」那一格（原话）；「只能是他自己的」取 PF-001 §6.7「一次交付，所有权随之易手」——能交出去的只能是自己的 |
| [S-28](contract.md#s-28-delete-删除一份资产记录) 删除组织的记录 | 可 | 不可 | 不可 | **推导**：正文没有「删除」这一格；取与创作同一道资格。PF-003 flows §二「分享方删除了被分享出去的资产」说明删除存在，未说谁能删 |
| [S-28](contract.md#s-28-delete-删除一份资产记录) 删除自己租户的记录 | 可 | 可 | — | **推导**：PF-001 flows §四「管理自己的租户级设置与资产」 |
| [S-29](contract.md#s-29-registerofficial-登记官方件) 登记官方件 | 不可 | 不可 | 不可 | **推导**：官方件的所有者与作者是平台（PF-001 §6.7），超管「不取得官方原件的编辑权」（PF-001 §4 角色）；只有装配启动时的部署清单够得着（账本 A-M17） |
| [S-30](contract.md#s-30-hold-加入持有)／[S-31](contract.md#s-31-unhold-移除持有) 加入、移除，组织层 | 可 | 不可 | 不可 | **原话**：PF-002 flows §四「给组织加入／移除资产」 |
| [S-30](contract.md#s-30-hold-加入持有)／[S-31](contract.md#s-31-unhold-移除持有) 加入、移除，自己的租户层 | 可 | 可；**组织加了替换锁的，只能以 `current` 持有组织那同一份**（另一份 `lockedAbove`） | — | **原话**：PF-002 flows §3.1「租户层是本人」；PF-001 flows §四「管理自己的租户级设置与资产」 |
| [S-32](contract.md#s-32-disable-禁用)／[S-33](contract.md#s-33-enable-启用) 禁用、启用，组织层 | 可 | 不可 | 不可 | **原话**：PF-002 flows §3.1「该范围的管理者——组织层是超级管理员」 |
| [S-32](contract.md#s-32-disable-禁用)／[S-33](contract.md#s-33-enable-启用) 禁用、启用，自己的租户层 | 可 | 可 | — | **原话**：同上「租户层是本人」 |
| [S-34](contract.md#s-34-lockreplacement-加替换锁)／[S-35](contract.md#s-35-unlockreplacement-解除替换锁) 替换锁，组织层 | 可 | 不可 | 不可 | **原话**：PF-002 flows §1.4「组织超级管理员 · 标记为 immutable」；flows §四「把组织级的值标为 immutable」 |
| [S-34](contract.md#s-34-lockreplacement-加替换锁)／[S-35](contract.md#s-35-unlockreplacement-解除替换锁) 替换锁，自己的租户层 | 可 | 可 | — | **推导**：PF-002 §5.5「租户在自己那层把某份 official 的持有标了 immutable ⇒ 工作区替换不了」给了租户这一格，资格取「租户层是本人」 |
| [S-36](contract.md#s-36-pinversion-钉住一个版本)／[S-37](contract.md#s-37-unpinversion-回到追随当前版本) 版本选用，组织层 | 可（分享来的钉不住：`notOwner`） | 不可 | 不可 | **推导**：PF-002 flows §3.3「选用哪个版本是消费方的决定」＋ flows §3.1「该范围的管理者——组织层是超级管理员」；分享来的那一格是 **原话**：PF-003 §6.11「不提供钉在某个版本上」 |
| [S-36](contract.md#s-36-pinversion-钉住一个版本)／[S-37](contract.md#s-37-unpinversion-回到追随当前版本) 版本选用，自己的租户层 | 可 | 可；**组织加了替换锁的不可钉**（`lockedAbove`） | — | **推导**：同上，「租户层是本人」；替换锁那一格取 [S-36](contract.md#s-36-pinversion-钉住一个版本) 的理由 |
| [S-38](contract.md#s-38-assign-配值)／[S-39](contract.md#s-39-clearassignment-清除配值) 配值、清除，组织层 | 可（**凭据类项除外**，下一行） | 不可 | 不可 | **原话**：PF-002 flows §四「配置组织级的设置与权限」 |
| [S-38](contract.md#s-38-assign-配值) 配值，组织层的**凭据类项**（MCP 凭据、连接件的鉴权绑定） | **不可**（`notPermitted`） | 不可 | 不可 | **原话**：PF-002 rev 18 flows §四「配置组织级的设置与权限：可——MCP 凭据与连接件的鉴权绑定除外」、flows §二「拒绝，说明这两项只在租户那一层配、每个成员自己取」（原 G-10 闭合）。超管也不可：这一格与角色无关 |
| [S-38](contract.md#s-38-assign-配值)／[S-39](contract.md#s-39-clearassignment-清除配值) 配值、清除，自己的租户层 | 可 | 可；**组织加了项锁的那一项不可**（`lockedAbove`） | — | **原话**：PF-002 flows §四「配置自己租户级的设置与权限：可／可」「覆盖组织级的值：普通成员看组织有没有加锁」。**超管那一格同样受组织层项锁约束**：锁是组织层的一个值，不认人 |
| [S-40](contract.md#s-40-lockassignment-锁住该项)／[S-41](contract.md#s-41-unlockassignment-解除该项的锁) 项锁，组织层 | 可 | 不可 | 不可 | **原话**：PF-002 flows §四「把组织级的值标为 immutable」 |
| [S-40](contract.md#s-40-lockassignment-锁住该项)／[S-41](contract.md#s-41-unlockassignment-解除该项的锁) 项锁，自己的租户层 | 可 | 可 | — | **推导**：PF-002 §5.4「每一层对一个东西可以做两件事：给一个值；声明它不可再被下层覆盖」 |
| 以上任何一项，**别人的租户层** | **不可**（`crossTenant`） | 不可（`crossTenant`） | 不可 | **原话**：PF-002 flows §四末句「超级管理员……管不到成员租户级的私有部分」；acceptance §二「超级管理员能读到成员租户级的私有配置：绝不能发生」 |
| [S-42](contract.md#s-42-listholdings-列出某范围的持有)／[S-43](contract.md#s-43-readholding-读一份持有) 读组织层 | 可 | 可 | 不可（`crossTenant`） | **推导**：PF-002 §6.4「成员要知道自己少了什么、能不能去申请，看的是设置页」；flows §四「覆盖组织级的值：看组织有没有加锁」要求成员看得见锁 |
| [S-42](contract.md#s-42-listholdings-列出某范围的持有)／[S-43](contract.md#s-43-readholding-读一份持有) 读出厂层 | 可 | 可 | 可（他自己的身份此刻有效即可） | **推导**：官方件是每个人的底座，「不需要授权」（PF-001 §4 来源） |
| [S-42](contract.md#s-42-listholdings-列出某范围的持有)／[S-43](contract.md#s-43-readholding-读一份持有) 读自己的租户层 | 可 | 可 | — | **原话**：PF-001 flows §四「管理自己的租户级设置与资产」 |
| [S-44](contract.md#s-44-organizationsettingsview-组织的设置视图) 组织的设置视图 | 可 | 可 | 不可 | **推导**：同「读组织层」 |
| [S-64](contract.md#s-64-readasset-读一份资产记录)／[S-65](contract.md#s-65-readversion-读一个已发布版本) 读一份记录与它的已发布版本 | 可（看得见的：官方件、组织的、他自己的、他那一层持有的）；草稿只给有创作权的 | 可（同左）；组织记录的草稿不给（显式「不向你展示」） | 不可（看不见 ⇒ `assetNotFound`） | **推导**：看得见即读得到（[S-14](contract.md#s-14-可见与不泄漏存在性)）；草稿与修订同一道资格（[S-25](contract.md#s-25-updatedraft-修订草稿) ②）；读面补上是账本 S11-G9 |
| [S-45](contract.md#s-45-listreferrers-列出一份记录的引用方) 引用方 | 可（所有者一侧，或持有它的范围的管理者） | 可（只对他自己的记录与他自己那一层） | 不可 | **推导**：PF-002 flows §二「先告知受影响的引用」——谁要移除或删除，谁就要先看得见引用方 |
| [S-46](contract.md#s-46-组合入口资产流转的确认步骤) 本人型复制落地，落**自己的租户层** | 可 | 可——**不需要超管确认** | 不可（`crossTenant`） | **原话**：PF-003 rev 5 flows §四「本人型复制」一行；decisions §一 2026-09-24「普通成员……不需要超管确认」。资格就是租户范围创作权，不另开一条 |
| [S-46](contract.md#s-46-组合入口资产流转的确认步骤) 本人型复制落地，落**本组织的组织层**（从他个人组织来的） | 可——**超管选层** | 不可（资产流转那一侧先收 `notPermitted`；到这里也过不了组织范围创作权） | 不可 | **原话**：PF-003 rev 5 flows §四「我是那个团队的超管时，也可落它的组织级」 |
| [S-46](contract.md#s-46-组合入口资产流转的确认步骤) 组织型复制落地（确认那一次） | 可 | 不可 | 不可 | **原话**：PF-003 rev 5 flows §四「确认收到的组织型复制通知：超管可；普通成员不可」；作者就是确认的那位超管（PF-003 §6.5） |
| [S-46](contract.md#s-46-组合入口资产流转的确认步骤) 分享成立取持有，**组织层**（组织—组织、个人—个人） | 可 | 不可 | 不可 | **原话**：PF-003 rev 5 flows §四「确认……组织—组织的分享邀请：超管可；普通成员不可」 |
| [S-46](contract.md#s-46-组合入口资产流转的确认步骤) 分享成立取持有，**自己的租户层**（组织内分享、本人型分享） | 可 | 可 | — | **原话**：PF-003 rev 5 flows §四「确认收到的组织内分享邀请：可——发给我的那份」「本人型分享」；依据是 `shared`，[S-9](contract.md#s-9-持有本契约写得到的两层与写不到的两层)（租户格待 `data.asset-model` 对齐，[G-23](contract.md#十二已知缺口)） |
| [S-31](contract.md#s-31-unhold-移除持有) 移除收到的分享（`shared` 持有），自己的租户层 | 可 | 可 | — | **原话**：PF-003 rev 5 flows §四「移除收到的分享：分享给我租户级的：可」；经资产流转的 `removeShared` 组合，或直接移除持有 |

**「在自己个人组织里做上述一切：可」**（PF-002 flows §四末行，**原话**）不另占一行：个人组织唯一的成员就是它的超级管理员，上表「超级管理员」那一列就是他。

**本表覆盖不到的组合**回到产品设计确认（flows §四末句），本契约不自行补。

# 规范场景

本页是[设计](../design.md)的规范场景：五条旅程逐步走通（创作那一条附带提升与版本选用），十九个失败值各给一个反例，角色矩阵逐格对到操作。
它不是说明材料。实现的结果与这里对不上时，要么实现错了，要么设计要改，不能两边各说各的。

**记号**：下面的 JSON 只写到看得清是哪个值为止，成员名以将来的资产契约为准。
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

### 2.1 给组织加一个资产

`S` 把一份组织自己的 tool `lint`（记录 `ar_lint`，所有者 `O`，已发布 v1）加入组织层。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | `hold(caller: S, scope: 组织层 O, asset: "ar_lint")` | `ok`，依据自动定为 `owned`、版本选用缺省 `current`；发 `HoldingChanged{holder: 组织层 O, capability: {tool, lint}, change: added}` | 管理者是超管；依据 `owned` 成立，所有者就是 `O`；有已发布版本 |
| 2 | `organizationSettingsView(caller: M, organization: "org_O")` | 多出一块：`{ 持有: { capability: {tool, lint}, asset: "ar_lint", basis: owned, versionSelection: current, immutable: false, assignments: [] }, 表单: [lint 当前已发布版推出的属性声明] }` | 表单从当前已发布版推出，**没有人登记过表单**；普通成员在读范围内 |
| 3 | 同 1 再调一次 | `ok`，**不发事件** | 同记录、同依据、同版本选用的重放认回 |

**加入的是 plugin 时**：只写**一份**持有；成员随它进来，不各自成为持有。视图里那一份另列成员能力标识。成员的配置位置是设计里的未决。

### 2.2 用自定义资产替换 official

`S` 做一份组织自己的 `{skill, code_review}`，替掉官方那份。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | `createDraft(caller: S, owner: {"kind":"organization","organization":"org_O"}, capability: {skill, code_review}, content: {...}, byAgent: false)` | `"ar_cr_O"`；草稿 = 那份内容；版本线空；作者 `S`，所有者 `O`；**不发事件** | 组织范围创作权给超管 |
| 2 | `publish(caller: S, asset: "ar_cr_O", expected: 1)` | `1`；发 `AssetPublished` | 末尾 0，`expected` = 1 |
| 3 | `hold(caller: S, scope: 组织层 O, asset: "ar_cr_O")` | `ok`（依据 `owned`）；发 `HoldingChanged(added)` | 组织层此前没持有 `{skill, code_review}` |
| 4 | `listHoldings(caller: M, scope: {"layer":"factory"})` | 出厂层那份 `K_off` **原样还在** | 替换不是移除 |

**「这一层及以下生效的是新的那份」「所有引用该标识的 plugin 与 agent definition 自动用上新的」是求值的结论**，归[资产规格的合法候选与替换](../../../../../packages/assets/SPEC.md#合法候选与替换)。本设计只写下第 3 步那份持有。

**在个人组织里做同一件事也行**：`Qs` 是 `Q` 的超级管理员，上面三步把 `S`／`O` 换成 `Qs`／`Q` 照样成立。成员在个人组织里替换官方件是允许的。

### 2.3 组织锁死一个自定义资产

接 2.2：`S` 不许任何成员换掉 `{skill, code_review}`。`M` 自己有一份 `{skill, code_review}`（记录 `ar_cr_m`，所有者 `M`，已发布 v1）。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | `lockReplacement(caller: S, scope: 组织层 O, capability: {skill, code_review})` | `ok`；发 `HoldingChanged(replacement_locked)` | 无 |
| 2 | `hold(caller: M, scope: 租户层 M, asset: "ar_cr_m")` | **`lockedAbove`**，不写 | 「组织层没有加替换锁」不成立。**不是 `notPermitted`**：那是组织锁定的，不是他权限不够 |
| 3 | `hold(caller: M, scope: 租户层 M, asset: "ar_off_review")` | **`lockedAbove`** | 换回官方件同样是替换。锁下他既不能换回官方件，也不能换成自己的 |
| 3a | `hold(caller: M, scope: 租户层 M, asset: "ar_cr_O")` | `ok`，依据 `organization`、版本选用 `current` | **同一份记录不算替换**。他要在自己那一层配值，配值仍受组织层的项锁 |
| 3b | 同 3a，但 `versionSelection: {"kind":"pinned","number":1}`（先移除 3a 那份） | **`lockedAbove`** | 锁下以 `pinned` 进来会用上与组织层不同的一版 |
| 4 | `unlockReplacement`，再重试第 2 步 | 解锁 `ok`；第 2 步 `ok` | **不回溯**：解锁前那次被拒的不会被补上，要重新调 |

### 2.4 不让成员用某个工具：移除与禁用

接 2.1：组织层持有 `{tool, lint}`，并配了两项：`timeout = 30`、执行权限 `{"allowed":["ask"]}`。

**禁用那一路**：

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | `disable(caller: S, scope: 组织层 O, capability: {tool, lint})` | `ok`；发 `HoldingChanged(disabled)` | 自定义件可以禁用 |
| 2 | 读视图 | 那一份**还在**、`disabled` 为真、**两项值原样** | 禁用保留持有与配置 |
| 3 | `enable(...)` | `ok`；发 `HoldingChanged(enabled)`；值还是那两项 | 再启用之后用的还是禁用之前配好的那些值 |

**移除那一路**（从头来）：

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | `listReferrers(caller: S, asset: "ar_lint")` | `{ 持有方: [组织层 O · owned], 组合引用方: [], 租户层持有份数: 0 }` | 组织层没有别的资产引用 `{tool, lint}`；`S` 是所有者一侧，所以有份数这一项 |
| 2 | `unhold(caller: S, scope: 组织层 O, capability: {tool, lint})` | `ok`；发 `HoldingChanged(removed)` | 落在组织层的组合引用方为空，`acknowledged` 缺席（空集）也放行 |
| 3 | 读那一份 | `holdingNotFound` | 持有与**两项值一起没了** |
| 4 | 再加回来，读 | `assignments: []` | 移掉的值回不来 |

**「agent 那一侧两者一样都不可见」是求值的结论**，本设计不答。它给的是**设置页上看得出的差别**：第一路表单还在，第二路没了。

**同一路里，租户开不回组织禁掉的**：组织禁用之后，`M` 若在自己租户层持有同一份并 `enable`，那只是「他这一层不为真」，
**资产照样不可见**。这不是 `enable` 的失败，是求值的析取。

### 2.5 创作一个资产

**租户范围**：`M` 在自己的租户里写一份 skill。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | `createDraft(caller: M, owner: {"kind":"tenant","tenant":M}, capability: {skill, notes}, content: c1, byAgent: false, creationKey: "k-01")` | `"ar_notes"`；作者 `M`，所有者 `M` | 租户范围创作权给本人 |
| 2 | 回执丢了，同一调用重放 | **`"ar_notes"`**，不写第二份 | 创建键认回 |
| 3 | `updateDraft(caller: M, asset: "ar_notes", basedOn: 0, content: c2)` | `ok` | 版本线空，末尾 0 |
| 4 | `publish(caller: M, asset: "ar_notes", expected: 1)` | `1`；草稿仍是 `c2` | 草稿留着 |
| 5 | `updateDraft(..., basedOn: 1, content: c3)`，`publish(..., expected: 2)` | `ok`；`2` | 再改形成新版本 |
| 6 | `readAsset(caller: M, asset: "ar_notes")` | 版本线 `[1, 2]`（各带 `publishedAt`、`publishedBy: M`）、草稿 `c3`、不含各版正文 | 本人有租户范围创作权，草稿给他 |
| 7 | `readVersion(caller: M, asset: "ar_notes", number: 1)` | v1：正文 `c2` | 已发布版本不可变 |
| 8 | `readAsset(caller: S, asset: "ar_notes")` | **`assetNotFound`** | 成员的租户级私有记录对超管不可见 |

**agent 在 `M` 的租户里运行时写的一份**：同第 1 步，`caller` 仍是 `M`（它运行所在的租户），`byAgent: true`；记录上作者 `M`、标着 agent 产出。
**`byAgent` 缺席 ⇒ `invalidInput`**，不当成人写的。

**组织范围**：`S` 直接以 `owner = {organization: O}` 创建（2.2 第 1 步）。**`M` 做同一件事 ⇒ `notPermitted`**：
普通成员按被授予的权限在组织范围创作，授予机制没有定义（见设计的未决）。

**同一所有者下同一能力标识可以再建一份**：`S` 再以 `owner = {organization: O}`、`{skill, code_review}` 调用 `createDraft` ⇒ 一份新的 `AssetRecordId`，**不是冲突**。组织层用哪一份由它的持有决定。

**提升**：`S` 把他自己租户里的一份（`ar_s1`，所有者 `S`，`S` 的租户层持有着它、配了 `timeout = 20`）交给组织。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | `promoteToOrganization(caller: S, asset: "ar_s1", organization: "org_O")` | `ok`；所有者 `O`，**作者仍是 `S`**；`S` 租户层那份持有**还在**，依据随所有者重算为 `organization`，`timeout = 20` 与版本选用原样，**这不是一次持有变更**；组织层**没有因此多出一份持有**；发 `AssetPromoted`（不另发 `HoldingChanged`） | 提升只换所有者，原持有和配值保留，组织不自动新增持有（[产品正文](../../../product/assets-and-rules/design.md#把资产所有权交给组织须由人完成交付)第 144 行）。依据重算见设计的 `promoteToOrganization` |
| 1b | `S` 另一份自己租户级的 `ar_s2` 已组织内分享给 `M`、`M` 那一层以 `shared` 持有它；`S` 提升 `ar_s2` | `ok`；同一提交里那段分享置 `revoked`、原因 `ownerChanged`（资产流转的记录）；`M` 那份 `shared` 持有**还在**、此后按分享的判据不可用 | **提升不被分享挡住**。提升时分享怎样结束是[资产复制与分享](../../asset-transfer/design.md)的未决 |
| 2 | 同一调用重放 | `ok`，不发事件 | 认回 |
| 3 | 想退回租户 | **没有这条操作** | 提升不可逆 |

**版本选用**（选用哪个版本是消费方的决定，见[产品正文](../../../product/assets-and-rules/design.md#ownership-and-versions)第 41 行）：接上面，`ar_s1` 已有 v1、v2；组织层以 `current` 持有它，`S` 的租户层持有着它。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | `pinVersion(caller: S, scope: 租户层 S, capability: <ar_s1 的标识>, number: 1)` | `ok`；发 `HoldingChanged(version_pinned)` | 依据 `organization`，可以钉 |
| 2 | `S` 发布 v3 | 组织层那份按 v3 求值；`S` 租户层那份**仍是 v1**；**两份持有都没被写** | 发布不改变任何持有 |
| 3 | 同上，`number: 7` | **`versionNotPublished`** | 7 不是已发布版本 |
| 4 | `unpinVersion(caller: S, scope: 租户层 S, capability: ...)` | `ok`；此后按 v3；配值原样 | 无 |
| 5 | 组织层 `O` 以分享持有着 `P` 的 `ar_std`（[`notOwner` 那一行](#三十九个失败值各一个反例)），`S` 对组织层 `O` 的这份调 `pinVersion` 钉 v1 | **`notOwner`**，仍是 `current` | 分享只能跟随，不能固定版本（[产品正文](../../../product/assets-and-rules/design.md#ownership-and-versions)第 41 行）。钉住就是要一份 fork，那个动作叫复制 |
| 6 | `M` 在自己租户层以 `organization` 依据持有 `ar_std` | `ok` | 租户格持有本组织可用的那一份，被分享来的也算 |

**删除与告知**：以 2.3 第 3a 步之后的状态为起点：`M` 的租户层以 `organization` 依据持有 `ar_cr_O`。

| # | 调用 | 结果 | 依据 |
|---|---|---|---|
| 1 | `listReferrers(caller: S, asset: "ar_cr_O")` | `{ 持有方: [组织层 O · owned], 组合引用方: [...], 租户层持有份数: 1 }`，**不说是 `M`** | 所有者一侧只见份数 |
| 2 | `delete(caller: S, asset: "ar_cr_O", acknowledged: 第 1 步那一份)` | `ok`；发 `AssetDeleted`，`M` 是它的订阅者之一 | 此刻的集合 ⊆ 确认过的、份数不大于确认过的；删除的告知发给持有它的租户本人 |
| 3 | `readAsset(caller: M, asset: "ar_cr_O")`；`readVersion(caller: M, asset: "ar_cr_O", number: 1)` | 两次都是「已删除」，**不返回正文** | 他那一层仍持有它；已发布版本作不可解引用的归档保留 |
| 4 | `readAsset(caller: X, asset: "ar_cr_O")` | **`assetNotFound`** | 对 `X` 本来就不可见，与从未分配过的标识逐字相同 |
| 5 | `readHolding(caller: M, scope: 租户层 M, capability: {skill, code_review})` | 那份持有**原样在** | 删除不级联 |

## 三、十九个失败值，各一个反例

每行都是**只让那一个条件不成立**的最小输入；其余前置都满足。

| 失败值 | 反例 | 为什么是它而不是相邻的那个 |
|---|---|---|
| `invalidInput` | `hold(caller: S, scope: {"layer":"workspace", ...}, ...)` | 写面的 `scope` 是 `ScopeLayerIdentity`，工作区那一格**构造不出来**。这是表示层拒绝，不是「无权」 |
| `crossTenant` | `assign(caller: S, scope: 租户层 M, capability: {tool, lint}, item: "timeout", value: 10)` | `S` 是超管，**照样**写不进 `M` 的租户层。这与角色无关，不是 `notPermitted` |
| `scopeNotFound` | 一个带着旧身份的调用 `G = {"organization":"org_gone","account":"acc_g"}`，`org_gone` 是一个已被清除的个人组织：`listHoldings(caller: G, scope: 组织层 org_gone)` | 不越界（是他自己的组织），组织却不存在，组织治理答组织不存在。不是「你不是成员」 |
| `notPermitted` | `hold(caller: M, scope: 组织层 O, asset: "ar_lint")` | `M` 是 `O` 的成员但不是超管。普通成员不能给组织加入资产 |
| `assetNotFound` | `updateDraft(caller: S, asset: "ar_notes", ...)`（`ar_notes` 是 `M` 租户里的私有记录） | 对 `S` 不可见，**与一个从未分配过的标识逐字相同**，不是 `notOwner` |
| `holdingNotFound` | `unhold(caller: S, scope: 组织层 O, capability: <组织层某个 plugin 的成员>)` | 成员没有自己的持有。这就是「单独卸载 plugin 的成员：拒绝」 |
| `assignmentNotFound` | `lockAssignment(caller: S, scope: 组织层 O, capability: {tool, lint}, item: "concurrency")`，组织层从没配过 `concurrency` | 持有在，只是这一级对这一项「没意见」。没有值可锁，不是 `holdingNotFound` |
| `alreadyHeld` | 组织层已持有 `ar_cr_O`，再 `hold(... asset: "ar_off_review")` | 同一能力标识换另一份记录，要换就先移除。**完全相同的重放是 `ok`**，同记录只换版本选用走 `pinVersion`、`unpinVersion` |
| `lockedAbove` | 2.3 第 2 步；权限上：组织层把 `{tool, lint}` 的执行权限配成 `{"allowed":["forbid"]}`（**不锁**），`M` 在自己租户层用 `assign` 挑 `{"allowed":["auto"]}` | 上层锁的，自己解不开，不是 `lockedHere`。权限那一例：配成「禁止」锁不锁都是界，「自动」落在界外；挑 `{"allowed":["forbid"]}` 则 `ok` |
| `lockedHere` | 组织层已对 `timeout` 加了项锁，`S` 再调 `assign(... item: "timeout", value: 60)`（不带 `immutable`） | 自己这一层锁着，先用 `unlockAssignment` 解锁。**同一调用带 `immutable: true` ⇒ `ok`**：随值加锁替换这一层自己的锁，`lockedHere` 只挡不带锁的改值与清除 |
| `officialImmutable` | `disable(caller: S, scope: 组织层 O, capability: {tool, read_file})`，组织层那份持有指向 `T_off` | 官方件任何一层都不能禁用，超管也不行（[产品正文](../../../product/assets-and-rules/design.md#resolution)第 51 行） |
| `notOwner` | `P` 把它拥有的 `ar_std` 分享给了同树的 `O`（组织对组织；`O` 组织层经组合入口以 `shared` 依据持有它）；`S` 调 `updateDraft(caller: S, asset: "ar_std", ...)` | `S` 看得见它（组织层持有着），所以不是 `assetNotFound`；它不归 `O`，被分享方不能改（[产品正文](../../../product/assets-and-rules/design.md#circulation)第 140 行） |
| `hasReferrers` | 组织层持有 plugin `ar_pack`（成员含 `{skill, code_review}`）与 `ar_cr_O`；`unhold(caller: S, scope: 组织层 O, capability: {skill, code_review})` 不带 `acknowledged` | 返回 `{ 组合引用方: [组织层 O · ar_pack] }`，不写；带上它再调 ⇒ `ok`，**`ar_pack` 原样在**（不级联） |
| `versionSequenceBroken` | `ar_notes` 已有 v2；`publish(caller: M, asset: "ar_notes", expected: 2)`，且 v2 不是 `M` 以同一内容发的 | 说的号不是末尾 ＋ 1，也不是认回 |
| `versionNotPublished` | 把 2.5 第 1 步刚建、还没发布的 `ar_notes` 加进 `M` 的租户层 | 草稿不进求值，没有可选用的版本 |
| `valueOutOfDomain` | 给执行权限配 `{"allowed":["always"]}`，而该项枚举只有 `ask` `auto` `forbid` | 形状合法（是 `PermissionValue`），对这一项不合；**不是 `invalidInput`**。**凭据位写明文同样落这里**：`M` 在自己租户层给 `{mcp, github}` 的凭据那一项配一段明文 token ⇒ `valueOutOfDomain`。那一项的取值域是 `CredentialRef`，「凭据位写了非引用值」只有这一个拒绝值 |
| `layerNotAllowed` | `assign(caller: S, scope: 组织层 O, capability: {mcp, github}, item: <凭据那一项>, value: <一个 CredentialRef>)` | `S` 是超管，**照样**不收：组织那一层不持有 MCP 凭据，与角色无关，不是 `notPermitted` |
| `selectionNotSingleTier` | `assign(caller: M, scope: 租户层 M, capability: {tool, lint}, item: <执行权限>, value: {"allowed":["ask","forbid"]})`，组织层对这一项没有界 | 每一档都在取值域里，所以不是 `valueOutOfDomain`；不锁的配值是一条挑选，分档的权限上只挑一档；`{"allowed":[]}` 同样收它。**同一个值带 `immutable: true` ⇒ `ok`**：随值加锁写下的是一条界，可以多档或空集 |
| `unavailable` | 成员资格读面以 `unavailable` 失败时，2.1 第 1 步 | **不是 `notPermitted`**：判不出来，不是判为无权 |

**判定次序的两个对照**（见设计的「失败值与判定次序」）：

| 输入 | 同时成立的条件 | 结果 | 为什么 |
|---|---|---|---|
| `X`（组织 `P` 的超管）调 `hold(caller: X, scope: 组织层 O, asset: "ar_nonexistent", ...)` | 越界 ＋ 记录不存在 | `crossTenant` | 第 2 步纯值比较先于任何读取，**越界的调用方问不出 `O` 里有什么** |
| 已被解除的 `M'` 调 `updateDraft(caller: M', asset: "ar_whatever", ...)` | 身份失效 ＋ 记录可能不存在 | `notPermitted` | 按记录定位的操作，「调用方有效」排在「记录可见」之前 |

## 四、角色矩阵 × 操作

**列**：`O` 的超级管理员 · `O` 的普通成员 · 非成员（另一个组织的人）。**格里写对哪一层**。
**依据**：链到现行正文的，那里写着同一条。写「前提」的，是本设计自己定的前提，理由跟在后面。

| 操作 | 超级管理员 | 普通成员 | 非成员 | 依据 |
|---|---|---|---|---|
| 创建草稿，所有者 = 组织 | 可 | **不可**（`notPermitted`） | 不可（`crossTenant`） | 前提：组织范围的创作与发布给超管，普通成员按被授予的权限，非成员不可。产品正文没有通用委托协议（[ASSET-N01](../../../product/assets-and-rules/design.md#asset-n01-明确非目标与边界)），普通成员那一格取拒绝 |
| 创建草稿，所有者 = 自己的租户 | 可 | 可 | 无 | 在自己租户范围创作的归租户（[产品正文](../../../product/assets-and-rules/design.md#ownership-and-versions)第 37 行）。前提：本人管理自己的租户级设置与资产 |
| 修订、发布组织的记录 | 可 | 不可（同上） | 不可（看不见 ⇒ `assetNotFound`） | 同第一行（创作与发布） |
| 修订、发布自己租户的记录 | 可（他自己的） | 可（他自己的） | 无 | 同第二行。**别人的租户记录谁都碰不到**（不可见） |
| 提升到组织 | 可（他自己的记录） | 不可（`notPermitted`） | 不可（`crossTenant`） | 前提：提升把东西放进组织范围，资格取「在组织范围创作」那一格。提升是一次所有权交付，能交出去的只能是自己的 |
| 删除组织的记录 | 可 | 不可 | 不可 | 前提：取与创作同一道资格。产品正文没有写谁能删 |
| 删除自己租户的记录 | 可 | 可 | 无 | 前提：本人管理自己的租户级设置与资产 |
| 登记官方件 | 不可 | 不可 | 不可 | 官方件的所有者与作者是平台（[产品正文](../../../product/assets-and-rules/design.md#ownership-and-versions)第 37 行）。前提：超管不取得官方原件的编辑权，只有装配启动时的部署清单够得着 |
| 加入、移除，组织层 | 可 | 不可 | 不可 | 前提：组织层的管理者是超管（见设计的未决「组织层的管理者与创作者」） |
| 加入、移除，自己的租户层 | 可 | 可；**组织加了替换锁的，只能以 `current` 持有组织那同一份**（另一份 `lockedAbove`） | 无 | 前提：租户层的管理者是本人 |
| 禁用、启用，组织层 | 可 | 不可 | 不可 | 前提：组织层的管理者是超管 |
| 禁用、启用，自己的租户层 | 可 | 可 | 无 | 前提：租户层的管理者是本人 |
| 替换锁，组织层 | 可 | 不可 | 不可 | 前提：组织超管可以把组织级的持有标为不可替换 |
| 替换锁，自己的租户层 | 可 | 可 | 无 | 前提：租户在自己那层给某份官方件的持有加了替换锁，工作区就替换不了它。资格取「租户层是本人」 |
| 版本选用，组织层 | 可（分享来的钉不住：`notOwner`） | 不可 | 不可 | 选用哪个版本是消费方的决定，分享只能跟随、不能固定版本（[产品正文](../../../product/assets-and-rules/design.md#ownership-and-versions)第 41 行）。前提：资格取范围管理者 |
| 版本选用，自己的租户层 | 可 | 可；**组织加了替换锁的不可钉**（`lockedAbove`） | 无 | 同上，租户层是本人。替换锁那一格的理由见设计的 `pinVersion` |
| 配值、清除，组织层 | 可（**凭据类项除外**，下一行）；**随值加锁**（`immutable: true`）同一格 | 不可 | 不可 | 前提：超管配置组织级的设置与权限，并能把组织级的值标为不可覆盖。随值加锁是这两格合成一步，资格不另开 |
| 配值，组织层的**凭据类项**（MCP 凭据、连接件的鉴权绑定） | **不可**（`layerNotAllowed`） | 不可 | 不可 | 前提：组织层不配 MCP 凭据与连接件的鉴权绑定，这两项只在租户那一层配，每个成员自己取。超管也不可，这一格与角色无关 |
| 配值、清除，自己的租户层 | 可 | 可；**设置项：组织加了项锁的那一项不可**（`lockedAbove`）；**权限项：值（挑选或界，带不带锁）落在组织那一层的界外不可**（`lockedAbove`，界含执行权限上不锁的「禁止」），分档的权限只挑一档（`selectionNotSingleTier`） | 无 | 前提：本人配置自己租户级的设置与权限，能不能覆盖组织级的值看组织有没有加锁。权限那一半是在界内挑一个（[产品正文](../../../product/assets-and-rules/design.md#settings-and-permissions)第 102 行）。**超管那一格同样受组织层的锁与界约束**：它们是组织层的值，不认人 |
| 项锁，组织层 | 可 | 不可 | 不可 | 前提：超管能把组织级的值标为不可覆盖 |
| 项锁，自己的租户层 | 可 | 可 | 无 | 前提：每一层对一个东西可以做两件事，给一个值，或声明它不可再被下层覆盖 |
| 以上任何一项，**别人的租户层** | **不可**（`crossTenant`） | 不可（`crossTenant`） | 不可 | 组织管理员的资产管理角色不开放私有租户内容（[资产规格](../../../../../packages/assets/SPEC.md#权限写入与准入)第 220 行）。超管读到成员租户级的私有配置绝不能发生 |
| 读组织层 | 可 | 可 | 不可（`crossTenant`） | 前提：成员要从设置页知道自己少了什么、能不能去申请；要覆盖组织级的值，先得看得见组织有没有加锁 |
| 读出厂层 | 可 | 可 | 可（他自己的身份此刻有效即可） | 前提：官方件是每个人的底座，读它不需要授权 |
| 读自己的租户层 | 可 | 可 | 无 | 前提：本人管理自己的租户级设置与资产 |
| 组织的设置视图 | 可 | 可 | 不可 | 同「读组织层」 |
| 读一份记录与它的已发布版本 | 可（看得见的：官方件、组织的、他自己的、他那一层持有的）；草稿只给有创作权的 | 可（同左）；组织记录的草稿不给（显式「不向你展示」） | 不可（看不见 ⇒ `assetNotFound`） | 看得见即读得到；草稿与修订同一道资格；草稿读面遵循设计的创作权与不展示规则 |
| 引用方 | 可（所有者一侧，或持有它的范围的管理者） | 可（只对他自己的记录与他自己那一层） | 不可 | 前提：谁要移除或删除，谁就要先告知受影响的引用，所以先要看得见引用方 |
| 本人型复制落地，落**自己的租户层** | 可 | 可，**不需要超管确认** | 不可（`crossTenant`） | 本人型流转两边都是本人，发起即成立（[产品正文](../../../product/assets-and-rules/design.md#circulation)第 136 行）。资格就是租户范围创作权，不另开一条 |
| 本人型复制落地，落**本组织的组织层**（从他个人组织来的） | 可，**超管选层** | 不可（资产流转那一侧先收 `notPermitted`；到这里也过不了组织范围创作权） | 不可 | 本人也是目标团队管理员时，复制可以选组织级（[产品正文](../../../product/assets-and-rules/design.md#circulation)第 122 行） |
| 组织型复制落地（确认那一次） | 可 | 不可 | 不可 | 组织型流转由目标管理员确认，作者记实际确认的目标管理员（[产品正文](../../../product/assets-and-rules/design.md#circulation)第 124、130 行） |
| 分享成立取持有，**组织层**（组织对组织、个人对个人） | 可 | 不可 | 不可 | 组织型分享由目标管理员确认（[产品正文](../../../product/assets-and-rules/design.md#circulation)第 124 行） |
| 分享成立取持有，**自己的租户层**（组织内分享、本人型分享） | 可 | 可 | 无 | 组织内分享由接收的成员确认，本人型两边都是本人（[产品正文](../../../product/assets-and-rules/design.md#circulation)第 124、136 行）。依据是 `shared` |
| 移除收到的分享（`shared` 持有），自己的租户层 | 可 | 可 | 无 | 接收者可以移除（[产品正文](../../../product/assets-and-rules/design.md#circulation)第 140 行）。经资产复制与分享的 `removeShared` 组合，或直接移除持有 |

在自己的个人组织里，上述一切都可以做。这一条不另占一行：个人组织唯一的成员就是它的超级管理员，上表「超级管理员」那一列就是他。

**本表覆盖不到的组合**交产品负责人确认，本设计不自行补。

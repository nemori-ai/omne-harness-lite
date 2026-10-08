下述removeShared成功路径只覆盖不存在组合引用的条件，不豁免unhold的告知/hasReferrers；存在引用的组合仍阻断，见当前设计。

removeShared与unhold的acknowledged/hasReferrers组合尚未闭合；plugin内容及holding实例身份限定见[设计](../design.md)。这些场景不能标已实现。

# 规范场景

本域设计**不附 Schema**，所以这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前八节与第十节各走通一条路径，第九节给每个失败值一个反例。

**两条读法上的边界：**

- **标识串只是占位**：`org_G`、`ast_x`、`cn_1` 这类写法不承诺任何词法（`identity-values`）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](README.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `P_A`、`P_B` | 账号 A、B 的个人组织 |
| `G` | 集团，团队组织，无上级；R 是它的超级管理员 |
| `C1`、`C2` | 公司，团队组织，上级都是 `G`——三者同树；T 是 `C1` 的超级管理员 |
| `X` | 另一个团队组织，不在 `G` 那棵树上 |
| `(P_A, A)`、`(C1, A)`、`(C2, A)` | A 的三个租户身份；A 在 `C1` 是普通成员，在 `C2` 是超级管理员 |
| `(C2, S)` | `C2` 的另一位超级管理员 S |
| `(C1, B)` | B 在 `C1` 的租户身份，普通成员 |

**落点与被分享方都写成一层**：`{org: C2}` 是 `C2` 的组织级，`{tenant: (C1,A)}` 是 A 在 `C1` 的租户级（`ScopeLayerIdentity`，`identity-values`）。

## 1. 本人型首次复制：普通成员带进团队

A 把个人组织里 skill `ast_x`（所有者 `P_A`，已发布 v1、v3）的 **v3** 复制进他在 `C1` 的租户级。A 在 `C1` 只是普通成员。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueCopyNotice(发起者=(P_A,A), 源={ast_x, 3}, 落点={tenant:(C1,A)})` | **`landed{ created{ asset=ast_y, 已取得持有 } }`**，告知清单为空；**没有复制通知、没有任何人点头** | 本人型租户落点直接复制，无待确认通知 |
| 2 | 观察 `ast_y` | 所有者 `(C1, A)`；作者 `(C1, A)`；来源 `customized`；**v1**，内容整体等于 `ast_x` 的 v3；血缘 `{ lineage=ln_1, sourceVersion=3, importedBy=(C1,A), importedAt=…, imports=1 }`；A 的租户层持有它（basis `owned`）；v1 的发布者 `(C1, A)` | 当前设计 |
| 3 | `listPendingForOrganization((C1,T), {org:C1})` | **空**——本人型不产生待确认件 | 当前设计 |
| 4 | 观察 `ast_x` | **一字节不变**：所有者、作者、版本线 | 当前设计「源侧什么都不动」 |
| 5 | 同一调用把落点换成 `{org:C1}` | **`notPermitted`**——A 在 `C1` 不是超管，组织级落不了 | 本人组织落点须有目标组织有效超管资格 |

**超管选组织级**：A 把同一份 `ast_x` 的 v3 复制进 `{org:C2}`（A 在 `C2` 是超管）⇒ `landed{ created{ asset=ast_z } }`，所有者 `C2`、作者 `(C2, A)`，同样**不需要第二个人**。

## 2. 重复复制：全量覆盖，配值不动

接第 1 节。A 在自己 `C1` 租户层的 `ast_y` 上把一项执行权限配成收窄的值并加锁；随后在源侧发布 v4，再复制一次到同一层。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueCopyNotice((P_A,A), {ast_x, 4}, {tenant:(C1,A)})` | `landed{ overwritten{ newVersion=2 } }` | 当前设计 |
| 2 | 观察 `ast_y` | 记录号不变；**v2** 内容整体等于 `ast_x` 的 v4；v1 仍在、可查可回退；血缘 `lineage=ln_1` **不变**，`sourceVersion=4`、`imports=2` | 当前设计 |
| 3 | 观察 A 那层的持有与配值 | **那一项配值与锁照旧**；持有照旧 | 当前设计、[§6.7](../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动) |

**带尝试键的重放**（当前设计）：第 1 步若带键 `k_1` 发起、回执丢了，A 用 `k_1` 再调一次 ⇒ 返回**同一个** `landed{ overwritten{ newVersion=2 } }`，`ast_y` **没有 v3**；不带键再调 ⇒ 一次新的重复复制，`ast_y` 多出 v3（`imports=3`）。

## 3. 撞标识无血缘 = 新增；血缘只在落进的那一层里找

`C2` 自己做过一份与 `ast_x` 同能力标识的 `ast_c2`，并在组织层持有它。第 1 节末尾 A 已把 `ast_x` 复制进 `{org:C2}`（`ast_z`）——那一次就是撞标识无血缘。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | （第 1 节末尾那一次） | `created{ asset=ast_z, **未取得持有** }`，并告知同一能力标识下现在有两份 | 当前设计 |
| 2 | 观察 | `ast_c2` **一字节不动**、它的持有**不动**；`ast_z` 是 `C2` 的一份新记录，带新血缘；谁生效由 `C2` 自己决定 | [§6.8](../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘) |
| 3 | A 再把 `ast_x` 复制进 `{tenant:(C2,A)}` | **又是 `created`**——`C2` 组织级那份 `ast_z` 不动；A 在 `C2` 的租户级多一份，各有各的血缘 | 当前设计「先定层，再在那一层里找」 |

## 4. 组织型复制：集团把模板复制给子公司

`G` 组织级拥有模板 `ast_m`（已发布 v2）。R 把它复制给 `C1` 的组织级；T 读过之后确认。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueCopyNotice((G,R), {ast_m, 2}, {org:C1})` | `pending{ cn_1 }` | 组织型复制通知须由目标组织确认 |
| 2 | `listPendingForOrganization((C1,T), {org:C1})` | 一项：复制通知 `cn_1` 与它的 `OfferTiming`；**不带内容、不带源** | 当前设计 |
| 3 | `readCopyNotice((C1,T), cn_1)` | 目标侧投影：**源组织 `G`**、能力标识、源版本号 2、v2 的内容、`pending`、**此刻确认会是首次**；**没有 `ast_m`**，也没有 `ast_m` 的其余版本与草稿、没有 R | 当前设计 |
| 4 | `confirmCopy((C1,T), cn_1)` | `created{ asset=ast_k, 已取得持有 }` | 当前设计 |
| 5 | 观察 `ast_k` | 所有者 `C1`；**作者 `(C1, T)`**——确认的那位超管；血缘 `importedBy=(C1,T)`；**`byAgent = false`**——取 R 发起那一次调用的上下文（复制通知上记着），T 的确认不改它 | 当前设计、[§6.5](../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制) |
| 6 | `C1` 的普通成员 `(C1,B)` 调 `confirmCopy` | `notPermitted` | 当前设计 |

## 5. 组织间分享的确认、跟随与撤销

`G` 拥有安全组件 `ast_s`（已发布 v5，`G` 组织层持有）。R 把它分享给 `C1`；T 确认。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueSharingInvitation((G,R), ast_s, {org:C1})` | `pending{ si_1 }` | 当前设计：团队 → 同树团队；资产归组织，R 是超管 |
| 2 | `confirmSharing((C1,T), si_1)` | `sh_1`，已取得持有（`C1` 组织层，basis `shared{sh_1}`）；`sh_1` 的确认时刻记下 | 当前设计 |
| 3 | `G` 发布 v6 | `C1` 下一次求值用到 **v6**，没有任何人做任何操作 | 当前设计、[§6.11](../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保) |
| 4 | 再发一份 `si_2`（同一对）并确认 | 返回 **`sh_1`**，不新建 | 当前设计 |
| 5 | `revokeSharing((G,R), sh_1)` | `ok`；`listSharings((C1,T), C1)` 默认档里没有它，全部档里它是 `revoked` | 当前设计 |
| 6 | 观察 `C1` | 下一次使用被拒；**`C1` 那层的持有与配值还在**，不可用 | 当前设计 |
| 7 | `removeShared((C1,T), sh_1)` | `ok`；`C1` 那份 shared 持有**连同配值**一起没了；`sh_1` 仍是 `revoked`，**不改写** | 当前设计 |

第 3 步的「用到」要求那一刻三个合取项都成立：第三个合取项读 `C1` 的隶属建立时刻（`organization-governance`），它不晚于 `sh_1` 的确认时刻（当前设计）。

## 6. 隶属解除之后：分享失效，复制留着，不复活

接第 5 节第 2 步（`sh_1` 为 `active`），并接第 4 节（`ast_k` 已复制进 `C1`）。然后 `C1` 解除与 `G` 的隶属，再重新隶属。

| 步 | 观察 | 预期 | 依据 |
|---|---|---|---|
| 1 | 解除之后 `listSharings((C1,T), C1, 全部)` | `sh_1` 此刻是 **`dissolved`**——算出来的，存储里它仍记为 `active` | 当前设计 |
| 2 | `C1` 下一次求值 | `ast_s` 那份 shared 持有**不可用** | 当前设计 |
| 3 | 复制进 `C1` 的 `ast_k` | **照常用、照常改** | [§6.12](../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后) |
| 4 | `C1` 重新隶属 `G` | `sh_1` **仍是 `dissolved`、仍不可用**——`C1` 的隶属建立时刻晚于 `sh_1` 的确认时刻 | 当前设计 第三个合取项、当前设计 |
| 5 | R 再分享一次、T 再确认 | **新的 `sh_2`**，可用——不认回 `sh_1`（它不生效） | 当前设计 |
| 6 | 关掉 `affiliation.dissolved` 的派发、解除与重建之间不做任何读，重跑 1～5 | **结果完全相同** | 当前设计 |

## 7. 组织内分享：把我租户级的工具分享给同事

A 在 `C1` 的租户级有 tool `ast_t`（所有者 `(C1, A)`，已发布）。A 把它分享给同事 B。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueSharingInvitation((C1,A), ast_t, {tenant:(C1,B)})` | `pending{ si_4 }` | 当前设计；当前设计 分享表「组织内分享」一行 |
| 2 | `listPendingForOrganization((C1,B), {tenant:(C1,B)})` | 一项：分享邀请 `si_4` | 当前设计 |
| 3 | `confirmSharing((C1,T), si_4)`——T 是 `C1` 的超管 | `invitationNotFound`：被分享方是 B 这个租户，只有 B 本人能确认 | 当前设计 |
| 4 | `confirmSharing((C1,B), si_4)` | `sh_4`；B 的租户层以 `shared{sh_4}` 持有它 | 当前设计 |
| 5 | `listSharings((C1,T), C1, 全部)` | **没有 `sh_4`**——超管看不到组织内分享 | 当前设计 |
| 6 | B 退出 `C1`，再重新加入 | `sh_4` 是 **`dissolved`**，重新加入之后**仍是**；B 用不上 | 当前设计 |
| 7 | B 试图把 `ast_t` 分享给 `(C1, D)`、复制出去 | `notTransitive`、`notTransitive` | 当前设计 |

第 6 步的「重新加入仍不生效」读 B 的成员关系生效时刻（`organization-governance`，以 `(C1,B)` 自己为调用方）：重新加入把它改写成新的时刻，晚于 `sh_4` 的确认时刻。
**第 4 步写得进**：当前asset-model允许租户格以`shared`持有。

## 8. 分享一个 plugin

`P_A` 拥有 plugin `ast_p`（已发布），它的一版内含一个 skill 与一个 slash command，并**引用**能力标识 `tool:grep`；`P_B` 组织层与出厂默认层都没有 `tool:grep`。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueSharingInvitation((P_A,A), ast_p, {org:P_B})` | `pending{ si_3 }`，**告知清单 = [`tool:grep`]**；照常发出，不是拒绝 | 当前设计；个人 → 个人 |
| 2 | `confirmSharing((P_B,B), si_3)` | `sh_3`；`P_B` 那侧**只有 `ast_p` 这一份**分享与持有，内含成员没有各自的 | 当前设计 |

**这一节受阻于 当前设计**：「内含」与「引用」在 plugin 正文里怎么分还没有形状；在它闭合之前，第 1 步的告知清单按 当前设计 为空。

## 9. 每个失败值一个反例

| 失败值 | 调用与局面 | 依据 |
|---|---|---|
| `invalidInput` | `issueCopyNotice((C1,A), {ast_t,1}, {tenant:(C1,A)})`——落点在发起者自己的组织里，不读任何记录即拒；或给时长 `-PT1H`；或不给落点 | 当前设计 |
| `targetLayerNotSelf` | `issueCopyNotice((P_A,A), {ast_x,3}, {tenant:(C1,B)})`——另一个组织里别人的租户级，**不读任何记录** | 当前设计 |
| `layerNotAllowed` | `issueCopyNotice((C1,A), {ast_t,1}, {org:C2})`——我租户级的落进另一个组织的组织级（A 在 `C2` 是超管也一样）；或 `issueSharingInvitation((P_A,A), ast_x, {org:C2})`——个人组织 → 团队组织级的分享；或 `issueCopyNotice((G,R), {ast_m,2}, {tenant:(C1,R)})`——组织级落进租户级（R 在 `C1` 也有租户身份，是他自己的也不行） | 当前设计 |
| `recipientNotMember` | `issueSharingInvitation((C1,A), ast_t, {tenant:(C1,E)})`——E 从未加入 `C1`（或已退出） | 当前设计 |
| `notPermitted` | 第 1 节第 5 步：普通成员选组织级；或 `C1` 的普通成员 B 试图复制 `C1` 组织级的资产 | 当前设计、当前设计 |
| `notPermitted`（确认时的再判） | 第 4 节 `cn_1` 发出后，R 退出 `G`（或不再是超管），T 再确认 | 当前设计、当前设计 |
| `outsideTree` | `issueCopyNotice((C1,A), {ast_t,1}, {tenant:(X,A)})`：`C1` 与 `X` 不同树；或 `issueSharingInvitation((C1,A), ast_t, {tenant:(P_A,A)})`：团队 → 个人组织 | 当前设计 |
| `sourceNotOwned` | A 拿 `C1` 里**另一个成员**的租户级资产号去发复制——与「这个号不存在」给**同一个值** | 当前设计 |
| `versionNotPublished` | `issueCopyNotice((P_A,A), {ast_x, 2}, {tenant:(C1,A)})`：`ast_x` 没有 v2（只有草稿与 v1、v3） | 当前设计 |
| `officialNotTransferable` | 任何人对一份 `origin = official` 的资产发起复制或分享 | 当前设计 |
| `notTransitive` | 第 5 节确认之后，T 把 `ast_s` 分享给 `C2`（或复制出去）；第 7 节第 7 步 | 当前设计、[§6.13](../../../product/PF-003-asset-transfer-and-sharing/design.md#613-分享不可传递) |
| `noticeNotFound` | `C2` 的超管读或确认 `cn_1`（目标是 `C1`，不是他的组织）——与「这个号不存在」同值 | 当前设计 |
| `invitationNotFound` | `X` 的超管读 `si_1`；第 7 节第 3 步 | 当前设计 |
| `sharingNotFound` | `C2` 的超管对 `sh_1` 调 `removeShared` | 当前设计 |
| `offerNoLongerValid` | 确认一份已过期的；**以及**确认一份已撤回的、再确认一份已确认的——**三者值逐字相同** | 当前设计 总表、`offer-expiry` |
| `alreadyConcluded` | 撤回第 4 节已确认的 `cn_1`；撤回一份已过期的——**两者值逐字相同，都不写终结记录** | 当前设计 |
| `notPermitted`（列表） | 普通成员 B 调 `listPendingForOrganization((C1,B), {org:C1})`——按层定位，不是 `noticeNotFound` | 当前设计 |
| `unavailable` | 让 `C1`–`G` 的上级链读面不可用，再确认第 4 节那份通知——**不是 `outsideTree`**；或让 `C1` 的隶属建立时刻读不到，再求值第 5 节那份 shared 持有——**不是可用**，也不是 `dissolved`；或让尝试键登记读不到，再带键重放第 1 节的复制——**不是一次新的落地** | 当前设计、当前设计 |

## 10. 分享方删除与提升：分享随之结束

接第 5 节第 2 步（`sh_1` 为 `active`，`C1` 组织层以 `shared{sh_1}` 持有 `ast_s` 并为它配过一项权限），并接第 7 节第 4 步（`sh_4` 为 `active`）。另设 A 在 `C1` 被授予了组织范围创作权。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | R 经资产治理删除 `ast_s`（先告知：`C1` 是持有方） | 删除 `ok`；**同一次提交里** `sh_1` 写 `revoked`，原因 `sourceDeleted`，写下者 `(G,R)`，时刻是删除那一刻 | 当前设计；`asset-governance` |
| 2 | `listSharings((C1,T), C1, 全部)` | `sh_1` 是 `revoked`、带 `sourceDeleted`；资产那一项答「已删除」 | 当前设计 |
| 3 | 观察 `C1` | 那份 shared 持有与配值**还在**、不可用；T 可以 `removeShared((C1,T), sh_1)` 把它们清掉，`sh_1` 仍是 `revoked`、不改写 | 当前设计 |
| 4 | A 把 `ast_t` 提升到 `C1` 的组织级 | 提升 `ok`——**不因为有 `sh_4` 而被拒**；同一次提交里 `sh_4` 写 `revoked`，原因 `ownerChanged` | 当前设计；`asset-governance` |
| 5 | 观察 B | B 那层的持有留着、用不上；要用，是 `C1` 的新决定——经组织级资产在本组织里的使用授权给，不续旧的 `sh_4` | 当前设计 末段 |

**本节场景不表示提供者已经实现或产品采用范围已扩大**：删除/提升与对应分享终结同提交；当前asset-model允许租户格shared。ownerChanged的产品采用范围仍受设计页限定。**分享结束不通知**：第 2 步的读就是被分享方知道它结束的方式（当前设计）。

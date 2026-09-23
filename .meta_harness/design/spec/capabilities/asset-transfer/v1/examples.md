# 规范实例：走通的路径与每个失败值的反例

属于 `capability.asset-transfer` v1 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前六节各走通一条路径，第七节给每个失败值一个反例。

**两条读法上的边界：**

- **标识串只是占位**：`org_G`、`ast_x`、`cn_1` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `P_A`、`P_B` | 账号 A、B 的个人组织 |
| `G` | 集团，团队组织，无上级 |
| `C1`、`C2` | 公司，团队组织，上级都是 `G`——三者同树 |
| `X` | 另一个团队组织，不在 `G` 那棵树上 |
| `(P_A, A)`、`(C1, A)`、`(C2, A)` | A 的三个租户身份；A 在 `C1` 是普通成员，在 `C2` 是超级管理员 |
| `(C2, S)` | `C2` 的另一位超级管理员 S |

## 1. 首次复制

A 把个人组织里 skill `ast_x`（所有者 `P_A`，已发布 v1、v3）的 **v3** 复制给 `C2`。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueCopyNotice(发起者=(P_A,A), 源={ast_x, 3}, 目标=C2)` | `cn_1`；告知清单为空 | [S-20](contract.md#s-20-发起复制)：个人组织 → 他所在的团队，**无树条件**；A 在 `C2` 是超管，有加入资产的资格 |
| 2 | `readCopyNotice((C2,S), cn_1)` | 目标侧投影：送来的租户身份 `(C2, A)`、能力标识、源版本号 3、v3 的内容、`pending`、**此刻确认会是首次**；**没有 `ast_x`、没有 `P_A`** | [S-23](contract.md#s-23-读复制通知) |
| 3 | `confirmCopy((C2,S), cn_1)` | `created{ asset=ast_y, 已取得持有 }` | [S-22](contract.md#s-22-确认复制)、[S-11](contract.md#s-11-复制的收场) |
| 4 | 观察 `ast_y` | 所有者 `C2`；作者 `(C2, A)`；来源 `customized`；**v1**，内容整体等于 `ast_x` 的 v3；血缘 `{ lineage=ln_1, sourceVersion=3, importedBy=(C2,A), importedAt=…, imports=1 }`；`C2` 组织层持有它（basis `owned`）；v1 的发布者是 `(C2, S)` | [S-10](contract.md#s-10-复制血缘怎么判怎么记)、[S-11](contract.md#s-11-复制的收场) |
| 5 | 观察 `ast_x` | **一字节不变**：所有者、作者、版本线 | [S-11](contract.md#s-11-复制的收场)「源侧什么都不动」 |

## 2. 重复复制：全量覆盖，配值不动

接第 1 节。`C2` 在 `ast_y` 的持有上把一项执行权限配成收窄的值并加锁；A 随后在源侧发布 v4，再复制一次。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueCopyNotice((P_A,A), {ast_x, 4}, C2)` → `cn_2`；`readCopyNotice((C2,S), cn_2)` | 目标侧投影写明**此刻确认会是重复**，被覆盖的是 `ast_y` | [S-23](contract.md#s-23-读复制通知) |
| 2 | `confirmCopy((C2,S), cn_2)` | `overwritten{ newVersion=2 }` | [S-11](contract.md#s-11-复制的收场) |
| 3 | 观察 `ast_y` | 记录号不变；**v2** 内容整体等于 `ast_x` 的 v4；v1 仍在、可查可回退；血缘 `lineage=ln_1` **不变**，`sourceVersion=4`、`imports=2` | [S-10](contract.md#s-10-复制血缘怎么判怎么记) |
| 4 | 观察 `C2` 的持有与配值 | **那一项配值与锁照旧**；持有照旧 | [S-11](contract.md#s-11-复制的收场)、[§6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动) |

## 3. 撞标识无血缘 = 新增

`C1` 里 A 有一份**租户级**的 tool `ast_t`（所有者 `(C1, A)`），`C2` 自己做过一份同能力标识的 `ast_c2`，并在组织层持有它。A 把 `ast_t` 复制给 `C2`。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueCopyNotice((C1,A), {ast_t, 1}, C2)` | `cn_3`——团队 → 同树团队，A 两边都是成员、在 `C2` 是超管 | [S-12](contract.md#s-12-流转边界团队资产不出那棵树) |
| 2 | `confirmCopy((C2,S), cn_3)` | `created{ asset=ast_n, **未取得持有** }`，并告知同一能力标识下现在有两份 | [S-11](contract.md#s-11-复制的收场) |
| 3 | 观察 | `ast_c2` **一字节不动**、它的持有**不动**；`ast_n` 是 `C2` 的一份新记录，带新血缘；谁生效由 `C2` 自己决定 | [§6.8](../../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘) |

## 4. 分享的确认、跟随与撤销

`G` 拥有安全组件 `ast_s`（已发布 v5，`G` 组织层持有）。`G` 的超管 R 把它分享给 `C1`；`C1` 的超管 T 确认。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueSharingInvitation((G,R), ast_s, C1)` | `si_1` | [S-24](contract.md#s-24-发起分享)：团队 → 同树团队；资产归组织，R 是超管 |
| 2 | `confirmSharing((C1,T), si_1)` | `sh_1`，已取得持有（`C1` 组织层，basis `shared{sh_1}`） | [S-26](contract.md#s-26-确认分享) |
| 3 | `G` 发布 v6 | `C1` 下一次求值用到 **v6**，没有任何人做任何操作 | [S-8](contract.md#s-8-分享)、[§6.11](../../../../product/PF-003-asset-transfer-and-sharing/design.md#611-分享的同步与自保) |
| 4 | 再发一份 `si_2`（同一对）并确认 | 返回 **`sh_1`**，不新建 | [S-26](contract.md#s-26-确认分享) ⑦ |
| 5 | `revokeSharing((G,R), sh_1)` | `ok`；`listSharings((C1,T), C1)` 默认档里没有它，全部档里它是 `revoked` | [S-28](contract.md#s-28-撤销分享)、[S-30](contract.md#s-30-列出组织的分享) |
| 6 | 观察 `C1` | 下一次使用被拒；**`C1` 那层的持有与配值还在**，不可用 | [S-9](contract.md#s-9-分享此刻是否生效)、[S-28](contract.md#s-28-撤销分享) |
| 7 | `removeShared((C1,T), sh_1)` | `ok`；`C1` 那份 shared 持有**连同配值**一起没了；`sh_1` 仍是 `revoked`，**不改写** | [S-29](contract.md#s-29-移除收到的分享) ⑦ |

## 5. 隶属解除之后

接第 4 节第 2 步（`sh_1` 为 `active`）。此前 `C1` 的超管 T 已按第 1 节的路径把自己个人组织里的一份资产复制给了 `C1`。然后 `C1` 解除与 `G` 的隶属。

| 步 | 观察 | 预期 | 依据 |
|---|---|---|---|
| 1 | `listSharings((C1,T), C1, 全部)` | `sh_1` 此刻是 **`dissolved`**——算出来的，存储里它仍记为 `active` | [S-9](contract.md#s-9-分享此刻是否生效) |
| 2 | `C1` 下一次求值 | `ast_s` 那份 shared 持有**不可用** | [S-31](contract.md#s-31-隶属解除分享在使用时失效不靠事件) |
| 3 | 复制给 `C1` 的那份 | **照常用、照常改** | [§6.12](../../../../product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后) |
| 4 | 关掉 `affiliation.dissolved` 的派发重跑 1～3 | **结果完全相同** | [S-31](contract.md#s-31-隶属解除分享在使用时失效不靠事件) |
| 5 | `C1` 重新隶属 `G` | `sh_1` **重新生效**——本版如此，**是缺口不是承诺**（[G-4](contract.md#十一已知缺口)） | [S-31](contract.md#s-31-隶属解除分享在使用时失效不靠事件) |

## 6. 分享一个 plugin

`P_A` 拥有 plugin `ast_p`（已发布），它的一版内含一个 skill 与一个 slash command，并**引用**能力标识 `tool:grep`；`P_B` 组织层与出厂默认层都没有 `tool:grep`。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `issueSharingInvitation((P_A,A), ast_p, P_B)` | `si_3`，**告知清单 = [`tool:grep`]**；照常发出，不是拒绝 | [S-14](contract.md#s-14-plugin-的复制与分享)：个人 → 个人，无限制 |
| 2 | `confirmSharing((P_B,B), si_3)` | `sh_3`；`P_B` 那侧**只有 `ast_p` 这一份**分享与持有，内含成员没有各自的 | [S-14](contract.md#s-14-plugin-的复制与分享) |

**这一节受阻于 [G-5](contract.md#十一已知缺口)**：「内含」与「引用」在 plugin 正文里怎么分还没有形状；在它闭合之前，第 1 步的告知清单按 [S-14](contract.md#s-14-plugin-的复制与分享) 为空。

## 7. 每个失败值一个反例

| 失败值 | 调用与局面 | 依据 |
|---|---|---|
| `invalidInput` | `issueCopyNotice((C1,A), {ast_t,1}, C1)`——目标就是源组织，不读任何记录即拒；或给时长 `-PT1H` | [S-16](contract.md#s-16-缺席时的默认答案) |
| `notPermitted` | `issueCopyNotice((C2,A), {A 在 C2 的一份租户级资产, 1}, C1)`：A 在 `C1` 只是普通成员，**没有加入资产的资格** | [S-20](contract.md#s-20-发起复制) ② |
| `notPermitted`（确认时的再判） | 第 1 节 `cn_1` 发出后，A 退出 `C2`，S 再确认 | [S-22](contract.md#s-22-确认复制) ②、[S-32](contract.md#s-32-成员关系解除复制执行不了已确认的不动) |
| `outsideTree` | `issueCopyNotice((C1,A), {ast_t,1}, X)`：`C1` 与 `X` 不同树；或 `issueSharingInvitation((P_A,A), ast_x, C2)`：个人 → 团队的分享 | [S-12](contract.md#s-12-流转边界团队资产不出那棵树) |
| `sourceNotOwned` | A 拿 `C1` 里**另一个成员**的租户级资产号去发复制通知——与「这个号不存在」给**同一个值** | [S-13](contract.md#s-13-发起者一侧的资产) |
| `versionNotPublished` | `issueCopyNotice((P_A,A), {ast_x, 2}, C2)`：`ast_x` 没有 v2（只有草稿与 v1、v3） | [S-20](contract.md#s-20-发起复制) ② |
| `organizationAssetNotCopyable` | `C2` 的超管 A 试图复制 `C2` 组织级的资产——**超管也一样** | [S-13](contract.md#s-13-发起者一侧的资产) |
| `officialNotTransferable` | 任何人对一份 `origin = official` 的资产发复制通知或分享邀请 | [S-13](contract.md#s-13-发起者一侧的资产) |
| `notTransitive` | 第 4 节确认之后，`C1` 的超管 T 把 `ast_s` 分享给 `C2`（或复制出去） | [S-13](contract.md#s-13-发起者一侧的资产)、[§6.13](../../../../product/PF-003-asset-transfer-and-sharing/design.md#613-分享不可传递) |
| `noticeNotFound` | `C1` 的超管读或确认 `cn_1`（目标是 `C2`，不是他的组织）——与「这个号不存在」同值 | [S-22](contract.md#s-22-确认复制)、[S-23](contract.md#s-23-读复制通知) |
| `invitationNotFound` | `X` 的超管读 `si_1` | [S-27](contract.md#s-27-读分享邀请) |
| `sharingNotFound` | `C2` 的超管对 `sh_1` 调 `removeShared` | [S-29](contract.md#s-29-移除收到的分享) |
| `expired`（确认路径） | 确认一份已过期的；**以及**确认一份已撤回的、再确认一份已确认的——**三者值逐字相同** | [S-19](contract.md#s-19-这一节每个操作写全九件事) 总表、`data.offer-expiry/v1#S-13` |
| `expired`（撤回路径） | 撤回一份已过期的：**不写终结记录** | [S-21](contract.md#s-21-撤回复制通知) ⑦ |
| `alreadyConfirmed` | 撤回第 1 节已确认的 `cn_1` | [S-21](contract.md#s-21-撤回复制通知) ⑦ |
| `unavailable` | 让 `C1`–`G` 的上级链读面不可用，再确认第 3 节那份通知——**不是 `outsideTree`** | [S-16](contract.md#s-16-缺席时的默认答案)、[S-12](contract.md#s-12-流转边界团队资产不出那棵树) |

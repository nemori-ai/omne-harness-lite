# 形式化工件与论证映射

本页拥有**条款 → 性质 → 模型 → 检查配置**这一层对应关系，以及工件**盖不到什么**。
它不是模型，也不是证明，**不填通过状态**——实际执行的工具、配置、范围与结果在[验证入口](../../verification.md)。

本版只选一个工件：TLA+ 行为模型 [`Transfer.tla`](Transfer.tla)，理由在[契约 S-38](../contract.md#s-38-本版选用哪些形式工件)。
**不建 Alloy、不建 Schema**：边界判据的结构性质归 `capability.organization-governance`（它的 v1 Alloy 在给定规模内检查过，v2 声明沿用、不含两个时刻；范围与尚未做的变异核对见[那份验证入口](../../../organization-governance/verification.md)，不算作本契约的证据），
数据形状归 `data.asset-model` 与 `data.offer-expiry`。

## 本版选用什么

| 契约条款 | 性质 | 模型里的定义 | 去掉哪一处保护会被反驳 | 未覆盖范围与相应义务 |
|---|---|---|---|---|
| [S-7](../contract.md#s-7-两类待确认件共用的过期语义) · [S-18](../contract.md#s-18-确认是一次提交同一落点的确认序列化) | 过期、已撤回、已确认的待确认件被确认后**不产生效果**；终结记录**不改写** | 不变量 `NoLateOrDoubleSettle`；动作性质 `SettledStable` | `SameCommit = FALSE`（[`Transfer_NoSameCommit_Settle.cfg`](Transfer_NoSameCommit_Settle.cfg)） | 失败**值**（`offerNoLongerValid` 三路同值）不在模型里——模型只看效果。证据形式是[规范场景 S-39](../contract.md#s-39-两类待确认件的三种收场) |
| [S-10](../contract.md#s-10-复制血缘怎么判怎么记) · [S-18](../contract.md#s-18-确认是一次提交同一落点的确认序列化) | 同一 (源记录, 落进的那一层) **至多一份**带对应血缘的目标记录——组织型（t2 组织级）与本人型（A2 租户级）两处各自成立 | `AtMostOneLineageTarget`（`linO2 <= 1 /\ linA2 <= 1`） | `SameCommit = FALSE`（[`Transfer_NoSameCommit_Lineage.cfg`](Transfer_NoSameCommit_Lineage.cfg)，反例走本人型的两次拆步发起） | 首次／重复的**写集合**（所有者、作者、版本号、血缘四项）不在模型里——`linO2`／`linA2` 只是份数。「血缘只在落进的那一层里找」是两个计数互不相干，**被建模方式吸收**；[S-20](../contract.md#s-20-发起复制) ⑦ 的尝试键认回**没建模**（版本数不在模型里）；证据形式是[规范场景 S-40](../contract.md#s-40-首次重复撞标识无血缘按层找) |
| [S-8](../contract.md#s-8-分享) · [S-18](../contract.md#s-18-确认是一次提交同一落点的确认序列化) | 同一 (资产, 被分享方) **至多一份此刻生效**的分享 | `AtMostOneLiveSharingPerPair`（`~(Effective(s1) /\ Effective(s2))`） | `SameCommit = FALSE`（[`Transfer_NoSameCommit_Sharing.cfg`](Transfer_NoSameCommit_Sharing.cfg)） | 「认回那一份」返回的是**哪个** `SharingId`，是场景的事（[S-43](../contract.md#s-43-分享的建立跟随与结束)） |
| [S-12](../contract.md#s-12-流转边界团队资产不出那棵树) · [S-17](../contract.md#s-17-每道准入现读确认时再判一遍) · [S-32](../contract.md#s-32-成员关系解除复制执行不了已确认的不动) | 复制**只在**发起者资格有效、且源与落点同树时落地（组织型的确认、本人型的发起） | `CopyLandsInsideBoundary`（落地那一刻 `CopyOK` 不成立就记一次 `"copy"`） | `ConfirmRecheck = FALSE`（[`Transfer_NoConfirmRecheck.cfg`](Transfer_NoConfirmRecheck.cfg)） | 发起者**降级**（不再是超管）没建模——角色在模型里不变；它与退出是同一种「发起之后条件变了」，由场景 [S-42](../contract.md#s-42-边界在每条路径上都挡住) 承担 |
| [S-49](../contract.md#s-49-方向与落点矩阵逐格) | **任何路径都不把资产写进别人的租户级**：本人型复制与本人型分享只落发起者自己在 t2 的租户级 | `NoForeignTenantLanding`（落点是 B2 就记一次 `"foreign"`） | `LayerCheck = FALSE`（复制：[`Transfer_NoLayerCheck.cfg`](Transfer_NoLayerCheck.cfg)；分享：[`Transfer_NoLayerCheck_Share.cfg`](Transfer_NoLayerCheck_Share.cfg)） | 矩阵的其余各格（`layerNotAllowed` 的每一格、`recipientNotMember`、个人组织那几行）**没建模**——它们是发起时一次性的纯判定，没有交错；证据形式是[规范场景 S-51](../contract.md#s-51-方向矩阵逐格) |
| [S-22](../contract.md#s-22-确认复制) · [S-49](../contract.md#s-49-方向与落点矩阵逐格) | **落进一个组织的组织级只经那个组织的有效超管做出**：组织型复制只由目标超管确认；租户级的东西落不进别人的组织级 | `OrgLevelLandingByTargetAdmin`（确认者不是 t2 超管、或本人型把 A1 租户级的落进 t2 组织级，就记一次 `"orgbypass"`） | `ConfirmerCheck = FALSE`（[`Transfer_NoConfirmerCheck.cfg`](Transfer_NoConfirmerCheck.cfg)）。`LayerCheck = FALSE` 下 `OwnCopy("O2")` 也会记 `"orgbypass"`，**本版没有为这一路单列配置，不算作核对过** | 「超管从个人组织复制进本团队选组织级」那一格**没建模**：模型里没有个人组织（它不在树上、没有交错）；由场景 [S-51](../contract.md#s-51-方向矩阵逐格) 承担 |
| [S-9](../contract.md#s-9-分享此刻是否生效) · [S-12](../contract.md#s-12-流转边界团队资产不出那棵树) · [S-31](../contract.md#s-31-隶属解除分享在使用时失效不靠事件) | 跨组织的分享**只在此刻同树时**被使用；失效**不靠事件** | `UseInsideBoundary`（`Use` 时不同树就记一次 `"use"`） | `UseTimeCheck = FALSE`：使用只看一个由**可能丢失**的事件反应写下的标记（[`Transfer_NoUseTimeCheck.cfg`](Transfer_NoUseTimeCheck.cfg)） | 求值那一侧是否真的按 [S-9](../contract.md#s-9-分享此刻是否生效) 判——**模型假设它判**，这条前提归 `capability.asset-evaluation` |
| [S-9](../contract.md#s-9-分享此刻是否生效) · [S-32](../contract.md#s-32-成员关系解除复制执行不了已确认的不动) | 分享两端里是租户的那一端，**成员关系解除之后**分享不被使用（组织内分享 s3、本人型分享 o1） | `UseOnlyWhileMembersEffective`（`Use` 时某一端不是有效成员就记一次 `"ended"`） | `UseTimeCheck = FALSE`（[`Transfer_NoUseTimeCheck_Member.cfg`](Transfer_NoUseTimeCheck_Member.cfg)，反例走 `Leave("A1")`） | 同上一行 |
| [S-9](../contract.md#s-9-分享此刻是否生效) · [S-31](../contract.md#s-31-隶属解除分享在使用时失效不靠事件) · [S-32](../contract.md#s-32-成员关系解除复制执行不了已确认的不动) | **不复活**：一段分享在让它成立的那层关系断开之后，**永不再生效**——隶属重建、成员重新加入都一样 | 时序性质 `NoRevival`；它在使用点上的形式 `NoRevivedUse`（断过又接上之后被使用就记一次 `"revived"`） | `SinceCheck = FALSE`：去掉 S-9 的第三个合取项（[`Transfer_NoSinceCheck.cfg`](Transfer_NoSinceCheck.cfg) 反驳 `NoRevival`；[`Transfer_NoSinceCheck_Use.cfg`](Transfer_NoSinceCheck_Use.cfg) 反驳 `NoRevivedUse`） | **两个时刻可读、与确认时刻同源且严格递增是前提**——模型用一个只在建立隶属与重新加入时前进的逻辑时钟兑现它；契约里这条前提由 `capability.organization-governance/v3#S-7`、`#S-8` 与它的 `#S-42` 末行给出，本契约记在 [S-34](../contract.md#s-34-装配给的保证-vs-协议须给的保证) 的一行。**[S-9](../contract.md#s-9-分享此刻是否生效) 的两读先后（先关系、后时刻）被建模方式吸收**：`Use(s)` 在一步里原子地读全部状态，两读之间的交错在模型里不存在；证据形式是场景 [S-44](../contract.md#s-44-隶属解除之后分享失效复制留着不复活) 的读序一支 |
| [S-52](../contract.md#s-52-分享方删除资产或所有权易手分享随之结束) · [S-8](../contract.md#s-8-分享) | 分享方**删除**了那份资产、或把它**提升**到组织（所有权易手）之后，以它为资产的分享**不再是 `active`**，也**不再被使用** | 不变量 `SharingEndsWithSource`（`Gone(a)` 时以 a 为资产的记录都不是 `active`）；它在使用点上的形式 `NoUseAfterSourceGone`（资产已删除或易手之后被使用就记一次 `"gone"`） | `SourceEndCheck = FALSE`：删除与提升那一次提交里不写结束（[`Transfer_NoSourceEnd_Record.cfg`](Transfer_NoSourceEnd_Record.cfg) 反驳记录形式；[`Transfer_NoSourceEnd.cfg`](Transfer_NoSourceEnd.cfg) 反驳使用点形式） | 两个去保护配置给出的反例都走**删除**那一支；**提升那一支在版本目录里没有配置核对它**——`Promote` 守卫不看分享、`SourceEndCheck` 在提升那一步写结束，按构造成立，**不作证据**；这一支的证据只有规范场景 [S-53](../contract.md#s-53-分享方删除与提升分享随之结束)（此前一个不在版本目录、不登记的变体做过的核对，只是起草时的观察，不作证据）。结束**原因**（`sourceDeleted`／`ownerChanged`）与写下者不在模型里——两者都写成 `"ended"`；**提升不被分享挡住**在模型里是 `Promote` 的守卫不看分享，按构造成立；删除与提升之后被分享方的持有留着、删除前的告知——证据形式是场景 [S-53](../contract.md#s-53-分享方删除与提升分享随之结束) |
| [S-8](../contract.md#s-8-分享) | 撤销与移除是**终态**记录 | 动作性质 `EndedStable` | 无对应的有效性核对：守卫就是「记录为 `active` 才写」，去掉它是改模型，不是去掉一处契约保护 | **这一条只说明模型没写错，不单独作为证据**；证据形式是场景 [S-43](../contract.md#s-43-分享的建立跟随与结束) 的「不改写已有结束记录」一支 |
| [S-7](../contract.md#s-7-两类待确认件共用的过期语义) | 效果只来自一次确认（邀请产生的分享、组织型复制的落地） | `EffectsOnlyFromConfirmation` | 同上，按构造成立 | **不作为证据**：效果与终结记录写在同一个动作里，被建模方式吸收了。本人型不在此列——它按定义没有确认 |

**`TypeOK` 只约束模型自己变量的值域**，不绑任何条款。

## TLA+ 与 TLC

- **模型文件**：[`Transfer.tla`](Transfer.tla)。固定场景：三个团队组织 t1、t2、t3；两个账号 a、b 的四个租户身份——
  A1 = (t1, a) 超管、A2 = (t2, a) 普通成员、B1 = (t1, b) 普通成员、B2 = (t2, b) 超管；A1、B1 的成员关系会解除与重新建立。
  两份资产：x 在 t1 组织级，w 在 A1 的租户级。
  - 组织型复制通知 c1、c2：x → t2 组织级（**同源同落点，才测得出首次被判两次**）；
  - 组织—组织分享邀请 s1、s2：x → t2（**同一对，才测得出至多一份生效**）；组织内分享邀请 s3：w → B1；
  - 本人型复制 k1、k2：w → A2（发起即落地）；本人型分享 o1：w → A2（发起即成立）。
- **两组场景分开检查**（常量 `Scene`）：`"copy"` 只发起 c1、c2 与本人型复制，`"share"` 只发起 s1～s3 与本人型分享。
  两组共享同一个环境（隶属、成员关系、时间、资产移除）、彼此没有交互（删除与提升只在分享那一组里走：对复制那一组，它们让待确认件过期的效果与移除相同）——合在一起的状态空间超出登记任务的时限，**分开不丢任何一条性质的反例**。
- **语义映射**：

  | 模型里的 | 契约里的 |
  |---|---|
  | `Affiliate` / `Dissolve` | `capability.organization-governance/v3#S-32` / `#S-33`（环境动作）；`affSince` 是[隶属建立时刻](../contract.md#s-9-分享此刻是否生效)（无词条，`parentEstablishedAt`，那份契约的 `#S-7`，由 `#S-22` 带出）；解除时连值一起清掉，模型写成 0 |
  | `Leave` / `Rejoin` | 成员关系失效与恢复（同一租户身份，`data.identity-values/v1#S-26`；`capability.organization-governance/v3#S-29` / `#S-25`）；`effSince` 是成员关系生效时刻（无词条，`membershipEffectiveSince`，那份契约的 `#S-8`，由 `#S-59` 带出）；解除不清空，重新加入改写 |
  | `clock` | 与确认时刻同一时间源、在串行提交之间严格递增（[S-34](../contract.md#s-34-装配给的保证-vs-协议须给的保证)）。**只在建立隶属与重新加入时前进**：其余动作不需要比较时刻，这样取不丢反例 |
  | `Tick(o)` | 时间走过 `expiresAt` |
  | `src[a]` | 那份资产此刻怎样：`"held"` 是 [S-7](../contract.md#s-7-两类待确认件共用的过期语义) 的指向对象此刻存在；离开之后**不回来**——这正是[缺口 G-3](../contract.md#十一已知缺口) 要求实现兑现的前提，模型把它当作已兑现 |
  | `RemoveAsset(a)` / `DeleteAsset(a)` / `Promote` | 所有者那一层移除它 / `capability.asset-governance/v2#S-28` 删除 / 同一份契约的 `#S-27` 提升（A1 把 w 提升到 t1，要他此刻是有效成员；**守卫不看分享**）。后两者只在分享那一组里走；`SourceEndCheck` 时在同一步里写 `EndOf(a)`——[S-52](../contract.md#s-52-分享方删除资产或所有权易手分享随之结束) 的同提交 |
  | `Expired(o)` | `data.offer-expiry/v1#S-8` |
  | `SelfAndAncestors`、`ShareAncestor`、`PathLinks` | `data.identity-values/v1#S-14`、`#S-15`；`PathLinks` 是 [S-9](../contract.md#s-9-分享此刻是否生效)「连接二者的隶属关系」（两条含自身链的对称差） |
  | `Rel(s)`、`Stale(s)`、`Effective(s)` | [S-9](../contract.md#s-9-分享此刻是否生效) 的第二个合取项、第三个合取项的否定、生效 |
  | `ConfirmCopy(o, who)`、`ConfirmShare(o)`、`OwnCopy(tgt)`、`OwnShare(tgt)` 各是**一个不可分割的动作** | [S-18](../contract.md#s-18-确认是一次提交同一落点的确认序列化) 的同提交与同落点序列化（本人型是发起那一次提交） |
  | `ConfirmBegin` / `ConfirmEnd`、`OwnBegin` / `OwnEnd` | **没有** S-18 时必然存在的「读—写」窗口 |
  | `ConfirmRecheck => Ok(o)` | [S-17](../contract.md#s-17-每道准入现读确认时再判一遍) 的再判 |
  | `ConfirmerCheck => TargetAdmin(who)` | [S-22](../contract.md#s-22-确认复制) ② 的确认者判定 |
  | `LayerCheck => tgt = "A2"` | [S-49](../contract.md#s-49-方向与落点矩阵逐格) 的落点判定（`B2` 是别人的租户级，`O2` 是租户级落进别人的组织级） |
  | `Use(s)` 的守卫 | [S-9](../contract.md#s-9-分享此刻是否生效) 的使用时判定；`Materialize` 是 S-31 **禁止**的那种「靠事件记下已解除」 |
  | `EndSharing(s)`、`EndOf(a)` | [S-28](../contract.md#s-28-撤销分享) 撤销、[S-29](../contract.md#s-29-移除收到的分享) 移除与 [S-52](../contract.md#s-52-分享方删除资产或所有权易手分享随之结束) 的结束，合为一个终态 `"ended"`——它们只差写下者与原因 |

- **公平性与进展**：不带公平性假设，**不检查进展**。契约的进展性质都是有界的「不迟于 `expiresAt`」「下一次使用」，
  证据形式是规范场景（[S-39](../contract.md#s-39-两类待确认件的三种收场)、[S-43](../contract.md#s-43-分享的建立跟随与结束)、[S-44](../contract.md#s-44-隶属解除之后分享失效复制留着不复活)）。
  `NoRevival` 是**安全性的时序形式**（「断过之后一直不生效」），不依赖公平性。
- **检查输入**：

  | 配置 | 常量 | 检查什么 | 预期 | 登记为 formal task |
  |---|---|---|---|---|
  | [`Transfer.cfg`](Transfer.cfg) | 七个开关全 `TRUE`，`Scene = "copy"`，`MaxClock = 3` | `TypeOK`、`NoLateOrDoubleSettle`、`CopyLandsInsideBoundary`、`NoForeignTenantLanding`、`OrgLevelLandingByTargetAdmin`、`AtMostOneLineageTarget`、`EffectsOnlyFromConfirmation`；`SettledStable` | **本范围内无反例** | **是**：`asset-transfer-v2-transfer` |
  | [`Transfer_Share.cfg`](Transfer_Share.cfg) | 全 `TRUE`，`Scene = "share"`，`MaxClock = 2` | `TypeOK`、`NoLateOrDoubleSettle`、`UseInsideBoundary`、`UseOnlyWhileMembersEffective`、`NoRevivedUse`、`NoForeignTenantLanding`、`AtMostOneLiveSharingPerPair`、`EffectsOnlyFromConfirmation`、`SharingEndsWithSource`、`NoUseAfterSourceGone`；`SettledStable`、`EndedStable` | **本范围内无反例** | **是**：`asset-transfer-v2-share` |
  | [`Transfer_Revival.cfg`](Transfer_Revival.cfg) | 同上 | `NoRevival` | **本范围内无反例**（2026-09-24 由反例改为正例：G-4 已闭合） | **是**：`asset-transfer-v2-revival` |
  | [`Transfer_NoSameCommit_Settle.cfg`](Transfer_NoSameCommit_Settle.cfg) | `SameCommit = FALSE`，copy | `NoLateOrDoubleSettle`、`SettledStable` | **找到反例**：拆步确认的读—写之间过期 | 否（期望失败） |
  | [`Transfer_NoSameCommit_Lineage.cfg`](Transfer_NoSameCommit_Lineage.cfg) | `SameCommit = FALSE`，copy | `AtMostOneLineageTarget` | **找到反例**：两次本人型发起都读到「还没有」 | 否 |
  | [`Transfer_NoSameCommit_Sharing.cfg`](Transfer_NoSameCommit_Sharing.cfg) | `SameCommit = FALSE`，share | `AtMostOneLiveSharingPerPair` | **找到反例**：s1、s2 的两次拆步确认各建一份 | 否 |
  | [`Transfer_NoConfirmRecheck.cfg`](Transfer_NoConfirmRecheck.cfg) | `ConfirmRecheck = FALSE`，copy | `CopyLandsInsideBoundary` | **找到反例**：发起后解除隶属再确认 | 否 |
  | [`Transfer_NoUseTimeCheck.cfg`](Transfer_NoUseTimeCheck.cfg) | `UseTimeCheck = FALSE`，share | `UseInsideBoundary` | **找到反例**：解除隶属、事件反应没发生、照用 | 否 |
  | [`Transfer_NoUseTimeCheck_Member.cfg`](Transfer_NoUseTimeCheck_Member.cfg) | `UseTimeCheck = FALSE`，share | `UseOnlyWhileMembersEffective` | **找到反例**：分享方退出、照用 | 否 |
  | [`Transfer_NoSinceCheck.cfg`](Transfer_NoSinceCheck.cfg) | `SinceCheck = FALSE`，share | `NoRevival` | **找到反例**：解除隶属再重建，分享重新生效 | 否 |
  | [`Transfer_NoSinceCheck_Use.cfg`](Transfer_NoSinceCheck_Use.cfg) | `SinceCheck = FALSE`，share | `NoRevivedUse` | **找到反例**：同上，并被使用 | 否 |
  | [`Transfer_NoLayerCheck.cfg`](Transfer_NoLayerCheck.cfg) | `LayerCheck = FALSE`，copy | `NoForeignTenantLanding` | **找到反例**：本人型复制落进 B2 | 否 |
  | [`Transfer_NoLayerCheck_Share.cfg`](Transfer_NoLayerCheck_Share.cfg) | `LayerCheck = FALSE`，share | `NoForeignTenantLanding` | **找到反例**：本人型分享给 B2 | 否 |
  | [`Transfer_NoConfirmerCheck.cfg`](Transfer_NoConfirmerCheck.cfg) | `ConfirmerCheck = FALSE`，copy | `OrgLevelLandingByTargetAdmin` | **找到反例**：源侧超管替目标组织确认 | 否 |
  | [`Transfer_NoSourceEnd.cfg`](Transfer_NoSourceEnd.cfg) | `SourceEndCheck = FALSE`，share | `NoUseAfterSourceGone` | **找到反例**：本人型分享成立、分享方删除（或提升）那份资产、分享照用 | 否 |
  | [`Transfer_NoSourceEnd_Record.cfg`](Transfer_NoSourceEnd_Record.cfg) | `SourceEndCheck = FALSE`，share | `SharingEndsWithSource` | **找到反例**：同上，分享记录停在 `active` | 否 |

  全部关掉死锁检查：本模型不承诺进展。

- **有效性核对**（**三个正例配置与十三个去保护配置一起才成立**）：
  - 初始状态存在；关键路径可达——隶属可建可断可重建、成员可退可回、时间可走、资产可移除、可删除、可提升，所以守卫**不是**靠「没人动得了」成立的。
  - **十三个去保护配置都必须给出反例**，且反例轨迹要对得上上表写的那个局面；给不出，说明对应条款在本模型里是平凡的，**不能记作已验证**。
  - 七个开关**每一个**都至少有一个去保护配置；`SinceCheck` 的两个配置分别反驳时序形式与使用点形式——`NoRevival` 通过而 `NoRevivedUse` 失败（或反之）说明两种形式没对齐；`SourceEndCheck` 的两个配置同理（记录形式与使用点形式）。
- **规模**：三个组织、每类两份同源同落点的待确认件、两次本人型发起、`MaxClock` 复制 3／分享 2——每条反例需要的最小局面都在内
  （不复活的反例要一次建立、一次解除、一次重建，分享那一组 `MaxClock = 2` 已够）。**更大的规模是另一次检查**，结果按它自己的范围陈述。

TLA+ 描述行为规格，TLC 对给定模型进行检查；**在已检查范围内未发现反例，不自动成为任意范围的证明**。

## 版本与证据边界

模型与配置随本版本冻结（接受之后）；执行命令、原始输出与反例轨迹在版本外，入口是[验证入口](../../verification.md)。

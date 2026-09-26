# PF-003 资产的复制与分享 · 设计投影 v1

- 对应需求：[PF-003](../../README.md) 全部条款——资产复制的两条通则（本人型、组织型）、资产分享的四种（组织—组织、个人—个人、组织内、本人型）、复制血缘、方向矩阵与落层、团队资产不出那棵树、待确认件过期、关系解除之后与不复活、分享不可传递。**不含**：资产的形状、持有、配值、求值与创作发布（PF-002，见 [PF-002 投影](../../../PF-002-assets-settings-and-permissions/projection/README.md)）；组织、成员关系、隶属关系本身怎么建立与解除（PF-001，见 [PF-001 投影](../../../PF-001-identity-scope-and-agent-constraints/projection/README.md)的当前版本）；租户级 → 组织级的提升本身（PF-001 §6.7，资产治理的提升面；本投影只讲提升那一刻分享怎么收场）。
- 本版依据的需求修订：**PF-003 rev 5**（`README.md` front-matter `revision: 5`；方向矩阵、不复活、落层由产品负责人 2026-09-24 当场裁定，[D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#资产的复制与分享-pf-003-rev-5)）；相邻依据 PF-001 rev 17、PF-002 rev 20。
- 版本说明：**`post-review`**——相关节点已过五批 architecture-reviewer 独立评审，并按 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M49～M75 处置（HUB `6babe6e1`）。
- 状态：**未接受、未冻结**。契约全部 `candidate`，接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)（草案，未签）；节点设计接受待 [D-042](../../../../record/decisions/assets-runtimes-node-acceptance/README.md)（草案，未签）；主线裁定 D-040 §三～§八 的逐条追认留产品负责人。**本版所有来源都可能漂移**，据它实施之前逐项核 [provenance.json](provenance.json) 的坐标。
- 未决：契约缺口 **3** 条开着（`at` G-3、G-5、G-8）＋ `og2` G-7；节点缺口见[第 7 节](#7-未决项与已回询项)；产品负责人待裁 **1** 条（提升时分享怎么收场，按主线倾向先落）。

**读法**：第 1～4 节回答「必须为真的是什么」，来源是契约；第 5～6 节回答「用哪些原语兑现、有什么证据」，来源是节点。
条款坐标缩写：`at` = [`capability.asset-transfer/v1`](../../../../spec/capabilities/asset-transfer/v1/contract.md)，`og2` = [`capability.organization-governance/v2`](../../../../spec/capabilities/organization-governance/v2/contract.md)（**本投影的 og 一律指 v2**），`oe` = [`data.offer-expiry/v1`](../../../../spec/data/offer-expiry/v1/contract.md)（`accepted`，D-023），`am` = [`data.asset-model/v1`](../../../../spec/data/asset-model/v1/contract.md)，`ag` = [`capability.asset-governance/v1`](../../../../spec/capabilities/asset-governance/v1/contract.md)（只取被流转组合的几条），`iv` = [`data.identity-values/v1`](../../../../spec/data/identity-values/v1/contract.md)（`accepted`）。
节点缩写：**AGN** = [`packages/assets/asset-governance`](../../../../realization/packages/assets/asset-governance/design.md)，**OGN** = [`packages/tenancy/organization-governance`](../../../../realization/packages/tenancy/organization-governance/design.md#v2-修订候选尚未实现)（v2 修订段），**TH** = [`apps/tenancy-host`](../../../../realization/apps/tenancy-host/design.md#本程追加资产治理与模型档案目录的中心侧候选尚未实现)（本程追加段），**CLK** = [`packages/infra/clock`](../../../../realization/packages/infra/clock/design.md#实施缺口与消费者影响)。

## 1. 本版覆盖的需求条款

确认状态：rev 5 正文已定稿、随 PR #8 合入 main；**方向矩阵三条规则、落层、本人型不需确认、不复活为「已确认」**（产品负责人 2026-09-24，D-039）。另有三类，分开标：
**PM 推导**（[decisions §二](../../decisions.md#二pm-推导)：两类待确认件与分享关系是对象、血缘按层找）为「继承待核对」；
**主线裁定**（D-040，契约里写「主线裁定」的格）为「候选，待追认」；
**[decisions §三](../../decisions.md#三待裁决) 的一行待裁决**（提升时分享结束）为「候选假设，主线倾向先落」。
覆盖关系登记在 [`covers.json`](../../../../registry/README.md#covers)：PF-003 共 71 条，**全部 `reviewed: false`**。

| 需求 | 契约落点 | 确认状态与备注 |
|---|---|---|
| [§4 资产复制](../../design.md#资产复制)、[§6.3 两条通则](../../design.md#63-复制的通则同一自然人的两个租户身份) | `at#S-5`（复制通知）、`#S-13`（所有者决定哪一种）、`#S-20`～`#S-23`、`#S-49` 复制表 | 已确认。组织型两侧按各自组织的租户身份署名，账号恰好相同不构成本人型（主线 R2-3，`iv` CS-3 的读法） |
| [§4 分享](../../design.md#分享)、[§6.10](../../design.md#610-分享给的是获权不是拥有) | `at#S-6`（分享邀请）、`#S-8`（分享记录与四种）、`#S-24`～`#S-29`、`#S-49` 分享表 | 已确认 |
| [§4 复制血缘](../../design.md#复制血缘)、[§6.6](../../design.md#66-重复复制全量覆盖替换)、[§6.8](../../design.md#68-能力标识撞车但没有血缘) | `at#S-10`、`#S-11`；形状 `am#S-21`、`#S-22` | 「按层找」是 PM 推导（继承待核对） |
| [§5.2](../../design.md#52-边界是那棵隶属树不是单个组织)、[§6.1 不出那棵树](../../design.md#61-一条不变量团队资产不出那棵树) | `at#S-12`（三个时点）；判据 `iv#S-15`，读面 `og2#S-34` | 已确认。导出、另存模板等**其他出口**的 owner 须引 `at#S-12` 自证，本批没有这样的出口 |
| [§6.2 谁能流向谁](../../design.md#62-谁能流向谁)（矩阵、确认者、落层） | `at#S-49` 两张表、`#S-19` 的「谁能做」 | 已确认；**表里没有的组合一律拒绝** |
| [§6.4 可复制的对象](../../design.md#64-可复制的对象)、[§6.13 不可传递](../../design.md#613-分享不可传递) | `at#S-13`（判定次序与 `sourceNotOwned` 不分原因）、`#S-20` ② 已发布版本 | 已确认 |
| [§6.5 首次复制](../../design.md#65-首次复制)、[§6.7 配置不动](../../design.md#67-覆盖的范围内容覆盖配置不动) | `at#S-11` 写集合；经 `ag#S-46` 组合入口落地 | 已确认；`byAgent` 与每版 `publishedBy` 的取值是主线裁定（K38）与推导 |
| [§6.9 plugin](../../design.md#69-复制或分享一个-plugin) | `at#S-14`（内含随行、引用告知清单） | 已确认；告知清单受阻于 `at` G-5 |
| [§6.11 同步与自保](../../design.md#611-分享的同步与自保) | `at#S-8`（跟随当前版、无版本字段）；自保走 `ag` 配值面与 `at#S-29` | 已确认 |
| [§6.12 关系解除之后](../../design.md#612-关系解除之后)（含不复活） | `at#S-9`（三个合取项）、`#S-31`、`#S-32`；时刻 `og2#S-7`、`#S-8`、`#S-22`、`#S-59`、`#S-42` 末行 | **不复活已确认**（D-039）；落法（读两个持久时刻、不靠事件）是主线裁定 R2-1、R2-2 |
| 删除或提升被分享出去的资产 | `at#S-52`（`sourceDeleted`／`ownerChanged`）；`ag#S-27`、`#S-28` ④⑧ | 删除：主线 R2-4；**提升：decisions §三 待裁决**，按主线倾向 ① 先落（R2-7） |
| [§6.14 待确认件会过期](../../design.md#614-待确认的复制通知与分享邀请会过期)、[flows §3.4](../../flows.md#34-一份待确认的邀约复制通知与分享邀请同形) | `oe` 整块引用；`at#S-7` 补四格（`OfferState`、指向对象、存在性读面、失败值名） | 已确认 |
| [flows §四 角色与操作](../../flows.md#四角色与操作) | `at#S-19`「谁能做」 | 撤回、读、列表几格是**推导**（契约逐格标来源） |
| [§6.10 末句](../../design.md#610-分享给的是获权不是拥有)「成本按使用方的租户归属」 | **无契约落点** | 计量口径无 topic 认领（`og2` G-3 同一缺口）；本版不实施 |
| acceptance「B 已有上级再接受第二个」「成环」「单方面设下级」 | 归 PF-001 与 `og2#S-32` | 不在本投影；见 PF-001 投影 |

## 2. 涉及的领域对象

取自 [`domain_objects/objects.md`](../../../../domain_objects/objects.md)（带它的未裁）；契约给出的规格层名字与身份写在「落点」一列。

| 对象 | 领域含义 | 生命周期 | 落点 |
|---|---|---|---|
| [复制通知](../../../../domain_objects/objects.md#ul-copy-notice--复制通知) | 一次**组织型**复制确认之前的那份持久记录 | （无）→ 待确认 → 已确认（落地）· 结束（撤回／到期／资产没了）；本人型不产生它 | `at#S-5`，`CopyNoticeId`（不透明、不复用）；宿主正文未述（条目未裁），契约按一张独立的表持有 |
| [分享邀请](../../../../domain_objects/objects.md#ul-sharing-invitation--分享邀请) | 一次要对方点头的分享确认之前的那份持久记录 | 同上；本人型不产生它 | `at#S-6`，`SharingInvitationId`。**条目的未裁**「它的待确认与分享关系的待确认是一份还是两份」：契约给的是**两份记录**（邀请一张表、确认之后的分享另一张），见第 7 节「报给主线」 |
| [分享关系](../../../../domain_objects/objects.md#ul-sharing-relationship--分享关系) | 确认之后（本人型：发起之后）那份获权记录 | 分享中 → 结束（撤销／移除／关系断了／删除／提升）；**不复活** | `at#S-8`、`#S-9`，`SharingId`（形状 `am#S-22`，由本契约铸）；记录三值 `active`／`revoked`／`removed`，`dissolved` 是读时派生 |
| [资产](../../../../domain_objects/objects.md#ul-asset--资产)、[资产版本](../../../../domain_objects/objects.md#ul-asset-version--资产版本) | 被复制或分享的那份；复制产生的新记录有自己的版本线 | 见 PF-002 投影 | 形状 `am`；流转只经 `ag#S-46` 组合入口写 |
| [组织](../../../../domain_objects/objects.md#ul-organization--组织)、[租户](../../../../domain_objects/objects.md#ul-tenant--租户)（含成员关系） | 边界判据与两端的当事人 | 见 PF-001 投影 | `og2`；**v2 新增**：上级组织属性带隶属建立时刻（`og2#S-7`），成员关系记录带成员关系生效时刻（`og2#S-8`），两者无词条 |
| 复制血缘 | 目标侧那份与来源的对应 | 首次落地产生，`LineageId` 此后不变；另四项每次落地改写 | **不是对象**（词条形态「属性」）：`am#S-21` 的 `CopyLineage`；(源, 层) ↔ `LineageId` 的对应只在 `at` 内部 |
| 资产持有（`shared` 支） | 被分享方那一层对这份资产的持有 | 确认时能取则取，分享结束后**留着、不可用** | **不是对象**（词条形态「属性」）：`am#S-18`、`#S-19`；可用性按 `at#S-9` 在使用时判 |
| 尝试键登记（技术名，无词条） | (发起者, 尝试键) → 首次结果 | 与那一次写入同提交；保留期 `copy_attempt_key_retention` | `at#S-20` ⑦ |

## 3. 不变量、安全与进展

编号 INV／SAF／LIV 只在本投影内有效；性质权威在 [`at` 第七节](../../../../spec/capabilities/asset-transfer/v1/contract.md#七性质与前提)。「检查」列：TLC 指 run `2026-09-25-formal-assets-runtimes` 的三个任务，**规范场景 `at#S-39`～`#S-47`、`#S-50`、`#S-51`、`#S-53` 全部未开始**。

### 3.1 不变量

| 编号 | 内容 | 谁维护 | 检查 |
|---|---|---|---|
| INV-1 | 同一 (源记录, 落进的那一层) 至多一份带对应血缘的目标记录 | AGN：L-5 血缘哨兵 ＋ `lineage_correspondence` 主键 | TLC `AtMostOneLineageTarget`（`-transfer`）；D-6 未开始 |
| INV-2 | 同一 (资产, 被分享方) 至多一份此刻生效的分享 | AGN：L-5 同对哨兵（**派生谓词，不能写成唯一索引**） | TLC `AtMostOneLiveSharingPerPair`（`-share`）；D-5 未开始 |
| INV-3 | 终结记录与结束记录一经写下不改写 | AGN：L-6 待确认件行与 `sharing` 行的行锁，锁下重读 | TLC `SettledStable`；D-10～D-12 未开始 |
| INV-4 | 复制下来的记录：所有者 = 落进那一层的所有者，作者 = 落地的行为人，来源 `customized`，自己的版本线从 v1 起；**源侧一字节不动** | `at#S-11` 写集合，经 `ag#S-46` | 场景 `at#S-40`（未开始） |
| INV-5 | `LineageId` 不变，目标侧从任何读面拿不到源记录号 | AGN：对应只在 `lineage_correspondence`，只由流转模块读写 | 场景；结构检查能否写成未定（AGN N-9，C-2） |

### 3.2 安全性质（绝不能发生）

| 编号 | 内容 | 谁维护 | 检查 |
|---|---|---|---|
| SAF-1 | 团队资产出树：复制只在复制边界成立时落地（发起、确认同提交），跨组织分享只在此刻同树时被使用 | `at#S-12` 三个时点；AGN X-1（L-1 隶属哨兵下事务内读上级链） | TLC `CopyLandsInsideBoundary`、`UseInsideBoundary`；D-4 未开始 |
| SAF-2 | 任何路径把资产写进别人的租户级 | `at#S-49` `targetLayerNotSelf`（纯值，先于任何读）；组织内分享只经那个租户本人确认 | TLC `NoForeignTenantLanding`；场景 `at#S-51` |
| SAF-3 | 组织级的落地没经目标组织的有效超管 | `at#S-22` ②；本人型落组织级要发起者是目标组织有效超管 | TLC `OrgLevelLandingByTargetAdmin` |
| SAF-4 | 过期、已撤回、已确认的待确认件被确认后产生效果 | 同提交重判（`oe#S-10`），三路同收 `offerNoLongerValid` | TLC `NoLateOrDoubleSettle`；场景 `at#S-39` |
| SAF-5 | 一段结束的分享在关系重新接上后复活 | `at#S-9` 第三个合取项（读两个持久时刻），不靠事件、不靠「首次读到失效写终态」 | TLC `NoRevival`（`-revival`）；**同一毫秒那一支受阻于 C-15** |
| SAF-6 | 复制冲掉落点那一层的配值（含 `immutable`）、持有或同名自有组件 | `at#S-11`：`overwritten` 只发布版本、只改血缘四项；撞标识无血缘是新增 | 场景 `at#S-40`、`#S-41`（模型里是 `UNCHANGED`，不作证据） |
| SAF-7 | 被分享来的被再分享、复制出去或提升 | `at#S-13` `notTransitive`／`sourceNotOwned`；提升由 `ag` 的所有者判定挡 | 场景 `at#S-42`、`#S-50` |
| SAF-8 | 删除或提升之后那段分享仍生效 | `at#S-52`：同一次提交写 `revoked`；写不下去则删除／提升整次失败 | TLC `SharingEndsWithSource`（只核删除一支）；提升一支只有场景 `at#S-53`；F-2 未开始 |
| SAF-9 | 本人型复制的重试多发布一个版本 | 带尝试键：登记与落地同提交，重放认回首次结果 | 场景 `at#S-40` 尝试键一支（模型不看版本数） |
| SAF-10 | 落地留下部分效果（记录建了通知还悬着，或反之） | `at#S-18`：同一提供者、同一存储、同一事务 | F-1 未开始 |
| SAF-11 | 读不到被当成「不存在／不在树上／不是他的／不是成员／没断过」 | `at#S-16`、各操作 ⑧、`#S-35` | 场景 `at#S-47`（故障注入，未开始） |

### 3.3 进展性质（都有界）

| 编号 | 内容 | 前提（及前提失效时的责任方） | 检查 |
|---|---|---|---|
| LIV-1 | 未确认未撤回的待确认件不迟于 `issuedAt + offer_ttl` 不可确认，**不依赖定时器** | 时间源同源、可用、`now` 不后退（`oe#S-17`；CLK） | 场景 `at#S-39` |
| LIV-2 | 指向的资产被移除或删除后，下一次读即 `expired` | 存在性读面能辨持有实例（`at` G-3 未闭合；AGN 以 `since` 严格递增兑现，依赖 C-15） | 场景 `at#S-45`，「移除后再持有」一支闭合前照原样记失败 |
| LIV-3 | 落地、分享方发新版之后，落点／被分享方下一次求值用到新内容 | 求值取持有记录当前发布的那一版（`am#S-18` 第 6 条；PF-002 投影） | 场景 `at#S-43` |
| LIV-4 | 撤销、移除、隶属解除、成员退出之后，被分享方下一次使用被拒 | 求值一方按 `at#S-9` 现读（`capability.asset-evaluation` PRE-2，**责任方在 PF-002 投影**） | 场景 `at#S-43`、`#S-44`、`#S-50` |
| LIV-5 | 被拒的操作立即返回具名值、不留部分效果 | 单次提交原子（存储 R-1） | — |

**表 A「有前提地能」逐条**（契约写明前提与责任方）：

| 性质 | 前提 | 前提失效时的责任方 |
|---|---|---|
| `at#S-9`、`#S-31`、`#S-32`（不复活，含同一毫秒） | 分享确认时刻、隶属建立时刻、成员关系生效时刻取自同一时间源且**先后两次串行提交写下的时刻不相等**（`og2#S-42` 末行、`at#S-34`） | CLK 缺口 **C-15**（下一程实施）；闭合前 AGN README 把三条标「有前提：C-15」 |
| `at#S-7` 存在性第三个合取项 | 持有能区分「发起时那一份」与「移除后再持有的那一份」 | 契约 `at` G-3（owner `am`／`ag`）；AGN 以 `pointed_holding_since` ＋ `since` 严格递增兑现，同样依赖 C-15 |
| `at#S-18`、`#S-52` 同提交；X-1～X-3 | 资产提供者、OG、P-1 解析到**同一个** `storage`、同一个库，不用 `isolate` | TH（装配给；结构检查 TH-1 是实现后第一波必跑项） |
| `at#S-9` 在求值处成立 | 组输入一方按 `at#S-9` 判 shared 持有 | `capability.asset-evaluation`（PF-002 投影） |
| `at#S-11` 的 `byAgent` | 调用上下文如实给「是不是 agent 产出」 | **本版不能**：进程内无调用者、入口 v1 不投影（AGN N-6，入口契约 v2）；缺了不得默认 `false` |

## 4. 业务规则（开发者不该自己决定的，这里都有）

### 4.1 贯穿全部操作

- **失败值闭合集合**（`at#S-19` 总表）：`invalidInput`、`notPermitted`（**权限**：行为人自己的资格与角色）、`outsideTree`、`targetLayerNotSelf`、`layerNotAllowed`、`recipientNotMember`、`sourceNotOwned`、`versionNotPublished`、`officialNotTransferable`、`notTransitive`（**结构**：与角色无关，超管来做也同一个答案）、`noticeNotFound`／`invitationNotFound`／`sharingNotFound`（**定位**：找不到或无权看见，不泄漏存在性）、`offerNoLongerValid`（确认路径，过期／已撤回／已确认三路同值）、`alreadyConcluded`（撤回路径，已确认或已过期）、`unavailable`。**没有「其他」**。
- **缺席时的默认答案**（`at#S-16`）：一律拒绝或明确失败。**身份参数没有默认值**（`TenantId`、`OrganizationId`、`ScopeLayerIdentity`、`AssetRecordId`、三种标识，缺席即 `invalidInput`，不从当前租户身份或进程上下文补）；**落点与被分享方也一样**——「普通成员只落自己的租户级」是判定结果，不是落点缺席时的默认。带默认值的非身份参数**穷举三项**：有效时长（缺席按该类默认 `offer_ttl`；非法即 `invalidInput`；本人型一支不读它）、`listSharings` 的过滤（缺席只要此刻 `active` 的，写死）、尝试键（缺席即「本次不去重」）。
- **三类不合并**：判定得出不放行 ⇒ 具名拒绝；判定**做不出来**（存储、成员资格、组织读面、上级链、两个时刻、时间源、资产治理读面任一读不到）⇒ `unavailable`；输入不构成这个请求（含**复制落点在发起者自己的组织里、分享给自己的组织或自己这个租户**）⇒ `invalidInput`，在任何判定之前。
- **判定次序**（`at#S-49` 末段，各操作 ⑥ 照此排；同一输入同一答案）：`invalidInput` → `targetLayerNotSelf`（纯值，**不读任何记录**）→ 发起者成员资格 → `at#S-13`（记录不存在 `sourceNotOwned` → 官方件 `officialNotTransferable` → 归团队组织而他不是超管 `notPermitted` → 所有者在他一侧而那一层不持有 `sourceNotOwned` → 其余：他或他的组织是某份分享的被分享方 `notTransitive`，否则 `sourceNotOwned`）→ 版本 → `outsideTree` → `layerNotAllowed` → 落点一侧的成员资格与角色（`recipientNotMember`、`notPermitted`）。**边界先于层**。
- **每道准入现读，确认时再判一遍**（`at#S-17`）：再判失败 ⇒ 待确认件**保持原状**（不写终结记录、仍可撤回、照常过期；条件恢复后仍可确认）。本人型没有确认，全部判定与落地在发起那一次提交里。
- **事件**：流转**不发任何自己的事件**（`at#S-33`），也不订阅任何事件；分享结束**不通知**，被分享方经 `listSharings` 读结束原因。落地与持有变化由 `ag` 的 `AssetPublished`、`HoldingChanged` 承载（通知，`emit`）。**不发任何停止信号**（`at#S-36`）：撤销、移除、解除、退出只影响下一道准入。

### 4.2 方向与落点（`at#S-49`；表里没有的组合一律拒绝，不自行补一格）

**复制**（发起者 = (Os, a)，落点组织 Ot）：

| 源 | 落点 | 结果 |
|---|---|---|
| 他的（个人组织里的，或团队 Os 里他租户级的） | 他自己在 Ot 的租户级 (Ot, a) | **本人型**，发起即落地；(Ot, a) 须此刻有效，否则 `notPermitted` |
| 他个人组织里的 | 团队 Ot 的组织级 | **本人型**，发起即落地；**(Ot, a) 须是 Ot 的有效超管**，否则 `notPermitted` |
| 团队 Os 里他租户级的 | 另一个组织的组织级 | `layerNotAllowed` |
| 团队 Os 组织级的 | 同树团队 Ot 的组织级 | **组织型**：复制通知，Ot 的超管确认后落地；发起者须是 Os 的超管 |
| 团队 Os 组织级的 | 任何租户级 | `layerNotAllowed` |
| 任何 | 另一个组织里别人的租户级 | `targetLayerNotSelf` |
| 任何 | 发起者自己组织里的任何一层 | `invalidInput` |

**分享**（被分享方所在组织 Or）：

| 源 | 被分享方 | 结果 |
|---|---|---|
| 团队 Os 组织级的 | 同树团队 Or（组织） | **组织—组织**：邀请，Or 的超管确认；发起者须是 Os 的超管 |
| 团队 Os 组织级的 | 任何租户 | `layerNotAllowed`（别的组织里别人的先收 `targetLayerNotSelf`） |
| 他个人组织里的 | 另一个个人组织 | **个人—个人**：邀请，对方账号本人确认 |
| 他个人组织里的 | 一个团队组织（组织） | `layerNotAllowed`（个人 → 团队组织级只有复制） |
| 他个人组织里的 | 他自己在团队 Or 的租户级 | **本人型**，发起即成立；(Or, a) 须此刻有效 |
| 团队 Os 里他租户级的 | 本组织另一个成员 (Os, x) | **组织内分享**：邀请，那个租户本人确认；(Os, x) 须此刻有效，否则 `recipientNotMember` |
| 团队 Os 里他租户级的 | 他自己在同树团队 Or 的租户级 | **本人型**，发起即成立 |
| 团队 Os 里他租户级的 | 另一个组织（组织） | `layerNotAllowed`（不同树或个人组织先收 `outsideTree`） |
| 任何 | 另一个组织里别人的租户级 | `targetLayerNotSelf` |
| 任何 | 发起者自己的组织，或他自己这个租户 | `invalidInput` |

**边界判据**（`at#S-12`）：复制边界 = `s ≠ t ∧ t 存在且是团队组织 ∧ (s 是个人组织 ∨ shareAncestor(s, t))`；分享边界 = `o ≠ t ∧ t 存在 ∧ (两者都是个人组织 ∨ o 个人 t 团队 ∨ 两者团队且 shareAncestor)`。团队 → 任何个人组织两式都不放行（租户级的也一样）。`shareAncestor` 用 `og2#S-34` 那一支求，**不自己从链上算**；落点组织不存在 ⇒ `outsideTree`；**读不到 ≠ 不存在**（截断的链算出的「不同树」不得当越界交上去）。

### 4.3 发起复制 `issueCopyNotice`（`at#S-20`）

- **输入**：发起者 `TenantId` (Os, a)、源 `{AssetRecordId, 版本号}`、落点 `ScopeLayerIdentity`、可选时长、可选尝试键 `attemptKey`。
- **失败集合（次序）**：`invalidInput` → `targetLayerNotSelf` → `notPermitted`（源侧成员资格）→ **带键且键已登记 ⇒ 认回，不再往下判** → `sourceNotOwned`·`officialNotTransferable`·`notPermitted`（组织级而非超管）·`notTransitive` → `versionNotPublished`（草稿不可复制）→ `outsideTree` → `layerNotAllowed` → `notPermitted`（本人型：落点侧自己的成员资格与角色）；任一步读不到 ⇒ `unavailable`。失败集合不因尝试键增减。
- **提交点**：**本人型**单次提交落地——全部判定 ＋ 首次／重复判定（`at#S-10`）＋ `at#S-11` 写集合（行为人 (Ot, a)），不写任何待确认件，返回 `landed{CopyOutcome}`。**组织型**单次提交写一份复制通知，`OfferTiming` 在提交内定死，记下发起时所有者那一层那份持有与 `byAgent`；不求过期判定式，但「所有者那一层此刻持有它」在提交内现读；返回 `pending{CopyNoticeId}`。两支带键时，登记与这一次写入**同一次提交**。源是 plugin 时另带告知清单（引用一支本版按空处理，G-5）。
- **幂等**：带键 ⇒ 同一 (发起者, 键) 在保留期内重放返回首次结果、什么都不写（本人型不多发布版本，组织型不多一份通知）；重放时其余输入不同也认回首次；首次被拒或失败时不登记；过期同键是新发起。**两支都认回**。不带键：组织型每次一份新通知；本人型按血缘判为重复、再发布一个内容相同的新版本——**要认回，就带键**。
- **缺席**：读不到键登记 ⇒ `unavailable`，**不得当成「没见过这个键」去落地**；组织型调用上下文缺 `byAgent` ⇒ 发起即 `unavailable`、不写通知（M27）；本人型缺 `byAgent` ⇒ 落地以 `unavailable` 收。

### 4.4 首次、重复与落地写集合（`at#S-10`、`#S-11`）

- **先定层，再在那一层里找**：`重复(r, L) ≝ 对应(r, L) 存在 ∧ 它指向的目标记录此刻存在且仍归 L 的所有者`。判据只看血缘，**不看能力标识**；别的层里有一份不影响。目标记录被删除或被提升离开那一层 ⇒ 下一次按首次、铸新 `LineageId` 并改指对应；提升上去的那一份此后不再被任何复制更新。
- **`created`**（同一次提交）：① 新记录——所有者 = 落进那一层的所有者，作者 = 落地的行为人（本人型 (Ot, a)，组织型**确认的那位超管**），`byAgent` = 发起那次调用的上下文（组织型取通知上记下的那项，确认者不改它），来源 `customized`，能力标识与源相同，带新血缘；② 它的 v1，内容整体等于源那一版；③ 那一层此刻**没有**这个能力标识的持有 ⇒ 取持有（basis `owned`），**已有 ⇒ 不动那份持有**，新记录不取持有，并在返回里告知「同一能力标识下现在有两份」。
- **`overwritten{newVersion}`**：在目标记录上发布新版本（内容整体等于源那一版，版本号接着它自己的线），**只改写血缘四项**（`sourceVersion`、`importedBy`、`importedAt`、`imports+1`）；**不碰任何持有、任何配值（含 `immutable`）**；`byAgent` 不写。
- 每版 `publishedBy` = 落地的行为人（推导）；`importedBy` = 落进那一侧的租户身份，不是源侧那个。**源侧什么都不动**。

### 4.5 撤回复制通知 `withdrawCopyNotice`（`at#S-21`）

- 谁：发起者本人（源组织成员资格有效），或源组织的任一有效超管（推导）。
- 失败次序：`invalidInput` → `noticeNotFound`（不存在或不属于那两类人）→ `notPermitted`（撤回者此刻不是源组织有效成员）→ `alreadyConcluded`；读不到 ⇒ `unavailable`。
- 提交：单次提交**先现读一次过期判定**：`pending` ⇒ 写 `withdrawn`（带撤回者与时刻）；其余不写。已 `withdrawn` ⇒ `ok`；已确认或已过期 ⇒ `alreadyConcluded`、**不写终结记录**。时间源或存在性读面读不到 ⇒ `unavailable`，**不得据读不到判成已过期**。本人型没有可撤的通知。

### 4.6 确认复制 `confirmCopy`（`at#S-22`）

- 前置：确认者的组织**就是**目标组织，有效且是超管；通知求值为 `pending`（**在落地的同一次提交内求**）。**再判**：发起者仍是源组织的有效超管（推导，N-18）；复制边界仍成立。
- 失败次序：`invalidInput` → `noticeNotFound`（不存在，或确认者的组织不是目标组织）→ `notPermitted`（确认者不是目标有效超管）→ `offerNoLongerValid`（三路同值）→ `notPermitted`（发起者已不是源组织有效超管）·`outsideTree`（再判）；读不到 ⇒ `unavailable`。
- 提交：**单次提交**——过期重判 ＋ 再判 ＋ 首次／重复判定 ＋ `at#S-11` 写集合（行为人 = 确认者）＋ 终结记录 `accepted`（带确认者、时刻、`CopyOutcome`），全部同时成立；受同一 (源记录, 目标组织级) 序列化约束。再确认同一份 ⇒ `offerNoLongerValid`、无第二份效果；**再判失败不写任何东西**，通知仍 `pending`。
- **读不到不得落地，也不得说成越界**。确认之前读 `readCopyNotice` 的目标侧投影，知道自己点头的是「用这一版整个盖掉我们这份」还是首次。

### 4.7 读复制通知 `readCopyNotice`（`at#S-23`）

- 谁：发起者本人、源组织与目标组织的有效超管；其余 `noticeNotFound`（成员资格读不到 ⇒ `unavailable`，**不得收成 `noticeNotFound`**）。
- **两种投影**：源侧（发起者、源组织超管）= 全部字段 ＋ 此刻 `OfferState` ＋ 已确认时的 `CopyOutcome`。**目标侧** = `CopyNoticeId`、**源组织的 `OrganizationId`**（R2-6）、能力标识、源版本号、**那一版的内容**、`OfferTiming`、此刻 `OfferState`、**此刻确认会是首次还是重复**（重复时带被覆盖的那份目标记录号）、已确认时的 `CopyOutcome`；**不含源记录号、源资产的其余版本与草稿、源侧发起者租户身份**。
- 派生状态与首次／重复都在本次读的时点求，**不得缓存复用**；读不到不得填 `pending`、不得判成 `expired`。

### 4.8 发起分享 `issueSharingInvitation`（`at#S-24`）

- 输入：发起者 `TenantId`、`AssetRecordId`（**不带版本**）、被分享方 `ScopeLayerIdentity`、可选时长。
- 前置：发起者成员资格有效；资产是他一侧的现有资产（归他本人，或归他的组织——团队组织要他是超管）；**至少有一个已发布版本**；跨组织时分享边界成立；矩阵有路；组织内分享的接收者此刻是本组织有效成员；本人型那个租户此刻有效。
- 失败次序：`invalidInput` → `targetLayerNotSelf` → `notPermitted`（成员资格）→ `sourceNotOwned`·`officialNotTransferable`·`notPermitted`·`notTransitive` → `versionNotPublished` → `outsideTree` → `layerNotAllowed` → `recipientNotMember`·`notPermitted`（本人型那一侧）；读不到 ⇒ `unavailable`。
- 提交：**本人型**单次提交成立——新建或认回分享（确认者 = 发起者，确认时刻 = 本次提交时刻，无邀请）＋ 那个租户层此刻没有这个能力标识的持有 ⇒ 取持有（basis `shared`、带 `SharingId`、恒 `current`，经 `ag#S-30` 带 `sharing`），已有 ⇒ 不动；返回 `effective{SharingId, 是否取得了持有}`；持有写入失败 ⇒ 整次失败、不建分享。**其余三种**单次提交写一份邀请，返回 `pending{SharingInvitationId}`。
- 幂等：要点头的三种**不幂等**（多份邀请的第二份被确认时认回同一份生效的分享）；本人型幂等（同对已有生效的一份 ⇒ 认回、返回同一个 `SharingId`）。组织内分享要给几个人就分享几次。

### 4.9 撤回分享邀请 `withdrawSharingInvitation`（`at#S-25`）

- 谁：发起者本人（有效成员），或资产此刻归分享方组织时该组织的有效超管。失败次序：`invalidInput` → `invitationNotFound` → `alreadyConcluded`；读不到 ⇒ `unavailable`。其余同 4.5。

### 4.10 确认分享 `confirmSharing`（`at#S-26`）

- 前置：被分享方是组织 ⇒ 确认者的组织就是它、有效且是超管；是租户 ⇒ 确认者**就是那个租户**、有效。邀请 `pending`，同提交重判。**再判**：发起者仍有权分享（按资产**此刻**的所有者：归团队组织要他仍是超管，归他本人要他仍是有效成员）；跨组织时边界仍成立。
- 失败次序：`invalidInput` → `invitationNotFound`（不存在，或确认者不是能确认它的人）→ `notPermitted`（确认者资格）→ `offerNoLongerValid` → `notPermitted`（发起者已无权）·`sourceNotOwned`·`outsideTree`（再判）；读不到 ⇒ `unavailable`。
- 提交：**单次提交**——过期重判 ＋ 再判 ＋ **新建或认回**分享（新建时确认时刻 = 本次提交时刻）＋ 被分享方那一层此刻没有这个能力标识的持有 ⇒ 取持有（`shared`、`current`，组织格或租户格），**已有 ⇒ 不动**（不静默替换对方已选用的）＋ 邀请写 `accepted`。返回 `SharingId` ＋「是否取得了持有」。
- **认回规则**：同对已有一份**此刻生效**的 ⇒ 认回那一份、邀请照写 `accepted`；已有的那份记录仍 `active` 但**已不生效**（关系断过）⇒ **不认回，新建一份**（新的一段）。

### 4.11 读分享邀请 `readSharingInvitation`（`at#S-27`）

- 谁：发起者本人；资产此刻归分享方组织时该组织有效超管；被分享方一侧能确认它的人。其余 `invitationNotFound`。返回全部字段 ＋ 此刻 `OfferState` ＋ 已确认时的 `SharingId`，**两端同一个投影**。其余同 4.7。

### 4.12 撤销分享 `revokeSharing`（`at#S-28`）

- 谁：发起者本人（有效成员），或资产此刻归分享方组织时该组织的有效超管。失败：`invalidInput` → `sharingNotFound`；读不到 ⇒ `unavailable`。
- 提交：记录为 `active`（含派生 `dissolved`）⇒ 写 `revoked`（撤销者、时刻、原因 `sharerRevoked`），单次提交；**不碰被分享方的任何持有与配值**。已结束 ⇒ `ok`、不改写已有结束记录。向后生效。

### 4.13 移除收到的分享 `removeShared`（`at#S-29`）

- 谁：被分享方是组织 ⇒ 它的有效超管；是租户 ⇒ 那个租户本人（谁确认谁移除）。失败：`invalidInput` → `sharingNotFound` → `notPermitted`；读不到 ⇒ `unavailable`。
- 提交：**单次提交**——记录 `active` ⇒ 写 `removed`，**并且**被分享方那一层若以 `shared` 持有它 ⇒ 经 `ag` 的 `unhold` 移除那份持有，配值随之消失。已结束 ⇒ 不改写结束记录，但那份 shared 持有还在就照样移除、返回 `ok`（清残留走这条）。

### 4.14 列出组织的分享 `listSharings`（`at#S-30`）

- 谁看得见哪一项：被分享方是该组织 ⇒ 任一有效成员；被分享方是该组织某租户 ⇒ 只有那个租户本人；分享方是该组织 ⇒ 只有超管；分享方是该组织某租户 ⇒ 只有那个租户本人（**超管看不到组织内分享**）。
- 每项：`SharingId`、分享方、被分享方、`AssetRecordId`、能力标识（资产已删除 ⇒「已删除」）、确认时刻、此刻 `SharingState`（读时求）；`revoked` 带结束原因 `sharerRevoked`／`sourceDeleted`／`ownerChanged`。
- 失败：`invalidInput` → `notPermitted`；任一读不到（含两个时刻）⇒ `unavailable`，**不得返回空列表或少几项的列表，不得把求不出的判成 `dissolved` 或 `active`**。

### 4.15 列出收到的待确认件 `listPendingForOrganization`（`at#S-48`）

- 输入：调用方 `TenantId`、**接收的那一层** `ScopeLayerIdentity`。组织 ⇒ 调用方是它的有效超管；租户 ⇒ 调用方就是那个租户。
- 返回：组织 ⇒ 目标是它、此刻 `pending` 的复制通知与被分享方是它、此刻 `pending` 的分享邀请；租户 ⇒ 被分享方是它的 `pending` 分享邀请。每项只带类别、标识与 `OfferTiming`，内容按标识再读。可为空。失败 `invalidInput` → `notPermitted`；读不到 ⇒ `unavailable`，不得返回残缺列表。本人型永远不出现在这里。

### 4.16 分享此刻是否生效（`at#S-9`，给求值、`listSharings`、确认认回共用的判据）

```text
生效(s) ≝ 记录 = active ∧ 关系此刻成立(s) ∧ 关系自确认以来未断过(s)
关系此刻成立(s)       ≝ (Os = Or ∨ 分享边界(Os, Or)) ∧ (分享方是租户 ⇒ 此刻有效) ∧ (被分享方是租户 ⇒ 此刻有效)
关系自确认以来未断过(s) ≝ (Os ≠ Or ∧ 都是团队 ⇒ 连接二者的每条隶属关系的建立时刻 ≤ s 的确认时刻)
                       ∧ (分享方是租户 ⇒ 成员关系生效时刻 ≤ 确认时刻) ∧ (被分享方是租户 ⇒ 同上)
```

- **连接二者的隶属关系**：两条含自身上级链的对称差里、各自走到最近共同上级为止的每一条；共同上级以上的不算。
- **读序**：① 先求边界、上级链与租户那一端此刻有效；② **再**为链上每个组织读隶属建立时刻、为租户那一端读成员关系生效时刻。读到的上级不是 ① 链上那个（含已没有上级）、或那一端已不在默认档 ⇒ **按「断过」判**，不是「读不到」。**单机在一次可串行化的读里取齐 ① 与 ② 即满足**。
- **读不到分享记录、边界或任一时刻 ⇒ 不可用**，不当可用、也不当「持有不存在」；**v1 写下的存量记录没有时刻 ⇒ 不可用**（`og2` 不补时刻，第 7 节 V2-3）。
- 按 (资产, 被分享方) 判，不按持有上记的 `SharingId`；被分享方组织里租户格以 `organization` 支持有同一份的，随组织那份一起判。个人—个人那一种两个合取项恒真，不必读时刻。

### 4.17 删除或提升被分享出去的资产（`at#S-52`；由 `ag#S-27`、`#S-28` 发起）

- 同一次提交里，以该资产为资产、记录 `active`（含派生 `dissolved`）的全部分享写 `revoked`：删除 ⇒ 原因 `sourceDeleted`；提升 ⇒ 原因 `ownerChanged`（**产品待裁，主线倾向先落**）；写下者 = 删除／提升的人，时刻 = 那次提交。已结束的不改写。**分享那一步写不下去 ⇒ 删除／提升整次 `unavailable`**；删除／提升被拒 ⇒ 分享一条不动。
- **提升不被分享挡住**；被分享来的不能被提升（提升要求所有者是调用方本人）。
- **不动**：被分享方那一层的 `shared` 持有与配值留着、不可用（删除后读到「已删除」）；删除之前的告知照旧（`ag#S-28`）；指向该资产的待确认件**不必写**——存在性已为假，派生 `expired`。

### 4.18 关系解除之后（`at#S-31`、`#S-32`）

- 隶属解除：此前靠它成立的分享在**使用时**失效（`dissolved` 读时算出，**没有一条被写下的「已解除」记录**，不对 `affiliation.dissolved` 做任何写入反应）；复制下来的**留着**。重新隶属 ⇒ **不复活**，要用就再分享、再确认（新的 `SharingId`）；旧记录仍 `active`、永远 `dissolved`，可被撤销或移除。
- 成员退出：组织型通知悬着而发起者退出或降级 ⇒ 确认时再判 `notPermitted`、不落地，源组织其他超管可撤回，否则等过期；分享邀请悬着而发起者退出 ⇒ 同理；组织内邀请的接收者退出 ⇒ 他确认不了；**分享方或被分享方是租户而他退出 ⇒ 这段分享结束**（派生 `dissolved`），重新加入不复活；他的租户级资产不删不迁，**所以指着它的待确认件不因他退出而过期**。

## 5. Cordis 建模

来源：AGN、OGN（v2 段）、TH（本程追加段）、CLK。插件名、服务名、方法名、表名、列名**一律候选**；**三个节点的相关部分都没有源码**。Cordis 4.0.4（D-025）。

### 5.1 插件与服务面

| 插件（节点） | provide | inject | 独立成插件的理由 |
|---|---|---|---|
| `asset-governance`（AGN，一个插件、一条 fiber） | 四个面：`assets`、`asset-holdings`（归 PF-002 投影）、**`asset-transfer`**（`at` 十二个操作：S-20～S-30、S-48）、`asset-snapshot`（无契约条款，两份读面在一次读事务里的投影） | `storage`、`clock`、`memberships`、`organizations`（钉 v1 服务名，只给 `ag` 直接入口用），四个都必需 | 治理与流转五处同一提交（复制确认、分享确认、资产没了使邀约过期、移除、删除与提升结束分享）必须在一个 owner 里；内核不提供跨 fiber 事务（D-039 候选 B、提案 N-1） |
| `organization-governance`（OGN，v2 修订） | v1 四个面不变 ＋ `organizations-v2`、`memberships-v2`（**本版无人 inject**） | 不变 | 同一实例服务两版；v1 消费者不动 |
| `clock`（CLK） | `clock`（全进程一份） | `storage` | 不变；C-15 待实施 |

- **流转读 OG 的事实不走服务面**：AGN 以**包依赖**调 OG 导出的事务内读入口 `./tx-reads`（取隶属哨兵、按序锁组织行、读组织的变体／上级／隶属建立时刻、读成员关系的有效性／角色／生效时刻），在自己的写事务里调——`core/storage` 协议不许在本插件事务里调 OG 服务面。**所以中心进程里没有「运行时代行」主体**（`at#S-34`、`og2#S-42` 那一行的装配给列：同一存储内一次可串行化读即满足，M59）。
- **组合入口（`ag#S-46`）不在任何面上**：是插件内部写函数；公开方法签名里没有 `lineage`、`sharing` 两个输入（类型测试 C-4）。
- **不用 `isolate`**：租户、组织之间的差别全是数据（basis `isolate-hides-instances-not-data`）；给资产提供者另一个 `storage` 会让 X-1～X-3 的锁落在两个库里（TH 反证）。

### 5.2 inject 关系与重跑

- OG 或 `storage`、`clock` 换代 ⇒ 本插件重跑（basis `plugin-body-reruns-on-provider-change`）；插件体只校验 config、登记官方件、provide，可重跑；**全部事实在存储里**，重启不改变任何判定（`at#S-37`）。缺席 ⇒ `PENDING`（basis `inject-has-no-optional-form`）。
- `./tx-reads` 是包依赖，不是 inject：OG 改列、改锁对象须同步改 AGN（OGN 把 X-1～X-3 登为有外部消费者的实现细节）；导入限定只许 AGN（V2-4／N-3，未写）。
- 本版装配不换代 `storage`、`clock`、OG。

### 5.3 锁次序与同一提交（AGN「锁次序与插件内的同一提交」；**开发者不得自行调整**）

一个写事务开头**一次取齐**，按全序：

| 次序 | 锁 | 序列化的是什么 |
|---|---|---|
| L-1 | OG 隶属哨兵 `organization-governance/affiliation`（`lockSentinel`） | X-1 边界读 vs 隶属写；X-2 隶属建立时刻 |
| L-2 | 相关组织的 OG 组织行，按标识排序（`lockRow('organization', …)`） | X-3 成员资格再判与生效时刻 vs 成员写 |
| L-3 | 组织级持有哨兵 `asset-governance/holdings/<组织>`，按标识排序 | 同组织内全部持有写入与引用方谓词读 |
| L-4 | 资产记录行，按标识排序 | 记录存在、所有者、版本线；`at#S-7` 存在性 |
| L-5 | 键哨兵：血缘 (源, 层)、同对 (资产, 被分享方)、尝试键 (发起者, 键)、创建键 | `at#S-18` 三个序列化键 |
| L-6 | 待确认件行在前、`sharing` 行（按标识排序）在后 | 终结与结束记录一经写下不改写 |

- **各写操作的锁集**：组织型发起 = L-1、L-3、L-4（带键加 L-5）；确认复制 = L-1、L-2（源与目标组织）、L-3、L-4、L-5 血缘、L-6 通知行；**确认分享 = L-1、L-2（被分享方、所有者、发起者所在组织）、L-3（所有者所在组织与被分享方所在组织，恒含）、L-4、L-5 同对、L-6 邀请行 ＋ 这一对全部 `active` 分享行**；本人型发起同对应的确认、无待确认件行；撤回 = L-3、L-4、L-6；撤销 = L-4、L-6；移除 = L-3（被分享方组织）、L-6；删除／提升 = L-3、L-4、L-6（以它为资产的全部 `active` 分享行）。**除确认与本人型发起之外，成员资格与角色在事务之外经 OG 服务面现读**（N-31）。
- 锁前读不可变的键、算锁集，锁下重读；**锁下发现键变了 ⇒ 放掉事务按新键重来**，不在已取的锁上补取更前的锁。OG 自己的写从不在持组织行之后取 L-1，全序相容，pg 上不成环。sqlite 上 `lockRow`／`lockSentinel` 是空操作、写事务库级串行。
- **时刻**：写事务里、**取完锁之后**调同一个 `clock` 实例的 `now()` 作为这次提交的时刻（确认时刻、`since`、OG 的两个时刻同此）。**没有进程内锁，`now` 不参与冲突检测。**
- 确认一次写事务覆盖的全部存储对象：待确认件行（终结记录）、`asset_record`／`asset_version`／`asset_holding`（经组合入口）、`lineage_correspondence`、`sharing`、`copy_attempt_key`、`asset_audit_entry`——少一个就留中间态。

### 5.4 effect 装卸配对

| 装载 | 撤除 |
|---|---|
| config 校验五项（两个时长默认值、两个保留期为正、官方件清单外层形状）；不过即 fiber `FAILED`、一个面都不 provide（basis `plugin-throw-fails-fiber`） | — |
| 官方件登记（持久写，**不是 effect**，归 PF-002 投影） | 撤除不做任何事，登记事实留存 |
| 四个 `ctx.provide` | 服务消失；**在途调用跑完**，各按它那一次 `storage` 提交收场；无锁要放、无排空、无补偿；保留全部记录 |
| 定时器、监听者、连接 | **一个都没有**：过期读时派生（`oe#S-18`），分享失效读时判，不订阅成员与隶属事件 |

### 5.5 事件

- 流转模块**不发、不订阅**任何事件。`ag` 的五个通知用 `ctx.emit`、提交返回之后发、包一层捕获监听者抛出（basis `emit-listener-throw-propagates`），不用 `serial`／`bail`／`waterfall`、不设 `thisArg`（归 PF-002 投影）。
- **「中心进程里没有 `asset.*` 订阅者」是结构保护**（`emit` 不按租户过滤，M60）：`tools/ts-checks` 规则 ＋ TH 启动期断言监听者集合为空，两条都未开始。

### 5.6 装配草图（TH）

```text
boot()（本程追加部分，候选）
├─ … storage-sql（迁移合成末尾追加：OG v2 片段 organization_governance_v2_times → 资产片段 → 档案目录片段；不新增外键）
├─ plugin clock（只装一份）
├─ plugin organization-governance   多 provide organizations-v2、memberships-v2
├─ plugin account-registration
├─ plugin asset-governance          inject storage, clock, memberships, organizations
│                                    config { copyNoticeTtlDefault, sharingInvitationTtlDefault,
│                                             assetCreationKeyRetention, copyAttemptKeyRetention, officialManifest }
├─ plugin model-profile-directory（P-1，PF-013 投影）
├─ plugin governance-center-ops → governance-center-entry（入口 v1 不 inject 资产四个面）
└─ 撤除逆序：入口层 → 运维面 → P-1 → 资产提供者 → AR → OG → AI → CV → clock → storage
config：OMNE_TENANCY_COPY_NOTICE_TTL_DEFAULT、OMNE_TENANCY_SHARING_INVITATION_TTL_DEFAULT（已存在，同一组值只解析一次，
        同时给运维面与资产提供者）；OMNE_TENANCY_COPY_ATTEMPT_KEY_RETENTION（新）。缺或非正 ⇒ 启动失败
```

## 6. 绑定与证据

| 契约条款 | 证据 | 前提 | 状态 |
|---|---|---|---|
| `at#S-7`（×2）、`#S-8`、`#S-9`（×2）、`#S-10`、`#S-12`（×2）、`#S-17`、`#S-18`（×2）、`#S-22`、`#S-31`（×2）、`#S-32`（×3）、`#S-49`（×2）、`#S-52`——AGN [`bindings.yaml`](../../../../realization/packages/assets/asset-governance/bindings.yaml) 二十条 | `formal:asset-transfer-v1-transfer`／`-share`／`-revival`，run [`2026-09-25-formal-assets-runtimes`](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md)（HUB `1667ea4c`） | 模型把确认、发起、撤回、撤销、移除、删除、提升写成原子动作，即**假设 L-1～L-6 兑现了序列化**；时刻严格递增（C-15）；G-3 按已兑现建模；规模：三个团队组织、四个租户身份、两份资产 | **三个任务退出 0、无反例**（195984／1179208／1179208 distinct）。**它们证的是契约模型，不是节点实现** |
| 上面三组的有效性 | 十三个 `Transfer_No*.cfg`，预期反例 | 同上 | 已执行、全部按预期违反（契约验证入口）；**不登记为 formal task** |
| 被建模方式吸收、**不作证据**的 | `TypeOK`、`EffectsOnlyFromConfirmation`、`EndedStable`、`at#S-52` 提升一支、`at#S-9` 两读先后、「按层找」、尝试键认回 | — | 证据形式是下一行的场景 |
| `at` 规范场景 S-39～S-47、S-50、S-51、S-53；AGN D-1～D-12（真并发，pg 一遍是锁的唯一实证）、F-1～F-3、C-1～C-4、P-1～P-3 | 各节点 verification | — | **全部未开始**（源码不存在） |
| `og2#S-61` 两个时刻；OGN 双版本、迁移片段、X-1～X-3 三行 | OGN verification | OGN 三条 v2 绑定只证沿用的 v1 模型（S-17 那一格），**模型里没有两个时刻** | 未开始 |
| TH 本程追加六行（迁移合成、装载清单、config、清单整体性两支、同一存储结构检查 TH-1、无 `asset.*` 订阅者） | TH verification | — | 未开始；TH 本程追加 **0 条绑定** |
| CLK C-15 | CLK verification | — | 未开始；CLK `bindings.yaml` 空表 |
| run `2026-09-25-validity-stream-assembly`、`2026-09-25-node24-json-probe` | — | — | **与本 topic 无关**，本投影不引用 |

## 7. 未决项与已回询项

### 7.1 契约缺口（开着的）

| 编号 | 什么没定 | 谁能定 | 在裁决前实施者该怎么办 |
|---|---|---|---|
| `at` G-3 | 持有没有实例身份：移除后再持有同一份记录，已过期的待确认件可能读回 `pending` | `am`／`ag` | 照 AGN：以 `pointed_holding_since` 比 `since`（依赖 C-15）；场景 S-45 那一支失败如实记 |
| `at` G-5 | plugin 正文里「内含」与「引用」怎么分 | `am` | 告知清单按「引用」一支为空处理，**不得把内含成员当引用报缺提供者**；S-46 受阻 |
| `at` G-8、`og2` G-7 | 跨进程：原子提交协议、同落点序列化、读一致性、成员资格传播上界、三个时刻的全序、两读先后、代行读的服务身份、血缘对应私有性 | 架构设计（本版单机不阻断） | 单机；不引入分布式假设；这些面**不得直接暴露成终端 API** |
| `og2` G-3 | 成本按使用方租户归属的计量口径 | 产品负责人（无 topic） | 不实施 |

### 7.2 节点缺口

| 编号 | 什么没定或没做 | 谁能定 | 在闭合前实施者该怎么办 |
|---|---|---|---|
| **C-15**（AGN N-1、OGN V2-2、TH U-7） | 同一进程内 `now()` 逐次严格递增（M58 已选手段） | CLK，下一程 | 先实施 C-15 再实施依赖它的条款；闭合前「不复活」同一毫秒一支、S-45「移除后再持有」一支、D-8、`og2#S-61`「严格更晚」一支**照原样记失败**，不靠「等一会儿」变绿 |
| AGN N-5、TH U-6 | 资产四个面对外不可达：入口契约 v1 路由表封闭 | 主线：入口契约 v2 | 本版只能在进程内经服务面与测试夹具走流程；**治理中心与 CLI/TUI 的全部复制与分享流程受阻** |
| AGN N-6 | `byAgent` 调用上下文没有来路 | 入口契约 v2 | 缺了按契约 `unavailable`，不默认 `false` |
| AGN N-11、OGN V2-3、TH U-11 | v1 写下的成员关系与隶属没有时刻，迁移不补 | **收场已接受**（N-19、M61） | 这些关系上的分享判不可用；半径是被分享方整个组织的快照；出路：移除那份分享或重建关系 |
| AGN N-3、OGN V2-4 | `./tx-reads` 只许 AGN import 的结构检查 | `tools/ts-checks` ＋ OGN | 与 AGN 同批写规则与自测 |
| AGN N-9 | 血缘对应私有性只有模块边界 | 实现者 | 试写 ts-checks 规则；写不成则每个读面一条「推不出源」的反例测试 |
| AGN N-7 | `emit` 不按租户过滤 | 本版靠无订阅者；将来推送归入口 v2 | 不在中心进程里订阅 `asset.*` |
| OGN V2-5 | 钉 v1／v2 服务名的静态核对 | `tools/ts-checks` | 钉 v1 的包只 inject v1 名字 |
| AGN verification「S-44 读序一支」 | 节点在一次事务里取齐 ① 与 ②，契约原文「颠倒两读应观察到复活」构造不出来 | 主线（场景措辞） | 按节点改写执行（读事务进行中从另一连接提交「解除—重建」，判定与读事务开始时一致）；颠倒一支如实记「不可构造」 |
| AGN H-2、H-3 | 假设「Cordis 事件不跨进程」无 probe；`lockSentinel` 在 pg 上的覆盖未核 | kernel-basis／`core/storage` | 实施前取证 |

### 7.3 产品负责人待裁（只列、不裁）

| 来源 | 事项 | 当前落法 |
|---|---|---|
| [PF-003 decisions §三](../../decisions.md#三待裁决)；账本 §二′「asset-transfer 重写」第一行 | 提升时分享怎么收场：① 随之结束；② 随资产归组织 | 按主线倾向 ① 落（R2-7，`at#S-52` `ownerChanged`）；改判走新版本 |
| 账本 §二′「asset-transfer 重写」第二行 | 组织型复制通知的目标侧看得到什么 | 看得到源组织标识与那一版内容，看不到源资产本身（R2-6，`at#S-23`）；请过目、不挡 |
| D-040 §三～§八 | 主线裁定（R2-1～R2-16、K37～K39、M27、M57～M62、N-18、N-19、N-31）逐条追认 | 按裁定落；追认可与 D-041／D-042 同一次签 |
| D-041、D-042 | 契约接受（G4）与节点接受（G5） | 签字之前 catalog 一律 `candidate`、不冻结 |

### 7.4 已回询、已闭合的（不再是缺口）

`at` G-1（发现面 `listPendingForOrganization`）、G-2、G-4（不复活，D-039）、G-6、G-7、G-9～G-15；OGN V2-6（X-2、X-3 经 N-19 接受）；AGN N-13。

## 8. 实施顺序及每步完成判据

**门**：D-041（契约）与 D-042（节点）签字之前不开实施；PF-002 投影里资产治理的记录、持有与组合入口先于本投影第 T-3 步。
**验收替身与真承接者**：本 topic **没有验收替身**。真承接者是入口契约 v2 ＋ `apps/cli` 据点侧（治理中心与 CLI/TUI 的用户流程），本版不在；本版的验证装配是**测试夹具**（真实 `storage-sql`、真实 OG 与资产插件，进程内直接调服务面）——它不是替身，不代表用户流程已可用。

| 步骤 | 做什么 | 依赖 | 完成判据 |
|---|---|---|---|
| T-1 | CLK C-15：同一进程内后一次 `now()` ≥ 上一次＋1 ms，其余等于墙钟；改写 `clock.monotonic-in-process` 断言；租约上界按同一 `now()` | — | CLK verification 改写后的断言「非递减、每个返回值 ≥ 当时墙钟且 ≤ 墙钟＋同毫秒调用数」过；`lease_until ≥ 一切已返回值` 保持 |
| T-2 | OGN v2：`parent_established_at`、`effective_since` 两列与单独导出的迁移片段；写路径按 `og2#S-7`、`#S-8` 写时刻（锁后取）；`organizations-v2`、`memberships-v2`；`./tx-reads`；V2-4 导入限定规则 | T-1 | `og2#S-61` 两段演练与两支故障注入过（含「严格更晚」一支）；双版本行、迁移片段行过；V2-4 规则有「故意违反即失败」自测 |
| T-3 | AGN 流转模块：五张表（`copy_notice`、`sharing_invitation`、`sharing`、`lineage_correspondence`、`copy_attempt_key`）；L-1～L-6 与各操作锁集；`sharingEffective` 纯函数（一次事务取齐 ① ②）；十二个操作；`at#S-52` 结束分享写函数被 `ag#S-27`、`#S-28` 同提交调用 | T-2；PF-002 投影的资产治理记录、持有、组合入口 | `at` 场景 S-39～S-45、S-47、S-50、S-51、S-53 全过（S-45「移除后再持有」一支要求 T-1 已闭合；S-46 受阻于 G-5 如实记）；sqlite 与 pg 各一遍的 D-4～D-12 真并发演练过（D-8 同一毫秒一支要求 T-1）；F-1～F-3 故障注入过；C-2、C-4 类型与结构检查有自测；P-1～P-3 过 |
| T-4 | TH 本程追加：装载清单、撤除次序、迁移合成末尾三组片段、两个 TTL 与尝试键保留期的 config、`asset.*` 无订阅者两条检查 | T-2、T-3 | TH verification 本程追加六行过，**「同一存储、同一约束域」结构检查（TH-1）首先跑**；缺或非正的 config 各自启动失败并点名、不含值 |
| T-5 | 证据入库：把 T-1～T-4 的运行登进 `record/evidence/`，回填 AGN、OGN、TH、CLK 的 `bindings.yaml`（`test:` 绑定） | T-1～T-4 | 各节点 bindings 不再只有 formal；README「实际验证」不再是「无」；契约 verification 场景行状态回填 |
| — | **不在本版顺序内**：入口契约 v2 路由与据点侧呈现（N-5、U-6）；`byAgent` 来路（N-6）；G-3、G-5 的契约闭合；跨进程（G-8） | — | 各自 owner 立项时另出投影新版本 |

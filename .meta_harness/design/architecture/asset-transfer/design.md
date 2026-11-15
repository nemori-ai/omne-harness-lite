# 资产复制与分享的设计

本设计的公开数据由实际定义它的拥有者发布，不为它单独建空包。新的产品政策由产品负责人决定。

## 操作

所有读不到都答 `unavailable`，不能假答 `outsideTree`、`notPermitted`、不存在、`expired`、`dissolved` 或空集合。资格、边界与派生的时效都要现读。下表里的 `→` 是首拒绝的先后。一个操作在两个位置各有一次角色拒绝的，两个位置都保留。

| 操作 | 资格与闭合首拒绝路径 | 同提交和重试 |
| --- | --- | --- |
| issueCopyNotice  | invalidInput（含落点本组织）→targetLayerNotSelf（值级、不查记录）→notPermitted（source 成员）→已登记 attemptKey 认回→sourceNotOwned→officialNotTransferable→notPermitted（source org 超管）→notTransitive→versionNotPublished→outsideTree→layerNotAllowed→notPermitted（本人落点成员/组织超管）；任步 unavailable | 本人型直接落地，无 offer；组织型只写 notice+固定 OfferTiming；key 登记和写同提交。保留期同 (initiator,key) 返回原 outcome/notice，即使其余输入变；无键本人重放依血缘再出新版本，组织重放多 notice |
| withdrawCopyNotice  | invalidInput→noticeNotFound（非发起/源超管同不存在）→notPermitted（当前 source 成员失效）→alreadyConcluded；unavailable | pending 的当次时效+withdrawn 一提交；自身 withdrawn 认回 ok；accepted/expired alreadyConcluded 不覆盖 |
| confirmCopy  | invalidInput→noticeNotFound（非目标组织）→notPermitted（目标有效超管）→offerNoLongerValid（expired/withdrawn/accepted 同值）→notPermitted（发起者仍源有效超管）→outsideTree；unavailable | pending 重判、资格/树、落点血缘、资产完整落地、accepted 同提交；同(source,targetLayer)串行。相同 notice 再确认失败，不写；再判失败保持 pending |
| readCopyNotice  | invalidInput→noticeNotFound（非当前 source 发起/超管、目标超管）→unavailable | 读时派生时效和首次/重复，不能缓存准入；目标侧只见 source organization ID，不能见 source record/多版本/私有 initiator 身份 |
| issueSharingInvitation  | invalidInput（自身组织/自己租户）→targetLayerNotSelf→notPermitted（source 当前成员）→sourceNotOwned→officialNotTransferable→notPermitted（source org 超管）→notTransitive→versionNotPublished→outsideTree→layerNotAllowed→recipientNotMember（组织内）或notPermitted（本人目标成员）；unavailable | 本人型同提交 new/认回生效 sharing+目标空槽则 shared/current holding，无 offer；其他三种写 invitation。本人型按(asset,recipient)认回；需点头的每次新 invitation，无 share attemptKey |
| withdrawSharingInvitation  | invalidInput→invitationNotFound（非有效发起者或当前 source org 超管）→alreadyConcluded；unavailable。此操作没有独立 notPermitted 值 | 同 withdrawCopyNotice；withdrawn 认回；accepted/expired 不覆盖 |
| confirmSharing  | invalidInput→invitationNotFound（非 recipient 侧）→notPermitted（当前目标成员/组织超管）→offerNoLongerValid→notPermitted（initiator 当前权）→sourceNotOwned→outsideTree；unavailable | 时效/资格/树+新或认回生效 pair+空槽取得 shared/current holding+accepted 一提交；同(asset,recipient)串行。相同 invitation 再确认拒绝；另一 invitation 可认回生效 sharing，已 derived dissolved 必须新段、新 ID |
| readSharingInvitation  | invalidInput→invitationNotFound（非发起者、source 当前org超管、recipient 可确认者）→unavailable | 读时派生，不缓存 |
| revokeSharing  | invalidInput→sharingNotFound（非有效发起者/当前 source org 超管）→unavailable | active 含派生 dissolved 写 revoked/sharerRevoked；不动目标 holding/配置；已 revoked/removed 成功但不改既有终态 |
| removeShared  | invalidInput→sharingNotFound（非 recipient 侧）→notPermitted（当前成员/组织超管）→unavailable | sharing removed 和对应 shared holding+配值删除同提交；sharing 已结束不改终态，但清残留 holding；与资产治理 unhold 的组合见未决 |
| listSharings  | invalidInput→notPermitted（本组织有效成员）→unavailable | 当次派生 SharingState；组织 recipient 任成员可见、organization sender 仅超管、tenant sender/recipient 仅本人（超管不能私看）；默认 active，可明确选全部（这个输入的名字没定） |
| listPendingForOrganization  | invalidInput→notPermitted（org 有效超管或该 tenant 本人有效）→unavailable | 实参是接收层，名称不缩窄到 org；只列当次 pending 收件及类/ID/OfferTiming，详情用读接口；局部未知不能少列，本人型无待确认件 |

## 跨域的行为与前提

1. **复制与血缘。** 复制只看源记录与落点那一层私有的血缘，不看能力标识撞名。首次复制产生新记录、v1、`customized` 来源，所有者是目标层，作者、`publishedBy` 与 `importedBy` 是目标侧的行为人，内容与源版本全文等值。目标层已经持有同一能力标识时，新记录不取得持有，旧持有不动，并告知撞名。重复复制只出新版本，改 `sourceVersion`、`importedBy`、`importedAt` 与 `imports`，不动 `LineageId`、持有、配置、锁与禁用。删除或提升使目标离开原层之后，再复制到原层算首次，用新的 `LineageId`；提升出去的那份不被旧层的复制继续覆盖。`byAgent` 取自发起的那一次调用，组织型通知要记下它；缺失答 `unavailable`，不能当作 `false`。
2. **流转方向。** 流转方向的矩阵归[产品正文](../../product/assets-and-rules/design.md#先确认允许的来源与目标)第 120 至 124 行。本设计在它上面加四条：每一格不能泛化到别的格；先判隶属树，再判层，角色不能抹掉结构上的禁止；跨组织落到别人的租户级在值级拒绝；官方件不能流转，分享来的不能再流转。
3. **分享使用时生效。** 使用时生效的条件是：记录 active，当前关系成立，并且从确认以来没有断过。先读边界与当前成员资格，再读连接路径上的 `parentEstablishedAt` 与 `membershipEffectiveSince`，或者在一次可串行化的读里一起读。不能逆序拿旧的 since 配新的关系。生效判定不依赖解除事件，也不依赖断开期间有没有人读过。共同祖先以上的边不参与判定。组织层的 shared 持有与它成员的 organization 持有一起判。按 `(asset, recipient)` 当前有效的那一段判，不按持有里记着的旧 `SharingId` 判。退出再加入、重新隶属之后仍是 `dissolved`，新的确认才建立新的一段。已经落地的复制不受之后关系解除的影响。
4. **同提交。** 全部资产记录、版本、持有、私有血缘对应、分享与通知的终态、`attemptKey` 以及准入依赖，都要在同一提供者、同一存储的一次可串行化提交里成立，各次读写的对象要写明。分享的来源被删除，或所有者改变时，同一提交结束全部 active 的对外分享，已经结束的不覆盖。目标侧的持有与配置留作残余，不级联。待确认件在来源不再存在或原所有者的持有消失时派生为 `expired`。撤权只作用于之后的准入，不要求停下已在执行的工作，这条归[资产规格](../../../../packages/assets/SPEC.md#权限写入与准入)第 218 行。
5. **plugin。** plugin 内含成员与外部引用的规则归[资产规格](../../../../packages/assets/SPEC.md#组合与流转)第 107、108 行：内含成员随 plugin 的完整内容与使用权，不单独有记录、血缘、分享或持有；外部引用不搬运，只提示目标缺提供者。

## 未决

下列未决闭合之前，依赖它的那部分不按本设计实现。

| 未决 | 问题与读法 | 做到这一程时要定 |
| --- | --- | --- |
| 提升时分享怎样结束 | 本设计在提升的同一提交里结束全部 active 的对外分享，原因 `ownerChanged`。[产品正文](../../product/assets-and-rules/design.md#把资产所有权交给组织须由人完成交付)第 144 行说提升后适用组织级分享设置，仍可分享的既有分享保留，否则撤回。读法一：照产品正文，按组织级分享设置逐段判。读法二：保留本设计，全部结束。 | 读法一要改 `promoteToOrganization` 的同提交写入、场景第 10 节第 4 步与资产治理场景 2.5 提升第 1b 步，形式模型的 `SourceEndCheck` 也要分出提升这一支 |
| `removeShared` 与 `unhold` 的告知 | `removeShared` 只收移除者与 `SharingId`，没有 `acknowledged`，失败集合里没有 `hasReferrers`，却组合了资产治理 `unhold` 的先告知集合与 `hasReferrers`。读法一：`removeShared` 加 `acknowledged` 输入与 `hasReferrers` 失败值。读法二：`removeShared` 免去告知。读法三：`removeShared` 只在没有组合引用时成功，有引用时由调用者先走 `unhold`。 | 选一种读法，并给它独立的验证义务。不能静默加豁免、输入或失败值 |
| 原所有者持有的实例身份 | 原所有者的持有没有实例身份。移除之后再持有，可能让已经 `expired` 的待确认件回到 `pending`。不能用记录 ID 防这件事。 | 持有要不要实例身份，或待确认件的到期改为一旦派生就落为终态 |
| 没有尝试键的重放 | 本设计里不带 `attemptKey` 的本人型复制重放会再出一个新版本，组织型重放会多一份通知。[资产规格](../../../../packages/assets/SPEC.md#组合与流转)第 109 行要求复制、分享与提升按原操作身份认回，不因重试多出一份 v1 或一个版本。 | 尝试键是不是必填，或者由谁给出原操作身份 |
| plugin 的内含与引用 | plugin 正文里内含与引用怎样区分没定。闭合之前，告知清单按引用为空计，不能拿空清单声称告知完整。 | plugin 正文里内含与引用的表示 |
| 组织层的确认人 | 本设计把组织层的发起与确认都定为有效超管。现行正文按「组织持有管理」资格判，见[资产治理](../asset-governance/design.md#未决)的同名未决。 | 随资产治理那一条一起定 |
| 跨进程 | 跨进程的原子性、全序与传播上界没定。[资产规格](../../../../packages/assets/SPEC.md#原则与约束)第 266 行要求跨进程时提供等价的条件提交与一致读取，做不到就答不支持或不可用。 | 跨进程部署下各组合怎样保持同提交 |

验证义务见[验证](verification/README.md)，形式模型见[模型](models/README.md)。

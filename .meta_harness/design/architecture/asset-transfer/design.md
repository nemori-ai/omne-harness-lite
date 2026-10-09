# 资产复制与分享：当前设计与未实现边界

产品规则归[产品入口](../../product/PF-003-asset-transfer-and-sharing/README.md)；本页只维护尚无真实提供者的已采用技术行为及未决，不授予实现或验证状态。公开数据沿实际定义拥有者，不建空包。新增产品政策仍由产品负责人决定。

删除/提升结束分享的技术性质有模型，但ownerChanged的完整产品采用仍须与PF-003明确范围相符。本页不扩大该接受范围。

所有读不到均为 `unavailable`，不得假 `outsideTree`、notPermitted、不存在、expired、dissolved 或空集合。资格、边界、派生时效必须现读。以下 `→` 是当前采用明确首拒绝顺序；带两个角色拒绝位置保留。

| 操作 | 资格与闭合首拒绝路径 | 同提交和重试 |
| --- | --- | --- |
| issueCopyNotice  | invalidInput（含落点本组织）→targetLayerNotSelf（值级、不查记录）→notPermitted（source 成员）→已登记 attemptKey 认回→sourceNotOwned→officialNotTransferable→notPermitted（source org 超管）→notTransitive→versionNotPublished→outsideTree→layerNotAllowed→notPermitted（本人落点成员/组织超管）；任步 unavailable | 本人型直接落地，无 offer；组织型只写 notice+固定 OfferTiming；key 登记和写同提交。保留期同 (initiator,key) 返回原 outcome/notice，即使其余输入变；无键本人重放依血缘再出新版本，组织重放多 notice |
| withdrawCopyNotice  | invalidInput→noticeNotFound（非发起/源超管同不存在）→notPermitted（当前 source 成员失效）→alreadyConcluded；unavailable | pending 的当次时效+withdrawn 一提交；自身 withdrawn 认回 ok；accepted/expired alreadyConcluded 不覆盖 |
| confirmCopy  | invalidInput→noticeNotFound（非目标组织）→notPermitted（目标有效超管）→offerNoLongerValid（expired/withdrawn/accepted 同值）→notPermitted（发起者仍源有效超管）→outsideTree；unavailable | pending 重判、资格/树、落点血缘、资产完整落地、accepted 同提交；同(source,targetLayer)串行。相同 notice 再确认失败，不写；再判失败保持 pending |
| readCopyNotice  | invalidInput→noticeNotFound（非当前 source 发起/超管、目标超管）→unavailable | 读时派生时效和首次/重复，不能缓存准入；目标侧只见 source organization ID，不能 source record/多版本/私有 initiator 身份 |
| issueSharingInvitation  | invalidInput（自身组织/自己租户）→targetLayerNotSelf→notPermitted（source 当前成员）→sourceNotOwned→officialNotTransferable→notPermitted（source org 超管）→notTransitive→versionNotPublished→outsideTree→layerNotAllowed→recipientNotMember（组织内）或notPermitted（本人目标成员）；unavailable | 本人型同提交 new/认回生效 sharing+目标空槽则 shared/current holding，无 offer；其他三种写 invitation。本人型按(asset,recipient)认回；需点头的每次新 invitation，无 share attemptKey |
| withdrawSharingInvitation  | invalidInput→invitationNotFound（非有效发起者或当前 source org 超管）→alreadyConcluded；unavailable。此操作没有独立 notPermitted 值 | 同 withdrawCopyNotice；withdrawn 认回；accepted/expired 不覆盖 |
| confirmSharing  | invalidInput→invitationNotFound（非 recipient 侧）→notPermitted（当前目标成员/组织超管）→offerNoLongerValid→notPermitted（initiator 当前权）→sourceNotOwned→outsideTree；unavailable | 时效/资格/树+新或认回生效 pair+空槽取得 shared/current holding+accepted 一提交；同(asset,recipient)串行。相同 invitation 再确认拒绝；另一 invitation 可认回生效 sharing，已 derived dissolved 必须新段、新 ID |
| readSharingInvitation  | invalidInput→invitationNotFound（非发起者、source 当前org超管、recipient 可确认者）→unavailable | 读时派生，不缓存 |
| revokeSharing  | invalidInput→sharingNotFound（非有效发起者/当前 source org 超管）→unavailable | active 含派生 dissolved 写 revoked/sharerRevoked；不动目标 holding/配置；已 revoked/removed 成功但不改既有终态 |
| removeShared  | invalidInput→sharingNotFound（非 recipient 侧）→notPermitted（当前成员/组织超管）→unavailable | sharing removed 和对应 shared holding+配值删除同提交；sharing 已结束不改终态，但清残留 holding；见下方与 AG 的未闭冲突 |
| listSharings  | invalidInput→notPermitted（本组织有效成员）→unavailable | 当次派生 SharingState；组织 recipient 任成员可见、organization sender 仅超管、tenant sender/recipient 仅本人（超管不能私看）；默认 active，可明确选全部（尚无命名 includeEnded 输入） |
| listPendingForOrganization  | invalidInput→notPermitted（org 有效超管或该 tenant 本人有效）→unavailable | 实参是接收层，名称不缩窄到 org；只列当次 pending 收件及类/ID/OfferTiming，详情用读接口；局部未知不能少列，本人型无待确认件 |

跨域关键行为与前提：

1. 复制只看源 record+落点 layer 私有血缘，不看 capability 撞名。首次新 record/v1/customized、owner 是目标层、作者/publishedBy/importedBy 是目标行为人；源版本全文等值。已有 capability holding 则新 record 不持有、旧者不动并告知撞名。重复只出新版本并改 sourceVersion/importedBy/importedAt/imports，不动 LineageId/holding/配置/锁/禁用。删除或提升使目标离开原层后再复制原层为首次，新 LineageId；提升那份不被旧层复制继续覆盖。byAgent 来源于发起调用，组织 notice 必须记下；缺失 unavailable，不能 false。
2. 方向矩阵  每格不可泛化：团队 org 只同树 team org（需目标超管确认）；个人源到本人团队 tenant 直接 copy/share、到团队 org 仅本人有效超管 copy；团队本人 tenant 跨组织仅本人同树 team tenant，不能 org；跨组织别人的 tenant 值级拒绝；同团队 tenant→同事 tenant share 需本人确认；team→personal 永拒，official/shared 非传递。先树再层，角色不能抹结构禁止。
3. 分享使用时生效 = record active∧当前关系∧自确认未断。读边界/当前成员之后再读连接路径 parentEstablishedAt 与 membershipEffectiveSince，或单可串行化读；不能逆序配旧 since 与新关系。不依赖解除事件、也不依赖断开期间被读过。共同祖先以上边不参与；组织层 shared 与其成员 organization holding 一起判；按(asset,recipient)当前有效段判断，不按 holding 里旧 SharingId。退出再加入/重新隶属仍 dissolved，新确认才能新段；复制已落地不受之后关系解除影响。
4. 全部资产记录/版本/holding、私有 lineage 对应、sharing/offer terminal、attemptKey 与准入依赖必须同 provider/storage 可串行化提交；各读写对象需明确。sharing/source 删除及 owner-change 同提交结束全部 active outgoing sharing，已 ended 不覆盖；目标 holding/配置留残余，不级联；pending 由 source 不再存在或原 owner holding 消失派生 expired。撤权只管准入，未要求停原执行。
5. plugin 内含成员随完整内容/使用权，不单独 record/lineage/share/holding；外引用不搬运，只提示目标缺提供者。当前plugin外壳尚未分内含/引用，告知暂按引用为空，**场景受阻**，不能借空清单声称完整。

明确未闭：原 owner holding 没实例身份使移除再持有可能让 expired offer 回 pending；不能用 record ID 防这个。removeShared 只收移除者和 SharingId、没有 acknowledged，失败集合无 hasReferrers，却组合 AG unhold 的先告知集合及 hasReferrers；这是旧源之间具体冲突，需要保留给拥有者，不能静默加豁免/输入/失败值。ownerChanged 终结有旧技术采用与模型义务，但 PF003 产品接受边界仍以产品正文及下述未决为限，迁移不授产品接受。跨进程原子性/全序与传播上界未定义。

验证义务与规范输入见[verification](verification/README.md)。尚未闭合的公共语义阻止相应提供者实施，不以迁移目录关闭业务缺口。

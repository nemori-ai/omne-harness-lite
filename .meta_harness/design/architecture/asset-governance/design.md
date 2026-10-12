# 资产治理：当前设计与未实现边界

产品规则归[产品入口](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/README.md)；本页只维护尚无真实提供者的已采用技术行为及未决，不授予实现或验证状态。公开数据沿实际定义拥有者，不建空包。新增产品政策仍由产品负责人决定。

下表失败值闭合；集合中的顺序由通用路径及操作局部次序决定，不能据表序补出尚无的判定。每一步事实读不到立即 `unavailable`，不是继续判后续拒绝。

通用资格：管理者 = 本组织有效超管或自身有效租户；组织创作权当前只有有效超管（普通成员委托未定义时 `notPermitted`）；租户创作权 = 有效本人任意角色；读范围 = factory 任意有效 caller、本组织任意有效成员、本人租户。超管也不能碰其他成员私有租户。

范围操作首拒绝：`invalidInput` → 值级 `crossTenant` → 范围存在性 `scopeNotFound` → 资格 `notPermitted` → 目标定位（asset/holding/assignment，操作规定目标先后）→ `officialImmutable` → `notOwner` → 局部状态。记录操作首拒绝：形状 → caller 有效 → 记录可见（不可见与不存在同 `assetNotFound`）→ official → owner → 角色 → 记录相关内容校验 → 状态。不能在可见性前泄漏私有记录类别、内容或存在。

简写 **B** = `invalidInput,crossTenant,scopeNotFound,notPermitted,holdingNotFound,unavailable`。下表 B 只是本页的集合简写，不作为新公开接口。

| 操作/条款 | 资格与局部首拒绝 | 闭合失败集合 | 原子写与重复 |
| --- | --- | --- | --- |
| createDraft  | 自身租户或本组织创作；owner 不属于 caller 侧先 crossTenant；保留命令名及内容形状先 invalidInput | invalidInput,crossTenant,scopeNotFound,notPermitted,unavailable | 新记录、草稿、caller 作者、必填 byAgent、空版本线与创建键登记同提交；(caller,creationKey) 在具名保留期认回原 ID，即使其余输入变；无键每次新建 |
| updateDraft  | 有效、可见、非 official、owner 侧创作；basedOn 须等于当前版本尾 | invalidInput,notPermitted,assetNotFound,officialImmutable,notOwner,versionSequenceBroken,unavailable | 只改草稿，不改身份/作者/owner/血缘/版本；同内容可重复；stale basedOn 拒绝；尚未发布的并发草稿编辑不受另一个 CAS 保护 |
| publish  | 同上；expected = 当前尾+1；名字/保留区在记录可见、owner、资格之后校验 | 同 updateDraft | 新连续不可变版本、publishedBy 和保留草稿同提交，不动持有；expected 已存在且属于同 caller、内容等于当前草稿则认回，否则版本断序；JSON 对象忽略成员顺序，数组保序 |
| promoteToOrganization  | ownOrganization 创作且记录为本人租户所有；非 official；已有分享不挡 | invalidInput,crossTenant,scopeNotFound,notPermitted,assetNotFound,officialImmutable,notOwner,unavailable | owner 改组织、持有依据随实际owner事实重算为organization（不是holding写变更）、全部 active outgoing sharing 结束为 ownerChanged 同提交；作者/holding since/配置/锁/钉版不动，只通知AssetPromoted，不另发HoldingChanged；已归组织可认回但仍核组织创作资格 |
| delete  | owner 侧创作；当前引用集/份数不超过 acknowledged | invalidInput,notPermitted,assetNotFound,officialImmutable,notOwner,hasReferrers,unavailable | 记录不可读、版本不能公共解引用、ID 不复用；同提交 active sharing 写 sourceDeleted；不级联持有或引用；重放 assetNotFound |
| registerOfficial  | 仅系统 bootstrap 可达；meta 必填，不从 publisher 推断 | invalidInput,unavailable | 官方记录、v1、factory holding 及 meta 替换锁同提交；同内容不多发布；新内容追加版本；现行部署 meta 决定锁 |
| hold  | 管理者；published；basis由当前事实自动确定，公共caller不得传basis自签授权，只有lineage/sharing内部组合面可以提供；meta 不可替代；shared 不可 pinned；租户上层替换锁下仅同记录 current 可进 | invalidInput,crossTenant,scopeNotFound,notPermitted,assetNotFound,officialImmutable,notOwner,versionNotPublished,alreadyHeld,lockedAbove,unavailable | holding 唯一性、依据、选版、空配值、since 同提交；同资产+basis+选版认回，即使上层后来加锁；其他差异 alreadyHeld；plugin 成员不单独取得持有 |
| unhold  | 管理者；该范围当前组合引用⊆acknowledged，否则 hasReferrers 返回新集合 | B + hasReferrers | 持有与全部配值同时删，引用不改；predicate/range 与提交同事务，防新引用幻读；重放 holdingNotFound |
| disable  | 管理者；官方件不能禁用 | B + officialImmutable | 仅 disabled=true，保留 holding/配置；已禁用认回 |
| enable  | 管理者 | B | 仅本层 disabled=false；不盖过组织 true；已启用认回 |
| lockReplacement  | 管理者 | B | 本 holding immutable=true，不删下层；重复认回 |
| unlockReplacement  | 管理者 | B | 本 holding immutable=false，不回溯过去拒绝；重复认回 |
| pinVersion  | 管理者；holding→record→已发布号；shared 不可钉，上层 replacement lock 拒绝 | B + assetNotFound,notOwner,versionNotPublished,lockedAbove | 现读 record/上层锁和 pinned 写同提交；配置不动；相同版本认回 |
| unpinVersion  | 管理者 | B | 只改 current，配置不动；已 current（含 shared）认回 |
| assign  | 管理者；不带锁改本地锁→lockedHere；项/值域→valueOutOfDomain；组织 CredentialRef 项→layerNotAllowed；多档/空集非界→selectionNotSingleTier；外层界/设置锁→lockedAbove | B + lockedHere,valueOutOfDomain,layerNotAllowed,selectionNotSingleTier,lockedAbove | 值+可选 immutable+since 与现读依据同提交；immutable=true 可以替换本层自己的锁住界，仍受外层界；同值同锁不改 since/不发变更，同值加锁保留 since，值改 since 更新 |
| clearAssignment  | 管理者；本层锁阻止清除；reserved disabled 不是普通项 | B + lockedHere | 删本层项；缺项成功；不改上层 |
| lockAssignment  | 管理者；必须有本层 assignment | B + assignmentNotFound | 仅 immutable=true，值/since 不变；已锁认回 |
| unlockAssignment  | 管理者；多档/空集界不能变成 pick（forbid 仍是界） | B + selectionNotSingleTier | 仅解本层锁，值/since 不变；缺项/已解锁认回；多档界须先带锁写成单档再解锁，不能自动缩小 |
| listHoldings  | 范围读资格 | invalidInput,crossTenant,scopeNotFound,notPermitted,unavailable | 当次现读；不存在不能假空，局部未知不能返回残缺列表 |
| readHolding  | 范围读资格 | B | 当次现读 |
| organizationSettingsView  | 本组织有效成员 | invalidInput,crossTenant,scopeNotFound,notPermitted,unavailable | 现算视图，不立新对象；缺某类属性规则标“推不出”，不能空表单；不整份凭据呈现 |
| listReferrers  | 有效可见且 owner 侧创作或持有范围管理者；已经可见而无资格→notPermitted | invalidInput,notPermitted,assetNotFound,unavailable | 现读预告，不是写准入；owner 侧见本组织成员租户持有份数，不见身份；对 shared 收件层可告知，但不列其内部组合引用；规则缺失→unavailable |
| readAsset  | 有效可见 | invalidInput,notPermitted,assetNotFound,unavailable | 草稿仅owner侧有创作资格者可见；其他可读者明确“不向你展示”，不以版本正文补草稿。记录只返回版本metadata、不含各版正文；持有指向已删除记录时readAsset/readVersion均返回“已删除”状态；删除/可见性失效须让缓存失效 |
| readVersion  | 有效可见、号已发布 | invalidInput,notPermitted,assetNotFound,versionNotPublished,unavailable | immutable 内容可缓存，但资产删除或失去可见性后不能继续公共解引用 |

跨域和未闭：

- 所有写准入现读资格、锁、版本、引用，与写在同一可串行化提交。组合引用范围保护须覆盖新插入，不能只锁已存在行。 删除/移除必须先呈现当前集合，然后提交内核 `current ⊆ acknowledged`（份数不大于确认数）；新引用出现重新告知。不是布尔“知悉”。
-  首次复制 = createDraft+publish+hold（新增 lineage 只能内部面）；重复复制 = updateDraft+publish；分享 = shared/current hold，sharing 合法性由 Transfer 保证。全部组合参与同一 provider/storage/commit，任何一项失败零效果；不另造 bypass 写面。碰同能力标识但无血缘时允许新记录、旧 holding 不动，是否换 holding 留给该层管理者。
- events 是提交后通知/运行审计事实，不是授权或触发取消；通知不得漏向本人告知，也不得泄漏其他成员私有身份。撤权拒下一道准入，不给既有执行发停止。成员解除不删 holding。
- 明确仍未闭：普通成员组织创作委托；agent_definition/plugin 属性及组合、MCP 动作集写时来源；定义时 compositionCycle 拒绝未兑现（目前只求值判）；删除后求值去向；plugin 成员配置位置；日程等非资产引用不列；上层同记录替换锁对版本差异的政策；配值 stale-edit expectedVersion/失败名未定义（当前 last-write-wins）；清除个人组织的资产去向；跨进程一致性。工作区发现与原位采用遵循PF020；本域启用事实及其与现有层次求值的接缝尚未闭合。

验证义务与规范输入见[verification](verification/README.md)。尚未闭合的公共语义阻止相应提供者实施，不以迁移目录关闭业务缺口。

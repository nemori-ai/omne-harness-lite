# 资产治理的设计

本设计的公开数据由实际定义它的拥有者发布，不为它单独建空包。新的产品政策由产品负责人决定。

## 失败值与判定次序

操作表里每个操作的失败值集合是闭合的。集合里各值的先后由下面的通用判定次序和操作自己的局部次序决定，不能按表里的书写顺序补出设计没有的判定。任何一步读不到事实，立即答 `unavailable`，不再往下判后面的拒绝。

通用资格：

- 范围的管理者：组织层是本组织的有效超管，租户层是有效的本人。
- 组织创作权只给有效超管。普通成员的委托没有定义，按 `notPermitted` 拒绝。
- 租户创作权给有效的本人，任意角色。
- 读范围：出厂层给任意有效调用者，组织层给本组织任意有效成员，租户层给本人。
- 超管也不能碰其他成员的私有租户。

范围操作按这个次序取第一个拒绝：

1. `invalidInput`
2. 值级的 `crossTenant`
3. 范围存在性 `scopeNotFound`
4. 资格 `notPermitted`
5. 目标定位：资产、持有、配值，先后由操作规定
6. `officialImmutable`
7. `notOwner`
8. 局部状态

记录操作按这个次序取第一个拒绝：

1. 形状
2. 调用者有效
3. 记录可见。不可见与不存在答同一个 `assetNotFound`
4. 官方件
5. 所有者
6. 角色
7. 与记录相关的内容校验
8. 状态

记录可见之前，不能泄漏私有记录的类别、内容或存在。

简写 **B** = `invalidInput,crossTenant,scopeNotFound,notPermitted,holdingNotFound,unavailable`。B 只是本页的集合简写，不是新的公开接口。

## 操作

| 操作/条款 | 资格与局部首拒绝 | 闭合失败集合 | 原子写与重复 |
| --- | --- | --- | --- |
| createDraft  | 自身租户或本组织创作；owner 不属于 caller 侧先 crossTenant；保留命令名及内容形状先 invalidInput | invalidInput,crossTenant,scopeNotFound,notPermitted,unavailable | 新记录、草稿、caller 作者、必填 byAgent、空版本线与创建键登记同提交；(caller,creationKey) 在具名保留期认回原 ID，即使其余输入变；无键每次新建 |
| updateDraft  | 有效、可见、非 official、owner 侧创作；basedOn 须等于当前版本尾 | invalidInput,notPermitted,assetNotFound,officialImmutable,notOwner,versionSequenceBroken,unavailable | 只改草稿，不改身份/作者/owner/血缘/版本；同内容可重复；stale basedOn 拒绝；尚未发布的并发草稿编辑不受另一个 CAS 保护 |
| publish  | 同上；expected = 当前尾+1；名字/保留区在记录可见、owner、资格之后校验 | 同 updateDraft | 新连续不可变版本、publishedBy 和保留草稿同提交，不动持有；expected 已存在且属于同 caller、内容等于当前草稿则认回，否则版本断序；JSON 对象忽略成员顺序，数组保序 |
| promoteToOrganization  | ownOrganization 创作且记录为本人租户所有；非 official；已有分享不挡 | invalidInput,crossTenant,scopeNotFound,notPermitted,assetNotFound,officialImmutable,notOwner,unavailable | owner 改组织、持有依据随实际 owner 事实重算为 organization（不是 holding 写变更）、全部 active outgoing sharing 结束为 ownerChanged 同提交；作者/holding since/配置/锁/钉版不动，只通知 AssetPromoted，不另发 HoldingChanged；已归组织可认回但仍核组织创作资格 |
| delete  | owner 侧创作；当前引用集/份数不超过 acknowledged | invalidInput,notPermitted,assetNotFound,officialImmutable,notOwner,hasReferrers,unavailable | 记录不可读、版本不能公共解引用、ID 不复用；同提交 active sharing 写 sourceDeleted；不级联持有或引用；重放 assetNotFound |
| registerOfficial  | 仅系统 bootstrap 可达；meta 必填，不从 publisher 推断 | invalidInput,unavailable | 官方记录、v1、factory holding 及 meta 替换锁同提交；同内容不多发布；新内容追加版本；部署的 meta 决定锁 |
| hold  | 管理者；published；basis 由当前事实自动确定，公共 caller 不得传 basis 自签授权，只有 lineage/sharing 内部组合面可以提供；meta 不可替代；shared 不可 pinned；租户上层替换锁下仅同记录 current 可进 | invalidInput,crossTenant,scopeNotFound,notPermitted,assetNotFound,officialImmutable,notOwner,versionNotPublished,alreadyHeld,lockedAbove,unavailable | holding 唯一性、依据、选版、空配值、since 同提交；同资产+basis+选版认回，即使上层后来加锁；其他差异 alreadyHeld；plugin 成员不单独取得持有 |
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
| readAsset  | 有效可见 | invalidInput,notPermitted,assetNotFound,unavailable | 草稿仅 owner 侧有创作资格者可见；其他可读者明确“不向你展示”，不以版本正文补草稿。记录只返回版本 metadata、不含各版正文；持有指向已删除记录时 readAsset/readVersion 均返回“已删除”状态；删除/可见性失效须让缓存失效 |
| readVersion  | 有效可见、号已发布 | invalidInput,notPermitted,assetNotFound,versionNotPublished,unavailable | immutable 内容可缓存，但资产删除或失去可见性后不能继续公共解引用 |

## 跨域约束

- 所有写准入现读资格、锁、版本与引用，并和写在同一次可串行化提交里成立。组合引用的范围保护要覆盖新插入的行，不能只锁已经存在的行。
- 删除与移除先向调用者呈现当前引用集合，然后在提交里核 `current ⊆ acknowledged`，份数不大于确认过的份数。出现新引用时重新告知。确认的是一个集合，不是一个布尔的「知悉」。
- 首次复制是 createDraft、publish、hold 三步的组合，新增血缘只能经内部面写。重复复制是 updateDraft、publish 两步的组合。分享是以 shared 依据、current 选版的 hold，分享本身是否合法由[资产复制与分享](../asset-transfer/design.md)保证。全部组合参与同一个提供者、同一存储、同一次提交，任何一项失败就没有任何效果。不另造绕过这些写面的写入口。
- 复制碰到同一能力标识但没有血缘时，新建一份记录，旧持有不动。换不换持有由该层管理者决定。
- 事件是提交之后的通知与运行审计事实。通知不能漏发给应收告知的本人，也不能泄漏其他成员的私有身份。成员解除不删除持有。事件不是授权依据，撤权不给已在执行的工作发停止，这两条归[资产规格](../../../../packages/assets/SPEC.md#失败并发与恢复)。

## 未决

下列未决闭合之前，依赖它的那部分不按本设计实现。

| 未决 | 问题与读法 | 做到这一程时要定 |
| --- | --- | --- |
| 组织层的管理者与创作者 | [资产规格](../../../../packages/assets/SPEC.md#持有启禁与移除)第 84 行与[产品正文](../../product/assets-and-rules/design.md#把资产所有权交给组织须由人完成交付)第 146 行说组织层要「组织持有管理」资格，角色与资格的映射归治理模型。本设计把组织层管理者与组织创作权都定为有效超管。读法一：改成按资格判定，超管只是一种映射结果。读法二：保留超管。 | 读法一改通用资格两句和场景页角色矩阵「超级管理员」一列的依据，判定次序不变 |
| 普通成员的组织创作委托 | 普通成员能不能按被授予的权限在组织范围创作。本设计取「没有委托，一律 `notPermitted`」。[产品正文](../../product/assets-and-rules/design.md#asset-n01-明确非目标与边界)第 434 行写着不新增委托政策，尚无通用委托协议。 | 要委托时，createDraft、updateDraft、publish、promoteToOrganization、delete 都要加委托判定 |
| 未发布草稿的并发编辑 | updateDraft 只核 basedOn 等于当前版本尾。两次并发的草稿编辑互不保护，后写的覆盖先写的。[资产规格](../../../../packages/assets/SPEC.md#创作归属定义与发布)第 76 行要求过期的草稿编辑不能静默覆盖已确认的修改。 | 草稿要不要自己的修订号，以及对应的输入与失败值 |
| 配值的过期编辑 | assign、clearAssignment、lockAssignment、unlockAssignment 没有预期修订输入，也没有对应的失败值，后写的覆盖先写的。[资产规格](../../../../packages/assets/SPEC.md#设置配值清除与锁定)第 128 行与第 192 行要求写入核预期配值修订，过期答 `conflict`。 | 这几个操作的预期修订输入与失败值名 |
| 官方资产在租户层的持有 | [产品正文](../../product/assets-and-rules/design.md#把资产加入使用范围并看清为什么采用这份实现)第 51 行说部署提供的官方资产对每个合法租户视为已持有，租户不用先加入就能在自己这一层配值，但不能移除或禁用。本设计只给官方记录一份出厂层持有，租户层配值要先有本层持有，B 含 `holdingNotFound`。 | 租户层对官方资产的配值落在哪份持有上，以及 hold、unhold 对官方资产在租户层怎样答 |
| 组合环在定义时拒绝 | 本设计有失败名 `compositionCycle`，但只在求值时判，写面不拒。[资产规格](../../../../packages/assets/SPEC.md#组合与流转)第 107 行要求无终点的 Agent 定义递归在采用前拒绝。 | 写面要不要在定义时拒绝并答 `compositionCycle`。要的话 createDraft、publish 的失败集合多一个值 |
| 非资产引用 | listReferrers 与先告知集合不列日程等非资产引用。[资产规格](../../../../packages/assets/SPEC.md#持有启禁与移除)第 87 行要求改版、移除与退役先识别受影响的引用与消费者，不默认级联删除日程。 | 告知集合含不含日程等非资产引用，含的话由谁供给 |
| 替换锁下同一记录的版本差异 | 上层替换锁下，hold 只放行同一记录以 current 进入（场景 2.3 第 3a、3b 步）。同一记录其他版本差异的政策没定。 | 锁下同一记录各种选版组合的放行规则 |
| Agent 定义与 plugin 的属性及组合，MCP 动作集的写时来源 | 这几类的属性、组合与写时来源没定，本设计没有给出候选读法。 | 各类别的属性与写时来源 |
| 删除之后的求值去向 | 持有指向已删除的记录时，求值用哪一份，没定。 | 求值答缺合法定义，还是沿外层取下一份合法候选 |
| plugin 成员的配置位置 | [资产规格](../../../../packages/assets/SPEC.md#组合与流转)第 107 行只定了成员启用值在展开 plugin 时先求。成员的其余配值挂在哪份持有上，没定。 | 成员配值的目标与写面 |
| 清除个人组织时的资产去向 | 个人组织被清除时，它拥有的资产怎样处置，没定。 | 记录、持有与流转关系各自的结局 |
| 跨进程一致性 | 本设计要求全部写准入在同一提供者的一次可串行化提交里成立。[资产规格](../../../../packages/assets/SPEC.md#原则与约束)第 266 行要求跨进程时提供等价的条件提交与一致读取，做不到就答不支持或不可用。 | 跨进程部署下各组合怎样保持同提交 |
| 工作区来源的启用事实 | 工作区的发现与原位采用归[工作区产品正文](../../product/workspaces/design.md)第 63 至 67 行，导入的命令型 hook 逐件启用归租户设置（[资产规格](../../../../packages/assets/SPEC.md#设置工作区与同层合并)第 140 行）。资产治理这一侧的启用事实怎样表示、怎样接进现有的层次求值，没定。 | 启用事实的表示与求值接缝 |

验证义务见[验证](verification/README.md)。

/*
 * Evaluation.als —— 资产求值四步里可以写成结构关系的那几条性质。
 *
 * 对应契约：omne-harness-lite-design-2026-09-15 · capability.asset-evaluation · v1
 *   S-7   输入的一致性条件（本模型取其中四条作为 fact，见下）
 *   S-17  第 1 步①：先按禁用滤——资产级析取；工作区的禁用只管它自带的那批
 *   S-18  第 1 步②：再取最具体的一份，锁在最外那一把处截断
 *   S-19  官方件是下界
 *   S-20  第 2 步：组装（沿生效资产正文里的引用求可达集合）
 *   S-22  第 4 步：设置——按资产：只有指向生效资产的持有给值；锁截断的覆盖链（本模型只算 from，不算值）
 *   S-23  第 4 步：权限——按能力标识：组织、租户两格的在效持有（不论指向哪份资产）与会话格给值；
 *         带锁的配值是界，不带锁的配值与声明默认值是挑选；由里到外第一条落在界内的挑选给出 from，
 *         没有就取给了界的最里面那一格（账本 S10-b）。本模型只算 from，不算允许集合；
 *         「一条挑选落不落在界内」是值域上的事实，模型把它当作给定的布尔（Fits、defaultFits）
 *   S-24  工作区那一级在第 4 步只贡献设置，且不贡献落点与身份类
 *   S-25  工作区自带资产的权限项以最严值为出厂那一格的约束（不改变 from 的求法）
 *
 * 七条断言（前四条即施工简报 A6 点名的四条，第五条是契约 S-19 的下界，第六、七条是主线裁定：按能力标识、界与挑选）：
 *   (i)   TeamAssetsStayInTree              团队资产不出那棵树
 *   (ii)  LockTruncates                     锁截断
 *   (iii) DisableIsDisjunction              禁用析取
 *   (iv)  WorkspaceNeverSourcesPermission   工作区滤权（另附 WorkspaceNeverSourcesPlacement）
 *   (v)   OfficialLowerBound                官方件下界
 *   (vi)  ReplacementCannotEscapePermission 换了实现逃不出外层对这个能力标识锁下的界
 *   (vii) NonFittingPickNeverSources        与界不交的挑选不给出值（值来自最里一条落在界内的挑选）
 *
 * 本模型**不**表达：配值的取值本身（覆盖得到哪个值、允许集合交出哪几档、作者建议取不取）——
 * 那是值域上的计算，不是结构关系，证据形式是契约 S-33～S-36 的规范场景；
 * 替换件没声明、外层却约束过的权限项（S-23 最后一段：本模型只对生效资产声明的项下断言）；
 * 权限的 lockedAt；组合图成环的收场（契约缺口 G-1）；版本选用（G-2）——本模型把「生效资产的引用与属性项」
 * 当作资产的固定属性，等于假定选用的那一版已经定了；「谁可以用」怎么用成员资格求（G-15）；读入面（S-27、S-28）。
 *
 * 用法：Alloy Analyzer 6 逐条 check / run 本文件末尾的命令。
 * **`alloy exec` 的退出码与断言结果无关**（找到反例照样退出 0），因此本文件不登记为 formal task；
 * 结果按命令逐条读，记在 ../../verification.md，本文件不记录执行结果。
 */
module Evaluation

// ---------------------------------------------------------------------------
// 层与三条层序（契约 S-5）
// ---------------------------------------------------------------------------

abstract sig Layer {}
one sig Factory, Organization, Tenant, Workspace, Session extends Layer {}

// 能持有资产的四格；会话不是持有层。
fun HoldingLayers : set Layer { Factory + Organization + Tenant + Workspace }

// 资产归属层序：factory < organization < tenant < workspace（严格序，l1 -> l2 读作 l1 比 l2 外层）。
fun assetLt : Layer -> Layer {
  Factory -> (Organization + Tenant + Workspace)
  + Organization -> (Tenant + Workspace)
  + Tenant -> Workspace
}

// 设置层序：在资产归属层序之后再接会话。
fun settingLt : Layer -> Layer {
  assetLt + (Factory + Organization + Tenant + Workspace) -> Session
}

// 权限层序：factory · organization · tenant · session，**工作区不在其中**。
fun permissionLt : Layer -> Layer {
  Factory -> (Organization + Tenant + Session)
  + Organization -> (Tenant + Session)
  + Tenant -> Session
}

// ---------------------------------------------------------------------------
// 能力标识、资产与它们的所有者
// ---------------------------------------------------------------------------

sig Cap {}

sig Owner {}
// 租户所在那棵隶属树里的所有者。这是**组输入的那一方**现读出来的事实（契约第七节「前提」），
// 求值本身不读它；模型把它当作给定的关系。
sig TreeOwner in Owner {}

abstract sig Origin {}
one sig Official, Customized extends Origin {}

sig Item {}
sig PermissionItem in Item {}   // 权限项
sig PlacementItem in Item {}    // 设置项里「落点与身份」那一类
fact ItemKindsDisjoint { no PermissionItem & PlacementItem }

sig Asset {
  cap: one Cap,
  origin: one Origin,
  owner: lone Owner,
  refs: set Cap,     // 选用那一版正文里声明的引用（契约 S-10 规则一）
  items: set Item    // 选用那一版正文推出的属性项（契约 S-10 规则二）
}

// 官方件没有所有者这一格；自定义件恰有一个。
fact OfficialHasNoOwner { all a: Asset | a.origin = Official iff no a.owner }

// 工作区自带资产（契约 S-9）。
sig WsAsset in Asset {}
fact WsAssetIsCustomized { all a: WsAsset | a.origin = Customized }

// ---------------------------------------------------------------------------
// 求值输入：持有与配值（契约 S-6、S-7）
// ---------------------------------------------------------------------------

sig Holding {
  layer: one Layer,
  hcap: one Cap,
  asset: one Asset
}
sig Locked in Holding {}     // 持有上的 immutable：锁替换（S-18）
sig Disabled in Holding {}   // 持有上保留项 disabled 配成真（S-17）

sig Assign {
  at: one Layer,     // organization / tenant / workspace：挂在那一格对 acap 的持有上；session：会话格配值
  acap: one Cap,
  item: one Item
}
sig LockedAssign in Assign {}   // 配值上的 immutable

one sig Root { rootCap: one Cap }

// —— S-7 的一致性条件里本模型用到的那几条 ——

fact HoldingShape {
  all h: Holding | h.layer in HoldingLayers and h.asset.cap = h.hcap
  // 同一格、同一能力标识至多一份持有
  all disj h1, h2: Holding | not (h1.layer = h2.layer and h1.hcap = h2.hcap)
}

// S-7 C6：出厂那一格只持有官方件，且不带配值（出厂值就是声明里的默认值）。
fact FactoryHoldsOnlyOfficial {
  all h: Holding | h.layer = Factory implies h.asset.origin = Official
  no a: Assign | a.at = Factory
}

// S-7 C7：官方件不可禁用——指向官方件的持有，保留项 disabled 不得为真。
fact OfficialNeverDisabled { no h: Disabled | h.asset.origin = Official }

// S-7 C8（本版）：工作区那一格的持有恰是工作区自带资产的持有，自带资产只在那一格被持有。
fact WorkspaceHoldsOnlyItsOwn {
  all h: Holding | h.layer = Workspace iff h.asset in WsAsset
}

// 一条挑选落不落在界内（它与界相交，或它本身是空集）——值域上的事实，模型不算值，只取这个布尔。
sig Fits in Assign {}
one sig Values {
  defaultFits: Cap -> Item,   // 生效资产声明的默认值（出厂那一格的挑选）落在界内
  emptyBound: Cap -> Item     // 界是空集
}

// 配值挂在持有上：持有层的配值必须有那一格对同一能力标识的持有；同一格同一项至多一条。
fact AssignShape {
  all x: Assign | x.at != Session implies some h: Holding | h.layer = x.at and h.hcap = x.acap
  all disj x, y: Assign | not (x.at = y.at and x.acap = y.acap and x.item = y.item)
}

// —— 契约第七节的前提（不是 S-7 的条件，求值不检查它）——
// 组输入的那一方只把「此刻仍然成立」的持有交进来：每份被持有的资产要么是官方件，
// 要么它的所有者在租户那棵隶属树内。**不被持有的资产不受此约束**——
// 输入的 definitions 里可以多带几份（S-7 C5 允许），它们的所有者可以在树外。
fact InputHoldingsStayInTree {
  all h: Holding | h.asset.origin = Official or h.asset.owner in TreeOwner
}

// ---------------------------------------------------------------------------
// 第 1 步（契约 S-17、S-18）
// ---------------------------------------------------------------------------

// ①先按禁用滤：资产级析取。工作区那一格的「禁用」只对工作区自带资产参与。
fun disabledAssets : set Asset {
  { a: Asset | some h: Disabled | h.asset = a and (h.layer != Workspace or a in WsAsset) }
}

fun surviving : set Holding { { h: Holding | h.asset not in disabledAssets } }

// 起作用的锁：未被禁用滤掉、且不在工作区那一格（工作区配的 immutable 不加载，S-24）。
fun lockers[c: Cap] : set Holding {
  { h: surviving & Locked | h.hcap = c and h.layer != Workspace }
}

// 最外的那一把锁。
fun lockHolding[c: Cap] : set Holding {
  { h: lockers[c] | no h2: lockers[c] | h2.layer -> h.layer in assetLt }
}

// ②候选：锁的那一格及更外层的持有，加上更具体层里**指向同一份资产**的持有（配值用的持有不是替换）。
fun candidates[c: Cap] : set Holding {
  { h: surviving | h.hcap = c and
      (no lockHolding[c]
        or not (lockHolding[c].layer -> h.layer in assetLt)
        or h.asset = lockHolding[c].asset) }
}

// 取最具体的一份。
fun selected[c: Cap] : set Holding {
  { h: candidates[c] | no h2: candidates[c] | h.layer -> h2.layer in assetLt }
}

fun effective : Cap -> Asset {
  { c: Cap, a: Asset | some h: selected[c] | h.asset = a }
}

// ---------------------------------------------------------------------------
// 第 2 步（契约 S-20）
// ---------------------------------------------------------------------------

fun refStep : Cap -> Cap { { c1, c2: Cap | c2 in effective[c1].refs } }

fun reached : set Cap { Root.rootCap.*refStep }

fun composition : set Cap { reached & effective.Asset }

fun unresolvedCaps : set Cap { reached - effective.Asset }

// ---------------------------------------------------------------------------
// 第 4 步的 from（契约 S-22～S-25）。只算「值来自哪一格」，不算值。
// ---------------------------------------------------------------------------

// 设置（S-22）：按资产。
//   - 持有层（组织、租户、工作区）的配值只有在那一格的持有**指向生效资产**时才给值；
//   - 会话格的配值按能力标识给值；
//   - 工作区那一格对落点类设置项的配值不参与（S-24）。
fun settingParticipating[c: Cap, i: Item] : set Assign {
  { x: Assign | x.acap = c and x.item = i
      and (x.at = Session or (some h: surviving | h.layer = x.at and h.hcap = c and h.asset = effective[c]))
      and not (x.at = Workspace and i in PlacementItem) }
}

// 权限（S-23）：按能力标识。
//   - 组织、租户两格对 c 的持有**在效**（过了禁用、不在锁以里——即在 candidates 里）时，
//     那份持有上的配值参与，**不论它指向哪一份资产**；会话格的配值参与；
//   - 工作区那一格不在权限层序上，一律不参与（S-24）；出厂那一格不带配值（C6）。
fun permParticipating[c: Cap, i: Item] : set Assign {
  { x: Assign | x.acap = c and x.item = i
      and (x.at = Session
           or (x.at in Organization + Tenant and some h: candidates[c] | h.layer = x.at)) }
}

// 界：参与的配值里带锁的那些（账本 S10-b）。工作区自带资产的最严值也是界，但它在出厂那一格、
// 不是一条配值——它只在「没有挑选落在界内」时让 from 取 factory，由 permFrom 最后一支兑现。
fun permBounds[c: Cap, i: Item] : set Assign { permParticipating[c, i] & LockedAssign }

// 界非空时，每条界自己一定落在界内（交集包含于每一条界）。
fact BoundsFitUnlessEmpty {
  all c: Cap, i: Item | (c -> i) not in Values.emptyBound implies permBounds[c, i] in Fits
}

fun permInnermost[ls: set Layer] : set Layer { { l: ls | no l2: ls | l -> l2 in permissionLt } }

// 由里到外第一条落在界内的挑选；否则出厂那一格的挑选（声明默认值，工作区自带资产没有这一条）；
// 否则给了界的最里面那一格；都没有取出厂。
fun permFrom[c: Cap, i: Item] : set Layer {
  (some permParticipating[c, i] & Fits) => permInnermost[(permParticipating[c, i] & Fits).at]
  else ((c -> i) in Values.defaultFits and effective[c] not in WsAsset) => Factory
  else (some permBounds[c, i]) => permInnermost[permBounds[c, i].at]
  else Factory
}

// 设置：最外那一把锁所在的格；没有锁取最具体的有值格；都没有取出厂。
// 工作区配值上的 immutable 不加载（S-24），它的值照常参与但不上锁。
fun settingLockLayers[c: Cap, i: Item] : set Layer {
  (settingParticipating[c, i] & LockedAssign).at - Workspace
}

fun settingFrom[c: Cap, i: Item] : set Layer {
  (some settingLockLayers[c, i])
    => { l: settingLockLayers[c, i] | no l2: settingLockLayers[c, i] | l2 -> l in settingLt }
  else (no settingParticipating[c, i]) => Factory
  else { l: settingParticipating[c, i].at | no l2: settingParticipating[c, i].at | l -> l2 in settingLt }
}

fun valueFrom[c: Cap, i: Item] : set Layer {
  (i in PermissionItem) => permFrom[c, i] else settingFrom[c, i]
}

// ---------------------------------------------------------------------------
// 断言
// ---------------------------------------------------------------------------

/* (i) 团队资产不出那棵树（契约 S-18 + 第七节前提；PF-003 §6.1）。
   被选中的每份资产要么是官方件，要么所有者在租户那棵隶属树内。
   它**靠前提 InputHoldingsStayInTree 成立**，本断言核对的是求值没有别的来路：
   选中只从持有里选，不从 definitions 里另取一份、不从 plugin 或组合关系里带进一份。
   非平凡核对见 formal/README：去掉那条前提，本断言必须给出反例（说明模型里确实有树外资产可选）。 */
assert TeamAssetsStayInTree {
  all c: Cap, a: effective[c] | a.origin = Official or a.owner in TreeOwner
}

/* (ii) 锁截断（契约 S-18；PF-002 §5.5）。
   有起作用的锁，生效的就是最外那一把锁住的那份资产；
   等价地：锁那一格以内、指向别的资产的同标识持有，一份都不出现在生效结果里。 */
assert LockTruncates {
  all c: Cap | some lockHolding[c] implies {
    effective[c] = lockHolding[c].asset
    all h2: Holding |
      (h2.hcap = c and lockHolding[c].layer -> h2.layer in assetLt and h2.asset != lockHolding[c].asset)
        implies h2.asset not in effective[c]
  }
}

/* (iii) 禁用析取（契约 S-17；PF-002 §6.4）。
   组织、租户任一格把某份资产的 disabled 配成真，或工作区把它自带的那份配成真，
   这份资产就不出现在任何能力标识的生效结果里。 */
assert DisableIsDisjunction {
  all h: Disabled | (h.layer != Workspace or h.asset in WsAsset) implies h.asset not in Cap.effective
}

/* (iv) 工作区滤权（契约 S-23、S-24、S-25；PF-002 §5.7）。
   组合里任何一项权限的值都不来自工作区那一格。 */
assert WorkspaceNeverSourcesPermission {
  all c: composition, i: effective[c].items & PermissionItem | Workspace not in valueFrom[c, i]
}

/* (iv') 落点与身份类设置项的值同样不来自工作区那一格（契约 S-24）。 */
assert WorkspaceNeverSourcesPlacement {
  all c: composition, i: effective[c].items & PlacementItem | Workspace not in valueFrom[c, i]
}

/* (v) 官方件是下界（契约 S-19；PF-001 §6.2）。
   出厂那一格持有的每个能力标识，求值后都有一份生效资产。 */
assert OfficialLowerBound {
  all h: Holding | h.layer = Factory implies some effective[h.hcap]
}

/* (vi) 换了实现逃不出外层对这个能力标识锁下的界（契约 S-23；主线追加裁定与账本 S10-b）。
   组合里的 c、生效资产声明的权限项 i：组织或租户那一格对 c 的在效持有**指向另一份资产**
   （被替换掉、但仍在效的那一份），且那一格对 i 配了**带锁**的值——这条值就在 i 的界里。
   它与 permBounds 的定义很近，作用是把「按能力标识」钉住：
   把参与条件改回「只看指向生效资产的持有」，本断言必须给出反例（formal/README 的非平凡核对）。 */
assert ReplacementCannotEscapePermission {
  all c: composition, i: effective[c].items & PermissionItem, x: LockedAssign |
    (x.acap = c and x.item = i and x.at in Organization + Tenant
       and (some h: candidates[c] | h.layer = x.at and h.asset not in effective[c]))
    implies x in permBounds[c, i]
}

/* (vii) 与界不交的挑选不给出值（契约 S-23 合成第 2 条；账本 S10-b）。
   有挑选落在界内时，值来自其中一条，且没有一条落在界内的挑选比它更里。
   这一条把「内层覆盖外层、但只在界内算数」钉住：把 from 改回「参与的最里面那一格」（不问落不落在界内），
   本断言必须给出反例（formal/README 的非平凡核对）。 */
assert NonFittingPickNeverSources {
  all c: composition, i: effective[c].items & PermissionItem |
    some (permParticipating[c, i] & Fits) implies {
      permFrom[c, i] in (permParticipating[c, i] & Fits).at
      no x: permParticipating[c, i] & Fits | permFrom[c, i] -> x.at in permissionLt
    }
}

// ---------------------------------------------------------------------------
// 一致性核对：模型能产生契约 S-33 那种「四格齐全」的实例，
// 断言不是靠 fact 互相矛盾空泛成立的。
// ---------------------------------------------------------------------------

pred fourLayerInstance {
  // 租户替换了出厂的那份
  some c: Cap | selected[c].layer = Tenant
    and some h: Holding | h.hcap = c and h.layer = Factory and h.asset not in effective[c]
  // 一把锁挡住了更具体层里的另一份
  some c: Cap | some lockHolding[c]
    and some h: Holding | h.hcap = c and lockHolding[c].layer -> h.layer in assetLt
                          and h.asset != lockHolding[c].asset
  // 工作区自带的一份生效、进了组合，且带权限项
  some c: composition | effective[c] in WsAsset and some effective[c].items & PermissionItem
  // 有一个引用求不出
  some unresolvedCaps
  // 有一份被禁用滤掉
  some Disabled
}

// (vi) 的前件可以成立：外层一份被替换、仍在效的持有，对生效资产声明的一项权限配了带锁的值。
pred replacementConstrained {
  some c: composition, i: effective[c].items & PermissionItem, x: LockedAssign |
    x.acap = c and x.item = i and x.at in Organization + Tenant
    and (some h: candidates[c] | h.layer = x.at and h.asset not in effective[c])
}

// (vii) 的前件不是空泛的：有一条更里的挑选与界不交、被跳过，值来自更外的一条。
pred pickSkipped {
  some c: composition, i: effective[c].items & PermissionItem, x: permParticipating[c, i] - Fits |
    some (permParticipating[c, i] & Fits) and permFrom[c, i] -> x.at in permissionLt
}

run fourLayerInstance for 6 but 4 Cap, 7 Holding, 4 Assign, 4 Item, 3 Owner
run replacementConstrained for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner
run pickSkipped for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner

check TeamAssetsStayInTree for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner
check LockTruncates for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner
check DisableIsDisjunction for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner
check WorkspaceNeverSourcesPermission for 6 but 4 Cap, 5 Assign, 3 Item, 3 Owner
check WorkspaceNeverSourcesPlacement for 6 but 4 Cap, 5 Assign, 3 Item, 3 Owner
check OfficialLowerBound for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner
check ReplacementCannotEscapePermission for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner
check NonFittingPickNeverSources for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner

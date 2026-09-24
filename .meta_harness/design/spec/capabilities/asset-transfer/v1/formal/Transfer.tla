------------------------------- MODULE Transfer -------------------------------
(***************************************************************************)
(* 资产复制与分享（PF-003 rev 5）：两类待确认件的收场互斥、复制落地与分享   *)
(* 使用的边界、落点不进别人的租户级、组织级的落地只经目标超管、血缘与分享   *)
(* 记录的唯一性、分享结束之后不复活。                                       *)
(*                                                                         *)
(* 对应契约条款（capability.asset-transfer v1）：                            *)
(*   S-7   两类待确认件共用的过期语义（确认／撤回／过期互斥，终结记录不改写）*)
(*   S-8   同一 (资产, 被分享方那一层) 至多一份生效的分享                    *)
(*   S-9   分享此刻是否生效：记录 active ∧ 关系此刻成立 ∧ 自确认以来未断过   *)
(*   S-10  复制血缘：同一 (源, 落进的那一层) 至多一份带该血缘的目标记录       *)
(*   S-12  流转边界：团队资产不出那棵树                                     *)
(*   S-17  每道准入现读，确认时再判一遍                                     *)
(*   S-18  确认（与本人型的发起）是一次提交；同一落点序列化                 *)
(*   S-22  组织型复制只由目标组织的有效超管确认                             *)
(*   S-31  关系断开：分享在使用时失效，不靠事件，也不复活                   *)
(*   S-49  方向与落点：跨组织不落别人的租户级，租户级落不进别人的组织级     *)
(*   S-52  分享方删除资产、或把它提升到组织（所有权易手）：分享随之结束     *)
(*                                                                         *)
(* 七个布尔常量各对应一处保护，主配置全 TRUE；去掉任何一处都应给出反例：     *)
(*   SameCommit     —— 确认的重判、落地与终结记录落在同一动作里（S-18）。    *)
(*   ConfirmRecheck —— 确认时现读发起者资格与边界（S-17）。                  *)
(*   UseTimeCheck   —— 每次使用现读关系（S-9、S-31）；FALSE 时只看一个由     *)
(*                     可能丢失的事件反应写下的「已记为解除」标记。          *)
(*   SinceCheck     —— S-9 的第三个合取项：连接二者的隶属关系、分享两端的    *)
(*                     成员关系，建立时刻都不晚于确认时刻（不复活）。        *)
(*   LayerCheck     —— 发起时的落点判定（S-49）。                           *)
(*   ConfirmerCheck —— 组织型复制的确认者是目标组织的有效超管（S-22）。      *)
(*   SourceEndCheck —— 删除与提升的那一次提交里，以那份资产为资产的全部    *)
(*                     active 分享一并写 revoked（S-52）。                 *)
(* MaxClock 是规模上界，不是契约性质：隶属建立与重新加入合计至多这么多次。   *)
(* Scene 把复制与分享两组场景分开检查（合在一起的状态空间超出登记任务的时限）；*)
(* 两组共享同一个环境（隶属、成员关系、时间、资产移除），互不交互；删除与   *)
(* 提升只在分享那一组里走（对复制那一组，它们与「移除」效果相同）。          *)
(*                                                                         *)
(* 本模型**不**表达的（各有自己的证据形式，见 ../../verification.md）：      *)
(*   覆盖不碰配值（S-41，写集合的约束在模型里是 UNCHANGED，被建模方式吸收）； *)
(*   plugin 随行与引用告知（S-14）；个人组织（它没有树与隶属的交错，边界判据 *)
(*   是常量）；角色变化（超管降级）；读面与失败值（各操作的 ⑥⑧）；存储不可 *)
(*   用（unavailable）；组织内分享邀请的确认者核对（只建了组织型复制那一条）。*)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    SameCommit,       \* BOOLEAN（S-18）
    ConfirmRecheck,   \* BOOLEAN（S-17）
    UseTimeCheck,     \* BOOLEAN（S-9 / S-31）
    SinceCheck,       \* BOOLEAN（S-9 第三个合取项）
    LayerCheck,       \* BOOLEAN（S-49）
    ConfirmerCheck,   \* BOOLEAN（S-22）
    SourceEndCheck,   \* BOOLEAN（S-52）
    MaxClock,         \* 自然数：规模上界
    Scene             \* "copy" 或 "share"：两组场景分开检查

None == "none"

(***************************************************************************)
(* 固定的场景。三个团队组织 t1、t2、t3。两个账号 a、b 的四个租户身份：       *)
(*   A1 = (t1, a) 超管   A2 = (t2, a) 普通成员                              *)
(*   B1 = (t1, b) 普通成员   B2 = (t2, b) 超管                              *)
(* 角色不变；A1、B1 的成员关系会解除与重新建立，A2、B2 恒有效。              *)
(* 两份资产：x 在 t1 组织级；w 在 A1 的租户级（A1 可以把它提升到 t1）。     *)
(*                                                                         *)
(* 待确认件：c1、c2——组织型复制通知，x → t2 组织级（A1 发起，同源同落点，  *)
(*   才测得出首次被判两次）；s1、s2——组织—组织分享邀请，x → t2（同一对，    *)
(*   才测得出至多一份生效的分享）；s3——组织内分享邀请，w → B1。              *)
(* 本人型复制：k1、k2 两次，w → A2（发起即落地，不产生待确认件）。          *)
(* 分享记录：s1、s2、s3 各由各自邀请的确认产生；o1 是本人型分享 w → A2，    *)
(*   发起即成立。                                                           *)
(* 落点名：O2 = t2 组织级；A2、B2 = 那两个租户的租户级。                     *)
(***************************************************************************)
Team      == {"t1", "t2", "t3"}
Mutable   == {"A1", "B1"}
OrgOf(x)  == IF x \in {"A1", "B1"} THEN "t1" ELSE "t2"
IsAdmin(x) == x \in {"A1", "B2"}
Assets    == {"x", "w"}
Copies    == {"c1", "c2"}
Invites   == {"s1", "s2", "s3"}
Offers    == Copies \cup Invites
Owns      == {"k1", "k2"}
Recs      == Invites \cup {"o1"}
AssetOf(o) == IF o \in {"c1", "c2", "s1", "s2"} THEN "x" ELSE "w"
CopyScene  == Scene = "copy"
ShareScene == Scene = "share"
(* 本场景里会被发起的待确认件；过期只让每类的第一份走时间（另一份走撤回、    *)
(* 重复与资产移除），判定式对每一份相同。                                   *)
SceneOffers == IF CopyScene THEN Copies ELSE Invites
Tickable    == {"c1", "s1"}

OfferStates == {"unissued", "pending", "accepted", "withdrawn"}
(* 撤销与移除在模型里是同一个终态记录 "ended"：两者只差写下者（S-28 / S-29）。 *)
RecStates   == {"none", "active", "ended"}
Stages      == {"no", "first", "repeat", "new", "twin"}
SrcStates   == {"held", "removed", "promoted", "deleted"}

VARIABLES
    parent,    \* Team -> Team \cup {None}：上级组织属性（环境）
    affSince,  \* Team -> Nat：当前上级关系建立的时刻；无上级时为 0
    member,    \* Mutable -> BOOLEAN：成员关系此刻有效（环境）
    effSince,  \* Mutable -> Nat：成员关系最近一次成为有效的时刻
    clock,     \* 逻辑时钟：只在隶属建立与重新加入时前进
    src,       \* Assets -> SrcStates：那份资产此刻怎样。"held"：S-7 的指向对象此刻存在；
               \*   "removed"：所有者那一层移除了它；"promoted"：提升到组织、所有者易手；
               \*   "deleted"：记录被删除。离开 "held" 之后不回来（标识不复用、所有者至多变一次）
    off,       \* Offers -> OfferStates
    late,      \* Offers -> BOOLEAN：now > expiresAt
    staged,    \* (Offers \cup Owns) -> Stages：拆步时第一步的判定（仅 ~SameCommit）
    linO2,     \* t2 组织级里带「来自 x」血缘的记录份数（S-10）
    linA2,     \* A2 租户级里带「来自 w」血缘的记录份数（S-10）
    sh,        \* Recs -> RecStates：分享记录状态
    conf,      \* Recs -> Nat：分享确认（本人型：发起）的时刻
    mat,       \* Recs -> BOOLEAN：「已记为解除」标记（仅 ~UseTimeCheck）
    leak       \* 历史：发生过的违反种类

vars == <<parent, affSince, member, effSince, clock, src, off, late, staged,
          linO2, linA2, sh, conf, mat, leak>>

(****************************** 派生 ***************************************)
Up(S) == {parent[y] : y \in {z \in S : parent[z] # None}}

(* {o} ∪ ancestorChain(o)：data.identity-values/v1#S-14。三个组织两跳即到头。 *)
SelfAndAncestors(o) ==
    LET l1 == {o} \cup Up({o})
        l2 == l1 \cup Up(l1)
    IN  l2 \cup Up(l2)

(* data.identity-values/v1#S-15。 *)
ShareAncestor(x, y) == SelfAndAncestors(x) \cap SelfAndAncestors(y) # {}
Boundary(x, y)      == x # y /\ ShareAncestor(x, y)

(* S-9：连接二者的隶属关系 = 两条含自身的上级链的对称差里，每个组织到它上级 *)
(* 的那一条（各自沿上级链走到最近的共同上级为止）。                         *)
PathLinks(x, y) ==
    (SelfAndAncestors(x) \cup SelfAndAncestors(y))
        \ (SelfAndAncestors(x) \cap SelfAndAncestors(y))

Member(x) == IF x \in Mutable THEN member[x] ELSE TRUE
Since(x)  == IF x \in Mutable THEN effSince[x] ELSE 0

TreeRel       == Boundary("t1", "t2")
TreeStale(c)  == \E n \in PathLinks("t1", "t2") : affSince[n] > c

(* S-9 第二个合取项里成员关系那一半：分享两端里是租户的，此刻是有效成员。 *)
MemberRel(s) ==
    CASE s \in {"s1", "s2"} -> TRUE
      [] s = "s3"           -> Member("A1") /\ Member("B1")
      [] s = "o1"           -> Member("A1") /\ Member("A2")

(* S-9 第二个合取项：让这段分享成立的那层关系此刻成立。 *)
Rel(s) ==
    CASE s \in {"s1", "s2"} -> TreeRel
      [] s = "s3"           -> Member("A1") /\ Member("B1")
      [] s = "o1"           -> TreeRel /\ Member("A1") /\ Member("A2")

(* S-9 第三个合取项的否定：那层关系里有一条是在确认之后才（重新）建立的。 *)
Stale(s) ==
    CASE s \in {"s1", "s2"} -> TreeStale(conf[s])
      [] s = "s3"           -> Since("A1") > conf[s] \/ Since("B1") > conf[s]
      [] s = "o1"           -> TreeStale(conf[s])
                               \/ Since("A1") > conf[s] \/ Since("A2") > conf[s]

Effective(s) == sh[s] = "active" /\ Rel(s) /\ (SinceCheck => ~Stale(s))

(* S-8：同一 (资产, 被分享方那一层) 此刻已有一份生效的分享。模型里只有 s1、s2 同对。 *)
LiveTwin(o) == \E s \in Invites : s # o /\ {s, o} = {"s1", "s2"} /\ Effective(s)

(* S-7 的存在性：记录在、所有者那一层此刻持有发起时那一份。移除、提升（所有者  *)
(* 那一层换成 t1 的组织级，它不持有发起时那一份）、删除都使它为假，且不回来。   *)
Live(a) == src[a] = "held"

(* S-52：分享跟随的那份资产已不归分享方——被删除，或所有权易手。               *)
Gone(a) == src[a] \in {"promoted", "deleted"}

(* data.offer-expiry/v1#S-8：时间到，或指向的对象不存在。 *)
Expired(o) == late[o] \/ ~Live(AssetOf(o))

(* S-22 / S-26 再判：发起者仍是有效成员（A1 的超管身份不变）、关系仍成立。 *)
CopyOK      == Member("A1") /\ TreeRel
ShareOK(o)  == IF o = "s3" THEN Member("A1") /\ Member("B1")
                           ELSE Member("A1") /\ TreeRel
Ok(o)       == IF o \in Copies THEN CopyOK ELSE ShareOK(o)

(* S-20 本人型：源侧与目标侧成员资格有效、同树、源还在。 *)
OwnOK == Live("w") /\ Member("A1") /\ Member("A2") /\ TreeRel

TargetAdmin(who) == OrgOf(who) = "t2" /\ IsAdmin(who)

TypeOK ==
    /\ parent   \in [Team -> Team \cup {None}]
    /\ affSince \in [Team -> 0..MaxClock]
    /\ member   \in [Mutable -> BOOLEAN]
    /\ effSince \in [Mutable -> 0..MaxClock]
    /\ clock    \in 0..MaxClock
    /\ src      \in [Assets -> SrcStates]
    /\ off      \in [Offers -> OfferStates]
    /\ late     \in [Offers -> BOOLEAN]
    /\ staged   \in [Offers \cup Owns -> Stages]
    /\ linO2    \in 0..2
    /\ linA2    \in 0..2
    /\ sh       \in [Recs -> RecStates]
    /\ conf     \in [Recs -> 0..MaxClock]
    /\ mat      \in [Recs -> BOOLEAN]
    /\ leak     \subseteq {"accept", "copy", "use", "ended", "revived",
                           "foreign", "orgbypass", "gone"}

Init ==
    /\ parent   = [t \in Team |-> None]
    /\ affSince = [t \in Team |-> 0]
    /\ member   = [x \in Mutable |-> TRUE]
    /\ effSince = [x \in Mutable |-> 0]
    /\ clock    = 0
    /\ src      = [a \in Assets |-> "held"]
    /\ off      = [o \in Offers |-> "unissued"]
    /\ late     = [o \in Offers |-> FALSE]
    /\ staged   = [o \in Offers \cup Owns |-> "no"]
    /\ linO2    = 0
    /\ linA2    = 0
    /\ sh       = [s \in Recs |-> "none"]
    /\ conf     = [s \in Recs |-> 0]
    /\ mat      = [s \in Recs |-> FALSE]
    /\ leak     = {}

(******************************* 环境 **************************************)
(* organization-governance/v1#S-32：接受隶属请求（含判环）；建立时刻 = 新时钟。 *)
Affiliate(c, p) ==
    /\ clock < MaxClock
    /\ c # p
    /\ parent[c] = None
    /\ c \notin SelfAndAncestors(p)
    /\ clock'    = clock + 1
    /\ parent'   = [parent EXCEPT ![c] = p]
    /\ affSince' = [affSince EXCEPT ![c] = clock + 1]
    /\ UNCHANGED <<member, effSince, src, off, late, staged, linO2, linA2,
                   sh, conf, mat, leak>>

(* organization-governance/v1#S-33：任一方单方面解除。 *)
Dissolve(c) ==
    /\ parent[c] # None
    /\ parent'   = [parent EXCEPT ![c] = None]
    /\ affSince' = [affSince EXCEPT ![c] = 0]
    /\ UNCHANGED <<member, effSince, clock, src, off, late, staged, linO2,
                   linA2, sh, conf, mat, leak>>

(* organization-governance/v1#S-29 / #S-25：退出与再加入（同一租户身份）。 *)
Leave(x) ==
    /\ member[x]
    /\ member' = [member EXCEPT ![x] = FALSE]
    /\ UNCHANGED <<parent, affSince, effSince, clock, src, off, late, staged,
                   linO2, linA2, sh, conf, mat, leak>>

Rejoin(x) ==
    /\ clock < MaxClock
    /\ ~member[x]
    /\ clock'    = clock + 1
    /\ member'   = [member EXCEPT ![x] = TRUE]
    /\ effSince' = [effSince EXCEPT ![x] = clock + 1]
    /\ UNCHANGED <<parent, affSince, src, off, late, staged, linO2, linA2,
                   sh, conf, mat, leak>>

(* 时间走过 expiresAt。 *)
Tick(o) ==
    /\ o \in Tickable
    /\ off[o] = "pending"
    /\ ~late[o]
    /\ late' = [late EXCEPT ![o] = TRUE]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, off,
                   staged, linO2, linA2, sh, conf, mat, leak>>

(* 指向的资产被所有者那一层移除（S-7）；复制那一组里它同时代表删除。不回来。  *)
(* 移除不结束已确认的分享：记录还在，分享跟随的仍是分享方当前发布的那一版。   *)
RemoveAsset(a) ==
    /\ src[a] = "held"
    /\ src' = [src EXCEPT ![a] = "removed"]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, off, late,
                   staged, linO2, linA2, sh, conf, mat, leak>>

(* S-52 的写集合：以 a 为资产的全部 active 分享（含派生为 dissolved 的）写结束。*)
EndOf(a)   == [s \in Recs |-> IF AssetOf(s) = a /\ sh[s] = "active" THEN "ended" ELSE sh[s]]
ConfOf(a)  == [s \in Recs |-> IF AssetOf(s) = a /\ sh[s] = "active" THEN 0 ELSE conf[s]]

(* capability.asset-governance/v1#S-28 删除：记录不再存在。SourceEndCheck：同一次 *)
(* 提交里以它为资产的全部 active 分享写 revoked（原因 sourceDeleted，S-52）。     *)
DeleteAsset(a) ==
    /\ ShareScene
    /\ src[a] # "deleted"
    /\ src' = [src EXCEPT ![a] = "deleted"]
    /\ IF SourceEndCheck
          THEN /\ sh'   = EndOf(a)
               /\ conf' = ConfOf(a)
          ELSE UNCHANGED <<sh, conf>>
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, off, late,
                   staged, linO2, linA2, mat, leak>>

(* capability.asset-governance/v1#S-27 提升：A1 把他租户级的 w 提升到 t1，所有者 *)
(* 易手，至多一次、不可逆。提升不被分享挡住（S-8）。SourceEndCheck：同一次提交 *)
(* 里 A1 作为分享方的全部 active 分享写 revoked（原因 ownerChanged，S-52）。     *)
Promote ==
    /\ ShareScene
    /\ src["w"] \in {"held", "removed"}
    /\ Member("A1")
    /\ src' = [src EXCEPT !["w"] = "promoted"]
    /\ IF SourceEndCheck
          THEN /\ sh'   = EndOf("w")
               /\ conf' = ConfOf("w")
          ELSE UNCHANGED <<sh, conf>>
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, off, late,
                   staged, linO2, linA2, mat, leak>>

(************************ 组织型与邀请：发起与撤回 **************************)
(* S-20 组织型 / S-24 组织—组织、组织内：发起时判边界与资格。 *)
Issue(o) ==
    /\ o \in SceneOffers
    /\ off[o] = "unissued"
    /\ Live(AssetOf(o))
    /\ Ok(o)
    /\ off' = [off EXCEPT ![o] = "pending"]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, late,
                   staged, linO2, linA2, sh, conf, mat, leak>>

(* S-21 / S-25：已过期的不写终结记录。 *)
Withdraw(o) ==
    /\ off[o] = "pending"
    /\ ~Expired(o)
    /\ off' = [off EXCEPT ![o] = "withdrawn"]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, late,
                   staged, linO2, linA2, sh, conf, mat, leak>>

(******************************* 确认 **************************************)
(* S-22：组织型复制的确认，由 who 做。SameCommit：重判、落地、终结记录同一动作。 *)
ConfirmCopy(o, who) ==
    /\ SameCommit
    /\ off[o] = "pending"
    /\ ~Expired(o)
    /\ ConfirmerCheck => TargetAdmin(who)
    /\ ConfirmRecheck => CopyOK
    /\ off'   = [off EXCEPT ![o] = "accepted"]
    /\ linO2' = IF linO2 = 0 THEN 1 ELSE linO2
    /\ leak'  = leak \cup (IF CopyOK THEN {} ELSE {"copy"})
                     \cup (IF TargetAdmin(who) THEN {} ELSE {"orgbypass"})
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, late,
                   staged, linA2, sh, conf, mat>>

(* S-26：分享确认。同一对已有生效的就认回，否则新建，确认时刻记下。       *)
ConfirmShare(o) ==
    /\ SameCommit
    /\ off[o] = "pending"
    /\ ~Expired(o)
    /\ ConfirmRecheck => ShareOK(o)
    /\ off' = [off EXCEPT ![o] = "accepted"]
    /\ IF LiveTwin(o)
          THEN UNCHANGED <<sh, conf>>
          ELSE /\ sh'   = [sh EXCEPT ![o] = "active"]
               /\ conf' = [conf EXCEPT ![o] = clock]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, late,
                   staged, linO2, linA2, mat, leak>>

(* ~SameCommit：第一步读、判定并记下打算做什么；第二步照记下的写，不再复查。 *)
(* 拆步只用于三个同提交的有效性核对，确认者取目标超管 B2，不再展开 who。     *)
ConfirmBegin(o) ==
    /\ ~SameCommit
    /\ off[o] = "pending"
    /\ ~Expired(o)
    /\ staged[o] = "no"
    /\ ConfirmRecheck => Ok(o)
    /\ staged' = [staged EXCEPT ![o] =
                    IF o \in Copies
                       THEN IF linO2 = 0 THEN "first" ELSE "repeat"
                       ELSE IF LiveTwin(o) THEN "twin" ELSE "new"]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, off, late,
                   linO2, linA2, sh, conf, mat, leak>>

ConfirmEnd(o) ==
    /\ o \in Offers
    /\ staged[o] # "no"
    /\ off'    = [off EXCEPT ![o] = "accepted"]
    /\ leak'   = leak
                 \cup (IF off[o] = "pending" /\ ~Expired(o) THEN {} ELSE {"accept"})
                 \cup (IF o \in Copies /\ ~CopyOK THEN {"copy"} ELSE {})
    /\ linO2'  = IF staged[o] = "first" THEN linO2 + 1 ELSE linO2
    /\ sh'     = IF staged[o] = "new" THEN [sh EXCEPT ![o] = "active"] ELSE sh
    /\ conf'   = IF staged[o] = "new" THEN [conf EXCEPT ![o] = clock] ELSE conf
    /\ staged' = [staged EXCEPT ![o] = "no"]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, late,
                   linA2, mat>>

(************************** 本人型：发起即落地 ******************************)
(* S-20 本人型复制：w → tgt。LayerCheck：落点只能是发起者自己在 t2 的租户级。 *)
(* tgt = "B2" 是别人的租户级；tgt = "O2" 是租户级落进别人的组织级。          *)
OwnCopy(tgt) ==
    /\ CopyScene
    /\ SameCommit
    /\ LayerCheck => tgt = "A2"
    /\ OwnOK
    /\ linA2' = IF tgt = "A2" /\ linA2 = 0 THEN 1 ELSE linA2
    /\ leak'  = leak \cup (IF tgt = "B2" THEN {"foreign"} ELSE {})
                     \cup (IF tgt = "O2" THEN {"orgbypass"} ELSE {})
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, off, late,
                   staged, linO2, sh, conf, mat>>

(* ~SameCommit 下的本人型复制：拆成读—写两步（只为同落点序列化的核对）。 *)
OwnBegin(k) ==
    /\ CopyScene
    /\ ~SameCommit
    /\ staged[k] = "no"
    /\ OwnOK
    /\ staged' = [staged EXCEPT ![k] = IF linA2 = 0 THEN "first" ELSE "repeat"]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, off, late,
                   linO2, linA2, sh, conf, mat, leak>>

OwnEnd(k) ==
    /\ staged[k] # "no"
    /\ linA2'  = IF staged[k] = "first" THEN linA2 + 1 ELSE linA2
    /\ leak'   = leak \cup (IF OwnOK THEN {} ELSE {"copy"})
    /\ staged' = [staged EXCEPT ![k] = "no"]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, off, late,
                   linO2, sh, conf, mat>>

(* S-24 本人型分享：w → tgt，发起即成立。一段本人型分享在模型里只建一次；   *)
(* 断过之后再分享是新的一段，模型不建第二段（它与 s1、s2 那一对是同一个形状）。*)
OwnShare(tgt) ==
    /\ ShareScene
    /\ SameCommit
    /\ LayerCheck => tgt = "A2"
    /\ OwnOK
    /\ IF tgt = "A2"
          THEN /\ sh["o1"] = "none" \/ Effective("o1")
               /\ IF sh["o1"] = "none"
                     THEN /\ sh'   = [sh EXCEPT !["o1"] = "active"]
                          /\ conf' = [conf EXCEPT !["o1"] = clock]
                     ELSE UNCHANGED <<sh, conf>>
               /\ UNCHANGED leak
          ELSE /\ leak' = leak \cup {"foreign"}
               /\ UNCHANGED <<sh, conf>>
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, off, late,
                   staged, linO2, linA2, mat>>

(***************************** 分享的结束与使用 *****************************)
(* S-28 撤销 / S-29 移除：写下结束记录；确认时刻此后不再参与任何判定。 *)
EndSharing(s) ==
    /\ sh[s] = "active"
    /\ sh'   = [sh EXCEPT ![s] = "ended"]
    /\ conf' = [conf EXCEPT ![s] = 0]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, off, late,
                   staged, linO2, linA2, mat, leak>>

(* 一次使用（求值时认这份持有）。UseTimeCheck：按 S-9 现读；否则只看标记。 *)
(* 使用只在违反时留下历史：越出那棵树、某一端的成员关系已解除、断过又接上、 *)
(* 跟随的资产已被删除或已不归分享方。                                     *)
Use(s) ==
    /\ IF UseTimeCheck THEN Effective(s) ELSE (sh[s] = "active" /\ ~mat[s])
    /\ leak' = leak
               \cup (IF s \in {"s1", "s2", "o1"} /\ ~TreeRel THEN {"use"} ELSE {})
               \cup (IF ~MemberRel(s) THEN {"ended"} ELSE {})
               \cup (IF Stale(s) THEN {"revived"} ELSE {})
               \cup (IF Gone(AssetOf(s)) THEN {"gone"} ELSE {})
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, off, late,
                   staged, linO2, linA2, sh, conf, mat>>

(* 仅 ~UseTimeCheck：对「关系已断」的事件反应，可能发生也可能永远不发生。 *)
Materialize(s) ==
    /\ ~UseTimeCheck
    /\ sh[s] = "active"
    /\ ~Rel(s)
    /\ ~mat[s]
    /\ mat' = [mat EXCEPT ![s] = TRUE]
    /\ UNCHANGED <<parent, affSince, member, effSince, clock, src, off, late,
                   staged, linO2, linA2, sh, conf, leak>>

Next ==
    \/ \E c \in Team, p \in Team : Affiliate(c, p)
    \/ \E c \in Team : Dissolve(c)
    \/ \E x \in Mutable : Leave(x) \/ Rejoin(x)
    \/ \E o \in Offers : Tick(o) \/ Issue(o) \/ Withdraw(o)
                         \/ ConfirmBegin(o) \/ ConfirmEnd(o)
    \/ \E o \in Copies, who \in {"A1", "A2", "B2"} : ConfirmCopy(o, who)
    \/ \E o \in Invites : ConfirmShare(o)
    \/ \E a \in Assets : RemoveAsset(a) \/ DeleteAsset(a)
    \/ Promote
    \/ \E tgt \in {"A2", "B2", "O2"} : OwnCopy(tgt)
    \/ \E k \in Owns : OwnBegin(k) \/ OwnEnd(k)
    \/ \E tgt \in {"A2", "B2"} : OwnShare(tgt)
    \/ \E s \in Recs : EndSharing(s) \/ Use(s) \/ Materialize(s)

Spec == Init /\ [][Next]_vars

(*************************** 待检查的不变量 ********************************)
(* S-7 / S-18：过期、撤回或已确认的待确认件，确认不产生效果。 *)
NoLateOrDoubleSettle == "accept" \notin leak

(* S-12 / S-17：复制只在发起者资格有效、源与目标同树时落地。 *)
CopyLandsInsideBoundary == "copy" \notin leak

(* S-12 / S-9：跨组织的分享只在此刻同树时被使用。 *)
UseInsideBoundary == "use" \notin leak

(* S-9 / S-32：分享两端里是租户的那一端，成员关系解除之后分享不被使用     *)
(*（隶属那一半是 UseInsideBoundary）。                                     *)
UseOnlyWhileMembersEffective == "ended" \notin leak

(* S-9 / S-31：断过又接上的关系上的分享不被使用（不复活，使用点上的形式）。 *)
NoRevivedUse == "revived" \notin leak

(* S-49：跨组织不落别人的租户级——复制落地与分享成立都不进别人的租户级。 *)
NoForeignTenantLanding == "foreign" \notin leak

(* S-22 / S-49：落进一个组织的组织级，只经那个组织的有效超管做出。 *)
OrgLevelLandingByTargetAdmin == "orgbypass" \notin leak

(* S-10 / S-18：同一 (源, 落进的那一层) 至多一份带该血缘的目标记录。 *)
AtMostOneLineageTarget == linO2 <= 1 /\ linA2 <= 1

(* S-8 / S-18：同一 (资产, 被分享方那一层) 至多一份生效的分享。 *)
AtMostOneLiveSharingPerPair == ~(Effective("s1") /\ Effective("s2"))

(* S-52：跟随的资产被删除或所有权易手之后，没有一份以它为资产的分享记录仍为   *)
(* active——既包括那一刻已有的（同一次提交里写结束），也包括此后才会被确认或  *)
(* 发起的（S-7 的存在性已为假，确认与本人型发起都过不去）。                   *)
SharingEndsWithSource ==
    \A s \in Recs : Gone(AssetOf(s)) => sh[s] # "active"

(* S-52 在使用点上的形式：那样的分享不被使用。 *)
NoUseAfterSourceGone == "gone" \notin leak

(* S-7：效果只来自一次确认（邀请产生的分享、组织型复制的落地）。 *)
EffectsOnlyFromConfirmation ==
    /\ \A s \in Invites : sh[s] # "none" => off[s] = "accepted"
    /\ linO2 > 0 => \E c \in Copies : off[c] = "accepted"

(***************************** 待检查的动作与时序性质 ***********************)
(* S-7：终结记录一经写下不改写。 *)
SettledStable ==
    [][\A o \in Offers : off[o] \in {"accepted", "withdrawn"} => off'[o] = off[o]]_vars

(* S-8：撤销与移除是终态记录。 *)
EndedStable ==
    [][\A s \in Recs : sh[s] = "ended" => sh'[s] = sh[s]]_vars

(* S-9 / S-31：一段分享在让它成立的那层关系断开之后，永不再生效（不复活）。 *)
NoRevival ==
    \A s \in Recs : [](sh[s] = "active" /\ ~Rel(s) => [](~Effective(s)))

=============================================================================

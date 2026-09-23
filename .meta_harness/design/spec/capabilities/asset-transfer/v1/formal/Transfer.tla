------------------------------- MODULE Transfer -------------------------------
(***************************************************************************)
(* 资产复制与分享：两类待确认件的收场互斥、复制落地与分享使用的边界、       *)
(* 血缘目标与分享记录的唯一性、分享结束记录的终态性。                       *)
(*                                                                         *)
(* 对应契约条款（capability.asset-transfer v1）：                            *)
(*   S-7   两类待确认件共用的过期语义（确认／撤回／过期互斥，终结记录不改写）*)
(*   S-10  复制血缘：同一 (源, 目标组织) 至多一份带该血缘的目标记录           *)
(*   S-12  流转边界：团队资产不出那棵树（复制落地、分享使用两条路径）         *)
(*   S-17  每道准入现读，确认时再判一遍                                     *)
(*   S-18  确认是一次提交；同一落点的确认序列化                              *)
(*   S-8   同一 (资产, 被分享方组织) 至多一份 active 的分享                 *)
(*   S-9   分享是否生效：记录为 active 且此刻边界成立                       *)
(*   S-31  隶属解除：分享在使用时失效，不靠事件                              *)
(*                                                                         *)
(* 三个常量可注入，每个对应一处保护；主配置三者全 TRUE：                     *)
(*   SameCommit     —— 确认的重判、落地与终结记录落在同一动作里（S-18）。    *)
(*                     FALSE：拆成「读—写」两步，中间留出窗口。              *)
(*   ConfirmRecheck —— 确认时现读边界与发起者资格（S-17）。                  *)
(*                     FALSE：只信发起那一刻的判定。                        *)
(*   UseTimeCheck   —— 每次使用现读边界（S-31）。                            *)
(*                     FALSE：使用只看一个「已记为解除」的标记，而那个标记   *)
(*                     由一次可能丢失的事件反应写下。                        *)
(* 去掉任何一处都应能给出反例；给不出，说明对应条款在本模型里是平凡的。       *)
(*                                                                         *)
(* 本模型**不**表达的（各有自己的证据形式，见 ../../verification.md）：      *)
(*   覆盖不碰配值（S-41，属写集合的约束，模型里写成 UNCHANGED 就被吸收了）；  *)
(*   plugin 随行与引用告知（S-14）；个人组织之间的分享（边界判据恒真、与隶属  *)
(*   变化无关）；读面与失败值（S-20～S-30 的 ⑥⑧）；存储不可用（unavailable）。*)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    SameCommit,       \* BOOLEAN（S-18）
    ConfirmRecheck,   \* BOOLEAN（S-17）
    UseTimeCheck      \* BOOLEAN（S-31）

(***************************************************************************)
(* 固定的场景：三个团队组织；复制发起者在 t1、t2 各有一个租户身份。         *)
(* c1、c2 是两份复制通知，都把 t1 里他租户级的资产 a1 复制到 t2——两份同源  *)
(* 同目标，才测得出「首次复制」被判两次的那个交错（S-10、S-18）。            *)
(* s1、s2 是两份分享邀请，都把 t1 的资产 a2 分享给 t2——同一对，才测得出     *)
(* 「至多一份 active」（S-8、S-18）。                                       *)
(***************************************************************************)
Team      == {"t1", "t2", "t3"}
Copies    == {"c1", "c2"}
Invites   == {"s1", "s2"}
Offers    == Copies \cup Invites
Assets    == {"a1", "a2"}
Src(o)    == "t1"
Dst(o)    == "t2"
AssetOf(o) == IF o \in Copies THEN "a1" ELSE "a2"
Homes     == {"t1", "t2"}          \* 复制发起者持有租户身份的两个组织
None      == "none"

OfferStates  == {"unissued", "pending", "accepted", "withdrawn"}
SharingRecs  == {"none", "active", "revoked", "removed"}
Stages       == {"no", "first", "repeat", "new", "twin"}

VARIABLES
    parent,    \* Team -> Team \cup {None}：上级组织属性（环境）
    member,    \* Homes -> BOOLEAN：发起者在该组织的成员资格此刻有效（环境）
    live,      \* Assets -> BOOLEAN：S-7 的指向对象此刻存在；一旦 FALSE 不再回来
    off,       \* Offers -> OfferStates：记下的部分（pending 表示已发出、无终结记录）
    late,      \* Offers -> BOOLEAN：now > expiresAt
    staged,    \* Offers -> Stages：拆步确认时第一步做出的判定（仅 ~SameCommit）
    lineage,   \* 目标组织 t2 里带 a1 血缘的目标记录份数（S-10）
    sh,        \* Invites -> SharingRecs：由该邀请的确认产生的那份分享的记录
    mat,       \* Invites -> BOOLEAN：「已记为解除」标记（仅 ~UseTimeCheck）
    leak       \* 历史：违反发生过的种类（"accept" / "copy" / "use"）

vars == <<parent, member, live, off, late, staged, lineage, sh, mat, leak>>

(****************************** 派生 ***************************************)
Up(S) == {parent[x] : x \in {y \in S : parent[y] # None}}

(* {o} ∪ ancestorChain(o)：data.identity-values/v1#S-14。三个组织两跳即到头。 *)
SelfAndAncestors(o) ==
    LET s1 == {o} \cup Up({o})
        s2 == s1 \cup Up(s1)
    IN  s2 \cup Up(s2)

(* data.identity-values/v1#S-15：把各自算进来之后两条链有交。 *)
ShareAncestor(x, y) == SelfAndAncestors(x) \cap SelfAndAncestors(y) # {}

(* S-12：本模型只有团队组织，所以边界就是「两个不同的团队组织同树」。 *)
Boundary(x, y) == x # y /\ ShareAncestor(x, y)

(* data.offer-expiry/v1#S-8：时间到，或指向的对象不存在。 *)
Expired(o) == late[o] \/ ~live[AssetOf(o)]

(* S-17：复制在确认时还要成立的那几条——发起者两侧成员资格有效、源与目标同树。 *)
CopyOK(o)  == member["t1"] /\ member["t2"] /\ Boundary(Src(o), Dst(o))
ShareOK(o) == Boundary(Src(o), Dst(o))
Ok(o)      == IF o \in Copies THEN CopyOK(o) ELSE ShareOK(o)

(* S-8：同一 (资产, 被分享方) 已有一份 active 的记录。 *)
ActiveTwin(o) ==
    \E s \in Invites : s # o /\ AssetOf(s) = AssetOf(o) /\ Dst(s) = Dst(o)
                       /\ sh[s] = "active"

(* S-9：分享此刻生效 = 记录为 active 且此刻边界成立。 *)
Effective(s)     == sh[s] = "active" /\ Boundary(Src(s), Dst(s))
DissolvedNow(s)  == sh[s] = "active" /\ ~Boundary(Src(s), Dst(s))

TypeOK ==
    /\ parent  \in [Team -> Team \cup {None}]
    /\ member  \in [Homes -> BOOLEAN]
    /\ live    \in [Assets -> BOOLEAN]
    /\ off     \in [Offers -> OfferStates]
    /\ late    \in [Offers -> BOOLEAN]
    /\ staged  \in [Offers -> Stages]
    /\ lineage \in 0..2
    /\ sh      \in [Invites -> SharingRecs]
    /\ mat     \in [Invites -> BOOLEAN]
    /\ leak    \subseteq {"accept", "copy", "use"}

Init ==
    /\ parent  = [t \in Team |-> None]
    /\ member  = [h \in Homes |-> TRUE]
    /\ live    = [a \in Assets |-> TRUE]
    /\ off     = [o \in Offers |-> "unissued"]
    /\ late    = [o \in Offers |-> FALSE]
    /\ staged  = [o \in Offers |-> "no"]
    /\ lineage = 0
    /\ sh      = [s \in Invites |-> "none"]
    /\ mat     = [s \in Invites |-> FALSE]
    /\ leak    = {}

(******************************* 环境 **************************************)
(* organization-governance/v1#S-32：接受隶属请求（含判环）。 *)
Affiliate(c, p) ==
    /\ c # p
    /\ parent[c] = None
    /\ c \notin SelfAndAncestors(p)
    /\ parent' = [parent EXCEPT ![c] = p]
    /\ UNCHANGED <<member, live, off, late, staged, lineage, sh, mat, leak>>

(* organization-governance/v1#S-33：任一方单方面解除。 *)
Dissolve(c) ==
    /\ parent[c] # None
    /\ parent' = [parent EXCEPT ![c] = None]
    /\ UNCHANGED <<member, live, off, late, staged, lineage, sh, mat, leak>>

(* organization-governance/v1#S-29 / #S-25：退出与再加入（同一租户身份）。 *)
Leave(h) ==
    /\ member[h]
    /\ member' = [member EXCEPT ![h] = FALSE]
    /\ UNCHANGED <<parent, live, off, late, staged, lineage, sh, mat, leak>>

Rejoin(h) ==
    /\ ~member[h]
    /\ member' = [member EXCEPT ![h] = TRUE]
    /\ UNCHANGED <<parent, live, off, late, staged, lineage, sh, mat, leak>>

(* 时间走过 expiresAt。只对尚无终结记录的那些有意义（S-8 的求值次序）。 *)
Tick(o) ==
    /\ off[o] = "pending"
    /\ ~late[o]
    /\ late' = [late EXCEPT ![o] = TRUE]
    /\ UNCHANGED <<parent, member, live, off, staged, lineage, sh, mat, leak>>

(* 指向的资产被移除或删除（S-7）；标识不复用，所以不会回来。 *)
RemoveAsset(a) ==
    /\ live[a]
    /\ live' = [live EXCEPT ![a] = FALSE]
    /\ UNCHANGED <<parent, member, off, late, staged, lineage, sh, mat, leak>>

(****************************** 发起与撤回 *********************************)
(* S-20 / S-24：发起时判边界与资格；发起不求 S-8（offer-expiry/v1#S-20）。 *)
Issue(o) ==
    /\ off[o] = "unissued"
    /\ live[AssetOf(o)]
    /\ Ok(o)
    /\ off' = [off EXCEPT ![o] = "pending"]
    /\ UNCHANGED <<parent, member, live, late, staged, lineage, sh, mat, leak>>

(* S-21 / S-25：已过期的不写终结记录（offer-expiry/v1#S-8 的反方向）。 *)
Withdraw(o) ==
    /\ off[o] = "pending"
    /\ ~Expired(o)
    /\ off' = [off EXCEPT ![o] = "withdrawn"]
    /\ UNCHANGED <<parent, member, live, late, staged, lineage, sh, mat, leak>>

(******************************* 确认 **************************************)
(* SameCommit：重判、落地与终结记录是一个不可分割的动作（S-18）。          *)
(* 复制落地：没有带血缘的目标记录就新建一份，有就在它上面出新版本（S-10）。*)
(* 分享落地：同一对已有 active 的就认回那一份，否则新建（S-8）。           *)
Confirm(o) ==
    /\ SameCommit
    /\ off[o] = "pending"
    /\ ~Expired(o)
    /\ ConfirmRecheck => Ok(o)
    /\ off' = [off EXCEPT ![o] = "accepted"]
    /\ IF o \in Copies
          THEN /\ lineage' = IF lineage = 0 THEN 1 ELSE lineage
               /\ leak' = IF CopyOK(o) THEN leak ELSE leak \cup {"copy"}
               /\ UNCHANGED sh
          ELSE /\ sh' = IF ActiveTwin(o) THEN sh ELSE [sh EXCEPT ![o] = "active"]
               /\ UNCHANGED <<lineage, leak>>
    /\ UNCHANGED <<parent, member, live, late, staged, mat>>

(* ~SameCommit：第一步读、判定并记下打算做什么；第二步照记下的写，不再复查。 *)
ConfirmBegin(o) ==
    /\ ~SameCommit
    /\ off[o] = "pending"
    /\ ~Expired(o)
    /\ staged[o] = "no"
    /\ ConfirmRecheck => Ok(o)
    /\ staged' = [staged EXCEPT ![o] =
                    IF o \in Copies
                       THEN IF lineage = 0 THEN "first" ELSE "repeat"
                       ELSE IF ActiveTwin(o) THEN "twin" ELSE "new"]
    /\ UNCHANGED <<parent, member, live, off, late, lineage, sh, mat, leak>>

ConfirmEnd(o) ==
    /\ staged[o] # "no"
    /\ off' = [off EXCEPT ![o] = "accepted"]
    /\ leak' = leak
               \cup (IF off[o] = "pending" /\ ~Expired(o) THEN {} ELSE {"accept"})
               \cup (IF o \in Copies /\ ~CopyOK(o) THEN {"copy"} ELSE {})
    /\ lineage' = IF staged[o] = "first" THEN lineage + 1 ELSE lineage
    /\ sh' = IF staged[o] = "new" THEN [sh EXCEPT ![o] = "active"] ELSE sh
    /\ staged' = [staged EXCEPT ![o] = "no"]
    /\ UNCHANGED <<parent, member, live, late, mat>>

(***************************** 分享的结束与使用 *****************************)
(* S-28 / S-29：写终结记录；已结束的不改写。 *)
Revoke(s) ==
    /\ sh[s] = "active"
    /\ sh' = [sh EXCEPT ![s] = "revoked"]
    /\ UNCHANGED <<parent, member, live, off, late, staged, lineage, mat, leak>>

RemoveShared(s) ==
    /\ sh[s] = "active"
    /\ sh' = [sh EXCEPT ![s] = "removed"]
    /\ UNCHANGED <<parent, member, live, off, late, staged, lineage, mat, leak>>

(* 一次使用（求值时认这份持有）。UseTimeCheck：现读边界（S-31）；           *)
(* 否则只看「已记为解除」的标记。使用本身只在越界时留下历史。              *)
Use(s) ==
    /\ sh[s] = "active"
    /\ IF UseTimeCheck THEN Boundary(Src(s), Dst(s)) ELSE ~mat[s]
    /\ leak' = IF Boundary(Src(s), Dst(s)) THEN leak ELSE leak \cup {"use"}
    /\ UNCHANGED <<parent, member, live, off, late, staged, lineage, sh, mat>>

(* 仅 ~UseTimeCheck：对「隶属已解除」事件的反应，可能发生也可能永远不发生。 *)
Materialize(s) ==
    /\ ~UseTimeCheck
    /\ DissolvedNow(s)
    /\ ~mat[s]
    /\ mat' = [mat EXCEPT ![s] = TRUE]
    /\ UNCHANGED <<parent, member, live, off, late, staged, lineage, sh, leak>>

Next ==
    \/ \E c \in Team, p \in Team : Affiliate(c, p)
    \/ \E c \in Team : Dissolve(c)
    \/ \E h \in Homes : Leave(h) \/ Rejoin(h)
    \/ \E o \in Offers : Tick(o) \/ Issue(o) \/ Withdraw(o)
                         \/ Confirm(o) \/ ConfirmBegin(o) \/ ConfirmEnd(o)
    \/ \E a \in Assets : RemoveAsset(a)
    \/ \E s \in Invites : Revoke(s) \/ RemoveShared(s) \/ Use(s) \/ Materialize(s)

Spec == Init /\ [][Next]_vars

(*************************** 待检查的不变量 ********************************)
(* S-7：过期、撤回或已确认的待确认件，确认不产生效果。 *)
NoLateOrDoubleSettle == "accept" \notin leak

(* S-12 + S-17：复制只在发起者两侧成员资格有效、且源与目标同树时落地。 *)
CopyLandsInsideBoundary == "copy" \notin leak

(* S-12 + S-31：分享只在此刻同树时被使用。 *)
UseInsideBoundary == "use" \notin leak

(* S-10 + S-18：同一 (源, 目标组织) 至多一份带该血缘的目标记录。 *)
AtMostOneLineageTarget == lineage <= 1

(* S-8 + S-18：同一 (资产, 被分享方组织) 至多一份 active 的分享。 *)
AtMostOneActiveSharingPerPair ==
    \A x, y \in Invites :
        (x # y /\ AssetOf(x) = AssetOf(y) /\ Dst(x) = Dst(y))
            => ~(sh[x] = "active" /\ sh[y] = "active")

(* S-7：效果只来自一次确认。 *)
EffectsOnlyFromConfirmation ==
    /\ \A s \in Invites : sh[s] # "none" => off[s] = "accepted"
    /\ lineage > 0 => \E c \in Copies : off[c] = "accepted"

(***************************** 待检查的动作性质 *****************************)
(* S-7：终结记录一经写下不改写（offer-expiry/v1#S-8 的求值次序）。 *)
SettledStable ==
    [][\A o \in Offers : off[o] \in {"accepted", "withdrawn"} => off'[o] = off[o]]_vars

(* S-9：撤销与移除是终态。 *)
EndedStable ==
    [][\A s \in Invites : sh[s] \in {"revoked", "removed"} => sh'[s] = sh[s]]_vars

(* 缺口 G-4 的演示用：「因隶属解除而不再生效的分享，此后永不再生效」。        *)
(* 本契约**不承诺**这一条（S-31）；Transfer_Revival.cfg 预期给出反例。        *)
NoRevival ==
    \A s \in Invites : [](DissolvedNow(s) => [](~Effective(s)))

=============================================================================

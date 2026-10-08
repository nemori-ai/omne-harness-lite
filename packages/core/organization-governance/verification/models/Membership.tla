-------------------------------- MODULE Membership --------------------------------
(***************************************************************************)
(* 一个组织内的成员写入，与「任何时刻至少一位有效超级管理员」这条不变量。      *)
(*                                                                         *)
(* 本模型只表达一件事：同一组织的成员写入**是否被序列化**，决定了那条不变量    *)
(* 成不成立。它对应契约条款：                                                *)
(*   S-17  同一组织的成员写入序列化                                          *)
(*   S-28  调整角色（前置「之后仍 >= 1 超管」与写入同提交）                   *)
(*   S-29  解除成员（同上；并发移除对方：先成者成功、后成者被拒）              *)
(*   S-25  接受邀请（回来的是同一条记录，角色缺省为普通成员）                  *)
(*                                                                         *)
(* 常量 Serialized 可注入：                                                  *)
(*   TRUE  —— 前置检查与写入在同一次提交内、且同组织写入互不交错（S-17）。     *)
(*            预期：AtLeastOneSuperAdministrator 在已检查范围内恒成立。       *)
(*   FALSE —— 检查与写入分成两步，两次写入可交错。                            *)
(*            预期：TLC 给出反例。这是 S-17 的**有效性验证**——若去掉序列化      *)
(*            也查不出问题，那条不变量就是平凡的，写进契约没有意义。           *)
(*                                                                         *)
(* 本模型**不**表达的：组织的创建与隶属关系（归 Affiliation.als）、邀约的过期   *)
(* （归 data.offer-expiry v1）、成员资格读面的失败（S-26 的 unavailable，      *)
(* 那是提供者可用性，不是交错问题）。省略的这些各有自己的证据形式，见          *)
(* ../../verification.md。                                                  *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Actors,      \* 这个组织里参与动作的那些账号（有限集，由配置注入）
    Serialized   \* BOOLEAN：同一组织的成员写入是否被序列化（S-17）

VARIABLES
    effective,   \* Actors 的子集：成员关系记录此刻有效的那些（S-8 的有效性）
    isSuper,     \* Actors -> BOOLEAN：这条记录上的角色是不是超级管理员（S-8 的角色）
    staged       \* Actors -> 请求：已通过前置检查、尚未写入的那一次（仅 ~Serialized 用得上）

vars == <<effective, isSuper, staged>>

(***************************************************************************)
(* 一次成员写入请求：解除（remove）或降级（demote）。                        *)
(* 两者对不变量的影响相同——都把目标从「有效超管」这个集合里拿掉，            *)
(* 所以 S-28 与 S-29 共用同一条前置。                                       *)
(***************************************************************************)
Kinds    == {"remove", "demote"}
Requests == [kind : Kinds, target : Actors]
NoReq    == [kind |-> "none", target |-> "none"]

(* 此刻的有效超级管理员：记录有效**且**角色是超管。两个条件缺一不可。 *)
SuperAdministrators == {a \in Actors : a \in effective /\ isSuper[a]}

(* 对 t 执行一次 remove 或 demote 之后，还剩下哪些有效超管。 *)
Remaining(t) == SuperAdministrators \ {t}

TypeOK ==
    /\ effective \subseteq Actors
    /\ isSuper \in [Actors -> BOOLEAN]
    /\ staged  \in [Actors -> Requests \cup {NoReq}]

(*************************** 待检查的不变量 ********************************)
(* 契约条款：S-17 撑着的那条「任何组织在任何时刻至少有一位有效超级管理员」。  *)
(* 它是**任何时刻都成立的事实**，不是每次动作各自检查一遍的前置条件——        *)
(* 因此写成不变量而不是动作的守卫。                                          *)
AtLeastOneSuperAdministrator == SuperAdministrators # {}

(***************************************************************************)
(* 初始状态：两位（或多位）有效成员，全都是超管。                            *)
(* 这正是 flows §3.3 与 acceptance 点名的那个局面。                          *)
(***************************************************************************)
Init ==
    /\ effective = Actors
    /\ isSuper   = [a \in Actors |-> TRUE]
    /\ staged    = [a \in Actors |-> NoReq]

(* 写入本身：remove 改有效性，demote 改角色。两者都不铸新身份（S-38）。 *)
ApplyTo(t, k) ==
    /\ effective' = IF k = "remove" THEN effective \ {t} ELSE effective
    /\ isSuper'   = IF k = "demote" THEN [isSuper EXCEPT ![t] = FALSE] ELSE isSuper

(***************************************************************************)
(* Serialized = TRUE：前置检查与写入落在同一个动作里。                       *)
(* 一个动作在 TLA+ 里不可分割，这正是「同提交 + 序列化」的抽象。             *)
(***************************************************************************)
Commit(a, t, k) ==
    /\ Serialized
    /\ a \in effective /\ isSuper[a]      \* 授权：发起者是有效超管（S-28 ②/S-29 ②）
    /\ t \in effective                    \* 目标的记录此刻有效
    /\ Remaining(t) # {}                  \* 前置：之后仍有至少一位有效超管
    /\ ApplyTo(t, k)
    /\ UNCHANGED staged

(***************************************************************************)
(* Serialized = FALSE：检查与写入分成两步，中间留出一个窗口。                *)
(* 这不是「实现得差一点」，而是**没有 S-17 时必然存在**的那个交错：          *)
(* 两位超管各自读到「还有两位」，各自判定自己这次动作合法，然后各自写入。    *)
(***************************************************************************)
Stage(a, t, k) ==
    /\ ~Serialized
    /\ a \in effective /\ isSuper[a]
    /\ t \in effective
    /\ staged[a] = NoReq
    /\ Remaining(t) # {}                  \* 前置在**这一刻**成立
    /\ staged' = [staged EXCEPT ![a] = [kind |-> k, target |-> t]]
    /\ UNCHANGED <<effective, isSuper>>

Apply(a) ==
    /\ ~Serialized
    /\ staged[a] # NoReq
    /\ ApplyTo(staged[a].target, staged[a].kind)   \* 写入时**不再复查**前置
    /\ staged' = [staged EXCEPT ![a] = NoReq]

(***************************************************************************)
(* 另外两个动作，为的是让不变量不平凡：有效超管这个集合要能增长，            *)
(* 否则「至少一位」只是因为没人能动它而成立。                                *)
(***************************************************************************)

(* S-28 的另一个方向：把超管分配给他人。它不可能违反不变量，所以不设前置。 *)
Promote(a, t) ==
    /\ a \in effective /\ isSuper[a]
    /\ t \in effective
    /\ ~isSuper[t]
    /\ isSuper' = [isSuper EXCEPT ![t] = TRUE]
    /\ UNCHANGED <<effective, staged>>

(* S-25 + S-39：解除之后再被邀请回来，**是同一条记录重新有效**，           *)
(* 不铸新身份；角色不继承，缺省为普通成员。                                 *)
Rejoin(t) ==
    /\ t \notin effective
    /\ effective' = effective \cup {t}
    /\ isSuper'   = [isSuper EXCEPT ![t] = FALSE]
    /\ UNCHANGED staged

Next ==
    \/ \E a \in Actors, t \in Actors, k \in Kinds : Commit(a, t, k)
    \/ \E a \in Actors, t \in Actors, k \in Kinds : Stage(a, t, k)
    \/ \E a \in Actors : Apply(a)
    \/ \E a \in Actors, t \in Actors : Promote(a, t)
    \/ \E t \in Actors : Rejoin(t)

Spec == Init /\ [][Next]_vars

=============================================================================

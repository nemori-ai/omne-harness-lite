-------------------------- MODULE Registration --------------------------
(***************************************************************************)
(* composition.account-registration v1 的行为规格。                        *)
(*                                                                         *)
(* 建模对象：**一个登录标识**上的若干次注册尝试。不同登录标识之间没有共享   *)
(* 状态（S-9 的幂等边界就是登录标识），因此单个标识的模型已覆盖本契约要      *)
(* 检查的全部交错；把多个标识放进同一个模型只会乘出无新行为的状态。         *)
(*                                                                         *)
(* 条款 → 动作 → 性质的对应写在同目录的 README.md，不在本文件重复。        *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Attempts,     \* 这个登录标识上的若干次注册尝试；「重来」= 其中另一次尝试
    None,         \* 空值：账号不存在，或这次尝试尚无终结结果
    Failures,     \* TRUE 时允许注入存储故障与回执未送达
    Abandoning,   \* TRUE 时允许发起者中途放弃
    Expiring      \* TRUE 时允许记录过留存期限，并允许清除链动作

ASSUME /\ Attempts # {}
       /\ IsFiniteSet(Attempts)
       /\ Failures \in BOOLEAN
       /\ Abandoning \in BOOLEAN
       /\ Expiring \in BOOLEAN

\* 账号在存储里的两种状态；「不存在」用 None 表示。对应 S-6。
AccountStates == {"unactivated", "activated"}

\* S-5 的终结结果集合，没有第五个值。
TerminalOutcomes == {"registered", "identifier-taken", "credential-rejected", "interrupted"}

\* 一次尝试在动作链上的位置。对应 S-8 的三步。
Phases == {"start", "claimed", "organized", "done"}

VARIABLES
    account,      \* None | "unactivated" | "activated"：这个登录标识上的账号
    orgCount,     \* 已为该账号建立的个人组织数量；产品要求恰好一个
    pc,           \* 每次尝试走到了动作链的哪一步
    outcome,      \* 每次尝试的终结结果（= 发起者收到的回执）
    abandoned,    \* 发起者是否已放弃该次尝试
    expired,      \* 当前这条账号记录是否已过留存期限
    sweep         \* 清除链走到了哪一步："idle" | "orgCleared"

(***************************************************************************)
(* abandoned 是**环境选择**，不是系统可观察的状态。契约 S-3 明说不承诺清理 *)
(* 未激活记录，理由正是「放弃与慢在系统侧无法分辨」；模型里给它一个变量    *)
(* 只为表达进展性质的那条前提（发起者不放弃），实现不得去读它。           *)
(***************************************************************************)

(***************************************************************************)
(* expired 对应 capability.account-identity/v1#S-18 返回值里的「是否已过留 *)
(* 存期限」。它在模型里是一个**单调**的布尔：只有 Expire 把它由 FALSE 置为 *)
(* TRUE，没有任何动作把它置回 FALSE——那正是该条款写明的性质，也是         *)
(* NoOrphanPersonalOrganization 成立所依赖的那一条。                       *)
(*                                                                         *)
(* 时间本身不在模型里（契约没有带时限的条款）。「到期」因此建模成一个由环境 *)
(* 任意时刻触发的动作，而不是一个时钟——这恰好是最坏情况：它可以插在任何    *)
(* 两步之间。                                                              *)
(***************************************************************************)

(***************************************************************************)
(* sweep 是**清除链自己的 pc**，取值 "idle" | "orgCleared"。               *)
(*                                                                         *)
(* 它必须存在：清除链的两步是**两次分属不同 owner 的提交**，中间可以插进   *)
(* 任何别的动作。把两步写成一个原子动作、或给第 ② 步加一条「个人组织已不  *)
(* 存在」的守卫，都会把那个真实存在的窗口藏起来——而 #S-38 按契约          *)
(* **不核实**个人组织（依赖方向单向，它也无从核实）。                     *)
(***************************************************************************)
SweepPhases == {"idle", "orgCleared"}

vars == << account, orgCount, pc, outcome, abandoned, expired, sweep >>

TypeOK ==
    /\ account \in {None} \cup AccountStates
    /\ orgCount \in Nat
    /\ pc \in [Attempts -> Phases]
    /\ outcome \in [Attempts -> {None} \cup TerminalOutcomes]
    /\ abandoned \in [Attempts -> BOOLEAN]
    /\ expired \in BOOLEAN
    /\ sweep \in SweepPhases

Init ==
    /\ account = None
    /\ orgCount = 0
    /\ pc = [a \in Attempts |-> "start"]
    /\ outcome = [a \in Attempts |-> None]
    /\ abandoned = [a \in Attempts |-> FALSE]
    /\ expired = FALSE
    /\ sweep = "idle"

\* 这次尝试还在推进中：既未终结，发起者也还没放弃。
Live(a) == pc[a] # "done" /\ ~abandoned[a]

\* 把一次尝试收束到某个终结结果上。终结之后不再改写（S-7 回执不可撤销）。
Finish(a, r) ==
    /\ outcome' = [outcome EXCEPT ![a] = r]
    /\ pc' = [pc EXCEPT ![a] = "done"]

(***************************************************************************)
(* ① 产生未激活账号。owner：capability.account-identity。                  *)
(* 幂等边界是登录标识（S-9）。凭据匹配与否、凭据是否合规，在模型里抽象成   *)
(* 非确定分支：本契约不拥有凭据的形状，只拥有「匹配则认回、不匹配则算标识  *)
(* 已被占用」这条收场规则（S-12）。                                        *)
(***************************************************************************)

\* 标识未被占用：建立未激活账号，AccountId 随之定下。
\* 这条**新记录当然没过期**——expired 跟着记录走，不跟着标识走。
ClaimFresh(a) ==
    /\ account = None
    /\ account' = "unactivated"
    /\ expired' = FALSE
    /\ sweep' = "idle"
    /\ pc' = [pc EXCEPT ![a] = "claimed"]
    /\ UNCHANGED << orgCount, outcome, abandoned >>

\* 既有未激活账号、**仍在留存期限内**且凭据匹配：认回同一个账号，不产生第二个
\* （S-12 第三行）。`~expired` 就是 #S-13 前置①里「仍在留存期限内」那一半。
ClaimResume(a) ==
    /\ account = "unactivated"
    /\ ~expired
    /\ pc' = [pc EXCEPT ![a] = "claimed"]
    /\ UNCHANGED << account, orgCount, outcome, abandoned, expired, sweep >>

\* 既有已激活账号，或既有未激活账号但凭据不匹配，**或那条未激活记录已过期**
\* （S-12 第二、四、五行）。三者给同一个 identifier-taken，模型里就是同一个分支。
ClaimTaken(a) ==
    /\ account # None
    /\ Finish(a, "identifier-taken")
    /\ UNCHANGED << account, orgCount, abandoned, expired, sweep >>

\* 凭据不合规：不产生账号，也不占用标识（S-6）。
ClaimRejected(a) ==
    /\ Finish(a, "credential-rejected")
    /\ UNCHANGED << account, orgCount, abandoned, expired, sweep >>

Claim(a) ==
    /\ Live(a)
    /\ pc[a] = "start"
    /\ \/ ClaimFresh(a)
       \/ ClaimResume(a)
       \/ ClaimTaken(a)
       \/ ClaimRejected(a)

(***************************************************************************)
(* ② 创建个人组织，该账号成为其唯一成员与超级管理员。                      *)
(* owner：capability.organization-governance。幂等边界是 AccountId（S-9）： *)
(* 已有个人组织时不建第二个，直接视为本步已完成。                          *)
(***************************************************************************)
(* `~expired` 是 capability.organization-governance/v1#S-20 的前置②：            *)
(* 记录已过留存期限时本步以 accountRecordExpired 拒绝。**它在这里不是装饰**——   *)
(* 去掉它，NoOrphanPersonalOrganization 立刻出反例（清除链 ① 先清掉组织、       *)
(* 本步又建一个、清除链 ② 再把账号删掉）。变异核对见 README。                  *)
Organize(a) ==
    /\ Live(a)
    /\ pc[a] = "claimed"
    /\ account # None
    /\ ~expired
    /\ orgCount' = IF orgCount = 0 THEN 1 ELSE orgCount
    /\ pc' = [pc EXCEPT ![a] = "organized"]
    /\ UNCHANGED << account, outcome, abandoned, expired, sweep >>

(***************************************************************************)
(* ③ 激活。owner：capability.account-identity，前置事实读自组织治理。      *)
(* 这是本组合的**唯一提交点**（S-10）：前置 orgCount >= 1 就是「个人组织   *)
(* 已存在」。已激活再激活无二次效果——本动作对 account 的赋值是幂等的。     *)
(*                                                                         *)
(* 第二个分支是「提交已成立、回执未送达」：外部效应不回滚（S-24），因此账号 *)
(* 已可用而这次尝试收到的是 interrupted。它只在 Failures 打开时存在。       *)
(***************************************************************************)
Activate(a) ==
    /\ Live(a)
    /\ pc[a] = "organized"
    /\ orgCount >= 1
    /\ account' = "activated"
    /\ \/ Finish(a, "registered")
       \/ /\ Failures
          /\ Finish(a, "interrupted")
    /\ UNCHANGED << orgCount, abandoned, expired, sweep >>

(***************************************************************************)
(* 故障注入：任一步在其提交成立之前失败（S-11）。已经落下的事实不回滚，    *)
(* 账号或者尚未产生、或者停在未激活。                                      *)
(***************************************************************************)
Fail(a) ==
    /\ Failures
    /\ Live(a)
    /\ pc[a] \in {"start", "claimed", "organized"}
    /\ Finish(a, "interrupted")
    /\ UNCHANGED << account, orgCount, abandoned, expired, sweep >>

(***************************************************************************)
(* 放弃：发起者不再推进这次尝试。已产生的未激活记录**在留存期限内**原样留  *)
(* 存；到期之后由下面的清除链清掉（S-34）。契约仍不按「多久没动」清理——   *)
(* 判据是期限，不是放弃（S-3）。                                           *)
(***************************************************************************)
Abandon(a) ==
    /\ Abandoning
    /\ Live(a)
    /\ abandoned' = [abandoned EXCEPT ![a] = TRUE]
    /\ UNCHANGED << account, orgCount, pc, outcome, expired, sweep >>

(***************************************************************************)
(* 到期：这条未激活记录过了 unactivated_retention。                        *)
(*                                                                         *)
(* 它是**环境动作**，可以插在任何两步之间——这正是最坏情况。expired 单调：  *)
(* 没有任何动作把它置回 FALSE（ClaimFresh 那一处是**另一条新记录**）。     *)
(* 已激活的记录不参与期限判定，所以本动作要求 account = "unactivated"。     *)
(***************************************************************************)
Expire ==
    /\ Expiring
    /\ ~expired
    /\ account = "unactivated"
    /\ expired' = TRUE
    /\ UNCHANGED << account, orgCount, pc, outcome, abandoned, sweep >>

(***************************************************************************)
(* 清除链第 ① 步：清除个人组织与首个租户。                                 *)
(* owner：capability.organization-governance（#S-53）。                    *)
(*                                                                         *)
(* 前置里的 account = "unactivated" 就是该条款②的现读：读到已激活就拒绝。  *)
(* 对「个人组织已不存在」幂等，所以 orgCount = 0 时它也可发生、且无效果；  *)
(* 它也可以在 sweep 已经是 "orgCleared" 时再跑一次——那就是**重扫**。       *)
(***************************************************************************)
ExpireOrganization ==
    /\ Expiring
    /\ expired
    /\ account = "unactivated"
    /\ orgCount' = 0
    /\ sweep' = "orgCleared"
    /\ UNCHANGED << account, pc, outcome, abandoned, expired >>

(***************************************************************************)
(* 清除链第 ② 步：清除账号记录并释放登录标识。                             *)
(* owner：capability.account-identity（#S-38）。                           *)
(*                                                                         *)
(* `sweep = "orgCleared"` **就是那份清除依据**：① 成功时产出它（#S-53 的⑤），*)
(* ② 把「持有与该 AccountId 绑定的清除依据」写成自己的前置（#S-38 的前置④）。*)
(* 次序由本组合排，但它在运行期**有对应物**——没有依据，② 跑不起来。       *)
(*                                                                         *)
(* **这一步本身仍然不看 orgCount**：#S-38 核实的是一份依据，不是个人组织那 *)
(* 个事实本身（依赖方向单向，它无从核实）。因此 ① 与 ② 之间那个窗口在模型 *)
(* 里是**真的开着**的：其他动作可以插进来。                                *)
(*                                                                         *)
(* 把 `sweep = "orgCleared"` 去掉（② 可以先跑），                          *)
(* 或把 Organize 的 `~expired` 去掉（窗口里又建一个组织），               *)
(* NoOrphanPersonalOrganization **都必须出反例**。见 README 的变异核对。   *)
(***************************************************************************)
ExpireAccount ==
    /\ Expiring
    /\ expired
    /\ account = "unactivated"
    /\ sweep = "orgCleared"
    /\ account' = None
    /\ UNCHANGED << orgCount, pc, outcome, abandoned, expired, sweep >>

\* 全部尝试都已终结或已被放弃。
Terminated == \A a \in Attempts : ~Live(a)

\* 终止之后的重复步。它只为避免 TLC 把正常终止报成死锁，不引入新行为。
Done == Terminated /\ UNCHANGED vars

Next ==
    \/ \E a \in Attempts :
          \/ Claim(a)
          \/ Organize(a)
          \/ Activate(a)
          \/ Fail(a)
          \/ Abandon(a)
    \/ Expire
    \/ ExpireOrganization
    \/ ExpireAccount
    \/ Done

(***************************************************************************)
(* 公平性**只加在 ② 和 ③ 上**：一次已经开始的尝试会被推到底。              *)
(* Claim 刻意不加公平性——一次新的 Claim 就是一次「重来」，而系统从不承诺   *)
(* 发起者会重来。给 Claim 加 WF 等于把「用户一定会重试」写成系统保证。      *)
(***************************************************************************)
Fairness == \A a \in Attempts : WF_vars(Organize(a)) /\ WF_vars(Activate(a))

SafeSpec == Init /\ [][Next]_vars
Spec == SafeSpec /\ Fairness

(***************************************************************************)
(*                                性质                                     *)
(***************************************************************************)

\* S-13：可用账号必有个人组织。激活的前置是个人组织已存在。
ActivatedHasPersonalOrganization == (account = "activated") => (orgCount >= 1)

\* S-13：每个账号至多一个个人组织。与上一条合起来即「有且仅有一个」。
OnePersonalOrganizationPerAccount == orgCount <= 1

(***************************************************************************)
(* S-35：个人组织不会变成孤儿。个人组织存在 ⇒ 账号记录存在。              *)
(*                                                                         *)
(* 它是 S-13 的镜像面，**不是同一条**：S-13 说「可用账号必有个人组织」，   *)
(* 这一条说「个人组织必有账号」。它靠两处一起成立——ExpireAccount 的       *)
(* sweep = "orgCleared"（S-34 的次序）与 Organize 的 ~expired（#S-20 的    *)
(* 前置②）。两处各去掉一处都会出反例，见 README 的变异核对。              *)
(***************************************************************************)
NoOrphanPersonalOrganization == (orgCount >= 1) => (account # None)

\* S-16：中断不呈现为成功。呈报 registered 时，账号确实可用且恰有一个个人组织。
NoFalseSuccess ==
    \A a \in Attempts :
        outcome[a] = "registered" => (account = "activated" /\ orgCount = 1)

(***************************************************************************)
(* S-20：静止时只有两种形态，没有第三种。                                  *)
(*                                                                         *)
(* 它在逻辑上是上面三条在静止点上的合取投影，**不是一条独立性质**；单独检   *)
(* 查它的理由是它逐字对应 acceptance 的判据措辞，任一上位不变式被削弱时，   *)
(* 它给出的反例直接就是验收语言。第二个析取项容纳「回执未送达」：账号可用   *)
(* 而没有任何一次尝试收到 registered，仍属第一种形态。                     *)
(***************************************************************************)
ConvergentOutcome ==
    Terminated =>
        \/ (account = "activated" /\ orgCount = 1)
        \/ (account # "activated" /\ \A a \in Attempts : outcome[a] # "registered")

\* S-10：激活这一步的前置。约束的是**转移**，不是状态。
OrganizationBeforeActivation ==
    [][ (account # "activated" /\ account' = "activated") => orgCount >= 1 ]_vars

(***************************************************************************)
(* S-19 有前提的进展：一次**已经开始**的尝试必达某个终结结果。             *)
(* 前提由配置强制：Failures = FALSE（存储最终持续可用）、                  *)
(* Abandoning = FALSE（发起者不放弃），以及 Fairness（动作链会被推进）。    *)
(* 「部署可访问」对应 Claim 能够发生，由 pc[a] # "start" 这个前件承接。     *)
(***************************************************************************)
EventualOutcome ==
    \A a \in Attempts : (pc[a] # "start") ~> (outcome[a] \in TerminalOutcomes)

=============================================================================

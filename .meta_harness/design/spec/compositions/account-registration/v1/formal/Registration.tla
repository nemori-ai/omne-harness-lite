---- MODULE Registration ----
(***************************************************************************)
(* 账号注册组合 v1 的行为权威规格。                                        *)
(*                                                                         *)
(* 核心结构：以激活为单一提交点。账号先以未激活态写入，个人租户创建之后    *)
(* 才允许激活；激活是唯一使账号可用的动作。因此不存在「账号侧成功但租户侧  *)
(* 失败」的状态，也不需要跨边界原子提交。                                  *)
(*                                                                         *)
(* 对应契约 spec/compositions/account-registration/v1/contract.md 的       *)
(* S-1 至 S-5。                                                            *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Attempts,       \* 注册尝试的集合；每个尝试对应一个登录标识
    None,
    Failures,       \* 是否注入存储故障
    Abandoning      \* 发起者是否可能放弃；对应契约 S-4 的前提 (d)

(* 每个尝试的个人租户身份由尝试单射决定：不同尝试的个人租户互不相同。 *)
Tenant(a) == <<"personal", a>>

VARIABLES
    acct,           \* [Attempts -> {"none","pending","activated"}]
    tenantOwner,    \* 已创建的个人租户 -> 其所属尝试
    outcome,        \* [Attempts -> {None,"registered","interrupted"}]
    storageUp

vars == <<acct, tenantOwner, outcome, storageUp>>

Tenants == {Tenant(a) : a \in Attempts}

Init ==
    /\ acct = [a \in Attempts |-> "none"]
    /\ tenantOwner = [t \in Tenants |-> None]
    /\ outcome = [a \in Attempts |-> None]
    /\ storageUp = TRUE

(* 步骤 1：产生账号，未激活。此时账号存在但不可用。 *)
CreateAccount(a) ==
    /\ storageUp
    /\ acct[a] = "none"
    /\ outcome[a] = None
    /\ acct' = [acct EXCEPT ![a] = "pending"]
    /\ UNCHANGED <<tenantOwner, outcome, storageUp>>

(* 步骤 2：创建个人租户。以尝试为幂等边界，重复执行不产生第二个。 *)
CreateTenant(a) ==
    /\ storageUp
    /\ acct[a] = "pending"
    /\ tenantOwner[Tenant(a)] = None
    /\ tenantOwner' = [tenantOwner EXCEPT ![Tenant(a)] = a]
    /\ UNCHANGED <<acct, outcome, storageUp>>

(* 步骤 3：激活。唯一的提交点，前置条件是个人租户已存在。 *)
Activate(a) ==
    /\ storageUp
    /\ acct[a] = "pending"
    /\ tenantOwner[Tenant(a)] = a
    /\ acct' = [acct EXCEPT ![a] = "activated"]
    /\ outcome' = [outcome EXCEPT ![a] = "registered"]
    /\ UNCHANGED <<tenantOwner, storageUp>>

(* 放弃：中断是一个可辨认的终结结果，账号停留在未激活态。 *)
Interrupt(a) ==
    /\ Abandoning
    /\ acct[a] = "pending"
    /\ outcome[a] = None
    /\ outcome' = [outcome EXCEPT ![a] = "interrupted"]
    /\ UNCHANGED <<acct, tenantOwner, storageUp>>

(* 重试：中断后以同一标识重试，从未激活态继续。契约的幂等规则。 *)
Retry(a) ==
    /\ storageUp
    /\ acct[a] = "pending"
    /\ outcome[a] = "interrupted"
    /\ outcome' = [outcome EXCEPT ![a] = None]
    /\ UNCHANGED <<acct, tenantOwner, storageUp>>

Crash ==
    /\ Failures
    /\ storageUp
    /\ storageUp' = FALSE
    /\ UNCHANGED <<acct, tenantOwner, outcome>>

Recover ==
    /\ ~storageUp
    /\ storageUp' = TRUE
    /\ UNCHANGED <<acct, tenantOwner, outcome>>

Next ==
    \/ \E a \in Attempts :
        \/ CreateAccount(a) \/ CreateTenant(a) \/ Activate(a)
        \/ Interrupt(a) \/ Retry(a)
    \/ Crash
    \/ Recover

Spec == Init /\ [][Next]_vars

(* 公平性：仅用于进展性质。Retry 刻意不加公平性——放弃后是否重试由用户决定，
   系统不得假设它必然发生。 *)
Fairness ==
    /\ WF_vars(Recover)
    /\ \A a \in Attempts :
        /\ WF_vars(CreateTenant(a))
        /\ WF_vars(Activate(a))

ProgressSpec == Spec /\ Fairness

----------------------------------------------------------------------------
(* 不变式 *)

TypeOK ==
    /\ acct \in [Attempts -> {"none", "pending", "activated"}]
    /\ tenantOwner \in [Tenants -> Attempts \cup {None}]
    /\ outcome \in [Attempts -> {None, "registered", "interrupted"}]
    /\ storageUp \in BOOLEAN

(* S-1 / S-2：可用账号必然恰有一个个人租户。
   这是「以激活为单一提交点」要保护的核心性质。 *)
ActivatedHasTenant ==
    \A a \in Attempts : acct[a] = "activated" => tenantOwner[Tenant(a)] = a

(* S-1：个人租户只属于一个账号。 *)
OnePersonalPerAccount ==
    \A t \in Tenants :
        tenantOwner[t] # None => Tenant(tenantOwner[t]) = t

(* S-3：成功结果绝不出现在未激活的账号上。 *)
NoFalseSuccess ==
    \A a \in Attempts : outcome[a] = "registered" => acct[a] = "activated"

(* S-5：任何时刻，有结果的尝试都落在「成功且已激活」或「未成功且不可用」之一，
   不存在第三种。崩溃注入下同样成立。 *)
ConvergentOutcome ==
    \A a \in Attempts :
        outcome[a] # None =>
            \/ (outcome[a] = "registered" /\ acct[a] = "activated")
            \/ (outcome[a] = "interrupted" /\ acct[a] # "activated")

(* 租户创建先于激活：激活不可能跳过步骤 2。 *)
TenantBeforeActivation ==
    \A a \in Attempts :
        tenantOwner[Tenant(a)] = None => acct[a] # "activated"

----------------------------------------------------------------------------
(* 时序性质。前提显式写出：存储最终持续可用。
   对应契约 S-4 的前提 (e)；该前提不成立时不作任何承诺。 *)

EventualOutcome ==
    (<>[]storageUp) =>
        \A a \in Attempts : (acct[a] = "pending") ~> (outcome[a] # None)

====

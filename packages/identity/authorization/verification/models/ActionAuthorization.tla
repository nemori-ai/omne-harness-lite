------------------------- MODULE ActionAuthorization -------------------------
(* 模型：一个动作的放行判断。许不许只在 Agent 的准入判一次，结论、用掉的单次   *)
(* 授权与依据在准入那一次提交里记下；交给 Tool 之后，Tool 照常执行，不再判。   *)
(* 问的是：人的答复、取消会话、别人在设置里改这一项权限、切换会话运行模式、     *)
(* 写资格变化、服务重启、工具开始，这几件事以任何次序交错时，下面几条是不是都   *)
(* 成立：                                                                       *)
(*   准入记下放行的那一刻，这个动作确实有依据：档位不是禁止，会话没被取消，并且 *)
(*   档位是自动、或会话运行模式是跳过询问、或本会话的放行在当前依据下有效、或用 *)
(*   掉了自己的那张单次授权；                                                   *)
(*   一张单次授权只被它绑定的那个动作的准入用掉；                               *)
(*   人说了不（本次不放行、始终禁止、只写了一段话），这个动作不发起、不开始；   *)
(*   一批里还有动作没判完、卡没处理完时，不发起这一批里任何动作；               *)
(*   人同意过而单次授权没丢；                                                   *)
(*   已准并交出的动作，除了取消，不会在开始时被拒；                             *)
(*   一个动作被问的次数不超过一加依据变化的次数；                               *)
(*   每个动作最后都有结局。                                                     *)
(*                                                                              *)
(* 模型里的一步对应设计里的一步：                                               *)
(*   Judge          官方准入对一个待判的动作算一次；放行就是准入提交。会话取消  *)
(*                  之后不再准入，Rejudge、Reconsider 同。                      *)
(*   Answer         人在授权卡上答复：五个选项之一，或只写一段话。              *)
(*   AppendOnce     「本次放行」：向会话授权上下文追加一笔。                    *)
(*   Grant          这一笔成为这个动作当前可用的单次授权。                      *)
(*   AppendSession  「本会话放行」：向会话授权上下文追加一笔，带卡上的依据。    *)
(*   WriteAlways    「始终放行」：把租户这一层的权限值写成自动。                *)
(*   Refuse         本次不放行、始终禁止、只写了一段话。始终禁止另写租户设置。  *)
(*   Rejudge        人答复并落好之后，官方准入按当前事实重算。                  *)
(*   Reconsider     卡还开着而依据变了（设置、模式、同批别的卡的答复），重判。  *)
(*   Launch         判断屏障打开，把调用交给 Tool。                             *)
(*   Start          Tool 开始执行。不判授权。                                   *)
(*   Cancel         取消会话；还没开始的调用由控制停下。                        *)
(*   ChangeSetting  别人在设置页或别的会话里改了这一项权限。                    *)
(*   ChangeMode     切换会话运行模式。                                          *)
(*   FlipWritable   这个人写租户设置的资格或组织的上界变了。                    *)
(*   Restart        服务重启。耐久的东西都在，内存里的进度没了。                *)
(*                                                                              *)
(* Variant 不是 "correct" 时，模型故意改坏一处，用来证明检查能失败。            *)
EXTENDS Naturals, FiniteSets

CONSTANTS ActsA, ActsB, MaxEnvChanges, MaxModeChanges, Variant

VARIABLES tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
          grantRev, st, reply, applied, cardRev, cardWritable, asks,
          onceExpr, permit, consumedBy, restarts,
          humanNo, unjust, earlyLaunch, lostApproval, refused

vars == <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
          grantRev, st, reply, applied, cardRev, cardWritable, asks,
          onceExpr, permit, consumedBy, restarts,
          humanNo, unjust, earlyLaunch, lostApproval, refused>>

Acts == ActsA \cup ActsB
Sessions == {"s1", "s2"}
SessOf(a) == IF a \in ActsA THEN "s1" ELSE "s2"
Batch(a) == IF a \in ActsA THEN ActsA ELSE ActsB

Tiers == {"deny", "ask", "auto"}
Modes == {"never", "auto", "bypass"}
Options == {"allowOnce", "denyOnce", "allowSession", "allowAlways", "denyAlways", "remark"}
NoGrant == 99
Nobody == "nobody"
Open == {"pending", "asked", "answered"}
Settled == {"started", "notStarted"}
\* 修订号的上界：别人改设置的次数，加上人经卡片写设置的次数。一个动作每被问一次至多写一次，
\* 被重新问一次要有一次别人的改动，所以每个动作至多写 1 + MaxEnvChanges 次。
MaxRev == MaxEnvChanges + Cardinality(Acts) * (1 + MaxEnvChanges)

Init ==
  /\ tier = "ask"
  /\ rev = 0
  /\ envChanges = 0
  /\ writable \in BOOLEAN
  /\ flips = 0
  /\ mode = [s \in Sessions |-> "auto"]
  /\ modeChanges = 0
  /\ cancelled = [s \in Sessions |-> FALSE]
  /\ grantRev = [s \in Sessions |-> NoGrant]
  /\ st = [a \in Acts |-> "pending"]
  /\ reply = [a \in Acts |-> "none"]
  /\ applied = [a \in Acts |-> FALSE]
  /\ cardRev = [a \in Acts |-> 0]
  /\ cardWritable = [a \in Acts |-> FALSE]
  /\ asks = [a \in Acts |-> 0]
  /\ onceExpr = [a \in Acts |-> FALSE]
  /\ permit = [a \in Acts |-> "none"]
  /\ consumedBy = [a \in Acts |-> Nobody]
  /\ restarts = 0
  /\ humanNo = [a \in Acts |-> FALSE]
  /\ unjust = [a \in Acts |-> FALSE]
  /\ earlyLaunch = FALSE
  /\ lostApproval = FALSE
  /\ refused = [a \in Acts |-> FALSE]

\* 本会话的放行在当前依据下有效。
GrantValid(s) ==
  IF Variant = "staleSessionGrant" THEN grantRev[s] # NoGrant ELSE grantRev[s] = rev

\* 放行判断这个纯函数。"free" 放行且不用单次授权；"permit" 凭自己的单次授权放行，
\* 准入提交时用掉它；"ask" 仍要人决定；"deny" 拒绝。
Decide(a) ==
  LET s == SessOf(a) IN
  IF Variant = "bypassBeatsDeny" /\ mode[s] = "bypass" THEN "free"
  ELSE IF tier = "deny" THEN "deny"
  ELSE IF tier = "auto" THEN "free"
  ELSE IF GrantValid(s) THEN "free"
  ELSE IF mode[s] = "bypass" THEN "free"
  ELSE IF onceExpr[a] /\ permit[a] = "open" THEN "permit"
  ELSE IF mode[s] = "never" THEN "deny"
  ELSE "ask"

\* 记下放行的那一刻世界上的事实是否支持它。它不看模型里的判断怎么写，只看事实。
Just(a, ownPermit) ==
  LET s == SessOf(a) IN
  /\ ~cancelled[s]
  /\ tier # "deny"
  /\ (tier = "auto" \/ mode[s] = "bypass" \/ grantRev[s] = rev \/ ownPermit)

OpenCard(a) == [st EXCEPT ![a] = "asked"]

\* 准入提交：放行的结论、用掉的单次授权与依据在同一步记下。
Admit(a, d) ==
  /\ st' = [st EXCEPT ![a] = "allowed"]
  /\ IF d = "permit"
     THEN /\ permit' = [permit EXCEPT ![a] = "consumed"]
          /\ consumedBy' = [consumedBy EXCEPT ![a] = a]
          /\ unjust' = [unjust EXCEPT ![a] = ~Just(a, TRUE)]
     ELSE /\ UNCHANGED <<permit, consumedBy>>
          /\ unjust' = [unjust EXCEPT ![a] = ~Just(a, FALSE)]

Judge(a) ==
  /\ st[a] = "pending"
  /\ ~cancelled[SessOf(a)]
  /\ LET d == Decide(a) IN
     IF d \in {"free", "permit"}
     THEN /\ Admit(a, d)
          /\ UNCHANGED <<cardRev, cardWritable, asks>>
     ELSE IF d = "deny"
     THEN /\ st' = [st EXCEPT ![a] = "notStarted"]
          /\ UNCHANGED <<cardRev, cardWritable, asks, permit, consumedBy, unjust>>
     ELSE /\ st' = OpenCard(a)
          /\ cardRev' = [cardRev EXCEPT ![a] = rev]
          /\ cardWritable' = [cardWritable EXCEPT ![a] = writable]
          /\ asks' = [asks EXCEPT ![a] = @ + 1]
          /\ UNCHANGED <<permit, consumedBy, unjust>>
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, reply, applied, onceExpr, restarts, humanNo, earlyLaunch,
                 lostApproval, refused>>

\* 改坏的一种：准入用掉了别的动作的单次授权。
Steal(a) ==
  /\ Variant = "permitNotBound"
  /\ st[a] \in Open
  /\ ~cancelled[SessOf(a)]
  /\ Decide(a) = "ask"
  /\ \E b \in Acts \ {a} :
     /\ permit[b] = "open"
     /\ st' = [st EXCEPT ![a] = "allowed"]
     /\ permit' = [permit EXCEPT ![b] = "consumed"]
     /\ consumedBy' = [consumedBy EXCEPT ![b] = a]
     /\ unjust' = [unjust EXCEPT ![a] = ~Just(a, FALSE)]
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, reply, applied, cardRev, cardWritable, asks, onceExpr,
                 restarts, humanNo, earlyLaunch, lostApproval, refused>>

\* 落不了地的选项不给：卡生成时没有写资格，就不给两个「始终」。
Offered(a, o) == o \in {"allowAlways", "denyAlways"} => cardWritable[a]

Answer(a, o) ==
  /\ st[a] = "asked"
  /\ ~cancelled[SessOf(a)]
  /\ Offered(a, o)
  /\ st' = [st EXCEPT ![a] = "answered"]
  /\ reply' = [reply EXCEPT ![a] = o]
  /\ applied' = [applied EXCEPT ![a] = FALSE]
  /\ humanNo' = [humanNo EXCEPT ![a] = o \in {"denyOnce", "denyAlways", "remark"}]
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, cardRev, cardWritable, asks, onceExpr, permit, consumedBy,
                 restarts, unjust, earlyLaunch, lostApproval, refused>>

\* 这个答复按「本次放行」处理：选的就是它；或选了始终放行而此刻写不进去。
OnceLike(a) ==
  \/ reply[a] = "allowOnce"
  \/ reply[a] = "allowAlways" /\ ~writable /\ ~applied[a]
  \/ Variant = "remarkApproves" /\ reply[a] = "remark"

AppendOnce(a) ==
  /\ st[a] = "answered" /\ OnceLike(a) /\ ~onceExpr[a]
  /\ onceExpr' = [onceExpr EXCEPT ![a] = TRUE]
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, st, reply, applied, cardRev, cardWritable, asks, permit,
                 consumedBy, restarts, humanNo, unjust, earlyLaunch, lostApproval, refused>>

Grant(a) ==
  /\ st[a] = "answered" /\ onceExpr[a] /\ permit[a] = "none"
  /\ permit' = [permit EXCEPT ![a] = "open"]
  /\ applied' = [applied EXCEPT ![a] = TRUE]
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, st, reply, cardRev, cardWritable, asks, onceExpr,
                 consumedBy, restarts, humanNo, unjust, earlyLaunch, lostApproval, refused>>

AppendSession(a) ==
  /\ st[a] = "answered" /\ reply[a] = "allowSession" /\ ~applied[a]
  /\ grantRev' = [grantRev EXCEPT ![SessOf(a)] = cardRev[a]]
  /\ applied' = [applied EXCEPT ![a] = TRUE]
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 st, reply, cardRev, cardWritable, asks, onceExpr, permit, consumedBy,
                 restarts, humanNo, unjust, earlyLaunch, lostApproval, refused>>

WriteAlways(a) ==
  /\ st[a] = "answered" /\ reply[a] = "allowAlways" /\ ~applied[a] /\ writable
  \* 已经是自动时这次写入没有变化，不推进修订号。
  /\ IF tier = "auto" THEN UNCHANGED <<tier, rev>>
     ELSE /\ tier' = "auto"
          /\ rev' = rev + 1
  /\ applied' = [applied EXCEPT ![a] = TRUE]
  /\ UNCHANGED <<envChanges, writable, flips, mode, modeChanges, cancelled, grantRev,
                 st, reply, cardRev, cardWritable, asks, onceExpr, permit, consumedBy,
                 restarts, humanNo, unjust, earlyLaunch, lostApproval, refused>>

\* 人说了不。始终禁止在写得进去时另写租户设置，并撤回本会话的放行。
Refuse(a) ==
  /\ st[a] = "answered"
  /\ reply[a] \in {"denyOnce", "denyAlways"} \/ (reply[a] = "remark" /\ Variant # "remarkApproves")
  /\ st' = [st EXCEPT ![a] = "notStarted"]
  /\ IF reply[a] = "denyAlways" /\ writable
     THEN /\ IF tier = "deny" THEN UNCHANGED <<tier, rev>>
             ELSE /\ tier' = "deny"
                  /\ rev' = rev + 1
          /\ grantRev' = [grantRev EXCEPT ![SessOf(a)] = NoGrant]
     ELSE UNCHANGED <<tier, rev, grantRev>>
  /\ UNCHANGED <<envChanges, writable, flips, mode, modeChanges, cancelled, reply,
                 applied, cardRev, cardWritable, asks, onceExpr, permit, consumedBy,
                 restarts, humanNo, unjust, earlyLaunch, lostApproval, refused>>

\* 改坏的一种：答了放行就照答复记下放行，不按当前事实重算。
Allowing(a) ==
  \/ reply[a] \in {"allowOnce", "allowSession", "allowAlways"}
  \/ Variant = "remarkApproves" /\ reply[a] = "remark"

Rejudge(a) ==
  /\ st[a] = "answered" /\ applied[a]
  /\ ~cancelled[SessOf(a)]
  /\ LET d == IF Variant = "admissionTrustsAnswer" /\ Allowing(a) THEN "free" ELSE Decide(a) IN
     /\ lostApproval' = (lostApproval \/ (d = "ask" /\ onceExpr[a] /\ permit[a] = "none"))
     /\ IF d \in {"free", "permit"}
        THEN /\ Admit(a, d)
             /\ UNCHANGED <<cardRev, cardWritable, asks, reply, applied>>
        ELSE IF d = "deny" \/ cardRev[a] = rev
        THEN /\ st' = [st EXCEPT ![a] = "notStarted"]
             /\ UNCHANGED <<cardRev, cardWritable, asks, reply, applied, permit,
                            consumedBy, unjust>>
        ELSE /\ st' = OpenCard(a)
             /\ cardRev' = [cardRev EXCEPT ![a] = rev]
             /\ cardWritable' = [cardWritable EXCEPT ![a] = writable]
             /\ asks' = [asks EXCEPT ![a] = @ + 1]
             /\ reply' = [reply EXCEPT ![a] = "none"]
             /\ applied' = [applied EXCEPT ![a] = FALSE]
             /\ UNCHANGED <<permit, consumedBy, unjust>>
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, onceExpr, restarts, humanNo, earlyLaunch, refused>>

\* 卡还开着，依据变了：这张卡作废，按新的结论走。
Reconsider(a) ==
  /\ st[a] = "asked"
  /\ ~cancelled[SessOf(a)]
  /\ LET d == Decide(a) IN
     /\ d # "ask"
     /\ IF d = "deny"
        THEN /\ st' = [st EXCEPT ![a] = "notStarted"]
             /\ UNCHANGED <<permit, consumedBy, unjust>>
        ELSE Admit(a, d)
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, reply, applied, cardRev, cardWritable, asks, onceExpr,
                 restarts, humanNo, earlyLaunch, lostApproval, refused>>

Launch(a) ==
  /\ st[a] = "allowed"
  /\ LET mateOpen == \E b \in Batch(a) : st[b] \in Open IN
     /\ Variant = "noBarrier" \/ ~mateOpen
     /\ earlyLaunch' = (earlyLaunch \/ mateOpen)
  /\ st' = [st EXCEPT ![a] = "launched"]
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, reply, applied, cardRev, cardWritable, asks, onceExpr, permit,
                 consumedBy, restarts, humanNo, unjust, lostApproval, refused>>

\* Tool 开始执行：调用到了就执行。改坏的一种里它再判一次，判出不许就拒。
Start(a) ==
  /\ st[a] = "launched"
  /\ IF Variant = "startRejudges" /\ Decide(a) \in {"deny", "ask"}
     THEN /\ st' = [st EXCEPT ![a] = "notStarted"]
          /\ refused' = [refused EXCEPT ![a] = TRUE]
     ELSE /\ st' = [st EXCEPT ![a] = "started"]
          /\ UNCHANGED refused
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, reply, applied, cardRev, cardWritable, asks, onceExpr, permit,
                 consumedBy, restarts, humanNo, unjust, earlyLaunch, lostApproval>>

Cancel(s) ==
  /\ ~cancelled[s]
  /\ cancelled' = [cancelled EXCEPT ![s] = TRUE]
  /\ st' = [a \in Acts |->
              IF SessOf(a) # s \/ st[a] \in Settled THEN st[a]
              ELSE IF Variant = "cancelLeavesCardOpen" /\ st[a] = "asked" THEN "asked"
              ELSE "notStarted"]
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, grantRev,
                 reply, applied, cardRev, cardWritable, asks, onceExpr, permit,
                 consumedBy, restarts, humanNo, unjust, earlyLaunch, lostApproval, refused>>

ChangeSetting(t) ==
  /\ envChanges < MaxEnvChanges
  /\ t # tier
  /\ tier' = t
  /\ rev' = rev + 1
  /\ envChanges' = envChanges + 1
  /\ UNCHANGED <<writable, flips, mode, modeChanges, cancelled, grantRev, st, reply,
                 applied, cardRev, cardWritable, asks, onceExpr, permit, consumedBy,
                 restarts, humanNo, unjust, earlyLaunch, lostApproval, refused>>

ChangeMode(s, m) ==
  /\ modeChanges < MaxModeChanges
  /\ m # mode[s]
  /\ mode' = [mode EXCEPT ![s] = m]
  /\ modeChanges' = modeChanges + 1
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, cancelled, grantRev, st, reply,
                 applied, cardRev, cardWritable, asks, onceExpr, permit, consumedBy,
                 restarts, humanNo, unjust, earlyLaunch, lostApproval, refused>>

FlipWritable ==
  /\ flips < 1
  /\ writable' = ~writable
  /\ flips' = flips + 1
  /\ UNCHANGED <<tier, rev, envChanges, mode, modeChanges, cancelled, grantRev, st,
                 reply, applied, cardRev, cardWritable, asks, onceExpr, permit,
                 consumedBy, restarts, humanNo, unjust, earlyLaunch, lostApproval, refused>>

\* 重启：耐久的事实都在。改坏的一种里单次授权在内存里，重启就没了。
Restart ==
  /\ restarts < 1
  /\ restarts' = restarts + 1
  /\ permit' = IF Variant = "volatileLedger"
               THEN [a \in Acts |-> IF permit[a] = "open" THEN "none" ELSE permit[a]]
               ELSE permit
  /\ UNCHANGED <<tier, rev, envChanges, writable, flips, mode, modeChanges, cancelled,
                 grantRev, st, reply, applied, cardRev, cardWritable, asks, onceExpr,
                 consumedBy, humanNo, unjust, earlyLaunch, lostApproval, refused>>

System(a) ==
  \/ Judge(a) \/ AppendOnce(a) \/ Grant(a) \/ AppendSession(a) \/ WriteAlways(a)
  \/ Refuse(a) \/ Rejudge(a) \/ Reconsider(a) \/ Launch(a) \/ Start(a) \/ Steal(a)

Human(a) == \E o \in Options : Answer(a, o)

Next ==
  \/ \E a \in Acts : System(a) \/ Human(a)
  \/ \E s \in Sessions : Cancel(s)
  \/ \E t \in Tiers : ChangeSetting(t)
  \/ \E s \in Sessions, m \in Modes : ChangeMode(s, m)
  \/ FlipWritable
  \/ Restart

Spec == Init /\ [][Next]_vars
        /\ \A a \in Acts : WF_vars(System(a)) /\ WF_vars(Human(a))

TypeOK ==
  /\ tier \in Tiers
  /\ rev \in 0..MaxRev
  /\ mode \in [Sessions -> Modes]
  /\ grantRev \in [Sessions -> (0..MaxRev) \cup {NoGrant}]
  /\ st \in [Acts -> {"pending", "asked", "answered", "allowed", "launched",
                      "started", "notStarted"}]
  /\ reply \in [Acts -> Options \cup {"none"}]
  /\ permit \in [Acts -> {"none", "open", "consumed"}]
  /\ consumedBy \in [Acts -> Acts \cup {Nobody}]

\* A-4、A-5、A-17、A-18：记下放行的那一刻确实有依据。
NoUnjustAdmission == \A a \in Acts : ~unjust[a]
\* A-6：一张单次授权只被它绑定的动作的准入用掉。
PermitBound == \A a \in Acts : consumedBy[a] \in {Nobody, a}
\* A-8：人说了不，这个动作不发起、不开始。
HumanNoNeverRuns == \A a \in Acts : humanNo[a] => st[a] \notin {"allowed", "launched", "started"}
\* 判断屏障：同批还有没处理完的，不发起。
BarrierHolds == ~earlyLaunch
\* A-10：人同意过，单次授权没丢。
ApprovalNotLost == ~lostApproval
\* 已准并交出的动作，除了取消，不在开始时被拒：撤回只影响之后的准入。
AdmittedNotRefused == \A a \in Acts : ~refused[a]
\* A-3：被问的次数不超过一加依据变化的次数。
AskedBounded == \A a \in Acts : asks[a] <= 1 + rev
\* A-20：每个动作最后都有结局。
EveryActionSettles == <>[](\A a \in Acts : st[a] \in Settled)
=============================================================================

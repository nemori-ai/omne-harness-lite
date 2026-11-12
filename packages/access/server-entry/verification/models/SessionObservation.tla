---------------------------- MODULE SessionObservation ----------------------------
(* 模型三：会话观察的定位与流。                                                *)
(* 问的是：会话提交、提交通知送达、按间隔刷新、一次定位读日志并向模型取流、     *)
(* 模型发布或撤回一条流、流的帧送达、流结束或中断，这些事以任何顺序交错时，     *)
(* 观察者会不会漏掉一次提交，会不会把旧目标的帧发出去，会不会停在旧的调用上。   *)
(*                                                                            *)
(* 模型里的一步对应设计里的一步：                                              *)
(*   Commit        会话日志多一次提交，修订号加一，同时发出一条通知。提交可以   *)
(*                 带来一次新的主调用登记。                                    *)
(*   Notice        一条通知送达。定位空闲就开始定位；定位在进行就立起标记。    *)
(*   Timer         刷新的间隔到期。只在定位空闲、没有目标时发生。              *)
(*   LocateDone    一次定位结束。它用的是定位开始时读到的日志。现在没有目标，   *)
(*                 或主调用换了，才向模型取流。标记立着就立刻再定位一次。      *)
(*   Publish、Withdraw  模型发布或撤回一次调用的流。这是模型自己的事。         *)
(*   Produce、Deliver   订阅产出一帧；这一帧送达观察者。                       *)
(*   StreamEnd     目标的流结束，观察者回到没有目标。                          *)
(*   Interrupt、Resubscribe  订阅中断但目标还在；间隔到期后重新订阅同一目标。  *)
(*                                                                            *)
(* 没有建模：通知丢失（丢了由 Timer 补，见说明）、次数与累计时长的上界、时钟、  *)
(* 取消与撤权（它们对会话观察只是中止）。                                      *)
(*                                                                            *)
(* Variant 不是 "correct" 时，模型故意改坏一处，用来证明检查能失败。           *)
EXTENDS Naturals, FiniteSets

CONSTANTS MaxCommits, MaxSubs, Variant

VARIABLES
  logRev,      \* 会话日志的修订号
  logMain,     \* 日志里最近一次主调用的编号，0 表示还没有
  notices,     \* 已发出、还没送达的通知数
  loc,         \* 定位这条轴："idle" 或 "busy"
  flag,        \* 「有新提交待看」
  readRev,     \* 进行中的这次定位读到的修订号
  readMain,    \* 进行中的这次定位读到的主调用
  knownRev,    \* 观察者已经看到的修订号，也就是状态帧里的修订号
  str,         \* 流这条轴："none"、"observing"、"rewait"
  target,      \* 现在观察的主调用，0 表示没有目标
  sub,         \* 现在这份订阅的编号。每次订阅加一
  published,   \* 模型现在给出流的调用
  inFlight,    \* 已产出、还没送达的帧，记它属于哪份订阅
  stale        \* 发出过一帧不属于现在这份订阅的帧

vars == <<logRev, logMain, notices, loc, flag, readRev, readMain, knownRev,
          str, target, sub, published, inFlight, stale>>

Init ==
  /\ logRev = 0 /\ logMain = 0 /\ notices = 0
  /\ loc = "busy" /\ flag = FALSE /\ readRev = 0 /\ readMain = 0   \* 建立成功，第一次定位已经开始
  /\ knownRev = 0
  /\ str = "none" /\ target = 0 /\ sub = 0
  /\ published = {} /\ inFlight = {} /\ stale = FALSE

StartLocate ==
  /\ loc' = "busy" /\ readRev' = logRev /\ readMain' = logMain

Commit(newMain) ==
  /\ logRev < MaxCommits
  /\ logRev' = logRev + 1
  /\ logMain' = IF newMain THEN logRev + 1 ELSE logMain
  /\ notices' = notices + 1
  /\ UNCHANGED <<loc, flag, readRev, readMain, knownRev, str, target, sub, published, inFlight, stale>>

Notice ==
  /\ notices > 0
  /\ notices' = notices - 1
  /\ IF loc = "idle"
       THEN StartLocate /\ UNCHANGED flag
       ELSE /\ flag' = IF Variant = "dropWhileBusy" THEN flag ELSE TRUE
            /\ UNCHANGED <<loc, readRev, readMain>>
  /\ UNCHANGED <<logRev, logMain, knownRev, str, target, sub, published, inFlight, stale>>

Timer ==
  /\ loc = "idle" /\ str = "none"
  /\ StartLocate
  /\ UNCHANGED <<logRev, logMain, notices, flag, knownRev, str, target, sub, published, inFlight, stale>>

LocateDone ==
  /\ loc = "busy"
  /\ knownRev' = readRev
  /\ LET ask == readMain # 0 /\ (target = 0 \/ readMain # target)
     IN IF ask /\ readMain \in published /\ sub < MaxSubs
          THEN /\ target' = readMain /\ str' = "observing" /\ sub' = sub + 1
          ELSE IF ask /\ target # 0 /\ Variant # "keepOldTarget"
            THEN /\ target' = 0 /\ str' = "none" /\ UNCHANGED sub
            ELSE UNCHANGED <<target, str, sub>>
  /\ IF flag
       THEN /\ flag' = FALSE /\ loc' = "busy" /\ readRev' = logRev /\ readMain' = logMain
       ELSE /\ loc' = "idle" /\ UNCHANGED <<flag, readRev, readMain>>
  /\ UNCHANGED <<logRev, logMain, notices, published, inFlight, stale>>

Publish(c) ==
  /\ c \in 1..logRev /\ c \notin published
  /\ published' = published \cup {c}
  /\ UNCHANGED <<logRev, logMain, notices, loc, flag, readRev, readMain, knownRev, str, target, sub, inFlight, stale>>

Withdraw(c) ==
  /\ c \in published
  /\ published' = published \ {c}
  /\ UNCHANGED <<logRev, logMain, notices, loc, flag, readRev, readMain, knownRev, str, target, sub, inFlight, stale>>

Produce ==
  /\ str = "observing" /\ sub \notin inFlight
  /\ inFlight' = inFlight \cup {sub}
  /\ UNCHANGED <<logRev, logMain, notices, loc, flag, readRev, readMain, knownRev, str, target, sub, published, stale>>

Deliver(s) ==
  /\ s \in inFlight
  /\ inFlight' = inFlight \ {s}
  /\ stale' = IF s = sub /\ str = "observing" THEN stale
              ELSE IF Variant = "noDiscard" THEN TRUE ELSE stale
  /\ UNCHANGED <<logRev, logMain, notices, loc, flag, readRev, readMain, knownRev, str, target, sub, published>>

StreamEnd ==
  /\ str = "observing"
  /\ str' = "none" /\ target' = 0
  /\ UNCHANGED <<logRev, logMain, notices, loc, flag, readRev, readMain, knownRev, sub, published, inFlight, stale>>

Interrupt ==
  /\ str = "observing"
  /\ str' = "rewait"
  /\ UNCHANGED <<logRev, logMain, notices, loc, flag, readRev, readMain, knownRev, target, sub, published, inFlight, stale>>

Resubscribe ==
  /\ str = "rewait" /\ sub < MaxSubs
  /\ str' = "observing" /\ sub' = sub + 1
  /\ UNCHANGED <<logRev, logMain, notices, loc, flag, readRev, readMain, knownRev, target, published, inFlight, stale>>

Next ==
  \/ \E b \in BOOLEAN : Commit(b)
  \/ Notice \/ Timer \/ LocateDone
  \/ \E c \in 1..MaxCommits : Publish(c) \/ Withdraw(c)
  \/ Produce \/ \E s \in 1..MaxSubs : Deliver(s)
  \/ StreamEnd \/ Interrupt \/ Resubscribe

Spec == Init /\ [][Next]_vars /\ WF_vars(Notice) /\ WF_vars(LocateDone)

TypeOK ==
  /\ logRev \in 0..MaxCommits /\ logMain \in 0..MaxCommits /\ notices \in 0..MaxCommits
  /\ loc \in {"idle", "busy"} /\ flag \in BOOLEAN
  /\ readRev \in 0..MaxCommits /\ readMain \in 0..MaxCommits /\ knownRev \in 0..MaxCommits
  /\ str \in {"none", "observing", "rewait"} /\ target \in 0..MaxCommits /\ sub \in 0..MaxSubs
  /\ published \subseteq 1..MaxCommits /\ inFlight \subseteq 1..MaxSubs /\ stale \in BOOLEAN

\* 定位空闲、没有在途的通知、标记没立着。
Quiescent == loc = "idle" /\ notices = 0 /\ ~flag

\* 不丢唤醒：安静下来的时候，观察者看到的修订号就是日志的修订号。
QuiescentIsCurrent == Quiescent => knownRev = logRev

\* 不停在旧的调用上：安静下来的时候，目标要么没有，要么是日志里最近的主调用。
TargetIsLatest == Quiescent => (target = 0 \/ target = logMain)

\* 旧目标的帧不发出去。
NoStaleFrame == ~stale

\* 两条轴对得上：没有目标当且仅当流那条轴在 "none"。
AxesAgree == (target = 0) <=> (str = "none")

\* 提交停下之后，观察者最终看到最新的修订号，并一直保持。
EventuallyCurrent == <>[](knownRev = logRev)
=============================================================================

----------------------------- MODULE LiveCall -----------------------------
(* 一次 live 调用的生命周期。
   耐久的事实：阶段、结局、发送状态、两个意图、见没见过上游的「关了」、用量知不知道、
   收场时事件编到了第几号。事件与命令表都在活体里，活体可以随时丢。
   消费者是另一个寿命：活体把事件交给它，它记进自己的记录之后才答已保存，活体才释放。
   上游可以不答、可以自己关。
   结局沿用调用的三种终止：completed、interrupted、failed；failed 带成因：
   start 是会话没开起来，stream 是连接断了或期限到了，runtime 是活体丢了。
   Bugs 里的每个名字破坏一条规则，用来证明对应的性质真的会红。
   「连接中」是派生的：阶段是 accepted，发送状态不是 not-sent，连接在。 *)
EXTENDS Naturals, Integers, Sequences, FiniteSets

CONSTANTS Cmds, MaxEvents, MaxCrashes, Cap, Bugs

VARIABLES
  phase, outcome, send, cancelIntent, endIntent, closedSeen, usageKnown, through,   \* Model 的耐久事实
  body, conn, tried, connected, closeFor, tab, evs, floor, flying,                  \* 活体，会丢
  upState, toUp, fromUp, upEvents,                                                  \* 上游与线上
  got, cur, view, inbox, done, tail,                                                \* 消费者：只有 inbox 会丢
  sessions, cmdSent, verdict, crashes, ccrashes, overflowed, total, delivered       \* 只为检查用

durable == <<phase, outcome, send, cancelIntent, endIntent, closedSeen, usageKnown, through>>
volatile == <<body, conn, tried, connected, closeFor, tab, evs, floor, flying>>
upstream == <<upState, toUp, fromUp, upEvents>>
consumer == <<got, cur, view, inbox, done, tail>>
ghost == <<sessions, cmdSent, verdict, crashes, ccrashes, overflowed, total, delivered>>
vars == <<durable, volatile, upstream, consumer, ghost>>

Bug(b) == b \in Bugs

Init ==
  /\ phase = "accepted" /\ outcome = "none" /\ send = "not-sent"
  /\ cancelIntent = FALSE /\ endIntent = FALSE /\ closedSeen = FALSE /\ usageKnown = FALSE /\ through = -1
  /\ body = TRUE /\ conn = "none" /\ tried = FALSE /\ connected = FALSE /\ closeFor = "none"
  /\ tab = [c \in Cmds |-> "none"] /\ evs = <<>> /\ floor = 0 /\ flying = <<>>
  /\ upState = "none" /\ toUp = {} /\ fromUp = <<>> /\ upEvents = 0
  /\ got = <<>> /\ cur = 0 /\ view = [c \in Cmds |-> "none"] /\ inbox = <<>> /\ done = FALSE /\ tail = "none"
  /\ sessions = 0 /\ cmdSent = [c \in Cmds |-> 0] /\ verdict = [c \in Cmds |-> "none"]
  /\ crashes = 0 /\ ccrashes = 0 /\ overflowed = FALSE /\ total = 0 /\ delivered = {}

(* 活体把一条事件放进缓冲。缓冲有上界：满了就放掉最老的，下一次交付带一个缺口。
   在途的那一段不放掉：它没有得到已保存之前要原样重投。
   改坏 drop-in-flight：在途的也放掉，也不记着它。 *)
Pin == IF flying # <<>> /\ flying[1].e.k # "gap" /\ flying[1].s > cur THEN flying[1].s - 1 ELSE Len(evs) + 1
Push(e) ==
  /\ evs' = Append(evs, e) /\ total' = total + 1
  /\ LET want == IF Len(evs) + 1 - floor > Cap THEN Len(evs) + 1 - Cap ELSE floor
         kept == IF Bug("drop-in-flight") THEN want
                 ELSE IF want > Pin THEN (IF Pin > floor THEN Pin ELSE floor) ELSE want
     IN /\ floor' = kept /\ overflowed' = (overflowed \/ kept > floor)

(* 活体还在，但没等到上游的「关了」就收场：连接断了，或期限到了。
   因为取消而送过关闭的，是被中断；否则是失败。用量不知道。事件编到第几号记下来。 *)
SettleWithoutClosed ==
  /\ phase' = "settled"
  /\ outcome' = IF closeFor = "cancel" THEN "interrupted"
                ELSE IF Bug("lost-as-completed") THEN "completed"
                ELSE IF phase = "accepted" THEN "failed:start" ELSE "failed:stream"
  /\ usageKnown' = FALSE /\ through' = Len(evs)

DropConnection ==
  /\ conn' = "none" /\ toUp' = {} /\ fromUp' = <<>>
  /\ upState' = IF upState \in {"starting", "open"} THEN "gone" ELSE upState

---------------------------------------------------------------------------
\* 发出：先记「可能已发出」，再连。
RecordSend ==
  /\ body /\ ~tried /\ phase = "accepted" /\ send = "not-sent" /\ ~cancelIntent
  /\ send' = IF Bug("volatile-send") THEN "not-sent" ELSE "maybe-sent"
  /\ tried' = TRUE
  /\ UNCHANGED <<phase, outcome, cancelIntent, endIntent, closedSeen, usageKnown, through,
                 body, conn, connected, closeFor, tab, evs, floor, flying, upstream, consumer, ghost>>

Connect ==
  /\ body /\ tried /\ ~connected /\ phase = "accepted" /\ ~cancelIntent /\ sessions < 2
  /\ connected' = TRUE /\ conn' = "up" /\ upState' = "starting" /\ sessions' = sessions + 1
  /\ UNCHANGED <<durable, body, tried, closeFor, tab, evs, floor, flying, toUp, fromUp, upEvents, consumer,
                 cmdSent, verdict, crashes, ccrashes, overflowed, total, delivered>>

\* 记了要发、还没连，取消就到了：这个活体知道自己没连，直接收场。
AbandonBeforeConnect ==
  /\ body /\ tried /\ ~connected /\ phase = "accepted" /\ cancelIntent
  /\ phase' = "settled" /\ outcome' = "interrupted" /\ usageKnown' = FALSE /\ through' = 0
  /\ UNCHANGED <<send, cancelIntent, endIntent, closedSeen, volatile, upstream, consumer, ghost>>

UpStart ==
  /\ upState = "starting"
  /\ upState' = "open" /\ fromUp' = Append(fromUp, [k |-> "started"])
  /\ UNCHANGED <<durable, volatile, toUp, upEvents, consumer, ghost>>

UpRefuse ==
  /\ upState = "starting"
  /\ upState' = "closed" /\ fromUp' = Append(fromUp, [k |-> "closed"])
  /\ UNCHANGED <<durable, volatile, toUp, upEvents, consumer, ghost>>

RecvStarted ==
  /\ body /\ conn = "up" /\ fromUp # <<>> /\ Head(fromUp).k = "started" /\ phase = "accepted"
  /\ phase' = IF cancelIntent THEN "closing" ELSE "open"
  /\ send' = "sent" /\ fromUp' = Tail(fromUp) /\ Push(Head(fromUp))
  /\ UNCHANGED <<outcome, cancelIntent, endIntent, closedSeen, usageKnown, through,
                 body, conn, tried, connected, closeFor, tab, flying, upState, toUp, upEvents, consumer,
                 sessions, cmdSent, verdict, crashes, ccrashes, delivered>>

---------------------------------------------------------------------------
\* 命令。消费者先在自己的记录里记下「我发了这条」，再交给 Model；可以重交，身份相同。
Issue(c) ==
  /\ ~done /\ view[c] = "none" /\ \E i \in 1..Len(got) : got[i].e.k = "started"
  /\ view' = [view EXCEPT ![c] = "issued"]
  /\ UNCHANGED <<durable, volatile, upstream, got, cur, inbox, done, tail, ghost>>

(* 活体只在开着、且这个身份没见过时收下。别的情形是拒绝或认回，不改状态。
   改坏 command-not-idempotent：送过的身份再来，又排上队。 *)
Submit(c) ==
  /\ view[c] = "issued" /\ body /\ conn = "up" /\ phase = "open"
  /\ \/ tab[c] = "none"
     \/ (Bug("command-not-idempotent") /\ tab[c] = "sent" /\ cmdSent[c] < 2)
  /\ tab' = [tab EXCEPT ![c] = "queued"]
  /\ UNCHANGED <<durable, body, conn, tried, connected, closeFor, evs, floor, flying, upstream, consumer, ghost>>

SendCmd(c) ==
  /\ body /\ conn = "up" /\ phase = "open" /\ tab[c] = "queued"
  /\ tab' = [tab EXCEPT ![c] = "sent"] /\ toUp' = toUp \cup {c}
  /\ cmdSent' = [cmdSent EXCEPT ![c] = @ + 1]
  /\ UNCHANGED <<durable, body, conn, tried, connected, closeFor, evs, floor, flying, upState, fromUp, upEvents,
                 consumer, sessions, verdict, crashes, ccrashes, overflowed, total, delivered>>

UpTake(c) ==
  /\ upState = "open" /\ c \in toUp
  /\ toUp' = toUp \ {c}
  /\ \E v \in {"taken", "rejected"} :
       /\ fromUp' = Append(fromUp, [k |-> "ack", c |-> c, v |-> v])
       /\ verdict' = [verdict EXCEPT ![c] = v]
  /\ UNCHANGED <<durable, volatile, upState, upEvents, consumer, sessions, cmdSent, crashes, ccrashes,
                 overflowed, total, delivered>>

RecvAck ==
  /\ body /\ conn = "up" /\ fromUp # <<>> /\ Head(fromUp).k = "ack" /\ phase \in {"open", "closing"}
  /\ tab' = [tab EXCEPT ![Head(fromUp).c] = Head(fromUp).v]
  /\ Push(Head(fromUp)) /\ fromUp' = Tail(fromUp)
  /\ UNCHANGED <<durable, body, conn, tried, connected, closeFor, flying, upState, toUp, upEvents, consumer,
                 sessions, cmdSent, verdict, crashes, ccrashes, delivered>>

---------------------------------------------------------------------------
\* 事件：转写、委托、睡着与醒了。
UpEvent ==
  /\ upState = "open" /\ upEvents < MaxEvents
  /\ upEvents' = upEvents + 1 /\ fromUp' = Append(fromUp, [k |-> "ev", n |-> upEvents + 1])
  /\ UNCHANGED <<durable, volatile, upState, toUp, consumer, ghost>>

RecvEvent ==
  /\ body /\ conn = "up" /\ fromUp # <<>> /\ Head(fromUp).k = "ev" /\ phase \in {"open", "closing"}
  /\ Push(Head(fromUp)) /\ fromUp' = Tail(fromUp)
  /\ UNCHANGED <<durable, body, conn, tried, connected, closeFor, tab, flying, upState, toUp, upEvents, consumer,
                 sessions, cmdSent, verdict, crashes, ccrashes, delivered>>

(* 活体交一段事件给消费者。上一次交付还没有得到已保存时，用原键与原内容重投。
   否则交消费者已存下的位置之后的下一条，已存下的那些这时释放；
   要交的位置已经被放掉时，交一个缺口，写明丢到哪里。
   改坏 release-on-deliver：交出去就释放，也不记着它。改坏 silent-drop：放掉了的不写缺口，直接交后面的。 *)
Deliver ==
  /\ body /\ ~done /\ inbox = <<>>
  /\ \/ /\ flying # <<>> /\ cur < flying[1].s
        /\ inbox' = flying
        /\ UNCHANGED <<flying, floor, delivered>>
     \/ /\ ~(flying # <<>> /\ cur < flying[1].s) /\ cur < Len(evs)
        /\ LET f == IF cur < floor
                    THEN (IF Bug("silent-drop") /\ floor < Len(evs)
                          THEN [s |-> floor + 1, e |-> evs[floor + 1]]
                          ELSE [s |-> floor, e |-> [k |-> "gap"]])
                    ELSE [s |-> cur + 1, e |-> evs[cur + 1]]
           IN /\ inbox' = <<f>> /\ delivered' = delivered \cup {f}
              /\ flying' = IF Bug("release-on-deliver") \/ Bug("drop-in-flight") THEN <<>> ELSE <<f>>
        /\ floor' = IF Bug("release-on-deliver") /\ cur >= floor THEN cur + 1
                    ELSE IF cur > floor THEN cur ELSE floor
  /\ UNCHANGED <<durable, body, conn, tried, connected, closeFor, tab, evs, upstream, got, cur, view, done, tail,
                 sessions, cmdSent, verdict, crashes, ccrashes, overflowed, total>>

\* 消费者把交来的记进自己的记录，答已保存。
Record ==
  /\ inbox # <<>>
  /\ got' = Append(got, inbox[1]) /\ cur' = inbox[1].s
  /\ view' = IF inbox[1].e.k = "ack"
             THEN (IF view[inbox[1].e.c] = "issued" THEN [view EXCEPT ![inbox[1].e.c] = inbox[1].e.v] ELSE view)
             ELSE view
  /\ inbox' = <<>>
  /\ UNCHANGED <<durable, volatile, upstream, done, tail, ghost>>

\* 交付在途、消费者还没记下就丢了。
ConsumerCrash ==
  /\ ccrashes < MaxCrashes /\ inbox # <<>>
  /\ inbox' = <<>> /\ ccrashes' = ccrashes + 1
  /\ UNCHANGED <<durable, volatile, upstream, got, cur, view, done, tail, sessions, cmdSent, verdict, crashes,
                 overflowed, total, delivered>>

HasGap == \E i \in 1..Len(got) : got[i].e.k = "gap"

(* 消费者收到这次调用的结果。Model 在活体退出之后才推结果。
   结果带着收场时事件编到了第几号：消费者据此知道自己的记录全不全。
   这时还没有结局的命令，结局是不知道。
   改坏 end-before-drain：活体还在就推结果。改坏 no-through：结果不带编号，消费者只好当作全了。 *)
ConsumerEnd ==
  /\ phase = "settled" /\ ~done /\ inbox = <<>>
  /\ (~body \/ Bug("end-before-drain"))
  /\ done' = TRUE
  /\ view' = [c \in Cmds |-> IF view[c] = "issued" THEN "unknown" ELSE view[c]]
  /\ tail' = IF Bug("no-through") THEN (IF HasGap THEN "gap" ELSE "complete")
             ELSE IF through = -1 THEN "unknown"
             ELSE IF cur < through \/ HasGap THEN "gap" ELSE "complete"
  /\ UNCHANGED <<durable, volatile, upstream, got, cur, inbox, ghost>>

---------------------------------------------------------------------------
\* 正常结束与取消。两个都是耐久的意图。
End ==
  /\ phase = "open" /\ ~endIntent /\ ~cancelIntent
  /\ endIntent' = TRUE /\ phase' = "closing"
  /\ UNCHANGED <<outcome, send, cancelIntent, closedSeen, usageKnown, through, volatile, upstream, consumer, ghost>>

Cancel ==
  /\ ~cancelIntent /\ phase # "settled"
  /\ cancelIntent' = TRUE
  /\ IF phase = "accepted" /\ send = "not-sent" /\ ~tried
       THEN phase' = "settled" /\ outcome' = "interrupted" /\ through' = 0
       ELSE /\ phase' = IF phase = "open" THEN "closing" ELSE phase
            /\ outcome' = outcome /\ through' = through
  /\ UNCHANGED <<send, endIntent, closedSeen, usageKnown, volatile, upstream, consumer, ghost>>

\* 活体送关闭，并记下这次关闭是为取消还是为正常结束。
SendClose ==
  /\ body /\ conn = "up" /\ phase = "closing" /\ closeFor = "none"
  /\ closeFor' = IF cancelIntent THEN "cancel" ELSE "end"
  /\ UNCHANGED <<durable, body, conn, tried, connected, tab, evs, floor, flying, upstream, consumer, ghost>>

\* 上游关会话：因为我们请求了，或者它自己的原因（到期、对方挂断）。它可以永远不关。
UpClose ==
  /\ upState = "open"
  /\ upState' = "closed" /\ toUp' = {} /\ fromUp' = Append(fromUp, [k |-> "closed"])
  /\ UNCHANGED <<durable, volatile, upEvents, consumer, ghost>>

(* 见到上游的「关了」。它带着最终用量。
   会话没开起来是失败；因为取消而送过关闭是被中断；其余是完成。 *)
RecvClosed ==
  /\ body /\ conn = "up" /\ fromUp # <<>> /\ Head(fromUp).k = "closed"
  /\ closedSeen' = TRUE /\ usageKnown' = TRUE /\ through' = Len(evs)
  /\ phase' = "settled"
  /\ outcome' = IF phase = "accepted" THEN "failed:start"
                ELSE IF closeFor = "cancel" THEN "interrupted" ELSE "completed"
  /\ conn' = "none" /\ fromUp' = <<>> /\ toUp' = {}
  /\ UNCHANGED <<send, cancelIntent, endIntent, body, tried, connected, closeFor, tab, evs, floor, flying,
                 upState, upEvents, consumer, ghost>>

---------------------------------------------------------------------------
\* 断线、期限与丢活体。
ConnLost ==
  /\ body /\ conn = "up"
  /\ DropConnection /\ SettleWithoutClosed
  /\ UNCHANGED <<send, cancelIntent, endIntent, closedSeen, body, tried, connected, closeFor, tab, evs, floor, flying,
                 upEvents, consumer, ghost>>

(* 期限到了上游还没答，活体自己放掉连接。三个期限：开会话的，请求关闭之后的，
   开着时上游给这通会话的。改坏 wait-for-upstream：没有期限。 *)
Deadline ==
  /\ ~Bug("wait-for-upstream")
  /\ body /\ conn = "up"
  /\ DropConnection /\ SettleWithoutClosed
  /\ UNCHANGED <<send, cancelIntent, endIntent, closedSeen, body, tried, connected, closeFor, tab, evs, floor, flying,
                 upEvents, consumer, ghost>>

\* 收场之后活体在期限内把剩下的事件交出去，然后退出。期限到了没交完也退出。
BodyExit ==
  /\ body /\ phase = "settled"
  /\ body' = FALSE
  /\ UNCHANGED <<durable, conn, tried, connected, closeFor, tab, evs, floor, flying, upstream, consumer, ghost>>

Crash ==
  /\ body /\ crashes < MaxCrashes
  /\ body' = FALSE /\ tried' = FALSE /\ connected' = FALSE /\ closeFor' = "none"
  /\ tab' = [c \in Cmds |-> "none"] /\ evs' = <<>> /\ floor' = 0 /\ flying' = <<>>
  /\ DropConnection /\ crashes' = crashes + 1
  /\ UNCHANGED <<durable, upEvents, consumer, sessions, cmdSent, verdict, ccrashes, overflowed, total, delivered>>

\* 宿主的启动扫描把没收场的调用再交给驱动。
Redrive ==
  /\ ~body /\ phase # "settled"
  /\ body' = TRUE
  /\ UNCHANGED <<durable, conn, tried, connected, closeFor, tab, evs, floor, flying, upstream, consumer, ghost>>

(* 新的驱动看到「可能已发出」或「已发出」，而连接不在它手里：不重连，
   以成因 runtime 的失败收场。事件编到了第几号它不知道。 *)
Recover ==
  /\ ~Bug("reconnect-on-redrive")
  /\ body /\ ~tried /\ conn = "none" /\ phase # "settled" /\ send # "not-sent"
  /\ phase' = "settled" /\ usageKnown' = FALSE /\ through' = -1
  /\ outcome' = IF Bug("lost-as-completed") THEN "completed" ELSE "failed:runtime"
  /\ UNCHANGED <<send, cancelIntent, endIntent, closedSeen, volatile, upstream, consumer, ghost>>

\* 改坏：新的驱动重连。
Reconnect ==
  /\ Bug("reconnect-on-redrive")
  /\ body /\ ~tried /\ conn = "none" /\ phase # "settled" /\ send # "not-sent" /\ sessions < 2
  /\ tried' = TRUE /\ connected' = TRUE /\ conn' = "up" /\ upState' = "starting" /\ sessions' = sessions + 1
  /\ UNCHANGED <<durable, body, closeFor, tab, evs, floor, flying, toUp, fromUp, upEvents, consumer,
                 cmdSent, verdict, crashes, ccrashes, overflowed, total, delivered>>

Next ==
  \/ RecordSend \/ Connect \/ AbandonBeforeConnect \/ UpStart \/ UpRefuse \/ RecvStarted
  \/ \E c \in Cmds : Issue(c) \/ Submit(c) \/ SendCmd(c) \/ UpTake(c)
  \/ RecvAck \/ UpEvent \/ RecvEvent \/ Deliver \/ Record \/ ConsumerCrash \/ ConsumerEnd
  \/ End \/ Cancel \/ SendClose \/ UpClose \/ RecvClosed
  \/ ConnLost \/ Deadline \/ BodyExit \/ Crash \/ Redrive \/ Recover \/ Reconnect

(* 公平性逐个动作给，只给 Model 自己的步骤、宿主的再驱动与消费者收下的步骤。
   上游、消费者发不发命令、断线与崩溃都没有。 *)
Spec ==
  /\ Init /\ [][Next]_vars
  /\ WF_vars(RecordSend) /\ WF_vars(Connect) /\ WF_vars(AbandonBeforeConnect)
  /\ WF_vars(RecvStarted) /\ WF_vars(RecvAck) /\ WF_vars(RecvEvent)
  /\ WF_vars(SendClose) /\ WF_vars(RecvClosed) /\ WF_vars(Deadline) /\ WF_vars(BodyExit)
  /\ WF_vars(Redrive) /\ WF_vars(Recover)
  /\ WF_vars(Record) /\ WF_vars(ConsumerEnd)

---------------------------------------------------------------------------
TypeOK ==
  /\ phase \in {"accepted", "open", "closing", "settled"}
  /\ outcome \in {"none", "completed", "interrupted", "failed:start", "failed:stream", "failed:runtime"}
  /\ send \in {"not-sent", "maybe-sent", "sent"}
  /\ closeFor \in {"none", "end", "cancel"}
  /\ tail \in {"none", "complete", "gap", "unknown"}
  /\ \A c \in Cmds : /\ tab[c] \in {"none", "queued", "sent", "taken", "rejected"}
                     /\ view[c] \in {"none", "issued", "taken", "rejected", "unknown"}
  /\ floor <= Len(evs) /\ Len(inbox) <= 1 /\ Len(flying) <= 1 /\ through >= -1

\* MD-56 至多建一次上游会话。
OneSession == sessions <= 1
\* MD-57 每条命令至多真实送出一次。
CmdOnce == \A c \in Cmds : cmdSent[c] <= 1
\* MD-57 消费者认定的结局与上游真实的裁决一致。
ViewTruth == \A c \in Cmds : view[c] \in {"taken", "rejected"} => verdict[c] = view[c]
\* MD-57 消费者收到结果之后，没有悬着的命令。
DoneClean == done => \A c \in Cmds : view[c] # "issued"
\* MD-57 活体还在、缓冲里还有某条命令没交出去的结局时，消费者不会把它认成不知道。
DrainedBeforeUnknown ==
  \A c \in Cmds : (view[c] = "unknown" /\ body) =>
    ~\E i \in (floor + 1)..Len(evs) : (evs[i].k = "ack" /\ evs[i].c = c)
\* MD-58 消费者记下的事件按序号一条接一条；跳过的地方一定有一个缺口记号。
GotOrdered ==
  \A i \in 1..Len(got) :
    LET prev == IF i = 1 THEN 0 ELSE got[i - 1].s IN
      IF got[i].e.k = "gap" THEN got[i].s > prev ELSE got[i].s = prev + 1
\* MD-58 同一个键交出去的内容每次都相同。
SameKeySameContent == \A a \in delivered : \A b \in delivered : a.s = b.s => a = b
\* MD-58 缓冲没有满过，就没有缺口。
NoGap == overflowed \/ ~HasGap
\* MD-58 消费者认为自己的记录是全的，它就真的是全的：上游来过的每一条都在，中间没有缺口。
TailHonest == (done /\ tail = "complete") => (cur = total /\ ~HasGap)
\* 开着或关闭中时，发送状态一定是已发出。
PhaseSend == phase \in {"open", "closing"} => send = "sent"
\* MD-59 说完成，必须亲眼见过上游的「关了」。
CompletedOnlyIfClosed == outcome = "completed" => closedSeen
\* MD-59 用量只在见过「关了」时是知道的。
UsageHonest == usageKnown => closedSeen
\* 连接只属于活体；收场之后没有连接。
ConnNeedsBody == conn = "up" => (body /\ phase # "settled")

\* MD-57 消费者认定的命令结局定了就不变。
ViewStable == [][\A c \in Cmds : view[c] \in {"taken", "rejected", "unknown"} => view'[c] = view[c]]_vars
\* MD-57 认成不知道的命令，之后不再送出。
UnknownNotResent == [][\A c \in Cmds : view[c] = "unknown" => cmdSent'[c] = cmdSent[c]]_vars
\* MD-58 消费者的记录只追加。
GotAppendOnly == [][Len(got') >= Len(got) /\ SubSeq(got', 1, Len(got)) = got]_vars
\* 结局成立后不变。
OutcomeStable == [][phase = "settled" => (phase' = "settled" /\ outcome' = outcome /\ through' = through)]_vars

\* 进展：每次调用终究收场，不依赖上游答复。
Settles == <>(phase = "settled")
\* 进展：取消的意图成立之后，调用终究收场。
CancelSettles == cancelIntent ~> (phase = "settled")
\* 进展：调用收场之后，消费者终究收到结果。
ConsumerLearnsEnd == (phase = "settled") ~> done

\* 见证：这些「永远不会」应当被打破，证明对应的状态到得了。
NeverCompleted == outcome # "completed"
NeverInterrupted == outcome # "interrupted"
NeverFailedStart == outcome # "failed:start"
NeverFailedStream == outcome # "failed:stream"
NeverFailedRuntime == outcome # "failed:runtime"
NeverTaken == \A c \in Cmds : view[c] # "taken"
NeverUnknown == \A c \in Cmds : view[c] # "unknown"
NeverGap == ~HasGap
NeverRedelivered == ~(ccrashes = 1 /\ Len(got) >= 2)
NeverTailComplete == tail # "complete"
NeverTailGap == tail # "gap"
NeverTailUnknown == tail # "unknown"
NeverCompletedAfterCancel == ~(outcome = "completed" /\ cancelIntent)
===========================================================================

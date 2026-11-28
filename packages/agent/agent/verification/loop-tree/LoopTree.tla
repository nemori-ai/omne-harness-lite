------------------------------ MODULE LoopTree ------------------------------
(* 一棵调用树。有孩子的节点是一次 execution（一个环），没孩子的是叶子（模型、工具）。
   一个环调用另一个环（派发），另一头是另一次 execution，归它自己的协调者。
   修订 2 的规则：
   - 结束只要责任交清：每个发出的调用要么已经收场，要么消费责任交给了保管方
     （Agent 的结果接收，execution 结束了也照收）；不等孩子收场。
   - 取消往下传的是一句「不再持有」：调用方把消费责任交给保管方；对叶子是一次控制，
     对派发出去的环不取消它（派发的不变式 DP-07）。
   - 结果不知道的调用，责任交不出去，它的调用方结束不了；Run 的取消终态在协调者一侧照样成立。
   - 别的环递来的话进调用方协调者的收件箱，不丢。
   Bad* 开关各破坏一条规则，用来证明对应的性质真的会红。 *)
EXTENDS Naturals, FiniteSets

CONSTANTS Nodes, Root, Parent, Versions, Unknown, Teller,
          BadVolatile, BadReadAdopted, BadEndHeld, BadIssueAfterCancel,
          BadWaitForChild, BadDropLate

VARIABLES st, out, rec, mem, effects, resp, settled, cancelReq,
          pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel

vars == <<st, out, rec, mem, effects, resp, settled, cancelReq,
          pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

Children(n) == {c \in Nodes \ {Root} : Parent[c] = n}
IsLeaf(n)   == Children(n) = {}
Execs       == {n \in Nodes : ~IsLeaf(n)}
Calls       == Nodes \ {Root}

\* 责任交清：发出的每个调用，要么答复已收下，要么在保管方手里。
Closed(n) == \A c \in rec[n] : settled[c] \/ resp[c] = "custodian"

Init ==
  /\ st        = [n \in Nodes |-> "idle"]
  /\ out       = [n \in Nodes |-> "none"]
  /\ rec       = [n \in Nodes |-> {}]       \* 耐久：执行记录里已发出的调用
  /\ mem       = [n \in Nodes |-> {}]       \* 活体内存，随活体丢
  /\ effects   = [n \in Nodes |-> 0]        \* 被调用方真的被启动了几次
  /\ resp      = [n \in Nodes |-> "none"]   \* 这个调用的消费责任在谁手里
  /\ settled   = [n \in Nodes |-> FALSE]    \* 答复已被调用方或保管方收下
  /\ cancelReq = [n \in Nodes |-> FALSE]
  /\ pinned    = [n \in Nodes |-> "none"]   \* 这次 execution 钉住的采用依据
  /\ seen      = [n \in Nodes |-> {}]       \* 各次重算读到过的版本
  /\ adopted \in Versions                   \* 协调者此刻采用的版本
  /\ inbox     = {}                         \* Teller 的调用方的协调者收件箱
  /\ sent      = FALSE
  /\ taken     = FALSE
  /\ runEnd    = "none"                     \* 根的 Run 在协调者一侧的终态
  /\ issuedAfterCancel = FALSE              \* 历史量：取消生效之后有没有发出过调用

Open ==
  /\ st[Root] = "idle"
  /\ st'      = [st EXCEPT ![Root] = "open"]
  /\ pinned'  = [pinned EXCEPT ![Root] = adopted]
  /\ effects' = [effects EXCEPT ![Root] = 1]
  /\ UNCHANGED <<out, rec, mem, resp, settled, cancelReq, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

ReadVer(n) == IF BadReadAdopted THEN adopted ELSE pinned[n]

\* 一次重算，结论是「发出一个调用」：记录与启动在同一次提交里（R2）。
Emit(n) ==
  LET known == IF BadVolatile THEN mem[n] ELSE rec[n]
  IN /\ n \in Execs /\ st[n] = "open"
     /\ (~cancelReq[n] \/ BadIssueAfterCancel)
     /\ \E c \in Children(n) \ known :
          /\ rec'     = [rec EXCEPT ![n] = @ \cup {c}]
          /\ mem'     = [mem EXCEPT ![n] = @ \cup {c}]
          /\ effects' = [effects EXCEPT ![c] = @ + 1]
          /\ st'      = [st EXCEPT ![c] = IF @ = "idle" THEN "open" ELSE @]
          /\ pinned'  = [pinned EXCEPT ![c] = IF st[c] = "idle" THEN adopted ELSE @]
          /\ resp'    = [resp EXCEPT ![c] = IF @ = "none" /\ ~settled[c] THEN "caller" ELSE @]
     /\ seen' = [seen EXCEPT ![n] = @ \cup {ReadVer(n)}]
     /\ issuedAfterCancel' = (issuedAfterCancel \/ cancelReq[n])
     /\ UNCHANGED <<out, settled, cancelReq, adopted, inbox, sent, taken, runEnd>>

\* 转后台：调用方把一个已受理的调用的消费责任交给保管方。结果不知道的交不出去。
Background(n, c) ==
  /\ c \in rec[n] /\ st[n] = "open" /\ resp[c] = "caller" /\ ~settled[c] /\ c \notin Unknown
  /\ resp' = [resp EXCEPT ![c] = "custodian"]
  /\ UNCHANGED <<st, out, rec, mem, effects, settled, cancelReq, pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

LeafDone(c) ==
  /\ IsLeaf(c) /\ st[c] = "open" /\ ~cancelReq[c] /\ c \notin Unknown
  /\ \E o \in {"ok", "failed"} : out' = [out EXCEPT ![c] = o]
  /\ st' = [st EXCEPT ![c] = "finished"]
  /\ UNCHANGED <<rec, mem, effects, resp, settled, cancelReq, pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

LeafCancelled(c) ==
  /\ IsLeaf(c) /\ st[c] = "open" /\ cancelReq[c] /\ c \notin Unknown
  /\ st'  = [st EXCEPT ![c] = "finished"]
  /\ out' = [out EXCEPT ![c] = "cancelled"]
  /\ UNCHANGED <<rec, mem, effects, resp, settled, cancelReq, pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

\* 结果按原身份回到受理时登记的消费者：还在等的调用方，或保管方。
DeliverToCaller(c) ==
  /\ c \in Calls /\ st[c] = "finished" /\ ~settled[c]
  /\ resp[c] = "caller" /\ st[Parent[c]] = "open"
  /\ settled' = [settled EXCEPT ![c] = TRUE]
  /\ resp'    = [resp EXCEPT ![c] = "none"]
  /\ UNCHANGED <<st, out, rec, mem, effects, cancelReq, pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

DeliverToCustodian(c) ==
  /\ c \in Calls /\ st[c] = "finished" /\ ~settled[c] /\ resp[c] = "custodian"
  /\ settled' = [settled EXCEPT ![c] = TRUE]
  /\ resp'    = [resp EXCEPT ![c] = "none"]
  /\ UNCHANGED <<st, out, rec, mem, effects, cancelReq, pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

\* 收尾为完成：决定者发完了要发的，责任交清。
FinishOk(n) ==
  /\ n \in Execs /\ st[n] = "open" /\ ~cancelReq[n]
  /\ rec[n] = Children(n)
  /\ (Closed(n) \/ BadEndHeld)
  /\ st'     = [st EXCEPT ![n] = "finished"]
  /\ out'    = [out EXCEPT ![n] = "ok"]
  /\ seen'   = [seen EXCEPT ![n] = @ \cup {ReadVer(n)}]
  /\ runEnd' = IF n = Root /\ runEnd = "none" THEN "ok" ELSE runEnd
  /\ UNCHANGED <<rec, mem, effects, resp, settled, cancelReq, pinned, adopted, inbox, sent, taken, issuedAfterCancel>>

\* 取消由这次 execution 的协调者提出。根的 Run 的取消终态在这一刻成立。
Cancel(n) ==
  /\ n \in Execs /\ st[n] = "open" /\ ~cancelReq[n]
  /\ cancelReq' = [cancelReq EXCEPT ![n] = TRUE]
  /\ runEnd'    = IF n = Root /\ runEnd = "none" THEN "cancelled" ELSE runEnd
  /\ UNCHANGED <<st, out, rec, mem, effects, resp, settled, pinned, seen, adopted, inbox, sent, taken, issuedAfterCancel>>

\* 取消往下传：一句「不再持有」。消费责任交给保管方；叶子收到一次控制，派发出去的环不被取消。
Notify(n, c) ==
  /\ cancelReq[n] /\ c \in rec[n] /\ resp[c] = "caller" /\ ~settled[c] /\ c \notin Unknown
  /\ resp'      = [resp EXCEPT ![c] = "custodian"]
  /\ cancelReq' = IF IsLeaf(c) THEN [cancelReq EXCEPT ![c] = TRUE] ELSE cancelReq
  /\ UNCHANGED <<st, out, rec, mem, effects, settled, pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

\* 收尾为已取消：只要责任交清（修订 1 是等孩子都收场，BadWaitForChild 把它放回来）。
FinishCancelled(n) ==
  /\ n \in Execs /\ st[n] = "open" /\ cancelReq[n]
  /\ IF BadWaitForChild THEN \A c \in rec[n] : st[c] = "finished"
                        ELSE (Closed(n) \/ BadEndHeld)
  /\ st'  = [st EXCEPT ![n] = "finished"]
  /\ out' = [out EXCEPT ![n] = "cancelled"]
  /\ UNCHANGED <<rec, mem, effects, resp, settled, cancelReq, pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

\* 沿边说话：Teller 给调用它的一方递一句话，进那一方协调者的收件箱。
Tell ==
  /\ st[Teller] = "open" /\ ~sent
  /\ sent'  = TRUE
  /\ inbox' = IF BadDropLate /\ st[Parent[Teller]] = "finished" THEN inbox ELSE inbox \cup {"m"}
  /\ UNCHANGED <<st, out, rec, mem, effects, resp, settled, cancelReq, pinned, seen, adopted, taken, runEnd, issuedAfterCancel>>

\* 收话：调用方开着时取走。取走之后这句话归这次 execution 的记录。
Take ==
  /\ st[Parent[Teller]] = "open" /\ "m" \in inbox
  /\ inbox' = {}
  /\ taken' = TRUE
  /\ UNCHANGED <<st, out, rec, mem, effects, resp, settled, cancelReq, pinned, seen, adopted, sent, runEnd, issuedAfterCancel>>

\* 活体丢了：只丢内存。
Crash(n) ==
  /\ mem[n] # {}
  /\ mem' = [mem EXCEPT ![n] = {}]
  /\ UNCHANGED <<st, out, rec, effects, resp, settled, cancelReq, pinned, seen, adopted, inbox, sent, taken, runEnd, issuedAfterCancel>>

Adopt(v) ==
  /\ v # adopted
  /\ adopted' = v
  /\ UNCHANGED <<st, out, rec, mem, effects, resp, settled, cancelReq, pinned, seen, inbox, sent, taken, runEnd, issuedAfterCancel>>

Progress(n) ==
  \/ Emit(n) \/ FinishOk(n) \/ FinishCancelled(n)
  \/ LeafDone(n) \/ LeafCancelled(n)
  \/ DeliverToCaller(n) \/ DeliverToCustodian(n)
  \/ \E c \in Nodes : Notify(n, c)

Next ==
  \/ Open \/ Tell \/ Take
  \/ \E n \in Nodes : Progress(n) \/ Crash(n) \/ Cancel(n)
  \/ \E n, c \in Nodes : Background(n, c)
  \/ \E v \in Versions : Adopt(v)
  \/ UNCHANGED vars   \* 收场之后停在原地，不算死锁

Spec == Init /\ [][Next]_vars /\ WF_vars(Open) /\ WF_vars(Take)
        /\ \A n \in Nodes : WF_vars(Progress(n))

Bound == \A n \in Nodes : effects[n] <= 2

\* 只查采用依据的配置不探索递话：递话由别的配置查。
NoTell == ~sent

-----------------------------------------------------------------------
TypeOK ==
  /\ st \in [Nodes -> {"idle", "open", "finished"}]
  /\ out \in [Nodes -> {"none", "ok", "failed", "cancelled"}]
  /\ resp \in [Nodes -> {"none", "caller", "custodian"}]
  /\ runEnd \in {"none", "ok", "cancelled"}
  /\ \A n \in Nodes : rec[n] \subseteq Children(n)

\* 每个调用至多被启动一次，活体丢多少次都一样（命题一，R2）。
NoDup == \A n \in Nodes : effects[n] <= 1

\* 一次 execution 的每次重算读到的是同一份采用依据（命题三，R4）。
PinnedOnce == \A n \in Nodes : Cardinality(seen[n]) <= 1

\* 没有无人负责的调用：发出而答复还没被收下的调用，恰有一方负责——还开着的调用方，或保管方（命题四）。
NoOrphan ==
  \A c \in Calls :
    (c \in rec[Parent[c]] /\ ~settled[c]) =>
      \/ resp[c] = "custodian"
      \/ (resp[c] = "caller" /\ st[Parent[c]] = "open")

\* 结果不知道的调用一旦发出，它的调用方结束不了；而 Run 的取消终态不受它挡。
UnknownHolds == \A u \in Unknown : effects[u] >= 1 => st[Parent[u]] # "finished"

\* 递来的话不丢：要么还在收件箱，要么被取走了。
NoLostMessage == sent => ("m" \in inbox \/ taken)

\* 取消生效之后不再发出新调用（R5 前半），写成历史量上的不变式。
CancelQuiet == ~issuedAfterCancel

\* 取消之后，责任一交清，根就能结束：不等它派出去的环收场（R5 后半）。
CanEndAfterCancel ==
  (st[Root] = "open" /\ cancelReq[Root] /\ Closed(Root)) => ENABLED FinishCancelled(Root)

\* 见证用：这些「永远不会」应当被打破，证明状态可达。
NeverOk          == ~(out[Root] = "ok")
NeverCancelled   == ~(out[Root] = "cancelled")
NeverCustody     == ~(\E c \in Calls : resp[c] = "custodian")
NeverLateCustody == ~(\E c \in Calls : resp[c] = "custodian" /\ st[c] = "finished" /\ st[Parent[c]] = "finished")
NeverTaken       == ~taken
NeverRunCancelledExecOpen == ~(runEnd = "cancelled" /\ st[Root] = "open")
\* 模型值：r 是根，a 是 r 派出去的环，b 是 r 的叶子，c 是 a 的叶子；a 给 r 递一句话。
MCNodes  == {"r", "a", "b", "c"}
MCParent == [n \in {"a", "b", "c"} |-> IF n \in {"a", "b"} THEN "r" ELSE "a"]
=========================================================================

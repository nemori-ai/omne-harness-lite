------------------------------- MODULE Availability -------------------------------
(* 模型二：可用性两端收敛。                                                    *)
(* 问的是：订阅、挂上或撤下协议、给订阅者写帧、订阅者应用帧、断线、重连、丢掉   *)
(* 积压，这些事以任何顺序交错时，订阅者看到的集合最终是不是等于登记表。         *)
(*                                                                            *)
(* 模型里的一步对应实现里的一步：                                              *)
(*   Change      登记表改一次，修订号加一，同时给每个订阅者排一帧变化。积压满   *)
(*               了的订阅者：丢掉积压，改排一帧最新的快照。                    *)
(*   Subscribe   读登记表得到快照，并把订阅者登记上。读和登记是一步。          *)
(*   Deliver     订阅者应用队头的一帧。                                        *)
(*   Disconnect  连接断开。服务端丢掉这个订阅者和它的积压，客户端留着旧的视图。 *)
(*                                                                            *)
(* 客户端树上有哪些协议客户端，是视图里的集合和本机装着的模块的交集，是视图的   *)
(* 函数，模型里不单独表示。                                                    *)
(*                                                                            *)
(* Variant 不是 "correct" 时，模型故意改坏一处，用来证明检查能失败。           *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Protocols, Subs, MaxRev, QMax, MaxDisc, Variant

VARIABLES reg, rev, hist, subscribed, queue, view, disc, pending

vars == <<reg, rev, hist, subscribed, queue, view, disc, pending>>

Snapshot(r, s) == [kind |-> "snapshot", rev |-> r, set |-> s, added |-> {}, removed |-> {}]
Delta(r, a, d) == [kind |-> "delta", rev |-> r, set |-> {}, added |-> a, removed |-> d]
NoView == [valid |-> FALSE, rev |-> 0, set |-> {}]

Init ==
  /\ reg = {}
  /\ rev = 0
  /\ hist = [r \in 0..MaxRev |-> {}]
  /\ subscribed = [s \in Subs |-> FALSE]
  /\ queue = [s \in Subs |-> <<>>]
  /\ view = [s \in Subs |-> NoView]
  /\ disc = [s \in Subs |-> 0]
  /\ pending = [s \in Subs |-> <<>>]

Change(p) ==
  /\ rev < MaxRev
  /\ LET newReg == IF p \in reg THEN reg \ {p} ELSE reg \cup {p}
         frame == Delta(rev + 1, newReg \ reg, reg \ newReg)
     IN /\ reg' = newReg
        /\ rev' = rev + 1
        /\ hist' = [hist EXCEPT ![rev + 1] = newReg]
        /\ queue' = [s \in Subs |->
                       IF ~subscribed[s] THEN queue[s]
                       ELSE IF Len(queue[s]) < QMax THEN Append(queue[s], frame)
                       ELSE IF Variant = "dropOldest" THEN Append(Tail(queue[s]), frame)
                       ELSE <<Snapshot(rev + 1, newReg)>>]
  /\ UNCHANGED <<subscribed, view, disc, pending>>

Subscribe(s) ==
  /\ ~subscribed[s]
  /\ pending[s] = <<>>
  /\ Variant # "nonAtomicSubscribe"
  /\ subscribed' = [subscribed EXCEPT ![s] = TRUE]
  /\ queue' = [queue EXCEPT ![s] =
                 IF Variant = "staleOnReconnect" /\ view[s].valid
                 THEN <<>>
                 ELSE <<Snapshot(rev, reg)>>]
  /\ UNCHANGED <<reg, rev, hist, view, disc, pending>>

\* 只在改坏的变体里出现：先读登记表，隔了一步才把订阅者登记上。
TakeSnapshot(s) ==
  /\ Variant = "nonAtomicSubscribe"
  /\ ~subscribed[s]
  /\ pending[s] = <<>>
  /\ pending' = [pending EXCEPT ![s] = <<Snapshot(rev, reg)>>]
  /\ UNCHANGED <<reg, rev, hist, subscribed, queue, view, disc>>

RegisterSubscriber(s) ==
  /\ pending[s] # <<>>
  /\ subscribed' = [subscribed EXCEPT ![s] = TRUE]
  /\ queue' = [queue EXCEPT ![s] = pending[s]]
  /\ pending' = [pending EXCEPT ![s] = <<>>]
  /\ UNCHANGED <<reg, rev, hist, view, disc>>

Deliver(s) ==
  /\ subscribed[s]
  /\ queue[s] # <<>>
  /\ LET f == Head(queue[s])
     IN view' = [view EXCEPT ![s] =
                   IF f.kind = "snapshot"
                   THEN [valid |-> TRUE, rev |-> f.rev, set |-> f.set]
                   ELSE [valid |-> TRUE, rev |-> f.rev, set |-> (view[s].set \cup f.added) \ f.removed]]
  /\ queue' = [queue EXCEPT ![s] = Tail(@)]
  /\ UNCHANGED <<reg, rev, hist, subscribed, disc, pending>>

Disconnect(s) ==
  /\ subscribed[s]
  /\ disc[s] < MaxDisc
  /\ subscribed' = [subscribed EXCEPT ![s] = FALSE]
  /\ queue' = [queue EXCEPT ![s] = <<>>]
  /\ disc' = [disc EXCEPT ![s] = @ + 1]
  /\ UNCHANGED <<reg, rev, hist, view, pending>>

Next ==
  \/ \E p \in Protocols : Change(p)
  \/ \E s \in Subs : Subscribe(s) \/ TakeSnapshot(s) \/ RegisterSubscriber(s) \/ Deliver(s) \/ Disconnect(s)

Fairness == \A s \in Subs : WF_vars(Deliver(s)) /\ WF_vars(RegisterSubscriber(s))

Spec == Init /\ [][Next]_vars /\ Fairness

--------------------------------------------------------------------------------
(* 性质 *)

TypeOK ==
  /\ reg \subseteq Protocols
  /\ rev \in 0..MaxRev
  /\ \A s \in Subs : Len(queue[s]) <= QMax /\ disc[s] \in 0..MaxDisc

\* 订阅者的视图总是登记表在某个修订号上真实有过的样子。
ViewIsTruePast == \A s \in Subs : view[s].valid => view[s].set = hist[view[s].rev]

\* 帧不错位：队头是变化帧时，它的基础正好是订阅者手里的那个修订号。
DeltaBaseMatches ==
  \A s \in Subs :
    (subscribed[s] /\ queue[s] # <<>> /\ Head(queue[s]).kind = "delta")
      => (view[s].valid /\ view[s].rev + 1 = Head(queue[s]).rev)

\* I-6：订阅着的订阅者，最终看到的集合等于登记表，除非它又断开了。
Converges ==
  \A s \in Subs :
    subscribed[s] ~> (~subscribed[s] \/ (view[s].valid /\ view[s].rev = rev /\ view[s].set = reg))

================================================================================

------------------------------ MODULE CardRounds ------------------------------
(***************************************************************************)
(* The native wait of the Agent loop after a conclusion that needs a       *)
(* person: loop-algorithm nodes X1 to X4 and the barrier A1 of one action  *)
(* batch. Which party judged (official admission need-decision, or an      *)
(* extension ask) is out of scope: each passage is the extension call that *)
(* returned ask, and HandBack is the replay with the replies (re-admit     *)
(* with decision, or replay{binding}).                                     *)
(*                                                                         *)
(* Durable state (AgentJournal): ps, rs, askOf, jr, closed.                *)
(* Provider state (DecisionCards, the human): created, wire, pr.           *)
(* Volatile state (one coordinator process): online, inflight, known,      *)
(* slot. A crash clears the volatile state.                                *)
(* Ghosts and monitors: handbacks, barrierOk, handOk, adoptOk, crashes,    *)
(* losses. No action reads a ghost except to bound the state space.        *)
(*                                                                         *)
(* SPEC.md "扩展、卡片与材料" and "整批判断屏障与动作准入" own the rules.   *)
(* verification/formal-mapping.md, section CardRounds, maps each action    *)
(* to its clause and code location, and lists the bounds.                  *)
(***************************************************************************)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
  Bad,          \* "none", or the name of one deliberate error (negative controls)
  Passages,     \* one asking extension call per action chain of the batch
  Cards,        \* the card requests of each round
  MaxRounds,    \* rounds per passage
  MaxCrash,     \* crashes of the coordinator process
  MaxLoss,      \* lost present or invalidate receipts
  AllowCancel,  \* the run can be cancelled
  AllowDeny     \* the official admission can answer unavailable (all-denied)

Rounds == 1..MaxRounds
NoCall == -1    \* inflight: no invocation
FreshCall == 0  \* inflight: fresh invocation, or replay after an unknown result
                \* inflight r > 0: replay that hands back the replies of round r

PassageStates == {"idle", "requested", "asked", "resolved", "applied"}
RoundStates == {"none", "requested", "presented", "answered", "processed", "failed"}

VARIABLES
  ps,        \* [Passages -> PassageStates]: PassageProgress (idle = not started)
  rs,        \* [Passages -> [Rounds -> RoundStates]]: CardRoundProgress (failed = present-failed)
  askOf,     \* [Passages -> [Rounds -> 0..MaxRounds]]: the ask Conclusion a round presents
  jr,        \* [Passages -> [Rounds -> [Cards -> {"none","answer","invalidated"}]]]: PassageCard.response
  closed,    \* [Passages -> [Rounds -> BOOLEAN]]: the card responsibility of the round is settled
  created,   \* [Passages -> [Rounds -> BOOLEAN]]: the provider created the cards of the round
  wire,      \* [Passages -> [Rounds -> BOOLEAN]]: a present request in transit can still create them
  pr,        \* [Passages -> [Rounds -> [Cards -> {"pending","answered","invalidated"}]]]: provider reply
  online,    \* the coordinator process runs
  inflight,  \* [Passages -> {NoCall, FreshCall} \cup Rounds]: invocation in progress
  known,     \* [Passages -> [Rounds -> {"fresh","unknown","excluded"}]]: what this process knows of present
  slot,      \* the execution holds an execution slot
  cancelled, \* the cancel control is effective
  denied,    \* the batch is all-denied (official admission unavailable)
  ended,     \* the execution ended
  handbacks, \* ghost [Passages -> [Rounds -> 0..2]]: committed outcomes that consumed the round
  barrierOk, \* monitor: every present call met the batch barrier
  handOk,    \* monitor: every hand back carried a reply for every card of the round
  adoptOk,   \* monitor: no present, hand back or apply after cancel, all-denied or end
  crashes, losses,
  found      \* ghost: a lookup after a crash found cards that this process had not recorded

vars == <<ps, rs, askOf, jr, closed, created, wire, pr, online, inflight, known, slot,
          cancelled, denied, ended, handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

-----------------------------------------------------------------------------
(* Derived facts *)

Last(p) == IF \E r \in Rounds: rs[p][r] # "none"
           THEN CHOOSE r \in Rounds: rs[p][r] # "none" /\ \A s \in Rounds: s > r => rs[p][s] = "none"
           ELSE 0

\* A chain reached a final Conclusion or a legal wait: its last round waits for the person.
\* A passage whose last round is answered is not waiting: its replay is due or in progress.
Settled(q) == \/ ps[q] \in {"resolved", "applied"}
              \/ ps[q] = "asked" /\ rs[q][Last(q)] \in {"requested", "presented"}
Barrier == \A q \in Passages: Settled(q)

Stopped == cancelled \/ denied \/ ended
Abandoned == denied \/ ended             \* the original wait has a determined end
Advancing == online /\ ~Stopped           \* the current advance is valid
SlotAfter(p, keep) == keep \/ \E q \in Passages \ {p}: inflight[q] # NoCall

AllCards(v) == [c \in Cards |-> v]

-----------------------------------------------------------------------------
Init ==
  /\ ps = [p \in Passages |-> "idle"]
  /\ rs = [p \in Passages |-> [r \in Rounds |-> "none"]]
  /\ askOf = [p \in Passages |-> [r \in Rounds |-> 0]]
  /\ jr = [p \in Passages |-> [r \in Rounds |-> AllCards("none")]]
  /\ closed = [p \in Passages |-> [r \in Rounds |-> FALSE]]
  /\ created = [p \in Passages |-> [r \in Rounds |-> FALSE]]
  /\ wire = [p \in Passages |-> [r \in Rounds |-> FALSE]]
  /\ pr = [p \in Passages |-> [r \in Rounds |-> AllCards("pending")]]
  /\ online = TRUE
  /\ inflight = [p \in Passages |-> NoCall]
  /\ known = [p \in Passages |-> [r \in Rounds |-> "fresh"]]
  /\ slot = FALSE
  /\ cancelled = FALSE /\ denied = FALSE /\ ended = FALSE
  /\ handbacks = [p \in Passages |-> [r \in Rounds |-> 0]]
  /\ barrierOk = TRUE /\ handOk = TRUE /\ adoptOk = TRUE
  /\ crashes = 0 /\ losses = 0 /\ found = FALSE

-----------------------------------------------------------------------------
(* X1 and X2: the extension call. *)

\* X1 commits requested, then X2 invokes. With ps = requested and no call in this process
\* (after a crash or an abort), the result is unknown: X2 invokes again in replay mode.
StartInvoke(p) ==
  /\ Advancing /\ ps[p] \in {"idle", "requested"} /\ inflight[p] = NoCall
  /\ ps' = [ps EXCEPT ![p] = "requested"]
  /\ inflight' = [inflight EXCEPT ![p] = FreshCall] /\ slot' = TRUE
  /\ UNCHANGED <<rs, askOf, jr, closed, created, wire, pr, online, known, cancelled, denied, ended,
                 handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

\* X3: the result of the first call. final, ask (non-final Conclusion with round 1 in one
\* commit), or the official admission answered unavailable (the batch is all-denied).
FinishInvoke(p, o) ==
  /\ online /\ inflight[p] = FreshCall /\ ~Stopped
  /\ o = "unavailable" => AllowDeny
  /\ ps' = [ps EXCEPT ![p] = IF o = "ask" THEN "asked" ELSE "resolved"]
  /\ rs' = IF o = "ask" THEN [rs EXCEPT ![p][1] = "requested"] ELSE rs
  /\ askOf' = IF o = "ask" THEN [askOf EXCEPT ![p][1] = 1] ELSE askOf
  /\ known' = IF o = "ask" THEN [known EXCEPT ![p][1] = "fresh"] ELSE known
  /\ denied' = (denied \/ o = "unavailable")
  /\ inflight' = [inflight EXCEPT ![p] = NoCall]
  /\ slot' = SlotAfter(p, Bad = "holdslot" /\ o = "ask")
  /\ UNCHANGED <<jr, closed, created, wire, pr, online, cancelled, ended, handbacks, barrierOk,
                 handOk, adoptOk, crashes, losses, found>>

\* The signal aborts a call when the advance is no longer valid. The return is not adopted
\* and the passage keeps its state.
Abort(p) ==
  /\ online /\ inflight[p] # NoCall /\ Stopped
  /\ inflight' = [inflight EXCEPT ![p] = NoCall] /\ slot' = SlotAfter(p, FALSE)
  /\ UNCHANGED <<ps, rs, askOf, jr, closed, created, wire, pr, online, known, cancelled, denied,
                 ended, handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

-----------------------------------------------------------------------------
(* X4 to X2: hand the replies back to the party that judged. *)

ReadyToHandBack(p) == ps[p] = "asked" /\ Last(p) > 0 /\ rs[p][Last(p)] = "answered"

\* Recovery row 3: asked with the last round answered -> replay with all rounds.
\* Bad "rehandback": after a crash, recovery replays a round whose outcome is already
\* committed (the passage is resolved, or a later round is open).
\* Bad "noresume": after a crash, recovery treats an answered round as still waiting.
\* Bad "late": the hand back ignores cancel and all-denied.
StartHandBack(p) ==
  /\ online /\ inflight[p] = NoCall
  /\ ~Stopped \/ (Bad = "late" /\ ~ended)
  /\ \/ /\ ReadyToHandBack(p) /\ ~(Bad = "noresume" /\ crashes > 0)
        /\ inflight' = [inflight EXCEPT ![p] = Last(p)]
     \/ /\ Bad = "rehandback" /\ crashes > 0 /\ ps[p] \in {"asked", "resolved"}
        /\ \E r \in Rounds:
             /\ rs[p][r] = "processed" \/ (rs[p][r] = "answered" /\ r < Last(p))
             /\ inflight' = [inflight EXCEPT ![p] = r]
  /\ slot' = TRUE
  /\ handOk' = (handOk /\ \A c \in Cards: jr[p][inflight'[p]][c] = "answer")
  /\ UNCHANGED <<ps, rs, askOf, jr, closed, created, wire, pr, online, known, cancelled, denied,
                 ended, handbacks, barrierOk, adoptOk, crashes, losses, found>>

\* X3 after a replay with the replies: a final Conclusion processes every answered round in
\* the same commit, or ask opens the next round in the same batch. The official admission
\* can also answer unavailable in replay (clause 2): its Conclusion is final and the batch is
\* all-denied. A crash before this commit leaves the result unknown, and recovery replays
\* the same binding again.
FinishHandBack(p, o) ==
  /\ online /\ inflight[p] > 0
  /\ ~Stopped \/ (Bad = "late" /\ ~ended)
  /\ o = "unavailable" => AllowDeny
  /\ LET r == inflight[p]
         n == Last(p) + 1
     IN /\ handbacks[p][r] < 2
        /\ o = "ask" => (n <= MaxRounds /\ ps[p] = "asked")
        /\ handbacks' = [handbacks EXCEPT ![p][r] = @ + 1]
        /\ IF o # "ask"
           THEN /\ ps' = [ps EXCEPT ![p] = "resolved"]
                /\ rs' = [rs EXCEPT ![p] = [s \in Rounds |->
                            IF rs[p][s] = "answered" THEN "processed" ELSE rs[p][s]]]
                /\ UNCHANGED <<askOf, known>>
           ELSE /\ rs' = [rs EXCEPT ![p][n] = "requested"]
                /\ askOf' = [askOf EXCEPT ![p][n] = n]
                /\ known' = [known EXCEPT ![p][n] = "fresh"]
                /\ UNCHANGED ps
  /\ denied' = (denied \/ o = "unavailable")
  /\ adoptOk' = (adoptOk /\ ~Stopped)
  /\ inflight' = [inflight EXCEPT ![p] = NoCall]
  /\ slot' = SlotAfter(p, Bad = "holdslot" /\ o = "ask")
  /\ UNCHANGED <<jr, closed, created, wire, pr, online, cancelled, ended, barrierOk,
                 handOk, crashes, losses, found>>

-----------------------------------------------------------------------------
(* X4: DecisionCards.present, after the round and its requests are saved (rs = requested). *)

\* present is allowed only when this process knows that no earlier present of the round can
\* exist (fresh), or a lookup excluded it (excluded). An unknown receipt needs lookup.
PresentGuard(p, r) ==
  /\ Advancing /\ rs[p][r] = "requested" /\ known[p][r] \in {"fresh", "excluded"}
  /\ Barrier \/ Bad = "nobarrier"

Create(p, r) ==
  /\ created' = [created EXCEPT ![p][r] = TRUE]
  /\ pr' = IF created[p][r] THEN pr ELSE [pr EXCEPT ![p][r] = AllCards("pending")]

\* The provider creates the cards (or answers the cards it created for the same request) and
\* the Agent commits presented.
PresentOk(p, r) ==
  /\ PresentGuard(p, r)
  /\ Create(p, r)
  /\ rs' = [rs EXCEPT ![p][r] = "presented"]
  /\ barrierOk' = (barrierOk /\ Barrier) /\ adoptOk' = (adoptOk /\ ~Stopped)
  /\ UNCHANGED <<ps, askOf, jr, closed, wire, online, inflight, known, slot, cancelled, denied,
                 ended, handbacks, handOk, crashes, losses, found>>

\* The receipt is unknown (lost, unavailable or commit-unknown). The provider created the
\* cards, holds the request in transit, or has nothing.
PresentLost(p, r, k) ==
  /\ PresentGuard(p, r) /\ losses < MaxLoss
  /\ losses' = losses + 1
  /\ known' = [known EXCEPT ![p][r] = "unknown"]
  /\ IF k = "created" THEN Create(p, r) ELSE UNCHANGED <<created, pr>>
  /\ wire' = IF k = "wire" THEN [wire EXCEPT ![p][r] = TRUE] ELSE wire
  /\ barrierOk' = (barrierOk /\ Barrier) /\ adoptOk' = (adoptOk /\ ~Stopped)
  /\ UNCHANGED <<ps, rs, askOf, jr, closed, online, inflight, slot, cancelled, denied, ended,
                 handbacks, handOk, crashes, found>>

\* Definite failure (denied or conflict). Clause 11: the round is present-failed, the earlier
\* answered rounds of the same call are processed, and the Agent writes the denial Conclusion.
\* Provider premise: a definite failure for the request also fences its request in transit.
PresentFailed(p, r) ==
  /\ PresentGuard(p, r) /\ ~created[p][r]
  /\ wire' = [wire EXCEPT ![p][r] = FALSE]
  /\ rs' = [rs EXCEPT ![p] = [s \in Rounds |->
              IF s = r THEN "failed" ELSE IF rs[p][s] = "answered" THEN "processed" ELSE rs[p][s]]]
  /\ ps' = [ps EXCEPT ![p] = "resolved"]
  /\ barrierOk' = (barrierOk /\ Barrier) /\ adoptOk' = (adoptOk /\ ~Stopped)
  /\ UNCHANGED <<askOf, jr, closed, created, pr, online, inflight, known, slot, cancelled, denied,
                 ended, handbacks, handOk, crashes, losses, found>>

\* Bad "newround": with an unknown receipt the Agent opens a new round for the same ask and
\* presents it, instead of lookup.
NewRoundForUnknown(p, r) ==
  /\ Bad = "newround" /\ Advancing
  /\ rs[p][r] = "requested" /\ known[p][r] = "unknown" /\ r = Last(p) /\ r < MaxRounds
  /\ rs' = [rs EXCEPT ![p][r + 1] = "requested"]
  /\ askOf' = [askOf EXCEPT ![p][r + 1] = askOf[p][r]]
  /\ known' = [known EXCEPT ![p][r + 1] = "fresh"]
  /\ UNCHANGED <<ps, jr, closed, created, wire, pr, online, inflight, slot, cancelled, denied,
                 ended, handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

\* The provider receives a request in transit. It deduplicates by the original request.
Deliver(p, r) ==
  /\ wire[p][r]
  /\ wire' = [wire EXCEPT ![p][r] = FALSE]
  /\ Create(p, r)
  /\ UNCHANGED <<ps, rs, askOf, jr, closed, online, inflight, known, slot, cancelled, denied, ended,
                 handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

\* lookup with the saved passage, round, original and full request identities. It needs no
\* valid advance, so reconcile uses it after the end too. unknown or unavailable answers
\* change nothing and are not modelled as steps.
LookupGuard(p, r) == online /\ rs[p][r] = "requested" /\ ~closed[p][r]
                     /\ (known[p][r] = "unknown" \/ Abandoned)

LookupPresented(p, r) ==
  /\ LookupGuard(p, r) /\ created[p][r]
  /\ rs' = [rs EXCEPT ![p][r] = "presented"]
  /\ found' = (found \/ crashes > 0)
  /\ UNCHANGED <<ps, askOf, jr, closed, created, wire, pr, online, inflight, known, slot, cancelled,
                 denied, ended, handbacks, barrierOk, handOk, adoptOk, crashes, losses>>

\* not-presented carries the exclusion of the original and of a late creation. After the end
\* or all-denied it closes the round. Otherwise the same request can be presented again.
LookupNotPresented(p, r) ==
  /\ LookupGuard(p, r) /\ ~created[p][r]
  /\ wire' = [wire EXCEPT ![p][r] = FALSE]
  /\ known' = [known EXCEPT ![p][r] = "excluded"]
  /\ closed' = IF Abandoned THEN [closed EXCEPT ![p][r] = TRUE] ELSE closed
  /\ UNCHANGED <<ps, rs, askOf, jr, created, pr, online, inflight, slot, cancelled, denied, ended,
                 handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

-----------------------------------------------------------------------------
(* The person and DecisionCards.read *)

\* The person answers (chosen, declined or remark). One valid reply per card: the provider
\* orders answers and invalidation, and an invalidated card takes no answer (HumanDecision).
Answer(p, r, c) ==
  /\ created[p][r] /\ pr[p][r][c] = "pending"
  /\ pr' = [pr EXCEPT ![p][r][c] = "answered"]
  /\ UNCHANGED <<ps, rs, askOf, jr, closed, created, wire, online, inflight, known, slot, cancelled,
                 denied, ended, handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

\* read records the reply in PassageCard.response. The round is answered in the same commit
\* when every card has a reply from the person.
\* Bad "partial": one answered card makes the round answered.
\* Bad "timeout": a pending card reads as an answer (default approval).
\* Bad "invalidasanswer": an invalidated card reads as an answer.
ReadCard(p, r, c) ==
  /\ online /\ rs[p][r] = "presented" /\ jr[p][r][c] = "none"
  /\ \E v \in {"answer", "invalidated"}:
       /\ \/ pr[p][r][c] = "answered" /\ v = "answer"
          \/ pr[p][r][c] = "invalidated" /\ v = IF Bad = "invalidasanswer" THEN "answer" ELSE "invalidated"
          \/ Bad = "timeout" /\ pr[p][r][c] = "pending" /\ v = "answer"
       /\ jr' = [jr EXCEPT ![p][r][c] = v]
  /\ LET complete == IF Bad = "partial"
                     THEN \E d \in Cards: jr'[p][r][d] = "answer"
                     ELSE \A d \in Cards: jr'[p][r][d] = "answer"
     IN rs' = [rs EXCEPT ![p][r] = IF complete THEN "answered" ELSE "presented"]
  /\ UNCHANGED <<ps, askOf, closed, created, wire, pr, online, inflight, known, slot, cancelled,
                 denied, ended, handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

-----------------------------------------------------------------------------
(* A1: the barrier opens and the Loop adopts the final effects. *)

BarrierOpen ==
  /\ Advancing
  /\ \A q \in Passages: ps[q] = "resolved" /\ \A r \in Rounds: rs[q][r] \in {"none", "processed", "failed"}
  /\ ps' = [q \in Passages |-> "applied"]
  /\ adoptOk' = (adoptOk /\ ~Stopped)
  /\ UNCHANGED <<rs, askOf, jr, closed, created, wire, pr, online, inflight, known, slot, cancelled,
                 denied, ended, handbacks, barrierOk, handOk, crashes, losses, found>>

-----------------------------------------------------------------------------
(* Cancel, end and the settlement of the card responsibilities *)

Cancel ==
  /\ AllowCancel /\ ~cancelled /\ cancelled' = TRUE
  /\ UNCHANGED <<ps, rs, askOf, jr, closed, created, wire, pr, online, inflight, known, slot, denied,
                 ended, handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

\* The execution ends on the cancel route. Clause 10: before the end the Agent does not
\* invalidate cards to end the execution. tryFinish fixes the card responsibilities.
End ==
  /\ cancelled /\ ~ended /\ \A q \in Passages: inflight[q] = NoCall
  /\ ended' = TRUE
  /\ UNCHANGED <<ps, rs, askOf, jr, closed, created, wire, pr, online, inflight, known, slot,
                 cancelled, denied, handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

\* invalidate of a presented round after the end (reconcile, rules 3 to 5) or after all-denied
\* (clause 2). The provider invalidates the pending cards and keeps the established answers.
\* A lost receipt is retried with the same operation; the provider recognizes it.
InvalidateRound(p, r, lost) ==
  /\ online /\ Abandoned /\ rs[p][r] = "presented" /\ ~closed[p][r] /\ Bad # "noinvalidate"
  /\ lost => losses < MaxLoss
  /\ pr' = [pr EXCEPT ![p][r] = [c \in Cards |->
              IF pr[p][r][c] = "pending" THEN "invalidated" ELSE pr[p][r][c]]]
  /\ IF lost
     THEN /\ losses' = losses + 1 /\ UNCHANGED <<jr, closed>>
     ELSE /\ jr' = [jr EXCEPT ![p][r] = [c \in Cards |->
                      IF jr[p][r][c] # "none" THEN jr[p][r][c]
                      ELSE IF pr'[p][r][c] = "answered" THEN "answer" ELSE "invalidated"]]
          /\ closed' = [closed EXCEPT ![p][r] = TRUE]
          /\ UNCHANGED losses
  /\ UNCHANGED <<ps, rs, askOf, created, wire, online, inflight, known, slot, cancelled, denied,
                 ended, handbacks, barrierOk, handOk, adoptOk, crashes, found>>

\* A round with all replies has no card to invalidate: settlement records it as closed.
\* Bad "noinvalidate": a presented round closes without invalidate.
\* Bad "asnone": a requested round (present unknown) closes as "no card", without lookup.
CloseRound(p, r) ==
  /\ online /\ Abandoned /\ ~closed[p][r]
  /\ \/ rs[p][r] = "answered"
     \/ Bad = "noinvalidate" /\ rs[p][r] = "presented"
     \/ Bad = "asnone" /\ rs[p][r] = "requested"
  /\ closed' = [closed EXCEPT ![p][r] = TRUE]
  /\ UNCHANGED <<ps, rs, askOf, jr, created, wire, pr, online, inflight, known, slot, cancelled,
                 denied, ended, handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

-----------------------------------------------------------------------------
(* Crash and restart *)

\* The process dies after any step. Calls in progress and receipts not yet committed are lost.
\* The new process knows nothing about earlier present calls: every requested round is unknown.
Crash ==
  /\ online /\ crashes < MaxCrash
  /\ online' = FALSE /\ crashes' = crashes + 1
  /\ inflight' = [p \in Passages |-> NoCall] /\ slot' = FALSE
  /\ known' = [p \in Passages |-> [r \in Rounds |-> "unknown"]]
  /\ UNCHANGED <<ps, rs, askOf, jr, closed, created, wire, pr, cancelled, denied, ended, handbacks,
                 barrierOk, handOk, adoptOk, losses, found>>

\* Bad "rewind": recovery rebuilds a presented round as requested.
Recover ==
  /\ ~online /\ online' = TRUE
  /\ rs' = IF Bad = "rewind"
           THEN [p \in Passages |-> [r \in Rounds |->
                   IF rs[p][r] = "presented" THEN "requested" ELSE rs[p][r]]]
           ELSE rs
  /\ UNCHANGED <<ps, askOf, jr, closed, created, wire, pr, inflight, known, slot, cancelled, denied,
                 ended, handbacks, barrierOk, handOk, adoptOk, crashes, losses, found>>

-----------------------------------------------------------------------------
Next ==
  \/ \E p \in Passages:
       \/ StartInvoke(p) \/ Abort(p) \/ StartHandBack(p)
       \/ \E o \in {"final", "ask", "unavailable"}: FinishInvoke(p, o)
       \/ \E o \in {"final", "ask", "unavailable"}: FinishHandBack(p, o)
       \/ \E r \in Rounds:
            \/ PresentOk(p, r) \/ PresentFailed(p, r) \/ NewRoundForUnknown(p, r)
            \/ \E k \in {"created", "wire", "nothing"}: PresentLost(p, r, k)
            \/ Deliver(p, r) \/ LookupPresented(p, r) \/ LookupNotPresented(p, r)
            \/ CloseRound(p, r) \/ \E lost \in BOOLEAN: InvalidateRound(p, r, lost)
            \/ \E c \in Cards: Answer(p, r, c) \/ ReadCard(p, r, c)
  \/ BarrierOpen \/ Cancel \/ End \/ Crash \/ Recover

\* The Agent and the providers keep acting while a step stays possible. Lost receipts and
\* crashes are bounded, so the fair steps are the ones that make progress.
AgentFair ==
  /\ \A p \in Passages:
       /\ WF_vars(StartInvoke(p)) /\ WF_vars(Abort(p)) /\ WF_vars(StartHandBack(p))
       /\ WF_vars(\E o \in {"final", "ask", "unavailable"}: FinishInvoke(p, o))
       /\ WF_vars(\E o \in {"final", "ask", "unavailable"}: FinishHandBack(p, o))
       /\ \A r \in Rounds:
            /\ WF_vars(PresentOk(p, r)) /\ WF_vars(LookupPresented(p, r))
            /\ WF_vars(LookupNotPresented(p, r)) /\ WF_vars(InvalidateRound(p, r, FALSE))
            /\ WF_vars(CloseRound(p, r))
            /\ \A c \in Cards: WF_vars(ReadCard(p, r, c))
  /\ WF_vars(BarrierOpen) /\ WF_vars(End) /\ WF_vars(Recover)

\* Premise of Progress only: every presented card eventually gets the person's reply.
HumanFair == \A p \in Passages, r \in Rounds, c \in Cards: WF_vars(Answer(p, r, c))

Spec == Init /\ [][Next]_vars
SettleSpec == Spec /\ AgentFair
LiveSpec == Spec /\ AgentFair /\ HumanFair

-----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ ps \in [Passages -> PassageStates]
  /\ rs \in [Passages -> [Rounds -> RoundStates]]
  /\ askOf \in [Passages -> [Rounds -> 0..MaxRounds]]
  /\ jr \in [Passages -> [Rounds -> [Cards -> {"none", "answer", "invalidated"}]]]
  /\ pr \in [Passages -> [Rounds -> [Cards -> {"pending", "answered", "invalidated"}]]]
  /\ closed \in [Passages -> [Rounds -> BOOLEAN]]
  /\ created \in [Passages -> [Rounds -> BOOLEAN]]
  /\ wire \in [Passages -> [Rounds -> BOOLEAN]]
  /\ inflight \in [Passages -> {NoCall, FreshCall} \cup Rounds]
  /\ known \in [Passages -> [Rounds -> {"fresh", "unknown", "excluded"}]]
  /\ handbacks \in [Passages -> [Rounds -> 0..2]]
  /\ found \in BOOLEAN

\* At most one effective presentation per ask Conclusion: an unknown receipt never makes the
\* same requests appear under a second round.
OncePresent ==
  \A p \in Passages, r1, r2 \in Rounds:
    (r1 # r2 /\ created[p][r1] /\ created[p][r2]) => askOf[p][r1] # askOf[p][r2]

\* Every present call happened when every chain of the batch had a final Conclusion or a
\* legal wait.
BarrierBeforePresent == barrierOk

\* Every hand back carried a reply of the person for every card of its round.
AllAnsweredBeforeHandBack == handOk

\* The replies of one round are consumed by at most one committed outcome.
OnceHandBack == \A p \in Passages, r \in Rounds: handbacks[p][r] <= 1

\* No present, hand back or adoption after cancel, all-denied or end.
NoAdoptAfterStop == adoptOk

\* A card that the provider invalidated is never recorded as the person's answer.
NoAnswerAfterInvalidate ==
  \A p \in Passages, r \in Rounds, c \in Cards: pr[p][r][c] = "invalidated" => jr[p][r][c] # "answer"

\* Every recorded answer is an answer the person gave.
NoFabricatedAnswer ==
  \A p \in Passages, r \in Rounds, c \in Cards: jr[p][r][c] = "answer" => pr[p][r][c] = "answered"

\* A closed card responsibility leaves no live card and no request that can still create one.
ClosedLeavesNoLiveCard ==
  \A p \in Passages, r \in Rounds:
    closed[p][r] => (~wire[p][r] /\ (created[p][r] => \A c \in Cards: pr[p][r][c] # "pending"))

\* The loop adopts the batch only after every chain is final and every round is processed or
\* present-failed.
BarrierBeforeApply ==
  \A p \in Passages: ps[p] = "applied" =>
    \A q \in Passages: ps[q] \in {"resolved", "applied"} /\ \A r \in Rounds: rs[q][r] \in {"none", "processed", "failed"}

\* The wait for the person holds no execution slot: the slot is held only by a call.
WaitHoldsNoSlot == slot => \E p \in Passages: inflight[p] # NoCall

PRank(s) == CASE s = "idle" -> 0 [] s = "requested" -> 1 [] s = "asked" -> 2
                [] s = "resolved" -> 3 [] s = "applied" -> 4
RRank(s) == CASE s = "none" -> 0 [] s = "requested" -> 1 [] s = "presented" -> 2
                [] s = "answered" -> 3 [] s = "processed" -> 4 [] s = "failed" -> 4

\* Durable progress never moves back, across crash and recovery included.
RecoveryMonotone ==
  [][\A p \in Passages:
       /\ PRank(ps'[p]) >= PRank(ps[p])
       /\ \A r \in Rounds:
            /\ RRank(rs'[p][r]) >= RRank(rs[p][r])
            /\ rs[p][r] \in {"processed", "failed"} => rs'[p][r] = rs[p][r]
            /\ closed[p][r] => closed'[p][r]
            /\ \A c \in Cards: jr[p][r][c] # "none" => jr'[p][r][c] = jr[p][r][c]]_vars

\* Liveness 1 (LiveSpec, no cancel, no all-denied): every passage is finally applied.
Progress == <>(\A p \in Passages: ps[p] = "applied")

\* Liveness 2 (SettleSpec): after cancel the execution ends and every card responsibility
\* closes; after all-denied every card responsibility closes.
Open(p, r) == rs[p][r] \in {"requested", "presented", "answered"} /\ ~closed[p][r]
AllClosed == \A p \in Passages, r \in Rounds: ~Open(p, r)
StopSettles == /\ cancelled ~> (ended /\ AllClosed)
               /\ denied ~> AllClosed

-----------------------------------------------------------------------------
(* Reachability witnesses. Each one says that a path never happens. Its control expects   *)
(* TLC to violate it, so the safety positive is not true only because the path is absent. *)

\* A second round opens after a hand back, and the batch is applied.
NeverTwoRoundsApplied == ~(/\ \A p \in Passages: ps[p] = "applied"
                           /\ \E p \in Passages: rs[p][2] = "processed")
\* A lookup excludes the original present, and the same request is presented again.
NeverPresentAfterExclusion == ~(\E p \in Passages, r \in Rounds:
                                  known[p][r] = "excluded" /\ rs[p][r] = "presented")
\* After a crash a lookup finds cards that the process had not recorded, and the batch is applied.
NeverLookupAfterCrash == ~(found /\ \A p \in Passages: ps[p] = "applied")
\* After the end one round closes with an established answer kept and a pending card invalidated.
NeverMixedSettlement == ~(/\ ended
                          /\ \E p \in Passages, r \in Rounds:
                               /\ closed[p][r]
                               /\ \E c \in Cards: pr[p][r][c] = "answered"
                               /\ \E c \in Cards: pr[p][r][c] = "invalidated")
\* A later round fails to present after an earlier round was answered.
NeverFailAfterAnswer == ~(\E p \in Passages: rs[p][1] = "processed" /\ rs[p][2] = "failed")
\* All-denied invalidates a card without cancel.
NeverDeniedInvalidation == ~(/\ denied /\ ~cancelled
                             /\ \E p \in Passages, r \in Rounds, c \in Cards: pr[p][r][c] = "invalidated")
\* A request in transit creates the cards late, and reconcile invalidates them after the end.
NeverLateCreationSettled == ~(/\ ended /\ losses = MaxLoss
                              /\ \E p \in Passages, r \in Rounds:
                                   /\ closed[p][r] /\ created[p][r] /\ known[p][r] = "unknown"
                                   /\ \A c \in Cards: pr[p][r][c] = "invalidated")
=============================================================================

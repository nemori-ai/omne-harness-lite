------------------------------ MODULE ResultPush ------------------------------
(***************************************************************************)
(* The result push of one settled Model call, from its frozen delivery to   *)
(* the release of its share: the producer pushes to the receiver the       *)
(* consumer owner registered; `saved` is the receiver's custody fact;      *)
(* the producer's own ACK goes through the retained handoff, which the     *)
(* owner's evidence adapter must confirm; cleanup and the share release    *)
(* follow the ACK; late accounts are reserved before they are accepted and *)
(* pushed after the result is saved; every push happens inside one wakeup  *)
(* and a wakeup does a bounded amount of work. The process can crash, a    *)
(* bounded number of times: the push ledger in memory is gone, while the   *)
(* receiver's saved fact and the ACK, cleanup and share in the Model store *)
(* stay; the next start scans the store and wakes the call again. A        *)
(* receiver's definite refusal ends custody as abandoned, and an abandoned *)
(* result is cleaned and its share released like an acknowledged one.     *)
(*                                                                          *)
(* The owners of the rules are packages/model/model-contract/SPEC.md        *)
(* ("结果推送与保存", "ACK 的前提与效果", "清理范围与读写保护",              *)
(* "晚到账目与有界保管") and the push implementation note of                 *)
(* packages/model/model-host-local/SPEC.md ("运行门面与结果推送"). The     *)
(* state and event mapping, the abstractions and the bounds are in          *)
(* ../formal-mapping.md. A TLC result holds only inside those bounds.       *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  MaxRedeliveries, \* redeliveries after an unknown outcome inside one wakeup
  MaxAccounts,     \* late accounts the environment offers in all
  MaxPending,      \* late accounts accepted and not yet saved (the reservation bound)
  RefusalsInPlay,  \* TRUE: the receiver may refuse (denied) or answer a foreign receipt
  MaxCrashes,      \* how many times the process may crash
  Bugs             \* the deliberate faults of a negative control; {} in every positive control

BugNames == {"ack-without-saved", "ack-without-adapter", "release-before-ack",
             "foreign-receipt-saved", "refusal-overwrites-unknown", "repush-saved",
             "retry-on-unavailable", "accept-without-reservation",
             "reservation-never-released", "keep-body", "accounts-before-saved",
             "waiting-not-due", "unknown-abandons", "scan-forgets", "release-before-abandon"}
ASSUME Bugs \subseteq BugNames
ASSUME MaxRedeliveries \in 0..2 /\ MaxAccounts \in 0..3 /\ MaxPending \in 1..3
ASSUME RefusalsInPlay \in BOOLEAN /\ MaxCrashes \in 0..2

Accounts == 1..MaxAccounts
Standings == {"pending", "waiting", "unknown", "saved", "failed", "refused"}
Due == {"pending", "waiting", "unknown"}
Open == {"pending", "waiting", "unknown"} \* accepted and not yet saved: holds a reservation

VARIABLES
  phase,         \* "idle" | "working": one wakeup of the call at a time
  registered,    \* the consumer owner has a receiver registered
  result,        \* [standing, attempts (in this wakeup), receipt]
  receiverSaved, \* the receiver holds the result (its own fact, maybe unanswered)
  ack,           \* "none" | "unknown" | "acknowledged"
  ackTried,      \* the ACK was attempted in this wakeup
  adapterOk,     \* the owner's evidence adapter can read its durable record now
  confirmed,     \* the adapter confirmed the custody evidence at least once
  cleanup,       \* "pending" | "released"
  cleanTried,    \* the cleanup was attempted in this wakeup
  share,         \* "held" | "released": the call's capacity in the Commands
  body,          \* "kept" | "dropped": the frozen payload in the ledger
  acct,          \* Accounts -> [standing ("none" before acceptance), attempts, saved (receiver)]
  reservations,  \* late-account reservations held
  abandon,       \* "none" | "refusal" | "unknown": custody ended as abandoned, with its ground
  alive,         \* the process runs
  wakeable,      \* wakeups of this call come: the settle, then the scan of each start
  crashes

vars == <<phase, registered, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
          cleanup, cleanTried, share, body, acct, reservations, abandon, alive, wakeable, crashes>>
Process == <<abandon, alive, wakeable, crashes>>

Bug(b) == b \in Bugs
Limit == 1 + MaxRedeliveries
OpenAccounts == {i \in Accounts : acct[i].standing \in Open}

Init ==
  /\ phase = "idle"
  /\ registered \in BOOLEAN
  /\ result = [standing |-> "pending", attempts |-> 0, receipt |-> "none"]
  /\ receiverSaved = FALSE
  /\ ack = "none" /\ ackTried = FALSE
  /\ adapterOk \in BOOLEAN /\ confirmed = FALSE
  /\ cleanup = "pending" /\ cleanTried = FALSE
  /\ share = "held" /\ body = "kept"
  /\ acct = [i \in Accounts |-> [standing |-> "none", attempts |-> 0, saved |-> FALSE]]
  /\ reservations = 0
  /\ abandon = "none" /\ alive = TRUE /\ wakeable = TRUE /\ crashes = 0

(* --- what a push answer may replace (`replaces` of runtime.ts) ----------- *)

Replaces(standing, next) ==
  IF standing = "saved" THEN Bug("repush-saved")
  ELSE IF standing = "unknown" THEN next = "saved" \/ Bug("refusal-overwrites-unknown")
  ELSE TRUE

Conclude(held, next) == IF Replaces(held.standing, next) THEN next ELSE held.standing

(* --- wakeups: settle, a late account, a registration, a successor -------- *)

Wake ==
  /\ phase = "idle" /\ alive /\ wakeable
  /\ phase' = "working"
  /\ result' = [result EXCEPT !.attempts = 0]
  /\ acct' = [i \in Accounts |-> [acct[i] EXCEPT !.attempts = 0]]
  /\ ackTried' = FALSE /\ cleanTried' = FALSE
  /\ UNCHANGED <<registered, receiverSaved, ack, adapterOk, confirmed, cleanup, share, body,
                 reservations>>

\* A delivery is pushed in this wakeup once, and again after an unknown outcome up to the bound.
Pushable(held) ==
  /\ registered /\ abandon = "none"
  /\ held.standing \in Due \/ (held.standing = "saved" /\ Bug("repush-saved"))
  /\ ~(held.standing = "waiting" /\ Bug("waiting-not-due"))
  /\ \/ held.attempts = 0
     \/ held.standing = "unknown" /\ held.attempts <= MaxRedeliveries
     \/ held.standing = "waiting" /\ Bug("retry-on-unavailable")

(* --- the result push and the receiver's answers --------------------------- *)

PushResultAs(next, receipt, savedNow) ==
  /\ phase = "working"
  /\ Pushable(result)
  /\ result' = [standing |-> Conclude(result, next),
                attempts |-> result.attempts + 1,
                receipt |-> IF Replaces(result.standing, next) THEN receipt ELSE result.receipt]
  /\ receiverSaved' = (receiverSaved \/ savedNow)
  /\ UNCHANGED <<phase, registered, ack, ackTried, adapterOk, confirmed, cleanup, cleanTried,
                 share, body, acct, reservations>>

\* saved: the receiver saves (or recognises) the key and answers its own receipt.
PushResultSaved == PushResultAs("saved", "own", TRUE)
\* outcome-unknown or a throw: the receiver may or may not have saved.
PushResultUnknown == \E savedNow \in BOOLEAN :
  /\ receiverSaved => savedNow
  /\ PushResultAs("unknown", "none", savedNow)
\* unavailable, backpressured, cancelled-before-accept: wait for the next wakeup.
PushResultWaiting == ~receiverSaved /\ PushResultAs("waiting", "none", FALSE)
\* denied, invalid, conflict: the delivery fails and is not pushed again by itself.
\* A receiver that saved the key recognises it when the push comes again after a crash forgot
\* the ledger; while the ledger still says unknown, a refusal does not replace it.
PushResultRefused ==
  /\ RefusalsInPlay /\ (~receiverSaved \/ result.standing = "unknown")
  /\ PushResultAs("refused", "none", FALSE)
\* a receipt with another key or another owner is not saved: receipt-mismatch.
PushResultForeign ==
  /\ RefusalsInPlay /\ ~receiverSaved
  /\ IF Bug("foreign-receipt-saved") THEN PushResultAs("saved", "foreign", FALSE)
     ELSE PushResultAs("failed", "none", FALSE)

(* --- the producer's own ACK through the retained handoff ------------------ *)

AckPossible ==
  /\ phase = "working" /\ ~ackTried /\ abandon = "none"
  /\ ack \in {"none", "unknown"}
  /\ result.standing = "saved" \/ (result.standing = "unknown" /\ Bug("ack-without-saved"))

AckConfirm ==
  /\ AckPossible
  /\ adapterOk \/ Bug("ack-without-adapter")
  /\ ack' = "acknowledged" /\ ackTried' = TRUE
  /\ confirmed' = (confirmed \/ adapterOk)
  /\ UNCHANGED <<phase, registered, result, receiverSaved, adapterOk, cleanup, cleanTried,
                 share, body, acct, reservations>>

\* The adapter cannot read its record: the ACK keeps its standing, the share stays.
AckUnavailable ==
  /\ AckPossible /\ ~adapterOk
  /\ ackTried' = TRUE
  /\ UNCHANGED <<phase, registered, result, receiverSaved, ack, adapterOk, confirmed, cleanup,
                 cleanTried, share, body, acct, reservations>>

\* commit-unknown after the resends: recognised with the same operation at the next wakeup.
AckUnknown ==
  /\ AckPossible
  /\ ack' = "unknown" /\ ackTried' = TRUE
  /\ UNCHANGED <<phase, registered, result, receiverSaved, adapterOk, confirmed, cleanup,
                 cleanTried, share, body, acct, reservations>>

(* --- cleanup after the ACK ------------------------------------------------- *)

CleanPossible ==
  /\ phase = "working" /\ ~cleanTried /\ cleanup = "pending"
  /\ \/ ack = "acknowledged" \/ abandon /= "none"
     \/ result.standing = "saved" /\ Bug("release-before-ack")
     \/ result.standing = "refused" /\ Bug("release-before-abandon")

(* --- abandonment: only a definite refusal ends custody this way ----------- *)

AbandonPossible ==
  /\ phase = "working" /\ abandon = "none" /\ ack = "none"
  /\ result.standing = "refused" \/ (result.standing = "unknown" /\ Bug("unknown-abandons"))

Abandon ==
  /\ AbandonPossible
  /\ abandon' = IF result.standing = "refused" THEN "refusal" ELSE "unknown"
  /\ UNCHANGED <<phase, registered, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
                 cleanup, cleanTried, share, body, acct, reservations, alive, wakeable, crashes>>

CleanOk ==
  /\ CleanPossible
  /\ cleanup' = "released" /\ share' = "released" /\ cleanTried' = TRUE
  /\ body' = IF Bug("keep-body") THEN body ELSE "dropped"
  /\ UNCHANGED <<phase, registered, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
                 acct, reservations>>

CleanFail ==
  /\ CleanPossible
  /\ cleanTried' = TRUE
  /\ UNCHANGED <<phase, registered, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
                 cleanup, share, body, acct, reservations>>

(* --- late accounts: reservation, acceptance, push after the result is saved - *)

AcceptAccount ==
  \E i \in Accounts :
    /\ acct[i].standing = "none"
    /\ reservations < MaxPending \/ Bug("accept-without-reservation")
    /\ acct' = [acct EXCEPT ![i].standing = "pending"]
    /\ reservations' = IF reservations < MaxPending THEN reservations + 1 ELSE reservations
    /\ UNCHANGED <<phase, registered, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
                   cleanup, cleanTried, share, body>>

AccountPushable(i) ==
  /\ phase = "working"
  /\ result.standing = "saved" \/ Bug("accounts-before-saved")
  /\ Pushable(acct[i])

PushAccountAs(i, next, savedNow) ==
  /\ AccountPushable(i)
  /\ acct' = [acct EXCEPT ![i].standing = Conclude(acct[i], next),
                          ![i].attempts = @ + 1,
                          ![i].saved = @ \/ savedNow]
  /\ reservations' = IF Conclude(acct[i], next) = "saved" /\ acct[i].standing /= "saved"
                          /\ ~Bug("reservation-never-released")
                       THEN reservations - 1 ELSE reservations
  /\ UNCHANGED <<phase, registered, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
                 cleanup, cleanTried, share, body>>

PushAccountSaved(i) == PushAccountAs(i, "saved", TRUE)
PushAccountUnknown(i) == \E savedNow \in BOOLEAN :
  /\ acct[i].saved => savedNow
  /\ PushAccountAs(i, "unknown", savedNow)
PushAccountWaiting(i) == ~acct[i].saved /\ PushAccountAs(i, "waiting", FALSE)

(* --- the wakeup ends when its work is done ------------------------------- *)

WorkLeft ==
  \/ Pushable(result)
  \/ AckPossible
  \/ AbandonPossible
  \/ CleanPossible
  \/ \E i \in Accounts : AccountPushable(i)

EndWake ==
  /\ phase = "working" /\ ~WorkLeft
  /\ phase' = "idle"
  /\ UNCHANGED <<registered, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
                 cleanup, cleanTried, share, body, acct, reservations>>

(* --- the environment ------------------------------------------------------- *)

Register == /\ ~registered /\ registered' = TRUE
            /\ UNCHANGED <<phase, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
                           cleanup, cleanTried, share, body, acct, reservations>>
Unregister == /\ registered /\ phase = "idle" /\ registered' = FALSE
              /\ UNCHANGED <<phase, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
                             cleanup, cleanTried, share, body, acct, reservations>>
AdapterComesBack == /\ ~adapterOk /\ adapterOk' = TRUE
                    /\ UNCHANGED <<phase, registered, result, receiverSaved, ack, ackTried,
                                   confirmed, cleanup, cleanTried, share, body, acct,
                                   reservations>>
AdapterGoesAway == /\ adapterOk /\ phase = "idle" /\ adapterOk' = FALSE
                   /\ UNCHANGED <<phase, registered, result, receiverSaved, ack, ackTried,
                                  confirmed, cleanup, cleanTried, share, body, acct,
                                  reservations>>

(* --- the process: a crash forgets the ledger, a start scans the store ------- *)

Crash ==
  /\ crashes < MaxCrashes /\ alive /\ share = "held"
  /\ crashes' = crashes + 1 /\ alive' = FALSE /\ wakeable' = FALSE /\ phase' = "idle"
  /\ result' = [standing |-> "pending", attempts |-> 0, receipt |-> "none"]
  /\ acct' = [i \in Accounts |->
                IF acct[i].standing \in Open
                  THEN [acct[i] EXCEPT !.standing = "pending", !.attempts = 0]
                  ELSE [acct[i] EXCEPT !.attempts = 0]]
  /\ ackTried' = FALSE /\ cleanTried' = FALSE
  /\ UNCHANGED <<registered, receiverSaved, ack, adapterOk, confirmed, cleanup, share, body,
                 reservations, abandon>>

Restart ==
  /\ ~alive /\ alive' = TRUE /\ wakeable' = ~Bug("scan-forgets")
  /\ UNCHANGED <<phase, registered, result, receiverSaved, ack, ackTried, adapterOk, confirmed,
                 cleanup, cleanTried, share, body, acct, reservations, abandon, crashes>>

\* The steps of one process leave the abandonment and the process bookkeeping as they are.
InProcess(A) == A /\ UNCHANGED Process

Steps ==
  \/ Wake \/ EndWake
  \/ PushResultSaved \/ PushResultUnknown \/ PushResultWaiting \/ PushResultRefused
  \/ PushResultForeign
  \/ AckConfirm \/ AckUnavailable \/ AckUnknown
  \/ CleanOk \/ CleanFail
  \/ AcceptAccount
  \/ \E i \in Accounts : PushAccountSaved(i) \/ PushAccountUnknown(i) \/ PushAccountWaiting(i)
  \/ Register \/ Unregister \/ AdapterComesBack \/ AdapterGoesAway

Next == InProcess(Steps) \/ Abandon \/ Crash \/ Restart

Spec == Init /\ [][Next]_vars

\* The premises of the progress claim: wakeups keep coming (the recovery scan or the
\* successor), the receiver and the adapter come back and eventually answer well, the cleanup
\* eventually succeeds, and the push finishes the work of each wakeup.
Fairness ==
  /\ WF_vars(InProcess(Wake)) /\ WF_vars(InProcess(EndWake)) /\ WF_vars(Abandon) /\ WF_vars(Restart)
  /\ WF_vars(InProcess(Register)) /\ WF_vars(InProcess(AdapterComesBack))
  /\ SF_vars(InProcess(PushResultSaved)) /\ SF_vars(InProcess(AckConfirm))
  /\ SF_vars(InProcess(CleanOk))
  /\ \A i \in Accounts : SF_vars(InProcess(PushAccountSaved(i)))
  /\ WF_vars(InProcess(AcceptAccount)) \* the environment keeps offering late accounts

\* The receiver and the adapter, once back, stay: flapping forever is outside the premise.
\* A receiver that answers with another key's receipt is outside the premise too: that delivery
\* fails as receipt-mismatch and holds the share.
LiveNext == Next /\ ~AdapterGoesAway /\ ~Unregister /\ ~InProcess(PushResultForeign)

LiveSpec == Init /\ [][LiveNext]_vars /\ Fairness

(* --- properties ------------------------------------------------------------ *)

TypeOK ==
  /\ phase \in {"idle", "working"}
  /\ result.standing \in Standings /\ result.attempts \in Nat
  /\ result.receipt \in {"none", "own", "foreign"}
  /\ ack \in {"none", "unknown", "acknowledged"}
  /\ cleanup \in {"pending", "released"} /\ share \in {"held", "released"}
  /\ body \in {"kept", "dropped"}
  /\ \A i \in Accounts : acct[i].standing \in Standings \cup {"none"}
  /\ reservations \in 0..MaxPending
  /\ abandon \in {"none", "refusal", "unknown"}

\* P2. An ACK is only ever attempted for a result the receiver saved; the ledger may forget it in
\* a crash, the receiver's fact stays.
AckNeedsSaved == ack /= "none" => receiverSaved

\* P2. acknowledged means the owner's evidence adapter confirmed the custody evidence.
AckNeedsAdapter == ack = "acknowledged" => confirmed

\* P2. Cleanup and the share release follow the end of custody, the ACK or the abandonment,
\* never `saved` or a refusal alone.
ReleaseNeedsCustodyEnd ==
  (cleanup = "released" \/ share = "released") => (ack = "acknowledged" \/ abandon /= "none")

\* P2. Custody ends one way: acknowledged or abandoned, never both.
AckOrAbandon == ~(ack /= "none" /\ abandon /= "none")

\* P2. Abandonment rests on a definite refusal, never on an unknown outcome.
AbandonNeedsRefusal == abandon /= "unknown"

\* P2. A result the receiver saved is never abandoned.
SavedNotAbandoned == receiverSaved => abandon = "none"

\* P2. saved only with the receiver's own receipt for the frozen key and owner.
SavedReceiptMatches == result.standing = "saved" => result.receipt = "own"

\* P2. A receiver that saved is never forgotten: the delivery stays unknown or becomes saved,
\* or, after a crash forgot the ledger, it is owed again.
SavedReceiverNotLost == receiverSaved => result.standing \in {"pending", "unknown", "saved"}

\* P2 (action). Within one process, unknown gives way only to saved and saved is final with its
\* receipt; a crash forgets the ledger and nothing else.
UnknownOnlyToSavedStep ==
  (result.standing = "unknown" /\ crashes' = crashes) => result'.standing \in {"unknown", "saved"}
UnknownOnlyToSaved == [][UnknownOnlyToSavedStep]_vars
SavedIsFinalStep ==
  (result.standing = "saved" /\ crashes' = crashes)
    => result'.standing = "saved" /\ result'.receipt = result.receipt
SavedIsFinal == [][SavedIsFinalStep]_vars

\* P3. One wakeup pushes a delivery at most 1 + MaxRedeliveries times: no hot loop.
PushesPerWakeBounded ==
  /\ result.attempts <= Limit
  /\ \A i \in Accounts : acct[i].attempts <= Limit

\* P4. Late accounts accepted and not saved never exceed the reservation bound, and the
\* reservations are exactly those accounts.
PendingAccountsBounded == Cardinality(OpenAccounts) <= MaxPending
ReservationsMatch == reservations = Cardinality(OpenAccounts)

\* P4. After the release the ledger keeps the key and the receipt only.
BodyDroppedAfterRelease == cleanup = "released" => body = "dropped"

\* P2. Accounts go out only after the result is saved.
AccountsAfterResultSaved ==
  \A i \in Accounts : acct[i].standing \in {"waiting", "unknown", "saved"}
                      => receiverSaved

\* P2 (progress). Under the premises of LiveSpec every call reaches the release of its share,
\* and every accepted late account is saved.
EventuallyReleased == <>(share = "released")
AccountsEventuallySaved ==
  \A i \in Accounts : [](acct[i].standing = "pending" => <>(acct[i].standing = "saved"))
\* P4 (progress). Reservations come back: every offered late account is eventually accepted.
AccountsEventuallyAccepted == \A i \in Accounts : <>(acct[i].standing /= "none")

=============================================================================

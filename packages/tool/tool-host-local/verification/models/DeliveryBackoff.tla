-------------------------- MODULE DeliveryBackoff --------------------------
(***************************************************************************)
(* The push pacing of result deliveries and the table that holds it        *)
(* (R2-D273, R2-D282, R2-D327).                                            *)
(*                                                                         *)
(* Each delivery in `Deliveries` is owed to a receiver. The executor       *)
(* drives them at arbitrary moments of a discrete clock. A push whose      *)
(* receiver is absent or answers `unavailable` keeps the delivery owed and *)
(* paces the next push: the first wait is D0, every later wait doubles up  *)
(* to Cap. The wait lives in a table entry of the delivery (`delay > 0`).  *)
(* A saved push settles the delivery. A definite failure (the receiver     *)
(* answers denied or invalid, or throws) keeps it owed, writes a named     *)
(* warning, and clears the pacing: the next trouble starts at the first    *)
(* wait again. A delivery also leaves the owed state from outside: its     *)
(* call is revoked, the delivery is excluded, or the executor abandons the *)
(* call. The table entry follows the delivery and goes with it. The        *)
(* receiver changes freely between pushes, so the model covers every       *)
(* answer sequence within the horizon.                                     *)
(*                                                                         *)
(* The negative switches each remove one rule; the safe configurations     *)
(* set them all FALSE.                                                     *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Deliveries,        \* the deliveries the executor may hold
  D0,                \* the first wait
  Cap,               \* the longest wait
  Horizon,           \* the last clock value the model explores
  MaxPushes,         \* the bound on pushes per delivery that keeps the model finite
  NoPacing,          \* a push never waits
  NoCap,             \* the wait keeps doubling past Cap
  NoReset,           \* a definite failure keeps the current wait
  DropOnUnavailable, \* an unavailable answer ends the duty
  SilentPace,        \* a paced push writes no warning
  SilentFailure,     \* a definite failure writes no warning
  DropOnFailure,     \* a definite failure ends the duty
  KeepOnEnd          \* a delivery that leaves the owed state keeps its table entry

ASSUME D0 >= 1 /\ Cap >= D0 /\ Horizon >= 1 /\ MaxPushes >= 1 /\ Deliveries # {}

Answers == {"unavailable", "saved", "denied", "throws"}
Failures == {"denied", "throws"}
Endings == {"revoked", "excluded", "abandoned"}

VARIABLES
  now,         \* the clock
  state,       \* per delivery: "owed", "saved", a member of Endings, or (only with a Drop switch) "dropped"
  receiver,    \* per delivery: what the receiver answers to the next push
  delay,       \* per delivery: the wait of its table entry; 0 when it has no entry
  until,       \* per delivery: the clock from which the next push may happen
  pushes,      \* per delivery: how many pushes happened
  streak,      \* per delivery: consecutive unavailable pushes since the last other answer
  streakStart, \* per delivery: the clock of the first push of the streak
  paced,       \* per delivery: how many pushes were answered unavailable
  warns,       \* per delivery: the named pacing warnings written
  failures,    \* per delivery: how many pushes ended in a definite failure
  failWarns    \* per delivery: the named failure warnings written

vars == <<now, state, receiver, delay, until, pushes, streak, streakStart, paced, warns,
          failures, failWarns>>

Min(a, b) == IF a <= b THEN a ELSE b

(* The wait after `k` consecutive unavailable pushes: D0, 2 D0, ... capped. *)
RECURSIVE WaitAfter(_)
WaitAfter(k) == IF k <= 1 THEN D0 ELSE Min(2 * WaitAfter(k - 1), Cap)

(* The least time between the first push of a streak and its k-th push. *)
RECURSIVE MinSpan(_)
MinSpan(k) == IF k <= 1 THEN 0 ELSE MinSpan(k - 1) + WaitAfter(k - 1)

Table == {d \in Deliveries : delay[d] > 0}
InFlight == {d \in Deliveries : state[d] = "owed"}

Init ==
  /\ now = 0
  /\ state = [d \in Deliveries |-> "owed"]
  /\ receiver \in [Deliveries -> Answers]
  /\ delay = [d \in Deliveries |-> 0]
  /\ until = [d \in Deliveries |-> 0]
  /\ pushes = [d \in Deliveries |-> 0]
  /\ streak = [d \in Deliveries |-> 0]
  /\ streakStart = [d \in Deliveries |-> 0]
  /\ paced = [d \in Deliveries |-> 0]
  /\ warns = [d \in Deliveries |-> 0]
  /\ failures = [d \in Deliveries |-> 0]
  /\ failWarns = [d \in Deliveries |-> 0]

Tick ==
  /\ now < Horizon
  /\ now' = now + 1
  /\ UNCHANGED <<state, receiver, delay, until, pushes, streak, streakStart, paced, warns,
                 failures, failWarns>>

ReceiverChanges(d) ==
  /\ \E a \in Answers : receiver' = [receiver EXCEPT ![d] = a]
  /\ UNCHANGED <<now, state, delay, until, pushes, streak, streakStart, paced, warns,
                 failures, failWarns>>

(* A drive inside the wait does not look up the receiver and does not push: it answers
   `unavailable` and changes nothing. The model leaves it as a stutter step. *)

(* A drive that pushes: the wait is over, or the delivery is not paced. *)
Push(d) ==
  /\ state[d] = "owed"
  /\ pushes[d] < MaxPushes
  /\ (NoPacing \/ now >= until[d])
  /\ pushes' = [pushes EXCEPT ![d] = @ + 1]
  /\ \/ /\ receiver[d] = "unavailable"
        /\ LET next == IF delay[d] = 0 THEN D0
                       ELSE IF NoCap THEN 2 * delay[d] ELSE Min(2 * delay[d], Cap)
           IN /\ delay' = [delay EXCEPT ![d] = next]
              /\ until' = [until EXCEPT ![d] = now + next]
        /\ streak' = [streak EXCEPT ![d] = @ + 1]
        /\ streakStart' = [streakStart EXCEPT ![d] = IF streak[d] = 0 THEN now ELSE @]
        /\ paced' = [paced EXCEPT ![d] = @ + 1]
        /\ warns' = [warns EXCEPT ![d] = IF SilentPace THEN @ ELSE @ + 1]
        /\ state' = [state EXCEPT ![d] = IF DropOnUnavailable THEN "dropped" ELSE "owed"]
        /\ UNCHANGED <<failures, failWarns>>
     \/ /\ receiver[d] = "saved"
        /\ state' = [state EXCEPT ![d] = "saved"]
        /\ delay' = [delay EXCEPT ![d] = 0]
        /\ until' = [until EXCEPT ![d] = now]
        /\ streak' = [streak EXCEPT ![d] = 0]
        /\ UNCHANGED <<streakStart, paced, warns, failures, failWarns>>
     \/ /\ receiver[d] \in Failures
        /\ state' = [state EXCEPT ![d] = IF DropOnFailure THEN "dropped" ELSE "owed"]
        /\ delay' = [delay EXCEPT ![d] = IF NoReset THEN @ ELSE 0]
        /\ until' = [until EXCEPT ![d] = now]
        /\ streak' = [streak EXCEPT ![d] = 0]
        /\ failures' = [failures EXCEPT ![d] = @ + 1]
        /\ failWarns' = [failWarns EXCEPT ![d] = IF SilentFailure THEN @ ELSE @ + 1]
        /\ UNCHANGED <<streakStart, paced, warns>>
  /\ UNCHANGED <<now, receiver>>

(* A delivery that is still owed leaves from outside: its call is revoked, the delivery is
   excluded, or the executor abandons the call. The table entry is released with it. *)
End(d, how) ==
  /\ state[d] = "owed"
  /\ state' = [state EXCEPT ![d] = how]
  /\ delay' = [delay EXCEPT ![d] = IF KeepOnEnd THEN @ ELSE 0]
  /\ streak' = [streak EXCEPT ![d] = IF KeepOnEnd THEN @ ELSE 0]
  /\ UNCHANGED <<now, receiver, until, pushes, streakStart, paced, warns, failures, failWarns>>

Next ==
  \/ Tick
  \/ \E d \in Deliveries :
       \/ ReceiverChanges(d)
       \/ Push(d)
       \/ \E how \in Endings : End(d, how)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ now \in 0..Horizon
  /\ state \in [Deliveries -> {"owed", "saved", "dropped"} \cup Endings]
  /\ receiver \in [Deliveries -> Answers]
  /\ delay \in [Deliveries -> Nat] /\ until \in [Deliveries -> Nat]
  /\ pushes \in [Deliveries -> Nat] /\ streak \in [Deliveries -> Nat]
  /\ \A d \in Deliveries : paced[d] \in 0..pushes[d]
  /\ \A d \in Deliveries : failures[d] \in 0..pushes[d]
  /\ warns \in [Deliveries -> Nat] /\ failWarns \in [Deliveries -> Nat]

(* Q1. No hot loop: the k-th consecutive unavailable push happens no earlier than the sum of
   the first k-1 waits after the streak began. Pushes within one horizon are therefore
   bounded by a function of the horizon, D0 and Cap, not by how often the executor drives. *)
PushesPaced ==
  \A d \in Deliveries :
    streak[d] >= 1 => now >= streakStart[d] + MinSpan(streak[d])

(* Q2. The wait never exceeds the cap. *)
DelayCapped == \A d \in Deliveries : delay[d] <= Cap

(* Q3. An unavailable answer or a definite failure never ends the duty: the delivery is owed
   until a saved push or until it leaves from outside. *)
OwedUntilSaved == \A d \in Deliveries : state[d] # "dropped"

(* Q4. An answer without `unavailable` clears the pacing: outside a streak nothing is owed
   to the backoff, so the next trouble starts at the first wait. *)
ResetAfterAnswer == \A d \in Deliveries : streak[d] = 0 => delay[d] = 0

(* Q5. Every paced push wrote its named warning: the wait is never silent. *)
WarnPerPacedPush == \A d \in Deliveries : warns[d] = paced[d]

(* Q6 (O1). Every definite failure wrote its named warning: a failed push never leaves
   the log without a trace. The delivery stays owed (Q3). *)
WarnPerDefiniteFailure == \A d \in Deliveries : failWarns[d] = failures[d]

(* Q7 (O2). The table follows the deliveries in flight: an entry exists only for a delivery
   that is still owed, so the table is never larger than the number of deliveries in flight.
   The entry goes when the delivery is saved, revoked, excluded or abandoned. *)
TableFollowsDelivery == Table \subseteq InFlight
TableBounded == Cardinality(Table) <= Cardinality(InFlight)

=============================================================================

-------------------------- MODULE DeliveryBackoff --------------------------
(***************************************************************************)
(* The push pacing of one result delivery (R2-D273, R2-D282).              *)
(*                                                                         *)
(* One frozen delivery is owed to a receiver. The executor drives it at    *)
(* arbitrary moments of a discrete clock. A push whose receiver is absent  *)
(* or answers `unavailable` keeps the delivery owed and paces the next     *)
(* push: the first wait is D0, every later wait doubles up to Cap. An      *)
(* answer without `unavailable` clears the pacing: a saved push settles    *)
(* the delivery, a definite failure keeps it owed and the next trouble     *)
(* starts at the first wait again. The receiver changes freely between     *)
(* pushes, so the model covers every answer sequence within the horizon.   *)
(*                                                                         *)
(* The negative switches each remove one rule; the safe configuration     *)
(* sets them all FALSE.                                                    *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
  D0,                \* the first wait
  Cap,               \* the longest wait
  Horizon,           \* the last clock value the model explores
  MaxPushes,         \* the bound on pushes that keeps the model finite
  NoPacing,          \* a push never waits
  NoCap,             \* the wait keeps doubling past Cap
  NoReset,           \* a definite failure keeps the current wait
  DropOnUnavailable, \* an unavailable answer ends the duty
  SilentPace         \* a paced push writes no warning

ASSUME D0 >= 1 /\ Cap >= D0 /\ Horizon >= 1 /\ MaxPushes >= 1

Answers == {"unavailable", "saved", "denied"}

VARIABLES
  now,         \* the clock
  state,       \* "owed", "saved" or (only with DropOnUnavailable) "dropped"
  receiver,    \* what the receiver answers to the next push
  delay,       \* the wait set by the last unavailable push; 0 when not paced
  until,       \* the clock from which the next push may happen
  pushes,      \* how many pushes happened
  streak,      \* consecutive unavailable pushes since the last other answer
  streakStart, \* the clock of the first push of the streak
  paced,       \* how many pushes were answered unavailable
  warns        \* the named warnings written

vars == <<now, state, receiver, delay, until, pushes, streak, streakStart, paced, warns>>

Min(a, b) == IF a <= b THEN a ELSE b

(* The wait after `k` consecutive unavailable pushes: D0, 2 D0, ... capped. *)
RECURSIVE WaitAfter(_)
WaitAfter(k) == IF k <= 1 THEN D0 ELSE Min(2 * WaitAfter(k - 1), Cap)

(* The least time between the first push of a streak and its k-th push. *)
RECURSIVE MinSpan(_)
MinSpan(k) == IF k <= 1 THEN 0 ELSE MinSpan(k - 1) + WaitAfter(k - 1)

Init ==
  /\ now = 0
  /\ state = "owed"
  /\ receiver \in Answers
  /\ delay = 0
  /\ until = 0
  /\ pushes = 0
  /\ streak = 0
  /\ streakStart = 0
  /\ paced = 0
  /\ warns = 0

Tick ==
  /\ now < Horizon
  /\ now' = now + 1
  /\ UNCHANGED <<state, receiver, delay, until, pushes, streak, streakStart, paced, warns>>

ReceiverChanges ==
  /\ receiver' \in Answers
  /\ UNCHANGED <<now, state, delay, until, pushes, streak, streakStart, paced, warns>>

(* A drive inside the wait does not look up the receiver and does not push: it answers
   `unavailable` and changes nothing. The model leaves it as a stutter step. *)

(* A drive that pushes: the wait is over, or the delivery is not paced. *)
Push ==
  /\ state = "owed"
  /\ pushes < MaxPushes
  /\ (NoPacing \/ now >= until)
  /\ pushes' = pushes + 1
  /\ \/ /\ receiver = "unavailable"
        /\ LET next == IF delay = 0 THEN D0
                       ELSE IF NoCap THEN 2 * delay ELSE Min(2 * delay, Cap)
           IN /\ delay' = next
              /\ until' = now + next
        /\ streak' = streak + 1
        /\ streakStart' = IF streak = 0 THEN now ELSE streakStart
        /\ paced' = paced + 1
        /\ warns' = IF SilentPace THEN warns ELSE warns + 1
        /\ state' = IF DropOnUnavailable THEN "dropped" ELSE "owed"
     \/ /\ receiver = "saved"
        /\ state' = "saved"
        /\ delay' = 0
        /\ until' = now
        /\ streak' = 0
        /\ UNCHANGED <<streakStart, paced, warns>>
     \/ /\ receiver = "denied"
        /\ state' = "owed"
        /\ delay' = IF NoReset THEN delay ELSE 0
        /\ until' = now
        /\ streak' = 0
        /\ UNCHANGED <<streakStart, paced, warns>>
  /\ UNCHANGED <<now, receiver>>

Next == Tick \/ ReceiverChanges \/ Push

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ now \in 0..Horizon
  /\ state \in {"owed", "saved", "dropped"}
  /\ receiver \in Answers
  /\ delay \in Nat /\ until \in Nat /\ pushes \in Nat /\ streak \in Nat
  /\ paced \in 0..pushes /\ warns \in Nat

(* Q1. No hot loop: the k-th consecutive unavailable push happens no earlier than the sum of
   the first k-1 waits after the streak began. Pushes within one horizon are therefore
   bounded by a function of the horizon, D0 and Cap, not by how often the executor drives. *)
PushesPaced == streak >= 1 => now >= streakStart + MinSpan(streak)

(* Q2. The wait never exceeds the cap. *)
DelayCapped == delay <= Cap

(* Q3. An unavailable answer never ends the duty: the delivery is owed until a saved push. *)
OwedUntilSaved == state # "dropped"

(* Q4. An answer without `unavailable` clears the pacing: outside a streak nothing is owed
   to the backoff, so the next trouble starts at the first wait. *)
ResetAfterAnswer == streak = 0 => delay = 0

(* Q5. Every paced push wrote its named warning: the wait is never silent. *)
WarnPerPacedPush == warns = paced

=============================================================================

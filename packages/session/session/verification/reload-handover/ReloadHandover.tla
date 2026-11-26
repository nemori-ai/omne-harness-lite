--------------------------- MODULE ReloadHandover ---------------------------
(* One Run of a session that goes on, and the reloads people ask for while it does
   (packages/session/SPEC.md, the reload a person asks for).

   The session log holds the attempt the Run stands at, the reason of each attempt, the
   adoption of the Run (the old version or the new one), whether a cancel of the Run is
   committed and whether the Run ended. The Agent side holds the attempts whose runtime
   drives the execution, whether the execution is handed over and waits to be taken on,
   and whether the attachment that drove it was lost by a fault.

   A reload reads the attempt the Run stands at, asks the Agent to hand the execution over,
   then commits at the attempt it read: the new adoption, the release of the old attempt and
   one more attempt, reason reload, in one commit. The commit is refused when the Run ended,
   a cancel of it is committed, its attempt moved or the execution is no longer handed over.
   Commits and joins are serial for a session. A committed reload joins the new
   attempt to the handed execution. While a reload asks and commits, it holds the session:
   the recovery does not take the execution on. A refused reload leaves the execution
   handed over; the recovery takes it on afterwards with a claim, in the adoption the Run
   has. A fault loses the driving attachment; the recovery takes that execution on too.
   The Run ends only while it is driven.

   Negative controls: AsksHandover FALSE commits without the handover; RechecksHanded FALSE
   commits without finding the execution still handed over; ChecksCancel FALSE commits after
   a cancel; OneCommit FALSE writes the adoption and the attempt in two commits. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Reloads, AsksHandover, RechecksHanded, ChecksCancel, OneCommit, MaxAttempts, MaxFaults

VARIABLES
  attempt,      \* the attempt the Run stands at in the session log
  reasons,      \* [1..MaxAttempts -> reason]: "start", "claim", "reload" or "none" not yet
  adoption,     \* "old" or "new": the adoption of the Run in the session log
  cancel,       \* a cancel of the Run is committed
  ended,        \* the Run is terminal
  drivers,      \* the attempts whose runtime drives the execution
  handed,       \* the execution is handed over and waits to be taken on
  lost,         \* the attachment that drove the execution was lost by a fault
  faults,       \* faults so far
  pc,           \* [Reloads -> where the reload is]
  seen,         \* [Reloads -> the attempt it read when asked, then the one it committed]
  afterCancel   \* history: a reload committed while a cancel of the Run was committed

vars == <<attempt, reasons, adoption, cancel, ended, drivers, handed, lost, faults, pc, seen,
          afterCancel>>

Holding == {r \in Reloads : pc[r] \in {"asking", "handed", "half", "committed"}}

Init ==
  /\ attempt = 1
  /\ reasons = [i \in 1..MaxAttempts |-> IF i = 1 THEN "start" ELSE "none"]
  /\ adoption = "old"
  /\ cancel = FALSE
  /\ ended = FALSE
  /\ drivers = {1}
  /\ handed = FALSE
  /\ lost = FALSE
  /\ faults = 0
  /\ pc = [r \in Reloads |-> "idle"]
  /\ seen = [r \in Reloads |-> 0]
  /\ afterCancel = FALSE

\* A person asks; the session refuses at once when a cancel of the Run is committed.
Ask(r) ==
  /\ pc[r] = "idle"
  /\ ~ended
  /\ seen' = [seen EXCEPT ![r] = attempt]
  /\ pc' = [pc EXCEPT ![r] = IF ChecksCancel /\ cancel THEN "refused" ELSE "asking"]
  /\ UNCHANGED <<attempt, reasons, adoption, cancel, ended, drivers, handed, lost, faults,
                 afterCancel>>

\* The Agent hands over at its safe point, or answers why not: the Run ended, or no runtime
\* drives it. An execution already handed over answers that handover.
HandOver(r) ==
  /\ pc[r] = "asking"
  /\ IF ended \/ (AsksHandover /\ ~handed /\ drivers = {})
       THEN /\ pc' = [pc EXCEPT ![r] = "refused"]
            /\ UNCHANGED <<drivers, handed>>
       ELSE /\ pc' = [pc EXCEPT ![r] = "handed"]
            /\ IF AsksHandover /\ ~handed
                 THEN /\ drivers' = {}
                      /\ handed' = TRUE
                 ELSE UNCHANGED <<drivers, handed>>
  /\ UNCHANGED <<attempt, reasons, adoption, cancel, ended, lost, faults, seen, afterCancel>>

\* In the serial section the reload also finds the execution still handed over and taken on by
\* no one: another reload may have joined it since this one was handed the same handover.
Refusable(r) ==
  \/ ended \/ (ChecksCancel /\ cancel) \/ seen[r] # attempt \/ attempt = MaxAttempts
  \/ (AsksHandover /\ RechecksHanded /\ ~handed)

NextAttempt(reason) ==
  /\ attempt' = attempt + 1
  /\ reasons' = [reasons EXCEPT ![attempt + 1] = reason]

Commit(r) ==
  /\ pc[r] = "handed"
  /\ IF Refusable(r)
       THEN /\ pc' = [pc EXCEPT ![r] = "refused"]
            /\ UNCHANGED <<attempt, reasons, adoption, afterCancel, seen>>
       ELSE /\ adoption' = "new"
            /\ afterCancel' = (afterCancel \/ cancel)
            /\ IF OneCommit
                 THEN /\ NextAttempt("reload")
                      /\ pc' = [pc EXCEPT ![r] = "committed"]
                      /\ seen' = [seen EXCEPT ![r] = attempt + 1]
                 ELSE /\ pc' = [pc EXCEPT ![r] = "half"]
                      /\ UNCHANGED <<attempt, reasons, seen>>
  /\ UNCHANGED <<cancel, ended, drivers, handed, lost, faults>>

\* The second commit of the negative control OneCommit FALSE.
Finish(r) ==
  /\ pc[r] = "half"
  /\ NextAttempt("reload")
  /\ pc' = [pc EXCEPT ![r] = "committed"]
  /\ seen' = [seen EXCEPT ![r] = attempt + 1]
  /\ UNCHANGED <<adoption, cancel, ended, drivers, handed, lost, faults, afterCancel>>

\* The attempt it committed resumes the execution and drives it; the Agent journal refuses a
\* grant the session no longer stands at.
Join(r) ==
  /\ pc[r] = "committed"
  /\ IF seen[r] = attempt
       THEN /\ drivers' = drivers \cup {attempt}
            /\ handed' = FALSE
       ELSE UNCHANGED <<drivers, handed>>
  /\ pc' = [pc EXCEPT ![r] = "done"]
  /\ UNCHANGED <<attempt, reasons, adoption, cancel, ended, lost, faults, seen, afterCancel>>

Release(r) ==
  /\ pc[r] = "refused"
  /\ pc' = [pc EXCEPT ![r] = "done"]
  /\ UNCHANGED <<attempt, reasons, adoption, cancel, ended, drivers, handed, lost, faults, seen,
                 afterCancel>>

Fault ==
  /\ drivers # {}
  /\ faults < MaxFaults
  /\ drivers' = {}
  /\ lost' = TRUE
  /\ faults' = faults + 1
  /\ UNCHANGED <<attempt, reasons, adoption, cancel, ended, handed, pc, seen, afterCancel>>

\* The recovery takes a handed or lost execution on, in the adoption the Run has.
Claim ==
  /\ Holding = {}
  /\ ~ended
  /\ handed \/ lost
  /\ attempt < MaxAttempts
  /\ NextAttempt("claim")
  /\ drivers' = {attempt + 1}
  /\ handed' = FALSE
  /\ lost' = FALSE
  /\ UNCHANGED <<adoption, cancel, ended, faults, pc, seen, afterCancel>>

Cancel ==
  /\ ~ended
  /\ ~cancel
  /\ cancel' = TRUE
  /\ UNCHANGED <<attempt, reasons, adoption, ended, drivers, handed, lost, faults, pc, seen,
                 afterCancel>>

End ==
  /\ ~ended
  /\ drivers # {}
  /\ ended' = TRUE
  /\ drivers' = {}
  /\ UNCHANGED <<attempt, reasons, adoption, cancel, handed, lost, faults, pc, seen, afterCancel>>

Next ==
  \/ \E r \in Reloads : Ask(r) \/ HandOver(r) \/ Commit(r) \/ Finish(r) \/ Join(r) \/ Release(r)
  \/ Fault \/ Claim \/ Cancel \/ End

Spec == Init /\ [][Next]_vars

\* The adoption is new exactly when the Run has an attempt started for a reload.
AllOrNothing == (adoption = "new") <=> (\E i \in 1..attempt : reasons[i] = "reload")

\* At most one runtime drives the Run, it drives the attempt the session stands at, and none
\* drives while the execution waits to be taken on.
AtMostOneAdvancer ==
  /\ Cardinality(drivers) <= 1
  /\ \A d \in drivers : d = attempt
  /\ (handed => drivers = {})

\* No reload is committed after a cancel of the Run is.
CancelFirst == ~afterCancel

TypeOK ==
  /\ attempt \in 1..MaxAttempts
  /\ adoption \in {"old", "new"}
  /\ drivers \subseteq 1..MaxAttempts
  /\ pc \in [Reloads -> {"idle", "asking", "handed", "half", "committed", "refused", "done"}]
=============================================================================

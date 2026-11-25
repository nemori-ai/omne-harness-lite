------------------------------- MODULE BatchOrder -------------------------------
\* The order in which Agent sends the allowed actions of one batch (AG-33).
\* An action is sent when every allowed action before it either has its slot filled
\* or may run beside it. A slot is filled by a final result or by a background placeholder.
EXTENDS Naturals, FiniteSets

CONSTANTS N, Rule

Actions == 1..N
Rules == {"ordered", "eager", "shared-overtakes", "background-blocks"}
ASSUME Rule \in Rules

VARIABLES beside, verdict, slot

vars == <<beside, verdict, slot>>

Allowed(i) == verdict[i] = "allowed"
Filled(j) == slot[j] \in {"final", "background"}
\* The control that waits for the final result treats a background placeholder as not filled.
Passed(j) == IF Rule = "background-blocks" THEN slot[j] = "final" ELSE Filled(j)

MayRunBeside(i, j) ==
  IF Rule = "shared-overtakes" THEN beside[i] ELSE beside[i] /\ beside[j]

Sendable(i) ==
  /\ Allowed(i)
  /\ slot[i] = "none"
  /\ \/ Rule = "eager"
     \/ \A j \in Actions : (j < i /\ Allowed(j)) => (Passed(j) \/ MayRunBeside(i, j))

Init ==
  /\ beside \in [Actions -> BOOLEAN]
  /\ verdict \in [Actions -> {"allowed", "denied"}]
  /\ slot = [i \in Actions |-> IF verdict[i] = "denied" THEN "denied" ELSE "none"]

Send(i) == Sendable(i) /\ slot' = [slot EXCEPT ![i] = "dispatched"] /\ UNCHANGED <<beside, verdict>>

Fill(i) ==
  /\ slot[i] = "dispatched"
  /\ \E how \in {"final", "background"} : slot' = [slot EXCEPT ![i] = how]
  /\ UNCHANGED <<beside, verdict>>

Next == \E i \in Actions : Send(i) \/ Fill(i)

Spec == Init /\ [][Next]_vars

TypeOK == slot \in [Actions -> {"none", "dispatched", "final", "background", "denied"}]

\* An action with effects starts only after every allowed action before it has its slot filled.
ExclusiveAfterEarlier ==
  \A i \in Actions : (slot[i] = "dispatched" /\ ~beside[i]) =>
    \A j \in Actions : (j < i /\ Allowed(j)) => Filled(j)

\* A read-only action starts only after every allowed action with effects before it has its slot filled.
SharedAfterEarlierExclusive ==
  \A i \in Actions : (slot[i] = "dispatched" /\ beside[i]) =>
    \A j \in Actions : (j < i /\ Allowed(j) /\ ~beside[j]) => Filled(j)

\* While nothing is in flight, an allowed action that was not sent can be sent: the batch never stalls.
EveryAllowedIsSent ==
  ((\E i \in Actions : Allowed(i) /\ slot[i] = "none") /\ (\A j \in Actions : slot[j] # "dispatched"))
    => \E i \in Actions : Sendable(i)
=================================================================================

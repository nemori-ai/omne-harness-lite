---------------------------- MODULE Admission ----------------------------
EXTENDS Naturals
CONSTANT Mutation
VARIABLES s
vars == <<s>>
Init == s = [published |-> FALSE, generation |-> 0, member |-> TRUE,
  grant |-> FALSE, mode |-> "standard", decision |-> "pending",
  decisionDurable |-> FALSE, admitted |-> FALSE, durable |-> FALSE,
  witness |-> FALSE, cancelled |-> FALSE, tombstone |-> FALSE,
  started |-> FALSE, ended |-> FALSE, safe |-> FALSE,
  badDurability |-> FALSE, badLateStart |-> FALSE]
Current == s.published /\ s.generation = 0 /\ s.member
Authorized == s.grant \/ (s.decision = "approve" /\ s.decisionDurable)
Allow == Current /\ Authorized /\
  (s.mode # "confirm" \/ (s.decision = "approve" /\ s.decisionDurable))
Publish == /\ ~s.published /\ s.generation = 0
           /\ s' = [s EXCEPT !.published = TRUE]
Replace == /\ s.generation = 0
           /\ s' = [s EXCEPT !.generation = 1, !.published = FALSE]
Revoke == /\ s.member /\ s' = [s EXCEPT !.member = FALSE]
Grant == /\ ~s.grant /\ s' = [s EXCEPT !.grant = TRUE]
Mode(m) == /\ s.mode = "standard" /\ m \in {"confirm", "unattended"}
           /\ s' = [s EXCEPT !.mode = m]
Answer(a) == /\ s.decision = "pending" /\ ~s.cancelled /\ Current
             /\ s.mode # "unattended" /\ a \in {"approve", "reject"}
             /\ s' = [s EXCEPT !.decision = a]
SyncAnswer == /\ s.decision # "pending" /\ ~s.decisionDurable
              /\ s' = [s EXCEPT !.decisionDurable = TRUE]
\* Admission is the short ordered position, before durability acknowledgement.
Admit == /\ ~s.admitted /\ ~s.cancelled /\ s.decision # "reject"
         /\ (Allow \/ Mutation = "authorization")
         /\ s' = [s EXCEPT !.admitted = TRUE, !.witness = Allow]
Sync == /\ s.admitted /\ ~s.durable
        /\ s' = [s EXCEPT !.durable = TRUE]
Cancel == /\ ~s.cancelled /\ s' = [s EXCEPT !.cancelled = TRUE]
\* Transport may deliver start before stop; only the executor receipt is safe.
StopDelivered == /\ s.cancelled /\ ~s.tombstone
                 /\ s' = [s EXCEPT !.tombstone = TRUE]
Start == /\ s.admitted /\ ~s.started
         /\ (s.durable \/ Mutation = "durability")
         /\ (~s.tombstone \/ Mutation = "lateStart")
         /\ s' = [s EXCEPT !.started = TRUE,
                    !.badDurability = ~s.durable, !.badLateStart = s.safe]
End == /\ s.started /\ ~s.ended
       /\ s' = [s EXCEPT !.ended = TRUE]
SafeStop == /\ s.tombstone /\ (~s.started \/ s.ended) /\ ~s.safe
            /\ s' = [s EXCEPT !.safe = TRUE]
Next == Publish \/ Replace \/ Revoke \/ Grant \/ (\E m \in {"confirm", "unattended"} : Mode(m)) \/
        (\E a \in {"approve", "reject"} : Answer(a)) \/ SyncAnswer \/ Admit \/ Sync \/ Cancel \/
        StopDelivered \/ Start \/ End \/ SafeStop
Spec == Init /\ [][Next]_vars
AdmissionAuthorized == s.admitted => s.witness
DurabilityBeforeEffect == ~s.badDurability
NoLateStartAfterSafeStop == ~s.badLateStart
=============================================================================

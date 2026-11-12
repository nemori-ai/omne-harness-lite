----------------------- MODULE GovernanceSqlCustody -----------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES saved, first, sent, terminal, effect, closed
vars == <<saved, first, sent, terminal, effect, closed>>
Keys == {"left", "right"}
Init == /\ saved = [k \in Keys |-> 0] /\ first = saved
        /\ sent = [k \in Keys |-> 0] /\ terminal = [k \in Keys |-> FALSE]
        /\ effect = [k \in Keys |-> 0] /\ closed = [k \in Keys |-> FALSE]
Store(k,v) == /\ ~terminal[k]
              /\ saved' = [saved EXCEPT ![k] = IF @ = 0 \/ Bad = "replace" THEN v ELSE @]
              /\ first' = [first EXCEPT ![k] = IF @ = 0 THEN v ELSE @]
              /\ UNCHANGED <<sent, terminal, effect, closed>>
Send(k,v) == /\ ~terminal[k]
             /\ (saved[k] # 0 \/ Bad = "unprepared")
             /\ sent' = [sent EXCEPT ![k] = IF Bad = "rebuild" THEN v
                       ELSE IF Bad = "crosskey" THEN saved[IF k = "left" THEN "right" ELSE "left"]
                       ELSE IF saved[k] = 0 THEN v ELSE saved[k]]
             /\ UNCHANGED <<saved,first,terminal,effect,closed>>
Commit(k) == /\ sent[k] # 0 /\ (~terminal[k] \/ Bad = "revive")
              /\ effect' = [effect EXCEPT ![k] = sent[k]]
              /\ terminal' = [terminal EXCEPT ![k] = TRUE]
              /\ UNCHANGED <<saved,first,sent,closed>>
Seal(k) == /\ ~terminal[k]
           /\ terminal' = [terminal EXCEPT ![k] = TRUE]
           /\ closed' = [closed EXCEPT ![k] = TRUE]
           /\ UNCHANGED <<saved,first,sent,effect>>
Restart == UNCHANGED vars
Next == (\E k \in Keys: (\E v \in {1,2}: Store(k,v) \/ Send(k,v)) \/ Commit(k) \/ Seal(k)) \/ Restart
Immutable == saved = first
ExactSend == \A k \in Keys: sent[k] # 0 => (saved[k] # 0 /\ sent[k] = saved[k])
NoRevival == \A k \in Keys: closed[k] => effect[k] = 0
Spec == Init /\ [][Next]_vars
=============================================================================

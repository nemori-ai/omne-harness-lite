-------------------------- MODULE AuthorityComposition --------------------------
EXTENDS Naturals, TLC
CONSTANT Bad
Sources == {"identity", "holding", "permissions", "settings", "session", "card", "permit"}
VARIABLES current, prepared, committed, usedInvalid
vars == <<current, prepared, committed, usedInvalid>>
Init == /\ current = [s \in Sources |-> TRUE]
        /\ prepared = FALSE /\ committed = FALSE /\ usedInvalid = FALSE
Prepare == /\ ~prepared /\ prepared' = TRUE
           /\ UNCHANGED <<current,committed,usedInvalid>>
Withdraw(s) == /\ current[s] /\ current' = [current EXCEPT ![s] = FALSE]
               /\ UNCHANGED <<prepared,committed,usedInvalid>>
Commit == /\ prepared /\ ~committed
          /\ (\A s \in Sources: current[s] \/ Bad = s)
          /\ committed' = TRUE
          /\ usedInvalid' = (\E s \in Sources: ~current[s])
          /\ UNCHANGED <<current,prepared>>
Next == Prepare \/ (\E s \in Sources: Withdraw(s)) \/ Commit \/ UNCHANGED vars
CurrentComposition == ~usedInvalid
Spec == Init /\ [][Next]_vars
=============================================================================

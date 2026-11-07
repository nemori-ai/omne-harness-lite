----------------------- MODULE ProvenanceIsolation -----------------------
EXTENDS TLC
CONSTANT FreshTag
VARIABLE tags, tagged, observed, journalEnded
Exec == {"A", "B"}
Objects == {"shared", "A", "B"}
vars == <<tags, tagged, observed, journalEnded>>
Init == /\ tags = [o \in Objects |-> "none"]
        /\ tagged = {} /\ observed = {}
        /\ journalEnded = [e \in Exec |-> FALSE]
TagCapability(e) == /\ e \notin tagged
                    /\ tags' = [tags EXCEPT ![IF FreshTag THEN e ELSE "shared"] = "rejected"]
                    /\ tagged' = tagged \cup {e}
                    /\ UNCHANGED <<observed, journalEnded>>
ReadJournalDenial(e) == /\ e \notin observed
                       /\ observed' = observed \cup {e}
                       /\ journalEnded' = [journalEnded EXCEPT ![e] = (tags["shared"] = "rejected")]
                       /\ UNCHANGED <<tags, tagged>>
Next == \E e \in Exec : TagCapability(e) \/ ReadJournalDenial(e)
Spec == Init /\ [][Next]_vars
JournalDenialNeverEnds == \A e \in Exec : ~journalEnded[e]
SharedSourceUnchanged == tags["shared"] = "none"
=============================================================================

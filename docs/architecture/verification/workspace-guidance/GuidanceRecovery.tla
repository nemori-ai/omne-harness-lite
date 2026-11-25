------------------------- MODULE GuidanceRecovery -------------------------
EXTENDS Naturals
CONSTANT Fault

\* Start after A's reservation commits. A's original write may still arrive.
VARIABLES head, original, reader, copies, otherWrite
vars == <<head, original, reader, copies, otherWrite>>
Init == /\ head = 0 /\ original = "pending" /\ reader = "A"
        /\ copies = 0 /\ otherWrite = FALSE

Deliver == /\ original = "pending"
           /\ original' = IF head = 0 THEN "committed" ELSE "rolled-back"
           /\ copies' = IF head = 0 THEN copies + 1 ELSE copies
           /\ head' = IF head = 0 THEN head + 1 ELSE head
           /\ UNCHANGED <<reader, otherWrite>>
Restart == /\ reader = "A" /\ reader' = "query"
           /\ UNCHANGED <<head, original, copies, otherWrite>>
Other == /\ ~otherWrite /\ head' = head + 1 /\ otherWrite' = TRUE
         /\ UNCHANGED <<original, reader, copies>>

\* A query naming the same scope, session, revision and physical attempt can
\* only answer committed for the original. An unknown answer can be retried.
Query == /\ reader = "query"
         /\ reader' \in (IF original = "committed" THEN {"found"}
                        ELSE IF Fault = "foreign-receipt" THEN {"found", "unseen"}
                        ELSE {"unseen"})
         /\ UNCHANGED <<head, original, copies, otherWrite>>
Fence == /\ reader = "unseen" /\ head = 0
         /\ head' = IF Fault = "no-fence" THEN head ELSE head + 1
         /\ reader' = "excluded"
         /\ UNCHANGED <<original, copies, otherWrite>>
Moved == /\ reader = "unseen" /\ head > 0
         /\ reader' = IF original = "committed" THEN "query" ELSE "excluded"
         /\ UNCHANGED <<head, original, copies, otherWrite>>
\* Rebuild F minus V after reconciliation for the one body still required.
Rebuild == /\ reader \in {"excluded", "found"}
           /\ copies' = IF copies = 0 THEN 1 ELSE copies
           /\ head' = IF copies = 0 THEN head + 1 ELSE head
           /\ reader' = "ready" /\ UNCHANGED <<otherWrite, original>>

Next == Deliver \/ Restart \/ Other \/ Query \/ Fence \/ Moved \/ Rebuild
Spec == Init /\ [][Next]_vars
Safety == /\ (reader = "found" => original = "committed")
          /\ (reader = "excluded" => head > 0 /\ original # "committed")
          /\ copies <= 1 /\ (reader = "ready" => copies = 1)
============================================================================

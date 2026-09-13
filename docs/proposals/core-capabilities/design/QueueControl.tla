--------------------------- MODULE QueueControl ---------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Mutation
Items == 1..3
VARIABLES item, slot, hold, stop, safe, revision, takenRevision, badClaim, badRelease
vars == <<item, slot, hold, stop, safe, revision, takenRevision, badClaim, badRelease>>
Init == /\ item = [i \in Items |-> "queued"] /\ slot = 0
        /\ hold = FALSE /\ stop = FALSE /\ safe = FALSE
        /\ revision = [i \in Items |-> 0] /\ takenRevision = [i \in Items |-> 0]
        /\ badClaim = FALSE /\ badRelease = FALSE
Claim(i) ==
  /\ item[i] = "queued" /\ slot = 0 /\ ~stop
  /\ (~hold \/ Mutation = "hold")
  /\ \A j \in Items : j < i => item[j] # "queued"
  /\ item' = [item EXCEPT ![i] = "claimed"] /\ slot' = i
  /\ takenRevision' = [takenRevision EXCEPT ![i] = revision[i]]
  /\ badClaim' = (badClaim \/ hold)
  /\ UNCHANGED <<hold, stop, safe, revision, badRelease>>
Edit(i) == /\ item[i] = "queued" /\ revision[i] = 0
           /\ revision' = [revision EXCEPT ![i] = 1]
           /\ UNCHANGED <<item, slot, hold, stop, safe, takenRevision, badClaim, badRelease>>
\* Item 2 is the ordered clear command. Clear never reclaims a taken item.
Clear == /\ slot = 2 /\ item[2] = "claimed"
         /\ item' = [i \in Items |-> IF item[i] = "queued" THEN "removed" ELSE item[i]]
         /\ UNCHANGED <<slot, hold, stop, safe, revision, takenRevision, badClaim, badRelease>>
Finish == /\ slot # 0 /\ ~stop
          /\ item' = [item EXCEPT ![slot] = "settled"] /\ slot' = 0
          /\ UNCHANGED <<hold, stop, safe, revision, takenRevision, badClaim, badRelease>>
ForceStop == /\ slot # 0 /\ ~stop
             /\ stop' = TRUE /\ hold' = TRUE /\ safe' = FALSE
             /\ UNCHANGED <<item, slot, revision, takenRevision, badClaim, badRelease>>
ConfirmSafe == /\ stop /\ ~safe /\ safe' = TRUE
               /\ UNCHANGED <<item, slot, hold, stop, revision, takenRevision, badClaim, badRelease>>
Release == /\ stop /\ slot # 0 /\ (safe \/ Mutation = "earlyRelease")
           /\ badRelease' = (badRelease \/ ~safe)
           /\ item' = [item EXCEPT ![slot] = "cancelled"] /\ slot' = 0
           /\ stop' = FALSE
           /\ UNCHANGED <<hold, safe, revision, takenRevision, badClaim>>
ContinueQueue == /\ hold /\ hold' = FALSE
                 /\ UNCHANGED <<item, slot, stop, safe, revision, takenRevision, badClaim, badRelease>>
Next == (\E i \in Items : Claim(i) \/ Edit(i)) \/ Clear \/ Finish \/ ForceStop \/
        ConfirmSafe \/ Release \/ ContinueQueue
Spec == Init /\ [][Next]_vars
SingleClaim == Cardinality({i \in Items : item[i] = "claimed"}) <= 1
ExactSlot == {i \in Items : item[i] = "claimed"} = IF slot = 0 THEN {} ELSE {slot}
TakenInputStable == \A i \in Items : item[i] # "queued" =>
  (item[i] = "removed" \/ takenRevision[i] = revision[i])
HoldRespected == ~badClaim
SafeRelease == ~badRelease
=============================================================================

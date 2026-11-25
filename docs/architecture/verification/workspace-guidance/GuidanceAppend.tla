-------------------------- MODULE GuidanceAppend --------------------------
EXTENDS Naturals
CONSTANT Fault
W == {"x","y"}
Other(k) == IF k = "x" THEN "y" ELSE "x"
Need(k) == {"root","common",k}
Empty == [at |-> 9, put |-> {}]
VARIABLES rev, shown, work, slot, compacted, bad
vars == <<rev,shown,work,slot,compacted,bad>>
Init == /\ rev=0 /\ shown={} /\ work=[k \in W |-> "open"]
        /\ slot=[k \in W |-> Empty] /\ compacted=FALSE /\ bad=FALSE
Prepare(k) ==
  /\ work[k]="open"
  /\ slot'=[slot EXCEPT ![k]=[at |-> rev, put |-> Need(k) \ shown]]
  /\ UNCHANGED <<rev,shown,work,compacted,bad>>
Append(k) ==
  /\ work[k]="open" /\ slot[k] # Empty /\ (slot[k].at=rev \/ Fault="without-cas")
  /\ rev'=rev+1 /\ shown'=shown \cup slot[k].put
  /\ bad'=(bad \/ slot[k].put # (Need(k) \ shown))
  /\ work' \in {[work EXCEPT ![k]="unknown"],[work EXCEPT ![k]="answered"]}
  /\ UNCHANGED <<slot,compacted>>
Recover(k) ==
  /\ work[k]="unknown" /\ work'=[work EXCEPT ![k]="answered"]
  /\ bad'=(bad \/ (Fault="repeat-unknown" /\ slot[k].put \cap shown # {}))
  /\ UNCHANGED <<rev,shown,slot,compacted>>
Compact ==
  /\ ~compacted /\ compacted'=TRUE /\ shown' \in SUBSET shown /\ rev'=rev+1
  /\ UNCHANGED <<work,slot,bad>>
Next == Compact \/ \E k \in W : Prepare(k) \/ Append(k) \/ Recover(k)
Spec == Init /\ [][Next]_vars
Safety == ~bad
=============================================================================

----------------------- MODULE MeasurementSession -----------------------
EXTENDS Naturals, FiniteSets
CONSTANTS RequestCount, EntryCount, KeyCount, Capacity, PendingCap,
          BadKeyAcquire, BadLiveMeasure, BadBusyEvict
Requests == 1..RequestCount
Entries == 1..EntryCount
Keys == 1..KeyCount
VARIABLE st
vars == <<st>>
Phase(e) == IF e \in Entries THEN st.phase[e] ELSE "unused"
Pending(s) == {r \in Requests : s.req[r] \notin {"unused", "done"}}
Retained(s) == {e \in Entries : s.registered[e] /\ s.reusable[e]}
Users(s,e) == {r \in Requests : s.chosen[r] = e /\ s.req[r] \in {"waiting", "measuring"}}
TypeOK == /\ st.host \in {"open", "closing", "closed"}
          /\ st.externalKey \in Keys /\ st.externalBody \in {0,1}
          /\ st.req \in [Requests -> {"unused","choosing","waiting","measuring","cleanup","done"}]
          /\ st.snapKey \in [Requests -> Keys] /\ st.snapBody \in [Requests -> {0,1}]
          /\ st.measuredBody \in [Requests -> {0,1}]
          /\ st.chosen \in [Requests -> Entries \cup {0}]
          /\ st.phase \in [Entries -> {"unused","acquiring","acquired","failed","releasing","released"}]
          /\ st.key \in [Entries -> Keys] /\ st.acquiredKey \in [Entries -> Keys]
          /\ st.blockedBy \in [Entries -> Entries \cup {0}]
          /\ st.registered \in [Entries -> BOOLEAN] /\ st.reusable \in [Entries -> BOOLEAN]
          /\ st.failure \in BOOLEAN /\ st.result \in {"none","ok","failure"}
Bounded == /\ Cardinality(Retained(st)) <= Capacity
           /\ Cardinality(Pending(st)) <= PendingCap
ExactKey == \A e \in Entries : st.phase[e] \in {"acquired","releasing","released"}
            => st.acquiredKey[e] = st.key[e]
ProbeSnapshot == \A r \in Requests : st.req[r] = "measuring" => st.measuredBody[r] = st.snapBody[r]
BusyNotReleased == \A e \in Entries : st.phase[e] \in {"releasing","released"} => Users(st,e) = {}
SharedAcquire == \A a,b \in Entries :
                 (st.registered[a] /\ st.registered[b] /\ st.key[a] = st.key[b]) => a = b
ClosedDrained == st.host = "closed" =>
                 /\ Pending(st) = {}
                 /\ \A e \in Entries : st.phase[e] \in {"unused","failed","released"}
FailureVisible == st.result = "ok" => ~st.failure
Structure == /\ (st.result # "none") = (st.host = "closed")
             /\ \A e \in Entries : st.registered[e] => st.phase[e] \in {"acquiring","acquired"}
             /\ \A e \in Entries : st.reusable[e] => st.registered[e]
             /\ \A r \in Requests : st.req[r] \in {"waiting","measuring"} =>
                  (st.chosen[r] \in Entries /\ Phase(st.chosen[r]) \in {"acquiring","acquired","failed"})
             /\ \A r \in Requests : st.req[r] = "cleanup" =>
                  (st.chosen[r] \in Entries /\ Phase(st.chosen[r]) \in {"releasing","released"})
             /\ \A r \in Requests : st.req[r] \in {"unused","choosing"} => st.chosen[r] = 0
             /\ \A r \in Requests : st.req[r] = "measuring" => Phase(st.chosen[r]) = "acquired"
Init == st = [host |-> "open", externalKey |-> 1, externalBody |-> 0,
              req |-> [r \in Requests |-> "unused"], chosen |-> [r \in Requests |-> 0],
              snapKey |-> [r \in Requests |-> 1], snapBody |-> [r \in Requests |-> 0],
              measuredBody |-> [r \in Requests |-> 0],
              phase |-> [e \in Entries |-> "unused"], key |-> [e \in Entries |-> 1],
              acquiredKey |-> [e \in Entries |-> 1], blockedBy |-> [e \in Entries |-> 0],
              registered |-> [e \in Entries |-> FALSE], reusable |-> [e \in Entries |-> FALSE],
              failure |-> FALSE, result |-> "none"]
Mutate(k,b) == st' = [st EXCEPT !.externalKey = k, !.externalBody = b]
Begin(r) == /\ st.host = "open" /\ st.req[r] = "unused"
            /\ Cardinality(Pending(st)) < PendingCap
            /\ st' = [st EXCEPT !.req[r] = "choosing", !.snapKey[r] = st.externalKey,
                         !.snapBody[r] = st.externalBody]
Existing(r,e) == /\ st.req[r] = "choosing" /\ st.registered[e] /\ st.key[e] = st.snapKey[r]
                 /\ st' = [st EXCEPT !.req[r] = "waiting", !.chosen[r] = e]
Create(r,e,victim) ==
    /\ st.req[r] = "choosing" /\ st.phase[e] = "unused"
    /\ ~\E old \in Entries : st.registered[old] /\ st.key[old] = st.snapKey[r]
    /\ IF victim = 0
          THEN Cardinality(Retained(st)) < Capacity \/
               ~\E old \in Retained(st) : Users(st,old) = {}
          ELSE /\ victim \in Retained(st) /\ Cardinality(Retained(st)) = Capacity
               /\ st.phase[victim] = "acquired"
               /\ (Users(st,victim) = {} \/ BadBusyEvict)
    /\ LET reuse == Cardinality(Retained(st)) < Capacity \/ victim # 0
           allocated == [st EXCEPT !.req[r] = "waiting", !.chosen[r] = e,
                           !.key[e] = st.snapKey[r], !.phase[e] = "acquiring",
                           !.blockedBy[e] = victim, !.registered[e] = TRUE, !.reusable[e] = reuse]
       IN st' = IF victim = 0 THEN allocated ELSE
           [allocated EXCEPT !.registered[victim] = FALSE, !.reusable[victim] = FALSE,
                             !.phase[victim] = "releasing"]
Acquire(e) == /\ st.phase[e] = "acquiring"
              /\ st.blockedBy[e] = 0 \/ Phase(st.blockedBy[e]) = "released"
              /\ st' = [st EXCEPT !.phase[e] = "acquired",
                           !.acquiredKey[e] = IF BadKeyAcquire THEN st.externalKey ELSE st.key[e]]
AcquireFail(e) == /\ st.phase[e] = "acquiring"
                  /\ st.blockedBy[e] = 0 \/ Phase(st.blockedBy[e]) = "released"
                  /\ st' = [st EXCEPT !.phase[e] = "failed", !.registered[e] = FALSE,
                               !.reusable[e] = FALSE, !.failure = TRUE]
Measure(r) == /\ st.req[r] = "waiting" /\ Phase(st.chosen[r]) = "acquired"
              /\ st' = [st EXCEPT !.req[r] = "measuring",
                           !.measuredBody[r] = IF BadLiveMeasure THEN st.externalBody ELSE st.snapBody[r]]
Finish(r,bad) ==
    /\ st.req[r] = "measuring" \/
       (st.req[r] = "waiting" /\ Phase(st.chosen[r]) = "failed")
    /\ LET e == st.chosen[r]
           keep == st.reusable[e] /\ ~bad
           release == ~keep /\ Cardinality(Users(st,e)) = 1 /\ st.phase[e] = "acquired"
       IN st' = [st EXCEPT !.req[r] = IF release THEN "cleanup" ELSE "done",
                    !.reusable[e] = keep, !.registered[e] = @ /\ ~bad /\ ~release,
                    !.phase[e] = IF release THEN "releasing" ELSE @,
                    !.failure = @ \/ bad]
ReleaseDone(e,bad) == /\ st.phase[e] = "releasing"
                     /\ st' = [st EXCEPT !.phase[e] = "released", !.registered[e] = FALSE,
                                  !.failure = @ \/ bad]
CleanupDone(r) == /\ st.req[r] = "cleanup" /\ Phase(st.chosen[r]) = "released"
                 /\ st' = [st EXCEPT !.req[r] = "done"]
Close == /\ st.host = "open" /\ st' = [st EXCEPT !.host = "closing"]
CloseRelease(e) == /\ st.host = "closing" /\ Pending(st) = {} /\ st.phase[e] = "acquired"
                   /\ st' = [st EXCEPT !.phase[e] = "releasing", !.registered[e] = FALSE,
                                !.reusable[e] = FALSE]
CloseDone == /\ st.host = "closing" /\ Pending(st) = {}
             /\ \A e \in Entries : st.phase[e] \in {"unused","failed","released"}
             /\ st' = [st EXCEPT !.host = "closed", !.result = IF st.failure THEN "failure" ELSE "ok"]
Next == (\E k \in Keys,b \in {0,1} : Mutate(k,b))
        \/ (\E r \in Requests : Begin(r) \/ Measure(r) \/ CleanupDone(r) \/
            (\E bad \in BOOLEAN : Finish(r,bad)) \/
            (\E e \in Entries : Existing(r,e) \/ (\E v \in Entries \cup {0} : Create(r,e,v))))
        \/ (\E e \in Entries : Acquire(e) \/ AcquireFail(e) \/ CloseRelease(e) \/
            (\E bad \in BOOLEAN : ReleaseDone(e,bad))) \/ Close \/ CloseDone
Spec == Init /\ [][Next]_vars
=============================================================================

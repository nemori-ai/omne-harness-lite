--------------------------- MODULE WorkspaceGuidance ---------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Fault
VARIABLES gen, pending, done, visits, shown, compacted, plan, fresh, bad
vars == <<gen, pending, done, visits, shown, compacted, plan, fresh, bad>>
Leaves == {"pay","docs"}
Workspace(g) == IF g = 1 THEN "B" ELSE "A"
Rule(g,d) == <<Workspace(g),d>>
Parents(d) == {"root","pkg",d}
Legal(g,v) == {Rule(g,d) : d \in ({"root"} \cup UNION {Parents(k) : k \in v})}
Zero == [at |-> 3, need |-> {}, put |-> {}, copies |-> 0]
Goal == Legal(gen,visits)
Init == /\ gen = 0 /\ pending = [k \in Leaves |-> 0] /\ done = {}
        /\ visits = {} /\ shown = {} /\ compacted = FALSE /\ plan = Zero /\ fresh = FALSE /\ bad = FALSE
Finish(k) ==
  /\ k \notin done
  /\ done' = done \cup {k}
  /\ visits' = IF pending[k] = gen \/ Fault = "late" THEN visits \cup {k} ELSE visits
  /\ bad' = (bad \/ (visits' # visits /\ pending[k] # gen))
  /\ fresh' = IF visits' # visits THEN FALSE ELSE fresh
  /\ UNCHANGED <<gen,pending,shown,compacted,plan>>
Switch ==
  /\ gen < 2 /\ gen' = gen+1 /\ visits' = {} /\ fresh' = FALSE
  /\ UNCHANGED <<pending,done,shown,compacted,plan,bad>>
Compact ==
  /\ ~compacted /\ compacted' = TRUE /\ fresh' = FALSE
  /\ shown' \in SUBSET shown
  /\ UNCHANGED <<gen,pending,done,visits,plan,bad>>
Prepare ==
  /\ (plan = Zero \/ ~fresh)
  /\ LET need == IF Fault = "above-root" THEN Goal \cup {Rule(gen,"outside")} ELSE Goal
         put == IF Fault = "forget" THEN need ELSE need \ shown
     IN plan' = [at |-> gen, need |-> need, put |-> put,
          copies |-> IF Fault = "parallel" /\ visits = Leaves
             THEN Cardinality(put \cap Legal(gen,{"pay"})) + Cardinality(put \cap Legal(gen,{"docs"}))
             ELSE Cardinality(put)]
  /\ fresh' = TRUE
  /\ UNCHANGED <<gen,pending,done,visits,shown,compacted,bad>>
Commit ==
  /\ plan # Zero /\ (fresh \/ Fault = "stale")
  /\ bad' = (bad \/ plan.at # gen \/ plan.need # Goal \/ plan.put # (Goal \ shown)
                \/ plan.copies # Cardinality(plan.put))
  /\ shown' = shown \cup plan.put /\ fresh' = FALSE /\ plan' = Zero
  /\ UNCHANGED <<gen,pending,done,visits,compacted>>
Next == Switch \/ Compact \/ Prepare \/ Commit \/ \E k \in Leaves : Finish(k)
Spec == Init /\ [][Next]_vars
Safety == ~bad
===============================================================================

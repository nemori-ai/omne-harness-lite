--------------------- MODULE CalendarTotalization ---------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Mutation
Dates == 1..3
VARIABLES coverageEnd, working, ordinal, initialFuel, fuel, cursor, hits, status, answer
vars == <<coverageEnd, working, ordinal, initialFuel, fuel, cursor, hits, status, answer>>
Tags == {"running", "invalid", "coverage", "limit", "found", "absent"}
CountTo(d) == Cardinality({x \in Dates : x <= d /\ x \in working})
FoundWitness(d) == /\ d \in Dates /\ d <= coverageEnd /\ d \in working
                   /\ CountTo(d) = ordinal
SemanticFound == {d \in Dates : FoundWitness(d)}
SemanticAbsent == coverageEnd = 3 /\ CountTo(3) < ordinal
Init == /\ coverageEnd \in 0..3 /\ working \in SUBSET Dates
        /\ ordinal \in 0..4 /\ initialFuel \in 0..3
        /\ fuel = initialFuel /\ cursor = 1 /\ hits = 0
        /\ status = "running" /\ answer = 0
Finish(tag, value) == /\ status' = tag /\ answer' = value
                     /\ UNCHANGED <<fuel, cursor, hits>>
Scan ==
  LET nextHits == hits + (IF cursor \in working THEN 1 ELSE 0) IN
  /\ fuel' = fuel - 1
  /\ hits' = nextHits
  /\ cursor' = cursor + 1
  /\ status' = IF nextHits = ordinal THEN "found"
               ELSE IF cursor = 3 THEN "absent"
               ELSE IF fuel = 1 THEN
                 (IF Mutation = "limit_as_absent" THEN "absent" ELSE "limit")
               ELSE "running"
  /\ answer' = IF nextHits = ordinal THEN cursor ELSE 0
Decide ==
  /\ status = "running"
  /\ IF ordinal = 0 THEN Finish("invalid", 0)
     ELSE IF cursor > coverageEnd THEN
       Finish(IF Mutation = "coverage_as_absent" THEN "absent" ELSE "coverage", 0)
     ELSE IF fuel = 0 THEN
       Finish(IF Mutation = "limit_as_absent" THEN "absent" ELSE "limit", 0)
     ELSE IF Mutation = "spin" THEN UNCHANGED <<fuel, cursor, hits, status, answer>>
     ELSE Scan
  /\ UNCHANGED <<coverageEnd, working, ordinal, initialFuel>>
Next == Decide
Spec == Init /\ [][Next]_vars /\ WF_vars(Decide)
TypeOK == /\ coverageEnd \in 0..3 /\ working \in SUBSET Dates
          /\ ordinal \in 0..4 /\ initialFuel \in 0..3
          /\ fuel \in 0..initialFuel /\ cursor \in 1..4 /\ hits \in 0..3
          /\ status \in Tags /\ answer \in 0..3
SuccessSound == status = "found" => FoundWitness(answer)
AbsenceSound == status = "absent" => SemanticAbsent
InvalidSound == (status = "invalid") => ordinal = 0
CoverageSound == status = "coverage" => ordinal > 0 /\ cursor > coverageEnd
LimitSound == status = "limit" => ordinal > 0 /\ fuel = 0
WorkAccounted == hits = Cardinality({d \in Dates : d < cursor /\ d \in working})
Terminates == <> (status # "running")
SufficientFuelComplete ==
  (ordinal > 0 /\ initialFuel = 3 /\ (SemanticFound # {} \/ SemanticAbsent))
   => <> (status = "found" \/ status = "absent")
=============================================================================

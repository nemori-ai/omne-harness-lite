-------------------------- MODULE ExecutionSlots --------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Bad
Calls == {"a","b","c"}
VARIABLES phase, holders, parkedOnce, answered
vars == <<phase,holders,parkedOnce,answered>>
Init == /\ phase = [c \in Calls |-> IF c = "a" THEN "running" ELSE "ready"]
        /\ holders = {"a"} /\ parkedOnce = FALSE /\ answered = FALSE
Park == /\ phase["a"] = "running" /\ ~parkedOnce
        /\ phase' = [phase EXCEPT !["a"] = "human"] /\ parkedOnce' = TRUE
        /\ holders' = IF Bad = "hold" THEN holders ELSE holders \ {"a"}
        /\ UNCHANGED answered
Answer == /\ phase["a"] = "human" /\ ~answered /\ answered' = TRUE
          /\ phase' = [phase EXCEPT !["a"] = IF Bad = "bypass" THEN "running" ELSE "ready"]
          /\ UNCHANGED <<holders,parkedOnce>>
Acquire(c) == /\ phase[c] = "ready" /\ (Cardinality(holders) < 1 \/ Bad = "capacity")
              /\ ~(Bad = "stall" /\ c = "a")
              /\ holders' = holders \cup {c} /\ phase' = [phase EXCEPT ![c] = "running"]
              /\ UNCHANGED <<parkedOnce,answered>>
Finish(c) == /\ phase[c] = "running" /\ (c # "a" \/ answered)
             /\ phase' = [phase EXCEPT ![c] = "done"] /\ holders' = holders \ {c}
             /\ UNCHANGED <<parkedOnce,answered>>
Next == Park \/ Answer \/ (\E c \in Calls: Acquire(c) \/ Finish(c)) \/ UNCHANGED vars
CapacityBound == Cardinality(holders) <= 1
OnlyRunningHolds == holders = {c \in Calls: phase[c] = "running"}
AnsweredIsNotHuman == answered => phase["a"] # "human"
IndependentProgress == <> (phase["b"] = "done" /\ phase["c"] = "done")
ResumeProgress == answered ~> (phase["a"] = "done")
Spec == Init /\ [][Next]_vars /\ WF_vars(Park)
        /\ (\A c \in Calls: WF_vars(Acquire(c)) /\ WF_vars(Finish(c)))
=============================================================================

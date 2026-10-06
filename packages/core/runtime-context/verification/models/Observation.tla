------------------------------ MODULE Observation ------------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS GuardAuthority, GuardGeneration, GuardPrefix, GuardHint, GuardMetadata
Scopes == {"A", "B"}
Keys == {"visible", "hidden"}
VARIABLES access, revision, generation, hint, phase, adopted, violation
vars == <<access, revision, generation, hint, phase, adopted, violation>>
Empty == [scope |-> "A", keys |-> {}, revision |-> 0, generation |-> 1, hint |-> 0]
Init == /\ access = [s \in Scopes |-> {"visible"}]
        /\ revision = [s \in Scopes |-> 0]
        /\ generation = [s \in Scopes |-> 1]
        /\ hint = [s \in Scopes |-> 0]
        /\ phase = "idle" /\ adopted = Empty /\ violation = FALSE
Start(s) == /\ phase = "idle"
            /\ phase' = "reading"
            /\ adopted' = [scope |-> s, keys |-> access[s], revision |-> revision[s],
                           generation |-> generation[s], hint |-> hint[s]]
            /\ UNCHANGED <<access, revision, generation, hint, violation>>
SetAccess(s, keys) == /\ access' = [access EXCEPT ![s] = keys]
                      /\ UNCHANGED <<revision, generation, hint, phase, adopted, violation>>
Write(s) == /\ revision[s] = 0 /\ revision' = [revision EXCEPT ![s] = 1]
            /\ UNCHANGED <<access, generation, hint, phase, adopted, violation>>
Replace(s) == /\ generation[s] = 1 /\ generation' = [generation EXCEPT ![s] = 2]
              /\ UNCHANGED <<access, revision, hint, phase, adopted, violation>>
Invalidate(s) == /\ hint[s] = 0 /\ hint' = [hint EXCEPT ![s] = 1]
                 /\ UNCHANGED <<access, revision, generation, phase, adopted, violation>>
Finish == LET s == adopted.scope
              authority == s = "A" /\ adopted.keys \subseteq access[s]
              sameGeneration == adopted.generation = generation[s]
              samePrefix == adopted.revision = revision[s]
              sameHint == adopted.hint = hint[s]
              delivered == (GuardAuthority => authority)
                           /\ (GuardGeneration => sameGeneration)
                           /\ (GuardPrefix => samePrefix)
                           /\ (GuardHint => sameHint)
              safe == authority /\ sameGeneration /\ samePrefix /\ sameHint /\ GuardMetadata
          IN /\ phase = "reading" /\ phase' = "done"
             /\ violation' = (violation \/ (delivered /\ ~safe))
             /\ UNCHANGED <<access, revision, generation, hint, adopted>>
Reset == /\ phase = "done" /\ phase' = "idle" /\ adopted' = Empty
         /\ UNCHANGED <<access, revision, generation, hint, violation>>
Next == (\E s \in Scopes : Start(s) \/ Write(s) \/ Replace(s) \/ Invalidate(s)
                           \/ (\E keys \in SUBSET Keys : SetAccess(s, keys)))
        \/ Finish \/ Reset
TypeOK == /\ access \in [Scopes -> SUBSET Keys]
          /\ revision \in [Scopes -> 0..1] /\ generation \in [Scopes -> 1..2]
          /\ hint \in [Scopes -> 0..1] /\ phase \in {"idle", "reading", "done"}
          /\ adopted.scope \in Scopes /\ adopted.keys \subseteq Keys
          /\ adopted.revision \in 0..1 /\ adopted.generation \in 1..2 /\ adopted.hint \in 0..1
          /\ violation \in BOOLEAN
NoInvalidDelivery == ~violation
Spec == Init /\ [][Next]_vars
================================================================================

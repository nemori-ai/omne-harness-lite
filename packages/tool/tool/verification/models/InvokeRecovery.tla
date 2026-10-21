-------------------------- MODULE InvokeRecovery --------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT UnsafeRecovery
Actors == {"one", "two"}
Keys == {"tenant-consumer-A", "tenant-consumer-B"}
Requests == {"original", "different"}
VARIABLES keyOf, requestOf, identity, fixed, pinned, stage, history, nextIdentity,
          phase, reference, reply, starts, healthy
vars == <<keyOf, requestOf, identity, fixed, pinned, stage, history, nextIdentity,
          phase, reference, reply, starts, healthy>>

Init == /\ keyOf \in [Actors -> Keys]
        /\ requestOf \in [Actors -> Requests]
        /\ identity = [k \in Keys |-> 0]
        /\ fixed = [k \in Keys |-> "none"]
        /\ pinned = [k \in Keys |-> "none"]
        /\ stage = [k \in Keys |-> 0]
        /\ history = [k \in Keys |-> {}]
        /\ nextIdentity = 1
        /\ phase = [a \in Actors |-> "resolve"]
        /\ reference = [a \in Actors |-> 0]
        /\ reply = [a \in Actors |-> 0]
        /\ starts = [k \in Keys |-> 0]
        /\ healthy = FALSE

Resolve(a) ==
 LET k == keyOf[a] IN
 /\ phase[a] = "resolve"
 /\ IF identity[k] = 0 \/ (UnsafeRecovery /\ ~healthy /\ nextIdentity <= 4)
       THEN /\ nextIdentity <= 4
            /\ identity' = [identity EXCEPT ![k] = nextIdentity]
            /\ fixed' = [fixed EXCEPT ![k] = requestOf[a]]
            /\ pinned' = [pinned EXCEPT ![k] = IF identity[k] = 0 THEN requestOf[a] ELSE @]
            /\ stage' = [stage EXCEPT ![k] = 1]
            /\ history' = [history EXCEPT ![k] = @ \cup {nextIdentity}]
            /\ nextIdentity' = nextIdentity + 1
            /\ phase' = [phase EXCEPT ![a] = "source"]
       ELSE /\ phase' = [phase EXCEPT ![a] = IF fixed[k] = requestOf[a] THEN "source" ELSE "conflict"]
            /\ UNCHANGED <<identity, fixed, pinned, stage, history, nextIdentity>>
 /\ UNCHANGED <<keyOf, requestOf, reference, reply, starts, healthy>>

Issue(k) == /\ stage[k] = 1
            /\ stage' = [stage EXCEPT ![k] = 2]
            /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, history,
                            nextIdentity, phase, reference, reply, starts, healthy>>
ReturnSource(a) ==
 LET k == keyOf[a] IN
 /\ phase[a] = "source" /\ stage[k] >= 2 /\ healthy
 /\ phase' = [phase EXCEPT ![a] = "admit"]
 /\ reference' = [reference EXCEPT ![a] = identity[k]]
 /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, stage, history,
                 nextIdentity, reply, starts, healthy>>
LoseSource(a) ==
 /\ phase[a] = "source" /\ ~healthy
 /\ phase' = [phase EXCEPT ![a] = "resolve"]
 /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, stage, history,
                 nextIdentity, reference, reply, starts, healthy>>
UnknownIssuance(a) ==
 LET k == keyOf[a] IN
 /\ phase[a] = "source" /\ stage[k] = 1 /\ ~healthy
 /\ phase' = [phase EXCEPT ![a] = "resolve"]
 /\ reference' = [reference EXCEPT ![a] = identity[k]]
 /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, stage, history,
                 nextIdentity, reply, starts, healthy>>
Admit(a) ==
 LET k == keyOf[a] IN
 /\ phase[a] = "admit" /\ stage[k] >= 2
 /\ stage' = [stage EXCEPT ![k] = IF @ = 2 THEN 3 ELSE @]
 /\ phase' = [phase EXCEPT ![a] = "receipt"]
 /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, history,
                 nextIdentity, reference, reply, starts, healthy>>
LoseAdmission(a) ==
 /\ phase[a] = "receipt" /\ ~healthy
 /\ phase' = [phase EXCEPT ![a] = "resolve"]
 /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, stage, history,
                 nextIdentity, reference, reply, starts, healthy>>
ReturnReceipt(a) ==
 LET k == keyOf[a] IN
 /\ phase[a] = "receipt" /\ healthy
 /\ phase' = [phase EXCEPT ![a] = "done"]
 /\ reply' = [reply EXCEPT ![a] = identity[k]]
 /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, stage, history,
                 nextIdentity, reference, starts, healthy>>
Launch(k) == /\ stage[k] = 3 /\ starts[k] = 0
             /\ starts' = [starts EXCEPT ![k] = @ + 1]
             /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, stage, history,
                             nextIdentity, phase, reference, reply, healthy>>
Settle(k) == /\ stage[k] = 3 /\ starts[k] = 1
             /\ stage' = [stage EXCEPT ![k] = 4]
             /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, history,
                             nextIdentity, phase, reference, reply, starts, healthy>>
Repeat(a) == /\ phase[a] = "done"
             /\ phase' = [phase EXCEPT ![a] = "resolve"]
             /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, stage, history,
                             nextIdentity, reference, reply, starts, healthy>>
Recover == /\ ~healthy /\ healthy' = TRUE
           /\ UNCHANGED <<keyOf, requestOf, identity, fixed, pinned, stage, history,
                           nextIdentity, phase, reference, reply, starts>>
Next == Recover \/ (\E k \in Keys: Issue(k) \/ Launch(k) \/ Settle(k))
        \/ (\E a \in Actors: Resolve(a) \/ ReturnSource(a) \/ LoseSource(a)
             \/ UnknownIssuance(a) \/ Admit(a) \/ LoseAdmission(a) \/ ReturnReceipt(a) \/ Repeat(a))
Spec == Init /\ [][Next]_vars /\ WF_vars(Recover)
        /\ (\A k \in Keys: WF_vars(Issue(k)))
        /\ (\A a \in Actors: WF_vars(Resolve(a)) /\ WF_vars(ReturnSource(a))
             /\ WF_vars(Admit(a)) /\ WF_vars(ReturnReceipt(a)))
OneIdentityPerKey == \A k \in Keys: Cardinality(history[k]) <= 1
ReturnedOriginal == \A a \in Actors:
 (reference[a] = 0 \/ reference[a] = identity[keyOf[a]]) /\
 (reply[a] = 0 \/ reply[a] = identity[keyOf[a]])
ConflictPreserves ==
 /\ \A a \in Actors: phase[a] = "conflict" =>
     fixed[keyOf[a]] # requestOf[a] /\ Cardinality(history[keyOf[a]]) = 1
 /\ \A k \in Keys: identity[k] # 0 => fixed[k] = pinned[k]
SettledDoesNotRestart == \A k \in Keys: starts[k] <= 1 /\ (stage[k] = 4 => starts[k] = 1)
PendingProgress == \A k \in Keys: (stage[k] > 0) ~> (stage[k] >= 3)
=============================================================================

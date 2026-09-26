-------------------------- MODULE UseLifecycle --------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Mutation
Calls == {1, 2}
VARIABLES selected, state, phase, actor, remote, reported, local,
          released, badAdmission
vars == <<selected, state, phase, actor, remote, reported, local,
          released, badAdmission>>
Init == /\ selected = "original" /\ state = "open"
        /\ phase = [c \in Calls |-> "idle"]
        /\ actor = [c \in Calls |-> "none"]
        /\ remote = [c \in Calls |-> "none"]
        /\ reported = [c \in Calls |-> "none"]
        /\ local = [c \in Calls |-> "none"]
        /\ released = FALSE /\ badAdmission = FALSE
InFlight == {c \in Calls : phase[c] \in {"network", "settling"}}
SwitchOutside == /\ selected = "original"
                 /\ selected' = "new"
                 /\ UNCHANGED <<state, phase, actor, remote, reported, local, released, badAdmission>>
Admit(c) == /\ phase[c] = "idle" /\ InFlight = {}
            /\ (state = "open" \/ Mutation = "late-admission")
            /\ (selected = "original" \/ Mutation = "follow-selection")
            /\ phase' = [phase EXCEPT ![c] = "network"]
            /\ actor' = [actor EXCEPT ![c] = IF Mutation = "follow-selection" THEN selected ELSE "original"]
            /\ badAdmission' = badAdmission \/ state # "open"
            /\ UNCHANGED <<selected, state, remote, reported, local, released>>
DetectChanged == /\ state = "open" /\ selected = "new"
                 /\ state' = "closing"
                 /\ UNCHANGED <<selected, phase, actor, remote, reported, local, released, badAdmission>>
Close == /\ state = "open" /\ state' = "closing"
         /\ UNCHANGED <<selected, phase, actor, remote, reported, local, released, badAdmission>>
Reply(c, r) == /\ phase[c] = "network"
               /\ phase' = [phase EXCEPT ![c] = "settling"]
               /\ remote' = [remote EXCEPT ![c] = r]
               /\ UNCHANGED <<selected, state, actor, reported, local, released, badAdmission>>
Settle(c, l) == /\ phase[c] = "settling" /\ ~released
                /\ phase' = [phase EXCEPT ![c] = "done"]
                /\ local' = [local EXCEPT ![c] = l]
                /\ reported' = [reported EXCEPT ![c] =
                     IF Mutation = "flatten" /\ l # "installed" THEN "rejected" ELSE remote[c]]
                /\ UNCHANGED <<selected, state, actor, remote, released, badAdmission>>
Dispose == /\ state = "closing"
           /\ (IF Mutation = "early-dispose" THEN ~\E c \in Calls : phase[c] = "network"
               ELSE InFlight = {})
           /\ released' = TRUE /\ state' = "closed"
           /\ UNCHANGED <<selected, phase, actor, remote, reported, local, badAdmission>>
Next == SwitchOutside \/ Close \/ DetectChanged \/ Dispose
        \/ (\E c \in Calls : Admit(c)
             \/ (\E r \in {"success", "unknown", "rejected"} : Reply(c, r))
             \/ (\E l \in {"installed", "conflict", "unconfirmed"} : Settle(c, l)))
        \/ (state = "closed" /\ UNCHANGED vars)
TypeOK == /\ selected \in {"original", "new"}
          /\ state \in {"open", "closing", "closed"}
          /\ phase \in [Calls -> {"idle", "network", "settling", "done"}]
          /\ actor \in [Calls -> {"none", "original", "new"}]
          /\ remote \in [Calls -> {"none", "success", "unknown", "rejected"}]
          /\ reported \in [Calls -> {"none", "success", "unknown", "rejected"}]
          /\ local \in [Calls -> {"none", "installed", "conflict", "unconfirmed"}]
          /\ released \in BOOLEAN /\ badAdmission \in BOOLEAN
FixedIdentity == \A c \in Calls : actor[c] \in {"none", "original"}
NoLateAdmission == ~badAdmission
NoEarlyRelease == released => InFlight = {}
RemoteTruth == \A c \in Calls : phase[c] = "done" => reported[c] = remote[c]
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)
EventuallyClosed == <>(state = "closed")
=============================================================================

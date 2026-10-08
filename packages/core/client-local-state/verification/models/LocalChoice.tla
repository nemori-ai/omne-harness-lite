--------------------------- MODULE LocalChoice ---------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Mutation
P == {"logout", "login"}
Initial == [instance |-> 0, revision |-> 0, value |-> "old"]
VARIABLES current, snapshot, phase, permitted, answer, wrote, reset,
          lastBefore, lastExpected
vars == <<current, snapshot, phase, permitted, answer, wrote, reset,
          lastBefore, lastExpected>>
Init == /\ current = Initial
        /\ snapshot = [p \in P |-> Initial]
        /\ phase = [p \in P |-> "idle"]
        /\ permitted = [p \in P |-> FALSE]
        /\ answer = [p \in P |-> "none"]
        /\ wrote = [p \in P |-> FALSE]
        /\ reset = FALSE
        /\ lastBefore = Initial /\ lastExpected = Initial
Read(p) == /\ phase[p] = "idle"
           /\ snapshot' = [snapshot EXCEPT ![p] = current]
           /\ phase' = [phase EXCEPT ![p] = "waiting"]
           /\ UNCHANGED <<current, permitted, answer, wrote, reset, lastBefore, lastExpected>>
RemoteReturn(p) == /\ phase[p] = "waiting"
                  /\ phase' = [phase EXCEPT ![p] = "ready"]
                  /\ UNCHANGED <<current, snapshot, permitted, answer, wrote, reset, lastBefore, lastExpected>>
Reset == /\ ~reset
         /\ reset' = TRUE
         /\ current' = [instance |-> 1, revision |-> 0, value |-> "reset"]
         /\ UNCHANGED <<snapshot, phase, permitted, answer, wrote, lastBefore, lastExpected>>
Compare(p) == /\ Mutation = "split" /\ phase[p] = "ready"
              /\ permitted' = [permitted EXCEPT ![p] = (snapshot[p] = current)]
              /\ phase' = [phase EXCEPT ![p] = "compared"]
              /\ UNCHANGED <<current, snapshot, answer, wrote, reset, lastBefore, lastExpected>>
Allowed(p) == IF Mutation = "split" THEN permitted[p]
              ELSE IF Mutation = "ignore-instance"
                   THEN snapshot[p].revision = current.revision
                   ELSE snapshot[p] = current
Finalize(p) ==
    /\ phase[p] = (IF Mutation = "split" THEN "compared" ELSE "ready")
    /\ IF Allowed(p)
          THEN /\ current' = [current EXCEPT !.revision = @ + 1,
                               !.value = IF p = "logout" THEN "none" ELSE "new"]
               /\ phase' = [phase EXCEPT ![p] = "committed"]
               /\ lastBefore' = current /\ lastExpected' = snapshot[p]
               /\ wrote' = [wrote EXCEPT ![p] = TRUE]
               /\ UNCHANGED answer
          ELSE /\ answer' = [answer EXCEPT ![p] = "conflict"]
               /\ phase' = [phase EXCEPT ![p] = "done"]
               /\ UNCHANGED <<current, wrote, lastBefore, lastExpected>>
    /\ UNCHANGED <<snapshot, permitted, reset>>
Report(p, reported) == /\ phase[p] = "committed"
                       /\ phase' = [phase EXCEPT ![p] = "done"]
                       /\ answer' = [answer EXCEPT ![p] = IF Mutation = "lie"
                                                           THEN "not-installed" ELSE reported]
                       /\ UNCHANGED <<current, snapshot, permitted, wrote, reset, lastBefore, lastExpected>>
Failure(p, reported) == /\ phase[p] = "ready"
                   /\ phase' = [phase EXCEPT ![p] = "done"]
                   /\ answer' = [answer EXCEPT ![p] = reported]
                   /\ UNCHANGED <<current, snapshot, permitted, wrote, reset, lastBefore, lastExpected>>
Done == \A p \in P : phase[p] = "done"
Next == Reset \/ (\E p \in P : Read(p) \/ RemoteReturn(p) \/ Compare(p) \/ Finalize(p)
                 \/ (\E a \in {"installed", "unconfirmed"} : Report(p, a))
                 \/ (\E a \in {"not-installed", "unconfirmed"} : Failure(p, a)))
        \/ (Done /\ UNCHANGED vars)
Record == [instance : 0..1, revision : 0..2, value : {"old", "new", "none", "reset"}]
TypeOK == /\ current \in Record /\ snapshot \in [P -> Record]
          /\ phase \in [P -> {"idle", "waiting", "ready", "compared", "committed", "done"}]
          /\ permitted \in [P -> BOOLEAN] /\ wrote \in [P -> BOOLEAN]
          /\ answer \in [P -> {"none", "installed", "unconfirmed", "not-installed", "conflict"}]
          /\ reset \in BOOLEAN /\ lastBefore \in Record /\ lastExpected \in Record
NoStaleOverwrite == lastBefore = lastExpected
NoForeignSnapshot == lastBefore.instance = lastExpected.instance
NoFalseNoChange == \A p \in P : answer[p] = "not-installed" => ~wrote[p]
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)
EventuallyDone == <>Done
=============================================================================

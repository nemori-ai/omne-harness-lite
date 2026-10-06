--------------------------- MODULE SessionWork ---------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS Inputs, Runs, Calls, MaxAttempt, AtomicAccept, FenceIssue, CheckFinish
VARIABLES admitted, pending, adopted, active, created, terminal, attempt,
          alive, issued, settled, badIssue, badFinish, notice
vars == <<admitted,pending,adopted,active,created,terminal,attempt,alive,
          issued,settled,badIssue,badFinish,notice>>
Init == /\ admitted = {} /\ pending = {}
        /\ adopted = [i \in Inputs |-> 0]
        /\ active = 0 /\ created = {} /\ terminal = {}
        /\ attempt = [r \in Runs |-> 0] /\ alive = FALSE
        /\ issued = [c \in Calls |-> [run |-> 0, a |-> 0]]
        /\ settled = {} /\ badIssue = FALSE /\ badFinish = FALSE
        /\ notice = FALSE
Accept(i) == /\ i \notin admitted
             /\ admitted' = admitted \cup {i}
             /\ pending' = IF AtomicAccept THEN pending \cup {i} ELSE pending
             /\ UNCHANGED <<adopted,active,created,terminal,attempt,alive,
                             issued,settled,badIssue,badFinish,notice>>
Begin(r) == /\ active = 0 /\ pending # {} /\ r \notin created
            /\ active' = r /\ created' = created \cup {r}
            /\ adopted' = [i \in Inputs |-> IF i \in pending THEN r ELSE adopted[i]]
            /\ pending' = {} /\ notice' = FALSE
            /\ UNCHANGED <<admitted,terminal,attempt,alive,issued,settled,
                            badIssue,badFinish>>
Adopt == /\ active # 0 /\ active \notin terminal /\ pending # {}
         /\ adopted' = [i \in Inputs |-> IF i \in pending THEN active ELSE adopted[i]]
         /\ pending' = {} /\ notice' = FALSE
         /\ UNCHANGED <<admitted,active,created,terminal,attempt,alive,
                         issued,settled,badIssue,badFinish>>
StartAttempt == /\ active # 0 /\ active \notin terminal /\ ~alive
                /\ attempt[active] < MaxAttempt
                /\ attempt' = [attempt EXCEPT ![active] = @ + 1]
                /\ alive' = TRUE
                /\ UNCHANGED <<admitted,pending,adopted,active,created,terminal,
                                issued,settled,badIssue,badFinish,notice>>
Issue(c,a) == /\ active # 0 /\ active \notin terminal /\ alive
              /\ issued[c].run = 0 /\ a > 0 /\ a <= attempt[active]
              /\ (FenceIssue => a = attempt[active])
              /\ issued' = [issued EXCEPT ![c] = [run |-> active, a |-> a]]
              /\ badIssue' = (badIssue \/ a # attempt[active])
              /\ UNCHANGED <<admitted,pending,adopted,active,created,terminal,
                              attempt,alive,settled,badFinish,notice>>
Settle(c) == /\ issued[c].run # 0 /\ c \notin settled
             /\ settled' = settled \cup {c}
             /\ UNCHANGED <<admitted,pending,adopted,active,created,terminal,
                             attempt,alive,issued,badIssue,badFinish,notice>>
Finish == /\ active # 0 /\ (CheckFinish => pending = {})
          /\ terminal' = terminal \cup {active} /\ active' = 0 /\ alive' = FALSE
          /\ badFinish' = (badFinish \/ pending # {})
          /\ UNCHANGED <<admitted,pending,adopted,created,attempt,issued,settled,
                          badIssue,notice>>
Cancel == /\ active # 0 /\ terminal' = terminal \cup {active}
          /\ active' = 0 /\ alive' = FALSE
          /\ UNCHANGED <<admitted,pending,adopted,created,attempt,issued,settled,
                          badIssue,badFinish,notice>>
LoseAgent == /\ alive /\ alive' = FALSE
             /\ UNCHANGED <<admitted,pending,adopted,active,created,terminal,
                             attempt,issued,settled,badIssue,badFinish,notice>>
Signal == /\ notice' = ~notice
          /\ UNCHANGED <<admitted,pending,adopted,active,created,terminal,
                          attempt,alive,issued,settled,badIssue,badFinish>>
StartOrAdopt == (\E r \in Runs: Begin(r)) \/ Adopt
Next == (\E i \in Inputs: Accept(i)) \/ StartOrAdopt \/ StartAttempt
        \/ (\E c \in Calls, a \in 1..MaxAttempt: Issue(c,a))
        \/ (\E c \in Calls: Settle(c)) \/ Finish \/ Cancel \/ LoseAgent \/ Signal
Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(StartOrAdopt)
AdmissionConserved == admitted = pending \cup {i \in Inputs: adopted[i] # 0}
SingleActive == active = 0 \/ (active \in created /\ active \notin terminal)
NoOldIssue == ~badIssue
NoStaleFinish == ~badFinish
ResultsAttributed == \A c \in settled: issued[c].run \in created
WorkEventuallyClaimed == \A i \in Inputs: [](i \in pending => <>(i \notin pending))
=============================================================================

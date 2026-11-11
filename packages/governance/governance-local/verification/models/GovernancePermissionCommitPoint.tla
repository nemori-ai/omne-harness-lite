------------------------ MODULE GovernancePermissionCommitPoint ------------------------
(* A permission check is a pure read. The action commit verifies, in its own transaction,
   that the tenant-domain facts of the decision are still the ones that were read.

   f      a tenant-domain permission fact (Session assignment, Governance adoption, Settings
          value, Tool record): it has a revision, and its writers and the action commit share
          one transaction domain.
   g      a fact of another domain (Identity standing, organization-layer value): the action
          commit cannot read it in its transaction.
   exec   the execution revision of the Agent. The Agent advances it by its own progress
          commits. It is the provenance of the question, not a permission fact.            *)
EXTENDS Naturals
CONSTANT Bad
Actions == {"a1", "a2"}
MaxChange == 1
VARIABLES f, g, exec, pc, obsF, obsG, obsExec, startG, ledger, ops, gCache

vars == <<f, g, exec, pc, obsF, obsG, obsExec, startG, ledger, ops, gCache>>
NoObs == [rev |-> 0, allow |-> FALSE, ok |-> FALSE, real |-> FALSE]
Terminal == {"committed", "denied", "unavailable"}

Init ==
  /\ f = [rev |-> 0, allow |-> TRUE]
  /\ g = [rev |-> 0, allow |-> TRUE]
  /\ exec = 0
  /\ pc = [a \in Actions |-> "idle"]
  /\ obsF = [a \in Actions |-> NoObs]
  /\ obsG = [a \in Actions |-> NoObs]
  /\ obsExec = [a \in Actions |-> 0]
  /\ startG = [a \in Actions |-> 0]
  /\ ledger = [a \in Actions |-> NoObs]
  /\ ops = 0
  /\ gCache = [rev |-> 0, allow |-> TRUE]

\* Writers of the permission facts. Each is bounded, so the facts become stable.
ChangeF ==
  /\ f.rev < MaxChange
  /\ \E v \in BOOLEAN: f' = [rev |-> f.rev + 1, allow |-> v]
  /\ UNCHANGED <<g, exec, pc, obsF, obsG, obsExec, startG, ledger, ops, gCache>>
ChangeG ==
  /\ g.rev < MaxChange
  /\ \E v \in BOOLEAN: g' = [rev |-> g.rev + 1, allow |-> v]
  /\ UNCHANGED <<f, exec, pc, obsF, obsG, obsExec, startG, ledger, ops, gCache>>
\* The Agent commits its own progress (the other actions of the batch). Always enabled.
Progress ==
  /\ exec' = (exec + 1) % 2
  /\ UNCHANGED <<f, g, pc, obsF, obsG, obsExec, startG, ledger, ops, gCache>>

\* The read: three steps that are not atomic with each other.
Start(a) ==
  /\ pc[a] = "idle"
  /\ pc' = [pc EXCEPT ![a] = "reading"]
  /\ startG' = [startG EXCEPT ![a] = g.rev]
  /\ obsExec' = [obsExec EXCEPT ![a] = exec]
  /\ obsF' = [obsF EXCEPT ![a] = NoObs]
  /\ obsG' = [obsG EXCEPT ![a] = NoObs]
  /\ ops' = IF Bad = "read-writes" THEN 1 ELSE ops
  /\ UNCHANGED <<f, g, exec, ledger, gCache>>
ReadF(a) ==
  /\ pc[a] = "reading" /\ ~obsF[a].ok
  /\ obsF' = [obsF EXCEPT ![a] = [rev |-> f.rev, allow |-> f.allow, ok |-> TRUE, real |-> TRUE]]
  /\ UNCHANGED <<f, g, exec, pc, obsG, obsExec, startG, ledger, ops, gCache>>
ReadG(a) ==
  /\ pc[a] = "reading" /\ ~obsG[a].ok
  /\ \/ LET src == IF Bad = "cache-g" THEN gCache ELSE g
        IN /\ obsG' = [obsG EXCEPT ![a] =
                 [rev |-> src.rev, allow |-> src.allow, ok |-> TRUE, real |-> TRUE]]
           /\ gCache' = g
           /\ pc' = pc
     \/ \* the other domain does not answer
        /\ gCache' = gCache
        /\ IF Bad = "unavailable-allows"
           THEN /\ obsG' = [obsG EXCEPT ![a] =
                      [rev |-> g.rev, allow |-> TRUE, ok |-> TRUE, real |-> FALSE]]
                /\ pc' = pc
           ELSE /\ obsG' = obsG
                /\ pc' = [pc EXCEPT ![a] = "unavailable"]
  /\ UNCHANGED <<f, g, exec, obsF, obsExec, startG, ledger, ops>>
Decide(a) ==
  /\ pc[a] = "reading" /\ obsF[a].ok /\ obsG[a].ok
  /\ pc' = [pc EXCEPT ![a] = IF obsF[a].allow /\ obsG[a].allow THEN "ready" ELSE "denied"]
  /\ UNCHANGED <<f, g, exec, obsF, obsG, obsExec, startG, ledger, ops, gCache>>

\* The action commit. One transaction of the tenant domain: it reads f and writes the action.
Verified(a) ==
  \/ Bad = "no-verify"
  \/ /\ f.rev = obsF[a].rev
     /\ (Bad # "verify-exec" \/ exec = obsExec[a])
Commit(a) ==
  /\ pc[a] = "ready"
  /\ IF Verified(a)
     THEN /\ pc' = [pc EXCEPT ![a] = "committed"]
          /\ ledger' = [ledger EXCEPT ![a] =
                 [rev |-> f.rev, allow |-> f.allow, ok |-> TRUE, real |-> TRUE]]
     ELSE /\ pc' = [pc EXCEPT ![a] = "idle"]   \* read again and decide again
          /\ ledger' = ledger
  /\ UNCHANGED <<f, g, exec, obsF, obsG, obsExec, startG, ops, gCache>>

ReadStep(a) == Start(a) \/ ReadF(a) \/ ReadG(a) \/ Decide(a)
Next == ChangeF \/ ChangeG \/ Progress \/ \E a \in Actions: ReadStep(a) \/ Commit(a)
Fairness ==
  /\ WF_vars(Progress)
  /\ \A a \in Actions:
       WF_vars(Start(a)) /\ WF_vars(ReadF(a)) /\ WF_vars(ReadG(a)) /\ WF_vars(Decide(a)) /\
       WF_vars(Commit(a))
Spec == Init /\ [][Next]_vars /\ Fairness

\* P1: an action commits only when the tenant-domain fact allows it at the commit instant.
CommitUsesCurrentFact == \A a \in Actions: pc[a] = "committed" => ledger[a].allow
\* P2: a change of the other domain that completed before the read started is in the decision.
OtherDomainIsFreshAtRead == \A a \in Actions: obsG[a].ok => obsG[a].rev >= startG[a]
\* I-6: a fact that could not be read never permits a commit.
UnreadFactNeverPermits == \A a \in Actions: pc[a] = "committed" => obsG[a].real /\ obsG[a].allow
\* P4: a read leaves no durable record. Only a read step can change ops; the read steps keep
\* the other durable variables unchanged by their definitions.
ReadLeavesNoTrace == ops = 0
\* P3: every check ends; the Agent's own progress does not starve the commit.
EveryCheckEnds == \A a \in Actions: <>(pc[a] \in Terminal)
=============================================================================

-------------------- MODULE SettingsIntentAttempts --------------------
EXTENDS Integers, Sequences, TLC
CONSTANT Bad
VARIABLE x
vars == <<x>>
Limit == 2
Ids == 1..(Limit + 1)
Active == x.active # 0
Terminal == x.root \in {"committed", "aborted"}
Init == \E sourceUpdate \in BOOLEAN:
  x = [root |-> "absent", command |-> "none", original |-> "none",
       active |-> 0, issued |-> 0, attempts |-> [i \in Ids |-> "absent"],
       basis |-> 0, preparedBasis |-> [i \in Ids |-> 0], effects |-> 0,
       sourceUpdate |-> sourceUpdate, drift |-> FALSE, revived |-> FALSE,
       overlapped |-> FALSE, staleEffect |-> FALSE, queriedMutation |-> FALSE,
       wrongAbort |-> FALSE, unclosedSource |-> FALSE, overflow |-> FALSE]
Prepare(command) ==
  /\ command \in {"a", "b"}
  /\ x.root \in {"absent", "pending"} \/ (Terminal /\ Bad = "revive-root")
  /\ ~Active \/ Bad = "replace-live"
  /\ x.issued < Limit + 1
  /\ x.issued < Limit \/ Bad = "ignore-limit"
  /\ x.command = "none" \/ x.command = command \/ Bad = "change-command"
  /\ LET n == x.issued + 1
     IN x' = [x EXCEPT !.root = "pending", !.command = command,
          !.original = IF @ = "none" THEN command ELSE @,
          !.active = n, !.issued = n, !.attempts[n] = "prepared",
          !.preparedBasis[n] = x.basis,
          !.drift = @ \/ (x.original # "none" /\ command # x.original),
          !.revived = @ \/ Terminal, !.overlapped = @ \/ Active,
          !.overflow = @ \/ n > Limit]
Submit ==
  /\ x.root = "pending" /\ Active /\ x.attempts[x.active] = "prepared"
  /\ x' = [x EXCEPT !.attempts[x.active] = "submitted"]
RefreshBasis ==
  /\ x.basis = 0
  /\ x' = [x EXCEPT !.basis = 1]
Commit(i) ==
  /\ i \in Ids /\ x.root = "pending"
  /\ x.attempts[i] \in {"prepared", "submitted", "aborted"}
  /\ (i = x.active /\ x.attempts[i] \in {"prepared", "submitted"}) \/ Bad = "late-attempt"
  /\ x.preparedBasis[i] = x.basis \/ Bad = "ignore-basis"
  /\ x' = [x EXCEPT !.root = "committed", !.active = 0,
       !.attempts[i] = "committed", !.effects = @ + 1,
       !.staleEffect = @ \/ i # x.active \/ x.preparedBasis[i] # x.basis]
SealAttempt ==
  /\ x.root = "pending" /\ Active
  /\ LET closeRoot == (x.sourceUpdate /\ Bad # "keep-source-root") \/ Bad = "abort-ordinary-root"
     IN x' = [x EXCEPT !.attempts[x.active] = "aborted", !.active = 0,
          !.root = IF closeRoot THEN "aborted" ELSE "pending",
          !.wrongAbort = @ \/ (~x.sourceUpdate /\ closeRoot),
          !.unclosedSource = @ \/ (x.sourceUpdate /\ ~closeRoot)]
Cancel ==
  /\ x.root = "pending"
  /\ x' = [x EXCEPT !.root = "aborted", !.active = 0,
       !.attempts = IF Active THEN [@ EXCEPT ![x.active] = "aborted"] ELSE @]
Query ==
  /\ x.root = "pending"
  /\ x' = IF Bad = "query-cancels"
       THEN [x EXCEPT !.root = "aborted", !.queriedMutation = TRUE]
       ELSE x
Next == (\E command \in {"a", "b"}: Prepare(command)) \/ Submit \/ RefreshBasis \/
        (\E i \in Ids: Commit(i)) \/ SealAttempt \/ Cancel \/ Query \/ UNCHANGED x
Spec == Init /\ [][Next]_vars
ImmutableCommand == ~x.drift
TerminalRootCannotRevive == ~x.revived
AtMostOneActiveAttempt == ~x.overlapped
OnlyCurrentAttemptCommits == ~x.staleEffect
OneBusinessEffect == x.effects <= 1
QueryIsReadOnly == ~x.queriedMutation
OrdinarySealKeepsPendingRoot == ~x.wrongAbort
SourceSealTerminatesRoot == ~x.unclosedSource
AttemptBudgetIsBounded == ~x.overflow
=============================================================================

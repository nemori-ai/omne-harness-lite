------------------------ MODULE GovernanceLifecycle ------------------------
EXTENDS Integers, FiniteSets, TLC
CONSTANT Bad
VARIABLE x
vars == <<x>>
Tokens(g) == {<<g,1>>, <<g,2>>}
Active == x.leases \cap Tokens(x.generation)
Available == Active # {} /\ x.holding
Compatible == x.origin = "original" /\ x.definition = "compatible"
Init == x = [generation |-> 1, leases |-> {}, released |-> {}, closed |-> FALSE,
  origin |-> "original", definition |-> "compatible", revision |-> 0,
  value |-> 0, durableValue |-> 0, receipt |-> FALSE, recordedReceipt |-> FALSE,
  adoptedValue |-> -1,
  revoked |-> FALSE, revokedEver |-> FALSE, uses |-> 0, recordedUses |-> 0,
  sessionLive |-> TRUE, ended |-> FALSE, holding |-> TRUE,
  prepared |-> FALSE, preparedGeneration |-> 0, preparedRevision |-> 0, preparedLeases |-> {},
  scope |-> "own", committed |-> FALSE,
  ghost |-> FALSE, siblingLoss |-> FALSE, staleRelease |-> FALSE,
  badScope |-> FALSE, staleCommit |-> FALSE, transferred |-> FALSE,
  incompatible |-> FALSE, registeredDigest |-> 1, canonicalDigest |-> 1]

Register(i) ==
  /\ ~x.closed /\ <<x.generation,i>> \notin x.leases \cup x.released
  /\ x' = [x EXCEPT !.leases = @ \cup {<<x.generation,i>>}]

Release(g,i) ==
  LET token == <<g,i>>
      after == IF Bad = "siblings" /\ token \in x.leases THEN {}
               ELSE IF Bad = "old-token" /\ g # x.generation
                    THEN x.leases \ {<<x.generation,i>>}
                    ELSE x.leases \ {token}
  IN /\ token \in x.leases \/ (g = 1 /\ x.generation = 2)
     /\ x' = [x EXCEPT !.leases = after, !.released = @ \cup {token},
          !.siblingLoss = @ \/ ~((x.leases \ {token}) \subseteq after),
          !.staleRelease = @ \/ (g # x.generation /\ after # x.leases)]

Close == /\ ~x.closed
         /\ x' = [x EXCEPT !.closed = TRUE, !.leases = {}, !.revision = 1,
                  !.value = IF Bad = "erase" THEN -1 ELSE @,
                  !.receipt = IF Bad = "erase-receipt" THEN FALSE ELSE @]

Rebind(o,d) ==
  /\ x.closed /\ x.generation = 1
  /\ x' = [x EXCEPT !.generation = 2, !.closed = FALSE, !.origin = o,
       !.definition = d, !.leases = {}, !.released = {},
       !.revoked = IF Bad = "revive" THEN FALSE ELSE @,
       !.uses = IF Bad = "reset-use" THEN 0 ELSE @,
       !.sessionLive = IF Bad = "revive-session" THEN TRUE ELSE @]

Revoke == /\ ~x.revokedEver
          /\ x' = [x EXCEPT !.revoked = TRUE, !.revokedEver = TRUE]
EndSession == /\ ~x.ended
              /\ x' = [x EXCEPT !.sessionLive = FALSE, !.ended = TRUE]
RemoveHolding == /\ x.holding /\ x' = [x EXCEPT !.holding = FALSE]

Catalog(t) ==
  LET visible == (Available /\ t = "own") \/ Bad = "ghost"
  IN x' = [x EXCEPT !.ghost = @ \/ (visible /\ ~(Available /\ t = "own"))]

Prepare(t) ==
  /\ Available /\ ~x.committed
  /\ (~x.prepared \/ x.preparedGeneration # x.generation
      \/ x.preparedRevision # x.revision \/ x.preparedLeases # Active)
  /\ x' = [x EXCEPT !.prepared = TRUE, !.preparedGeneration = x.generation,
       !.preparedRevision = x.revision, !.preparedLeases = Active, !.scope = t]

Current == Available /\ x.preparedGeneration = x.generation
           /\ x.preparedRevision = x.revision /\ x.preparedLeases = Active
Commit ==
  /\ x.prepared /\ ~x.committed
  /\ (Current \/ Bad = "stale-commit")
  /\ (x.scope = "own" \/ Bad = "scope")
  /\ (x.origin = "original" \/ Bad = "transfer")
  /\ (x.definition = "compatible" \/ Bad = "incompatible")
  /\ x' = [x EXCEPT !.value = 1, !.durableValue = 1, !.receipt = TRUE,
       !.recordedReceipt = TRUE,
       !.committed = TRUE, !.badScope = @ \/ x.scope # "own",
       !.staleCommit = @ \/ ~Current,
       !.transferred = @ \/ x.origin # "original",
       !.incompatible = @ \/ x.definition # "compatible"]

Collision ==
  /\ Available
  /\ x' = [x EXCEPT !.registeredDigest = IF Bad = "collision" THEN 2 ELSE @]

Ready == Available /\ Compatible /\ ~x.revoked /\ x.sessionLive /\ x.uses = 0
Consume ==
  /\ Available /\ Compatible /\ ~x.revoked /\ x.sessionLive
  /\ (x.uses = 0 \/ (Bad = "once" /\ x.uses < 2))
  /\ Bad # "stall"
  /\ x' = [x EXCEPT !.uses = @ + 1, !.recordedUses = @ + 1]

SettingReady == Available /\ Compatible /\ x.adoptedValue # x.value
AdoptSaved == /\ SettingReady /\ Bad # "stall-setting"
             /\ x' = [x EXCEPT !.adoptedValue = x.value]

Next == (\E i \in {1,2}: Register(i))
  \/ (\E g \in {1,2}, i \in {1,2}: Release(g,i))
  \/ Close \/ (\E o \in {"original","replacement"},
                 d \in {"compatible","changed"}: Rebind(o,d))
  \/ Revoke \/ EndSession \/ RemoveHolding
  \/ (\E t \in {"own","foreign-tenant","other-service"}: Catalog(t) \/ Prepare(t))
  \/ Commit \/ Collision \/ Consume \/ AdoptSaved

CatalogCurrent == ~x.ghost
OtherContributionsPreserved == ~x.siblingLoss
OldTokenFenced == ~x.staleRelease
DurableCustody == x.value = x.durableValue /\ (x.receipt => x.durableValue = 1)
ReceiptPreserved == x.receipt = x.recordedReceipt
NoRevival == x.revokedEver => x.revoked
ConsumptionPreserved == x.uses = x.recordedUses
SessionTerminal == x.ended => ~x.sessionLive
ScopeBound == ~x.badScope
CurrentCommit == ~x.staleCommit
NoTransfer == ~x.transferred
DefinitionCompatible == ~x.incompatible
ImmutableDefinition == x.registeredDigest = x.canonicalDigest
OnceOnly == x.recordedUses <= 1
RecoveryProgress == [](Ready => <>(x.uses = 1 \/ ~Ready))
SettingRecoveryProgress == [](SettingReady => <>(~SettingReady))
CanReprepare == (Available /\ Compatible /\ ~x.committed /\ x.scope = "own")
               => (Current \/ ENABLED Prepare("own"))
Spec == Init /\ [][Next]_vars /\ WF_vars(Consume) /\ WF_vars(AdoptSaved)
=============================================================================

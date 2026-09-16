----------------------- MODULE AccountRegistration -----------------------
EXTENDS Naturals, FiniteSets

CONSTANTS Users, Targets, Workers
ASSUME /\ Users # {} /\ Targets # {} /\ Workers # {}
       /\ "none" \notin (Users \cup Targets \cup Workers)

VARIABLE s
vars == <<s>>

Init == s = [user |-> "none", target |-> "none", identities |-> {},
             owners |-> {}, stable |-> FALSE, success |-> FALSE,
             accountDisk |-> 0, accountPublished |-> 0,
             accountFlight |-> 0, accountUnknown |-> FALSE,
             tenantLogical |-> {}, tenantDisk |-> {}, tenantPublished |-> {},
             tenantFlight |-> FALSE, tenantUnknown |-> FALSE,
             tenantBlocked |-> FALSE, baselineReady |-> FALSE,
             tenantOpen |-> TRUE,
             knownAccount |-> 0, knownTenant |-> FALSE]

HasOwner == s.owners # {}
HasIntent == s.user # "none"
TenantReady == s.tenantPublished = {s.target}
ActivationReady == /\ s.accountPublished = 1 /\ s.knownAccount = 1
                   /\ TenantReady /\ s.knownTenant /\ s.tenantOpen

\* The durable original-operation intent is abstracted as one atomic write.
\* A retry reads this intent; neither digest nor target can be replaced.
Allocate == /\ HasOwner /\ ~HasIntent
            /\ \E u \in Users, t \in Targets :
                 s' = [s EXCEPT !.user = u, !.target = t,
                        !.identities = @ \cup {<<u, t>>}]

Acquire == /\ ~HasOwner
           /\ \E w \in Workers : s' = [s EXCEPT !.owners = {w}]

\* Crashing revokes the previous coordinator's permit. Reacquisition is fenced.
\* Owner records/intent survive; volatile observations do not.
Crash == /\ ~s.stable /\ HasOwner
         /\ s' = [s EXCEPT !.owners = {}, !.knownAccount = 0,
                  !.knownTenant = FALSE,
                  !.accountUnknown = @ \/ s.accountFlight # 0,
                  !.tenantUnknown = @ \/ s.tenantFlight]

Stabilize == /\ ~s.stable /\ s' = [s EXCEPT !.stable = TRUE]

Query == /\ HasOwner /\ HasIntent
         /\ s' = [s EXCEPT !.knownAccount = s.accountPublished,
                  !.knownTenant = TenantReady]

\* A temporary not_seen / lost reply never releases an unresolved reservation.
LoseReceipt == /\ ~s.stable /\ HasIntent
               /\ s' = [s EXCEPT !.knownAccount = 0, !.knownTenant = FALSE]

SubmitIdentity == /\ HasOwner /\ HasIntent
                  /\ s.accountPublished = 0 /\ s.accountFlight = 0
                  /\ s' = [s EXCEPT !.accountFlight = 1]

SubmitActive == /\ HasOwner /\ ActivationReady /\ s.accountFlight = 0
                /\ s' = [s EXCEPT !.accountFlight = 2]

\* A complete credential/account record reaches disk separately from publication.
FinishAccount == /\ s.accountFlight # 0 /\ ~s.accountUnknown
                 /\ s.accountDisk < s.accountFlight
                 /\ s' = [s EXCEPT !.accountDisk = s.accountFlight]

UnknownAccount == /\ ~s.stable /\ s.accountFlight # 0
                  /\ ~s.accountUnknown
                  /\ \E written \in BOOLEAN :
                       s' = [s EXCEPT !.accountUnknown = TRUE,
                              !.accountDisk = IF written THEN s.accountFlight
                                              ELSE s.accountDisk]

\* This is NOT an ordinary lookup. It abstracts exclusive full-prefix recovery,
\* fencing of old writes, sync, and proof of absence before releasing a slot.
RecoverAccount == /\ HasOwner /\ s.stable /\ s.accountUnknown
                  /\ s' = [s EXCEPT !.accountUnknown = FALSE,
                           !.accountFlight = IF s.accountDisk = s.accountFlight
                                             THEN s.accountFlight ELSE 0]

PublishAccount == /\ HasOwner /\ ~s.accountUnknown
                  /\ s.accountFlight # 0 /\ s.accountDisk = s.accountFlight
                  /\ s' = [s EXCEPT !.accountPublished = s.accountDisk,
                           !.accountFlight = 0]

\* Tenant and sole owner membership are a single record/batch, per TG-01.
\* Logical claim blocks conflicting creators but is not a positive grant.
SubmitTenant == /\ HasOwner /\ s.accountPublished = 1
                /\ s.knownAccount = 1 /\ ~s.tenantFlight
                /\ s.tenantLogical = {} /\ s.tenantDisk = {}
                /\ s' = [s EXCEPT !.tenantLogical = {s.target},
                         !.tenantFlight = TRUE]

FinishTenant == /\ s.tenantFlight /\ ~s.tenantUnknown
                /\ s.tenantDisk = {}
                /\ s' = [s EXCEPT !.tenantDisk = s.tenantLogical]

UnknownTenant == /\ ~s.stable /\ s.tenantFlight /\ ~s.tenantUnknown
                 /\ \E written \in BOOLEAN :
                      s' = [s EXCEPT !.tenantUnknown = TRUE,
                             !.tenantDisk = IF written THEN s.tenantLogical
                                            ELSE s.tenantDisk]

RecoverTenant == /\ HasOwner /\ s.stable /\ s.tenantUnknown
                 /\ s' = [s EXCEPT !.tenantUnknown = FALSE,
                          !.tenantFlight = s.tenantDisk # {},
                          !.tenantLogical = s.tenantDisk]

PublishTenant == /\ HasOwner /\ ~s.tenantUnknown /\ s.tenantFlight
                 /\ ~s.tenantBlocked
                 /\ s.tenantDisk = {s.target}
                 /\ s' = [s EXCEPT !.tenantPublished = s.tenantDisk,
                          !.tenantFlight = FALSE]

\* The old completion is permanently blocked. A normal retry cannot publish it.
BlockPublication == /\ ~s.stable /\ HasOwner /\ s.tenantFlight
                    /\ ~s.tenantUnknown /\ s.tenantDisk = {s.target}
                    /\ s' = [s EXCEPT !.tenantBlocked = TRUE,
                             !.tenantFlight = FALSE]

\* Abstract CC-06 gate: exclusive verified prefix, complete owner roots,
\* settled old responsibilities and new writer/generation are prerequisites.
\* The new baseline proves consumability; it does not rewrite the old completion.
RecoverBaseline == /\ HasOwner /\ s.stable /\ s.tenantBlocked
                   /\ ~s.baselineReady /\ s.tenantDisk = {s.target}
                   /\ s' = [s EXCEPT !.baselineReady = TRUE,
                            !.tenantPublished = s.tenantDisk]

\* Historical registration does not reopen a subsequently closed tenant.
CloseTenant == /\ s.accountPublished = 2 /\ s.tenantOpen
               /\ s' = [s EXCEPT !.tenantOpen = FALSE]

ReturnSuccess == /\ HasOwner /\ s.knownAccount = 2
                 /\ s.accountPublished = 2 /\ TenantReady
                 /\ s' = [s EXCEPT !.success = TRUE]

\* Same-key/same-digest retry and wrong-digest rejection have no owner mutation.
\* Digest normalization/credential collisions are provider conformance obligations.
RetryOrReject == /\ HasOwner /\ HasIntent /\ UNCHANGED s

Next == Allocate \/ Acquire \/ Crash \/ Stabilize \/ Query \/ LoseReceipt
        \/ SubmitIdentity \/ SubmitActive \/ FinishAccount \/ UnknownAccount
        \/ RecoverAccount \/ PublishAccount \/ SubmitTenant \/ FinishTenant
        \/ UnknownTenant \/ RecoverTenant \/ PublishTenant \/ ReturnSuccess
        \/ BlockPublication \/ RecoverBaseline \/ CloseTenant \/ RetryOrReject

Spec == Init /\ [][Next]_vars

\* Eventually the backends are recoverable, crashes/receipt loss stop, and each
\* continuously enabled owner/recovery/query step is scheduled fairly.
FairSpec == Spec /\ WF_vars(Stabilize) /\ WF_vars(Acquire)
            /\ WF_vars(Allocate) /\ WF_vars(Query)
            /\ WF_vars(SubmitIdentity) /\ WF_vars(SubmitActive)
            /\ WF_vars(FinishAccount) /\ WF_vars(RecoverAccount)
            /\ WF_vars(PublishAccount) /\ WF_vars(SubmitTenant)
            /\ WF_vars(FinishTenant) /\ WF_vars(RecoverTenant)
            /\ WF_vars(PublishTenant) /\ WF_vars(ReturnSuccess)
            /\ WF_vars(RecoverBaseline)

TypeOK == /\ s.user \in Users \cup {"none"}
          /\ s.target \in Targets \cup {"none"}
          /\ s.identities \subseteq (Users \X Targets)
          /\ s.owners \subseteq Workers
          /\ s.stable \in BOOLEAN /\ s.success \in BOOLEAN
          /\ s.accountDisk \in 0..2 /\ s.accountPublished \in 0..2
          /\ s.accountFlight \in 0..2 /\ s.accountUnknown \in BOOLEAN
          /\ s.tenantLogical \subseteq Targets
          /\ s.tenantDisk \subseteq Targets /\ s.tenantPublished \subseteq Targets
          /\ s.tenantFlight \in BOOLEAN /\ s.tenantUnknown \in BOOLEAN
          /\ s.tenantBlocked \in BOOLEAN /\ s.baselineReady \in BOOLEAN
          /\ s.tenantOpen \in BOOLEAN
          /\ s.knownAccount \in 0..2 /\ s.knownTenant \in BOOLEAN

OneCoordinator == Cardinality(s.owners) <= 1
StableIdentity == /\ Cardinality(s.identities) <= 1
                  /\ HasIntent => <<s.user, s.target>> \in s.identities
OnePersonalTenant == /\ Cardinality(s.tenantLogical) <= 1
                     /\ Cardinality(s.tenantDisk) <= 1
                     /\ Cardinality(s.tenantPublished) <= 1
SameTarget == /\ s.tenantLogical \subseteq {s.target}
              /\ s.tenantDisk \subseteq {s.target}
              /\ s.tenantPublished \subseteq {s.target}
PublicationSound == /\ s.accountPublished <= s.accountDisk
                    /\ s.tenantPublished \subseteq s.tenantDisk
                    /\ s.tenantDisk \subseteq s.tenantLogical
NoEarlyActive == s.accountDisk = 2 =>
                 /\ TenantReady /\ s.tenantDisk = {s.target}
NoFalseSuccess == s.success => /\ s.accountPublished = 2 /\ TenantReady
NoBlockedActivation == (s.tenantBlocked /\ ~s.baselineReady) =>
                         s.accountDisk < 2
RecoveredPublication == (s.tenantBlocked /\ TenantReady) => s.baselineReady
NoUnknownRelease == /\ s.accountUnknown => s.accountFlight # 0
                    /\ s.tenantUnknown =>
                        /\ s.tenantFlight /\ s.tenantLogical = {s.target}
EventuallySuccess == <>s.success

\* Reachability probes: their intentional failure supplies concrete witnesses.
NoLogicalOnly == ~(s.tenantLogical # {} /\ s.tenantDisk = {})
NoDurableUnpublished == ~(s.tenantDisk # {} /\ s.tenantPublished = {})
NoUnknownCommitted == ~(s.tenantUnknown /\ s.tenantDisk # {})
NoUnknownAbsent == ~(s.tenantUnknown /\ s.tenantDisk = {})
NoRestart == ~(HasIntent /\ ~HasOwner)
NoLostActivationReply == ~(s.accountPublished = 2 /\ s.knownAccount # 2)
NoCompletedRegistration == ~s.success
NoBlockedCompletion == ~s.tenantBlocked
NoRecoveredCompletion == ~(s.tenantBlocked /\ s.baselineReady /\ s.success)
NoClosedHistoricalSuccess == ~(s.success /\ ~s.tenantOpen)
=============================================================================

---------------------- MODULE AccountRegistration ----------------------
EXTENDS Naturals, FiniteSets

CONSTANTS Sources, InitSources, SharedSources, SharedUser, CredentialEligible, None
ASSUME /\ IsFiniteSet(Sources) /\ Sources # {}
       /\ InitSources \subseteq Sources /\ InitSources # {}
       /\ SharedSources \subseteq Sources
       /\ CredentialEligible \subseteq Sources
       /\ None \notin Sources /\ None # SharedUser

User(r) == IF r \in SharedSources THEN SharedUser ELSE r
Users == {User(r) : r \in Sources}
Entry(r) == IF r \in InitSources THEN "deployment_init" ELSE "account_registration"
\* Tuples stand for injective encodings; UTF-8/base64url/JSON bytes are not modeled.
SourceRef(r) == <<"opaque-account-source", r>>
Target(u) == <<"personal:user:", u>>
Targets == {Target(u) : u \in Users}
Fact(r) == [sourceRef |-> SourceRef(r), version |-> "1", entryKind |-> Entry(r),
            userRef |-> User(r), targetTenantId |-> Target(User(r))]
Principal == [kind |-> "system", systemId |-> "tenant-personal-creator"]
Operation(r) == <<"tenant.personal-create", Principal, <<"source:", SourceRef(r)>>>>
Canonical(r) == [format |-> "core-operation/1", operationKind |-> "tenant.personal-create/1",
                 tenantId |-> Target(User(r)), principal |-> Principal,
                 target |-> [kind |-> "personal-tenant", tenantId |-> Target(User(r))],
                 arguments |-> [sourceRef |-> SourceRef(r), sourceVersion |-> "1",
                                entryKind |-> Entry(r), userRef |-> User(r),
                                targetTenantId |-> Target(User(r))],
                 preconditions |-> <<>>, causality |-> <<>>]
\* Empty sequences above stand for empty JSON objects, not an alternate codec.
Personal(r) == [source |-> SourceRef(r), operation |-> Operation(r), canonical |-> Canonical(r),
                kind |-> "personal", creator |-> User(r), owner |-> User(r), ownerState |-> "active"]

VARIABLES accepted, credentialBound, issued, firstOwner, verified, streams, outcomes,
          published, active, reported, unknown, hostUp, accountUp, activationEvidence
vars == <<accepted, credentialBound, issued, firstOwner, verified, streams, outcomes,
          published, active, reported, unknown, hostUp, accountUp, activationEvidence>>

\* The initial empty Account root and DR prefix are trusted and independently
\* verified under exclusive ownership. Missing files do not establish this state.
Init == /\ accepted = {} /\ credentialBound = {} /\ issued = {}
        /\ firstOwner = None /\ verified = {}
        /\ streams = [t \in Targets |-> None]
        /\ outcomes = [r \in Sources |-> None]
        /\ published = {} /\ active = {} /\ reported = {} /\ unknown = {}
        /\ hostUp = TRUE /\ accountUp = TRUE
        /\ activationEvidence = [r \in Sources |-> FALSE]

AcceptAccount(r) ==
    /\ hostUp /\ accountUp /\ r \notin accepted
    /\ (IF r \in InitSources
       THEN firstOwner = None /\ accepted = {}
       ELSE firstOwner # None /\ firstOwner \in active /\ firstOwner \in published)
    /\ accepted' = accepted \cup {r}
    /\ firstOwner' = IF firstOwner = None THEN r ELSE firstOwner
    /\ UNCHANGED <<credentialBound, issued, verified, streams, outcomes, published,
                    active, reported, unknown, hostUp, accountUp, activationEvidence>>

ConfirmCredentialBinding(r) ==
    /\ hostUp /\ accountUp /\ r \in accepted /\ r \notin credentialBound
    /\ r \in CredentialEligible
    \* This action assumes the Account provider has actually verified a durable,
    \* unique normalized credential binding and the original request/UserRef map.
    \* A provider timeout or credential collision cannot execute this action.
    /\ credentialBound' = credentialBound \cup {r}
    /\ UNCHANGED <<accepted, issued, firstOwner, verified, streams, outcomes,
                    published, active, reported, unknown, hostUp, accountUp, activationEvidence>>

IssueSource(r) ==
    /\ hostUp /\ accountUp /\ r \in credentialBound /\ r \notin issued
    /\ issued' = issued \cup {r}
    /\ UNCHANGED <<accepted, credentialBound, firstOwner, verified, streams, outcomes,
                    published, active, reported, unknown, hostUp, accountUp, activationEvidence>>

ReadSource(r) ==
    /\ hostUp /\ accountUp /\ r \in issued /\ r \notin verified
    \* A current trusted Account service returns the complete immutable Fact(r).
    \* No durable import/ack/outbox is created; verified is volatile preparation.
    /\ verified' = verified \cup {r}
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, streams, outcomes,
                    published, active, reported, unknown, hostUp, accountUp, activationEvidence>>

CommitTenant(r) ==
    /\ hostUp /\ r \in verified /\ outcomes[r] = None /\ r \notin unknown
    \* Abstract one tenant-scoped atomic commit, including original T's outcome.
    \* A lost response is ObserveUnknown; an unfinished write is crash + no outcome.
    /\ (IF streams[Target(User(r))] = None
        THEN /\ streams' = [streams EXCEPT ![Target(User(r))] = Personal(r)]
             /\ outcomes' = [outcomes EXCEPT ![r] = "committed"]
        ELSE /\ streams' = streams
             /\ outcomes' = [outcomes EXCEPT ![r] = "conflict"])
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, verified, published,
                    active, reported, unknown, hostUp, accountUp, activationEvidence>>

Publish(r) ==
    /\ hostUp /\ outcomes[r] = "committed" /\ r \notin published
    \* Abstract successful publication of all required current owner roots.
    /\ published' = published \cup {r}
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, verified, streams,
                    outcomes, active, reported, unknown, hostUp, accountUp, activationEvidence>>

Activate(r) ==
    /\ hostUp /\ accountUp /\ r \in credentialBound /\ r \notin active
    /\ r \in published /\ outcomes[r] = "committed"
    /\ streams[Target(User(r))] = Personal(r)
    /\ active' = active \cup {r}
    /\ activationEvidence' = [activationEvidence EXCEPT ![r] = (r \in published)]
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, verified, streams,
                    outcomes, published, reported, unknown, hostUp, accountUp>>

ReportSuccess(r) ==
    /\ hostUp /\ accountUp /\ r \in active /\ r \in published /\ r \notin reported
    /\ reported' = reported \cup {r}
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, verified, streams,
                    outcomes, published, active, unknown, hostUp, accountUp, activationEvidence>>

ObserveUnknown(r) ==
    /\ r \in accepted /\ r \notin unknown
    /\ unknown' = unknown \cup {r}
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, verified, streams,
                    outcomes, published, active, reported, hostUp, accountUp, activationEvidence>>

ResolveUnknown(r) ==
    /\ hostUp /\ r \in unknown
    \* Trusted query/recovery has checked the complete prefix, including absence
    \* of the original T and safe reservation release when outcomes[r] = None.
    /\ unknown' = unknown \ {r}
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, verified, streams,
                    outcomes, published, active, reported, hostUp, accountUp, activationEvidence>>

Crash ==
    /\ hostUp /\ hostUp' = FALSE /\ verified' = {} /\ published' = {}
    /\ unknown' = accepted
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, streams, outcomes,
                    active, reported, accountUp, activationEvidence>>

Recover ==
    /\ ~hostUp /\ hostUp' = TRUE
    \* Full-prefix verification, old-writer isolation and all-owner baseline
    \* installation are preconditions abstracted into this single action.
    /\ published' = {r \in Sources : outcomes[r] = "committed"}
    /\ unknown' = {}
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, verified, streams,
                    outcomes, active, reported, accountUp, activationEvidence>>

AccountAvailability ==
    /\ accountUp' = ~accountUp
    /\ UNCHANGED <<accepted, credentialBound, issued, firstOwner, verified, streams,
                    outcomes, published, active, reported, unknown, hostUp, activationEvidence>>

Next == (\E r \in Sources : AcceptAccount(r) \/ ConfirmCredentialBinding(r) \/ IssueSource(r) \/
           ReadSource(r) \/ CommitTenant(r) \/ Publish(r) \/ Activate(r) \/ ReportSuccess(r) \/
           ObserveUnknown(r) \/ ResolveUnknown(r)) \/ Crash \/ Recover \/ AccountAvailability
Spec == Init /\ [][Next]_vars
Fairness == /\ WF_vars(Recover)
            /\ \A r \in Sources :
                 /\ WF_vars(AcceptAccount(r)) /\ WF_vars(ConfirmCredentialBinding(r))
                 /\ WF_vars(IssueSource(r)) /\ WF_vars(ReadSource(r))
                 /\ SF_vars(CommitTenant(r)) /\ WF_vars(Publish(r))
                 /\ WF_vars(Activate(r)) /\ WF_vars(ReportSuccess(r))
                 /\ WF_vars(ResolveUnknown(r))
ProgressSpec == Spec /\ Fairness

TypeOK == /\ accepted \subseteq Sources /\ credentialBound \subseteq Sources
          /\ issued \subseteq Sources /\ verified \subseteq Sources
          /\ published \subseteq Sources /\ active \subseteq Sources
          /\ reported \subseteq Sources /\ unknown \subseteq Sources
          /\ firstOwner \in Sources \cup {None}
          /\ outcomes \in [Sources -> {None, "committed", "conflict"}]
          /\ streams \in [Targets -> ({Personal(r) : r \in Sources} \cup {None})]
          /\ activationEvidence \in [Sources -> BOOLEAN]
          /\ hostUp \in BOOLEAN /\ accountUp \in BOOLEAN
CredentialBeforeSource == issued \subseteq credentialBound /\ credentialBound \subseteq accepted
CredentialEligibility == credentialBound \subseteq CredentialEligible
InitOnce == Cardinality(accepted \cap InitSources) <= 1
FirstSlotOwned == firstOwner = None \/ firstOwner \in accepted \cap InitSources
InitIsFirst == \A r \in accepted \cap InitSources : firstOwner = r
SignupAfterInit == (accepted \ InitSources) # {} => firstOwner \in active
SourceBeforeTenant == \A r \in Sources : outcomes[r] # None => r \in issued
VerifiedSource == verified \subseteq issued
TargetInjective == \A u, v \in Users : u # v => Target(u) # Target(v)
OperationInjective == \A r, s \in Sources : r # s => Operation(r) # Operation(s)
CommittedOwnsStream == \A r \in Sources :
    outcomes[r] = "committed" => streams[Target(User(r))] = Personal(r)
OnePersonalPerUser == \A r, s \in Sources :
    (outcomes[r] = "committed" /\ outcomes[s] = "committed" /\ User(r) = User(s)) => r = s
NoInventedTenant == \A t \in Targets : streams[t] # None =>
    \E r \in issued : t = Target(User(r)) /\ streams[t] = Personal(r) /\ outcomes[r] = "committed"
PublicationSafe == \A r \in published : outcomes[r] = "committed"
ActivationSafe == \A r \in active : activationEvidence[r] /\ outcomes[r] = "committed"
SuccessSafe == reported \subseteq active
EventualResolution == (<>[](hostUp /\ accountUp)) =>
    \A r \in CredentialEligible : (r \in accepted ~> (outcomes[r] = "conflict" \/ r \in reported))
=============================================================================

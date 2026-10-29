------------------------ MODULE EnvironmentPreparation ------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS GlobalLimit, TenantLimit, LeakReservation, InspectAdopts,
          SkipRegistration, SkipRetirement, SkipForwardAdoption

Tenants == {"A", "B"}
Operations == {"a1", "a2", "b1"}
Tenant(o) == IF o = "b1" THEN "B" ELSE "A"
Original(o) == <<Tenant(o), o, o, "adapter-v1", o, "initial", o, o>>
Originals == {Original(o) : o \in Operations}
Phases == {"idle", "policy", "query", "query-return", "recheck",
           "forward", "prepare", "prepare-return"}
Progress == {"none", "pending", "unknown", "allocated", "prepared",
             "rejected", "released", "excluded", "unavailable", "invalid"}

VARIABLE s
vars == <<s>>

Init == \E focus \in Operations :
  s = [focus |-> focus,
       queue |-> <<"a1", "a2", "b1">>,
       lane |-> [o \in Operations |-> "queued"],
       occupied |-> {}, outstanding |-> {}, sentEver |-> {},
       refused |-> {}, diagnostics |-> {}, retired |-> {},
       eligible |-> Tenants, original |-> TRUE, scopeOpen |-> TRUE,
       registered |-> TRUE, external |-> "none", allocatedEver |-> FALSE,
       leaseIssued |-> FALSE, cleanup |-> FALSE,
       phase |-> "idle", intent |-> "none", snapshot |-> "none",
       returned |-> "none", requests |-> {}, badAdoption |-> {},
       excluded |-> {}, releaseConfirmed |-> {}, badForward |-> FALSE]

Active(o) == o \notin s.retired \/ (SkipRetirement /\ o = s.focus)
Current(o) == Tenant(o) \in s.eligible /\ s.original /\ Active(o)
TenantOccupied(t) == {o \in s.occupied : Tenant(o) = t}
Capacity(o) == /\ Cardinality(s.occupied) < GlobalLimit
               /\ Cardinality(TenantOccupied(Tenant(o))) < TenantLimit
QueueHead(o) == \E i \in 1..Len(s.queue) :
  /\ s.queue[i] = o
  /\ \A j \in 1..(i - 1) : Tenant(s.queue[j]) # Tenant(o)
Remove(q, o) == SelectSeq(q, LAMBDA item : item # o)

Reserve(o) ==
  /\ s.lane[o] = "queued" /\ QueueHead(o) /\ Capacity(o)
  /\ o \notin s.retired
  /\ s' = [s EXCEPT !.queue = Remove(@, o), !.lane[o] = "reserved",
                    !.occupied = @ \cup {o}]

CompleteDispatchCheck(o) ==
  /\ s.lane[o] = "reserved" /\ Current(o)
  /\ s' = [s EXCEPT !.lane[o] = "checked"]

\* The caller resumes from await check before invoking the original adapter.
Dispatch(o) ==
  /\ s.lane[o] = "checked" /\ Active(o)
  /\ s.original \/ SkipForwardAdoption
  /\ s' = [s EXCEPT !.lane[o] = "sent", !.outstanding = @ \cup {o},
                    !.sentEver = @ \cup {o}, !.requests = @ \cup {Original(o)},
                    !.badForward = @ \/ ~s.original,
                    !.external = IF o = s.focus THEN "pending" ELSE @,
                    !.phase = IF o = s.focus THEN "prepare" ELSE @,
                    !.intent = IF o = s.focus THEN "first" ELSE @]

\* Completion of a failed qualification also covers a thrown qualification/getter.
\* The resource reservation is returned before the independent diagnostic wait.
RefuseDispatch(o) ==
  /\ s.lane[o] = "reserved"
  /\ s' = [s EXCEPT !.lane[o] = "idle", !.refused = @ \cup {o},
                    !.diagnostics = @ \cup {o},
                    !.occupied = IF LeakReservation THEN @ ELSE @ \ {o}]

RefuseBeforeSend(o) ==
  /\ s.lane[o] = "checked" /\ ~s.original /\ ~SkipForwardAdoption
  /\ s' = [s EXCEPT !.lane[o] = "idle", !.refused = @ \cup {o},
                    !.occupied = IF LeakReservation THEN @ ELSE @ \ {o}]

RetryUnsent(o) ==
  /\ s.lane[o] = "idle" /\ o \notin s.outstanding /\ Current(o)
  /\ s' = [s EXCEPT !.lane[o] = "queued", !.queue = Append(@, o),
                    !.refused = @ \ {o}]

FinishDiagnostic(o) ==
  /\ o \in s.diagnostics
  /\ s' = [s EXCEPT !.diagnostics = @ \ {o}]

Eligibility(t) ==
  s' = [s EXCEPT !.eligible = IF t \in @ THEN @ \ {t} ELSE @ \cup {t}]
AdapterChange == s' = [s EXCEPT !.original = ~@]
ScopeEnds == /\ s.scopeOpen /\ s' = [s EXCEPT !.scopeOpen = FALSE]
LoseRegistration ==
  /\ s.focus \in s.sentEver /\ s.registered
  /\ s' = [s EXCEPT !.registered = FALSE]

\* These provider transitions encode the external same-key allocation premise.
ProviderAllocates ==
  /\ s.external = "pending" /\ ~s.allocatedEver /\ ~s.cleanup
  /\ s' = [s EXCEPT !.external = "allocated", !.allocatedEver = TRUE]

ProviderExcludes ==
  /\ s.external = "pending" /\ ~s.allocatedEver /\ ~s.cleanup
  /\ s.phase = "idle"
  /\ s' = [s EXCEPT !.external = "none", !.lane[s.focus] = "idle",
                    !.outstanding = @ \ {s.focus}, !.occupied = @ \ {s.focus},
                    !.excluded = @ \cup {s.focus}, !.returned = "excluded"]

\* EE notAllocated is a terminal original-key fact. It is never Tool excluded.
ProviderNotAllocated ==
  /\ s.external = "pending" /\ ~s.allocatedEver /\ ~s.cleanup
  /\ s' = [s EXCEPT !.external = "not-allocated"]

Observed == CASE s.external = "closed" -> "released"
              [] s.external = "not-allocated" -> "rejected"
              [] s.external = "allocated" /\ s.leaseIssued -> "prepared"
              [] s.external = "allocated" -> "allocated"
              [] OTHER -> "unknown"

CapturePrepare(answer) ==
  /\ s.phase = "prepare"
  /\ answer \in {Observed, "unknown"}
  /\ s' = [s EXCEPT !.snapshot = answer, !.phase = "prepare-return"]

PublicSnapshot ==
  IF ~s.original \/ ~Active(s.focus) THEN "unavailable"
  ELSE IF s.snapshot \in {"allocated", "prepared"} /\ (~s.registered \/ s.cleanup)
       THEN "unknown" ELSE s.snapshot

ReturnPrepare ==
  /\ s.phase = "prepare-return"
  /\ s' = [s EXCEPT !.returned = PublicSnapshot, !.phase = "idle",
       !.retired = IF s.snapshot = "rejected" THEN @ \cup {s.focus} ELSE @]

BeginPrepare ==
  /\ s.phase = "idle" /\ s.focus \in s.outstanding /\ Current(s.focus)
  /\ s' = [s EXCEPT !.phase = "policy", !.intent = "recognize"]

RetryPolicy(choice) ==
  /\ s.phase = "policy" /\ choice \in {"wait", "inspect", "recognize"}
  /\ s' = [s EXCEPT
       !.phase = IF ~s.original \/ ~Active(s.focus) \/ choice = "wait"
                 THEN "idle" ELSE "query",
       !.intent = choice,
       !.returned = IF ~s.original \/ ~Active(s.focus) THEN "unavailable"
                    ELSE IF choice = "wait" THEN "pending" ELSE @]

BeginInspect ==
  /\ s.phase = "idle" /\ s.focus \in s.sentEver
  /\ Tenant(s.focus) \in s.eligible /\ s.original
  /\ s' = [s EXCEPT !.phase = "query", !.intent = "inspect"]

InspectUnsent ==
  /\ s.phase = "idle" /\ s.focus \notin s.outstanding
  /\ s.lane[s.focus] \in {"queued", "reserved", "checked", "idle"}
  /\ s' = [s EXCEPT !.returned = "pending"]

ReadQuery(answer) ==
  /\ s.phase = "query" /\ answer \in {Observed, "unknown"}
  /\ s' = [s EXCEPT !.snapshot = answer, !.phase = "query-return"]

ReturnQuery ==
  /\ s.phase = "query-return"
  /\ s' = [s EXCEPT !.returned = PublicSnapshot,
       !.retired = IF s.snapshot = "rejected" THEN @ \cup {s.focus} ELSE @,
       !.phase = IF s.intent = "recognize" /\ PublicSnapshot \in {"allocated", "prepared"}
                    /\ s.original /\ Active(s.focus)
                 THEN "recheck" ELSE "idle"]

CompleteRecheck ==
  /\ s.phase = "recheck"
  /\ s' = [s EXCEPT
       !.phase = IF Current(s.focus) THEN "forward" ELSE "idle",
       !.returned = IF Current(s.focus) THEN @ ELSE "unavailable"]

ForwardRecognition ==
  /\ s.phase = "forward" /\ Active(s.focus)
  /\ s.original \/ SkipForwardAdoption
  /\ s' = [s EXCEPT !.phase = "prepare", !.requests = @ \cup {Original(s.focus)},
                    !.badForward = @ \/ ~s.original]

DeclineRecognition ==
  /\ s.phase = "forward"
  /\ ~Active(s.focus) \/ (~s.original /\ ~SkipForwardAdoption)
  /\ s' = [s EXCEPT !.phase = "idle", !.returned = "unavailable"]

RecheckThrows ==
  /\ s.phase = "recheck"
  /\ s' = [s EXCEPT !.phase = "idle", !.returned = "unavailable",
                    !.diagnostics = @ \cup {s.focus}]

\* One lease per original acquisition is an external EE protocol premise.
\* Host request identity and the eligibility at this transition are checked here.
Adopt ==
  /\ s.phase = "prepare" /\ s.intent \in {"first", "recognize"}
  /\ s.external = "allocated" /\ ~s.leaseIssued /\ ~s.cleanup
  /\ s.original /\ Tenant(s.focus) \in s.eligible /\ s.scopeOpen
  /\ (s.registered \/ SkipRegistration) /\ Active(s.focus)
  /\ s' = [s EXCEPT !.leaseIssued = TRUE,
       !.badAdoption = @ \cup (IF s.registered THEN {} ELSE {"cold"})
                          \cup (IF s.focus \in s.retired THEN {"retired"} ELSE {})]

AdoptionFails ==
  /\ s.phase = "prepare" /\ s.external = "allocated" /\ ~s.leaseIssued
  /\ s.focus \notin s.retired
  /\ s' = [s EXCEPT !.retired = @ \cup {s.focus}, !.returned = "rejected",
                    !.snapshot = "rejected", !.phase = "prepare-return"]

InspectAdoptionFault ==
  /\ InspectAdopts /\ s.phase = "query-return" /\ s.intent = "inspect"
  /\ s.external = "allocated" /\ ~s.leaseIssued /\ s.registered
  /\ Current(s.focus) /\ s.scopeOpen /\ ~s.cleanup
  /\ s' = [s EXCEPT !.leaseIssued = TRUE, !.badAdoption = @ \cup {"inspect"}]

MismatchedRequest(field) ==
  /\ field \in 1..8 /\ s.phase = "idle"
  /\ [Original(s.focus) EXCEPT ![field] = "foreign"] # Original(s.focus)
  /\ s' = [s EXCEPT !.returned = "invalid"]

BeginRelease ==
  /\ s.focus \in s.outstanding /\ ~s.cleanup
  /\ s' = [s EXCEPT !.cleanup = TRUE]

ReleaseUnknown ==
  /\ s.cleanup /\ s.focus \in s.outstanding
  /\ s' = [s EXCEPT !.returned = "unknown", !.diagnostics = @ \cup {s.focus}]

ProviderSettles ==
  /\ s.cleanup /\ s.external \in {"pending", "allocated", "not-allocated"}
  /\ s' = [s EXCEPT !.external = "closed"]

ConfirmRelease ==
  /\ s.external = "closed" /\ s.focus \in s.outstanding
  /\ s' = [s EXCEPT !.outstanding = @ \ {s.focus}, !.occupied = @ \ {s.focus},
                    !.retired = @ \cup {s.focus}, !.lane[s.focus] = "closed",
                    !.releaseConfirmed = @ \cup {s.focus}, !.returned = "released"]

\* Non-focal operations retain capacity through their entire external wait.
\* Their provider close and its acknowledgement are contracted into this action.
ConfirmBackgroundRelease(o) ==
  /\ o # s.focus /\ o \in s.outstanding
  /\ s' = [s EXCEPT !.outstanding = @ \ {o}, !.occupied = @ \ {o},
                    !.retired = @ \cup {o}, !.lane[o] = "closed",
                    !.releaseConfirmed = @ \cup {o}]

Next ==
  \/ \E o \in Operations : Reserve(o) \/ CompleteDispatchCheck(o) \/ Dispatch(o)
       \/ RefuseDispatch(o) \/ RefuseBeforeSend(o)
       \/ RetryUnsent(o) \/ FinishDiagnostic(o) \/ ConfirmBackgroundRelease(o)
  \/ \E t \in Tenants : Eligibility(t)
  \/ AdapterChange \/ ScopeEnds \/ LoseRegistration
  \/ ProviderAllocates \/ ProviderExcludes \/ ProviderNotAllocated
  \/ \E answer \in Progress : CapturePrepare(answer) \/ ReadQuery(answer)
  \/ ReturnPrepare \/ BeginPrepare
  \/ \E choice \in {"wait", "inspect", "recognize"} : RetryPolicy(choice)
  \/ BeginInspect \/ InspectUnsent \/ ReturnQuery \/ CompleteRecheck \/ RecheckThrows
  \/ ForwardRecognition \/ DeclineRecognition
  \/ Adopt \/ AdoptionFails \/ InspectAdoptionFault
  \/ \E field \in 1..8 : MismatchedRequest(field)
  \/ BeginRelease \/ ReleaseUnknown \/ ProviderSettles \/ ConfirmRelease

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ s.focus \in Operations /\ s.lane \in [Operations -> {"queued", "reserved", "checked", "idle", "sent", "closed"}]
  /\ s.occupied \subseteq Operations /\ s.outstanding \subseteq Operations
  /\ s.sentEver \subseteq Operations /\ s.refused \subseteq Operations
  /\ s.diagnostics \subseteq Operations /\ s.retired \subseteq Operations
  /\ s.eligible \subseteq Tenants /\ s.excluded \subseteq Operations
  /\ s.releaseConfirmed \subseteq Operations
  /\ s.original \in BOOLEAN /\ s.scopeOpen \in BOOLEAN /\ s.registered \in BOOLEAN
  /\ s.allocatedEver \in BOOLEAN /\ s.leaseIssued \in BOOLEAN /\ s.cleanup \in BOOLEAN
  /\ s.external \in {"none", "pending", "allocated", "closed", "not-allocated"}
  /\ s.phase \in Phases /\ s.intent \in {"none", "first", "recognize", "inspect", "wait"}
  /\ s.snapshot \in Progress /\ s.returned \in Progress
  /\ s.badAdoption \subseteq {"cold", "retired", "inspect"}
  /\ s.badForward \in BOOLEAN

LocalRefusalVacates == \A o \in s.refused : o \notin s.outstanding => o \notin s.occupied
SentDutyRetained == s.outstanding \subseteq s.occupied
NoInventedExternalFinal == (s.excluded \cup s.releaseConfirmed) \subseteq s.sentEver
OriginalRequestsOnly == s.requests \subseteq Originals
OriginalAdapterAtForward == ~s.badForward
QuotaBounds == /\ Cardinality(s.occupied) <= GlobalLimit
               /\ \A t \in Tenants : Cardinality(TenantOccupied(t)) <= TenantLimit
InspectNeverAdopts == "inspect" \notin s.badAdoption
NoColdAdoption == "cold" \notin s.badAdoption
NoRetiredAdoption == "retired" \notin s.badAdoption
ClosedNeverRequeues == \A o \in s.retired : s.lane[o] \notin {"queued", "reserved"}
EERejectionIsTerminal == s.external = "not-allocated" =>
  /\ s.lane[s.focus] \notin {"queued", "reserved", "checked"}
  /\ ~s.allocatedEver
LocalFailureLeavesBSchedulable ==
  (s.refused \cap {"a1", "a2"} # {} /\ s.lane["b1"] = "queued"
   /\ Current("b1") /\ Capacity("b1")) => ENABLED Reserve("b1")

\* These are negated witnesses, not safety goals. A violation proves reachability.
NeverBWhileADiagnosticWaits ==
  ~(s.refused \cap s.diagnostics \cap {"a1", "a2"} # {} /\ "b1" \in s.outstanding)
NeverTwoTenantsWithAQueued ==
  ~("a1" \in s.outstanding /\ "b1" \in s.outstanding /\ s.lane["a2"] = "queued")

\* Public result text never enables an action or appears in a checked predicate.
\* Keep snapshots, diagnostic waits and all authority/resource state in the view.
StateView == [s EXCEPT !.returned = "none"]
=============================================================================

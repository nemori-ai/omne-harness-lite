----------------------------- MODULE Binding -----------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS Agents, Sessions, Tenants, OwnerTenant, NoAgent, NoSession,
          NoTenant, Mutation
ASSUME /\ Agents # {} /\ Sessions # {} /\ OwnerTenant \in Tenants
       /\ NoAgent \notin Agents /\ NoSession \notin Sessions
       /\ NoTenant \notin Tenants

\* One Session owner and two possible caller tenants suffice for this bounded
\* cross-tenant check. This is not a model of IAM membership or data secrecy.
Phases == {"fresh", "preparing", "ready", "closing", "releasing", "disposed"}
Works == {"none", "active", "requested", "confirmed", "finished", "transferred"}
Active(p) == p \in {"preparing", "ready", "closing", "releasing"}
OwnedWork(w) == w \in {"active", "requested", "confirmed"}

VARIABLES agent, slot, attachment, eligible, epoch, access, dependency
vars == <<agent, slot, attachment, eligible, epoch, access, dependency>>

EmptyAgent == [phase |-> "fresh", session |-> NoSession, tenant |-> NoTenant,
  pending |-> FALSE, resource |-> FALSE, attached |-> FALSE, revision |-> 0,
  work |-> "none", transferConfirmed |-> FALSE, quiet |-> FALSE,
  cleanupBlocked |-> FALSE, publication |-> "none"]

Init == /\ agent = [a \in Agents |-> EmptyAgent]
        /\ slot = [s \in Sessions |-> NoAgent]
        /\ attachment = [s \in Sessions |-> NoAgent]
        /\ eligible = [s \in Sessions |-> TRUE]
        /\ epoch = [s \in Sessions |-> 0]
        /\ access = [s \in Sessions |-> TRUE]
        /\ dependency = TRUE

Current(a) == LET s == agent[a].session IN
  /\ s \in Sessions /\ agent[a].tenant = OwnerTenant
  /\ eligible[s] /\ access[s] /\ dependency
  /\ agent[a].attached /\ attachment[s] = a
  /\ agent[a].revision = epoch[s]

Reserve(a, s, t) ==
  /\ agent[a].phase = "fresh" /\ slot[s] = NoAgent
  /\ eligible[s] /\ access[s] /\ dependency
  /\ (t = OwnerTenant \/ Mutation = "tenant")
  /\ agent' = [agent EXCEPT ![a] = [@ EXCEPT !.phase = "preparing",
       !.session = s, !.tenant = t, !.pending = TRUE, !.revision = epoch[s]]]
  /\ slot' = [slot EXCEPT ![s] = a]
  /\ UNCHANGED <<attachment, eligible, epoch, access, dependency>>

\* Ownership was recorded by Reserve BEFORE asynchronous allocation. Even
\* after Close, a late result returns to this same attempt for cleanup.
PrepareReturns(a) ==
  /\ agent[a].phase \in {"preparing", "closing"} /\ agent[a].pending
  /\ attachment[agent[a].session] = NoAgent
  /\ agent' = [agent EXCEPT ![a] = [@ EXCEPT !.pending = FALSE,
       !.resource = TRUE, !.attached = TRUE]]
  /\ attachment' = [attachment EXCEPT ![agent[a].session] = a]
  /\ UNCHANGED <<slot, eligible, epoch, access, dependency>>

\* Abstract linearization point: concrete providers must implement the joint
\* guard; the model does not assume separate remote checks achieve it.
Publish(a) ==
  /\ agent[a].phase = "preparing" /\ ~agent[a].pending
  /\ agent[a].attached /\ slot[agent[a].session] = a
  /\ agent[a].tenant = OwnerTenant
  /\ attachment[agent[a].session] = a
  /\ (access[agent[a].session] \/ Mutation = "authorization")
  /\ (eligible[agent[a].session] \/ Mutation = "eligibility")
  /\ (agent[a].revision = epoch[agent[a].session] \/ Mutation = "revision" \/
        Mutation = "eligibility")
  /\ (dependency \/ Mutation = "dependency")
  /\ agent' = [agent EXCEPT ![a] = [@ EXCEPT !.phase = "ready",
       !.publication = IF Current(a) THEN "valid" ELSE "invalid"]]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>

\* One eligibility change and restoration expose stale-token resurrection.
Invalidate(s) ==
  /\ eligible[s] /\ epoch[s] = 0
  /\ eligible' = [eligible EXCEPT ![s] = FALSE]
  /\ epoch' = [epoch EXCEPT ![s] = 1]
  /\ UNCHANGED <<agent, slot, attachment, access, dependency>>
Restore(s) ==
  /\ ~eligible[s]
  /\ eligible' = [eligible EXCEPT ![s] = TRUE]
  /\ UNCHANGED <<agent, slot, attachment, epoch, access, dependency>>
Revoke(s) ==
  /\ access[s] /\ access' = [access EXCEPT ![s] = FALSE]
  /\ UNCHANGED <<agent, slot, attachment, eligible, epoch, dependency>>
LoseDependency ==
  /\ dependency /\ dependency' = FALSE
  /\ UNCHANGED <<agent, slot, attachment, eligible, epoch, access>>

Close(a) ==
  /\ agent[a].phase \in {"preparing", "ready"}
  /\ agent' = [agent EXCEPT ![a].phase = "closing"]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
StartWork(a) ==
  /\ agent[a].phase = "ready" /\ agent[a].work = "none" /\ Current(a)
  /\ agent' = [agent EXCEPT ![a].work = "active"]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
FinishWork(a) ==
  /\ OwnedWork(agent[a].work)
  /\ agent' = [agent EXCEPT ![a].work = "finished"]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
RequestTransfer(a) ==
  /\ agent[a].work = "active"
  /\ agent' = [agent EXCEPT ![a].work = "requested"]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
\* Confirmation abstracts BOTH receiver ownership and independence from old
\* resources. Lost replies leave the work in requested, still owned here.
ConfirmTransfer(a) ==
  /\ agent[a].work = "requested"
  /\ agent' = [agent EXCEPT ![a] = [@ EXCEPT !.work = "confirmed",
       !.transferConfirmed = TRUE]]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
CompleteTransfer(a) ==
  /\ (agent[a].work = "confirmed" \/
        (Mutation = "handoff" /\ agent[a].work = "requested"))
  /\ agent' = [agent EXCEPT ![a].work = "transferred"]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
Quiesce(a) ==
  /\ agent[a].phase = "closing" /\ ~agent[a].pending
  /\ ~OwnedWork(agent[a].work) /\ ~agent[a].quiet
  /\ agent' = [agent EXCEPT ![a].quiet = TRUE]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
BeginRelease(a) ==
  /\ agent[a].phase = "closing" /\ agent[a].quiet
  /\ agent' = [agent EXCEPT ![a].phase = "releasing"]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
CleanupUnknown(a) ==
  /\ agent[a].phase = "releasing" /\ agent[a].resource
  /\ ~agent[a].cleanupBlocked
  /\ agent' = [agent EXCEPT ![a].cleanupBlocked = TRUE]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
\* An explicit backend reconciliation is required to leave unknown. Neither
\* timeout nor ordinary permission loss silently clears resource ownership.
ReconcileCleanup(a) ==
  /\ agent[a].cleanupBlocked
  /\ agent' = [agent EXCEPT ![a].cleanupBlocked = FALSE]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
ReleaseResource(a) ==
  /\ agent[a].phase = "releasing" /\ agent[a].resource
  /\ ~agent[a].cleanupBlocked
  /\ agent' = [agent EXCEPT ![a].resource = FALSE]
  /\ UNCHANGED <<slot, attachment, eligible, epoch, access, dependency>>
ReleaseAttachment(a) ==
  /\ agent[a].phase = "releasing" /\ ~agent[a].resource
  /\ agent[a].attached /\ attachment[agent[a].session] = a
  /\ agent' = [agent EXCEPT ![a].attached = FALSE]
  /\ attachment' = [attachment EXCEPT ![agent[a].session] = NoAgent]
  /\ UNCHANGED <<slot, eligible, epoch, access, dependency>>
Remove(a) ==
  /\ ((agent[a].phase = "releasing" /\ ~agent[a].resource /\
        ~agent[a].attached) \/
       (Mutation = "earlyRelease" /\ agent[a].phase = "closing"))
  /\ agent' = [agent EXCEPT ![a].phase = "disposed"]
  /\ slot' = [slot EXCEPT ![agent[a].session] = NoAgent]
  /\ UNCHANGED <<attachment, eligible, epoch, access, dependency>>
\* A correct duplicate release is a stuttering step. This mutation represents
\* a Session-key-only release that incorrectly erases a later registration.
StaleRelease(a) ==
  /\ Mutation = "staleRelease" /\ agent[a].phase = "disposed"
  /\ attachment[agent[a].session] \notin {NoAgent, a}
  /\ attachment' = [attachment EXCEPT ![agent[a].session] = NoAgent]
  /\ UNCHANGED <<agent, slot, eligible, epoch, access, dependency>>

Next == \/ \E a \in Agents, s \in Sessions, t \in Tenants: Reserve(a, s, t)
        \/ \E s \in Sessions: Invalidate(s) \/ Restore(s) \/ Revoke(s)
        \/ LoseDependency
        \/ \E a \in Agents:
             PrepareReturns(a) \/ Publish(a) \/ Close(a) \/ StartWork(a) \/
             FinishWork(a) \/ RequestTransfer(a) \/ ConfirmTransfer(a) \/
             CompleteTransfer(a) \/ Quiesce(a) \/ BeginRelease(a) \/
             CleanupUnknown(a) \/ ReconcileCleanup(a) \/ ReleaseResource(a) \/
             ReleaseAttachment(a) \/ Remove(a) \/ StaleRelease(a)

TypeOK ==
  /\ agent \in [Agents -> [phase: Phases, session: Sessions \cup {NoSession},
       tenant: Tenants \cup {NoTenant}, pending: BOOLEAN, resource: BOOLEAN,
       attached: BOOLEAN, revision: 0..1, work: Works,
       transferConfirmed: BOOLEAN, quiet: BOOLEAN, cleanupBlocked: BOOLEAN,
       publication: {"none", "valid", "invalid"}]]
  /\ slot \in [Sessions -> Agents \cup {NoAgent}]
  /\ attachment \in [Sessions -> Agents \cup {NoAgent}]
  /\ eligible \in [Sessions -> BOOLEAN] /\ access \in [Sessions -> BOOLEAN]
  /\ epoch \in [Sessions -> 0..1] /\ dependency \in BOOLEAN
TenantBound == \A a \in Agents: agent[a].phase # "fresh" =>
  agent[a].tenant = OwnerTenant
SlotExact ==
  /\ \A a \in Agents: Active(agent[a].phase) => slot[agent[a].session] = a
  /\ \A s \in Sessions: slot[s] # NoAgent =>
       (Active(agent[slot[s]].phase) /\ agent[slot[s]].session = s)
PublicationSafe == \A a \in Agents: agent[a].publication # "invalid"
AttachmentExact == \A a \in Agents: agent[a].attached =>
  attachment[agent[a].session] = a
DisposedIsClean == \A a \in Agents: agent[a].phase = "disposed" =>
  (~agent[a].pending /\ ~agent[a].resource /\ ~agent[a].attached /\
   ~OwnedWork(agent[a].work) /\ agent[a].quiet)
QuiescentIsSettled == \A a \in Agents: agent[a].quiet =>
  (~agent[a].pending /\ ~OwnedWork(agent[a].work))
TransferAccounted == \A a \in Agents: agent[a].work = "transferred" =>
  agent[a].transferConfirmed

Spec == Init /\ [][Next]_vars
=============================================================================

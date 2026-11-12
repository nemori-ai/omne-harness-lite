------------------------- MODULE RestartContinuation -------------------------
(* One Ask call of one Run, suspended on its wait, across service restarts.
   A restart is an explicit transition: it clears every fact that lives only in a process and keeps
   every durable fact. The model asks which inputs of the way back to the Run must be durable, or
   rebuilt before they are needed, for the call to settle and the Run to receive its result once.

   Durable: the HITL decision, the Tool ledger phase, the kept checkpoint, the Session scope
   ownership, the provider's preparation record, the Agent's receipt of the result.
   Process-only: the executor's table of calls, the Session scope index, the in-memory checkpoint
   copy, the driver's memory that it asked the provider, the live environment the provider holds
   for a preparation, the result receiver (registered per owner when the Agent host loads), the
   Run's driving loop.

   Each `Bad` variant puts one input back into the process only, as an implementation once had it. *)
EXTENDS Naturals, TLC

CONSTANT Bad
MaxRestarts == 2

VARIABLES
  up, restarts,
  answered, phase, kept, record, received, ended, resumes,
  known, indexed, memory, asked, live, segment, receiver, driving

durable == <<answered, phase, kept, record, received, ended, resumes>>
volatile == <<known, indexed, memory, asked, live, segment, receiver, driving>>
vars == <<up, restarts, answered, phase, kept, record, received, ended, resumes,
          known, indexed, memory, asked, live, segment, receiver, driving>>

Phases == {"suspended", "accepted", "prepared", "running", "settled"}

TypeOK ==
  /\ up \in BOOLEAN /\ restarts \in 0..MaxRestarts
  /\ answered \in BOOLEAN /\ phase \in Phases /\ kept \in BOOLEAN /\ record \in BOOLEAN
  /\ received \in 0..2 /\ ended \in BOOLEAN /\ resumes \in 0..2
  /\ known \in BOOLEAN /\ indexed \in BOOLEAN /\ memory \in BOOLEAN
  /\ asked \in BOOLEAN /\ live \in BOOLEAN /\ segment \in BOOLEAN
  /\ receiver \in BOOLEAN /\ driving \in BOOLEAN

(* The call has suspended in a live process: the executor holds it, Session has indexed the scope
   of the active session, the author's state is kept (and copied in memory), the Run waits. *)
Init ==
  /\ up = TRUE /\ restarts = 0
  /\ answered = FALSE /\ phase = "suspended" /\ kept = TRUE /\ record = FALSE
  /\ received = 0 /\ ended = FALSE /\ resumes = 0
  /\ known = TRUE /\ indexed = TRUE /\ memory = TRUE /\ asked = FALSE /\ live = FALSE
  /\ segment = FALSE
  /\ receiver = TRUE /\ driving = TRUE

-----------------------------------------------------------------------------
(* What each step may read. A fixed design reads the durable fact; a `Bad` variant reads the
   process-only one in its place. *)

\* The environment authority asks who owns the call's scope.
ScopeKnown == IF Bad = "volatile-scope" THEN indexed ELSE TRUE
\* The resume reads the checkpoint state.
StateReadable == IF Bad = "memory-checkpoint" THEN memory ELSE kept
\* After a restart the executor learns the call from the durable pending marker.
Scans == Bad # "no-scan"
\* The driver remembers it asked only after the provider answered.
RemembersFailure == Bad = "asked-on-failure"
\* A prepared environment that no process holds live is prepared again, under a new identity.
Replans == Bad # "reconnect-env"
\* A started segment whose process is gone is settled from its record, never run again: the
\* executor asks the binding, which holds no attempt for it.
Reconciles == Bad \notin {"abandon-possibly-live", "rerun-segment"}
\* After a restart the Agent host takes the waiting Run up again from its journal.
RecoversRuns == Bad # "no-run-recovery"

-----------------------------------------------------------------------------
(* The environment. *)

Restart ==
  /\ up /\ restarts < MaxRestarts
  /\ up' = FALSE /\ restarts' = restarts + 1
  /\ known' = FALSE /\ indexed' = FALSE /\ memory' = FALSE /\ asked' = FALSE /\ live' = FALSE
  /\ segment' = FALSE
  /\ receiver' = FALSE /\ driving' = FALSE
  /\ UNCHANGED durable

Boot ==
  /\ ~up /\ up' = TRUE
  /\ UNCHANGED <<restarts>> /\ UNCHANGED durable /\ UNCHANGED volatile

\* The person answers the card; HITL keeps the decision durably.
Answer ==
  /\ up /\ ~answered /\ answered' = TRUE
  /\ UNCHANGED <<up, restarts, phase, kept, record, received, ended, resumes>> /\ UNCHANGED volatile

-----------------------------------------------------------------------------
(* Session. A committed notice of the session indexes its scopes; the session commits only when
   its Run moves, and the Run moves only on the result. *)

Notice ==
  /\ up /\ ~indexed /\ received > 0
  /\ indexed' = TRUE
  /\ UNCHANGED <<up, restarts>> /\ UNCHANGED durable /\ UNCHANGED <<known, memory, asked, live, segment, receiver, driving>>

-----------------------------------------------------------------------------
(* Tool. *)

Scan ==
  /\ up /\ ~known /\ Scans /\ phase # "settled"
  /\ known' = TRUE
  /\ UNCHANGED <<up, restarts>> /\ UNCHANGED durable /\ UNCHANGED <<indexed, memory, asked, live, segment, receiver, driving>>

\* The driver reads the decision and accepts it; the same commit plans the resume preparation.
Accept ==
  /\ up /\ known /\ answered /\ phase = "suspended"
  /\ phase' = "accepted"
  /\ UNCHANGED <<up, restarts, answered, kept, record, received, ended, resumes>> /\ UNCHANGED volatile

\* The provider fails to answer (it cannot place the environment, or is down): no record is
\* written. A failure may happen at any time and need not happen at all, so it is not fair.
PrepareFails ==
  /\ up /\ known /\ phase = "accepted" /\ ~asked
  /\ asked' = RemembersFailure
  /\ UNCHANGED <<up, restarts>> /\ UNCHANGED durable /\ UNCHANGED <<known, indexed, memory, live, segment, receiver, driving>>

\* The driver asks the provider to prepare; the provider records the preparation, holds the
\* environment live in this process and answers.
Prepare ==
  /\ up /\ known /\ phase = "accepted" /\ ~asked /\ ScopeKnown
  /\ phase' = "prepared" /\ record' = TRUE /\ live' = TRUE
  /\ UNCHANGED <<up, restarts, answered, kept, received, ended, resumes>>
  /\ UNCHANGED <<known, indexed, memory, asked, segment, receiver, driving>>

\* Once asked, the driver reads the provider's record instead; without a record it learns nothing.
Inspect ==
  /\ up /\ known /\ phase = "accepted" /\ asked /\ record
  /\ phase' = "prepared" /\ live' = TRUE
  /\ UNCHANGED <<up, restarts, answered, kept, record, received, ended, resumes>>
  /\ UNCHANGED <<known, indexed, memory, asked, segment, receiver, driving>>

\* The preparation is recorded, but its environment lived in a process that is gone: the segment
\* is prepared again under a new identity, which has no record yet.
Replan ==
  /\ up /\ known /\ phase = "prepared" /\ ~live /\ Replans
  /\ phase' = "accepted" /\ record' = FALSE
  /\ UNCHANGED <<up, restarts, answered, kept, received, ended, resumes>> /\ UNCHANGED volatile

\* The resume segment starts from the checkpoint, in this process.
Resume ==
  /\ up /\ known /\ phase = "prepared" /\ live /\ StateReadable
  /\ phase' = "running" /\ resumes' = resumes + 1 /\ segment' = TRUE
  /\ UNCHANGED <<up, restarts, answered, kept, record, received, ended>>
  /\ UNCHANGED <<known, indexed, memory, asked, live, receiver, driving>>

\* The segment returns and the call settles with its result.
Complete ==
  /\ up /\ phase = "running" /\ segment
  /\ phase' = "settled" /\ segment' = FALSE
  /\ UNCHANGED <<up, restarts, answered, kept, record, received, ended, resumes>>
  /\ UNCHANGED <<known, indexed, memory, asked, live, receiver, driving>>

\* The segment was running in a process that is gone. The call settles from its record (the
\* segment was interrupted), or, in a `rerun-segment` variant, is started again.
Reconcile ==
  /\ up /\ known /\ phase = "running" /\ ~segment
  /\ \/ Reconciles /\ phase' = "settled" /\ UNCHANGED resumes
     \/ Bad = "rerun-segment" /\ phase' = "prepared" /\ UNCHANGED resumes
  /\ UNCHANGED <<up, restarts, answered, kept, record, received, ended>> /\ UNCHANGED volatile

-----------------------------------------------------------------------------
(* Agent. *)

\* The Tool delivers the result to the Run's receiver; the Agent keeps its receipt durably.
Deliver ==
  /\ up /\ phase = "settled" /\ receiver /\ received = 0
  /\ received' = received + 1
  /\ UNCHANGED <<up, restarts, answered, phase, kept, record, ended, resumes>> /\ UNCHANGED volatile

\* The Agent host loads and registers its result receiver for its owner, whatever Run is alive.
Reattach ==
  /\ up /\ ~receiver
  /\ receiver' = TRUE
  /\ UNCHANGED <<up, restarts>> /\ UNCHANGED durable /\ UNCHANGED <<known, indexed, memory, asked, live, segment, driving>>

\* The Agent host takes the waiting Run up again from its durable journal.
RecoverRun ==
  /\ up /\ ~driving /\ ~ended /\ RecoversRuns
  /\ driving' = TRUE
  /\ UNCHANGED <<up, restarts>> /\ UNCHANGED durable /\ UNCHANGED <<known, indexed, memory, asked, live, segment, receiver>>

\* The Run's loop reads the received result and ends the Run.
Finish ==
  /\ up /\ driving /\ received > 0 /\ ~ended
  /\ ended' = TRUE
  /\ UNCHANGED <<up, restarts, answered, phase, kept, record, received, resumes>> /\ UNCHANGED volatile

-----------------------------------------------------------------------------

\* Nothing moves: the driver runs the call again after its retry delay and finds the same state,
\* or the Run has ended.
Wait == UNCHANGED vars

Next ==
  \/ Wait \/ Restart \/ Boot \/ Answer \/ Notice
  \/ Scan \/ Accept \/ PrepareFails \/ Prepare \/ Inspect \/ Replan \/ Resume
  \/ Complete \/ Reconcile
  \/ Deliver \/ Reattach \/ RecoverRun \/ Finish

\* Everything but a restart is fair: a restart may happen, but finitely often (MaxRestarts).
Fairness ==
  /\ WF_vars(Boot) /\ WF_vars(Answer) /\ WF_vars(Notice)
  /\ WF_vars(Scan) /\ WF_vars(Accept) /\ WF_vars(Prepare)
  /\ WF_vars(Inspect) /\ WF_vars(Replan) /\ WF_vars(Resume)
  /\ WF_vars(Complete) /\ WF_vars(Reconcile)
  /\ WF_vars(Deliver) /\ WF_vars(Reattach) /\ WF_vars(RecoverRun) /\ WF_vars(Finish)

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* Properties. The Run receiving the result at most once is the Agent journal's recall, one step
   here, so this model does not check it. *)

\* The resume segment starts at most once, however often the service restarts.
ResumeOnce == resumes <= 1

\* The Agent keeps the result of the call: C7 asks this much of a restart.
ResultReceived == <>(received > 0)
\* The Run ends with the result: this needs the Agent host to take the Run up again.
RunEnds == <>ended

=============================================================================

---- MODULE RunAdvance ----
(***************************************************************************)
(* The Run and attempt layer of one Session (SPEC I-R1, I-R2, I-R3, I-R4,  *)
(* I-R5, PM-05, PM-08, PM-11, PM-13, PA-08) and the bounded close of PM-02  *)
(* under unrelated commits.                                                *)
(*                                                                         *)
(* One session, a finite set of inputs, at most MaxRuns Runs in sequence.  *)
(* Every commit bumps `revision`; only Run-layer commits bump               *)
(* `runRevision`. A command that carries `expected` compares it with the   *)
(* revision named by ExpectedScope: "global" is the current contract and   *)
(* implementation (judgeAdvance compares snapshot.revision), "run" is the  *)
(* alternative in which unrelated commits do not move the compared value.  *)
(*                                                                         *)
(* `advances` is the set of attempt ordinals that hold the advance. The    *)
(* design keeps it at most one element. Bug switches each break one        *)
(* property; "none" is the design.                                          *)
(***************************************************************************)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
  Inputs,            \* input identities accepted once each
  MaxRuns,           \* Runs started in sequence
  MaxAttempts,       \* attempt ordinals granted per Run
  RetriesOnChanged,  \* command.retriesOnChanged of the bounded close
  ExpectedScope,     \* "global" | "run"
  Bug                \* "none" | "second-run" | "two-advances" | "accept-stale"
                     \* | "retake" | "revive" | "post-terminal-attempt" | "silent-reconcile"

ASSUME ExpectedScope \in {"global", "run"}
ASSUME Bug \in {"none", "second-run", "two-advances", "accept-stale", "retake",
                "revive", "post-terminal-attempt", "silent-reconcile"}
ASSUME MaxRuns \in Nat /\ MaxRuns >= 1
ASSUME MaxAttempts \in Nat /\ MaxAttempts >= 1
ASSUME RetriesOnChanged \in Nat

VARIABLES
  revision,      \* the snapshot revision: every committed batch adds one
  runRevision,   \* the revision of the last commit that changed the Run layer
  runKind,       \* "none" | "active" | "terminal"
  runId,         \* the current Run (0 before the first)
  outcome,       \* "" | "completed" | "failed" | "cancelled" of the current Run
  ordinal,       \* the highest attempt ordinal granted in the current Run
  advances,      \* attempt ordinals holding the advance (design: at most one)
  superseded,    \* attempt ordinals of the current Run that lost the advance
  invoked,       \* the execution of the current Run was opened by the Agent
  pending,       \* inputs with pending eligibility
  taken,         \* inputs taken by some Run (SE14), at most once each
  takes,         \* [Inputs -> Nat]: how many times each input was taken
  history,       \* [1..MaxRuns -> outcome]: the first terminal of each Run
  staleWrites,   \* writes accepted from an attempt without the advance
  control,       \* "none" | "propagating" | "reconciled"
  confirmed,     \* the producer confirmed the cancel propagation
  close,         \* "idle" | "needed" | "done" | "abandoned": the PM-02 bounded close
  closeExpected, \* the revision the close read (-1 = not read yet)
  closeTries,    \* times the close answered changed
  runs           \* Runs started so far

vars == <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
          invoked, pending, taken, takes, history, staleWrites, control, confirmed,
          close, closeExpected, closeTries, runs>>

Outcomes == {"", "completed", "failed", "cancelled"}

Init ==
  /\ revision = 0 /\ runRevision = 0
  /\ runKind = "none" /\ runId = 0 /\ outcome = ""
  /\ ordinal = 0 /\ advances = {} /\ superseded = {} /\ invoked = FALSE
  /\ pending = {} /\ taken = {} /\ takes = [i \in Inputs |-> 0]
  /\ history = [r \in 1..MaxRuns |-> ""]
  /\ staleWrites = 0
  /\ control = "none" /\ confirmed = FALSE
  /\ close = "idle" /\ closeExpected = -1 /\ closeTries = 0
  /\ runs = 0

(* The value a command with `expected` compares against. *)
Compared == IF ExpectedScope = "global" THEN revision ELSE runRevision

Active == runKind = "active"
Terminal == runKind = "terminal"

(* A commit that does not touch the Run layer. *)
PlainCommit == /\ revision' = revision + 1 /\ UNCHANGED runRevision
(* A commit that changes the Run layer. *)
RunCommit == /\ revision' = revision + 1 /\ runRevision' = revision + 1

-----------------------------------------------------------------------------
(* accept (JC-03): an input gains pending eligibility. Not a Run-layer commit. *)
Accept(i) ==
  /\ i \notin pending /\ i \notin taken
  /\ pending' = pending \cup {i}
  /\ PlainCommit
  /\ UNCHANGED <<runKind, runId, outcome, ordinal, advances, superseded, invoked, taken, takes,
                 history, staleWrites, control, confirmed, close, closeExpected, closeTries, runs>>

(* startRun (RS-01, I-R1): a Run with its first attempt. judgeRunStart refuses while a Run is active. *)
StartRun(i) ==
  /\ i \in pending
  /\ runs < MaxRuns
  /\ (runKind /= "active" \/ Bug = "second-run")
  /\ runs' = runs + 1
  /\ runKind' = "active" /\ runId' = runs + 1 /\ outcome' = ""
  /\ ordinal' = 1 /\ advances' = {1} /\ superseded' = {} /\ invoked' = FALSE
  /\ close' = "idle" /\ closeExpected' = -1 /\ closeTries' = 0
  /\ RunCommit
  /\ UNCHANGED <<pending, taken, takes, history, staleWrites, control, confirmed>>

(* invoke accepted (RS-02): the execution exists; or refused by the message admission (PM-02). *)
Invoke ==
  /\ Active /\ ~invoked /\ advances /= {} /\ close = "idle"
  /\ invoked' = TRUE
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 pending, taken, takes, history, staleWrites, control, confirmed,
                 close, closeExpected, closeTries, runs>>

InvokeRefused ==
  /\ Active /\ ~invoked /\ advances /= {} /\ close = "idle"
  /\ close' = "needed"
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 invoked, pending, taken, takes, history, staleWrites, control, confirmed,
                 closeExpected, closeTries, runs>>

(* The Agent takes a pending input (SE14 from input-taken): at most once per input (I-R3). *)
Take(i) ==
  /\ Active /\ invoked /\ i \in pending
  /\ (i \notin taken \/ Bug = "retake")
  /\ pending' = IF Bug = "retake" THEN pending ELSE pending \ {i}
  /\ taken' = taken \cup {i}
  /\ takes' = [takes EXCEPT ![i] = @ + 1]
  /\ PlainCommit
  /\ UNCHANGED <<runKind, runId, outcome, ordinal, advances, superseded, invoked, history,
                 staleWrites, control, confirmed, close, closeExpected, closeTries, runs>>

(* release (RS-05): the attempt hands the advance back. *)
Release(a) ==
  /\ Active /\ a \in advances /\ close /= "needed"
  /\ advances' = advances \ {a}
  /\ RunCommit
  /\ UNCHANGED <<runKind, runId, outcome, ordinal, superseded, invoked, pending, taken, takes,
                 history, staleWrites, control, confirmed, close, closeExpected, closeTries, runs>>

(* claim (RS-06, RS-07, PM-05): a new attempt; the old one, if any, is superseded in the same batch.
   The execution record provider decides between the recovery and the takeover path; both end with
   exactly one attempt holding the advance (I-R2). *)
Claim ==
  /\ Active /\ ordinal < MaxAttempts /\ close /= "needed"
  /\ ordinal' = ordinal + 1
  /\ superseded' = superseded \cup advances
  /\ advances' = IF Bug = "two-advances" THEN advances \cup {ordinal + 1} ELSE {ordinal + 1}
  /\ RunCommit
  /\ UNCHANGED <<runKind, runId, outcome, invoked, pending, taken, takes, history, staleWrites,
                 control, confirmed, close, closeExpected, closeTries, runs>>

(* A claim after the terminal (I-R4): judgeAdvance answers terminal, nothing is written. *)
ClaimAfterTerminal ==
  /\ Terminal /\ Bug = "post-terminal-attempt" /\ ordinal < MaxAttempts
  /\ ordinal' = ordinal + 1
  /\ advances' = {ordinal + 1}
  /\ RunCommit
  /\ UNCHANGED <<runKind, runId, outcome, superseded, invoked, pending, taken, takes, history,
                 staleWrites, control, confirmed, close, closeExpected, closeTries, runs>>

(* A late write of an attempt that no longer holds the advance (PM-11): judgeAdvance answers
   stale-advance and the batch is not written. The bug accepts it. *)
StaleWrite(a) ==
  /\ a \in superseded /\ a \notin advances
  /\ IF Bug = "accept-stale"
       THEN /\ staleWrites' = staleWrites + 1 /\ PlainCommit
       ELSE /\ UNCHANGED <<staleWrites, revision, runRevision>>
  /\ UNCHANGED <<runKind, runId, outcome, ordinal, advances, superseded, invoked, pending, taken,
                 takes, history, control, confirmed, close, closeExpected, closeTries, runs>>

(* The same-log interpretation of the Agent's end fact (RS-08, RS-09): the Run ends by the Agent's
   conclusion. The bug lets it overwrite a cancelled terminal (I-R4). *)
AgentEnd(o) ==
  /\ o \in {"completed", "failed"}
  /\ \/ (Active /\ invoked /\ pending = {})
     \/ (Terminal /\ Bug = "revive")
  /\ runKind' = "terminal" /\ outcome' = o
  /\ advances' = {}
  /\ history' = IF history[runId] = "" THEN [history EXCEPT ![runId] = o] ELSE history
  /\ RunCommit
  /\ UNCHANGED <<runId, ordinal, superseded, invoked, pending, taken, takes, staleWrites,
                 control, confirmed, close, closeExpected, closeTries, runs>>

(* control(cancel-run) (RS-10, I-R5, PM-08): the cancelled terminal, SE16 of the live attempt and
   the control progress form in one batch. Propagation starts afterwards (PM-13). *)
Cancel ==
  /\ Active
  /\ runKind' = "terminal" /\ outcome' = "cancelled"
  /\ advances' = {}
  /\ history' = [history EXCEPT ![runId] = "cancelled"]
  /\ control' = "propagating" /\ confirmed' = FALSE
  /\ close' = IF close = "needed" THEN "done" ELSE close
  /\ RunCommit
  /\ UNCHANGED <<runId, ordinal, superseded, invoked, pending, taken, takes, staleWrites,
                 closeExpected, closeTries, runs>>

(* The producer confirms the propagation of the cancel (AD-02 reconciliation input). *)
ProducerConfirm ==
  /\ control = "propagating" /\ ~confirmed
  /\ confirmed' = TRUE
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 invoked, pending, taken, takes, history, staleWrites, control,
                 close, closeExpected, closeTries, runs>>

(* receive(control): the progress becomes reconciled only after the confirmation (PM-13). *)
Reconcile ==
  /\ control = "propagating"
  /\ (confirmed \/ Bug = "silent-reconcile")
  /\ control' = "reconciled"
  /\ PlainCommit
  /\ UNCHANGED <<runKind, runId, outcome, ordinal, advances, superseded, invoked, pending, taken,
                 takes, history, staleWrites, confirmed, close, closeExpected, closeTries, runs>>

(* The bounded close of PM-02 (advance.ts closeRefused): read the revision, then finishRun with
   `expected`. An unrelated commit in between answers changed; after RetriesOnChanged the
   coordinator gives up. While the close is needed the closing attempt keeps the advance: Release
   and Claim wait (a takeover during the close is outside this property). *)
CloseRead ==
  /\ close = "needed" /\ Active /\ closeExpected = -1
  /\ closeExpected' = Compared
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 invoked, pending, taken, takes, history, staleWrites, control, confirmed,
                 close, closeTries, runs>>

CloseCommit ==
  /\ close = "needed" /\ Active /\ closeExpected /= -1 /\ closeExpected = Compared
  /\ runKind' = "terminal" /\ outcome' = "failed"
  /\ advances' = {}
  /\ history' = [history EXCEPT ![runId] = "failed"]
  /\ close' = "done" /\ closeExpected' = -1
  /\ RunCommit
  /\ UNCHANGED <<runId, ordinal, superseded, invoked, pending, taken, takes, staleWrites,
                 control, confirmed, closeTries, runs>>

CloseChanged ==
  /\ close = "needed" /\ Active /\ closeExpected /= -1 /\ closeExpected /= Compared
  /\ closeTries' = closeTries + 1
  /\ close' = IF closeTries + 1 > RetriesOnChanged THEN "abandoned" ELSE "needed"
  /\ closeExpected' = -1
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 invoked, pending, taken, takes, history, staleWrites, control, confirmed, runs>>

Next ==
  \/ \E i \in Inputs : Accept(i) \/ StartRun(i) \/ Take(i)
  \/ Invoke \/ InvokeRefused
  \/ \E a \in 1..MaxAttempts : Release(a) \/ StaleWrite(a)
  \/ Claim \/ ClaimAfterTerminal
  \/ \E o \in {"completed", "failed"} : AgentEnd(o)
  \/ Cancel \/ ProducerConfirm \/ Reconcile
  \/ CloseRead \/ CloseCommit \/ CloseChanged

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK ==
  /\ revision \in Nat /\ runRevision \in Nat /\ runRevision <= revision
  /\ runKind \in {"none", "active", "terminal"}
  /\ runId \in 0..MaxRuns
  /\ outcome \in Outcomes
  /\ ordinal \in 0..MaxAttempts
  /\ advances \subseteq 1..MaxAttempts
  /\ superseded \subseteq 1..MaxAttempts
  /\ pending \subseteq Inputs /\ taken \subseteq Inputs
  /\ control \in {"none", "propagating", "reconciled"}
  /\ close \in {"idle", "needed", "done", "abandoned"}

(* I-R1: at most one unfinished Run. A second start while active is refused, so every Run
   before the current one has reached its terminal. *)
OneOpenRun == \A r \in 1..MaxRuns : r < runId => history[r] /= ""

(* I-R2: at most one attempt holds the advance; the ordinal only grows and an attempt that lost
   the advance never regains it. *)
OneAdvance == Cardinality(advances) <= 1
NoRegain == advances \cap superseded = {}
(* An advance is always the newest ordinal. *)
AdvanceIsNewest == \A a \in advances : a = ordinal

(* PM-11: a write of an attempt without the advance is never accepted. *)
StaleWriterRejected == staleWrites = 0

(* I-R3: every input is taken at most once. *)
TakeOnce == \A i \in Inputs : takes[i] <= 1

(* I-R4: the first terminal of a Run is the one it keeps. *)
TerminalStable == Terminal => outcome = history[runId]
(* I-R4, I-R5: no attempt holds the advance after the terminal. *)
NoPostTerminalAttempt == Terminal => advances = {}

(* PM-13: a cancel is reconciled only after the producer confirmed; before that it stays visible
   as propagating. *)
ReconcileNeedsConfirmation == control = "reconciled" => confirmed

(* PM-02: a bounded close with a valid basis is never abandoned while the Run is still active. *)
NoAbandonedClose == close /= "abandoned"

=============================================================================

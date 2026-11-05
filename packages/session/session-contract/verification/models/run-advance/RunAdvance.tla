---- MODULE RunAdvance ----
(***************************************************************************)
(* The Run and attempt layer of one Session (SPEC I-R1, I-R2, I-R3, I-R4,  *)
(* I-R5, PM-05, PM-08, PM-11, PM-13, PA-08) and the bounded close of PM-02  *)
(* under unrelated commits.                                                *)
(*                                                                         *)
(* One session, a finite set of inputs, at most MaxRuns Runs in sequence.  *)
(* Every commit bumps `revision`; only Run-layer commits bump               *)
(* `runRevision`. A command that carries `expected` compares it with the   *)
(* revision named by ExpectedScope: "global" is the contract before        *)
(* R2-D327 (judgeAdvance compared snapshot.revision), "run" is the contract *)
(* and implementation since R2-D327 and R2-D343: unrelated commits do not  *)
(* move the compared value, and no other value holds.                      *)
(*                                                                         *)
(* `advances` is the set of attempt ordinals that hold the advance. The    *)
(* design keeps it at most one element. Bug switches each break one        *)
(* property; "none" is the design.                                          *)
(*                                                                         *)
(* R2-D327 adopted "run" for ExpectedScope: positive-run is the design and *)
(* negative-global-expected the negative control. A claim is two steps by  *)
(* one of the Recoverers: it reads the Run layer, then commits with that   *)
(* `expected`. Since R2-D343 `expected` of a claim is mandatory;           *)
(* "claim-no-expected" is the negative control of a decision that leaves   *)
(* the comparison out.                                                      *)
(***************************************************************************)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
  Inputs,            \* input identities accepted once each
  Recoverers,        \* the instances that may claim the advance
  MaxRuns,           \* Runs started in sequence
  MaxAttempts,       \* attempt ordinals granted per Run
  RetriesOnChanged,  \* command.retriesOnChanged of the bounded close
  ExpectedScope,     \* "global" | "run"
  Bug                \* "none" | "second-run" | "two-advances" | "accept-stale"
                     \* | "retake" | "revive" | "post-terminal-attempt" | "silent-reconcile"
                     \* | "claim-no-expected"

ASSUME ExpectedScope \in {"global", "run"}
ASSUME Bug \in {"none", "second-run", "two-advances", "accept-stale", "retake",
                "revive", "post-terminal-attempt", "silent-reconcile", "claim-no-expected"}
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
  runs,          \* Runs started so far
  claimExp,      \* [Recoverers -> Int]: the expected each claimant read (-1 = not read)
  claimBase,     \* [Recoverers -> Int]: the Run-layer revision behind that read
  claimedFrom,   \* Run-layer revisions from which a claim committed
  doubleClaim    \* two claims committed from one read of the Run layer

vars == <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
          invoked, pending, taken, takes, history, staleWrites, control, confirmed,
          close, closeExpected, closeTries, runs, claimExp, claimBase, claimedFrom, doubleClaim>>
claimVars == <<claimExp, claimBase, claimedFrom, doubleClaim>>

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
  /\ claimExp = [r \in Recoverers |-> -1] /\ claimBase = [r \in Recoverers |-> -1]
  /\ claimedFrom = {} /\ doubleClaim = FALSE

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
  /\ UNCHANGED claimVars

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
  /\ UNCHANGED claimVars

(* invoke accepted (RS-02): the execution exists; or refused by the message admission (PM-02). *)
Invoke ==
  /\ Active /\ ~invoked /\ advances /= {} /\ close = "idle"
  /\ invoked' = TRUE
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 pending, taken, takes, history, staleWrites, control, confirmed,
                 close, closeExpected, closeTries, runs>>
  /\ UNCHANGED claimVars

InvokeRefused ==
  /\ Active /\ ~invoked /\ advances /= {} /\ close = "idle"
  /\ close' = "needed"
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 invoked, pending, taken, takes, history, staleWrites, control, confirmed,
                 closeExpected, closeTries, runs>>
  /\ UNCHANGED claimVars

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
  /\ UNCHANGED claimVars

(* release (RS-05): the attempt hands the advance back. *)
Release(a) ==
  /\ Active /\ a \in advances /\ close /= "needed"
  /\ advances' = advances \ {a}
  /\ RunCommit
  /\ UNCHANGED <<runKind, runId, outcome, ordinal, superseded, invoked, pending, taken, takes,
                 history, staleWrites, control, confirmed, close, closeExpected, closeTries, runs>>
  /\ UNCHANGED claimVars

(* claim (RS-06, RS-07, PM-05) is two steps of one recoverer. ClaimRead reads the Run layer and keeps
   the value its `expected` names. ClaimCommit is the conditional commit: a new attempt, the old one,
   if any, superseded in the same batch. The execution record provider decides between the recovery
   and the takeover path; both end with exactly one attempt holding the advance (I-R2). With a stale
   `expected` the claim is refused (stale-advance or changed) and the recoverer may read again.
   "claim-no-expected" commits without the comparison: a decision that does not compare `expected`. *)
ClaimRead(r) ==
  /\ Active /\ claimExp[r] = -1
  /\ claimExp' = [claimExp EXCEPT ![r] = Compared]
  /\ claimBase' = [claimBase EXCEPT ![r] = runRevision]
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 invoked, pending, taken, takes, history, staleWrites, control, confirmed,
                 close, closeExpected, closeTries, runs, claimedFrom, doubleClaim>>

ClaimCommit(r) ==
  /\ Active /\ claimExp[r] /= -1 /\ ordinal < MaxAttempts /\ close /= "needed"
  /\ claimExp' = [claimExp EXCEPT ![r] = -1]
  /\ claimBase' = [claimBase EXCEPT ![r] = -1]
  /\ IF claimExp[r] = Compared \/ Bug = "claim-no-expected"
       THEN /\ ordinal' = ordinal + 1
            /\ superseded' = superseded \cup advances
            /\ advances' = IF Bug = "two-advances" THEN advances \cup {ordinal + 1} ELSE {ordinal + 1}
            /\ doubleClaim' = (doubleClaim \/ claimBase[r] \in claimedFrom)
            /\ claimedFrom' = claimedFrom \cup {claimBase[r]}
            /\ RunCommit
       ELSE UNCHANGED <<ordinal, superseded, advances, doubleClaim, claimedFrom, revision,
                        runRevision>>
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
  /\ UNCHANGED claimVars

(* A late write of an attempt that no longer holds the advance (PM-11): judgeAdvance answers
   stale-advance and the batch is not written. The bug accepts it. *)
StaleWrite(a) ==
  /\ a \in superseded /\ a \notin advances
  /\ IF Bug = "accept-stale"
       THEN /\ staleWrites' = staleWrites + 1 /\ PlainCommit
       ELSE /\ UNCHANGED <<staleWrites, revision, runRevision>>
  /\ UNCHANGED <<runKind, runId, outcome, ordinal, advances, superseded, invoked, pending, taken,
                 takes, history, control, confirmed, close, closeExpected, closeTries, runs>>
  /\ UNCHANGED claimVars

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
  /\ UNCHANGED claimVars

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
  /\ UNCHANGED claimVars

(* The producer confirms the propagation of the cancel (AD-02 reconciliation input). *)
ProducerConfirm ==
  /\ control = "propagating" /\ ~confirmed
  /\ confirmed' = TRUE
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 invoked, pending, taken, takes, history, staleWrites, control,
                 close, closeExpected, closeTries, runs>>
  /\ UNCHANGED claimVars

(* receive(control): the progress becomes reconciled only after the confirmation (PM-13). *)
Reconcile ==
  /\ control = "propagating"
  /\ (confirmed \/ Bug = "silent-reconcile")
  /\ control' = "reconciled"
  /\ PlainCommit
  /\ UNCHANGED <<runKind, runId, outcome, ordinal, advances, superseded, invoked, pending, taken,
                 takes, history, staleWrites, confirmed, close, closeExpected, closeTries, runs>>
  /\ UNCHANGED claimVars

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
  /\ UNCHANGED claimVars

CloseCommit ==
  /\ close = "needed" /\ Active /\ closeExpected /= -1 /\ closeExpected = Compared
  /\ runKind' = "terminal" /\ outcome' = "failed"
  /\ advances' = {}
  /\ history' = [history EXCEPT ![runId] = "failed"]
  /\ close' = "done" /\ closeExpected' = -1
  /\ RunCommit
  /\ UNCHANGED <<runId, ordinal, superseded, invoked, pending, taken, takes, staleWrites,
                 control, confirmed, closeTries, runs>>
  /\ UNCHANGED claimVars

CloseChanged ==
  /\ close = "needed" /\ Active /\ closeExpected /= -1 /\ closeExpected /= Compared
  /\ closeTries' = closeTries + 1
  /\ close' = IF closeTries + 1 > RetriesOnChanged THEN "abandoned" ELSE "needed"
  /\ closeExpected' = -1
  /\ UNCHANGED <<revision, runRevision, runKind, runId, outcome, ordinal, advances, superseded,
                 invoked, pending, taken, takes, history, staleWrites, control, confirmed, runs>>
  /\ UNCHANGED claimVars

Next ==
  \/ \E i \in Inputs : Accept(i) \/ StartRun(i) \/ Take(i)
  \/ Invoke \/ InvokeRefused
  \/ \E a \in 1..MaxAttempts : Release(a) \/ StaleWrite(a)
  \/ \E r \in Recoverers : ClaimRead(r) \/ ClaimCommit(r)
  \/ ClaimAfterTerminal
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
  /\ claimedFrom \subseteq 0..revision

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

(* PM-05, I-R2 (R2-D327): of two claims that read the same Run layer, at most one commits; the
   other gets stale-advance. *)
OneClaimPerRead == ~doubleClaim

(* PM-02: a bounded close with a valid basis is never abandoned while the Run is still active. *)
NoAbandonedClose == close /= "abandoned"

=============================================================================

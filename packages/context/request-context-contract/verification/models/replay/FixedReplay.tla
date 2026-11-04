---------------------------- MODULE FixedReplay ----------------------------
(***************************************************************************)
(* One step of one scope: a coordinator prepares a request, fixes it (M0),  *)
(* admits it to Model, and may crash at any point in between.  After a      *)
(* crash the in-process request is gone; only the fixed record survives.    *)
(* The model asks two questions.                                            *)
(*                                                                          *)
(* 1. ReplayEqual: does preparing again from the same fixed basis give the  *)
(*    same request content?  The content is a pure function of the stably   *)
(*    read materials (RQ-01), but the materials are live reads: the history *)
(*    upper bound, the live revisions of groups 4 to 7, the per-request     *)
(*    tail blocks (layer 6, RC-04) and the runtime context adapter's last   *)
(*    full read (RQ-02 group 3, R4).  One of the tail blocks,               *)
(*    context.window-usage, is derived from the adopted fact, and the       *)
(*    fixing itself changes the adopted fact (RQ-14).                       *)
(*                                                                          *)
(* 2. Under the recovery protocol that does not rely on (1): an identity    *)
(*    is re-admitted only with a content digest equal to the recorded one;  *)
(*    otherwise the attempt is voided after an authoritative not-accepted   *)
(*    and a new attempt prepares afresh.  Does Model ever hold a request    *)
(*    that the fixed record does not describe, does an identity ever meet   *)
(*    two contents, and does the step always reach an admitted request?     *)
(*                                                                          *)
(* Contents are tuples, standing for collision-free digests.                *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  MaxHist,          \* history length bound
  MaxLive,          \* bound of the live revision of groups 4 to 7
  MaxClock,         \* bound of a per-request clock block
  MaxCrashes,
  MaxAttempts,
  \* environment switches: which live inputs may move between M0 and recovery
  TailHasWindowUsage,  \* layer 6 carries context.window-usage (RQ-02 block table)
  TailHasClock,        \* layer 6 carries another per-request block
  AdapterDurable,      \* the adapter's last full-read material survives a crash
  LiveChanges,         \* prompt, tools, profile or runtime context revisions move
  InputArrives,        \* a new saved input appends to the history
  \* protocol switches (negative controls)
  NaiveReadmit,        \* re-admit the re-prepared request under the old identity
  CompareTokensOnly,   \* decide "same request" from source revisions, not content
  KeepVoidedAdopted,   \* the adopted view keeps a voided attempt
  InspectMayBeUnknown  \* Model inspection may answer unknown for a while

NoD == <<"none">>
NoF == [d |-> NoD, anchor |-> 0, live |-> 0, hist |-> 0]
Attempts == 1..MaxAttempts

VARIABLES
  hist,      \* model-visible history length (append-only)
  live,      \* live revision of groups 4 to 7
  clock,     \* value of a per-request block
  adapter,   \* [has, live, anchor]: last full read kept by the runtime context adapter
  fixing,    \* attempt -> fixed record (the FixedRequestRecord plus its inputDigest)
  voided,    \* voided attempts (intent.voided)
  att,       \* current attempt
  phase,     \* start | ready | fixed | inflight | recover | done | stuck
  mem,       \* in-process ready request
  memAnchor, \* snapshot anchor of the in-process request
  accepted,  \* attempt -> content Model accepted under that identity
  conflict,  \* Model answered conflict: same identity, other content
  crashes

vars == <<hist, live, clock, adapter, fixing, voided, att, phase, mem, memAnchor,
          accepted, conflict, crashes>>

(* The fixing the adopted source returns now: the latest fixed attempt that    *)
(* is not voided; attempt 0 is the previous request of the scope.             *)
Fixed == {a \in Attempts : fixing[a] # NoF}
Visible == IF KeepVoidedAdopted THEN Fixed ELSE Fixed \ voided
AdoptedAtt == IF Visible = {} THEN 0
              ELSE CHOOSE a \in Visible : \A b \in Visible : b <= a
AdoptedAnchor == IF AdoptedAtt = 0 THEN 0 ELSE fixing[AdoptedAtt].anchor

(* Incremental read: the adapter still holds the full read of this revision.  *)
Incremental == adapter.has /\ adapter.live = live
AnchorNow == IF Incremental THEN AdoptedAnchor ELSE hist
TailNow == <<IF TailHasWindowUsage THEN AdoptedAtt ELSE 0,
             IF TailHasClock THEN clock ELSE 0>>
ContentNow == <<hist, live, AnchorNow, TailNow>>
TokensNow == <<hist, live>>

TypeOK ==
  /\ hist \in 0..MaxHist /\ live \in 0..MaxLive /\ clock \in 0..MaxClock
  /\ att \in 1..(MaxAttempts + 1)
  /\ phase \in {"start", "ready", "fixed", "inflight", "recover", "done", "stuck"}
  /\ voided \subseteq Attempts
  /\ conflict \in BOOLEAN
  /\ crashes \in 0..MaxCrashes

Init ==
  /\ hist = 1 /\ live = 0 /\ clock = 0
  \* the previous request read in full at an earlier history tail (anchor 0)
  /\ adapter = [has |-> TRUE, live |-> 0, anchor |-> 0]
  /\ fixing = [a \in Attempts |-> NoF]
  /\ voided = {}
  /\ att = 1
  /\ phase = "start"
  /\ mem = NoD /\ memAnchor = 0
  /\ accepted = [a \in Attempts |-> NoD]
  /\ conflict = FALSE
  /\ crashes = 0

(* I1..P1: stable read and pure derivation; a full read refreshes the adapter. *)
Prepare ==
  /\ phase = "start" /\ att \in Attempts
  /\ mem' = ContentNow
  /\ memAnchor' = AnchorNow
  /\ adapter' = IF Incremental THEN adapter
                ELSE [has |-> TRUE, live |-> live, anchor |-> hist]
  /\ phase' = "ready"
  /\ UNCHANGED <<hist, live, clock, fixing, voided, att, accepted, conflict, crashes>>

(* M0: the final request record; the adopted source changes in the same commit. *)
Fix ==
  /\ phase = "ready"
  /\ fixing' = [fixing EXCEPT ![att] =
                  [d |-> mem, anchor |-> memAnchor, live |-> mem[2], hist |-> mem[1]]]
  /\ phase' = "fixed"
  /\ UNCHANGED <<hist, live, clock, adapter, voided, att, mem, memAnchor, accepted,
                 conflict, crashes>>

(* admit: same identity, same content is idempotent; other content is conflict. *)
Admit ==
  /\ phase = "fixed"
  /\ IF accepted[att] = NoD
       THEN /\ accepted' = [accepted EXCEPT ![att] = mem]
            /\ phase' = "inflight" /\ UNCHANGED conflict
     ELSE IF accepted[att] = mem
       THEN /\ phase' = "inflight" /\ UNCHANGED <<accepted, conflict>>
     ELSE /\ conflict' = TRUE /\ phase' = "stuck" /\ UNCHANGED accepted
  /\ UNCHANGED <<hist, live, clock, adapter, fixing, voided, att, mem, memAnchor, crashes>>

Ack ==
  /\ phase = "inflight"
  /\ phase' = "done"
  /\ UNCHANGED <<hist, live, clock, adapter, fixing, voided, att, mem, memAnchor,
                 accepted, conflict, crashes>>

(* A crash loses the in-process request and, unless durable, the adapter state. *)
Crash ==
  /\ crashes < MaxCrashes
  /\ phase \in {"ready", "fixed", "inflight"}
  /\ mem' = NoD
  /\ adapter' = IF AdapterDurable THEN adapter ELSE [adapter EXCEPT !.has = FALSE]
  /\ phase' = IF fixing[att] # NoF THEN "recover" ELSE "start"
  /\ crashes' = crashes + 1
  /\ UNCHANGED <<hist, live, clock, fixing, voided, att, memAnchor, accepted, conflict>>

(* Recovery, first branch: Model holds the request; no preparation happens.   *)
RecoverFound ==
  /\ phase = "recover" /\ accepted[att] # NoD
  /\ phase' = "done"
  /\ UNCHANGED <<hist, live, clock, adapter, fixing, voided, att, mem, memAnchor,
                 accepted, conflict, crashes>>

(* Inspection answers unknown: the safe protocol keeps waiting; the naive one   *)
(* prepares again and re-admits under the same identity.                        *)
RecoverUnknown ==
  /\ InspectMayBeUnknown /\ NaiveReadmit
  /\ phase = "recover" /\ accepted[att] # NoD
  /\ mem' = ContentNow /\ memAnchor' = AnchorNow
  /\ adapter' = IF Incremental THEN adapter
                ELSE [has |-> TRUE, live |-> live, anchor |-> hist]
  /\ phase' = "fixed"
  /\ UNCHANGED <<hist, live, clock, fixing, voided, att, accepted, conflict, crashes>>

SameRequest(rec) ==
  IF CompareTokensOnly THEN TokensNow = <<rec.hist, rec.live>> ELSE ContentNow = rec.d

(* Recovery, second branch: authoritative not-accepted.  Prepare again; reuse   *)
(* the identity only for the same content, else void and take attempt + 1.     *)
RecoverNotAccepted ==
  /\ phase = "recover" /\ accepted[att] = NoD
  /\ adapter' = IF Incremental THEN adapter
                ELSE [has |-> TRUE, live |-> live, anchor |-> hist]
  /\ IF NaiveReadmit \/ SameRequest(fixing[att])
       THEN /\ mem' = ContentNow /\ memAnchor' = AnchorNow
            /\ phase' = "fixed"
            /\ UNCHANGED <<voided, att>>
       ELSE /\ voided' = voided \cup {att}
            /\ att' = att + 1
            /\ phase' = "start"
            /\ mem' = NoD /\ UNCHANGED memAnchor
  /\ UNCHANGED <<hist, live, clock, fixing, accepted, conflict, crashes>>

(* Environment between M0 and recovery; none of these is fair.                *)
AppendInput ==
  /\ InputArrives /\ hist < MaxHist /\ phase # "done"
  /\ hist' = hist + 1
  /\ UNCHANGED <<live, clock, adapter, fixing, voided, att, phase, mem, memAnchor,
                 accepted, conflict, crashes>>
BumpLive ==
  /\ LiveChanges /\ live < MaxLive /\ phase # "done"
  /\ live' = live + 1
  /\ UNCHANGED <<hist, clock, adapter, fixing, voided, att, phase, mem, memAnchor,
                 accepted, conflict, crashes>>
Tick ==
  /\ TailHasClock /\ clock < MaxClock /\ phase # "done"
  /\ clock' = clock + 1
  /\ UNCHANGED <<hist, live, adapter, fixing, voided, att, phase, mem, memAnchor,
                 accepted, conflict, crashes>>

Protocol == Prepare \/ Fix \/ Admit \/ Ack \/ RecoverFound \/ RecoverUnknown
            \/ RecoverNotAccepted
Next == Protocol \/ Crash \/ AppendInput \/ BumpLive \/ Tick

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(Prepare) /\ WF_vars(Fix) /\ WF_vars(Admit) /\ WF_vars(Ack)
            /\ WF_vars(RecoverFound) /\ WF_vars(RecoverNotAccepted)

----------------------------------------------------------------------------
(* The claim under test: preparing again from the fixed basis gives the same  *)
(* content.  It is checked in the recovery state, before any new preparation. *)
ReplayEqual == phase = "recover" => ContentNow = fixing[att].d

(* Every request Model holds is the one its fixed record describes.           *)
SentMatchesRecord ==
  \A a \in Attempts : accepted[a] # NoD => fixing[a] # NoF /\ fixing[a].d = accepted[a]

(* No identity meets two contents.                                            *)
NoConflict == ~conflict

(* The adopted fact a preparation reads is never a voided attempt.            *)
AdoptedNotVoided == AdoptedAtt \notin voided

(* Attempts never run out within the crash budget.                            *)
AttemptsSuffice == att <= MaxAttempts \/ phase = "done"

(* Liveness: the step reaches an admitted request.                            *)
Progress == <>(phase = "done")
=============================================================================

---------------------------- MODULE Invocation ----------------------------
(***************************************************************************)
(* capability.model-request-runtime v1 -- one model call, many dispatches. *)
(*                                                                         *)
(* One call, observed across process crashes and new run attempts.         *)
(* Durable facts (survive a crash): the two anchors ("out" = left the      *)
(* process, "spokeA" = first token recorded), response bodies, the         *)
(* interrupt intent and the call-end record.  Volatile facts (lost on a    *)
(* crash): the runtime's in-memory phase, pending abort, pending teardown, *)
(* and the two "gap" markers used by the negative configurations.          *)
(* External facts (cannot be undone): "sent" = the request reached the     *)
(* wire; "seen" = an observer was handed content of that dispatch.         *)
(*                                                                         *)
(* Five toggles turn one ordering or check off each; the positive          *)
(* configurations keep all of them TRUE, each negative configuration       *)
(* flips exactly one and is expected to produce a counterexample.         *)
(*   OutFirst         -- S-15: "out" is written before the request leaves  *)
(*   SpokeFirst       -- S-15: "spokeA" is written before content is seen  *)
(*   IntentFirst      -- S-31: interrupt intent is written before abort    *)
(*   GuardOn          -- S-30 guards 1 and 2: already-spoke, fact-class    *)
(*   IdempotentSettle -- S-17: a settlement writes nothing if a body exists*)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS NumProviders, AllowFallback, MaxDispatch, MaxCrashes,
          OutFirst, SpokeFirst, IntentFirst, GuardOn, IdempotentSettle

D == 1..MaxDispatch
P == 1..NumProviders
Initiators == {"user", "run_cancelled"}

\* Outcome of one dispatch as recorded on its response body.
\*   failed_strategy : failure before first token, cause in the strategy class
\*   failed_fact     : failure before first token, cause in a fact class
\*   failed_mid      : failure after first token (interrupted_mid_reply)
\*   int_user / int_cancel : interrupted, initiator user / run_cancelled
\*   lost_silent / lost_spoken : interrupted{runtime_lost} written by
\*                     reconcile, without / with a first token
Outcomes == {"none", "complete", "failed_strategy", "failed_fact", "failed_mid",
             "int_user", "int_cancel", "lost_silent", "lost_spoken"}
TerminalOutcomes    == {"complete", "int_user", "int_cancel", "lost_spoken"}
ContinuableOutcomes == {"failed_strategy", "lost_silent"}

Phases == {"idle", "open", "sending", "inflight", "speaking", "awaiting",
           "resumable", "ended", "down", "gone"}
Live   == {"open", "sending", "inflight", "speaking", "awaiting", "resumable"}

VARIABLES
  phase,        \* volatile: runtime's view of the call
  nd,           \* number of dispatches (re-derived from durable facts on crash)
  out,          \* durable: "left the process" anchor per dispatch
  sent,         \* external: request reached the wire
  spokeA,       \* durable: "first token" anchor per dispatch
  seen,         \* external: an observer was handed content
  prov,         \* durable (on the anchor): provider of each dispatch
  att,          \* durable (on the anchor): run attempt of each dispatch
  nbody,        \* durable: number of response bodies written per dispatch
  outcome,      \* durable: outcome on the (last written) body
  bft,          \* durable: body records a first token
  intent,       \* durable: interrupt intent ("none" | initiator)
  callEnd,      \* durable: call-end record ("none"|"undispatched"|"handed_up"|"interrupted")
  aborting,     \* volatile: abort signalled, not yet settled
  td,           \* volatile: dispatch the host teardown is about to settle (0 = none)
  stopped,      \* volatile: host is stopping
  gapSend,      \* volatile: sent but anchor not yet written (only if ~OutFirst)
  gapSeen,      \* volatile: seen but anchor not yet written (only if ~SpokeFirst)
  attempt,      \* current run attempt
  crashes,
  ackNd,        \* ghost: nd when an interrupt was acknowledged to its caller
  ackInit,      \* ghost: initiator of that interrupt
  ackPre        \* ghost: dispatch ackNd already had a body at that moment

vars == <<phase, nd, out, sent, spokeA, seen, prov, att, nbody, outcome, bft,
          intent, callEnd, aborting, td, stopped, gapSend, gapSeen,
          attempt, crashes, ackNd, ackInit, ackPre>>

Allowed(p)       == p \in P /\ (~AllowFallback => p = 1)
AnySpoke         == \E d \in D : spokeA[d]
IntentOutcome(i) == IF i = "user" THEN "int_user" ELSE "int_cancel"
CanSettle(d)     == nbody[d] < 2 /\ (IdempotentSettle => nbody[d] = 0)
Max(S)           == CHOOSE m \in S : \A k \in S : k <= m
LastDurable      == LET S == {d \in 1..nd : out[d] \/ nbody[d] > 0}
                    IN  IF S = {} THEN 0 ELSE Max(S)

WriteBody(d, o, f) ==
  /\ nbody'   = [nbody   EXCEPT ![d] = @ + 1]
  /\ outcome' = [outcome EXCEPT ![d] = o]
  /\ bft'     = [bft     EXCEPT ![d] = f]

-----------------------------------------------------------------------------

Init ==
  /\ phase = "idle" /\ nd = 0
  /\ out = [d \in D |-> FALSE]    /\ sent = [d \in D |-> FALSE]
  /\ spokeA = [d \in D |-> FALSE] /\ seen = [d \in D |-> FALSE]
  /\ prov = [d \in D |-> 0]       /\ att = [d \in D |-> 0]
  /\ nbody = [d \in D |-> 0]      /\ outcome = [d \in D |-> "none"]
  /\ bft = [d \in D |-> FALSE]
  /\ intent = "none" /\ callEnd = "none" /\ aborting = "none"
  /\ td = 0 /\ stopped = FALSE /\ gapSend = 0 /\ gapSeen = 0
  /\ attempt = 1 /\ crashes = 0
  /\ ackNd = 0 /\ ackInit = "none" /\ ackPre = FALSE

\* S-28: pre-dispatch check passes (nothing durable) or fails (undispatched).
OpenPass ==
  /\ phase = "idle" /\ phase' = "open"
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, nbody, outcome, bft,
                 intent, callEnd, aborting, td, stopped, gapSend, gapSeen,
                 attempt, crashes, ackNd, ackInit, ackPre>>

OpenFail ==
  /\ phase = "idle" /\ phase' = "ended" /\ callEnd' = "undispatched"
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, nbody, outcome, bft,
                 intent, aborting, td, stopped, gapSend, gapSeen,
                 attempt, crashes, ackNd, ackInit, ackPre>>

\* Shared part of S-29 dispatch and S-30 dispatchAgain.
StartDispatch(p) ==
  /\ nd < MaxDispatch
  /\ ~stopped /\ aborting = "none" /\ td = 0
  /\ nd'   = nd + 1
  /\ prov' = [prov EXCEPT ![nd + 1] = p]
  /\ att'  = [att  EXCEPT ![nd + 1] = attempt]
  /\ out'  = IF OutFirst THEN [out EXCEPT ![nd + 1] = TRUE] ELSE out
  /\ phase' = "sending"
  /\ UNCHANGED <<sent, spokeA, seen, nbody, outcome, bft, intent, callEnd,
                 aborting, td, stopped, gapSend, gapSeen, attempt, crashes,
                 ackNd, ackInit, ackPre>>

\* S-29: first dispatch goes to the first provider; a resumed call goes to
\* the provider of the dispatch that was lost.
Dispatch ==
  /\ phase \in {"open", "resumable"}
  /\ GuardOn => ~AnySpoke
  /\ StartDispatch(IF phase = "open" THEN 1 ELSE prov[nd])

\* S-30: the loop read a retry{plan}; the plan's provider is a free choice
\* constrained only by the guards.
DispatchAgain(p) ==
  /\ phase = "awaiting"
  /\ GuardOn => (~AnySpoke /\ outcome[nd] = "failed_strategy")
  /\ Allowed(p)
  /\ StartDispatch(p)

Send ==
  /\ phase = "sending" /\ aborting = "none" /\ ~stopped
  /\ sent' = [sent EXCEPT ![nd] = TRUE]
  /\ gapSend' = IF OutFirst THEN 0 ELSE nd
  /\ phase' = "inflight"
  /\ UNCHANGED <<nd, out, spokeA, seen, prov, att, nbody, outcome, bft,
                 intent, callEnd, aborting, td, stopped, gapSeen,
                 attempt, crashes, ackNd, ackInit, ackPre>>

AnchorOut ==
  /\ gapSend # 0
  /\ out' = [out EXCEPT ![gapSend] = TRUE]
  /\ gapSend' = 0
  /\ UNCHANGED <<phase, nd, sent, spokeA, seen, prov, att, nbody, outcome, bft,
                 intent, callEnd, aborting, td, stopped, gapSeen,
                 attempt, crashes, ackNd, ackInit, ackPre>>

\* S-16: first token arrives.  With SpokeFirst the anchor is written before
\* any observer gets content; otherwise content is handed out first.
FirstToken ==
  /\ phase = "inflight" /\ gapSend = 0
  /\ IF SpokeFirst
       THEN /\ spokeA' = [spokeA EXCEPT ![nd] = TRUE]
            /\ UNCHANGED <<seen, gapSeen>>
       ELSE /\ seen' = [seen EXCEPT ![nd] = TRUE]
            /\ gapSeen' = nd
            /\ UNCHANGED spokeA
  /\ phase' = "speaking"
  /\ UNCHANGED <<nd, out, sent, prov, att, nbody, outcome, bft, intent, callEnd,
                 aborting, td, stopped, gapSend, attempt, crashes,
                 ackNd, ackInit, ackPre>>

Deliver ==
  /\ SpokeFirst /\ phase = "speaking" /\ spokeA[nd] /\ ~seen[nd]
  /\ seen' = [seen EXCEPT ![nd] = TRUE]
  /\ UNCHANGED <<phase, nd, out, sent, spokeA, prov, att, nbody, outcome, bft,
                 intent, callEnd, aborting, td, stopped, gapSend, gapSeen,
                 attempt, crashes, ackNd, ackInit, ackPre>>

AnchorSpoke ==
  /\ gapSeen # 0
  /\ spokeA' = [spokeA EXCEPT ![gapSeen] = TRUE]
  /\ gapSeen' = 0
  /\ UNCHANGED <<phase, nd, out, sent, seen, prov, att, nbody, outcome, bft,
                 intent, callEnd, aborting, td, stopped, gapSend,
                 attempt, crashes, ackNd, ackInit, ackPre>>

\* The upstream ends the dispatch in one of four ways.
Complete ==
  /\ phase = "speaking" /\ gapSeen = 0 /\ CanSettle(nd)
  /\ WriteBody(nd, "complete", TRUE)
  /\ phase' = "ended"
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, intent, callEnd,
                 aborting, td, stopped, gapSend, gapSeen, attempt, crashes,
                 ackNd, ackInit, ackPre>>

FailBefore(o) ==
  /\ phase = "inflight" /\ gapSend = 0 /\ CanSettle(nd)
  /\ WriteBody(nd, o, FALSE)
  /\ phase' = "awaiting"
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, intent, callEnd,
                 aborting, td, stopped, gapSend, gapSeen, attempt, crashes,
                 ackNd, ackInit, ackPre>>

FailAfter ==
  /\ phase = "speaking" /\ gapSeen = 0 /\ CanSettle(nd)
  /\ WriteBody(nd, "failed_mid", TRUE)
  /\ phase' = "awaiting"
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, intent, callEnd,
                 aborting, td, stopped, gapSend, gapSeen, attempt, crashes,
                 ackNd, ackInit, ackPre>>

\* S-32: the loop lets go of the call.
Release ==
  /\ phase \in {"awaiting", "resumable"} /\ aborting = "none"
  /\ callEnd' = "handed_up" /\ phase' = "ended"
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, nbody, outcome, bft,
                 intent, aborting, td, stopped, gapSend, gapSeen,
                 attempt, crashes, ackNd, ackInit, ackPre>>

\* S-31: the operation returns (is acknowledged) once the intent is written.
Interrupt(i) ==
  /\ phase \in Live /\ aborting = "none" /\ ackInit = "none"
  /\ intent'   = IF IntentFirst THEN i ELSE intent
  /\ aborting' = i
  /\ ackNd' = nd /\ ackInit' = i
  /\ ackPre' = (nd > 0 /\ nbody[nd] > 0)
  /\ UNCHANGED <<phase, nd, out, sent, spokeA, seen, prov, att, nbody, outcome,
                 bft, callEnd, td, stopped, gapSend, gapSeen, attempt, crashes>>

Abort ==
  /\ aborting # "none" /\ gapSend = 0 /\ gapSeen = 0
  /\ \/ /\ phase \in {"sending", "inflight", "speaking"}
        /\ CanSettle(nd)
        /\ WriteBody(nd, IntentOutcome(aborting), spokeA[nd])
        /\ UNCHANGED callEnd
     \/ /\ phase \in {"open", "awaiting", "resumable"}
        /\ callEnd' = "interrupted"
        /\ UNCHANGED <<nbody, outcome, bft>>
  /\ phase' = "ended" /\ aborting' = "none"
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, intent, td, stopped,
                 gapSend, gapSeen, attempt, crashes, ackNd, ackInit, ackPre>>

\* S-36: the host stops.  An in-flight dispatch is handed to the teardown
\* settlement, which races the normal settlement (S-17).
HostStop ==
  /\ ~stopped /\ phase \in Live
  /\ stopped' = TRUE
  /\ IF phase \in {"sending", "inflight", "speaking"}
       THEN /\ td' = nd
            /\ UNCHANGED <<phase, callEnd>>
       ELSE /\ callEnd' = "interrupted" /\ phase' = "ended"
            /\ UNCHANGED td
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, nbody, outcome, bft,
                 intent, aborting, gapSend, gapSeen, attempt, crashes,
                 ackNd, ackInit, ackPre>>

TeardownWrite ==
  /\ td # 0 /\ gapSend = 0 /\ gapSeen = 0
  /\ IF CanSettle(td)
       THEN /\ WriteBody(td, "int_cancel", spokeA[td])
            /\ phase' = IF phase \in {"sending", "inflight", "speaking"}
                          THEN "ended" ELSE phase
            /\ UNCHANGED callEnd
       ELSE /\ UNCHANGED <<nbody, outcome, bft>>
            /\ IF phase = "awaiting"
                 THEN callEnd' = "interrupted" /\ phase' = "ended"
                 ELSE UNCHANGED <<callEnd, phase>>
  /\ td' = 0
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, intent, aborting,
                 stopped, gapSend, gapSeen, attempt, crashes,
                 ackNd, ackInit, ackPre>>

\* Loss of continuity: every volatile fact is gone.
Crash ==
  /\ crashes < MaxCrashes /\ phase \in Live
  /\ crashes' = crashes + 1
  /\ phase' = "down"
  /\ nd' = LastDurable
  /\ aborting' = "none" /\ td' = 0 /\ stopped' = FALSE
  /\ gapSend' = 0 /\ gapSeen' = 0
  /\ UNCHANGED <<out, sent, spokeA, seen, prov, att, nbody, outcome, bft,
                 intent, callEnd, attempt, ackNd, ackInit, ackPre>>

\* S-33: the new attempt reconciles from durable facts only.
Reconcile ==
  /\ phase = "down"
  /\ attempt' = attempt + 1
  \* Rows are tried top to bottom (contract S-33, reconciliation table).
  /\ IF callEnd # "none" \/ (nd > 0 /\ outcome[nd] \in TerminalOutcomes)
       THEN phase' = "ended" /\ UNCHANGED <<nbody, outcome, bft, callEnd>>
     \* Nothing went out.  An interrupt intent is a durable record of this
     \* call: row 2 ends it as interrupted.  Without one, an open call left
     \* no trace and is simply gone.
     ELSE IF nd = 0
       THEN IF intent # "none"
              THEN /\ callEnd' = "interrupted" /\ phase' = "ended"
                   /\ UNCHANGED <<nbody, outcome, bft>>
            ELSE phase' = "gone" /\ UNCHANGED <<nbody, outcome, bft, callEnd>>
     ELSE IF nbody[nd] = 0
       THEN IF intent # "none"
              THEN /\ WriteBody(nd, IntentOutcome(intent), spokeA[nd])
                   /\ phase' = "ended" /\ UNCHANGED callEnd
            ELSE IF spokeA[nd]
              THEN /\ WriteBody(nd, "lost_spoken", TRUE)
                   /\ phase' = "ended" /\ UNCHANGED callEnd
            ELSE /\ WriteBody(nd, "lost_silent", FALSE)
                 /\ phase' = "resumable" /\ UNCHANGED callEnd
     ELSE IF intent # "none"
       THEN /\ callEnd' = "interrupted" /\ phase' = "ended"
            /\ UNCHANGED <<nbody, outcome, bft>>
     ELSE IF outcome[nd] = "lost_silent"
       THEN phase' = "resumable" /\ UNCHANGED <<nbody, outcome, bft, callEnd>>
     ELSE phase' = "awaiting" /\ UNCHANGED <<nbody, outcome, bft, callEnd>>
  /\ UNCHANGED <<nd, out, sent, spokeA, seen, prov, att, intent, aborting, td,
                 stopped, gapSend, gapSeen, crashes, ackNd, ackInit, ackPre>>

Done == phase \in {"ended", "gone"} /\ UNCHANGED vars

Progress ==
  \/ Send \/ AnchorOut \/ FirstToken \/ Deliver \/ AnchorSpoke
  \/ Complete \/ FailAfter
  \/ \E o \in {"failed_strategy", "failed_fact"} : FailBefore(o)
  \/ Abort \/ TeardownWrite \/ Reconcile

Next ==
  \/ OpenPass \/ OpenFail
  \/ Dispatch \/ \E p \in P : DispatchAgain(p)
  \/ Progress
  \/ Release \/ \E i \in Initiators : Interrupt(i)
  \/ HostStop \/ Crash
  \/ Done

Spec == Init /\ [][Next]_vars /\ WF_vars(Progress)

-----------------------------------------------------------------------------
(* Invariants.  Clause references are to contract.md of this version.     *)

TypeOK ==
  /\ phase \in Phases /\ nd \in 0..MaxDispatch
  /\ out \in [D -> BOOLEAN] /\ sent \in [D -> BOOLEAN]
  /\ spokeA \in [D -> BOOLEAN] /\ seen \in [D -> BOOLEAN]
  /\ prov \in [D -> 0..NumProviders] /\ att \in [D -> 0..(MaxCrashes + 1)]
  /\ nbody \in [D -> 0..2] /\ outcome \in [D -> Outcomes] /\ bft \in [D -> BOOLEAN]
  /\ intent \in {"none"} \cup Initiators
  /\ callEnd \in {"none", "undispatched", "handed_up", "interrupted"}
  /\ aborting \in {"none"} \cup Initiators
  /\ td \in 0..MaxDispatch /\ stopped \in BOOLEAN
  /\ gapSend \in 0..MaxDispatch /\ gapSeen \in 0..MaxDispatch
  /\ attempt \in 1..(MaxCrashes + 1) /\ crashes \in 0..MaxCrashes

\* S-17: one dispatch, at most one response body (first settler wins).
AtMostOneBodyPerDispatch == \A d \in D : nbody[d] <= 1

\* S-8: bodies only for dispatches that have the "out" anchor.
BodyOnlyForAnchored == \A d \in D : nbody[d] >= 1 => out[d]

\* S-15 first row: every request on the wire is anchored (or the live
\* process still holds it in the gap).
EverySentIsAnchored == \A d \in D : sent[d] => (out[d] \/ gapSend = d)

\* S-15 second row: every content an observer saw is anchored.
EverySeenIsAnchored == \A d \in D : seen[d] => (spokeA[d] \/ gapSeen = d)

\* S-22 item 4 / S-30 guard 1 (already_spoke): once any dispatch spoke, no
\* later dispatch, across attempts.
NoDispatchAfterSpoke ==
  \A d1, d2 \in D : (d1 < d2 /\ spokeA[d1]) => (~out[d2] /\ ~sent[d2])

\* The observable form of the same rule: content that was seen is never
\* followed by another request on the wire ("one logical reply, sent once").
NoDispatchAfterSeen ==
  \A d1, d2 \in D : (d1 < d2 /\ seen[d1]) => ~sent[d2]

\* S-22 item 3: a later dispatch exists only after a strategy-class failure
\* or a silent loss (covers: after terminal, after fact class, after spoke).
ContinuationOnlyAfterStrategyOrSilentLoss ==
  \A d1, d2 \in D : (d1 < d2 /\ out[d2]) => outcome[d1] \in ContinuableOutcomes

\* S-16 / S-18: a body's first-token flag matches the anchor; the mid-reply
\* cause occurs exactly when a first token exists.
BodyFirstTokenMatchesAnchor == \A d \in D : nbody[d] >= 1 => bft[d] = spokeA[d]
CauseMatchesFirstToken ==
  \A d \in D :
    /\ outcome[d] \in {"failed_mid", "lost_spoken", "complete"} => bft[d]
    /\ outcome[d] \in {"failed_strategy", "failed_fact", "lost_silent"} => ~bft[d]

\* S-22 items 2, 3, 5.
ProviderAllowed == \A d \in D : out[d] => Allowed(prov[d])
FirstDispatchFirstProvider == out[1] => prov[1] = 1
ResumeSameProvider ==
  \A d \in D : (d > 1 /\ out[d] /\ outcome[d - 1] = "lost_silent") => prov[d] = prov[d - 1]

\* S-5: dispatch numbers are contiguous across attempts; the attempt of each
\* dispatch never goes backwards.
ContiguousDispatches == \A d \in D : out[d] <=> d <= nd
AttemptMonotone == \A d1, d2 \in D : (d1 < d2 /\ out[d2]) => att[d1] <= att[d2]

\* S-28: an undispatched call never went out.
UndispatchedHasNoDispatch == callEnd = "undispatched" => (~out[1] /\ ~sent[1])

\* S-6: at most one terminal record per call.
AtMostOneTerminal == callEnd # "none" => \A d \in D : outcome[d] \notin TerminalOutcomes

\* S-31: after an acknowledged interrupt nothing more goes on the wire, and
\* the interrupted dispatch is never recorded as a loss.
NoDispatchAfterInterrupt ==
  ackInit # "none" => \A d \in D : sent[d] => d <= ackNd
InterruptNotMisregistered ==
  (ackInit # "none" /\ ackNd >= 1 /\ ~ackPre) =>
    outcome[ackNd] \notin {"lost_silent", "lost_spoken"}

\* S-33 / S-39: once the call is quiescent every request on the wire has a
\* response body (lost dispatches are settled, not forgotten).
QuiescentSettled ==
  phase \in {"ended", "gone"} => \A d \in D : sent[d] => nbody[d] >= 1

\* Liveness: every request on the wire is eventually settled.
SentEventuallySettled == \A d \in D : sent[d] ~> (nbody[d] >= 1)

-----------------------------------------------------------------------------
(* Reachability witnesses (used only by the Reach_* configurations, where  *)
(* TLC is expected to report them violated).                               *)

NotResumeThenComplete ==
  ~(outcome[1] = "lost_silent" /\ outcome[2] = "complete" /\ att[2] > att[1])
NotFallbackThenComplete ==
  ~(outcome[1] = "failed_strategy" /\ prov[2] = 2 /\ outcome[2] = "complete")

=============================================================================

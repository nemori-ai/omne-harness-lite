---------------------------- MODULE FilesHelper ----------------------------
(***************************************************************************)
(* Windows file backend, option C of reuse.md T1: one resident precompiled *)
(* helper process per file engine; requests carry a number and reuse the   *)
(* process.  Handles live only inside one request (opened and closed by    *)
(* the helper thread that runs it), so the model tracks per-request helper *)
(* work, not handles.                                                      *)
(*                                                                         *)
(* Host side (TypeScript transport):                                       *)
(*   Admit, Enqueue, Start, Restart, StartOk, StartFail, Dispatch,         *)
(*   ReceiveFrame, RequestTimeout, Terminate, HelperExit,                  *)
(*   Seal, DrainTimeout, Settle                                            *)
(* Helper / OS side (C# process and Windows):                              *)
(*   HelperAccept, HelperReply, HelperCrash, HelperCrashMidReply,          *)
(*   HelperGarble                                                          *)
(*                                                                         *)
(* Bug selects one negative control; "none" is the design under check.    *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    NOwner,     \* owners (acquisitions) sharing one engine
    NReq,       \* requests over the whole run
    Limit,      \* in-flight bound of the helper
    MaxFaults,  \* crashes, start failures, garbled frames, timeouts
    Bug         \* "none" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "L"

Owner == 1..NOwner
Req   == 1..NReq
OwnerOf(r) == ((r - 1) % NOwner) + 1
NoId  == 0                         \* a request number no request has
Gen   == 0..(MaxFaults + 1)

Live   == {"admitted", "queued", "dispatched"}
Final  == {"done", "rejected", "unknown", "closed", "unavailable"}
ReqState == {"new"} \cup Live \cup Final

Frame == [g : 1..(MaxFaults + 1), id : {NoId} \cup Req, k : {"full", "half"}]

VARIABLES
    hv,        \* host view of the helper: idle starting ready killing exited
    gen,       \* incarnation of the newest helper process
    alive,     \* OS truth: process of incarnation gen is running
    faults,    \* faults used so far
    req,       \* per request, as seen by the caller
    dgen,      \* incarnation a request was written to (0 = never dispatched)
    hs,        \* helper side: none running replied aborted
    outc,      \* outcome the helper computed: none done rejected
    pipe,      \* frames written by helpers and not yet read by the host
    fullRecv,  \* host read a complete frame for this request
    nans,      \* how many answers the caller got
    cause,     \* which step produced the answer
    os,        \* owner: open releasing settled
    dsealed,   \* owner was sealed when the request was dispatched
    drainTO    \* the owner's drain hit drainBoundMs once

vars == <<hv, gen, alive, faults, req, dgen, hs, outc, pipe, fullRecv,
          nans, cause, os, dsealed, drainTO>>

Sealed(o)  == os[o] # "open"
InFlight   == {r \in Req : req[r] = "dispatched"}
Queued     == {r \in Req : req[r] = "queued"}
Quiet(o)   == \A r \in Req : OwnerOf(r) = o => req[r] \notin Live

\* Answer every request in S with v; one answer per request per step.
AnswerSet(S, v, c) ==
    /\ req'   = [x \in Req |-> IF x \in S THEN v ELSE req[x]]
    /\ nans'  = [x \in Req |-> IF x \in S THEN nans[x] + 1 ELSE nans[x]]
    /\ cause' = [x \in Req |-> IF x \in S THEN c ELSE cause[x]]

\* The process of incarnation gen dies; the OS closes every handle it held.
Die ==
    /\ alive' = FALSE
    /\ hs' = [x \in Req |-> IF hs[x] = "running" /\ dgen[x] = gen
                            THEN "aborted" ELSE hs[x]]

Init ==
    /\ hv = "idle"
    /\ gen = 0
    /\ alive = FALSE
    /\ faults = 0
    /\ req = [r \in Req |-> "new"]
    /\ dgen = [r \in Req |-> 0]
    /\ hs = [r \in Req |-> "none"]
    /\ outc = [r \in Req |-> "none"]
    /\ pipe = {}
    /\ fullRecv = [r \in Req |-> FALSE]
    /\ nans = [r \in Req |-> 0]
    /\ cause = [r \in Req |-> "none"]
    /\ os = [o \in Owner |-> "open"]
    /\ dsealed = [r \in Req |-> FALSE]
    /\ drainTO = [o \in Owner |-> FALSE]

-----------------------------------------------------------------------------
(* Host: facade and engine queue *)

\* trackedFacade admission: a sealed facade answers closed before any await.
Admit(r) ==
    /\ req[r] = "new"
    /\ IF Sealed(OwnerOf(r))
         THEN AnswerSet({r}, "closed", "seal")
         ELSE /\ req' = [req EXCEPT ![r] = "admitted"]
              /\ UNCHANGED <<nans, cause>>
    /\ UNCHANGED <<hv, gen, alive, faults, dgen, hs, outc, pipe, fullRecv,
                   os, dsealed, drainTO>>

\* The engine enqueues after the facade's first await; the owner may have
\* been sealed in between, so the engine checks its own seal again.
Enqueue(r) ==
    /\ req[r] = "admitted"
    /\ IF Sealed(OwnerOf(r)) /\ Bug # "P3"
         THEN AnswerSet({r}, "closed", "seal")
         ELSE /\ req' = [req EXCEPT ![r] = "queued"]
              /\ UNCHANGED <<nans, cause>>
    /\ UNCHANGED <<hv, gen, alive, faults, dgen, hs, outc, pipe, fullRecv,
                   os, dsealed, drainTO>>

-----------------------------------------------------------------------------
(* Host: helper lifecycle *)

\* First queued request spawns the helper (lazy start).
Start ==
    /\ hv = "idle"
    /\ Queued # {}
    /\ hv' = "starting"
    /\ gen' = gen + 1
    /\ alive' = TRUE
    /\ UNCHANGED <<faults, req, dgen, hs, outc, pipe, fullRecv, nans, cause,
                   os, dsealed, drainTO>>

\* After an exit, the next queued request spawns a new incarnation.
Restart ==
    /\ Bug # "L"                    \* negative control: never restart
    /\ hv = "exited"
    /\ Queued # {}
    /\ hv' = "starting"
    /\ gen' = gen + 1
    /\ alive' = TRUE
    /\ UNCHANGED <<faults, req, dgen, hs, outc, pipe, fullRecv, nans, cause,
                   os, dsealed, drainTO>>

\* The helper wrote its ready handshake.
StartOk ==
    /\ hv = "starting"
    /\ alive
    /\ hv' = "ready"
    /\ UNCHANGED <<gen, alive, faults, req, dgen, hs, outc, pipe, fullRecv,
                   nans, cause, os, dsealed, drainTO>>

\* Spawn error, early exit or start bound exceeded: the host kills the
\* process and answers the waiting requests unavailable (none was written).
StartFail ==
    /\ hv = "starting"
    /\ faults < MaxFaults
    /\ faults' = faults + 1
    /\ hv' = "exited"
    /\ alive' = FALSE
    /\ AnswerSet(Queued, "unavailable", "start")
    /\ UNCHANGED <<gen, dgen, hs, outc, pipe, fullRecv, os, dsealed, drainTO>>

\* Write request r with its number to the helper's stdin.
Dispatch(r) ==
    /\ req[r] = "queued"
    /\ hv = "ready"
    /\ (Bug = "P4" \/ Cardinality(InFlight) < Limit)
    /\ (Bug = "P3" \/ ~Sealed(OwnerOf(r)))
    /\ req' = [req EXCEPT ![r] = "dispatched"]
    /\ dgen' = [dgen EXCEPT ![r] = gen]
    /\ dsealed' = [dsealed EXCEPT ![r] = Sealed(OwnerOf(r))]
    /\ UNCHANGED <<hv, gen, alive, faults, hs, outc, pipe, fullRecv, nans,
                   cause, os, drainTO>>

\* Read one frame from a helper's stdout.  Only frames of the current
\* incarnation are read while ready; a complete frame whose number is in
\* flight answers that request; anything else invalidates the helper.
ReceiveFrame(f) ==
    /\ f \in pipe
    /\ pipe' = pipe \ {f}
    /\ LET current == f.g = gen /\ hv = "ready"
           known   == f.id \in Req /\ req[f.id] = "dispatched" /\ dgen[f.id] = gen
       IN
       IF Bug = "P5" /\ f.k = "full" /\ f.id \in Req /\ dgen[f.id] = f.g
         \* negative control: a frame is matched by number alone
         THEN /\ AnswerSet({f.id}, outc[f.id], "frame")
              /\ fullRecv' = [fullRecv EXCEPT ![f.id] = TRUE]
              /\ UNCHANGED hv
       ELSE IF ~current
         THEN /\ UNCHANGED <<req, nans, cause, fullRecv, hv>>   \* stale: drop
       ELSE IF f.k = "full" /\ known
         THEN /\ AnswerSet({f.id}, outc[f.id], "frame")
              /\ fullRecv' = [fullRecv EXCEPT ![f.id] = TRUE]
              /\ UNCHANGED hv
       ELSE IF Bug = "P1" /\ f.k = "half" /\ known
         \* negative control: a torn frame is parsed as far as it goes
         THEN /\ AnswerSet({f.id}, outc[f.id], "frame")
              /\ UNCHANGED <<fullRecv, hv>>
       ELSE \* torn frame, unknown number, duplicate: invalidate
            /\ hv' = "killing"
            /\ UNCHANGED <<req, nans, cause, fullRecv>>
    /\ UNCHANGED <<gen, alive, faults, dgen, hs, outc, os, dsealed, drainTO>>

\* Per-request timeout (macOS runHelper uses 30 s).  The design kills the
\* helper; the P6 control answers unknown and leaves the helper running.
RequestTimeout(r) ==
    /\ req[r] = "dispatched"
    /\ hv = "ready"
    /\ faults < MaxFaults
    /\ faults' = faults + 1
    /\ IF Bug = "P6"
         THEN /\ AnswerSet({r}, "unknown", "timeout")
              /\ UNCHANGED hv
         ELSE /\ hv' = "killing"
              /\ UNCHANGED <<req, nans, cause>>
    /\ UNCHANGED <<gen, alive, dgen, hs, outc, pipe, fullRecv, os, dsealed,
                   drainTO>>

\* TerminateProcess on an invalidated helper.
Terminate ==
    /\ hv = "killing"
    /\ alive
    /\ Die
    /\ UNCHANGED <<hv, gen, faults, req, dgen, outc, pipe, fullRecv, nans,
                   cause, os, dsealed, drainTO>>

\* The host observes the process exit (child 'close').  Every request
\* written to this incarnation and not yet answered answers unknown.
HelperExit ==
    /\ hv \in {"ready", "killing"}
    /\ ~alive
    /\ hv' = "exited"
    /\ LET S == {r \in Req : req[r] = "dispatched" /\ dgen[r] = gen}
       IN IF Bug = "P2"
            THEN AnswerSet(S, "rejected", "exit")
            ELSE AnswerSet(S, "unknown", "exit")
    /\ UNCHANGED <<gen, alive, faults, dgen, hs, outc, pipe, fullRecv, os,
                   dsealed, drainTO>>

-----------------------------------------------------------------------------
(* Host: owner seal and drain *)

\* Domain drain step: facade.seal() and engine.seal(owner) in one step.
\* Requests of the owner still waiting in the engine queue answer closed.
Seal(o) ==
    /\ os[o] = "open"
    /\ os' = [os EXCEPT ![o] = "releasing"]
    /\ IF Bug = "P3"
         THEN UNCHANGED <<req, nans, cause>>
         ELSE AnswerSet({r \in Queued : OwnerOf(r) = o}, "closed", "seal")
    /\ UNCHANGED <<hv, gen, alive, faults, dgen, hs, outc, pipe, fullRecv,
                   dsealed, drainTO>>

\* drainBoundMs elapsed with work in flight: the record stays releasing.
\* It does not touch the shared helper or any request.
DrainTimeout(o) ==
    /\ os[o] = "releasing"
    /\ ~Quiet(o)
    /\ ~drainTO[o]
    /\ drainTO' = [drainTO EXCEPT ![o] = TRUE]
    /\ UNCHANGED <<hv, gen, alive, faults, req, dgen, hs, outc, pipe,
                   fullRecv, nans, cause, os, dsealed>>

\* Nothing of the owner is admitted, queued or in flight: the slot returns.
Settle(o) ==
    /\ os[o] = "releasing"
    /\ Quiet(o)
    /\ os' = [os EXCEPT ![o] = "settled"]
    /\ UNCHANGED <<hv, gen, alive, faults, req, dgen, hs, outc, pipe,
                   fullRecv, nans, cause, dsealed, drainTO>>

-----------------------------------------------------------------------------
(* Helper process and OS *)

\* The helper reads request r and starts its thread (handles opened).
HelperAccept(r) ==
    /\ alive
    /\ dgen[r] = gen
    /\ hs[r] = "none"
    /\ hs' = [hs EXCEPT ![r] = "running"]
    /\ UNCHANGED <<hv, gen, alive, faults, req, dgen, outc, pipe, fullRecv,
                   nans, cause, os, dsealed, drainTO>>

\* The thread closes its handles and writes one complete reply frame.
HelperReply(r) ==
    /\ alive
    /\ dgen[r] = gen
    /\ hs[r] = "running"
    /\ \E o \in {"done", "rejected"} :
         /\ outc' = [outc EXCEPT ![r] = o]
         /\ hs' = [hs EXCEPT ![r] = "replied"]
         /\ pipe' = pipe \cup {[g |-> gen, id |-> r, k |-> "full"]}
    /\ UNCHANGED <<hv, gen, alive, faults, req, dgen, fullRecv, nans, cause,
                   os, dsealed, drainTO>>

\* The helper crashes (or is killed from outside).
HelperCrash ==
    /\ alive
    /\ hv \in {"ready", "killing"}
    /\ faults < MaxFaults
    /\ faults' = faults + 1
    /\ Die
    /\ UNCHANGED <<hv, gen, req, dgen, outc, pipe, fullRecv, nans, cause, os,
                   dsealed, drainTO>>

\* The helper crashes while writing r's reply: half a frame reaches stdout.
HelperCrashMidReply(r) ==
    /\ alive
    /\ hv \in {"ready", "killing"}
    /\ dgen[r] = gen
    /\ hs[r] = "running"
    /\ faults < MaxFaults
    /\ faults' = faults + 1
    /\ \E o \in {"done", "rejected"} : outc' = [outc EXCEPT ![r] = o]
    /\ pipe' = pipe \cup {[g |-> gen, id |-> r, k |-> "half"]}
    /\ Die
    /\ UNCHANGED <<hv, gen, req, dgen, fullRecv, nans, cause, os, dsealed,
                   drainTO>>

\* A well-formed frame whose number is unknown or already answered.
HelperGarble(i) ==
    /\ alive
    /\ hv = "ready"
    /\ i \in {NoId} \cup {x \in Req : req[x] \in Final}
    /\ faults < MaxFaults
    /\ faults' = faults + 1
    /\ pipe' = pipe \cup {[g |-> gen, id |-> i, k |-> "full"]}
    /\ UNCHANGED <<hv, gen, alive, req, dgen, hs, outc, fullRecv, nans, cause,
                   os, dsealed, drainTO>>

\* One frame read; named so that traces show the step.
ReceiveAny == \E f \in pipe : ReceiveFrame(f)

-----------------------------------------------------------------------------

Next ==
    \/ \E r \in Req : Admit(r) \/ Enqueue(r) \/ Dispatch(r) \/ RequestTimeout(r)
                      \/ HelperAccept(r) \/ HelperReply(r) \/ HelperCrashMidReply(r)
    \/ Start \/ Restart \/ StartOk \/ StartFail
    \/ ReceiveAny
    \/ Terminate \/ HelperExit \/ HelperCrash
    \/ \E i \in {NoId} \cup Req : HelperGarble(i)
    \/ \E o \in Owner : Seal(o) \/ DrainTimeout(o) \/ Settle(o)

\* Faults, seals, arrivals and timeouts are not fair; the transport is.
Fairness ==
    /\ \A r \in Req : WF_vars(Enqueue(r)) /\ WF_vars(Dispatch(r))
                      /\ WF_vars(HelperAccept(r)) /\ WF_vars(HelperReply(r))
    /\ WF_vars(Start) /\ WF_vars(Restart) /\ WF_vars(StartOk)
    /\ WF_vars(ReceiveAny)
    /\ WF_vars(Terminate) /\ WF_vars(HelperExit)
    /\ \A o \in Owner : WF_vars(Settle(o))

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
    /\ hv \in {"idle", "starting", "ready", "killing", "exited"}
    /\ gen \in Gen
    /\ alive \in BOOLEAN
    /\ faults \in 0..MaxFaults
    /\ req \in [Req -> ReqState]
    /\ dgen \in [Req -> Gen]
    /\ hs \in [Req -> {"none", "running", "replied", "aborted"}]
    /\ outc \in [Req -> {"none", "done", "rejected"}]
    /\ pipe \subseteq Frame
    /\ fullRecv \in [Req -> BOOLEAN]
    /\ nans \in [Req -> 0..2]
    /\ cause \in [Req -> {"none", "frame", "exit", "seal", "start", "timeout"}]
    /\ os \in [Owner -> {"open", "releasing", "settled"}]
    /\ dsealed \in [Req -> BOOLEAN]
    /\ drainTO \in [Owner -> BOOLEAN]

\* P1: done or rejected only after a complete frame for that request.
\* closed and unavailable only for requests never written to a helper.
P1_NoAnswerWithoutFrame ==
    \A r \in Req :
        /\ req[r] \in {"done", "rejected"} => fullRecv[r] /\ cause[r] = "frame"
        /\ req[r] \in {"closed", "unavailable"} => dgen[r] = 0

\* P2: an observed exit answers unknown, and no request stays in flight on
\* an incarnation whose exit the host has seen.
P2_ExitAnswersUnknown ==
    \A r \in Req :
        /\ cause[r] = "exit" => req[r] = "unknown"
        /\ req[r] = "dispatched" => dgen[r] = gen /\ hv \in {"ready", "killing"}

\* P3: nothing is written to the helper for a sealed owner.
P3_NoDispatchAfterSeal ==
    \A r \in Req :
        /\ ~dsealed[r]
        /\ req[r] = "closed" => dgen[r] = 0

\* P4: the in-flight bound holds.  (A request dropped at the bound would
\* answer rejected without a frame and break P1.)
P4_InFlightBounded == Cardinality(InFlight) <= Limit

\* P5: exactly one answer, and a final answer is never rewritten.
P5_SingleAnswer ==
    \A r \in Req :
        /\ nans[r] <= 1
        /\ (req[r] \in Final) <=> (nans[r] = 1)
P5_FinalStable == [][\A r \in Req : req[r] \in Final => req'[r] = req[r]]_vars

\* P6 (H-12, drain): a settled owner has no request the live helper could
\* still run (written and not replied, or running with handles open).
P6_SettledIsQuiet ==
    \A r \in Req :
        os[OwnerOf(r)] = "settled" =>
            ~(alive /\ dgen[r] = gen /\ dgen[r] # 0 /\ hs[r] \in {"none", "running"})

\* L1: an admitted request eventually gets its one answer.
L1_EveryRequestAnswered ==
    \A r \in Req : (req[r] \in Live) ~> (req[r] \in Final)

\* L2: after an exit, a queued request restarts the helper (or is answered).
L2_RestartOnNextRequest ==
    (hv = "exited" /\ Queued # {}) ~> (hv = "ready" \/ Queued = {})

\* Action constraint for Neg_P5_late: no garbled frames, so the only way to
\* rewrite an answer is a late frame of an exited incarnation.
NoGarbleStep == \A f \in pipe' \ pipe : f.id \in Req /\ req[f.id] \notin Final

=============================================================================

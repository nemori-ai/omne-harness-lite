--------------------------- MODULE ProcessCustody ---------------------------
(***************************************************************************)
(* Custody of execution domains (D-89).                                    *)
(*                                                                         *)
(* One acquisition A, optionally bound to one retention scope R. An        *)
(* execution domain (systemd user scope, Windows Job) holds a primary      *)
(* process (command or shell) and residual processes. Residual processes   *)
(* are "plain" (die on hangup) or "immune" (nohup, setsid). The owner is   *)
(* the ledger that carries the stop duty: "acq" (A) or "ret" (R).          *)
(*                                                                         *)
(* The switches select the target design or one negative control:         *)
(*   Policy        "retain" target; "stop" current (N1); "hangup" (N10)    *)
(*   Containment   "sealed" target; "pgroup" (N2)                          *)
(*   EvictOldest   FALSE target; TRUE (N3)                                 *)
(*   HonestEnum    TRUE target; FALSE (N4)                                 *)
(*   RecheckClosed TRUE target; FALSE (N5)                                 *)
(*   RecheckPhase  TRUE target; FALSE (N6)                                 *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Units,          \* execution domains that may be planned
    Cap,            \* retained capacity of R, a positive integer
    MaxRest,        \* bound on residual processes of each kind in one domain
    MaxCrash,       \* bound on provider crashes
    Bound,          \* A carries the retention scope R
    Containment,
    Policy,
    RecheckClosed,
    RecheckPhase,
    EvictOldest,
    HonestEnum

Phases == {"none", "planned", "running", "exited", "retained", "stopping", "stopped"}
Owners == {"none", "acq", "ret"}
Kinds  == {"cmd", "term"}

VARIABLES
    ph,             \* recorded phase of each domain
    own,            \* owner of each domain
    kind,           \* "cmd" for a one-shot command, "term" for a terminal
    prim,           \* the primary process is alive (ground truth)
    rp,             \* plain residual processes alive (ground truth)
    ri,             \* immune residual processes alive (ground truth)
    out,            \* processes alive outside every domain, not handed over by an explicit act
    closed,         \* R is closed
    closureDone,    \* the provider reported the closure of R complete
    acqSt,          \* "open", "draining" or "settled"
    resv,           \* domains reserved in R and not yet committed
    known,          \* the current provider generation holds the domain in memory
    indexComplete,  \* the memory index of the current generation is complete
    crashes,
    stopDecided,    \* history: a command domain was sent to stop after its primary exited
    retainDecided,  \* history: a command domain was handed over to R
    keptDenied,     \* history: residual processes were stopped although R could keep them
    evicted,        \* history: a retained domain was stopped to make room
    enteredAfterClose \* history: a domain entered R after R closed

vars == <<ph, own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
          known, indexComplete, crashes, stopDecided, retainDecided,
          keptDenied, evicted, enteredAfterClose>>

history == <<stopDecided, retainDecided, keptDenied, evicted, enteredAfterClose>>

Live(u) == prim[u] \/ rp[u] + ri[u] > 0
Duty(o) == {u \in Units : own[u] = o /\ ph[u] \notin {"none", "stopped"}}
Occ == Cardinality(Duty("ret")) + Cardinality(resv)
Permit(u) ==
    \/ own[u] = "acq" /\ acqSt = "open"
    \/ own[u] = "ret" /\ acqSt = "open" /\ ~closed

TypeOK ==
    /\ ph \in [Units -> Phases]
    /\ own \in [Units -> Owners]
    /\ kind \in [Units -> Kinds]
    /\ prim \in [Units -> BOOLEAN]
    /\ rp \in [Units -> 0..MaxRest]
    /\ ri \in [Units -> 0..MaxRest]
    /\ out \in Nat
    /\ closed \in BOOLEAN /\ closureDone \in BOOLEAN
    /\ acqSt \in {"open", "draining", "settled"}
    /\ resv \subseteq Units
    /\ known \in [Units -> BOOLEAN]
    /\ indexComplete \in BOOLEAN
    /\ crashes \in 0..MaxCrash
    /\ stopDecided \in [Units -> BOOLEAN]
    /\ retainDecided \in [Units -> BOOLEAN]
    /\ keptDenied \in BOOLEAN /\ evicted \in BOOLEAN /\ enteredAfterClose \in BOOLEAN

Init ==
    /\ ph = [u \in Units |-> "none"]
    /\ own = [u \in Units |-> "none"]
    /\ kind = [u \in Units |-> "cmd"]
    /\ prim = [u \in Units |-> FALSE]
    /\ rp = [u \in Units |-> 0]
    /\ ri = [u \in Units |-> 0]
    /\ out = 0
    /\ closed = FALSE /\ closureDone = FALSE
    /\ acqSt = "open"
    /\ resv = {}
    /\ known = [u \in Units |-> FALSE]
    /\ indexComplete = TRUE
    /\ crashes = 0
    /\ stopDecided = [u \in Units |-> FALSE]
    /\ retainDecided = [u \in Units |-> FALSE]
    /\ keptDenied = FALSE /\ evicted = FALSE /\ enteredAfterClose = FALSE

-----------------------------------------------------------------------------
(* Creation: the ledger records the domain before any external effect.      *)

PlanAcq(u, k) ==
    /\ ph[u] = "none" /\ acqSt = "open"
    /\ ph' = [ph EXCEPT ![u] = "planned"]
    /\ own' = [own EXCEPT ![u] = "acq"]
    /\ kind' = [kind EXCEPT ![u] = k]
    /\ known' = [known EXCEPT ![u] = TRUE]
    /\ UNCHANGED <<prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   indexComplete, crashes, history>>

\* A retained terminal belongs to R from creation on.
PlanRet(u) ==
    /\ ph[u] = "none" /\ acqSt = "open" /\ Bound /\ ~closed /\ Occ < Cap
    /\ ph' = [ph EXCEPT ![u] = "planned"]
    /\ own' = [own EXCEPT ![u] = "ret"]
    /\ kind' = [kind EXCEPT ![u] = "term"]
    /\ known' = [known EXCEPT ![u] = TRUE]
    /\ UNCHANGED <<prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   indexComplete, crashes, history>>

Launch(u) ==
    /\ ph[u] = "planned" /\ known[u] /\ Permit(u)
    /\ ph' = [ph EXCEPT ![u] = "running"]
    /\ prim' = [prim EXCEPT ![u] = TRUE]
    /\ UNCHANGED <<own, kind, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

\* The permit is refused: no process was started, so nothing needs a stop.
Refuse(u) ==
    /\ ph[u] = "planned" /\ known[u] /\ ~Permit(u)
    /\ ph' = [ph EXCEPT ![u] = "stopped"]
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

-----------------------------------------------------------------------------
(* What the processes do. These steps need no provider.                     *)

ForkPlain(u) ==
    /\ Live(u) /\ rp[u] < MaxRest
    /\ rp' = [rp EXCEPT ![u] = @ + 1]
    /\ UNCHANGED <<ph, own, kind, prim, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

ForkImmune(u) ==
    /\ Live(u) /\ ri[u] < MaxRest
    /\ ri' = [ri EXCEPT ![u] = @ + 1]
    /\ UNCHANGED <<ph, own, kind, prim, rp, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

\* Only a process-group containment lets setsid leave the domain.
Escape(u) ==
    /\ Containment = "pgroup" /\ ri[u] > 0
    /\ ri' = [ri EXCEPT ![u] = @ - 1]
    /\ out' = out + 1
    /\ UNCHANGED <<ph, own, kind, prim, rp, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

RestExit(u) ==
    \/ /\ rp[u] > 0
       /\ rp' = [rp EXCEPT ![u] = @ - 1]
       /\ UNCHANGED ri
    \/ /\ ri[u] > 0
       /\ ri' = [ri EXCEPT ![u] = @ - 1]
       /\ UNCHANGED rp
RestExitStep(u) ==
    /\ RestExit(u)
    /\ UNCHANGED <<ph, own, kind, prim, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

\* The gate reports the exit only to a provider that holds the domain.
\* A terminal whose shell dies is invalid and its provider stops it.
PrimExit(u) ==
    /\ prim[u]
    /\ prim' = [prim EXCEPT ![u] = FALSE]
    /\ ph' = IF known[u] /\ ph[u] = "running"
                THEN [ph EXCEPT ![u] = IF kind[u] = "cmd" THEN "exited" ELSE "stopping"]
                ELSE ph
    /\ UNCHANGED <<own, kind, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

-----------------------------------------------------------------------------
(* Disposal after the primary process of a command exits (D13, D14).        *)

\* The reading of the residual processes may be unknown, so the reserve branch
\* does not require residual processes. Under "hangup" the plain ones die first.
Dispose(u) ==
    /\ ph[u] = "exited" /\ own[u] = "acq" /\ kind[u] = "cmd" /\ known[u]
    /\ u \notin resv
    /\ LET plain   == IF Policy = "hangup" THEN 0 ELSE rp[u]
           left    == plain + ri[u]
           allowed == Bound /\ ~closed /\ Occ < Cap
           keep    == Policy # "stop" /\ allowed
           denied  == allowed /\ (IF Policy = "stop" THEN rp[u] + ri[u] > 0
                                  ELSE IF Policy = "hangup" THEN rp[u] > 0
                                  ELSE FALSE)
       IN
       \/ /\ (left = 0 \/ ~keep)
          /\ ph' = [ph EXCEPT ![u] = "stopping"]
          /\ rp' = [rp EXCEPT ![u] = plain]
          /\ stopDecided' = [stopDecided EXCEPT ![u] = TRUE]
          /\ keptDenied' = (keptDenied \/ denied)
          /\ UNCHANGED <<resv, evicted>>
       \/ /\ keep
          /\ resv' = resv \cup {u}
          /\ rp' = [rp EXCEPT ![u] = plain]
          /\ keptDenied' = (keptDenied \/ denied)
          /\ UNCHANGED <<ph, stopDecided, evicted>>
       \/ /\ EvictOldest /\ Policy # "stop" /\ Bound /\ ~closed /\ ~(Occ < Cap)
          /\ \E v \in Units :
                /\ own[v] = "ret" /\ ph[v] = "retained"
                /\ ph' = [ph EXCEPT ![v] = "stopping"]
          /\ resv' = resv \cup {u}
          /\ rp' = [rp EXCEPT ![u] = plain]
          /\ evicted' = TRUE
          /\ UNCHANGED <<stopDecided, keptDenied>>
    /\ UNCHANGED <<own, kind, prim, ri, out, closed, closureDone, acqSt,
                   known, indexComplete, crashes, retainDecided, enteredAfterClose>>

Commit(u) ==
    /\ u \in resv /\ known[u] /\ own[u] = "acq"
    /\ (RecheckPhase => ph[u] = "exited")
    /\ (RecheckClosed => ~closed)
    /\ own' = [own EXCEPT ![u] = "ret"]
    /\ ph' = [ph EXCEPT ![u] = "retained"]
    /\ resv' = resv \ {u}
    /\ retainDecided' = [retainDecided EXCEPT ![u] = TRUE]
    /\ enteredAfterClose' = (enteredAfterClose \/ closed)
    /\ UNCHANGED <<kind, prim, rp, ri, out, closed, closureDone, acqSt,
                   known, indexComplete, crashes, stopDecided, keptDenied, evicted>>

Abort(u) ==
    /\ u \in resv /\ known[u]
    /\ (closed \/ ph[u] # "exited")
    /\ resv' = resv \ {u}
    /\ IF ph[u] = "exited"
          THEN /\ ph' = [ph EXCEPT ![u] = "stopping"]
               /\ stopDecided' = [stopDecided EXCEPT ![u] = TRUE]
          ELSE UNCHANGED <<ph, stopDecided>>
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt,
                   known, indexComplete, crashes, retainDecided, keptDenied, evicted,
                   enteredAfterClose>>

-----------------------------------------------------------------------------
(* Stopping. Only the supervisor reading confirms a stop (INV-EE13).        *)

\* An explicit stop by the owner: terminate, terminal close.
Stop(u) ==
    /\ known[u] /\ own[u] # "none"
    /\ ph[u] \in {"running", "exited", "retained"}
    /\ (own[u] = "acq" => acqSt = "open")
    /\ ph' = [ph EXCEPT ![u] = "stopping"]
    /\ stopDecided' = IF ph[u] = "exited" /\ kind[u] = "cmd"
                         THEN [stopDecided EXCEPT ![u] = TRUE] ELSE stopDecided
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, retainDecided, keptDenied, evicted,
                   enteredAfterClose>>

\* Kill every member of the domain. Processes that left the domain survive.
Kill(u) ==
    /\ ph[u] = "stopping" /\ known[u] /\ Live(u)
    /\ prim' = [prim EXCEPT ![u] = FALSE]
    /\ rp' = [rp EXCEPT ![u] = 0]
    /\ ri' = [ri EXCEPT ![u] = 0]
    /\ UNCHANGED <<ph, own, kind, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

Confirm(u) ==
    /\ ph[u] = "stopping" /\ known[u] /\ ~Live(u)
    /\ ph' = [ph EXCEPT ![u] = "stopped"]
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

\* A retained domain whose processes all exited settles by itself (D15).
Drain(u) ==
    /\ ph[u] = "retained" /\ known[u] /\ ~Live(u)
    /\ ph' = [ph EXCEPT ![u] = "stopping"]
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

\* An optional unattended deadline (D12).
Expire(u) ==
    /\ ph[u] = "retained" /\ known[u]
    /\ ph' = [ph EXCEPT ![u] = "stopping"]
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

-----------------------------------------------------------------------------
(* Release of the acquisition and closure of the retention scope.           *)

SweepPhase(p) == IF p = "planned" THEN "stopped" ELSE "stopping"
Sweepable == {"planned", "running", "exited"}

Release ==
    /\ acqSt = "open"
    /\ acqSt' = "draining"
    /\ ph' = [u \in Units |->
                IF known[u] /\ own[u] = "acq" /\ ph[u] \in Sweepable
                   THEN SweepPhase(ph[u]) ELSE ph[u]]
    /\ stopDecided' = [u \in Units |->
                IF known[u] /\ own[u] = "acq" /\ ph[u] = "exited" /\ kind[u] = "cmd"
                   THEN TRUE ELSE stopDecided[u]]
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, resv,
                   known, indexComplete, crashes, retainDecided, keptDenied, evicted,
                   enteredAfterClose>>

\* After a crash, the drain reaches domains that recovery put back in memory.
DrainSweep(u) ==
    /\ acqSt = "draining" /\ known[u] /\ own[u] = "acq" /\ ph[u] \in Sweepable
    /\ ph' = [ph EXCEPT ![u] = SweepPhase(ph[u])]
    /\ stopDecided' = IF ph[u] = "exited" /\ kind[u] = "cmd"
                         THEN [stopDecided EXCEPT ![u] = TRUE] ELSE stopDecided
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, retainDecided, keptDenied, evicted,
                   enteredAfterClose>>

Settle ==
    /\ acqSt = "draining" /\ indexComplete /\ resv = {}
    /\ \A u \in Units : (known[u] /\ own[u] = "acq") => ph[u] = "stopped"
    /\ acqSt' = "settled"
    /\ UNCHANGED <<ph, own, kind, prim, rp, ri, out, closed, closureDone, resv,
                   known, indexComplete, crashes, history>>

RetSweepable == {"planned", "running", "retained"}

CloseScope ==
    /\ ~closed
    /\ closed' = TRUE
    /\ ph' = [u \in Units |->
                IF known[u] /\ own[u] = "ret" /\ ph[u] \in RetSweepable
                   THEN SweepPhase(ph[u]) ELSE ph[u]]
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

CloseSweep(u) ==
    /\ closed /\ known[u] /\ own[u] = "ret" /\ ph[u] \in RetSweepable
    /\ ph' = [ph EXCEPT ![u] = SweepPhase(ph[u])]
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, history>>

ClosureDone ==
    /\ closed /\ ~closureDone /\ indexComplete /\ resv = {}
    /\ \A u \in Units : (known[u] /\ own[u] = "ret") => ph[u] = "stopped"
    /\ closureDone' = TRUE
    /\ UNCHANGED <<ph, own, kind, prim, rp, ri, out, closed, acqSt, resv,
                   known, indexComplete, crashes, history>>

-----------------------------------------------------------------------------
(* Provider crash and cold recovery (T8).                                   *)

\* Ledgers and domains survive; memory does not. The old acquisition cannot go on.
Crash ==
    /\ crashes < MaxCrash
    /\ crashes' = crashes + 1
    /\ known' = [u \in Units |-> FALSE]
    /\ indexComplete' = FALSE
    /\ acqSt' = IF acqSt = "open" THEN "draining" ELSE acqSt
    /\ UNCHANGED <<ph, own, kind, prim, rp, ri, out, closed, closureDone, resv, history>>

\* An honest enumeration returns every recorded domain; an unreadable index
\* makes no step. The dishonest one may return any subset as complete.
Recover ==
    /\ ~indexComplete
    /\ IF HonestEnum
          THEN known' = [u \in Units |-> known[u] \/ ph[u] # "none"]
          ELSE \E S \in SUBSET Units :
                  known' = [u \in Units |-> known[u] \/ (u \in S /\ ph[u] # "none")]
    /\ indexComplete' = TRUE
    /\ UNCHANGED <<ph, own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   crashes, history>>

-----------------------------------------------------------------------------

Next ==
    \/ \E u \in Units :
          \/ PlanAcq(u, "cmd") \/ PlanAcq(u, "term") \/ PlanRet(u)
          \/ Launch(u) \/ Refuse(u)
          \/ ForkPlain(u) \/ ForkImmune(u) \/ Escape(u) \/ RestExitStep(u) \/ PrimExit(u)
          \/ Dispose(u) \/ Commit(u) \/ Abort(u)
          \/ Stop(u) \/ Kill(u) \/ Confirm(u) \/ Drain(u) \/ Expire(u)
          \/ DrainSweep(u) \/ CloseSweep(u)
    \/ Release \/ Settle \/ CloseScope \/ ClosureDone
    \/ Crash \/ Recover

Spec == Init /\ [][Next]_vars

Fairness ==
    /\ \A u \in Units :
          /\ WF_vars(Kill(u)) /\ WF_vars(Confirm(u)) /\ WF_vars(Drain(u))
          /\ WF_vars(Dispose(u)) /\ WF_vars(Commit(u)) /\ WF_vars(Abort(u))
          /\ WF_vars(DrainSweep(u)) /\ WF_vars(CloseSweep(u))
    /\ WF_vars(Settle) /\ WF_vars(ClosureDone) /\ WF_vars(Recover)

LiveSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
(* Properties. Names follow model.md section 6.                             *)

NoLeak == out = 0                                                       \* T1

UniqueOwner ==                                                          \* T2
    \A u \in Units : Live(u) => own[u] # "none" /\ ph[u] \notin {"none", "stopped"}

OneDisposition == \A u \in Units : ~(stopDecided[u] /\ retainDecided[u])  \* T3

StopTruth == \A u \in Units : ph[u] = "stopped" => ~Live(u)              \* T4

NoEntryAfterClose == ~enteredAfterClose                                  \* T5

ClosureTruth ==                                                         \* T5, T8
    closureDone => \A u \in Units : own[u] = "ret" => ph[u] \in {"none", "stopped"}

NoEviction == ~evicted /\ Occ <= Cap                                    \* T6

SettleTruth ==                                                          \* T8
    acqSt = "settled" => \A u \in Units : own[u] = "acq" => ph[u] \in {"none", "stopped"}

KeepWhenPermitted == ~keptDenied                                        \* T10

ReservedFromAcq == \A u \in resv : own[u] = "acq" /\ kind[u] = "cmd"     \* I8

OwnerOnlyForward ==                                                     \* I2 (action)
    [][\A u \in Units :
         own'[u] # own[u] => (own[u] = "none" \/ (own[u] = "acq" /\ own'[u] = "ret"))]_vars

ReleaseSteps == Release \/ Settle \/ \E v \in Units : DrainSweep(v)
RetainedSurvivesRelease ==                                              \* T7 (action)
    [][\A u \in Units : (own[u] = "ret" /\ ReleaseSteps) => ph'[u] = ph[u]]_vars

ClosureEnds ==                                                          \* L1
    closed ~> \A u \in Units : own[u] = "ret" => ph[u] \in {"none", "stopped"}

ReleaseEnds == (acqSt = "draining") ~> (acqSt = "settled")              \* L2

RetainedSettles ==                                                      \* L3
    \A u \in Units : (ph[u] = "retained" /\ ~Live(u)) ~> (ph[u] = "stopped")

\* Reachability witnesses. Each must be violated by the target configuration;
\* otherwise the property it backs could hold vacuously.
NeverRetainedAlive == ~\E u \in Units : ph[u] = "retained" /\ Live(u)
NeverRetainedOutlivesAcq == ~(acqSt = "settled" /\ \E u \in Units : ph[u] = "retained" /\ Live(u))
NeverSelfSettled == ~\E u \in Units : own[u] = "ret" /\ kind[u] = "cmd" /\ ph[u] = "stopped" /\ ~closed
NeverClosedAfterCrash == ~(closureDone /\ crashes = 1 /\ \E u \in Units : own[u] = "ret")
NeverSettledAfterCrash == ~(acqSt = "settled" /\ crashes = 1 /\ \E u \in Units : own[u] = "acq")
NeverFullAndStopped ==
    ~(~closed /\ \E u, v \in Units :
         /\ u # v /\ own[v] = "ret" /\ ph[v] = "retained" /\ Live(v)
         /\ stopDecided[u] /\ ph[u] = "stopping" /\ Live(u))
NeverRetainedTerminalClosed ==
    ~(closureDone /\ \E u \in Units : kind[u] = "term" /\ own[u] = "ret" /\ ph[u] = "stopped")

\* The conjunction used for the one-step inductiveness check.
Auxiliary ==
    /\ \A u \in Units : ph[u] = "none" => own[u] = "none" /\ ~Live(u) /\ ~known[u]
    /\ \A u \in Units : ph[u] = "planned" => ~Live(u)
    /\ \A u \in Units : ph[u] # "none" => own[u] # "none"
    /\ \A u \in Units : ph[u] = "retained" => own[u] = "ret" /\ kind[u] = "cmd" /\ ~prim[u]
    /\ \A u \in Units : ph[u] = "exited" => own[u] = "acq" /\ kind[u] = "cmd" /\ ~prim[u]
    /\ \A u \in Units : own[u] = "ret" /\ kind[u] = "cmd" =>
          ph[u] \in {"retained", "stopping", "stopped"}
    /\ \A u \in Units : own[u] = "ret" /\ kind[u] = "term" =>
          ph[u] \in {"planned", "running", "stopping", "stopped"}
    /\ \A u \in Units : u \in resv => ph[u] \in {"exited", "stopping", "stopped"}
    /\ \A u \in Units : prim[u] => ph[u] \in {"running", "stopping"}
    /\ \A u \in Units : known[u] => ph[u] # "none"
    /\ indexComplete => \A u \in Units : ph[u] # "none" => known[u]
    /\ closureDone => closed
    /\ acqSt = "settled" => resv = {}
    /\ \A u \in Units : stopDecided[u] =>
          own[u] = "acq" /\ kind[u] = "cmd" /\ ph[u] \in {"stopping", "stopped"}
    /\ \A u \in Units : retainDecided[u] => own[u] = "ret" /\ kind[u] = "cmd"

\* Every target invariant together with the auxiliary conjuncts. The check
\* starts from every state that satisfies it and takes one step.
IndInv ==
    /\ TypeOK /\ Auxiliary
    /\ NoLeak /\ UniqueOwner /\ OneDisposition /\ StopTruth /\ NoEntryAfterClose
    /\ ClosureTruth /\ NoEviction /\ SettleTruth /\ KeepWhenPermitted /\ ReservedFromAcq

\* The same states, written so that TLC can enumerate them.
IndInit ==
    /\ ph \in [Units -> Phases] /\ own \in [Units -> Owners] /\ kind \in [Units -> Kinds]
    /\ prim \in [Units -> BOOLEAN] /\ rp \in [Units -> 0..MaxRest] /\ ri \in [Units -> 0..MaxRest]
    /\ out = 0 /\ closed \in BOOLEAN /\ closureDone \in BOOLEAN
    /\ acqSt \in {"open", "draining", "settled"} /\ resv \in SUBSET Units
    /\ known \in [Units -> BOOLEAN] /\ indexComplete \in BOOLEAN /\ crashes \in 0..MaxCrash
    /\ stopDecided \in [Units -> BOOLEAN] /\ retainDecided \in [Units -> BOOLEAN]
    /\ keptDenied = FALSE /\ evicted = FALSE /\ enteredAfterClose = FALSE
    /\ IndInv
=============================================================================

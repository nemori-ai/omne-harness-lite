--------------------------- MODULE WindowsCustody ---------------------------
(***************************************************************************)
(* Windows custody of one-shot command domains.                          *)
(*                                                                         *)
(* The ledger-level steps (plan, permit, disposal, handover, release,      *)
(* closure, crash, recovery) are the actions of ProcessCustody, taken      *)
(* through the instance PC. The process-level steps are replaced by the    *)
(* Windows mechanism: a named Job Object held by a detached bridge         *)
(* process, KILL_ON_JOB_CLOSE, a cold-index marker in the state directory, *)
(* the login session that scopes "Local\" names, and the boot identity.    *)
(* TLC checks that every behaviour refines PC!Spec and that the PC         *)
(* properties hold on the shared variables.                                *)
(*                                                                         *)
(* OS facts taken as environment rules:                                    *)
(*   - a named Job disappears from the namespace when its last handle      *)
(*     closes; its members live on unless KILL_ON_JOB_CLOSE is set;        *)
(*   - with KILL_ON_JOB_CLOSE the last handle close kills every member;    *)
(*   - "Local\" names are per login session: another session cannot open   *)
(*     the name, which says nothing about the Job's existence;             *)
(*   - a reboot destroys every Job, member and bridge;                     *)
(*   - children are created inside the Job (PROC_THREAD_ATTRIBUTE_JOB_LIST,*)
(*     no breakaway), so no process leaves the domain (Containment sealed).*)
(*                                                                         *)
(* Switches (target value first):                                          *)
(*   Anchor           TRUE: a handle holder inside the Job keeps the name  *)
(*                    alive as long as the Job has members; FALSE: the     *)
(*                    bridge is the sole holder.                           *)
(*   ClearOnHandover  TRUE: handover clears KILL_ON_JOB_CLOSE;            *)
(*                    FALSE (N-W1): the flag stays.                        *)
(*   MarkerFirst      TRUE: the handover marker is durable before the flag *)
(*                    is cleared; FALSE (N-W1b): clear first.              *)
(*   SessionAware     TRUE: "not found by name" is stop evidence only in   *)
(*                    the creating session; FALSE (N-W2): in any session.  *)
(*   HandedAware      FALSE: "not found" is stop evidence for every marker *)
(*                    of the same boot; TRUE: never for a handed-over one. *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Units,            \* execution domains (one-shot commands) that may be planned
    Cap,              \* retained capacity of the retention scope R
    MaxRest,          \* bound on residual processes of each kind in one domain
    MaxCrash,         \* bound on provider crashes and reboots together
    Sessions,         \* login sessions a provider instance may run in
    MaxBridgeDeath,   \* bound on bridge process deaths
    Anchor,
    ClearOnHandover,
    MarkerFirst,
    SessionAware,
    HandedAware

\* Variables shared with ProcessCustody (same names, same meaning).
VARIABLES
    ph, own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
    known, indexComplete, crashes, stopDecided, retainDecided,
    keptDenied, evicted, enteredAfterClose

\* Windows mechanism.
VARIABLES
    started,          \* GO was sent: ResumeThread ran, user code executes
    permitted,        \* the ledger permit answered confirmed
    bridge,           \* "none", "attached" (talks to the provider), "orphan" (provider gone), "dead"
    anchor,           \* a handle holder inside the Job is alive (only with Anchor)
    koc,              \* the Job has KILL_ON_JOB_CLOSE
    marker,           \* cold-index marker: "none", "cmd" (job name, boot, session), "handed"
    sessAt,           \* login session recorded in the marker
    stale,            \* the marker's boot identity differs from the current one
    curSess,          \* login session of the current provider instance
    rebooting,        \* the machine is going down: processes die, nobody observes
    bridgeDeaths,
    retainedKilledByClose, \* history: a retained domain lost members to a handle close
    confirmedByAbsence,    \* history: a stop was confirmed because the name could not be opened
    confirmedByStale       \* history: a stop was confirmed because the boot identity changed

PC == INSTANCE ProcessCustody
        WITH Bound <- TRUE, Containment <- "sealed", Policy <- "retain",
             RecheckClosed <- TRUE, RecheckPhase <- TRUE,
             EvictOldest <- FALSE, HonestEnum <- TRUE

\* The shared variables, in PC's order. TLC cannot use PC!vars as a subscript.
pcvars == <<ph, own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
            known, indexComplete, crashes, stopDecided, retainDecided,
            keptDenied, evicted, enteredAfterClose>>
wvars == <<started, permitted, bridge, anchor, koc, marker, sessAt, stale, curSess,
           rebooting, bridgeDeaths, retainedKilledByClose, confirmedByAbsence,
           confirmedByStale>>
vars == <<pcvars, wvars>>

Live(u) == PC!Live(u)                        \* prim counts the suspended primary too
Held(u) == bridge[u] \in {"attached", "orphan"}  \* a bridge handle is open
Named(u) == Held(u) \/ anchor[u]             \* some handle keeps the name in the namespace
\* OpenJobObjectW by name succeeds from the current provider instance.
Openable(u) == Named(u) /\ sessAt[u] = curSess /\ ~stale[u]
\* The provider can act on the Job: through its own bridge or by reopening the name.
Addressable(u) == bridge[u] = "attached" \/ Openable(u)

TypeOK ==
    /\ PC!TypeOK
    /\ started \in [Units -> BOOLEAN] /\ permitted \in [Units -> BOOLEAN]
    /\ bridge \in [Units -> {"none", "attached", "orphan", "dead"}]
    /\ anchor \in [Units -> BOOLEAN] /\ koc \in [Units -> BOOLEAN]
    /\ marker \in [Units -> {"none", "cmd", "handed"}]
    /\ sessAt \in [Units -> Sessions] /\ stale \in [Units -> BOOLEAN]
    /\ curSess \in Sessions /\ rebooting \in BOOLEAN
    /\ bridgeDeaths \in 0..MaxBridgeDeath
    /\ retainedKilledByClose \in BOOLEAN
    /\ confirmedByAbsence \in BOOLEAN /\ confirmedByStale \in BOOLEAN

Init ==
    /\ PC!Init
    /\ started = [u \in Units |-> FALSE] /\ permitted = [u \in Units |-> FALSE]
    /\ bridge = [u \in Units |-> "none"] /\ anchor = [u \in Units |-> FALSE]
    /\ koc = [u \in Units |-> FALSE] /\ marker = [u \in Units |-> "none"]
    /\ curSess \in Sessions
    /\ sessAt = [u \in Units |-> curSess] /\ stale = [u \in Units |-> FALSE]
    /\ rebooting = FALSE /\ bridgeDeaths = 0
    /\ retainedKilledByClose = FALSE
    /\ confirmedByAbsence = FALSE /\ confirmedByStale = FALSE

-----------------------------------------------------------------------------
(* Start: ledger plan, marker, Job with a suspended primary, permit, GO.    *)

\* Acquisition ledger `plan` (TS manager). Same as PC.
PlanAcq(u) == ~rebooting /\ PC!PlanAcq(u, "cmd") /\ UNCHANGED wvars

\* The cold-index marker is written before any OS object exists. It records
\* the Job name, the boot identity and the login session.
WriteMarker(u) ==
    /\ ~rebooting /\ ph[u] = "planned" /\ known[u] /\ marker[u] = "none"
    /\ marker' = [marker EXCEPT ![u] = "cmd"]
    /\ sessAt' = [sessAt EXCEPT ![u] = curSess]
    /\ stale' = [stale EXCEPT ![u] = FALSE]
    /\ UNCHANGED pcvars
    /\ UNCHANGED <<started, permitted, bridge, anchor, koc, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

\* Bridge: CreateJobObjectW(name) + KILL_ON_JOB_CLOSE, then CreateProcessW with
\* CREATE_SUSPENDED and PROC_THREAD_ATTRIBUTE_JOB_LIST. The primary exists but
\* runs no user code. This is the first external effect: PC!Launch.
CreateSuspendedInJob(u) ==
    /\ ~rebooting /\ marker[u] = "cmd" /\ bridge[u] = "none"
    /\ PC!Launch(u)
    /\ bridge' = [bridge EXCEPT ![u] = "attached"]
    /\ anchor' = [anchor EXCEPT ![u] = Anchor]
    /\ koc' = [koc EXCEPT ![u] = TRUE]
    /\ UNCHANGED <<started, permitted, marker, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

\* The acquisition ledger `permit` answers confirmed.
Permit(u) ==
    /\ ~rebooting /\ ph[u] = "running" /\ known[u] /\ bridge[u] = "attached"
    /\ ~permitted[u] /\ PC!Permit(u)
    /\ permitted' = [permitted EXCEPT ![u] = TRUE]
    /\ UNCHANGED pcvars
    /\ UNCHANGED <<started, bridge, anchor, koc, marker, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

\* GO: the bridge calls ResumeThread. User code begins.
PermitGo(u) ==
    /\ ~rebooting /\ ph[u] = "running" /\ known[u] /\ bridge[u] = "attached"
    /\ permitted[u] /\ ~started[u]
    /\ started' = [started EXCEPT ![u] = TRUE]
    /\ UNCHANGED pcvars
    /\ UNCHANGED <<permitted, bridge, anchor, koc, marker, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

-----------------------------------------------------------------------------
(* What the processes do. A suspended primary cannot fork or exit.          *)

ForkPlain(u) == ~rebooting /\ (started[u] \/ rp[u] + ri[u] > 0) /\ PC!ForkPlain(u) /\ UNCHANGED wvars
ForkImmune(u) == ~rebooting /\ (started[u] \/ rp[u] + ri[u] > 0) /\ PC!ForkImmune(u) /\ UNCHANGED wvars
RestExit(u) == ~rebooting /\ PC!RestExitStep(u) /\ UNCHANGED wvars

\* The primary exits. The bridge's waiter thread observes it and the manager
\* records the exit frame (PC!PrimExit). An exit nobody can observe (bridge
\* not attached while the provider still holds the domain as running) is
\* deferred in the model until the domain is swept; nobody can tell the
\* difference, see report.md.
MainExit(u) ==
    /\ ~rebooting /\ started[u]
    /\ (known[u] /\ ph[u] = "running") => bridge[u] = "attached"
    /\ PC!PrimExit(u)
    /\ UNCHANGED wvars

-----------------------------------------------------------------------------
(* Disposal and handover: ledger steps as in PC, then the Windows mechanics. *)

Dispose(u) == ~rebooting /\ PC!Dispose(u) /\ UNCHANGED wvars
Commit(u) == ~rebooting /\ PC!Commit(u) /\ UNCHANGED wvars
Abort(u) == ~rebooting /\ PC!Abort(u) /\ UNCHANGED wvars

\* The handover marker is written and flushed after `adopt` confirmed.
WriteMarkerHanded(u) ==
    /\ ~rebooting /\ ph[u] = "retained" /\ known[u] /\ marker[u] = "cmd"
    /\ (~MarkerFirst /\ ClearOnHandover) => ~koc[u]
    /\ marker' = [marker EXCEPT ![u] = "handed"]
    /\ UNCHANGED pcvars
    /\ UNCHANGED <<started, permitted, bridge, anchor, koc, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

\* SetInformationJobObject clears KILL_ON_JOB_CLOSE. Needs a handle.
ClearKillOnClose(u) ==
    /\ ~rebooting /\ ClearOnHandover
    /\ ph[u] = "retained" /\ known[u] /\ koc[u] /\ Addressable(u)
    /\ MarkerFirst => marker[u] = "handed"
    /\ koc' = [koc EXCEPT ![u] = FALSE]
    /\ UNCHANGED pcvars
    /\ UNCHANGED <<started, permitted, bridge, anchor, marker, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

-----------------------------------------------------------------------------
(* Stopping. TerminateJobObject, then the supervisor reading.               *)

\* Explicit stop by the owner (handle stop, retained-process stop). Same as PC.
Stop(u) == ~rebooting /\ PC!Stop(u) /\ UNCHANGED wvars

\* TerminateJobObject through the attached bridge, or through a recover bridge
\* that reopened the name. Kills every member, the anchor included.
TerminateJob(u) ==
    /\ ~rebooting /\ ph[u] = "stopping" /\ known[u] /\ Addressable(u)
    /\ Live(u) \/ anchor[u]
    /\ IF Live(u) THEN PC!Kill(u) ELSE UNCHANGED pcvars
    /\ anchor' = [anchor EXCEPT ![u] = FALSE]
    /\ UNCHANGED <<started, permitted, bridge, koc, marker, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

\* QueryInformationJobObject reads zero active processes through a handle.
\* The confirmed stop is recorded and the marker deleted.
ConfirmObserved(u) ==
    /\ ~rebooting /\ ph[u] = "stopping" /\ known[u] /\ Addressable(u)
    /\ ~Live(u) /\ ~anchor[u]
    /\ PC!Confirm(u)
    /\ marker' = [marker EXCEPT ![u] = "none"]
    /\ UNCHANGED <<started, permitted, bridge, anchor, koc, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

\* OpenJobObjectW by name fails in the current session and boot. The design
\* takes that as evidence of a stop. Written without PC!Confirm so that TLC
\* can tell when the evidence is false.
ConfirmNotFound(u) ==
    /\ ~rebooting /\ ph[u] = "stopping" /\ known[u]
    /\ ~Openable(u) /\ ~stale[u]
    /\ SessionAware => sessAt[u] = curSess
    /\ HandedAware => marker[u] # "handed"
    /\ ph' = [ph EXCEPT ![u] = "stopped"]
    /\ marker' = [marker EXCEPT ![u] = "none"]
    /\ confirmedByAbsence' = TRUE
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, stopDecided, retainDecided,
                   keptDenied, evicted, enteredAfterClose>>
    /\ UNCHANGED <<started, permitted, bridge, anchor, koc, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByStale>>

\* The marker's boot identity is not the current one: the reboot ended the Job.
ConfirmStale(u) ==
    /\ ~rebooting /\ ph[u] = "stopping" /\ known[u] /\ stale[u]
    /\ ph' = [ph EXCEPT ![u] = "stopped"]
    /\ marker' = [marker EXCEPT ![u] = "none"]
    /\ confirmedByStale' = TRUE
    /\ UNCHANGED <<own, kind, prim, rp, ri, out, closed, closureDone, acqSt, resv,
                   known, indexComplete, crashes, stopDecided, retainDecided,
                   keptDenied, evicted, enteredAfterClose>>
    /\ UNCHANGED <<started, permitted, bridge, anchor, koc, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence>>

\* The index reads an empty Job (only the anchor left) and stops it (D15).
Drain(u) == ~rebooting /\ Addressable(u) /\ PC!Drain(u) /\ UNCHANGED wvars

-----------------------------------------------------------------------------
(* Release, closure: ledger steps as in PC.                                 *)

Release == ~rebooting /\ PC!Release /\ UNCHANGED wvars
DrainSweep(u) == ~rebooting /\ PC!DrainSweep(u) /\ UNCHANGED wvars
Settle == ~rebooting /\ PC!Settle /\ UNCHANGED wvars
CloseScope == ~rebooting /\ PC!CloseScope /\ UNCHANGED wvars
CloseSweep(u) == ~rebooting /\ PC!CloseSweep(u) /\ UNCHANGED wvars
ClosureDone == ~rebooting /\ PC!ClosureDone /\ UNCHANGED wvars

-----------------------------------------------------------------------------
(* Faults: bridge death, provider crash, reboot, recovery.                  *)

\* The bridge process dies (crash, kill, or a design that lets it exit). The
\* kernel closes its Job handle. With KILL_ON_JOB_CLOSE and no other handle
\* every member dies at once. A provider that was attached to the bridge
\* treats a running command's lost bridge as a failed resource and stops it.
BridgeDies(u) ==
    /\ ~rebooting /\ started[u] /\ Held(u) /\ bridgeDeaths < MaxBridgeDeath
    /\ LET kills == koc[u] /\ ~anchor[u] /\ Live(u)
           react == known[u] /\ bridge[u] = "attached" /\ ph[u] = "running"
       IN /\ bridgeDeaths' = bridgeDeaths + 1
          /\ bridge' = [bridge EXCEPT ![u] = "dead"]
          /\ prim' = IF kills THEN [prim EXCEPT ![u] = FALSE] ELSE prim
          /\ rp' = IF kills THEN [rp EXCEPT ![u] = 0] ELSE rp
          /\ ri' = IF kills THEN [ri EXCEPT ![u] = 0] ELSE ri
          /\ retainedKilledByClose' = (retainedKilledByClose \/ (kills /\ ph[u] = "retained"))
          /\ ph' = IF react THEN [ph EXCEPT ![u] = "stopping"] ELSE ph
    /\ UNCHANGED <<own, kind, out, closed, closureDone, acqSt, resv, known, indexComplete,
                   crashes, stopDecided, retainDecided, keptDenied, evicted, enteredAfterClose>>
    /\ UNCHANGED <<started, permitted, anchor, koc, marker, sessAt, stale, curSess, rebooting,
                   confirmedByAbsence, confirmedByStale>>

\* The provider process crashes. Bridges and Jobs survive; the bridges lose
\* their controller.
Crash ==
    /\ ~rebooting /\ PC!Crash
    /\ bridge' = [u \in Units |-> IF bridge[u] = "attached" THEN "orphan" ELSE bridge[u]]
    /\ UNCHANGED <<started, permitted, anchor, koc, marker, sessAt, stale, curSess, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

\* A new provider instance reads the durable ledger and every marker. It may
\* run in another login session.
Recover ==
    /\ ~rebooting /\ PC!Recover
    /\ curSess' \in Sessions
    /\ UNCHANGED <<started, permitted, bridge, anchor, koc, marker, sessAt, stale, rebooting,
                   bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

\* Reboot, serialised: the provider is gone (PC!Crash), then processes die
\* one by one with nobody watching, then the machine is up with a new boot
\* identity. The interleaving is unobservable, so this equals an atomic reboot.
Reboot == ~rebooting /\ PC!Crash /\ rebooting' = TRUE
          /\ UNCHANGED <<started, permitted, bridge, anchor, koc, marker, sessAt, stale, curSess,
                         bridgeDeaths, retainedKilledByClose, confirmedByAbsence, confirmedByStale>>
RebootKill(u) == rebooting /\ (PC!PrimExit(u) \/ PC!RestExitStep(u)) /\ UNCHANGED wvars
BootUp ==
    /\ rebooting /\ \A u \in Units : ~Live(u)
    /\ rebooting' = FALSE
    /\ bridge' = [u \in Units |-> IF bridge[u] = "none" THEN "none" ELSE "dead"]
    /\ anchor' = [u \in Units |-> FALSE]
    /\ stale' = [u \in Units |-> TRUE]
    /\ UNCHANGED pcvars
    /\ UNCHANGED <<started, permitted, koc, marker, sessAt, curSess, bridgeDeaths,
                   retainedKilledByClose, confirmedByAbsence, confirmedByStale>>

-----------------------------------------------------------------------------

Next ==
    \/ \E u \in Units :
          \/ PlanAcq(u) \/ WriteMarker(u) \/ CreateSuspendedInJob(u) \/ Permit(u) \/ PermitGo(u)
          \/ ForkPlain(u) \/ ForkImmune(u) \/ RestExit(u) \/ MainExit(u)
          \/ Dispose(u) \/ Commit(u) \/ Abort(u) \/ WriteMarkerHanded(u) \/ ClearKillOnClose(u)
          \/ Stop(u) \/ TerminateJob(u) \/ ConfirmObserved(u) \/ ConfirmNotFound(u)
          \/ ConfirmStale(u) \/ Drain(u)
          \/ DrainSweep(u) \/ CloseSweep(u)
          \/ BridgeDies(u) \/ RebootKill(u)
    \/ Release \/ Settle \/ CloseScope \/ ClosureDone
    \/ Crash \/ Recover \/ Reboot \/ BootUp

Spec == Init /\ [][Next]_vars

Fairness ==
    /\ \A u \in Units :
          /\ WF_vars(TerminateJob(u)) /\ WF_vars(ConfirmObserved(u))
          /\ WF_vars(ConfirmNotFound(u)) /\ WF_vars(ConfirmStale(u)) /\ WF_vars(Drain(u))
          /\ WF_vars(Dispose(u)) /\ WF_vars(Commit(u)) /\ WF_vars(Abort(u))
          /\ WF_vars(WriteMarkerHanded(u)) /\ WF_vars(ClearKillOnClose(u))
          /\ WF_vars(DrainSweep(u)) /\ WF_vars(CloseSweep(u))
    /\ WF_vars(Settle) /\ WF_vars(ClosureDone) /\ WF_vars(Recover) /\ WF_vars(BootUp)

LiveSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
(* Properties. The PC names keep their numbers (formal-mapping.md).        *)

\* Refinement: every behaviour is a behaviour of ProcessCustody at target values.
\* Written out because TLC cannot evaluate PC!Spec's subscript PC!vars.
Refines == PC!Init /\ [][PC!Next]_pcvars

Auxiliary == PC!Auxiliary
NoLeak == PC!NoLeak                               \* T1
UniqueOwner == PC!UniqueOwner                     \* T2
OneDisposition == PC!OneDisposition               \* T3
StopTruth == PC!StopTruth                         \* T4
NoEntryAfterClose == PC!NoEntryAfterClose         \* T5
ClosureTruth == PC!ClosureTruth                   \* T5, T8
NoEviction == PC!NoEviction                       \* T6
SettleTruth == PC!SettleTruth                     \* T8
KeepWhenPermitted == PC!KeepWhenPermitted         \* T10
ReservedFromAcq == PC!ReservedFromAcq             \* I8
\* The temporal properties are copied from PC with the local subscript.
OwnerOnlyForward ==                               \* I2 (action)
    [][\A u \in Units :
         own'[u] # own[u] => (own[u] = "none" \/ (own[u] = "acq" /\ own'[u] = "ret"))]_pcvars
RetainedSurvivesRelease ==                        \* T7 (action)
    [][\A u \in Units : (own[u] = "ret" /\ PC!ReleaseSteps) => ph'[u] = ph[u]]_pcvars
ClosureEnds ==                                    \* L1
    closed ~> \A u \in Units : own[u] = "ret" => ph[u] \in {"none", "stopped"}
ReleaseEnds == (acqSt = "draining") ~> (acqSt = "settled")   \* L2
RetainedSettles ==                                \* L3
    \A u \in Units : (ph[u] = "retained" /\ ~Live(u)) ~> (ph[u] = "stopped")

\* Windows-specific properties.
\* W1 (H-2): user code runs only after the ledger permit confirmed.
UserCodeAfterPermit == \A u \in Units : started[u] => permitted[u]
\* W2 (H-5): a domain with members, or with its anchor, can be reached by name
\* or handle. Without it nobody can list or stop the members.
Reachable == rebooting \/ \A u \in Units : (Live(u) \/ anchor[u]) => Named(u)
\* W3 (H-6): every Job that has members is in the cold index.
MarkerCoversJob == \A u \in Units : (Live(u) \/ anchor[u]) => marker[u] # "none"
\* W4 (T10 on Windows): a retained domain never loses members to a handle close.
NoRetainedKillOnClose == ~retainedKilledByClose

\* Reachability witnesses. Each must be violated by the target configuration.
NeverSuspendedBeforePermit == ~\E u \in Units : prim[u] /\ ~permitted[u]
NeverRetainedAlive == ~\E u \in Units : ph[u] = "retained" /\ Live(u)
NeverRetainedOutlivesBridge == ~\E u \in Units : ph[u] = "retained" /\ Live(u) /\ bridge[u] = "dead"
NeverPendingInOtherSession ==
    ~\E u \in Units : ph[u] = "stopping" /\ Live(u) /\ known[u] /\ sessAt[u] # curSess
NeverConfirmedByAbsence == ~confirmedByAbsence
NeverConfirmedByStale == ~confirmedByStale
NeverSettledAfterReboot == ~(acqSt = "settled" /\ \E u \in Units : stale[u] /\ own[u] = "acq")
=============================================================================

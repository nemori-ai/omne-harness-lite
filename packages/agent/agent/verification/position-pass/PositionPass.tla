----------------------------- MODULE PositionPass -----------------------------
(***************************************************************************)
(* One pass of the Agent loop through one loop extension position, while   *)
(* the tenant changes its enabled extensions at any moment.                *)
(*                                                                         *)
(* The ought: the coordinator reads the tenant's enabled chain once when   *)
(* it arrives at the position, and records it with the first call. The     *)
(* recorded chain does not change during this pass. A crash or a takeover  *)
(* continues from the record: it does not read the chain again, and it     *)
(* does not call a member that already has a conclusion. A call whose      *)
(* result is unknown is called again in replay mode, never as a second     *)
(* fresh call. "Could not prove that it did not start" is unknown, not     *)
(* unavailable. An unreadable view is not an empty chain. After a          *)
(* cancellation takes effect no new call starts.                           *)
(*                                                                         *)
(* Durable state (AgentJournal): opened, snap, st, concl, left, cancelled. *)
(* Environment: view, viewUp (the tenant and the view producer).           *)
(* Volatile state (one coordinator process): online, mine, tried, known,   *)
(* inflight, decidedEmpty. A crash clears the volatile state.              *)
(* Ghosts: snap0, runs, freshStarts, runsAfterConcl, startsAfterCancel,    *)
(* leftUnread, crashes, flips, downs, losses. No action reads a ghost except to    *)
(* bound the state space.                                                  *)
(*                                                                         *)
(* Bad names one deliberate error; "none" is the ought.                    *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Exts,         \* extension ids, positive numbers; chain order is numeric order
  InitView,     \* the tenant's enabled set when the pass begins
  MaxCrash,     \* crashes of the coordinator process
  MaxFlip,      \* installs and removals by the tenant
  MaxDown,      \* times the view becomes unreadable
  MaxLoss,      \* call results that are lost
  AllowCancel,  \* the run can be cancelled
  Bad           \* "none", or the name of one deliberate error

ASSUME Exts \subseteq (Nat \ {0}) /\ InitView \subseteq Exts
ASSUME AllowCancel \in BOOLEAN

VARIABLES view, viewUp, opened, snap, st, concl, left, cancelled,
          online, mine, tried, known, inflight, decidedEmpty,
          snap0, runs, freshStarts, runsAfterConcl, startsAfterCancel,
          leftUnread, crashes, flips, downs, losses

durable  == <<opened, snap, st, concl, left, cancelled>>
volatile == <<online, mine, tried, known, inflight, decidedEmpty>>
env      == <<view, viewUp>>
ghosts   == <<snap0, runs, freshStarts, runsAfterConcl, startsAfterCancel,
              leftUnread, crashes, flips, downs, losses>>
vars     == <<env, durable, volatile, ghosts>>

None == 0
Min(S) == CHOOSE x \in S : \A y \in S : x <= y
Results == {"observed", "veto", "unavailable"}

Cut     == \E d \in snap : concl[d] = "veto"
Pending == {e \in snap : st[e] # "resolved"}
Cur     == IF opened /\ ~Cut /\ Pending # {} THEN Min(Pending) ELSE None

TypeOK ==
  /\ view \subseteq Exts /\ viewUp \in BOOLEAN
  /\ opened \in BOOLEAN /\ snap \subseteq Exts /\ left \in BOOLEAN /\ cancelled \in BOOLEAN
  /\ st \in [Exts -> {"none", "requested", "resolved"}]
  /\ concl \in [Exts -> Results \cup {"none"}]
  /\ online \in BOOLEAN /\ decidedEmpty \in BOOLEAN
  /\ mine \in [Exts -> BOOLEAN] /\ tried \in [Exts -> BOOLEAN]
  /\ known \in [Exts -> Results \cup {"none"}]
  /\ inflight \in Exts \cup {None}

Init ==
  /\ view = InitView /\ viewUp = TRUE
  /\ opened = FALSE /\ snap = {} /\ left = FALSE /\ cancelled = FALSE
  /\ st = [e \in Exts |-> "none"] /\ concl = [e \in Exts |-> "none"]
  /\ online = TRUE /\ decidedEmpty = FALSE /\ inflight = None
  /\ mine = [e \in Exts |-> FALSE] /\ tried = [e \in Exts |-> FALSE]
  /\ known = [e \in Exts |-> "none"]
  /\ snap0 = {} /\ runs = [e \in Exts |-> 0] /\ freshStarts = [e \in Exts |-> 0]
  /\ runsAfterConcl = [e \in Exts |-> 0] /\ startsAfterCancel = 0
  /\ leftUnread = FALSE /\ crashes = 0 /\ flips = 0 /\ downs = 0 /\ losses = 0

(***************************************************************************)
(* Arriving at the position: read the view once.                           *)
(***************************************************************************)
OpenPass ==
  /\ online /\ ~opened /\ ~left /\ ~cancelled /\ ~decidedEmpty
  /\ viewUp /\ view # {}
  /\ opened' = TRUE /\ snap' = view /\ snap0' = view
  /\ st' = [st EXCEPT ![Min(view)] = "requested"]
  /\ mine' = [mine EXCEPT ![Min(view)] = TRUE]
  /\ UNCHANGED <<env, concl, left, cancelled, online, tried, known, inflight, decidedEmpty,
                 runs, freshStarts, runsAfterConcl, startsAfterCancel, leftUnread,
                 crashes, flips, downs, losses>>

\* An empty chain opens no pass and commits nothing here.
SeeEmpty ==
  /\ online /\ ~opened /\ ~left /\ ~cancelled /\ ~decidedEmpty
  /\ \/ viewUp /\ view = {} /\ UNCHANGED leftUnread
     \/ ~viewUp /\ Bad = "UnavailableAsEmpty" /\ leftUnread' = TRUE
  /\ decidedEmpty' = TRUE
  /\ UNCHANGED <<env, durable, online, mine, tried, known, inflight,
                 snap0, runs, freshStarts, runsAfterConcl, startsAfterCancel,
                 crashes, flips, downs, losses>>

\* The node's own commit moves the loop past the position.
LeaveEmpty ==
  /\ online /\ decidedEmpty /\ ~left
  /\ left' = TRUE /\ decidedEmpty' = FALSE
  /\ UNCHANGED <<env, opened, snap, st, concl, cancelled, online, mine, tried, known,
                 inflight, ghosts>>

(***************************************************************************)
(* One call of the current member. The request was committed before.       *)
(***************************************************************************)
Fresh(e) == IF Bad = "FreshAfterCrash" THEN ~tried[e] ELSE mine[e] /\ ~tried[e]

Launch(e) ==
  /\ online /\ opened /\ ~left /\ e = Cur /\ st[e] = "requested"
  /\ inflight = None /\ known[e] = "none"
  /\ cancelled => Bad = "StartAfterCancel"
  /\ IF e \in view
       THEN \* the implementation is there: the call physically runs
            /\ inflight' = e
            /\ tried' = [tried EXCEPT ![e] = TRUE]
            /\ runs' = [runs EXCEPT ![e] = @ + 1]
            /\ freshStarts' = [freshStarts EXCEPT ![e] = IF Fresh(e) THEN @ + 1 ELSE @]
            /\ runsAfterConcl' = [runsAfterConcl EXCEPT ![e] = IF concl[e] # "none" THEN @ + 1 ELSE @]
            /\ startsAfterCancel' = IF cancelled THEN startsAfterCancel + 1 ELSE startsAfterCancel
            /\ UNCHANGED known
       ELSE \* disabled or removed now: a fresh call is proven not started; a replay waits
            /\ Fresh(e)
            /\ known' = [known EXCEPT ![e] = "unavailable"]
            /\ UNCHANGED <<inflight, tried, runs, freshStarts, runsAfterConcl, startsAfterCancel>>
  /\ UNCHANGED <<env, durable, online, mine, decidedEmpty, snap0, leftUnread, crashes, flips, downs, losses>>

\* The call returns a legal output, or its result is lost.
Return(e, r) ==
  /\ online /\ inflight = e
  /\ r = "lost" => losses < MaxLoss
  /\ losses' = IF r = "lost" THEN losses + 1 ELSE losses
  /\ inflight' = None
  /\ known' = [known EXCEPT ![e] =
                 IF r = "lost"
                   THEN IF Bad = "UnknownAsUnavailable" THEN "unavailable" ELSE "none"
                   ELSE r]
  /\ UNCHANGED <<env, durable, online, mine, tried, decidedEmpty, snap0, runs, freshStarts,
                 runsAfterConcl, startsAfterCancel, leftUnread, crashes, flips, downs>>

\* Commit the conclusion; the next member's request goes into the same commit.
Conclude(e) ==
  /\ online /\ opened /\ ~left /\ ~cancelled
  /\ st[e] = "requested" /\ known[e] # "none"
  /\ LET rest == {d \in snap : d > e}
         nxt  == IF known[e] # "veto" /\ rest # {} THEN Min(rest) ELSE None
     IN /\ st' = [d \in Exts |-> IF d = e THEN "resolved"
                                 ELSE IF d = nxt THEN "requested" ELSE st[d]]
        /\ mine' = [d \in Exts |-> IF d = nxt THEN TRUE ELSE mine[d]]
  /\ concl' = [concl EXCEPT ![e] = known[e]]
  /\ known' = [known EXCEPT ![e] = "none"]
  /\ UNCHANGED <<env, opened, snap, left, cancelled, online, tried, inflight, decidedEmpty, ghosts>>

\* The chain is complete or cut by a veto: adopt the effect and leave.
Apply ==
  /\ online /\ opened /\ ~left /\ ~cancelled
  /\ Cut \/ Pending = {}
  /\ left' = TRUE
  /\ UNCHANGED <<env, opened, snap, st, concl, cancelled, volatile, ghosts>>

(***************************************************************************)
(* Crash and takeover. A physical run in progress is not undone.           *)
(***************************************************************************)
Crash ==
  /\ online /\ crashes < MaxCrash
  /\ online' = FALSE /\ decidedEmpty' = FALSE /\ inflight' = None
  /\ mine' = [e \in Exts |-> FALSE] /\ tried' = [e \in Exts |-> FALSE]
  /\ known' = [e \in Exts |-> "none"]
  /\ crashes' = crashes + 1
  /\ UNCHANGED <<env, durable, snap0, runs, freshStarts, runsAfterConcl,
                 startsAfterCancel, leftUnread, flips, downs, losses>>

Takeover ==
  /\ ~online /\ online' = TRUE
  /\ snap' = IF Bad = "ResnapAfterCrash" /\ opened /\ ~left /\ viewUp /\ view # {}
               THEN view ELSE snap
  /\ st' = IF Bad = "RecallResolved" /\ opened /\ ~left
             THEN [e \in Exts |-> IF st[e] = "resolved" /\ concl[e] # "veto"
                                    THEN "requested" ELSE st[e]]
             ELSE st
  /\ UNCHANGED <<env, opened, concl, left, cancelled, mine, tried, known, inflight,
                 decidedEmpty, ghosts>>

(***************************************************************************)
(* The environment: the tenant, the view producer, the controller.         *)
(***************************************************************************)
Flip(e) ==
  /\ flips < MaxFlip
  /\ view' = IF e \in view THEN view \ {e} ELSE view \cup {e}
  /\ flips' = flips + 1
  /\ UNCHANGED <<viewUp, durable, volatile, snap0, runs, freshStarts, runsAfterConcl,
                 startsAfterCancel, leftUnread, crashes, downs, losses>>

ViewDown ==
  /\ viewUp /\ downs < MaxDown
  /\ viewUp' = FALSE /\ downs' = downs + 1
  /\ UNCHANGED <<view, durable, volatile, snap0, runs, freshStarts, runsAfterConcl,
                 startsAfterCancel, leftUnread, crashes, flips, losses>>

ViewUp ==
  /\ ~viewUp /\ viewUp' = TRUE
  /\ UNCHANGED <<view, durable, volatile, ghosts>>

Cancel ==
  /\ AllowCancel /\ ~cancelled /\ ~left
  /\ cancelled' = TRUE
  /\ UNCHANGED <<env, opened, snap, st, concl, left, volatile, ghosts>>

Next ==
  \/ OpenPass \/ SeeEmpty \/ LeaveEmpty \/ Apply
  \/ \E e \in Exts : Launch(e) \/ Conclude(e) \/ Flip(e)
  \/ \E e \in Exts, r \in {"observed", "veto", "lost"} : Return(e, r)
  \/ Crash \/ Takeover \/ ViewDown \/ ViewUp \/ Cancel

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* Properties.                                                             *)
(***************************************************************************)
\* The recorded chain does not change during the pass.
SnapStable == opened => snap = snap0

\* Only members of the recorded chain run in this pass.
OnlySnapRuns == \A e \in Exts : runs[e] > 0 => e \in snap0

\* A member that has a conclusion is not called again (I6).
NoRecall == \A e \in Exts : runsAfterConcl[e] = 0

\* At most one fresh call per member; every later call is a replay.
FreshOnce == \A e \in Exts : freshStarts[e] <= 1

\* "Unavailable" is concluded only when the call is proven not started.
UnavailableNeverRan == \A e \in Exts : concl[e] = "unavailable" => runs[e] = 0

\* After a cancellation takes effect no new call starts (I13).
NoStartAfterCancel == startsAfterCancel = 0

\* An unreadable view is never taken for an empty chain.
NeverLeftUnread == ~leftUnread

\* Members run in chain order, and nothing runs after a veto.
InOrder ==
  \A e \in snap0 : st[e] # "none" =>
    \A d \in snap0 : d < e => concl[d] \notin {"none", "veto"}

(***************************************************************************)
(* Reachability targets: each is expected to be violated.                  *)
(***************************************************************************)
NeverAppliedAfterRun == ~(opened /\ left /\ \E e \in Exts : runs[e] > 0)
NeverHotInstall      == ~(opened /\ \E e \in snap0 : e \notin InitView)
NeverReplayed        == \A e \in Exts : runs[e] <= 1
NeverSkippedRevoked  == \A e \in Exts : concl[e] # "unavailable"
===============================================================================

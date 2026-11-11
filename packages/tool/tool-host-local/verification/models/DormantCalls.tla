---------------------------- MODULE DormantCalls ----------------------------
(* One suspended Tool call that waits for a person, and the executor of one process.

   The executor keeps a table of the calls it drives. Its timer schedules every call of the table
   at each tick. A call that waits for a person has nothing to do until a decision arrives, so the
   executor takes it out of the table (it goes dormant) and three things bring it back:
     - the hint the decision owner sends when a person answered (it may be lost);
     - the recovery scan, which reads the calls with pending work from the ledger and is armed
       again at a long period;
     - a run that the instance host queued for a call the table no longer holds: the executor
       reads the ledger and takes the call back when it has pending work.

   present   the call is in the table of the executor
   queued    the instance host holds a run of the call, with what queued it
   decision  "none", "ready" (the decision owner holds it) or "taken" (the call accepted it)
   leaving   the call is on its way out of the table after its run returned; only the variant
             "leave-after-run" reaches it

   The instance host runs the runs of one call one after the other, and a dormant call leaves the
   table before its run returns. So one run with its leaving is one step here. The variant
   "leave-after-run" lets the run return first: the next run meets an entry that is leaving and
   does nothing, which is what a run does with a retiring entry.

   Each `Bad` variant is one way this breaks. *)
CONSTANT Bad

VARIABLES present, queued, decision, leaving
vars == <<present, queued, decision, leaving>>

Sources == {"tick", "hint", "scan"}

TypeOK ==
  /\ present \in BOOLEAN
  /\ queued \in Sources \cup {"none"}
  /\ decision \in {"none", "ready", "taken"}
  /\ leaving \in BOOLEAN

Init == present = TRUE /\ queued = "none" /\ decision = "none" /\ leaving = FALSE

(* A person answers. The hint reaches the instance host, or it is lost. A run that is queued
   already stays as it is: the host marks it to run again, which is the same run here. *)
Answer ==
  /\ decision = "none" /\ decision' = "ready"
  /\ \/ queued' = (IF queued = "none" THEN "hint" ELSE queued)
     \/ queued' = queued
  /\ UNCHANGED <<present, leaving>>

(* The timer: every call of the table that is not leaving is scheduled. *)
Tick ==
  /\ present /\ ~leaving /\ queued = "none"
  /\ queued' = "tick"
  /\ UNCHANGED <<present, decision, leaving>>

(* The recovery scan finds the call by its pending marker, puts it in the table and schedules it. *)
Scan ==
  /\ Bad # "no-rescan"
  /\ queued = "none"
  /\ present' = TRUE /\ queued' = "scan"
  /\ UNCHANGED <<decision, leaving>>

(* One run. A run that meets a leaving entry does nothing. A call the table does not hold is
   taken back when the ledger shows pending work, which a suspended call with an open wait always
   shows. Then the driver asks the decision owner: a decision is accepted and the call goes on;
   without one the run is idle and the call leaves the table. *)
Run ==
  /\ queued # "none" /\ queued' = "none"
  /\ LET owned == present \/ Bad # "no-reentry" IN
     IF leaving \/ ~owned THEN UNCHANGED <<present, decision, leaving>>
     ELSE IF decision = "ready" THEN decision' = "taken" /\ present' = TRUE /\ UNCHANGED leaving
     ELSE IF decision = "none" /\ Bad # "no-dormant"
       THEN /\ UNCHANGED decision
            /\ present' = (Bad = "leave-after-run")
            /\ leaving' = (Bad = "leave-after-run")
       ELSE UNCHANGED <<present, decision, leaving>>

(* The entry that outlived its run leaves the table. *)
Leave ==
  /\ leaving /\ leaving' = FALSE /\ present' = FALSE
  /\ UNCHANGED <<queued, decision>>

Next == Answer \/ Tick \/ Scan \/ Run \/ Leave

(* The person and the loss of a hint are not fair; the timer, the scan and the runs are. *)
Spec ==
  Init /\ [][Next]_vars /\ WF_vars(Tick) /\ WF_vars(Scan) /\ WF_vars(Run) /\ WF_vars(Leave)

(* A decision is taken, also when its hint was lost. *)
DecisionTaken == (decision = "ready") ~> (decision = "taken")

(* A hint is enough: the run it queued takes the decision, without waiting for a scan. *)
HintIsEnough == [][(queued = "hint" /\ queued' = "none" /\ decision = "ready") => decision' = "taken"]_vars

(* The timer never schedules a call that left the table. *)
DormantIsNotTicked == [][queued' = "tick" => present]_vars

(* A call that waits with nothing to do leaves the table: it does not stay to be run at each tick. *)
WaitingLeavesTable == (decision = "none" /\ present) ~> (~present \/ decision # "none")
=============================================================================

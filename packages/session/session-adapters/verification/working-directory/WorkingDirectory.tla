--------------------------- MODULE WorkingDirectory ---------------------------
(* The working directory of a session across switches, step boundaries, tool-call
   acceptance and process restarts.

   Durable facts: the session's selection (session log), the block value committed at
   the last step boundary (a step commit in the session log), the last value written
   to the model in a reminder (session log), and each accepted call's pinned directory
   (the fixed tool request). Live state: what the holder has told the model; a restart
   loses it. The block is a state block: a restart installs its last committed value.

   Mode selects the design under test. "good" is the accepted design; every other
   value removes exactly one rule and must violate the property named in expect.txt. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Dirs, MaxCalls, MaxSwitches, MaxSteps, MaxCrashes, Mode

Modes == {"good", "live_read", "direct_publish", "recover_latest", "volatile_block",
          "exec_reread", "volatile_pin", "refresh_after_read"}
ASSUME Mode \in Modes
ASSUME Cardinality(Dirs) >= 2

None == "none"
InitialDir == CHOOSE d \in Dirs : TRUE
Ids == 1..MaxCalls

VARIABLES
  sel,            \* durable: the session's current selection
  told,           \* durable: the directory in the last reminder the model has
  block,          \* durable: the value committed at the last step boundary; None before the first
  holderTold,     \* live: what the holder knows it has told
  phase,          \* the step loop: idle, refreshed, ready, requested, resume
  selAtBoundary,  \* ghost: the selection when the current step began
  calls, nSwitch, nStep, nCrash

vars == <<sel, told, block, holderTold, phase, selAtBoundary, calls, nSwitch, nStep, nCrash>>

Free == [st |-> "free", belief |-> None, pin |-> None, first |-> None, exec |-> None]

Init ==
  /\ sel = InitialDir /\ told = None /\ block = None /\ holderTold = None
  /\ phase = "idle" /\ selAtBoundary = InitialDir
  /\ calls = [i \in Ids |-> Free]
  /\ nSwitch = 0 /\ nStep = 0 /\ nCrash = 0

Issued == {i \in Ids : calls[i].st = "issued"}

\* A person or the agent's own tool switches the session. The commit changes the log only.
Switch(d) ==
  /\ nSwitch < MaxSwitches /\ d # sel
  /\ sel' = d /\ nSwitch' = nSwitch + 1
  /\ block' = IF Mode = "direct_publish" THEN d ELSE block
  /\ UNCHANGED <<told, holderTold, phase, selAtBoundary, calls, nStep, nCrash>>

\* Before a step: commit the block from the selection, as a step commit in the log.
Boundary ==
  /\ phase = "idle" /\ Issued = {} /\ nStep < MaxSteps
  /\ phase' = "refreshed" /\ selAtBoundary' = sel /\ nStep' = nStep + 1
  /\ block' = IF Mode = "refresh_after_read" THEN block ELSE sel
  /\ UNCHANGED <<sel, told, holderTold, calls, nSwitch, nCrash>>

\* Still before the step: read the block as the model-class reader and commit a reminder
\* when the value differs from what the holder has told.
ReminderCommit ==
  /\ phase = "refreshed"
  /\ LET v == IF block = None THEN sel ELSE block IN
       /\ told' = IF holderTold # v THEN v ELSE told
       /\ holderTold' = v
       /\ block' = IF Mode = "refresh_after_read" THEN sel ELSE v
  /\ phase' = "ready"
  /\ UNCHANGED <<sel, selAtBoundary, calls, nSwitch, nStep, nCrash>>

\* The reminder commit fails: the step does not run.
ReminderFail ==
  /\ phase = "refreshed" /\ phase' = "idle"
  /\ UNCHANGED <<sel, told, block, holderTold, selAtBoundary, calls, nSwitch, nStep, nCrash>>

\* The model request of this step. The model reads the log, so it believes `told`.
ModelRequest ==
  /\ phase = "ready" /\ phase' = "requested"
  /\ \E S \in SUBSET {i \in Ids : calls[i].st = "free"} :
       calls' = [i \in Ids |-> IF i \in S THEN [Free EXCEPT !.st = "issued", !.belief = told]
                               ELSE calls[i]]
  /\ UNCHANGED <<sel, told, block, holderTold, selAtBoundary, nSwitch, nStep, nCrash>>

\* The tool request source accepts a call: read the block, pin the value into the
\* durable fixed request. No value committed: the call is refused as unavailable.
Accept(i) ==
  /\ \/ calls[i].st = "issued" /\ phase \in {"requested", "resume"}
     \/ calls[i].st = "replan"
  /\ LET v == IF Mode = "live_read" THEN sel ELSE block IN
       calls' = IF v = None
                THEN [calls EXCEPT ![i].st = "refused"]
                ELSE [calls EXCEPT ![i].st = "prepared", ![i].pin = v,
                                   ![i].first = IF @ = None THEN v ELSE @]
  /\ UNCHANGED <<sel, told, block, holderTold, phase, selAtBoundary, nSwitch, nStep, nCrash>>

\* The call runs to its end, at any later time, in its pinned directory.
Finish(i) ==
  /\ calls[i].st = "prepared"
  /\ LET d == IF Mode = "exec_reread" /\ block # None THEN block ELSE calls[i].pin IN
       calls' = [calls EXCEPT ![i].st = "done", ![i].exec = d]
  /\ UNCHANGED <<sel, told, block, holderTold, phase, selAtBoundary, nSwitch, nStep, nCrash>>

StepEnd ==
  /\ phase \in {"requested", "resume"} /\ Issued = {}
  /\ phase' = "idle"
  /\ UNCHANGED <<sel, told, block, holderTold, selAtBoundary, calls, nSwitch, nStep, nCrash>>

\* A restart loses every live value. The block comes back as it was last committed, and
\* accepted calls keep their durable pin.
Crash ==
  /\ nCrash < MaxCrashes /\ nCrash' = nCrash + 1
  /\ block' = CASE Mode = "volatile_block" -> None
               [] Mode = "recover_latest" /\ block # None -> sel
               [] OTHER -> block
  /\ holderTold' = None
  /\ phase' = IF Issued # {} THEN "resume" ELSE "idle"
  /\ calls' = IF Mode = "volatile_pin"
              THEN [i \in Ids |-> IF calls[i].st = "prepared"
                                  THEN [calls[i] EXCEPT !.st = "replan", !.pin = None]
                                  ELSE calls[i]]
              ELSE calls
  /\ UNCHANGED <<sel, told, selAtBoundary, nSwitch, nStep>>

Next ==
  \/ \E d \in Dirs : Switch(d)
  \/ Boundary \/ ReminderCommit \/ ReminderFail \/ ModelRequest \/ StepEnd \/ Crash
  \/ \E i \in Ids : Accept(i) \/ Finish(i)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ sel \in Dirs /\ told \in Dirs \cup {None} /\ block \in Dirs \cup {None}
  /\ holderTold \in Dirs \cup {None}
  /\ phase \in {"idle", "refreshed", "ready", "requested", "resume"}
  /\ \A i \in Ids : calls[i].st \in {"free", "issued", "prepared", "replan", "refused", "done"}

\* N-8: a call runs in the directory pinned when it was first accepted.
PinnedDirectory == \A i \in Ids : calls[i].st = "done" => calls[i].exec = calls[i].first

\* N-9: the pinned directory is the one the model was told when it issued the call.
ToldDirectory ==
  \A i \in Ids : calls[i].st \in {"prepared", "replan", "done"} => calls[i].first = calls[i].belief

\* N-10: a step that reaches its model request has told the model the selection that
\* held when the step began.
ToldAtBoundary == phase \in {"ready", "requested"} => told = selAtBoundary

\* R-13: no call is refused for want of a directory, across restarts too.
NoRefusal == \A i \in Ids : calls[i].st # "refused"

\* Vacuity controls: each must be violated in the good design.
NoCallAfterSwitch == \A i \in Ids : calls[i].st = "done" => calls[i].exec = InitialDir
NoCallOutlivesSwitch == \A i \in Ids : calls[i].st = "done" => calls[i].exec = sel
NoResume == phase # "resume"
=============================================================================

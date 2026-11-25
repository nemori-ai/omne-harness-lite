--------------------------- MODULE WorkingDirectory ---------------------------
(* The working directory of a session, and how far its file requests reach, across
   switches, setting changes, step boundaries, tool-call acceptance and restarts.

   A value is a pair: the directory and the reach. The reach follows from the tenant's
   setting for files outside the workspace; the step action reads the setting and
   commits both halves together.

   Durable facts: the session's selection (session log), the tenant's setting (the
   tenant's settings), the block value committed at the last step boundary (a step
   commit in the session log), the last value written to the model in a reminder
   (session log), and each accepted call's pinned value (the fixed tool request). Live
   state: what the holder has told the model; a restart loses it. The block is a state
   block: a restart installs its last committed value.

   Mode selects the design under test. "good" is the accepted design; every other
   value removes exactly one rule and must violate the property named in expect.txt. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Dirs, Reaches, MaxCalls, MaxSwitches, MaxSettings, MaxSteps, MaxCrashes, Mode

Modes == {"good", "live_read", "direct_publish", "recover_latest", "volatile_block",
          "exec_reread", "volatile_pin", "refresh_after_read", "accept_reads_setting",
          "stale_reach"}
ASSUME Mode \in Modes
ASSUME Cardinality(Dirs) >= 2
ASSUME Cardinality(Reaches) >= 1

\* Not a value: an empty sequence never equals a pair.
None == <<>>
InitialDir == CHOOSE d \in Dirs : TRUE
InitialReach == CHOOSE r \in Reaches : TRUE
Values == Dirs \X Reaches
Ids == 1..MaxCalls

VARIABLES
  sel,            \* durable: the session's current selection
  setting,        \* durable: the tenant's setting for files outside the workspace
  told,           \* durable: the value in the last reminder the model has
  block,          \* durable: the value committed at the last step boundary; None before the first
  holderTold,     \* live: what the holder knows it has told
  phase,          \* the step loop: idle, refreshed, ready, requested, resume
  atBoundary,     \* ghost: the selection and the setting when the current step began
  calls, nSwitch, nSetting, nStep, nCrash

vars == <<sel, setting, told, block, holderTold, phase, atBoundary, calls,
          nSwitch, nSetting, nStep, nCrash>>

Free == [st |-> "free", belief |-> None, pin |-> None, first |-> None, exec |-> None]

Current == <<sel, setting>>

Init ==
  /\ sel = InitialDir /\ setting = InitialReach
  /\ told = None /\ block = None /\ holderTold = None
  /\ phase = "idle" /\ atBoundary = <<InitialDir, InitialReach>>
  /\ calls = [i \in Ids |-> Free]
  /\ nSwitch = 0 /\ nSetting = 0 /\ nStep = 0 /\ nCrash = 0

Issued == {i \in Ids : calls[i].st = "issued"}

\* A person or the agent's own tool switches the session. The commit changes the log only.
Switch(d) ==
  /\ nSwitch < MaxSwitches /\ d # sel
  /\ sel' = d /\ nSwitch' = nSwitch + 1
  /\ block' = IF Mode = "direct_publish" THEN <<d, setting>> ELSE block
  /\ UNCHANGED <<setting, told, holderTold, phase, atBoundary, calls, nSetting, nStep, nCrash>>

\* The tenant changes the setting, at any time. Nothing in the session log changes.
SetReach(r) ==
  /\ nSetting < MaxSettings /\ r # setting
  /\ setting' = r /\ nSetting' = nSetting + 1
  /\ UNCHANGED <<sel, told, block, holderTold, phase, atBoundary, calls, nSwitch, nStep, nCrash>>

\* Before a step: commit the block from the selection and the setting, as a step commit.
Boundary ==
  /\ phase = "idle" /\ Issued = {} /\ nStep < MaxSteps
  /\ phase' = "refreshed" /\ atBoundary' = Current /\ nStep' = nStep + 1
  /\ block' = CASE Mode = "refresh_after_read" -> block
               [] Mode = "stale_reach" /\ block # None -> <<sel, block[2]>>
               [] OTHER -> Current
  /\ UNCHANGED <<sel, setting, told, holderTold, calls, nSwitch, nSetting, nCrash>>

\* Still before the step: read the block as the model-class reader and commit a reminder
\* when the value differs from what the holder has told.
ReminderCommit ==
  /\ phase = "refreshed"
  /\ LET v == IF block = None THEN Current ELSE block IN
       /\ told' = IF holderTold # v THEN v ELSE told
       /\ holderTold' = v
       /\ block' = IF Mode = "refresh_after_read" THEN Current ELSE v
  /\ phase' = "ready"
  /\ UNCHANGED <<sel, setting, atBoundary, calls, nSwitch, nSetting, nStep, nCrash>>

\* The reminder commit fails: the step does not run.
ReminderFail ==
  /\ phase = "refreshed" /\ phase' = "idle"
  /\ UNCHANGED <<sel, setting, told, block, holderTold, atBoundary, calls,
                 nSwitch, nSetting, nStep, nCrash>>

\* The model request of this step. The model reads the log, so it believes `told`.
ModelRequest ==
  /\ phase = "ready" /\ phase' = "requested"
  /\ \E S \in SUBSET {i \in Ids : calls[i].st = "free"} :
       calls' = [i \in Ids |-> IF i \in S THEN [Free EXCEPT !.st = "issued", !.belief = told]
                               ELSE calls[i]]
  /\ UNCHANGED <<sel, setting, told, block, holderTold, atBoundary,
                 nSwitch, nSetting, nStep, nCrash>>

\* The tool request source accepts a call: read the block, pin the value into the
\* durable fixed request. No value committed: the call is refused as unavailable.
Accept(i) ==
  /\ \/ calls[i].st = "issued" /\ phase \in {"requested", "resume"}
     \/ calls[i].st = "replan"
  /\ LET v == CASE Mode = "live_read" -> Current
                [] Mode = "accept_reads_setting" /\ block # None -> <<block[1], setting>>
                [] OTHER -> block IN
       calls' = IF v = None
                THEN [calls EXCEPT ![i].st = "refused"]
                ELSE [calls EXCEPT ![i].st = "prepared", ![i].pin = v,
                                   ![i].first = IF @ = None THEN v ELSE @]
  /\ UNCHANGED <<sel, setting, told, block, holderTold, phase, atBoundary,
                 nSwitch, nSetting, nStep, nCrash>>

\* The call runs to its end, at any later time, with its pinned value.
Finish(i) ==
  /\ calls[i].st = "prepared"
  /\ LET v == IF Mode = "exec_reread" /\ block # None THEN block ELSE calls[i].pin IN
       calls' = [calls EXCEPT ![i].st = "done", ![i].exec = v]
  /\ UNCHANGED <<sel, setting, told, block, holderTold, phase, atBoundary,
                 nSwitch, nSetting, nStep, nCrash>>

StepEnd ==
  /\ phase \in {"requested", "resume"} /\ Issued = {}
  /\ phase' = "idle"
  /\ UNCHANGED <<sel, setting, told, block, holderTold, atBoundary, calls,
                 nSwitch, nSetting, nStep, nCrash>>

\* A restart loses every live value. The block comes back as it was last committed, and
\* accepted calls keep their durable pin.
Crash ==
  /\ nCrash < MaxCrashes /\ nCrash' = nCrash + 1
  /\ block' = CASE Mode = "volatile_block" -> None
               [] Mode = "recover_latest" /\ block # None -> Current
               [] OTHER -> block
  /\ holderTold' = None
  /\ phase' = IF Issued # {} THEN "resume" ELSE "idle"
  /\ calls' = IF Mode = "volatile_pin"
              THEN [i \in Ids |-> IF calls[i].st = "prepared"
                                  THEN [calls[i] EXCEPT !.st = "replan", !.pin = None]
                                  ELSE calls[i]]
              ELSE calls
  /\ UNCHANGED <<sel, setting, told, atBoundary, nSwitch, nSetting, nStep>>

Next ==
  \/ \E d \in Dirs : Switch(d)
  \/ \E r \in Reaches : SetReach(r)
  \/ Boundary \/ ReminderCommit \/ ReminderFail \/ ModelRequest \/ StepEnd \/ Crash
  \/ \E i \in Ids : Accept(i) \/ Finish(i)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ sel \in Dirs /\ setting \in Reaches
  /\ told \in Values \cup {None} /\ block \in Values \cup {None}
  /\ holderTold \in Values \cup {None}
  /\ phase \in {"idle", "refreshed", "ready", "requested", "resume"}
  /\ \A i \in Ids : calls[i].st \in {"free", "issued", "prepared", "replan", "refused", "done"}

\* N-8: a call runs with the value pinned when it was first accepted.
PinnedDirectory == \A i \in Ids : calls[i].st = "done" => calls[i].exec = calls[i].first

\* N-9: the pinned value, directory and reach, is the one the model was told when it
\* issued the call.
ToldDirectory ==
  \A i \in Ids : calls[i].st \in {"prepared", "replan", "done"} => calls[i].first = calls[i].belief

\* N-10: a step that reaches its model request has told the model the selection and the
\* setting that held when the step began.
ToldAtBoundary == phase \in {"ready", "requested"} => told = atBoundary

\* R-13: no call is refused for want of a directory, across restarts too.
NoRefusal == \A i \in Ids : calls[i].st # "refused"

\* Vacuity controls: each must be violated in the good design.
NoCallAfterSwitch == \A i \in Ids : calls[i].st = "done" => calls[i].exec[1] = InitialDir
NoCallAfterSetting == \A i \in Ids : calls[i].st = "done" => calls[i].exec[2] = InitialReach
NoCallOutlivesSwitch == \A i \in Ids : calls[i].st = "done" => calls[i].exec[1] = sel
NoCallOutlivesSetting == \A i \in Ids : calls[i].st = "done" => calls[i].exec[2] = setting
NoResume == phase # "resume"
=============================================================================

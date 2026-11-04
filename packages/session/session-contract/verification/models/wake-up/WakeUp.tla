---- MODULE WakeUp ----
(***************************************************************************)
(* Who wakes the interpreter of a Session (SPEC PA-06, PM-14; session SPEC  *)
(* S1, S3, C2), and whether a failure of the drive is ever silent           *)
(* (PA-07; session SPEC C2 "stop and record a diagnostic").                 *)
(*                                                                          *)
(* One session. `pending` counts the inputs with pending eligibility. S1 is *)
(* the interpreter: one judgment at a time, with an `again` bit for a      *)
(* trigger that arrives while it runs. A trigger comes from a commit notice *)
(* (which may be lost) or from the periodic scan (S3), which finds sessions *)
(* by their pending inputs. startRun grants the Run (`granted`); C2 hands it *)
(* to the Agent (`invoked`), retrying while the Agent is down and giving up *)
(* after MaxTries. A crash loses everything in memory.                      *)
(*                                                                          *)
(* PA-06 item 2: a granted Run whose invoke was not accepted is invoked    *)
(* again under the same identity. Since R2-D327 the implementation is     *)
(* Bug "none": S1 hands a granted Run to C2 again, and C2 names every       *)
(* give-up. "scan-start-only" (S1 answers run-active and returns) and       *)
(* "swallow" (a silent give-up) are the implementation before R2-D327,      *)
(* kept as negative controls.                                               *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
  MaxInputs,    \* pending inputs at most
  MaxLost,      \* commit notices that may be lost
  MaxCrashes,
  MaxDowns,     \* times the Agent may go down
  MaxTries,     \* C2 attempts before it gives up (advance.retryDelaysMs)
  ScanEnabled,  \* the periodic scan runs
  Bug           \* "none" | "no-again" | "scan-start-only" | "swallow"

ASSUME Bug \in {"none", "no-again", "scan-start-only", "swallow"}

VARIABLES
  pending,     \* inputs with pending eligibility
  run,         \* "none" | "granted" | "invoked"
  s1,          \* "idle" | "reading" | "judging"
  seen,        \* what S1 read: [pending, run]
  again,       \* a trigger arrived while S1 was busy
  notice,      \* a commit notice on its way
  c2,          \* "idle" | "trying"
  tries,       \* C2 attempts of the current hand-over
  agent,       \* "up" | "down"
  silent,      \* C2 gave up once without a named diagnostic
  lost, crashes, downs

vars == <<pending, run, s1, seen, again, notice, c2, tries, agent, silent,
          lost, crashes, downs>>

Init ==
  /\ pending = 0 /\ run = "none" /\ s1 = "idle" /\ again = FALSE /\ notice = FALSE
  /\ seen = [pending |-> 0, run |-> "none"]
  /\ c2 = "idle" /\ tries = 0 /\ agent = "up" /\ silent = FALSE
  /\ lost = 0 /\ crashes = 0 /\ downs = 0

(* accept: one more pending input; its commit notice may be lost. *)
Accept ==
  /\ pending < MaxInputs
  /\ pending' = pending + 1
  /\ \/ notice' = TRUE /\ UNCHANGED lost
     \/ lost < MaxLost /\ lost' = lost + 1 /\ UNCHANGED notice
  /\ UNCHANGED <<run, s1, seen, again, c2, tries, agent, silent, crashes, downs>>

(* A trigger reaches S1: it starts, or marks `again` while busy. The bug drops it. *)
Trigger ==
  IF s1 = "idle" THEN s1' = "reading" /\ UNCHANGED again
  ELSE /\ again' = (again \/ Bug /= "no-again") /\ UNCHANGED s1

Notify ==
  /\ notice
  /\ notice' = FALSE
  /\ Trigger
  /\ UNCHANGED <<pending, run, seen, c2, tries, agent, silent, lost, crashes, downs>>

(* S3: the scan finds a session by its pending inputs (startRun does not consume them). *)
Scan ==
  /\ ScanEnabled /\ pending > 0 /\ s1 = "idle"
  /\ s1' = "reading"
  /\ UNCHANGED <<pending, run, seen, again, notice, c2, tries, agent, silent,
                 lost, crashes, downs>>

(* S1 reads the snapshot, then judges what it read. startRun is a conditional commit: it holds only
   if no Run was granted in between. A granted Run is handed to C2 again (PA-06 item 2). *)
Read ==
  /\ s1 = "reading"
  /\ s1' = "judging"
  /\ seen' = [pending |-> pending, run |-> run]
  /\ UNCHANGED <<pending, run, again, notice, c2, tries, agent, silent,
                 lost, crashes, downs>>

Judge ==
  /\ s1 = "judging"
  /\ IF seen.run = "none" /\ seen.pending > 0 /\ run = "none"
       THEN run' = "granted" /\ c2' = "trying" /\ tries' = 0
     ELSE IF seen.run = "granted" /\ run = "granted" /\ c2 = "idle" /\ Bug /= "scan-start-only"
       THEN c2' = "trying" /\ tries' = 0 /\ UNCHANGED run
     ELSE UNCHANGED <<run, c2, tries>>
  /\ s1' = IF again THEN "reading" ELSE "idle"
  /\ again' = FALSE
  /\ UNCHANGED <<pending, seen, notice, agent, silent, lost, crashes, downs>>

(* C2 invokes. Accepted: the Agent takes the inputs. Refused while down: retry, and give up after
   MaxTries with a named diagnostic; the bug gives up silently. *)
Invoke ==
  /\ c2 = "trying" /\ run = "granted"
  /\ IF agent = "up"
       THEN /\ run' = "invoked" /\ c2' = "idle" /\ pending' = 0
            /\ UNCHANGED <<tries, silent>>
     ELSE IF tries + 1 < MaxTries
       THEN /\ tries' = tries + 1 /\ UNCHANGED <<run, c2, pending, silent>>
     ELSE /\ c2' = "idle" /\ tries' = 0
          /\ silent' = (silent \/ Bug = "swallow")
          /\ UNCHANGED <<run, pending>>
  /\ UNCHANGED <<s1, seen, again, notice, agent, lost, crashes, downs>>

(* The Run ends by the Agent's end fact, a commit with its notice; later inputs need a new Run. *)
RunEnd ==
  /\ run = "invoked"
  /\ run' = "none" /\ notice' = TRUE
  /\ UNCHANGED <<pending, s1, seen, again, c2, tries, agent, silent,
                 lost, crashes, downs>>

AgentDown ==
  /\ agent = "up" /\ downs < MaxDowns
  /\ agent' = "down" /\ downs' = downs + 1
  /\ UNCHANGED <<pending, run, s1, seen, again, notice, c2, tries, silent, lost, crashes>>

AgentUp ==
  /\ agent = "down"
  /\ agent' = "up"
  /\ UNCHANGED <<pending, run, s1, seen, again, notice, c2, tries, silent, lost,
                 crashes, downs>>

(* A crash loses S1, C2 and the notice in flight; the committed facts stay. *)
Crash ==
  /\ crashes < MaxCrashes
  /\ crashes' = crashes + 1
  /\ s1' = "idle" /\ again' = FALSE /\ notice' = FALSE /\ c2' = "idle" /\ tries' = 0
  /\ UNCHANGED <<pending, run, seen, agent, silent, lost, downs>>

Next == Accept \/ Notify \/ Scan \/ Read \/ Judge \/ Invoke \/ RunEnd \/ AgentDown \/ AgentUp \/ Crash

Spec == Init /\ [][Next]_vars
Live == Spec /\ WF_vars(Notify) /\ WF_vars(Scan) /\ WF_vars(Read) /\ WF_vars(Judge) /\ WF_vars(Invoke)
             /\ WF_vars(RunEnd) /\ WF_vars(AgentUp)

-----------------------------------------------------------------------------
TypeOK ==
  /\ pending \in 0..MaxInputs
  /\ run \in {"none", "granted", "invoked"}
  /\ s1 \in {"idle", "reading", "judging"} /\ c2 \in {"idle", "trying"}
  /\ agent \in {"up", "down"}

(* S6: every give-up of the drive leaves a named diagnostic. *)
NoSilentGiveUp == ~silent

(* S5: a pending input eventually reaches an invoked Run. *)
InputsServed == (pending > 0) ~> (run = "invoked")

(* S5: a granted Run is eventually invoked (PA-06 item 2). *)
GrantedInvoked == (run = "granted") ~> (run = "invoked")

=============================================================================

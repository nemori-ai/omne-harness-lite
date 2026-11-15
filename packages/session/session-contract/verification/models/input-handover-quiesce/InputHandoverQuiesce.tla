--------------------------- MODULE InputHandoverQuiesce ---------------------------
(* Input handover across an orderly stop and a restart, for one execution.              *)
(*                                                                                       *)
(* The runtime holds one execution slot. Its drive keeps a boundary in memory: the      *)
(* inputs it read from the execution record the last time it read it. An orderly stop   *)
(* is a quiesce: the drive hands the execution over at a saved wait (`detach`), the     *)
(* slot is free, the quiesce answers drained, the process stops and starts again, and   *)
(* recovery resumes the execution (`attach`) into a new drive. Session keeps            *)
(* submitting inputs that arrived for the Run. The Agent contract says a submit needs  *)
(* no live runtime, slot, resume or attach; it does not resume the execution; the live  *)
(* drive only gets a wake hint, and without a live drive the next legal advance reads   *)
(* the same input boundary (agent-contract SPEC "输入内容与水位线").                       *)
(*                                                                                       *)
(* `Bug` drops one design rule; "none" is the design.                                   *)
(*   "hint-only": a drive learns of new inputs only from the hint; a resumed drive      *)
(*                starts from the boundary it knew, not from the record.                *)
(*   "submit-reserves": a submit that meets no live drive reserves the slot, as invoke  *)
(*                does, and nothing frees it.                                           *)
EXTENDS FiniteSets, Naturals

CONSTANTS Inputs, Bug, MaxStops

ASSUME Bug \in {"none", "hint-only", "submit-reserves"}

VARIABLES
  phase,     \* "up", "draining", "drained", "down": the process and its quiesce
  attached,  \* the execution has a live attachment
  drive,     \* a live drive works on the execution
  slot,      \* "free" or "busy"
  known,     \* the input boundary the drive holds in memory
  hint,      \* a wake hint is waiting for the drive
  arrived,   \* inputs Session accepted for the Run
  journal,   \* inputs the execution record accepted (the durable boundary)
  taken,     \* inputs the Agent took at a step boundary
  ended,     \* the execution ended
  stops      \* how many times the process stopped

vars == <<phase, attached, drive, slot, known, hint, arrived, journal, taken, ended, stops>>

TypeOK ==
  /\ phase \in {"up", "draining", "drained", "down"}
  /\ attached \in BOOLEAN /\ drive \in BOOLEAN /\ hint \in BOOLEAN /\ ended \in BOOLEAN
  /\ slot \in {"free", "busy"}
  /\ known \subseteq Inputs /\ arrived \subseteq Inputs
  /\ journal \subseteq Inputs /\ taken \subseteq Inputs
  /\ stops \in 0..MaxStops

Init ==
  /\ phase = "up" /\ attached = TRUE /\ drive = TRUE /\ slot = "busy"
  /\ known = {} /\ hint = FALSE /\ arrived = {} /\ journal = {} /\ taken = {}
  /\ ended = FALSE /\ stops = 0

Accept(i) ==
  /\ ~ended /\ phase # "down" /\ i \notin arrived
  /\ arrived' = arrived \cup {i}
  /\ UNCHANGED <<phase, attached, drive, slot, known, hint, journal, taken, ended, stops>>

(* Session's continuation submits an arrived input; the record accepts it durably.     *)
Submit(i) ==
  /\ ~ended /\ phase # "down" /\ i \in arrived /\ i \notin journal
  /\ journal' = journal \cup {i}
  /\ hint' = (drive \/ hint)
  /\ slot' = IF Bug = "submit-reserves" /\ ~drive THEN "busy" ELSE slot
  /\ UNCHANGED <<phase, attached, drive, known, arrived, taken, ended, stops>>

(* The drive reads the record again: at a wait it starts from the record, and a hint   *)
(* wakes it. With "hint-only" it reads only when a hint came.                           *)
Read ==
  /\ drive /\ known # journal
  /\ Bug # "hint-only" \/ hint
  /\ known' = journal
  /\ hint' = FALSE
  /\ UNCHANGED <<phase, attached, drive, slot, arrived, journal, taken, ended, stops>>

(* I0 takes the inputs within the boundary the drive read.                             *)
Take ==
  /\ drive /\ ~ended /\ known \ taken # {}
  /\ taken' = taken \cup known
  /\ UNCHANGED <<phase, attached, drive, slot, known, hint, arrived, journal, ended, stops>>

(* tryFinish: the Agent's check and the participant's check in one commit; E9 frees.  *)
Finish ==
  /\ drive /\ ~ended /\ journal \subseteq taken /\ arrived \subseteq journal
  /\ ended' = TRUE /\ drive' = FALSE /\ attached' = FALSE /\ slot' = "free"
  /\ UNCHANGED <<phase, known, hint, arrived, journal, taken, stops>>

Quiesce ==
  /\ phase = "up" /\ stops < MaxStops
  /\ phase' = "draining"
  /\ UNCHANGED <<attached, drive, slot, known, hint, arrived, journal, taken, ended, stops>>

(* The drive hands the execution over at a saved wait; the slot is free.               *)
Detach ==
  /\ phase = "draining" /\ drive
  /\ drive' = FALSE /\ attached' = FALSE /\ slot' = "free" /\ hint' = FALSE
  /\ UNCHANGED <<phase, known, arrived, journal, taken, ended, stops>>

Drain ==
  /\ phase = "draining" /\ slot = "free"
  /\ phase' = "drained"
  /\ UNCHANGED <<attached, drive, slot, known, hint, arrived, journal, taken, ended, stops>>

(* The process stops: everything in memory is gone, the slot with it.                  *)
Stop ==
  /\ phase = "drained"
  /\ phase' = "down" /\ stops' = stops + 1
  /\ known' = {} /\ hint' = FALSE /\ slot' = "free"
  /\ UNCHANGED <<attached, drive, arrived, journal, taken, ended>>

Start ==
  /\ phase = "down"
  /\ phase' = "up"
  /\ UNCHANGED <<attached, drive, slot, known, hint, arrived, journal, taken, ended, stops>>

(* Recovery resumes a handed-over execution. The design reads the record: the new      *)
(* drive's boundary is the durable one. With "hint-only" it keeps what it took.         *)
Resume ==
  /\ phase = "up" /\ ~attached /\ ~ended /\ slot = "free"
  /\ attached' = TRUE /\ drive' = TRUE /\ slot' = "busy"
  /\ known' = IF Bug = "hint-only" THEN taken ELSE journal
  /\ hint' = FALSE
  /\ UNCHANGED <<phase, arrived, journal, taken, ended, stops>>

Next ==
  \/ \E i \in Inputs : Accept(i) \/ Submit(i)
  \/ Read \/ Take \/ Finish \/ Quiesce \/ Detach \/ Drain \/ Stop \/ Start \/ Resume

Fairness ==
  /\ \A i \in Inputs : WF_vars(Submit(i))
  /\ WF_vars(Read) /\ WF_vars(Take) /\ WF_vars(Finish)
  /\ WF_vars(Detach) /\ WF_vars(Drain) /\ WF_vars(Stop) /\ WF_vars(Start) /\ WF_vars(Resume)

Spec == Init /\ [][Next]_vars /\ Fairness

(* The drained answer is honest: no drive works and the slot is free.                  *)
DrainedHonest == phase \in {"drained", "down"} => ~drive /\ slot = "free"

(* Property 4 of #1197: every input that arrived is taken, across the stop.            *)
Delivered == \A i \in Inputs : (i \in arrived) ~> (i \in taken)

(* An orderly stop finishes: a quiesce that began answers drained.                     *)
Drains == (phase = "draining") ~> (phase = "drained")
=====================================================================================

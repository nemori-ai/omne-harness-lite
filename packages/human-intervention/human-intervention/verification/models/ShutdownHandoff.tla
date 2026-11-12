--------------------------- MODULE ShutdownHandoff ---------------------------
(* One Run whose execution waits on one Ask call, across ordered stops and starts of the service.

   A stop is not an interruption. The wait and the card stay. The runtime hands over the execution
   it drives, and a later process goes on with it.

   Owners and their ordering points:
     Session   the Run and its advance: the attempt that holds it. `claim` grants a new attempt.
     Journal   the execution record: its state and the one active attachment. `detach` and `attach`
               are conditional commits; `attach` checks with Session that its grant is the current
               attempt.
     Agent     the runtime of this process and its one execution slot. The drive of the execution
               is its only writer, so the drive makes the handover itself.
     Tool      the call. It is durable on its own, and its result reaches the Journal through the
               receiver of the Agent host, with or without a live execution.

   The process can also be lost (`Crash`), or stop while the drive runs a node (`Exit` with `busy`).
   Then the attachment stays active. Going on needs a takeover, which this release does not have:
   Session waits (PM-14). The model keeps these runs for the safety properties only.

   Each `Bad` variant is one way the handover breaks, as the implementation had it or might. *)
EXTENDS Naturals

CONSTANT Bad
MaxBoots == 3

VARIABLES
  up,          \* the service process runs
  stopping,    \* the runtime is draining: quiesce was accepted
  boots,       \* how many times the service started
  exit,        \* how the last process ended
  slot,        \* Agent: the attachment the runtime of this process drives, or 0
  attempt,     \* Session: the attempt that holds the advance
  claimed,     \* Session: a claim was committed for the handover that is not resumed yet
  attach,      \* Journal: the active attachment, or 0
  grants,      \* Journal: how many attachments were granted
  grantOf,     \* Journal: the Session attempt whose grant the last attachment carries
  exec,        \* Journal: the state of the execution
  answered,    \* a person answered the card
  call,        \* Tool: the call
  received,    \* Journal: the result of the call was received
  staleWrites  \* commits of a detached attachment that took effect

vars == <<up, stopping, boots, exit, slot, attempt, claimed, attach, grants, grantOf, exec,
          answered, call, received, staleWrites>>

TypeOK ==
  /\ up \in BOOLEAN /\ stopping \in BOOLEAN /\ boots \in 1..MaxBoots
  /\ exit \in {"none", "clean", "unresolved", "busy", "lost"}
  /\ slot \in 0..MaxBoots /\ attempt \in 1..MaxBoots /\ claimed \in BOOLEAN
  /\ attach \in 0..MaxBoots /\ grants \in 1..MaxBoots /\ grantOf \in 0..MaxBoots
  /\ exec \in {"waiting", "suspended", "reconciling", "ended"}
  /\ answered \in BOOLEAN
  /\ call \in {"suspended", "completed", "interrupted"}
  /\ received \in BOOLEAN /\ staleWrites \in 0..1

Init ==
  /\ up = TRUE /\ stopping = FALSE /\ boots = 1 /\ exit = "none"
  /\ slot = 1 /\ attempt = 1 /\ claimed = FALSE
  /\ attach = 1 /\ grants = 1 /\ grantOf = 1
  /\ exec = "waiting" /\ answered = FALSE /\ call = "suspended"
  /\ received = FALSE /\ staleWrites = 0

Driving == slot # 0 /\ attach = slot
Parked == Driving /\ exec = "waiting"

(* quiesce is accepted. The runtime takes no new invoke and no resume from here on. *)
BeginStop ==
  /\ up /\ ~stopping /\ stopping' = TRUE
  /\ UNCHANGED <<up, boots, exit, slot, attempt, claimed, attach, grants, grantOf, exec, answered,
                 call, received, staleWrites>>

(* The drive that sleeps on the saved wait hands the execution over: Journal.detach revokes its
   attachment and the execution is suspended. The position and the wait stay as saved. *)
Detach ==
  /\ up /\ stopping /\ Parked
  /\ Bad # "no-detach"
  /\ attach' = 0 /\ exec' = "suspended"
  /\ call' = IF Bad = "stop-cancels" /\ call = "suspended" THEN "interrupted" ELSE call
  /\ UNCHANGED <<up, stopping, boots, exit, slot, attempt, claimed, grants, grantOf, answered,
                 received, staleWrites>>

(* The process ends. quiesce answered `drained` when nothing attached is left in the slot. A drive
   that runs a node is not handed over (`busy`). A parked drive is handed over first. *)
Exit ==
  /\ up /\ stopping
  /\ ~Parked \/ Bad = "no-detach"
  /\ exit' = IF ~Driving THEN "clean" ELSE IF Parked THEN "unresolved" ELSE "busy"
  /\ up' = FALSE /\ stopping' = FALSE /\ slot' = 0
  /\ UNCHANGED <<boots, attempt, claimed, attach, grants, grantOf, exec, answered, call, received,
                 staleWrites>>

(* The process is lost: nothing is handed over. *)
Crash ==
  /\ up /\ up' = FALSE /\ stopping' = FALSE /\ slot' = 0 /\ exit' = "lost"
  /\ UNCHANGED <<boots, attempt, claimed, attach, grants, grantOf, exec, answered, call, received,
                 staleWrites>>

Boot ==
  /\ ~up /\ boots < MaxBoots
  /\ up' = TRUE /\ boots' = boots + 1
  /\ UNCHANGED <<stopping, exit, slot, attempt, claimed, attach, grants, grantOf, exec, answered,
                 call, received, staleWrites>>

(* Session recovery reads that the execution of the active Run was handed over, and claims: a new
   attempt holds the advance (PM-05). The claim of one handover is recognized, not repeated. *)
Claim ==
  /\ up /\ ~stopping /\ exec = "suspended" /\ ~claimed
  /\ Bad # "no-recovery"
  /\ attempt' = attempt + 1 /\ claimed' = TRUE
  /\ UNCHANGED <<up, stopping, boots, exit, slot, attach, grants, grantOf, exec, answered, call,
                 received, staleWrites>>

(* resume: the runtime of this process reserves its slot, and Journal.attach grants a new
   attachment under the grant of the new attempt. The execution is reconciling. *)
Attach ==
  /\ up /\ ~stopping /\ slot = 0 /\ exec = "suspended" /\ claimed
  /\ grants' = grants + 1 /\ attach' = grants + 1 /\ slot' = grants + 1
  /\ grantOf' = IF Bad = "stale-grant" THEN attempt - 1 ELSE attempt
  /\ exec' = "reconciling" /\ claimed' = FALSE
  /\ UNCHANGED <<up, stopping, boots, exit, attempt, answered, call, received, staleWrites>>

(* The new coordinator reads the saved position (E1, E2, E4), comes back to the node that waits
   for the call (T0) and saves the wait again. *)
Rewait ==
  /\ up /\ Driving /\ exec = "reconciling" /\ exec' = "waiting"
  /\ UNCHANGED <<up, stopping, boots, exit, slot, attempt, claimed, attach, grants, grantOf,
                 answered, call, received, staleWrites>>

Answer ==
  /\ ~answered /\ answered' = TRUE
  /\ UNCHANGED <<up, stopping, boots, exit, slot, attempt, claimed, attach, grants, grantOf, exec,
                 call, received, staleWrites>>

(* Tool resumes and completes the call on its own once the service runs. *)
Complete ==
  /\ up /\ answered /\ call = "suspended" /\ call' = "completed"
  /\ UNCHANGED <<up, stopping, boots, exit, slot, attempt, claimed, attach, grants, grantOf, exec,
                 answered, received, staleWrites>>

(* The receiver keeps the result in the Journal. It needs no attachment. *)
Receive ==
  /\ up /\ call # "suspended" /\ ~received /\ received' = TRUE
  /\ UNCHANGED <<up, stopping, boots, exit, slot, attempt, claimed, attach, grants, grantOf, exec,
                 answered, call, staleWrites>>

(* The drive takes the result and the Run goes to its end. The Journal accepts the commits of the
   active attachment only. *)
Take ==
  /\ up /\ Parked /\ received
  /\ exec' = "ended" /\ slot' = 0
  /\ UNCHANGED <<up, stopping, boots, exit, attempt, claimed, attach, grants, grantOf, answered,
                 call, received, staleWrites>>

(* The commit of a drive whose attachment was detached. *)
StaleWrite ==
  /\ Bad = "stale-write" /\ up /\ slot # 0 /\ attach # slot /\ staleWrites = 0
  /\ staleWrites' = 1
  /\ UNCHANGED <<up, stopping, boots, exit, slot, attempt, claimed, attach, grants, grantOf, exec,
                 answered, call, received>>

Next ==
  \/ BeginStop \/ Detach \/ Exit \/ Crash \/ Boot
  \/ Claim \/ Attach \/ Rewait
  \/ Answer \/ Complete \/ Receive \/ Take \/ StaleWrite
  \/ UNCHANGED vars

(* No fairness for the person, for the stop and for the loss of the process. *)
Fairness ==
  /\ WF_vars(Detach) /\ WF_vars(Exit) /\ WF_vars(Boot)
  /\ WF_vars(Claim) /\ WF_vars(Attach) /\ WF_vars(Rewait)
  /\ WF_vars(Complete) /\ WF_vars(Receive) /\ WF_vars(Take)

Spec == Init /\ [][Next]_vars /\ Fairness

(* An ordered stop leaves no execution that only waited and was not handed over. *)
CleanStop == exit # "unresolved"

(* A stop is not an interruption: the call that waits for the person is not interrupted. *)
WaitSurvives == call # "interrupted"

(* The attachment that advances carries the grant of the attempt that holds the advance. *)
AdvanceUnderAttempt == (Driving /\ exec # "ended") => grantOf = attempt

(* The commits of a detached attachment take no effect. *)
StaleWriterRejected == staleWrites = 0

(* The process ended while it held the attachment. Going on needs a takeover. *)
Orphaned == slot = 0 /\ attach # 0 /\ exec \in {"waiting", "reconciling"}

(* After ordered stops of a waiting execution, with the service up again and the answer of the
   person, the Run ends. *)
RunEnds == answered ~> (exec = "ended" \/ (~up /\ boots = MaxBoots) \/ Orphaned)
===============================================================================

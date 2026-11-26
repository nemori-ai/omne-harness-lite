---------------------------- MODULE AdvanceLiveness ----------------------------
(***************************************************************************)
(* Intake, hand-over and advance of one session: safety and liveness, with *)
(* the environment of the release assembly. The mapping to the code and    *)
(* the environment assumptions are in ../formal-mapping.md.                *)
(*                                                                         *)
(* Bugs opens one defect per configuration:                                *)
(*   "first-only"            a Run starts with the first pending input only *)
(*   "halt-pins-slot"        a driver that halts keeps the execution slot   *)
(*   "failed-finish-blocked" a failed finish is turned back by pending input*)
(*   "no-scan"               no periodic scan                               *)
(*   "void-answered"         a cancel returns answered inputs to pending    *)
(*   "reject-drops-batch"    a rejected invoke drops the whole batch        *)
(* Bugs = {} with Deterministic = FALSE is the design.                     *)
(* Deterministic = TRUE opens a gap that is not closed yet: when the       *)
(* finishing commit of a Run fails for a reason that does not pass, each   *)
(* take-over halts again and the Run never settles.                        *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Inputs,        \* the inputs a person sends
          Bad,           \* the inputs message admission rejects
          MaxSteps,      \* the step limit of a Run
          MaxCancels,    \* a person's actions are not fair; their number is bounded
          MaxRestarts,
          MaxOutages,    \* after the last outage the dependencies stay up
          MaxHalts,      \* halts for a reason that passes
          Deterministic, \* the environment may make a finishing commit fail for good
          Bugs

ASSUME Bad \subseteq Inputs
ASSUME Deterministic \in BOOLEAN
ASSUME Bugs \subseteq {"first-only", "halt-pins-slot", "failed-finish-blocked",
                       "no-scan", "void-answered", "reject-drops-batch"}

VARIABLES
  sent,      \* the inputs sent so far
  pending,   \* log: accepted, not yet taken
  answered,  \* log: taken by a step and answered
  rejected,  \* log: lost the pending standing because admission rejected it
  run,       \* log: the current Run, "none" | "open" | "terminal"
  awaiting,  \* log: the last Run failed, the session waits for the person
  batch,     \* log: the inputs the start of the current Run recorded
  waiting0,  \* observer: everything pending when the current Run started
  runAns,    \* log: the inputs the current Run answered
  stepped,   \* log: the current Run took its first step
  steps,     \* log: the steps of the current Run
  execOpen,  \* Agent record: the execution of the current Run exists and is open
  agentAcc,  \* Agent record: the inputs the execution accepted
  known,     \* Session process: the inputs handed to the Agent; lost on restart
  drive,     \* Agent process: a driver advances the execution, "none" | "live"
  slot,      \* Agent process: the execution slot of the instance, "free" | "held"
  poison,    \* environment: the finishing commit of the current Run fails for good
  wake,      \* a wake-up waits for the advance coordinator
  depUp,     \* storage and the Agent drive port are available
  cancels, restarts, outages, halts,
  split      \* sentinel: a first step left behind an input that waited at the start

vars == <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns, stepped,
          steps, execOpen, agentAcc, known, drive, slot, poison, wake, depUp,
          cancels, restarts, outages, halts, split>>

Active == run = "open"

\* The batch is noted as handed over, or was taken: only then is the attachment asked.
Checked == Active /\ execOpen /\ (batch \subseteq known \/ batch \cap pending = {})

\* What the hand-in owes: pending inputs outside the batch, not yet handed over.
Due == pending \ (known \cup batch)

CanOpen    == ~Active /\ ~awaiting /\ pending # {} /\ depUp
CanInvoke  == Active /\ ~execOpen /\ slot = "free" /\ depUp
CanReplay  == Active /\ execOpen /\ ~Checked /\ depUp
CanSubmit  == Active /\ execOpen /\ Due # {} /\ depUp
CanResume  == Checked /\ drive = "none" /\ slot = "free" /\ depUp

Init ==
  /\ sent = {} /\ pending = {} /\ answered = {} /\ rejected = {}
  /\ run = "none" /\ awaiting = FALSE
  /\ batch = {} /\ waiting0 = {} /\ runAns = {} /\ stepped = FALSE /\ steps = 0
  /\ execOpen = FALSE /\ agentAcc = {} /\ known = {} /\ drive = "none" /\ slot = "free"
  /\ poison = FALSE /\ wake = FALSE /\ depUp = TRUE
  /\ cancels = 0 /\ restarts = 0 /\ outages = 0 /\ halts = 0 /\ split = FALSE

---------------------------------------------------------------------------
\* The person and the environment

Send(i) ==
  /\ i \notin sent
  /\ sent' = sent \cup {i} /\ pending' = pending \cup {i} /\ wake' = TRUE /\ awaiting' = FALSE
  /\ UNCHANGED <<answered, rejected, run, batch, waiting0, runAns, stepped, steps, execOpen,
                 agentAcc, known, drive, slot, poison, depUp, cancels, restarts, outages,
                 halts, split>>

DepDown ==
  /\ depUp /\ outages < MaxOutages
  /\ depUp' = FALSE /\ outages' = outages + 1
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, known, drive, slot, poison, wake,
                 cancels, restarts, halts, split>>

DepRecover ==
  /\ ~depUp /\ depUp' = TRUE
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, known, drive, slot, poison, wake,
                 cancels, restarts, outages, halts, split>>

\* The bounded retries run out while a dependency is down: the wake-up is spent.
WakeLost ==
  /\ wake /\ ~depUp /\ wake' = FALSE
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, known, drive, slot, poison, depUp,
                 cancels, restarts, outages, halts, split>>

WakeDone ==
  /\ wake /\ depUp /\ ~CanOpen /\ ~CanInvoke /\ ~CanReplay /\ ~CanSubmit /\ ~CanResume
  /\ wake' = FALSE
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, known, drive, slot, poison, depUp,
                 cancels, restarts, outages, halts, split>>

Scan ==
  /\ "no-scan" \notin Bugs
  /\ ~wake /\ (pending # {} \/ Active)
  /\ wake' = TRUE
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, known, drive, slot, poison, depUp,
                 cancels, restarts, outages, halts, split>>

\* The person cancels the Run: the Session writes the terminal, the driver stops.
Cancel ==
  /\ Active /\ cancels < MaxCancels
  /\ run' = "terminal" /\ cancels' = cancels + 1
  /\ pending' = IF "void-answered" \in Bugs THEN pending \cup runAns ELSE pending
  /\ batch' = {} /\ runAns' = {} /\ agentAcc' = {} /\ known' = {} /\ execOpen' = FALSE
  /\ drive' = "none" /\ poison' = FALSE
  /\ slot' \in IF "halt-pins-slot" \in Bugs /\ drive = "live" THEN {"free", "held"}
               ELSE {"free"}
  /\ wake' = TRUE
  /\ UNCHANGED <<sent, answered, rejected, awaiting, waiting0, stepped, steps, depUp,
                 restarts, outages, halts, split>>

\* The process restarts: what it held in memory is gone, the log and the record stay.
Restart ==
  /\ restarts < MaxRestarts /\ restarts' = restarts + 1
  /\ known' = {} /\ drive' = "none" /\ slot' = "free" /\ wake' = TRUE
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, poison, depUp, cancels, outages, halts,
                 split>>

Poison ==
  /\ Deterministic /\ Active /\ ~poison /\ poison' = TRUE
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, known, drive, slot, wake, depUp,
                 cancels, restarts, outages, halts, split>>

\* The driver cannot go on at a node and halts: it reports once and gives the slot back;
\* the execution stays open in the record. No commit, so no wake-up.
Halt ==
  /\ Active /\ drive = "live"
  /\ poison \/ halts < MaxHalts
  /\ halts' = IF poison THEN halts ELSE halts + 1
  /\ drive' = "none"
  /\ slot' = IF "halt-pins-slot" \in Bugs THEN "held" ELSE "free"
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, known, poison, wake, depUp, cancels,
                 restarts, outages, split>>

---------------------------------------------------------------------------
\* The advance coordinator of the Session: one wake-up, one step computed from the log.

\* The commit that starts a Run records its batch: everything pending at that moment.
OpenRun ==
  /\ wake /\ CanOpen
  /\ batch' \in IF "first-only" \in Bugs THEN {{i} : i \in pending} ELSE {pending}
  /\ waiting0' = pending
  /\ run' = "open" /\ runAns' = {} /\ stepped' = FALSE /\ steps' = 0
  /\ execOpen' = FALSE /\ agentAcc' = {} /\ known' = {} /\ poison' = FALSE
  /\ UNCHANGED <<sent, pending, answered, rejected, awaiting, drive, slot, wake, depUp,
                 cancels, restarts, outages, halts, split>>

\* The Agent admits every input of the batch, creates the execution and accepts them all.
InvokeOk ==
  /\ wake /\ CanInvoke /\ batch \cap Bad = {}
  /\ execOpen' = TRUE /\ agentAcc' = batch /\ known' = known \cup batch
  /\ drive' = "live" /\ slot' = "held"
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, poison, wake, depUp, cancels, restarts, outages, halts,
                 split>>

\* Admission rejects one input of the batch: no execution is created, the Run closes as
\* failed, that input loses its pending standing, the others keep theirs.
InvokeRejected ==
  /\ wake /\ CanInvoke
  /\ \E r \in batch \cap Bad :
       /\ pending' = IF "reject-drops-batch" \in Bugs THEN pending \ batch ELSE pending \ {r}
       /\ rejected' = rejected \cup {r}
  /\ run' = "terminal" /\ awaiting' = TRUE
  /\ batch' = {} /\ runAns' = {} /\ agentAcc' = {} /\ known' = {} /\ wake' = TRUE
  /\ UNCHANGED <<sent, answered, waiting0, stepped, steps, execOpen, drive, slot, poison,
                 depUp, cancels, restarts, outages, halts, split>>

\* After a restart the batch is not noted and not taken: the invoke is replayed under its
\* original identity, the Agent answers with the original acceptance.
ReplayOk ==
  /\ wake /\ CanReplay
  /\ known' = known \cup batch
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, drive, slot, poison, wake, depUp,
                 cancels, restarts, outages, halts, split>>

\* An input that arrived after the start is handed in.
SubmitOk ==
  /\ wake /\ CanSubmit
  /\ \E i \in Due \ Bad : agentAcc' = agentAcc \cup {i} /\ known' = known \cup {i}
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, drive, slot, poison, wake, depUp, cancels,
                 restarts, outages, halts, split>>

\* Admission rejects a handed-in input: it loses its pending standing, the Run goes on.
SubmitRejected ==
  /\ wake /\ CanSubmit
  /\ \E i \in Due \cap Bad : pending' = pending \ {i} /\ rejected' = rejected \cup {i}
  /\ UNCHANGED <<sent, answered, run, awaiting, batch, waiting0, runAns, stepped, steps,
                 execOpen, agentAcc, known, drive, slot, poison, wake, depUp, cancels,
                 restarts, outages, halts, split>>

\* Recovery asks the attachment, the host answers lost, a new driver takes over.
RecoverResume ==
  /\ wake /\ CanResume
  /\ drive' = "live" /\ slot' = "held"
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, steps, execOpen, agentAcc, known, poison, wake, depUp, cancels,
                 restarts, outages, halts, split>>

---------------------------------------------------------------------------
\* The Agent. The commit of each step and of the finish wakes the Session.

\* A step takes every accepted input that is still pending and answers it.
AgentStep ==
  /\ Active /\ drive = "live" /\ depUp /\ steps < MaxSteps
  /\ LET S == agentAcc \cap pending IN
       /\ S # {}
       /\ split' = (split \/ (~stepped /\ ~((waiting0 \cap pending) \subseteq S)))
       /\ answered' = answered \cup S /\ pending' = pending \ S /\ runAns' = runAns \cup S
  /\ stepped' = TRUE /\ steps' = steps + 1 /\ wake' = TRUE
  /\ UNCHANGED <<sent, rejected, run, awaiting, batch, waiting0, execOpen, agentAcc, known,
                 drive, slot, poison, depUp, cancels, restarts, outages, halts>>

\* The model asks for one more tool: a step that takes no input. Not fair.
ToolStep ==
  /\ Active /\ drive = "live" /\ depUp /\ steps < MaxSteps /\ stepped
  /\ steps' = steps + 1 /\ wake' = TRUE
  /\ UNCHANGED <<sent, pending, answered, rejected, run, awaiting, batch, waiting0, runAns,
                 stepped, execOpen, agentAcc, known, drive, slot, poison, depUp, cancels,
                 restarts, outages, halts, split>>

Close(failed) ==
  /\ run' = "terminal" /\ awaiting' = failed
  /\ batch' = {} /\ runAns' = {} /\ agentAcc' = {} /\ known' = {}
  /\ execOpen' = FALSE /\ drive' = "none" /\ slot' = "free" /\ wake' = TRUE
  /\ UNCHANGED <<sent, pending, answered, rejected, waiting0, stepped, steps, poison, depUp,
                 cancels, restarts, outages, halts, split>>

\* A finish that concludes complete is turned back while an input is pending.
FinishComplete ==
  /\ Active /\ drive = "live" /\ depUp /\ ~poison /\ stepped
  /\ pending = {}
  /\ Close(FALSE)

\* At the step limit the Run finishes as failed; pending inputs do not turn it back.
FinishFailedAtLimit ==
  /\ Active /\ drive = "live" /\ depUp /\ ~poison /\ steps = MaxSteps
  /\ "failed-finish-blocked" \in Bugs => pending = {}
  /\ Close(TRUE)

---------------------------------------------------------------------------

Session == OpenRun \/ InvokeOk \/ InvokeRejected \/ ReplayOk \/ SubmitOk \/ SubmitRejected
           \/ RecoverResume \/ WakeLost \/ WakeDone
Agent   == AgentStep \/ ToolStep \/ FinishComplete \/ FinishFailedAtLimit
Env     == (\E i \in Inputs : Send(i)) \/ DepDown \/ DepRecover \/ Scan \/ Cancel \/ Restart
           \/ Poison \/ Halt

Next == Session \/ Agent \/ Env

\* An outage passes; a system action that stays possible is taken; the scan comes.
\* The person's actions, restarts, halts and one more tool call are not fair.
Fairness ==
  /\ WF_vars(DepRecover) /\ WF_vars(Scan)
  /\ SF_vars(OpenRun) /\ SF_vars(InvokeOk) /\ SF_vars(InvokeRejected) /\ SF_vars(ReplayOk)
  /\ SF_vars(SubmitOk) /\ SF_vars(SubmitRejected) /\ SF_vars(RecoverResume)
  /\ SF_vars(AgentStep) /\ SF_vars(FinishComplete) /\ SF_vars(FinishFailedAtLimit)
  /\ WF_vars(Halt /\ poison)

Spec == Init /\ [][Next]_vars /\ Fairness

---------------------------------------------------------------------------
TypeOK ==
  /\ sent \subseteq Inputs /\ pending \subseteq Inputs /\ answered \subseteq Inputs
  /\ rejected \subseteq Inputs
  /\ run \in {"none", "open", "terminal"} /\ awaiting \in BOOLEAN
  /\ batch \subseteq Inputs /\ waiting0 \subseteq Inputs /\ runAns \subseteq Inputs
  /\ stepped \in BOOLEAN /\ steps \in 0..MaxSteps
  /\ execOpen \in BOOLEAN /\ agentAcc \subseteq Inputs /\ known \subseteq Inputs
  /\ drive \in {"none", "live"} /\ slot \in {"free", "held"} /\ poison \in BOOLEAN
  /\ wake \in BOOLEAN /\ depUp \in BOOLEAN
  /\ cancels \in 0..MaxCancels /\ restarts \in 0..MaxRestarts
  /\ outages \in 0..MaxOutages /\ halts \in 0..MaxHalts /\ split \in BOOLEAN

\* An input is answered at most once: answered, it is pending no more.
AnsweredNotPending == answered \cap pending = {}

\* The first step of a Run takes everything that waited at its start and still waits.
BatchNotSplit == ~split

\* Every input sent is pending, answered or rejected: none is lost without a record.
NoSilentLoss == sent = pending \cup answered \cup rejected

\* Only what admission rejects loses its standing, and it is never answered.
RejectedAreBad == rejected \subseteq Bad /\ answered \cap Bad = {}

DriveHoldsSlot == drive = "live" => slot = "held"

\* An open Run settles.
ActiveRunSettles == Active ~> (run = "terminal")

\* Every pending input is answered or rejected, or the session stops and waits.
EveryInputSettles ==
  \A i \in Inputs : (i \in pending) ~> (i \in answered \/ i \in rejected \/ awaiting)
==============================================================================

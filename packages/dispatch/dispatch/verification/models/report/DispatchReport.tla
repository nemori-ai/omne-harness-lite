---------------------------- MODULE DispatchReport ----------------------------
(* One dispatch (spawn or delegate) of one dispatching call. Each action is one
   commit of its owner: the dispatch registry, the Tool ledger of the dispatching
   call, or the log of the dispatching session. The model checks that a report is
   made at most once, is handed over at exactly one place, and that the
   dispatching call always gets an outcome. *)
EXTENDS Naturals, FiniteSets

CONSTANTS MaxTries

VARIABLES
  state,        \* the dispatch: started, reported, failed, withdrawn
  reports,      \* how many reports were made
  withdrawn,    \* a withdrawal was ever made
  run,          \* the run the assignment started: running, ok, bad
  wait,         \* the wait of the dispatching call: open, answered, closed
  answer,       \* what the wait was answered with
  delivery,     \* where the report went: none, pending, result, input, undeliverable
  log,          \* report inputs in the log of the dispatching session, by submission id
  tries,        \* how many times the input was sent
  archived      \* the dispatching session is archived

vars == <<state, reports, withdrawn, run, wait, answer, delivery, log, tries, archived>>

CanReport == state = "started"
CanWithdraw == state = "started"
WaitGone == wait = "closed"
SubOf(n) == "rep"
CanSendInput == state = "reported" /\ delivery = "pending" /\ WaitGone /\ ~archived
Outcome ==
  CASE state = "reported" -> "report"
    [] state = "withdrawn" -> "withdrawn"
    [] state = "failed" -> "failed"
    [] OTHER -> "none"

Init ==
  /\ state = "started" /\ reports = 0 /\ withdrawn = FALSE /\ run = "running"
  /\ wait = "open" /\ answer = "none" /\ delivery = "none" /\ log = {} /\ tries = 0
  /\ archived = FALSE

MakeReport ==
  /\ state' = "reported" /\ reports' = reports + 1 /\ delivery' = "pending"

\* The dispatched agent hands back its report.
Report ==
  /\ CanReport /\ MakeReport
  /\ UNCHANGED <<withdrawn, run, wait, answer, log, tries, archived>>

\* The run ends normally; without a report its final reply becomes the report.
RunEndsOk ==
  /\ run = "running" /\ run' = "ok"
  /\ IF CanReport THEN MakeReport ELSE UNCHANGED <<state, reports, delivery>>
  /\ UNCHANGED <<withdrawn, wait, answer, log, tries, archived>>

\* The run fails or is cancelled; without a report the dispatch fails.
RunEndsBad ==
  /\ run = "running" /\ run' = "bad"
  /\ state' = IF state = "started" THEN "failed" ELSE state
  /\ UNCHANGED <<reports, withdrawn, wait, answer, delivery, log, tries, archived>>

\* The dispatcher withdraws the work.
Withdraw ==
  /\ CanWithdraw /\ ~archived
  /\ state' = "withdrawn" /\ withdrawn' = TRUE
  /\ UNCHANGED <<reports, run, wait, answer, delivery, log, tries, archived>>

\* Tool closes the wait: the run was cancelled or interrupted, or the call ended unknown.
CloseWait ==
  /\ wait = "open" /\ wait' = "closed"
  /\ UNCHANGED <<state, reports, withdrawn, run, answer, delivery, log, tries, archived>>

\* The dispatching session is archived: its wait closes and running work is withdrawn.
Archive ==
  /\ ~archived /\ archived' = TRUE
  /\ wait' = IF wait = "open" THEN "closed" ELSE wait
  /\ state' = IF state = "started" THEN "withdrawn" ELSE state
  /\ withdrawn' = (withdrawn \/ state = "started")
  /\ UNCHANGED <<reports, run, answer, delivery, log, tries>>

\* The bridge hands the outcome to the wait. One Tool commit decides open against closed.
AnswerWait ==
  /\ wait = "open" /\ Outcome # "none"
  /\ wait' = "answered" /\ answer' = Outcome
  /\ UNCHANGED <<state, reports, withdrawn, run, delivery, log, tries, archived>>

\* The registry records that the report became the result of the call.
RecordResult ==
  /\ state = "reported" /\ delivery = "pending" /\ wait = "answered" /\ answer = "report"
  /\ delivery' = "result"
  /\ UNCHANGED <<state, reports, withdrawn, run, wait, answer, log, tries, archived>>

\* The wait is gone: the report is sent into the dispatching session. The outcome
\* of the send may stay unknown, so it can be sent again.
SendInput ==
  /\ CanSendInput /\ tries < MaxTries
  /\ log' = log \cup {SubOf(tries)} /\ tries' = tries + 1
  /\ UNCHANGED <<state, reports, withdrawn, run, wait, answer, delivery, archived>>

RecordInput ==
  /\ delivery = "pending" /\ log # {}
  /\ delivery' = "input"
  /\ UNCHANGED <<state, reports, withdrawn, run, wait, answer, log, tries, archived>>

RecordUndeliverable ==
  /\ state = "reported" /\ delivery = "pending" /\ archived /\ WaitGone /\ log = {}
  /\ delivery' = "undeliverable"
  /\ UNCHANGED <<state, reports, withdrawn, run, wait, answer, log, tries, archived>>

\* What the system does by itself, as opposed to what people and agents choose to do.
SysNext == AnswerWait \/ RecordResult \/ SendInput \/ RecordInput \/ RecordUndeliverable

Next == Report \/ RunEndsOk \/ RunEndsBad \/ Withdraw \/ CloseWait \/ Archive \/ SysNext

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ state \in {"started", "reported", "failed", "withdrawn"}
  /\ reports \in 0..2 /\ withdrawn \in BOOLEAN
  /\ run \in {"running", "ok", "bad"}
  /\ wait \in {"open", "answered", "closed"}
  /\ answer \in {"none", "report", "withdrawn", "failed"}
  /\ delivery \in {"none", "pending", "result", "input", "undeliverable"}
  /\ log \subseteq {"rep"} /\ tries \in 0..MaxTries /\ archived \in BOOLEAN

AtMostOneReport == reports <= 1

DeliveredOnce == Cardinality(log) <= 1 /\ ~(answer = "report" /\ log # {})

WithdrawExcludesReport == ~(withdrawn /\ reports > 0)

Settled == run # "running" /\ ~ENABLED SysNext

NoStrandedReport ==
  (Settled /\ state = "reported" /\ ~archived) => delivery \in {"result", "input"}

CallAlwaysSettles == Settled => wait # "open"
===============================================================================

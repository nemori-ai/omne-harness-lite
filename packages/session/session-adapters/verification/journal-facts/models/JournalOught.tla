---- MODULE JournalOught ----
(***************************************************************************)
(* Agent Journal as an append-only fact family of the session log.         *)
(*                                                                         *)
(* One execution. The Agent advances in producer rounds ("steps"). Each    *)
(* step commits three batches in order: intend (before the external        *)
(* effect), receive (the producer's result, custody blob outside the own   *)
(* part), judge (the admission that also writes the history message). A    *)
(* batch is one Journal command: one operation identity, one semantic      *)
(* digest, the facts this command adds and the cursor members it changes.  *)
(*                                                                         *)
(* The in-memory view is the fold of the log. Answers are never stored:    *)
(* a retry derives the original answer from the batch of its operation.    *)
(*                                                                         *)
(* The position of the next batch has one source: the publication count    *)
(* the view has folded (head). The core appends at head + 1. A material    *)
(* preserve is a batch with no fact and no cursor change.                  *)
(*                                                                         *)
(* Bytes are abstracted as weights: C0 per batch, WMember per changed      *)
(* cursor member, WFact per added fact. The session log's content bytes    *)
(* are abstracted as logContent, growing by LogMin or LogBig per step.     *)
(*                                                                         *)
(* The writer keeps reader records of its own (the in-process reader view).  *)
(* They are a projection of the fold: every fact the writer applies to its   *)
(* records is a fact of the batch it appends, and a successor rebuilds the    *)
(* records by projecting the fold (K-23 end state: nothing is stored beside  *)
(* the facts). The events the records number are the event facts, by the     *)
(* fold's rule.                                                               *)
(*                                                                         *)
(* Bug switches make one negative control each; all FALSE is the design.  *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS
  MaxSteps,          \* producer rounds explored
  Members,           \* the top-level members of the cursor (checkpoint)
  C0, WMember, WFact,\* weights: per batch, per changed member, per fact
  LogMin, LogBig,    \* content bytes one step adds to the session log
  MaxCrashes, MaxRejects, MaxRetries, MaxPreserves,
  WholeRewrite,      \* bug: a commit carries the whole cursor and all facts so far
  SecondPosition,    \* bug: the core keeps a position of its own; a preserve the provider
                     \*      publishes alone leaves it behind, and the next batch the core
                     \*      appends sits at a position the store has passed: the provider
                     \*      finds no batch after its head and stores the envelope alone
  CacheOnlyWrite,    \* bug: the provider folds a judge into the view without appending
  UpsertCursor,      \* bug: the cursor of the last batch is rewritten in place
  RetryReexecutes,   \* bug: a same-input retry appends a second batch
  DriverMarksFailed, \* FALSE: the driver leaves the slot running after a rejection
  EventWithoutFact   \* bug: the writer appends an event to its records for a command whose
                     \*      batch carries no event fact (a preserve); the fold projects none

ASSUME MaxSteps \in Nat /\ MaxSteps >= 1
ASSUME LogMin \in Nat /\ LogMin >= 1 /\ LogBig >= LogMin

VARIABLES
  log,               \* Seq of committed batches: the Agent fact family
  view,              \* the in-memory fold of log[1..head]
  head,              \* how many batches the view has folded
  step,              \* current producer round, 1-based
  phase,             \* "intend" | "receive" | "judge"
  slot,              \* "running" | "failed"
  lastCommit,        \* "none" | "ok" | "rejected" | "retry"
  answers,           \* op -> the answer returned when the op first succeeded
  logContent,        \* abstract content bytes of the session log
  crashed, crashes, rejects, retries,
  corePub,           \* the position the core gives its next batch
  preserves,         \* material preserves made
  writerGen,         \* authority generation of the live writer
  lastCommittedView, \* the view right after the last successful commit
  retryMismatch,     \* TRUE once a same-input retry derived a different answer
  records            \* the writer's reader records: the events it numbered and the facts it applied

vars == <<log, view, head, step, phase, slot, lastCommit, answers, logContent,
          crashed, crashes, rejects, retries, corePub, preserves, writerGen,
          lastCommittedView, retryMismatch, records>>

Phases == {"intend", "receive", "judge"}
Kinds  == {"intend", "receive", "judge", "attach", "recognize", "preserve"}
NoRevision == {"recognize", "preserve"}

EmptyFn == [x \in {} |-> 0]

EmptyView == [rev |-> 0, cursor |-> [m \in Members |-> 0], intents |-> {},
              results |-> {}, judged |-> {}, ops |-> EmptyFn, gen |-> 1, events |-> 0]

(* The events a batch projects when applied to v: one per new fact of the three event kinds
   (an intend is an input-taken event, a receive an entry, a judge a message). The rule of
   which facts are events lives here, in the fold, and nowhere else. *)
NewEvents(v, b) == Cardinality(b.intents \ v.intents) + Cardinality(b.results \ v.results)
                   + Cardinality(b.judged \ v.judged)

(* fold : (View, index, Batch) -> View. Pure, total, no clock, no I/O.  *)
Apply(v, i, b) ==
  [rev     |-> IF b.kind \in NoRevision THEN v.rev ELSE v.rev + 1,
   cursor  |-> [m \in Members |-> IF m \in b.changed THEN i ELSE v.cursor[m]],
   intents |-> v.intents \cup b.intents,
   results |-> v.results \cup b.results,
   judged  |-> v.judged \cup b.judged,
   ops     |-> IF b.op \in DOMAIN v.ops THEN v.ops ELSE v.ops @@ (b.op :> i),
   gen     |-> IF b.kind = "attach" THEN b.gen ELSE v.gen,
   events  |-> v.events + NewEvents(v, b)]

(* The reader records a view projects: what a successor rebuilds from the fold alone. *)
ProjectOf(v) == [events |-> v.events, intents |-> v.intents, results |-> v.results,
                 judged |-> v.judged]
EmptyRecords == [events |-> 0, intents |-> {}, results |-> {}, judged |-> {}]

RECURSIVE FoldN(_, _)
FoldN(s, n) == IF n = 0 THEN EmptyView ELSE Apply(FoldN(s, n - 1), n, s[n])
Fold(s) == FoldN(s, Len(s))

Weight(b) == C0 + Cardinality(b.changed) * WMember
             + (Cardinality(b.intents) + Cardinality(b.results)
                + Cardinality(b.judged)) * WFact

RECURSIVE SumW(_, _)
SumW(s, n) == IF n = 0 THEN 0 ELSE SumW(s, n - 1) + Weight(s[n])
OwnWeight == SumW(log, Len(log))

Facts(b) == ({"i"} \X b.intents) \cup ({"r"} \X b.results) \cup ({"j"} \X b.judged)
RECURSIVE FactsBefore(_, _)
FactsBefore(s, n) == IF n = 0 THEN {} ELSE FactsBefore(s, n - 1) \cup Facts(s[n])

(* The answer of the operation whose batch sits at index i: the receipt. The
   revision of a recognition is the revision of the recognized batch. *)
DeriveAt(s, i) ==
  LET b == s[i]
  IN [op |-> b.op,
      rev |-> IF b.kind = "recognize" THEN FoldN(s, b.target).rev ELSE FoldN(s, i).rev]

OpOf(k) == [step |-> step, kind |-> k]
DigestOf(op, variant) == [op |-> op, variant |-> variant]

NewBatch(kind, op, changed, intents, results, judged, target) ==
  [kind    |-> kind, op |-> op, digest |-> DigestOf(op, 0), gen |-> writerGen,
   target  |-> target,
   changed |-> IF WholeRewrite THEN Members ELSE changed,
   intents |-> IF WholeRewrite THEN view.intents \cup intents ELSE intents,
   results |-> IF WholeRewrite THEN view.results \cup results ELSE results,
   judged  |-> IF WholeRewrite THEN view.judged \cup judged ELSE judged]

(* What the storage receives of a batch the core appended at corePub: the batch, unless the
   store has passed that position (the second-position bug), when the provider finds no batch
   after its head and stores the envelope alone: the facts and the cursor move are lost. *)
Stored(b) ==
  IF SecondPosition /\ corePub <= head
    THEN [b EXCEPT !.changed = {}, !.intents = {}, !.results = {}, !.judged = {}]
    ELSE b

(* The storage accepted the batch: append, fold, answer from the fold. The core's next
   position follows the publication count. *)
Accept(b0) ==
  LET b == Stored(b0) IN
  /\ IF CacheOnlyWrite /\ b.kind = "judge"
       THEN /\ log' = log
            /\ view' = Apply(view, Len(log) + 1, b)
            /\ head' = head
     ELSE IF UpsertCursor /\ b.kind = "judge" /\ Len(log) > 0
       THEN /\ log' = [log EXCEPT ![Len(log)] =
                        [@ EXCEPT !.changed = @ \cup b.changed,
                                  !.judged = @ \cup b.judged]]
            /\ view' = Fold(log')
            /\ head' = Len(log')
     ELSE /\ log' = Append(log, b)
          /\ view' = Apply(view, Len(log) + 1, b)
          /\ head' = Len(log) + 1
  /\ corePub' = head' + 1
  /\ answers' = IF b.op \in DOMAIN answers THEN answers
                ELSE answers @@ (b.op :> [op |-> b.op, rev |-> view'.rev])
  /\ lastCommittedView' = view'
  /\ lastCommit' = "ok"
  (* The writer applies its own batch to its records: the facts it appended, the events the
     fold numbers for them. *)
  /\ records' = [events  |-> records.events + NewEvents(view, b0),
                 intents |-> records.intents \cup b0.intents,
                 results |-> records.results \cup b0.results,
                 judged  |-> records.judged \cup b0.judged]
  /\ UNCHANGED <<slot, rejects, retryMismatch, preserves>>

(* The storage refused the batch before accepting it (command_limit, ...).
   Nothing was written. The driver either retries or marks the slot failed.
   The bug leaves the slot running and nobody told. *)
Refuse ==
  /\ rejects < MaxRejects
  /\ rejects' = rejects + 1
  /\ UNCHANGED <<log, view, head, answers, lastCommittedView, retryMismatch, corePub,
                 preserves, records>>
  /\ IF DriverMarksFailed
       THEN \/ (lastCommit' = "retry" /\ slot' = slot)
            \/ (lastCommit' = "rejected" /\ slot' = "failed")
       ELSE lastCommit' = "rejected" /\ slot' = slot

Ready == ~crashed /\ slot = "running" /\ writerGen = view.gen /\ step <= MaxSteps

CommitIntend ==
  /\ Ready /\ phase = "intend"
  /\ LET b == NewBatch("intend", OpOf("intend"), {"step", "position"}, {step}, {}, {}, 0)
     IN \/ (Accept(b) /\ phase' = "receive")
        \/ (Refuse /\ phase' = phase)
  /\ UNCHANGED <<step, logContent, crashed, crashes, retries, writerGen>>

CommitReceive ==
  /\ Ready /\ phase = "receive"
  /\ LET b == NewBatch("receive", OpOf("receive"), {}, {}, {step}, {}, 0)
     IN \/ (Accept(b) /\ phase' = "judge")
        \/ (Refuse /\ phase' = phase)
  /\ UNCHANGED <<step, logContent, crashed, crashes, retries, writerGen>>

CommitJudge ==
  /\ Ready /\ phase = "judge"
  /\ LET b == NewBatch("judge", OpOf("judge"), {"position", "calls"}, {}, {}, {step}, 0)
     IN \/ (Accept(b) /\ phase' = "intend" /\ step' = step + 1
            /\ \E c \in {LogMin, LogBig} : logContent' = logContent + c)
        \/ (Refuse /\ phase' = phase /\ UNCHANGED <<step, logContent>>)
  /\ UNCHANGED <<crashed, crashes, retries, writerGen>>

(* A new operation B lawfully recognizes the intent fact of the current step:
   its batch adds no fact, advances no revision, answers with A's revision. *)
Recognize ==
  /\ Ready
  /\ phase \in {"receive", "judge"}
  /\ OpOf("recognize") \notin DOMAIN view.ops
  /\ OpOf("intend") \in DOMAIN view.ops
  /\ LET b == [kind |-> "recognize", op |-> OpOf("recognize"),
               digest |-> DigestOf(OpOf("recognize"), 0), gen |-> writerGen,
               target |-> view.ops[OpOf("intend")], changed |-> {},
               intents |-> {}, results |-> {}, judged |-> {}]
     IN /\ log' = Append(log, b)
        /\ view' = Apply(view, Len(log) + 1, b)
        /\ head' = Len(log) + 1
        /\ corePub' = head' + 1
        /\ answers' = answers @@ (b.op :> DeriveAt(log', Len(log')))
        /\ lastCommittedView' = view'
        /\ lastCommit' = "ok"
  /\ UNCHANGED <<step, phase, slot, logContent, crashed, crashes, rejects, retries,
                 preserves, writerGen, retryMismatch, records>>

(* A material preserve: a batch with no fact and no cursor change, one publication. The
   design appends it as a batch of the core, so the core's next position follows. The bug
   lets the provider publish it alone: the publication count moves, the core's own position
   does not, and the next batch of the core is stored without its facts (see Stored). *)
Preserve ==
  /\ Ready /\ preserves < MaxPreserves
  /\ preserves' = preserves + 1
  /\ LET op == [step |-> step, kind |-> "preserve", n |-> preserves]
         b == [kind |-> "preserve", op |-> op, digest |-> DigestOf(op, 0), gen |-> writerGen,
               target |-> 0, changed |-> {}, intents |-> {}, results |-> {}, judged |-> {}]
     IN /\ log' = Append(log, b)
        /\ view' = Apply(view, Len(log) + 1, b)
        /\ head' = Len(log) + 1
        /\ corePub' = IF SecondPosition THEN corePub ELSE head' + 1
        /\ answers' = answers @@ (b.op :> [op |-> b.op, rev |-> view'.rev])
        /\ lastCommittedView' = view'
        /\ lastCommit' = "ok"
        (* The bug: the writer numbers an event for a command whose batch carries no event
           fact, so its records hold one event the fold does not project. *)
        /\ records' = [records EXCEPT !.events = @ + (IF EventWithoutFact THEN 1 ELSE 0)]
  /\ UNCHANGED <<step, phase, slot, logContent, crashed, crashes, rejects, retries,
                 writerGen, retryMismatch>>

(* The same operation with the same semantic input comes again (lost reply).
   The design derives the answer from the batch; the bug re-executes. *)
RetrySame ==
  /\ Ready /\ retries < MaxRetries
  /\ \E op \in DOMAIN answers :
       /\ op \in DOMAIN view.ops /\ view.ops[op] \in 1..Len(log)
       /\ retries' = retries + 1
       /\ IF RetryReexecutes
            THEN /\ LET b == NewBatch(op.kind, op, {"position"}, {}, {}, {}, 0)
                    IN /\ log' = Append(log, b)
                       /\ view' = Apply(view, Len(log) + 1, b)
                       /\ head' = Len(log) + 1
                       /\ corePub' = head' + 1
                       /\ lastCommittedView' = view'
                 /\ UNCHANGED retryMismatch
            ELSE /\ retryMismatch' = (retryMismatch \/ (DeriveAt(log, view.ops[op]) /= answers[op]))
                 /\ UNCHANGED <<log, view, head, corePub, lastCommittedView>>
  /\ UNCHANGED <<step, phase, slot, lastCommit, answers, logContent, crashed, crashes,
                 rejects, preserves, writerGen, records>>

(* The same operation with a different semantic input: conflict, no write. *)
RetryConflict ==
  /\ Ready /\ retries < MaxRetries
  /\ \E op \in DOMAIN answers : retries' = retries + 1
  /\ UNCHANGED <<log, view, head, step, phase, slot, lastCommit, answers, logContent,
                 crashed, crashes, rejects, corePub, preserves, writerGen, lastCommittedView,
                 retryMismatch, records>>

Crash ==
  /\ ~crashed /\ crashes < MaxCrashes
  /\ crashed' = TRUE /\ crashes' = crashes + 1
  /\ view' = EmptyView /\ head' = 0
  /\ lastCommit' = "none"
  /\ UNCHANGED <<log, step, phase, slot, answers, logContent, rejects, retries, corePub,
                 preserves, writerGen, lastCommittedView, retryMismatch, records>>

(* A successor process folds the log and takes over with a new authority. Its reader
   records are the projection of the fold: nothing else was stored (K-23 end state). *)
Recover ==
  /\ crashed
  /\ crashed' = FALSE
  /\ LET folded == Fold(log)
         g == folded.gen + 1
         b == [kind |-> "attach", op |-> [step |-> 0, kind |-> "attach", gen |-> g],
               digest |-> DigestOf([step |-> 0, kind |-> "attach", gen |-> g], 0),
               gen |-> g, target |-> 0, changed |-> {}, intents |-> {}, results |-> {},
               judged |-> {}]
     IN /\ log' = Append(log, b)
        /\ view' = Apply(folded, Len(log) + 1, b)
        /\ head' = Len(log) + 1
        /\ corePub' = head' + 1
        /\ writerGen' = g
        /\ answers' = answers @@ (b.op :> [op |-> b.op, rev |-> view'.rev])
        /\ lastCommittedView' = view'
        /\ records' = ProjectOf(view')
  /\ lastCommit' = "ok"
  /\ UNCHANGED <<step, phase, slot, logContent, crashes, rejects, retries, preserves,
                 retryMismatch>>

Init ==
  /\ log = <<>> /\ view = EmptyView /\ head = 0
  /\ step = 1 /\ phase = "intend" /\ slot = "running" /\ lastCommit = "none"
  /\ answers = EmptyFn /\ logContent = 0
  /\ crashed = FALSE /\ crashes = 0 /\ rejects = 0 /\ retries = 0
  /\ corePub = 1 /\ preserves = 0
  /\ writerGen = 1 /\ lastCommittedView = EmptyView /\ retryMismatch = FALSE
  /\ records = EmptyRecords

Next ==
  \/ CommitIntend \/ CommitReceive \/ CommitJudge
  \/ Recognize \/ Preserve \/ RetrySame \/ RetryConflict
  \/ Crash \/ Recover

Spec == Init /\ [][Next]_vars

----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ step \in 1..(MaxSteps + 1) /\ phase \in Phases
  /\ slot \in {"running", "failed"}
  /\ lastCommit \in {"none", "ok", "rejected", "retry"}
  /\ head \in 0..Len(log)

(* P1 SSOT: the live view is exactly the fold of what it has folded. *)
P1_ViewIsFold == ~crashed => view = FoldN(log, head)

(* P1b: the view folds the whole committed log once no commit is in flight. *)
P1_HeadIsTail == ~crashed => head = Len(log)

(* P1c one position: the core's next position is the publication count plus one. *)
P1_OnePosition == ~crashed => corePub = head + 1

(* P1d: the judge fact of every completed step reached the log (a batch the provider stored
   as its envelope alone would have lost it). *)
P1_FactsPublished == \A s \in 1..(step - 1) : <<"j", s>> \in FactsBefore(log, Len(log))

(* P2 only-append: no committed batch is ever changed or removed. *)
IsPrefix(s, t) == Len(s) <= Len(t) /\ \A i \in 1..Len(s) : s[i] = t[i]
P2_AppendOnly == [][IsPrefix(log, log')]_log

(* P3 bounded commit: a batch carries only this step's new facts, so its weight is
   bounded by a constant independent of the number of steps already executed. *)
FMax == 1
BatchBound == C0 + Cardinality(Members) * WMember + FMax * WFact
P3_NoFactRepeated ==
  \A i \in 1..Len(log) : Facts(log[i]) \cap FactsBefore(log, i - 1) = {}
P3_BatchBounded == \A i \in 1..Len(log) : Weight(log[i]) <= BatchBound

(* P4 journal smaller than the log: the own part is linear in steps with an explicit
   coefficient, so for any workload with at least LogMin content bytes per step the
   ratio own/log is at most WStep/LogMin once the log is non-empty. *)
BatchesPerStep == 4      \* intend, receive, judge, one recognition
WStep == BatchesPerStep * BatchBound
J0 == (MaxCrashes + 1 + MaxPreserves) * BatchBound   \* attach and preserve batches
(* completed steps contribute at most WStep each; the current step at most 3 batches *)
P4_LinearInSteps ==
  OwnWeight <= (BatchesPerStep * (step - 1) + 3 + MaxCrashes + 1 + MaxPreserves) * BatchBound
(* logContent >= (step - 1) * LogMin, so the same bound reads against the log *)
P4_RatioBound == OwnWeight <= J0 + WStep + (logContent \div LogMin) * WStep

(* P5 recovery equivalence: the successor's fold of the committed log equals the
   view the last successful commit left behind before the crash. *)
P5_Recovery == [][(crashed /\ ~crashed') => Fold(log) = lastCommittedView]_vars

(* P6 idempotent recognition: an answer is a function of its own batch; one batch per
   operation; a same-input retry derives the original answer without any stored copy. *)
P6_OneBatchPerOp ==
  \A i, j \in 1..Len(log) : log[i].op = log[j].op => i = j
P6_AnswerFromBatch ==
  ~crashed => \A op \in DOMAIN answers :
                /\ op \in DOMAIN view.ops
                /\ view.ops[op] \in 1..Len(log)
                /\ answers[op] = DeriveAt(log, view.ops[op])
P6_RetryAgrees == ~retryMismatch

(* Single advancer: a batch is written only by the authority the log names. *)
GenGuard ==
  \A i \in 1..Len(log) : log[i].kind = "attach" \/ log[i].gen = FoldN(log, i - 1).gen

(* Failure is not silent: a refused commit leaves the slot failed or a retry pending. *)
RejectVisible == lastCommit = "rejected" => slot = "failed"

(* P7 records are a projection: the writer's reader records equal the projection of the fold,
   so a successor that projects the fold holds the writer's records, and no copy of them is
   stored beside the facts (K-23 end state). The events the records number are the event facts
   by the fold's rule. *)
P7_RecordsProjected == ~crashed => records = ProjectOf(view)

====

---- MODULE InputDelivery ----
(* One session, a few inputs, Runs one after another. The model follows one question: which inputs
   a model request shows, and whether the brackets (packages/session/SPEC.md, "输入的括号") agree
   with it. Each action is one session commit or one Agent step.

   A Run starts from every pending input: the Agent knows them all before its first step.

   The four switches turn single design decisions back into the behaviour before this model:
     RowsAtAccept  the message of an input enters the model view when the Session accepts it
     PruneOnTake   an input loses its quiet mark when a Run takes it
     OriginGuard   starting a Run is refused again by the origin of the first waking input
     LateRows      the taking and the delivery to the model view are two commits
   With all of them FALSE the model is the design. *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Inputs, Quiet, Stops, MaxRuns, MaxReplies,
          RowsAtAccept, PruneOnTake, OriginGuard, LateRows

ASSUME Stops \subseteq Quiet /\ Quiet \subseteq Inputs

VARIABLES acc,        \* inputs the Session accepted
          pending,    \* accepted inputs no Run holds, in order
          mark,       \* inputs marked quiet
          run,        \* "none" or "active"
          awaiting,   \* the session waits for a person after a failed Run
          submitted,  \* inputs the Agent of the active Run knows
          taken,      \* inputs the active Run took
          open,       \* taken and not yet answered, in order
          answered,   \* inputs whose bracket closed
          delivered,  \* inputs that have a row in the model view
          tail,       \* inputs whose row lies after the last row that is not an input
          takenEver,  \* inputs some Run took
          owed,       \* LateRows only: taken inputs whose row is not written yet
          view,       \* the model view: <<"in", i>>, <<"final">> or <<"tool">>
          phase,      \* "idle", "need" (a request is due) or "asking" (a request is out)
          upper,      \* the length of the view the request out shows
          runs, replies, startedBy

vars == <<acc, pending, mark, run, awaiting, submitted, taken, open, answered, delivered, tail,
          takenEver, owed, view, phase, upper, runs, replies, startedBy>>

SetOf(s) == {s[k] : k \in 1..Len(s)}
Row(i) == <<"in", i>>
ShownIn(n) == {view[k][2] : k \in {j \in 1..n : view[j][1] = "in"}}
Waking == SelectSeq(pending, LAMBDA i : i \notin mark)
Alive == SetOf(pending) \cup SetOf(open)
Eligible == run = "none" /\ ~awaiting /\ Waking # <<>>
StartGuard(i) == (~OriginGuard) \/ (i \notin Stops)
Batch == submitted \ taken

Init ==
  /\ acc = {} /\ pending = <<>> /\ mark = {} /\ run = "none" /\ awaiting = FALSE
  /\ submitted = {} /\ taken = {} /\ open = <<>> /\ answered = {} /\ delivered = {}
  /\ tail = {} /\ takenEver = {} /\ owed = {} /\ view = <<>> /\ phase = "idle" /\ upper = 0
  /\ runs = 0 /\ replies = 0 /\ startedBy = {}

Accept(i) ==
  /\ i \notin acc
  /\ acc' = acc \cup {i}
  /\ pending' = Append(pending, i)
  /\ mark' = IF i \in Quiet THEN mark \cup {i} ELSE mark
  /\ awaiting' = IF i \in Quiet THEN awaiting ELSE FALSE
  /\ IF RowsAtAccept
       THEN view' = Append(view, Row(i)) /\ delivered' = delivered \cup {i} /\ tail' = tail \cup {i}
       ELSE view' = view /\ delivered' = delivered /\ tail' = tail
  /\ UNCHANGED <<run, submitted, taken, open, answered, takenEver, owed, phase, upper, runs,
                 replies, startedBy>>

StartRun ==
  /\ Eligible /\ runs < MaxRuns
  /\ StartGuard(Head(Waking))
  /\ run' = "active" /\ runs' = runs + 1
  /\ submitted' = SetOf(pending) /\ startedBy' = startedBy \cup {Head(Waking)}
  /\ taken' = {} /\ phase' = "idle"
  /\ UNCHANGED <<acc, pending, mark, awaiting, open, answered, delivered, tail, takenEver, owed,
                 view, upper, replies>>

Submit(i) ==
  /\ run = "active" /\ i \in SetOf(pending) /\ i \notin submitted
  /\ submitted' = submitted \cup {i}
  /\ UNCHANGED <<acc, pending, mark, run, awaiting, taken, open, answered, delivered, tail,
                 takenEver, owed, view, phase, upper, runs, replies, startedBy>>

Take ==
  /\ run = "active" /\ phase = "idle" /\ Batch # {}
  /\ LET ordered == SelectSeq(pending, LAMBDA i : i \in Batch)
         fresh == SelectSeq(ordered, LAMBDA i : i \notin tail)
         rows == [k \in 1..Len(fresh) |-> Row(fresh[k])]
     IN /\ pending' = SelectSeq(pending, LAMBDA i : i \notin Batch)
        /\ taken' = taken \cup Batch
        /\ open' = open \o ordered
        /\ takenEver' = takenEver \cup Batch
        /\ mark' = IF PruneOnTake THEN mark \ Batch ELSE mark
        /\ IF RowsAtAccept
             THEN view' = view /\ delivered' = delivered /\ tail' = tail /\ owed' = owed
             ELSE IF LateRows
               THEN view' = view /\ delivered' = delivered /\ tail' = tail
                    /\ owed' = owed \cup SetOf(fresh)
               ELSE view' = view \o rows /\ delivered' = delivered \cup SetOf(fresh)
                    /\ tail' = tail \cup SetOf(fresh) /\ owed' = owed
  /\ phase' = "need"
  /\ UNCHANGED <<acc, run, awaiting, submitted, answered, upper, runs, replies, startedBy>>

Interpret(i) ==
  /\ i \in owed
  /\ owed' = owed \ {i}
  /\ view' = Append(view, Row(i)) /\ delivered' = delivered \cup {i} /\ tail' = tail \cup {i}
  /\ UNCHANGED <<acc, pending, mark, run, awaiting, submitted, taken, open, answered, takenEver,
                 phase, upper, runs, replies, startedBy>>

Ask ==
  /\ run = "active" /\ phase = "need"
  /\ phase' = "asking" /\ upper' = Len(view)
  /\ UNCHANGED <<acc, pending, mark, run, awaiting, submitted, taken, open, answered, delivered,
                 tail, takenEver, owed, view, runs, replies, startedBy>>

Reply(kind) ==
  /\ run = "active" /\ phase = "asking" /\ replies < MaxReplies
  /\ replies' = replies + 1
  /\ view' = Append(view, <<kind>>) /\ tail' = {}
  /\ answered' = answered \cup SetOf(open) /\ open' = <<>>
  /\ phase' = IF kind = "final" THEN "idle" ELSE "need"
  /\ UNCHANGED <<acc, pending, mark, run, awaiting, submitted, taken, delivered, takenEver, owed,
                 upper, runs, startedBy>>

Finish ==
  /\ run = "active" /\ phase = "idle" /\ Batch = {} /\ pending = <<>>
  /\ run' = "none" /\ submitted' = {} /\ taken' = {}
  /\ UNCHANGED <<acc, pending, mark, awaiting, open, answered, delivered, tail, takenEver, owed,
                 view, phase, upper, runs, replies, startedBy>>

Fail ==
  /\ run = "active"
  /\ run' = "none" /\ awaiting' = TRUE
  /\ pending' = open \o pending /\ open' = <<>>
  /\ submitted' = {} /\ taken' = {} /\ phase' = "idle"
  /\ UNCHANGED <<acc, mark, answered, delivered, tail, takenEver, owed, view, upper, runs,
                 replies, startedBy>>

Retry ==
  /\ run = "none" /\ awaiting /\ Waking # <<>>
  /\ awaiting' = FALSE
  /\ UNCHANGED <<acc, pending, mark, run, submitted, taken, open, answered, delivered, tail,
                 takenEver, owed, view, phase, upper, runs, replies, startedBy>>

Next ==
  \/ \E i \in Inputs : Accept(i) \/ Submit(i) \/ Interpret(i)
  \/ StartRun \/ Take \/ Ask \/ Reply("final") \/ Reply("tool") \/ Finish \/ Fail \/ Retry

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ acc \subseteq Inputs /\ mark \subseteq Inputs /\ run \in {"none", "active"}
  /\ phase \in {"idle", "need", "asking"} /\ upper \in 0..Len(view)

\* N1, one direction: a request shows no input that no Run took.
ShownTaken == phase = "asking" => ShownIn(upper) \subseteq takenEver
\* N1, the other direction: a request shows every input it has to answer.
TakenShown == phase = "asking" => SetOf(open) \subseteq ShownIn(upper)
\* N2: a request never ends in a complete reply of the model.
AskHasNews == phase = "asking" => (upper > 0 /\ view[upper][1] # "final")
\* N3: quiet or not is fixed when the input is accepted.
QuietStable == \A i \in Alive : (i \in mark) = (i \in Quiet)
\* N4: the one judgement says a Run can start, so the start is accepted.
StartEnabled == Eligible => StartGuard(Head(Waking))
\* SW-I16: a quiet input never starts a Run.
NoPassiveStart == startedBy \cap Quiet = {}
\* SE-1, SE-2: each accepted input is in exactly one place.
Accounted ==
  /\ acc = SetOf(pending) \cup SetOf(open) \cup answered
  /\ SetOf(pending) \cap SetOf(open) = {}
  /\ answered \cap Alive = {}
\* A closed bracket means the model replied after it saw the input.
AnsweredAfterShown ==
  \A i \in answered :
    \E k \in 1..Len(view) : view[k] = Row(i) /\ \E j \in (k + 1)..Len(view) : view[j][1] # "in"
\* A Run that is between steps holds no open bracket.
ClosedAtIdle == (run = "active" /\ phase = "idle") => open = <<>>
====

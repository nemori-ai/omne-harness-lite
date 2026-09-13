---------------------------- MODULE Decisions ----------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Mutation
Qs == {1, 2}
VARIABLES answers, continued, closed, interrupted, badActor, completed
vars == <<answers, continued, closed, interrupted, badActor, completed>>
Init == /\ answers = [q \in Qs |-> "pending"] /\ continued = {}
        /\ closed = FALSE /\ interrupted = FALSE /\ badActor = FALSE /\ completed = FALSE
Answer(q, actor) ==
  /\ answers[q] = "pending" /\ ~closed
  /\ (actor = "owner" \/ Mutation = "owner")
  /\ answers' = [answers EXCEPT ![q] = "answered"]
  /\ badActor' = (badActor \/ actor # "owner")
  /\ UNCHANGED <<continued, closed, interrupted, completed>>
Continue(q) ==
  /\ answers[q] = "answered" /\ q \notin continued
  /\ ~closed /\ ~interrupted
  /\ (Mutation # "allAnswers" \/ \A x \in Qs : answers[x] = "answered")
  /\ continued' = continued \cup {q}
  /\ UNCHANGED <<answers, closed, interrupted, badActor, completed>>
Interrupt == /\ ~interrupted /\ interrupted' = TRUE
             /\ UNCHANGED <<answers, continued, closed, badActor, completed>>
Close == /\ ~closed /\ closed' = TRUE
         /\ UNCHANGED <<answers, continued, interrupted, badActor, completed>>
CompleteRun == /\ ~completed /\ ~closed /\ ~interrupted
               /\ (continued = Qs \/ (Mutation = "earlyComplete" /\ continued # {}))
               /\ completed' = TRUE
               /\ UNCHANGED <<answers, continued, closed, interrupted, badActor>>
Next == (\E q \in Qs, a \in {"owner", "admin"} : Answer(q, a)) \/
        (\E q \in Qs : Continue(q)) \/ Interrupt \/ Close \/ CompleteRun
Spec == Init /\ [][Next]_vars /\ \A q \in Qs : WF_vars(Continue(q))
OnlyOwnerAnswers == ~badActor
ContinuationHasAnswer == \A q \in continued : answers[q] = "answered"
CompletionKeepsPending == completed => continued = Qs
\* Human silence for q2 is legal. Global cancellation/interruption discharges
\* the progress obligation; without those blocks q1 must not await q2.
IndependentProgress == \A q \in Qs :
  (answers[q] = "answered") ~> (q \in continued \/ closed \/ interrupted)
=============================================================================

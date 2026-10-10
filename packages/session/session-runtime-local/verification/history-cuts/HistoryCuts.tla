----------------------------- MODULE HistoryCuts -----------------------------
EXTENDS Naturals, Sequences, FiniteSets
CONSTANTS MaxTail, Mutant
VARIABLES durable, reads, head, cuts, open
vars == <<durable, reads, head, cuts, open>>
Readers == {1, 2}
CountA(xs) == Cardinality({i \in 1..Len(xs) : xs[i] = "a"})
Init == /\ durable = <<>>
        /\ reads = [r \in Readers |->
             [phase |-> "idle", rows |-> <<>>, committed |-> FALSE]]
        /\ head = 0
        /\ cuts = {}
        /\ open = TRUE
AppendRow == /\ Len(durable) < MaxTail
             /\ \E id \in {"a", "b"}: durable' = Append(durable, id)
             /\ UNCHANGED <<reads, head, cuts, open>>
BeginRead(r) == /\ open /\ reads[r].phase = "idle"
                /\ reads' = [reads EXCEPT ![r].phase = "reading"]
                /\ UNCHANGED <<durable, head, cuts, open>>
Observe(r) == /\ reads[r].phase = "reading"
              /\ reads' = [reads EXCEPT ![r].phase = "observed", ![r].rows = durable]
              /\ UNCHANGED <<durable, head, cuts, open>>
CommitRead(r) == /\ reads[r].phase = "observed"
                 /\ reads' = [reads EXCEPT ![r].phase = "committed", ![r].committed = TRUE]
                 /\ UNCHANGED <<durable, head, cuts, open>>
FailRead(r) == /\ reads[r].phase \in {"reading", "observed"}
               /\ reads' = [reads EXCEPT ![r].phase = "failed"]
               /\ UNCHANGED <<durable, head, cuts, open>>
Publish(r) ==
  /\ open
  /\ (reads[r].phase = "committed" \/
       (Mutant = "beforeCommit" /\ reads[r].phase = "observed"))
  /\ LET rows == reads[r].rows
         tail == Len(rows)
         cut == [tail |-> tail, rows |-> rows,
                 answers |-> CountA(rows), committed |-> reads[r].committed]
     IN /\ cuts' = cuts \cup {cut}
        /\ head' = IF Mutant = "headRegresses" THEN tail
                   ELSE IF tail > head THEN tail ELSE head
  /\ reads' = [reads EXCEPT ![r].phase = "published"]
  /\ UNCHANGED <<durable, open>>
Close == /\ open /\ open' = FALSE
         /\ UNCHANGED <<durable, reads, head, cuts>>
Next == AppendRow \/ Close \/
        \E r \in Readers: BeginRead(r) \/ Observe(r) \/ CommitRead(r) \/
                           FailRead(r) \/ Publish(r)
Spec == Init /\ [][Next]_vars
CommittedOnly == \A cut \in cuts: cut.committed
FixedCutAnswers == \A cut \in cuts:
  (IF Mutant = "latestIndex" THEN CountA(durable) ELSE cut.answers) = CountA(cut.rows)
DensePrefix == \A cut \in cuts:
  cut.tail = Len(cut.rows) /\ cut.rows = SubSeq(durable, 1, cut.tail)
MonotoneHead == \A cut \in cuts: head >= cut.tail
=============================================================================

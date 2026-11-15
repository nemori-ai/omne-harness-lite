-------------------------- MODULE IntakeControl --------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC
CONSTANT Bad
Inputs == {1,2,3}
Capacity == 2
VARIABLES accepted, queue, started, cancelled, archived, active, generation,
          activeGeneration, badCompletion, startCount, illegalAccept, staleStart, terminalStart
vars == <<accepted,queue,started,cancelled,archived,active,generation,
          activeGeneration,badCompletion,startCount,illegalAccept,staleStart,terminalStart>>
Init ==
  /\ accepted = {} /\ queue = <<>> /\ started = {} /\ cancelled = {}
  /\ archived = FALSE /\ active = 0 /\ generation = 0
  /\ activeGeneration = 0 /\ badCompletion = FALSE
  /\ startCount = [i \in Inputs |-> 0]
  /\ illegalAccept = FALSE /\ staleStart = FALSE /\ terminalStart = FALSE
Elems(q) == {q[k] : k \in 1..Len(q)}
Accept(i) ==
  /\ i \notin accepted /\ (~archived \/ Bad = "archive")
  /\ (Len(queue) < Capacity \/ Bad = "capacity")
  /\ accepted' = accepted \cup {i} /\ queue' = Append(queue,i)
  /\ illegalAccept' = (illegalAccept \/ archived)
  /\ UNCHANGED <<started,cancelled,archived,active,generation,activeGeneration,badCompletion,startCount,staleStart,terminalStart>>
Start(g) == LET i == Head(queue) IN
  /\ Len(queue) > 0 /\ (~archived \/ Bad = "terminal")
  /\ active = 0 /\ (g = generation \/ Bad = "stale") /\ startCount[i] < 2
  /\ activeGeneration' = generation
  /\ started' = started \cup {i} /\ active' = i
  /\ startCount' = [startCount EXCEPT ![i] = @ + 1]
  /\ queue' = IF Bad = "duplicate" THEN queue ELSE Tail(queue)
  /\ staleStart' = (staleStart \/ g # generation)
  /\ terminalStart' = (terminalStart \/ archived)
  /\ UNCHANGED <<accepted,cancelled,archived,generation,badCompletion,illegalAccept>>
Finish(i,g) ==
  /\ active # 0
  /\ ((active = i /\ g = generation /\ activeGeneration = g) \/ Bad = "completion")
  /\ active' = 0
  /\ badCompletion' = (badCompletion \/ active # i \/ g # generation \/ activeGeneration # g)
  /\ UNCHANGED <<accepted,queue,started,cancelled,archived,generation,activeGeneration,startCount,illegalAccept,staleStart,terminalStart>>
CancelRun(i) ==
  /\ active = i /\ active' = 0
  /\ queue' = IF Bad = "cancel" THEN <<>> ELSE queue
  /\ UNCHANGED <<accepted,started,cancelled,archived,generation,activeGeneration,badCompletion,startCount,illegalAccept,staleStart,terminalStart>>
RebindActive ==
  /\ active # 0 /\ activeGeneration # generation /\ activeGeneration' = generation
  /\ UNCHANGED <<accepted,queue,started,cancelled,archived,active,generation,badCompletion,startCount,illegalAccept,staleStart,terminalStart>>
Archive ==
  /\ ~archived /\ archived' = TRUE /\ active' = 0
  /\ cancelled' = IF Bad = "lost" THEN cancelled ELSE cancelled \cup Elems(queue)
  /\ queue' = IF Bad = "terminal" THEN queue ELSE <<>>
  /\ UNCHANGED <<accepted,started,generation,activeGeneration,badCompletion,startCount,illegalAccept,staleStart,terminalStart>>
Replace ==
  /\ generation = 0 /\ generation' = 1
  /\ UNCHANGED <<accepted,queue,started,cancelled,archived,active,activeGeneration,badCompletion,startCount,illegalAccept,staleStart,terminalStart>>
Next == (\E i \in Inputs: Accept(i)) \/ (\E g \in 0..1: Start(g))
        \/ (\E i \in Inputs,g \in 0..1: Finish(i,g))
        \/ (\E i \in Inputs: CancelRun(i)) \/ RebindActive \/ Archive \/ Replace \/ UNCHANGED vars
BoundedPending == Len(queue) <= Capacity
NoAcceptAfterArchive == ~illegalAccept
AcceptedAccounted == accepted = Elems(queue) \cup started \cup cancelled
NoStaleCompletion == ~badCompletion
NoStaleDriver == ~staleStart
NoStartAfterTerminal == ~terminalStart
OnceStart == \A i \in Inputs: startCount[i] <= 1
Spec == Init /\ [][Next]_vars
=============================================================================

---------------------------- MODULE CoreTokenPool ----------------------------
(* The machine-wide core token pool in scripts/with-test-slot.mjs.
   C token files core-<i>.lock, ticket files ticket-<n>, one queue lock
   directory queue.lock. Every action name is the code function it models;
   README.md maps them. "Stale" (heartbeat expired or same-side pid gone) is
   abstracted to "the registrant is dead". *)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Procs,        \* processes that each make one request
  C,            \* capacity: number of token files
  MinChoices,   \* the values a request may give for `min`
  MaxTicket,    \* bound on ticket numbers (state constraint)
  UseLock,      \* FALSE: negative control, no queue lock
  HeadOnly,     \* FALSE: negative control, any ticket may take tokens
  Reap,         \* FALSE: negative control, stale files are never removed
  CrashInLock   \* FALSE: diagnostic, the queue lock holder never dies

None == "none"
NoJudge == <<"none", 0>>
Tokens == 1..C
Numbers == 1..MaxTicket

VARIABLES
  tokens,   \* tokens[i]: registrant of core-<i>.lock, or None
  tickets,  \* tickets[n]: registrant of ticket-<n>, or None
  lock,     \* registrant of queue.lock/owner, or None
  alive,    \* alive[p]: the process is running
  phase,    \* idle | waiting | holding | releasing | done
  loc,      \* out | reap | in | leave: where p is with respect to the queue lock
  judged,   \* the file p judged stale and has not removed yet
  myTicket, \* the ticket number p believes it has (0: none)
  want, mn, \* the request
  held      \* the token indices p believes it holds

vars == <<tokens, tickets, lock, alive, phase, loc, judged, myTicket, want, mn, held>>

Min(a, b) == IF a < b THEN a ELSE b
Max(S) == CHOOSE x \in S : \A y \in S : y <= x
Live(p) == p # None /\ alive[p]
Free == {i \in Tokens : tokens[i] = None}
\* Tokens not held by a live registrant (what P5 calls idle tokens).
IdleCount == Cardinality({i \in Tokens : ~Live(tokens[i])})
\* The g smallest free indices (the code tries core-1..core-C in order).
Smallest(S, g) == {i \in S : Cardinality({j \in S : j < i}) < g}

TypeOK ==
  /\ tokens \in [Tokens -> Procs \cup {None}]
  /\ tickets \in [Numbers -> Procs \cup {None}]
  /\ lock \in Procs \cup {None}
  /\ alive \in [Procs -> BOOLEAN]
  /\ phase \in [Procs -> {"idle", "waiting", "holding", "releasing", "done"}]
  /\ loc \in [Procs -> {"out", "reap", "in", "leave"}]
  /\ myTicket \in [Procs -> 0..MaxTicket]
  /\ held \in [Procs -> SUBSET Tokens]

Init ==
  /\ tokens = [i \in Tokens |-> None]
  /\ tickets = [n \in Numbers |-> None]
  /\ lock = None
  /\ alive = [p \in Procs |-> TRUE]
  /\ phase = [p \in Procs |-> "idle"]
  /\ loc = [p \in Procs |-> "out"]
  /\ judged = [p \in Procs |-> NoJudge]
  /\ myTicket = [p \in Procs |-> 0]
  /\ want = [p \in Procs |-> 1]
  /\ mn = [p \in Procs |-> 1]
  /\ held = [p \in Procs |-> {}]

\* A request arrives: want in 1..C, min a configured choice not above want.
request(p) ==
  /\ alive[p] /\ phase[p] = "idle"
  /\ \E w \in 1..C, m \in MinChoices :
       /\ m <= w
       /\ want' = [want EXCEPT ![p] = w]
       /\ mn' = [mn EXCEPT ![p] = m]
  /\ phase' = [phase EXCEPT ![p] = "waiting"]
  /\ UNCHANGED <<tokens, tickets, lock, alive, loc, judged, myTicket, held>>

\* inQueue: mkdir queue.lock and write owner (atomic); or, when the lock exists
\* and its owner is dead (`gone`), go on to remove it.
inQueue(p) ==
  /\ alive[p] /\ phase[p] \in {"waiting", "releasing"} /\ loc[p] = "out"
  /\ IF ~UseLock
       THEN /\ loc' = [loc EXCEPT ![p] = "in"] /\ UNCHANGED lock
       ELSE \/ /\ lock = None
               /\ lock' = p
               /\ loc' = [loc EXCEPT ![p] = "in"]
            \/ /\ lock # None /\ ~alive[lock]
               /\ loc' = [loc EXCEPT ![p] = "reap"]
               /\ UNCHANGED lock
  /\ UNCHANGED <<tokens, tickets, alive, phase, judged, myTicket, want, mn, held>>

\* removeQueueLock: either the owner leaving (only if the owner file is still
\* its own), or removing by path the lock it judged dead in inQueue.
removeQueueLock(p) ==
  /\ alive[p] /\ loc[p] \in {"reap", "leave"}
  /\ IF ~UseLock THEN UNCHANGED lock
     ELSE IF loc[p] = "reap" THEN lock' = None
     ELSE lock' = IF lock = p THEN None ELSE lock
  /\ loc' = [loc EXCEPT ![p] = "out"]
  /\ UNCHANGED <<tokens, tickets, alive, phase, judged, myTicket, want, mn, held>>

\* alive (judging half): read a token or ticket file and find its registrant dead.
alive_judge(p) ==
  /\ alive[p] /\ loc[p] = "in" /\ judged[p] = NoJudge /\ Reap
  /\ \/ \E i \in Tokens : tokens[i] # None /\ ~alive[tokens[i]]
                          /\ judged' = [judged EXCEPT ![p] = <<"token", i>>]
     \/ \E n \in Numbers : tickets[n] # None /\ ~alive[tickets[n]]
                          /\ judged' = [judged EXCEPT ![p] = <<"ticket", n>>]
  /\ UNCHANGED <<tokens, tickets, lock, alive, phase, loc, myTicket, want, mn, held>>

\* remove: delete the judged file by path, whoever registers it by now.
remove(p) ==
  /\ alive[p] /\ judged[p] # NoJudge
  /\ IF judged[p][1] = "token"
       THEN /\ tokens' = [tokens EXCEPT ![judged[p][2]] = None] /\ UNCHANGED tickets
       ELSE /\ tickets' = [tickets EXCEPT ![judged[p][2]] = None] /\ UNCHANGED tokens
  /\ judged' = [judged EXCEPT ![p] = NoJudge]
  /\ UNCHANGED <<lock, alive, phase, loc, myTicket, want, mn, held>>

\* Stale files the scan in takeTurn would still meet (with Reap it removes them first).
Unreaped == Reap /\ (\/ \E i \in Tokens : tokens[i] # None /\ ~alive[tokens[i]]
                     \/ \E n \in Numbers : tickets[n] # None /\ ~alive[tickets[n]])

\* takeTurn: take a ticket the first time (or again after it was recycled),
\* count the live tickets ahead, and as head take min(want, free) tokens when
\* free >= min, deleting its own ticket.
takeTurn(p) ==
  /\ alive[p] /\ phase[p] = "waiting" /\ loc[p] = "in" /\ judged[p] = NoJudge
  /\ ~Unreaped
  /\ LET has == myTicket[p] # 0 /\ tickets[myTicket[p]] = p
         used == {n \in Numbers : tickets[n] # None}
         n == IF has THEN myTicket[p] ELSE Max(used \cup {0}) + 1
     IN /\ n <= MaxTicket
        /\ LET tickets1 == [tickets EXCEPT ![n] = p]
               ahead == Cardinality({m \in Numbers : m < n /\ Live(tickets1[m])})
               free == Cardinality(Free)
           IN IF (~HeadOnly \/ ahead = 0) /\ free >= mn[p]
                THEN LET got == Smallest(Free, Min(want[p], free))
                     IN /\ tokens' = [i \in Tokens |-> IF i \in got THEN p ELSE tokens[i]]
                        /\ held' = [held EXCEPT ![p] = got]
                        /\ tickets' = [tickets1 EXCEPT ![n] = None]
                        /\ phase' = [phase EXCEPT ![p] = "holding"]
                ELSE /\ tickets' = tickets1
                     /\ UNCHANGED <<tokens, held, phase>>
        /\ myTicket' = [myTicket EXCEPT ![p] = n]
        /\ loc' = [loc EXCEPT ![p] = "leave"]
  /\ UNCHANGED <<lock, alive, judged, want, mn>>

\* run: the wrapped command ends; the holder goes back to the queue to release.
run(p) ==
  /\ alive[p] /\ phase[p] = "holding" /\ loc[p] = "out"
  /\ phase' = [phase EXCEPT ![p] = "releasing"]
  /\ UNCHANGED <<tokens, tickets, lock, alive, loc, judged, myTicket, want, mn, held>>

\* releaseTokens: in the lock, removeOwn on every token it holds.
releaseTokens(p) ==
  /\ alive[p] /\ phase[p] = "releasing" /\ loc[p] = "in" /\ judged[p] = NoJudge
  /\ tokens' = [i \in Tokens |-> IF i \in held[p] /\ tokens[i] = p THEN None ELSE tokens[i]]
  /\ held' = [held EXCEPT ![p] = {}]
  /\ phase' = [phase EXCEPT ![p] = "done"]
  /\ loc' = [loc EXCEPT ![p] = "leave"]
  /\ UNCHANGED <<tickets, lock, alive, judged, myTicket, want, mn>>

\* The environment kills a process at any point; its files stay.
crash(p) ==
  /\ alive[p]
  /\ ~(phase[p] = "done" /\ loc[p] = "out")
  /\ (CrashInLock \/ lock # p)
  /\ alive' = [alive EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<tokens, tickets, lock, phase, loc, judged, myTicket, want, mn, held>>

Step(p) == request(p) \/ inQueue(p) \/ removeQueueLock(p) \/ alive_judge(p)
           \/ remove(p) \/ takeTurn(p) \/ run(p) \/ releaseTokens(p)

Finished == \A p \in Procs : ~alive[p] \/ (phase[p] = "done" /\ loc[p] = "out")

Next == \/ \E p \in Procs : Step(p) \/ crash(p)
        \/ (Finished /\ UNCHANGED vars)

\* Weak fairness for each live process; strong fairness for taking the queue
\* lock (the lock is held briefly, so a polling waiter finds it free).
Spec == Init /\ [][Next]_vars
        /\ \A p \in Procs : WF_vars(Step(p)) /\ SF_vars(inQueue(p))

TicketBound == \A p \in Procs : myTicket[p] <= MaxTicket

----------------------------------------------------------------------------
\* P1 不超卖: tokens believed held by live holders add up to at most C.
\* The sum is the number of (holder, token) pairs.
P1 == Cardinality({<<p, i>> \in Procs \X Tokens : alive[p] /\ i \in held[p]}) <= C

\* P2 不重复: no token is believed held by two live processes.
P2 == \A p, q \in Procs : p # q /\ alive[p] /\ alive[q] => held[p] \cap held[q] = {}

Queued(q) == alive[q] /\ phase[q] = "waiting" /\ myTicket[q] # 0 /\ tickets[myTicket[q]] = q

\* P4 先来先得: no process takes tokens while a live queued request with a
\* smaller ticket exists.
P4 == [][\A p, q \in Procs :
           (p # q /\ phase[p] = "waiting" /\ phase'[p] = "holding"
            /\ Queued(q) /\ myTicket[q] < myTicket'[p]) => FALSE]_vars

\* P3 不漏: while some live process waits, a token file of a dead registrant
\* is removed (or no live process waits any more).
DeadAt(i) == tokens[i] # None /\ ~alive[tokens[i]]
LiveWaiter == \E p \in Procs : alive[p] /\ phase[p] = "waiting"
P3 == \A i \in Tokens : (DeadAt(i) /\ LiveWaiter) ~> (~DeadAt(i) \/ ~LiveWaiter)

\* P5 不让资源闲着 (generalised to the request's min): the live head of the
\* queue, with at least its min tokens idle, gets tokens or dies.
Head(p) == Queued(p) /\ \A q \in Procs : Queued(q) => myTicket[p] <= myTicket[q]
P5 == \A p \in Procs : (Head(p) /\ IdleCount >= mn[p]) ~> (phase[p] = "holding" \/ ~alive[p])
=============================================================================

---------------------------- MODULE CoreTokenPool ----------------------------
(* The machine-wide core token pool in scripts/with-test-slot.mjs.
   Token directories core-<i>, ticket files ticket-<n>, and the queue lock
   directory queue.lock. Holding the queue lock (or a token) means having one's
   own entry owner-<pid>-<random> in that directory. Every action name is the
   code function it models; README.md maps them. "Stale" (heartbeat expired,
   same-side pid gone, or lock entry older than 30 s) is abstracted to "the
   registrant is dead". Entry names are fresh per entry and a dead process makes
   no new entries, so an entry is identified by its registrant here.

   Switches for the controls:
   - ExactReap = FALSE: the old recovery, which removes queue.lock and token
     files by path (recursively), whoever registers them by now.
   - SoleEntry = FALSE: enter counts as holding as soon as its entry is
     created, without checking that it is the only entry in the directory. *)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Procs,        \* processes that each make one request
  C,            \* capacity: number of tokens
  MinChoices,   \* the values a request may give for `min`
  MaxTicket,    \* bound on ticket numbers (state constraint)
  UseLock,      \* FALSE: negative control, no queue lock
  HeadOnly,     \* FALSE: negative control, any ticket may take tokens
  Reap,         \* FALSE: negative control, stale entries are never removed
  CrashInLock,  \* FALSE: diagnostic, a process never dies while it is in or entering the queue lock
  ExactReap,    \* FALSE: negative control, the old remove-by-path recovery
  SoleEntry     \* FALSE: negative control, enter does not check for other entries

None == "none"
\* The second component is 0 when there is nothing to name (TLC cannot compare a string with a number).
NoJudge == <<"none", 0>>
Tokens == 1..C
Numbers == 1..MaxTicket
\* Not a set of tokens (0 is no token): p has not read the free tokens.
Unseen == {0}

VARIABLES
  tokens,      \* tokens[i]: registrant of the entry in core-<i>, or None
  tickets,     \* tickets[n]: registrant of ticket-<n>, or None
  lockDir,     \* queue.lock: None when the directory is absent, else the process that made it
  lockEntries, \* registrants of the entries in queue.lock
  alive,       \* alive[p]: the process is running
  phase,       \* idle | waiting | holding | releasing | done
  loc,         \* where p is with respect to the queue lock, see LockSteps
  judged,      \* what p judged stale and has not removed yet
  myTicket,    \* the ticket number p believes it has (0: none)
  want, mn,    \* the request
  held,        \* the token indices p believes it holds
  seen         \* without the lock only: the free tokens p read in a step of its own; else Unseen

vars == <<tokens, tickets, lockDir, lockEntries, alive, phase, loc, judged, myTicket, want, mn,
          held, seen>>

\* out: not in the lock. made: did mkdir, entry not created yet. placed: entry
\* created, sole-entry check not done. in: holds the lock. leave: done with the
\* work, own entry not removed yet. rmdir: about to remove the directory if empty.
\* reap: judged a lock entry or the empty lock directory stale.
LockSteps == {"out", "made", "placed", "in", "leave", "rmdir", "reap"}
InLock(p) == loc[p] \in {"made", "placed", "in", "leave", "rmdir"}

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
  /\ lockDir \in Procs \cup {None}
  /\ lockEntries \subseteq Procs
  /\ alive \in [Procs -> BOOLEAN]
  /\ phase \in [Procs -> {"idle", "waiting", "holding", "releasing", "done"}]
  /\ loc \in [Procs -> LockSteps]
  /\ myTicket \in [Procs -> 0..MaxTicket]
  /\ held \in [Procs -> SUBSET Tokens]
  /\ seen \in [Procs -> SUBSET (0..C)]

Init ==
  /\ tokens = [i \in Tokens |-> None]
  /\ tickets = [n \in Numbers |-> None]
  /\ lockDir = None
  /\ lockEntries = {}
  /\ alive = [p \in Procs |-> TRUE]
  /\ phase = [p \in Procs |-> "idle"]
  /\ loc = [p \in Procs |-> "out"]
  /\ judged = [p \in Procs |-> NoJudge]
  /\ myTicket = [p \in Procs |-> 0]
  /\ want = [p \in Procs |-> 1]
  /\ mn = [p \in Procs |-> 1]
  /\ held = [p \in Procs |-> {}]
  /\ seen = [p \in Procs |-> Unseen]

\* A request arrives: want in 1..C, min a configured choice not above want.
request(p) ==
  /\ alive[p] /\ phase[p] = "idle"
  /\ \E w \in 1..C, m \in MinChoices :
       /\ m <= w
       /\ want' = [want EXCEPT ![p] = w]
       /\ mn' = [mn EXCEPT ![p] = m]
  /\ phase' = [phase EXCEPT ![p] = "waiting"]
  /\ UNCHANGED <<tokens, tickets, lockDir, lockEntries, alive, loc, judged, myTicket, held, seen>>

Unchanged_but_lock ==
  UNCHANGED <<tokens, tickets, alive, phase, myTicket, want, mn, held, seen>>

\* enter, first half: mkdir queue.lock (atomic). Without a lock (negative
\* control) the process is simply in.
enter_mkdir(p) ==
  /\ alive[p] /\ phase[p] \in {"waiting", "releasing"} /\ loc[p] = "out"
  /\ judged[p] = NoJudge
  /\ IF ~UseLock
       THEN /\ loc' = [loc EXCEPT ![p] = "in"] /\ UNCHANGED <<lockDir, lockEntries>>
       ELSE /\ lockDir = None
            /\ lockDir' = p
            /\ loc' = [loc EXCEPT ![p] = "made"]
            /\ UNCHANGED lockEntries
  /\ UNCHANGED judged
  /\ Unchanged_but_lock

\* enter, second half: create the own entry inside whatever directory is at the
\* path now. ENOENT (the directory is gone) means start over.
enter_place(p) ==
  /\ alive[p] /\ loc[p] = "made"
  /\ IF lockDir # None
       THEN /\ lockEntries' = lockEntries \cup {p}
            /\ loc' = [loc EXCEPT ![p] = "placed"]
       ELSE /\ loc' = [loc EXCEPT ![p] = "out"] /\ UNCHANGED lockEntries
  /\ UNCHANGED <<lockDir, judged>>
  /\ Unchanged_but_lock

\* enter, the check: hold only when the own entry is the only one; otherwise
\* leave (remove the own entry, then the directory if empty) and start over.
enter_check(p) ==
  /\ alive[p] /\ loc[p] = "placed"
  /\ IF SoleEntry /\ lockEntries # {p}
       THEN /\ lockEntries' = lockEntries \ {p}
            /\ loc' = [loc EXCEPT ![p] = "rmdir"]
       ELSE /\ loc' = [loc EXCEPT ![p] = "in"] /\ UNCHANGED lockEntries
  /\ UNCHANGED <<lockDir, judged>>
  /\ Unchanged_but_lock

\* inQueue, when mkdir found the directory: judge one entry stale, or the
\* directory stale when it has no entry and its maker is dead.
inQueue_judge(p) ==
  /\ alive[p] /\ phase[p] \in {"waiting", "releasing"} /\ loc[p] = "out"
  /\ UseLock /\ Reap /\ judged[p] = NoJudge /\ lockDir # None
  /\ \/ \E q \in lockEntries : ~alive[q] /\ judged' = [judged EXCEPT ![p] = <<"lock", q>>]
     \/ /\ lockEntries = {} /\ ~alive[lockDir]
        /\ judged' = [judged EXCEPT ![p] = <<"lockdir", 0>>]
  /\ loc' = [loc EXCEPT ![p] = "reap"]
  /\ UNCHANGED <<lockDir, lockEntries>>
  /\ Unchanged_but_lock

\* reap, first half: remove the judged entry by its exact name. The old
\* recovery (ExactReap = FALSE) removes the whole queue.lock by path instead.
reap(p) ==
  /\ alive[p] /\ loc[p] = "reap"
  /\ IF judged[p][1] = "lock"
       THEN IF ExactReap
              THEN /\ lockEntries' = lockEntries \ {judged[p][2]} /\ UNCHANGED lockDir
              ELSE /\ lockEntries' = {} /\ lockDir' = None
       ELSE UNCHANGED <<lockDir, lockEntries>>
  /\ judged' = [judged EXCEPT ![p] = NoJudge]
  /\ loc' = [loc EXCEPT ![p] = "rmdir"]
  /\ Unchanged_but_lock

\* removeIfEmpty: rmdir queue.lock, which succeeds only when the directory at
\* the path (whoever made it) has no entry.
removeIfEmpty(p) ==
  /\ alive[p] /\ loc[p] = "rmdir"
  /\ lockDir' = IF lockEntries = {} THEN None ELSE lockDir
  /\ loc' = [loc EXCEPT ![p] = "out"]
  /\ UNCHANGED <<lockEntries, judged>>
  /\ Unchanged_but_lock

\* leave: remove the own entry when done in the lock (the directory follows in removeIfEmpty).
leave(p) ==
  /\ alive[p] /\ loc[p] = "leave"
  /\ lockEntries' = lockEntries \ {p}
  /\ loc' = [loc EXCEPT ![p] = IF UseLock THEN "rmdir" ELSE "out"]
  /\ UNCHANGED <<lockDir, judged>>
  /\ Unchanged_but_lock

\* alive (judging half): in the lock, read a token entry or a ticket and find its registrant dead.
alive_judge(p) ==
  /\ alive[p] /\ loc[p] = "in" /\ judged[p] = NoJudge /\ Reap
  /\ \/ \E i \in Tokens : tokens[i] # None /\ ~alive[tokens[i]]
                          /\ judged' = [judged EXCEPT ![p] = <<"token", i>>]
     \/ \E n \in Numbers : tickets[n] # None /\ ~alive[tickets[n]]
                          /\ judged' = [judged EXCEPT ![p] = <<"ticket", n>>]
  /\ UNCHANGED <<tokens, tickets, lockDir, lockEntries, alive, phase, loc, myTicket, want, mn,
                 held, seen>>

\* remove: delete what was judged. A token entry goes by its exact name, so only
\* the judged registrant's entry; the old recovery removes the token file by path.
\* A ticket goes by path (tickets are files, changed only in the lock).
remove(p) ==
  /\ alive[p] /\ loc[p] = "in" /\ judged[p] # NoJudge
  /\ judged[p][1] \in {"token", "ticket"}
  /\ IF judged[p][1] = "token"
       THEN LET i == judged[p][2]
            IN /\ tokens' = [tokens EXCEPT ![i] = IF ExactReap /\ Live(tokens[i]) THEN tokens[i]
                                                  ELSE None]
               /\ UNCHANGED tickets
       ELSE /\ tickets' = [tickets EXCEPT ![judged[p][2]] = None] /\ UNCHANGED tokens
  /\ judged' = [judged EXCEPT ![p] = NoJudge]
  /\ UNCHANGED <<lockDir, lockEntries, alive, phase, loc, myTicket, want, mn, held, seen>>

\* Stale entries the scan in takeTurn would still meet (with Reap it removes them first).
Unreaped == Reap /\ (\/ \E i \in Tokens : tokens[i] # None /\ ~alive[tokens[i]]
                     \/ \E n \in Numbers : tickets[n] # None /\ ~alive[tickets[n]])

\* The one pass of takeTurn is one step only because the queue lock excludes
\* the others. Without the lock (negative control) reading the free tokens is
\* a step of its own, and taking them comes later, on what was read.
look(p) ==
  /\ ~UseLock
  /\ alive[p] /\ phase[p] = "waiting" /\ loc[p] = "in" /\ judged[p] = NoJudge
  /\ seen[p] = Unseen
  /\ seen' = [seen EXCEPT ![p] = Free]
  /\ UNCHANGED <<tokens, tickets, lockDir, lockEntries, alive, phase, loc, judged, myTicket, want,
                 mn, held>>

\* takeTurn: take a ticket the first time (or again after it was recycled),
\* count the live tickets ahead, and as head take min(want, free) tokens when
\* free >= min, deleting its own ticket. Done in one pass inside the lock.
takeTurn(p) ==
  /\ alive[p] /\ phase[p] = "waiting" /\ loc[p] = "in" /\ judged[p] = NoJudge
  /\ ~Unreaped
  /\ UseLock \/ seen[p] # Unseen
  /\ LET has == myTicket[p] # 0 /\ tickets[myTicket[p]] = p
         used == {n \in Numbers : tickets[n] # None}
         n == IF has THEN myTicket[p] ELSE Max(used \cup {0}) + 1
         read == IF UseLock THEN Free ELSE seen[p]
     IN /\ n <= MaxTicket
        /\ LET tickets1 == [tickets EXCEPT ![n] = p]
               ahead == Cardinality({m \in Numbers : m < n /\ Live(tickets1[m])})
               free == Cardinality(read)
           IN IF (~HeadOnly \/ ahead = 0) /\ free >= mn[p]
                THEN LET got == Smallest(read, Min(want[p], free))
                     IN /\ tokens' = [i \in Tokens |-> IF i \in got THEN p ELSE tokens[i]]
                        /\ held' = [held EXCEPT ![p] = got]
                        /\ tickets' = [tickets1 EXCEPT ![n] = None]
                        /\ phase' = [phase EXCEPT ![p] = "holding"]
                ELSE /\ tickets' = tickets1
                     /\ UNCHANGED <<tokens, held, phase>>
        /\ myTicket' = [myTicket EXCEPT ![p] = n]
        /\ loc' = [loc EXCEPT ![p] = "leave"]
  /\ seen' = [seen EXCEPT ![p] = Unseen]
  /\ UNCHANGED <<lockDir, lockEntries, alive, judged, want, mn>>

\* run: the wrapped command ends; the holder goes back to the queue to release.
run(p) ==
  /\ alive[p] /\ phase[p] = "holding" /\ loc[p] = "out"
  /\ phase' = [phase EXCEPT ![p] = "releasing"]
  /\ UNCHANGED <<tokens, tickets, lockDir, lockEntries, alive, loc, judged, myTicket, want, mn,
                 held, seen>>

\* releaseTokens: in the lock, leave every token it holds (own entries only).
releaseTokens(p) ==
  /\ alive[p] /\ phase[p] = "releasing" /\ loc[p] = "in" /\ judged[p] = NoJudge
  /\ tokens' = [i \in Tokens |-> IF i \in held[p] /\ tokens[i] = p THEN None ELSE tokens[i]]
  /\ held' = [held EXCEPT ![p] = {}]
  /\ phase' = [phase EXCEPT ![p] = "done"]
  /\ loc' = [loc EXCEPT ![p] = "leave"]
  /\ UNCHANGED <<tickets, lockDir, lockEntries, alive, judged, myTicket, want, mn, seen>>

\* The environment kills a process at any point; its entries and files stay.
crash(p) ==
  /\ alive[p]
  /\ ~(phase[p] = "done" /\ loc[p] = "out")
  /\ (CrashInLock \/ ~InLock(p))
  /\ alive' = [alive EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<tokens, tickets, lockDir, lockEntries, phase, loc, judged, myTicket, want, mn,
                 held, seen>>

Step(p) == request(p) \/ enter_mkdir(p) \/ enter_place(p) \/ enter_check(p)
           \/ inQueue_judge(p) \/ reap(p) \/ removeIfEmpty(p) \/ leave(p)
           \/ alive_judge(p) \/ remove(p) \/ look(p) \/ takeTurn(p) \/ run(p)
           \/ releaseTokens(p)

Finished == \A p \in Procs : ~alive[p] \/ (phase[p] = "done" /\ loc[p] = "out")

Next == \/ \E p \in Procs : Step(p) \/ crash(p)
        \/ (Finished /\ UNCHANGED vars)

\* Weak fairness for each live process; strong fairness for making the queue
\* lock directory (the lock is held briefly, so a polling waiter finds it free).
Spec == Init /\ [][Next]_vars
        /\ \A p \in Procs : WF_vars(Step(p)) /\ SF_vars(enter_mkdir(p))

TicketBound == \A p \in Procs : myTicket[p] <= MaxTicket

----------------------------------------------------------------------------
\* The queue lock excludes: at most one live process is in it.
LockExclusive == \A p, q \in Procs : p # q /\ alive[p] /\ alive[q] => ~(loc[p] = "in" /\ loc[q] = "in")

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

\* P3 不漏: while some live process waits, a token entry of a dead registrant
\* is removed (or no live process waits any more).
DeadAt(i) == tokens[i] # None /\ ~alive[tokens[i]]
LiveWaiter == \E p \in Procs : alive[p] /\ phase[p] = "waiting"
P3 == \A i \in Tokens : (DeadAt(i) /\ LiveWaiter) ~> (~DeadAt(i) \/ ~LiveWaiter)

\* P5 不让资源闲着 (generalised to the request's min): the live head of the
\* queue, with at least its min tokens idle, gets tokens or dies.
Head(p) == Queued(p) /\ \A q \in Procs : Queued(q) => myTicket[p] <= myTicket[q]
P5 == \A p \in Procs : (Head(p) /\ IdleCount >= mn[p]) ~> (phase[p] = "holding" \/ ~alive[p])
=============================================================================

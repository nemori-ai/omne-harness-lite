---------------------------- MODULE AdmissionWait ----------------------------
(* One admission point of the SQLite provider with its bounded waiting list.  *)
(* A request needs one place of its domain, one global place and some bytes.  *)
(* It is idle, waits in arrival order, holds a reservation, or has left.      *)
(* Every step that changes what is held or who waits ends with a scan of the  *)
(* waiting list from its head (sqlite-provider src/waiting.ts `scan`).        *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Req,        \* the requests, each arrives at most once
          Dom,        \* Req -> domain
          Weight,     \* Req -> bytes it reserves
          PerDomain,  \* places per domain; also the waiters per domain
          Global,     \* global places; also the waiters in all
          Bytes,      \* global bytes
          Deadline,   \* ticks a waiter may wait
          Jump,       \* negative control: a new request takes free room before the waiters
          NoRescan,   \* negative control: expiry and abort do not scan
          WakeAll     \* negative control: a scan grants every waiter

VARIABLES phase,      \* Req -> "idle" | "waiting" | "held" | "left"
          queue,      \* the waiters, in arrival order
          age,        \* Req -> ticks waited
          overtaken   \* a grant went past an earlier waiter that its own domain did not block

vars == <<phase, queue, age, overtaken>>

(* The values the configurations bind (TLC configurations take no function literals). *)
MCReq == {"a", "b", "c", "d"}
MCDom == [r \in MCReq |-> CASE r \in {"a", "b"} -> "d1" [] r = "c" -> "d2" [] OTHER -> "d3"]
MCWeight == [r \in MCReq |-> IF r = "c" THEN 2 ELSE 1]

Held == {r \in Req : phase[r] = "held"}
DomCount(d, h) == Cardinality({x \in h : Dom[x] = d})
RECURSIVE SumW(_)
SumW(s) == IF s = {} THEN 0 ELSE LET x == CHOOSE y \in s : TRUE IN Weight[x] + SumW(s \ {x})

DomBlocked(r, h) == DomCount(Dom[r], h) >= PerDomain
Fits(r, h) == ~DomBlocked(r, h) /\ Cardinality(h) < Global /\ SumW(h) + Weight[r] <= Bytes

(* The scan: grant what fits, skip what only its own domain blocks, stop at  *)
(* the first waiter that a global resource blocks.                            *)
RECURSIVE Scan(_, _)
Scan(s, h) ==
  IF s = <<>> THEN {}
  ELSE LET x == Head(s) IN
       IF Fits(x, h) THEN {x} \cup Scan(Tail(s), h \cup {x})
       ELSE IF DomBlocked(x, h) THEN Scan(Tail(s), h)
       ELSE {}

Remove(s, gone) == SelectSeq(s, LAMBDA x : x \notin gone)
InQueue(s) == {s[i] : i \in 1..Len(s)}
WaitingIn(d, s) == Cardinality({x \in InQueue(s) : Dom[x] = d})

(* Finish a step whose phase map is p and whose waiters are s: scan and grant. *)
Settle(p, s) ==
  LET h == {r \in Req : p[r] = "held"}
      g == IF WakeAll THEN InQueue(s) ELSE Scan(s, h)
  IN /\ phase' = [r \in Req |-> IF r \in g THEN "held" ELSE p[r]]
     /\ queue' = Remove(s, g)
     /\ overtaken' = (overtaken \/
          \E i, j \in 1..Len(s) : i < j /\ s[j] \in g /\ s[i] \notin g /\ ~DomBlocked(s[i], h \cup g))

Init == /\ phase = [r \in Req |-> "idle"]
        /\ queue = <<>>
        /\ age = [r \in Req |-> 0]
        /\ overtaken = FALSE

Arrive(r) ==
  /\ phase[r] = "idle"
  /\ age' = age
  /\ IF Weight[r] > Bytes
          \/ WaitingIn(Dom[r], queue) >= PerDomain
          \/ Len(queue) >= Global
     THEN \* never fits, or the waiting list is full: refused at once
          /\ phase' = [phase EXCEPT ![r] = "left"]
          /\ queue' = queue
          /\ overtaken' = overtaken
     ELSE IF Jump /\ Fits(r, Held)
     THEN /\ phase' = [phase EXCEPT ![r] = "held"]
          /\ queue' = queue
          /\ overtaken' = (overtaken \/ \E i \in 1..Len(queue) : ~DomBlocked(queue[i], Held \cup {r}))
     ELSE Settle([phase EXCEPT ![r] = "waiting"], Append(queue, r))

Release(r) ==
  /\ phase[r] = "held"
  /\ Settle([phase EXCEPT ![r] = "left"], queue)
  /\ age' = age

Leave(r) ==   \* expiry at the deadline, or an abort at any time, while waiting
  /\ phase[r] = "waiting"
  /\ IF NoRescan
     THEN /\ phase' = [phase EXCEPT ![r] = "left"]
          /\ queue' = Remove(queue, {r})
          /\ overtaken' = overtaken
     ELSE Settle([phase EXCEPT ![r] = "left"], Remove(queue, {r}))
  /\ age' = age

Tick ==       \* time passes only while no waiter is at its deadline
  /\ queue # <<>>
  /\ \A r \in InQueue(queue) : age[r] < Deadline
  /\ age' = [r \in Req |-> IF r \in InQueue(queue) THEN age[r] + 1 ELSE age[r]]
  /\ UNCHANGED <<phase, queue, overtaken>>

Next == \/ \E r \in Req : Arrive(r) \/ Release(r) \/ Leave(r)
        \/ Tick

Spec == Init /\ [][Next]_vars

TypeOK == /\ phase \in [Req -> {"idle", "waiting", "held", "left"}]
          /\ \A r \in Req : (phase[r] = "waiting") <=> (r \in InQueue(queue))

Bounded == /\ Len(queue) <= Global
           /\ \A r \in Req : WaitingIn(Dom[r], queue) <= PerDomain
DeadlineKept == \A r \in InQueue(queue) : age[r] <= Deadline
WithinCapacity == /\ Cardinality(Held) <= Global
                  /\ SumW(Held) <= Bytes
                  /\ \A r \in Req : DomCount(Dom[r], Held) <= PerDomain
NoOvertake == ~overtaken
NoIdleFit == Scan(queue, Held) = {}
NothingSentWhileWaiting == \A r \in InQueue(queue) : phase[r] # "held"
=============================================================================

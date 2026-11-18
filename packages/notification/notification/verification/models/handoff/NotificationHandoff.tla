------------------------- MODULE NotificationHandoff -------------------------
(* One tenant. A source sends events; the notification core accepts each send in
   one commit and writes a notification into the box of every recipient. Strong
   notifications are grouped into delivery units under a minimum interval; a beat
   forms one unit from what is still unresolved. A unit is fixed before its first
   delivery and is delivered to a session intake that recalls by submission id.
   Each action is one commit of its owner. Safety only. *)
EXTENDS Integers, FiniteSets

CONSTANTS Events, Recipients, Keyed, Strong, MinInterval, MaxTime, MaxTries, MaxBeats

VARIABLES accepted, count, resolved, superseded, units, nextId, status, tries, log,
          now, lastStrong, beat, beatSeen

vars == <<accepted, count, resolved, superseded, units, nextId, status, tries, log,
          now, lastStrong, beat, beatSeen>>

Pairs == Events \X Recipients
MaxUnits == Cardinality(Recipients) * ((MaxTime \div MinInterval) + 1 + MaxBeats)
Ids == 1..MaxUnits

Has(e, r) == count[e][r] > 0
Live(e, r) == Has(e, r) /\ resolved[e][r] = "none" /\ <<e, r>> \notin superseded
LiveSet(r) == {e \in Events : Live(e, r)}

(* ---- accepting a send ---- *)
Fresh(e) == e \notin accepted
Boxed(e) == Recipients
Supersedes(e2, r) == e2 \in Keyed /\ Has(e2, r)

Send(e) ==
  /\ \A r \in Recipients : count[e][r] < 2
  /\ IF Fresh(e)
       THEN /\ accepted' = accepted \cup {e}
            /\ count' = [x \in Events |-> [r \in Recipients |->
                 IF x = e /\ r \in Boxed(e) THEN count[x][r] + 1 ELSE count[x][r]]]
            /\ superseded' = IF e \in Keyed
                 THEN superseded \cup {p \in Pairs : p[1] # e /\ Supersedes(p[1], p[2])}
                 ELSE superseded
       ELSE UNCHANGED <<accepted, count, superseded>>
  /\ UNCHANGED <<resolved, units, nextId, status, tries, log, now, lastStrong, beat, beatSeen>>

(* ---- the recipient disposes of a notification ---- *)
Resolve(e, r, how) ==
  /\ Live(e, r)
  /\ resolved' = [resolved EXCEPT ![e][r] = how]
  /\ UNCHANGED <<accepted, count, superseded, units, nextId, status, tries, log, now,
                 lastStrong, beat, beatSeen>>

Restore(e, r) ==
  /\ Has(e, r)
  /\ resolved[e][r] # "none"
  /\ <<e, r>> \notin superseded
  /\ resolved' = [resolved EXCEPT ![e][r] = "none"]
  /\ UNCHANGED <<accepted, count, superseded, units, nextId, status, tries, log, now,
                 lastStrong, beat, beatSeen>>

(* ---- forming delivery units ---- *)
InSomeUnit(e, r) == \E u \in units : u.kind = "strong" /\ u.r = r /\ e \in u.members
Unbatched(r) == {e \in Events : e \in Strong /\ Live(e, r) /\ ~InSomeUnit(e, r)}
PacingOk(r) == lastStrong[r] < 0 \/ now >= lastStrong[r] + MinInterval

NewUnit(r, kind, members) ==
  [id |-> nextId, r |-> r, kind |-> kind, members |-> members, liveAt |-> LiveSet(r), at |-> now]

FormStrong(r) ==
  /\ nextId <= MaxUnits
  /\ Unbatched(r) # {}
  /\ PacingOk(r)
  /\ units' = units \cup {NewUnit(r, "strong", Unbatched(r))}
  /\ status' = [status EXCEPT ![nextId] = "new"]
  /\ nextId' = nextId + 1
  /\ lastStrong' = [lastStrong EXCEPT ![r] = now]
  /\ UNCHANGED <<accepted, count, resolved, superseded, tries, log, now, beat, beatSeen>>

Remindable(r) == LiveSet(r)
HasWork(r) == Remindable(r) # {}

FormBeat(r) ==
  /\ beat[r] < MaxBeats
  /\ nextId <= MaxUnits
  /\ HasWork(r)
  /\ units' = units \cup {NewUnit(r, "beat", Remindable(r))}
  /\ status' = [status EXCEPT ![nextId] = "new"]
  /\ nextId' = nextId + 1
  /\ beat' = [beat EXCEPT ![r] = @ + 1]
  /\ beatSeen' = [beatSeen EXCEPT ![r] = @ \cup Remindable(r)]
  /\ UNCHANGED <<accepted, count, resolved, superseded, tries, log, now, lastStrong>>

SkipBeat(r) ==
  /\ beat[r] < MaxBeats
  /\ ~HasWork(r)
  /\ beat' = [beat EXCEPT ![r] = @ + 1]
  /\ UNCHANGED <<accepted, count, resolved, superseded, units, nextId, status, tries, log,
                 now, lastStrong, beatSeen>>

(* ---- delivering a unit to the session intake ---- *)
SubOf(u, n) == u.id

(* got: the intake committed the input.  heard: its reply reached the notification core. *)
Deliver(u, got, heard) ==
  /\ status[u.id] \in {"new", "unknown"}
  /\ tries[u.id] < MaxTries
  /\ LET sub == SubOf(u, tries[u.id]) IN
       log' = IF got /\ ~(\E x \in log : x.sub = sub)
                THEN log \cup {[sub |-> sub, unit |-> u.id]}
                ELSE log
  /\ status' = [status EXCEPT ![u.id] = IF got /\ heard THEN "ok" ELSE "unknown"]
  /\ tries' = [tries EXCEPT ![u.id] = @ + 1]
  /\ UNCHANGED <<accepted, count, resolved, superseded, units, nextId, now, lastStrong,
                 beat, beatSeen>>

Tick ==
  /\ now < MaxTime
  /\ now' = now + 1
  /\ UNCHANGED <<accepted, count, resolved, superseded, units, nextId, status, tries, log,
                 lastStrong, beat, beatSeen>>

Init ==
  /\ accepted = {}
  /\ count = [e \in Events |-> [r \in Recipients |-> 0]]
  /\ resolved = [e \in Events |-> [r \in Recipients |-> "none"]]
  /\ superseded = {}
  /\ units = {}
  /\ nextId = 1
  /\ status = [i \in Ids |-> "none"]
  /\ tries = [i \in Ids |-> 0]
  /\ log = {}
  /\ now = 0
  /\ lastStrong = [r \in Recipients |-> -1]
  /\ beat = [r \in Recipients |-> 0]
  /\ beatSeen = [r \in Recipients |-> {}]

Next ==
  \/ \E e \in Events : Send(e)
  \/ \E e \in Events, r \in Recipients, how \in {"done", "dismissed"} : Resolve(e, r, how)
  \/ \E e \in Events, r \in Recipients : Restore(e, r)
  \/ \E r \in Recipients : FormStrong(r) \/ FormBeat(r) \/ SkipBeat(r)
  \/ \E u \in units, got \in BOOLEAN, heard \in BOOLEAN : Deliver(u, got, heard)
  \/ Tick

Spec == Init /\ [][Next]_vars

(* ---- invariants ---- *)
TypeOK ==
  /\ accepted \subseteq Events
  /\ count \in [Events -> [Recipients -> 0..2]]
  /\ resolved \in [Events -> [Recipients -> {"none", "done", "dismissed"}]]
  /\ superseded \subseteq Pairs
  /\ nextId \in 1..(MaxUnits + 1)
  /\ status \in [Ids -> {"none", "new", "ok", "unknown"}]
  /\ tries \in [Ids -> 0..MaxTries]
  /\ now \in 0..MaxTime
  /\ beat \in [Recipients -> 0..MaxBeats]

(* P1: one request identity gives one recipient at most one notification. *)
OneNotificationPerRecipient == \A e \in Events, r \in Recipients : count[e][r] <= 1

(* P2: an accepted send is already in every recipient's box. *)
AcceptedIsBoxed == \A e \in accepted, r \in Recipients : Has(e, r)

(* P3: for one recipient and one replace key, at most one notification is live. *)
OneLivePerKey == \A r \in Recipients : Cardinality({e \in Keyed : Live(e, r)}) <= 1

(* P4: a unit becomes at most one session input; a strong notification is in at most one unit. *)
OneInputPerUnit == \A u \in units : Cardinality({x \in log : x.unit = u.id}) <= 1
OneUnitPerStrong ==
  \A e \in Events, r \in Recipients :
    Cardinality({u \in units : u.kind = "strong" /\ u.r = r /\ e \in u.members}) <= 1

(* P5: a beat carries everything that was still live, not only what is new. *)
BeatCarriesAllLive == \A u \in units : u.kind = "beat" => u.members = u.liveAt

(* P6: an empty box makes no unit. *)
NoEmptyBeat == \A u \in units : u.members # {}

(* P7: two strong units of one recipient are at least the minimum interval apart. *)
StrongPaced ==
  \A u1 \in units, u2 \in units :
    (u1.kind = "strong" /\ u2.kind = "strong" /\ u1.r = u2.r /\ u1.id # u2.id)
      => (u1.at - u2.at >= MinInterval \/ u2.at - u1.at >= MinInterval)

(* A delivery recorded as done has its input in the session. *)
DeliveredIsReal == \A u \in units : status[u.id] = "ok" => \E x \in log : x.unit = u.id
=============================================================================

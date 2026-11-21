---------------------------- MODULE SessionFork ----------------------------
(* A session forked from another shares the prefix of its model view by reference.

   Each session has its own position axis segment: a forked session writes its entries above the
   position its fork point fixed, so a reference at or below that position names an entry of an
   ancestor, and one above it names an entry of the session itself. A view is kept per epoch: the
   rows a session wrote for that epoch, behind at most a few segments, each a range of rows that
   another session wrote for one of its epochs. Rows are appended and never removed; a compaction
   writes a new epoch.

   A fork takes two steps, as the dispatch does: the moment is fixed first (Mark), the session is
   created later (Create), and the source goes on in between.

   Not modelled: the content of a message, the validity of the prefix as a model request, work
   state, tenants, access, the archive of a session. Safety only. *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Sessions, Root, None, MaxPos, MaxEpoch, MaxDepth

VARIABLES made, marked, base, tail, ep, rows, segs, depth, seen, last

vars == <<made, marked, base, tail, ep, rows, segs, depth, seen, last>>

Epochs == 0..MaxEpoch

RECURSIVE Flat(_, _)
(* The rows a list of segments stands for. *)
Flat(list, r) ==
  IF list = <<>> THEN <<>>
  ELSE LET g == Head(list) IN SubSeq(r[g.src][g.ep], g.from, g.to) \o Flat(Tail(list), r)

View(s, e) == Flat(segs[s][e], rows) \o rows[s][e]

RECURSIVE Cut(_, _, _)
(* The first n rows of a list of segments, as segments. *)
Cut(list, n, r) ==
  IF n = 0 \/ list = <<>> THEN <<>>
  ELSE LET g == Head(list)
           size == g.to - g.from + 1
       IN IF n >= size THEN <<g>> \o Cut(Tail(list), n - size, r)
          ELSE <<[g EXCEPT !.to = g.from + n - 1]>>

RECURSIVE Size(_)
Size(list) == IF list = <<>> THEN 0 ELSE Head(list).to - Head(list).from + 1 + Size(Tail(list))

(* The segments that stand for the first n rows of the view of p in epoch e: the segments p
   inherited, cut to n, and then one segment into the rows p wrote itself. *)
PrefixSegments(p, e, n) ==
  LET inherited == Size(segs[p][e]) IN
  IF n <= inherited THEN Cut(segs[p][e], n, rows)
  ELSE segs[p][e] \o <<[src |-> p, ep |-> e, from |-> 1, to |-> n - inherited]>>

Changed(r, t, g) == {s \in Sessions : r[s] # rows[s] \/ t[s] # tail[s] \/ g[s] # segs[s]}

Init ==
  /\ made = {Root}
  /\ marked = {}
  /\ base = [s \in Sessions |-> [src |-> None, at |-> 0]]
  /\ tail = [s \in Sessions |-> 0]
  /\ ep = [s \in Sessions |-> 0]
  /\ rows = [s \in Sessions |-> [e \in Epochs |-> <<>>]]
  /\ segs = [s \in Sessions |-> [e \in Epochs |-> <<>>]]
  /\ depth = [s \in Sessions |-> 0]
  /\ seen = [s \in Sessions |-> <<>>]
  /\ last = [actor |-> Root, changed |-> {}]

(* A message of s: one entry on its axis, one row of its current epoch. *)
Say(s) ==
  /\ s \in made /\ tail[s] < MaxPos
  /\ LET r == [rows EXCEPT ![s][ep[s]] = Append(@, [pos |-> tail[s] + 1, by |-> s, sum |-> FALSE])]
         t == [tail EXCEPT ![s] = @ + 1]
     IN /\ rows' = r /\ tail' = t
        /\ last' = [actor |-> s, changed |-> Changed(r, t, segs)]
  /\ UNCHANGED <<made, marked, base, ep, segs, depth, seen>>

(* An entry of s that is no message. *)
Note(s) ==
  /\ s \in made /\ tail[s] < MaxPos
  /\ LET t == [tail EXCEPT ![s] = @ + 1]
     IN /\ tail' = t /\ last' = [actor |-> s, changed |-> Changed(rows, t, segs)]
  /\ UNCHANGED <<made, marked, base, ep, rows, segs, depth, seen>>

(* A compaction of s that covers the first `cut` rows and keeps the rows in `keep`: a new epoch,
   written whole under s. The rows of the epoch before it stay. *)
Compact(s, cut, keep) ==
  /\ s \in made /\ ep[s] < MaxEpoch /\ tail[s] < MaxPos
  /\ LET v == View(s, ep[s])
         kept == SelectSeq(SubSeq(v, 1, cut), LAMBDA row : row.pos \in keep)
         summary == [pos |-> tail[s] + 1, by |-> s, sum |-> TRUE]
         next == kept \o <<summary>> \o SubSeq(v, cut + 1, Len(v))
         r == [rows EXCEPT ![s][ep[s] + 1] = next]
         t == [tail EXCEPT ![s] = @ + 1]
     IN /\ cut \in 1..Len(v)
        /\ keep \subseteq {v[i].pos : i \in 1..cut} /\ Cardinality(keep) <= 1
        /\ rows' = r /\ tail' = t
        /\ last' = [actor |-> s, changed |-> Changed(r, t, segs)]
  /\ ep' = [ep EXCEPT ![s] = @ + 1]
  /\ UNCHANGED <<made, marked, base, segs, depth, seen>>

(* The moment of a fork is fixed: the first n rows of the current view of p, and the tail of p. *)
Mark(p, c, n) ==
  /\ p \in made /\ c \notin made /\ c \notin marked /\ depth[p] < MaxDepth
  /\ n \in 1..Len(View(p, ep[p]))
  /\ marked' = marked \cup {c}
  /\ base' = [base EXCEPT ![c] = [src |-> p, at |-> tail[p]]]
  /\ segs' = [segs EXCEPT ![c][0] = PrefixSegments(p, ep[p], n)]
  /\ seen' = [seen EXCEPT ![c] = SubSeq(View(p, ep[p]), 1, n)]
  /\ depth' = [depth EXCEPT ![c] = depth[p] + 1]
  /\ rows' = rows
  /\ tail' = tail
  /\ last' = [actor |-> c, changed |-> Changed(rows', tail', segs')]
  /\ UNCHANGED <<made, ep>>

(* The forked session is created: its axis starts above the position of the moment, and it
   writes no row for the prefix. *)
Create(c) ==
  /\ c \in marked /\ c \notin made
  /\ made' = made \cup {c}
  /\ LET t == [tail EXCEPT ![c] = base[c].at]
     IN /\ tail' = t /\ last' = [actor |-> c, changed |-> Changed(rows, t, segs)]
  /\ UNCHANGED <<marked, base, ep, rows, segs, depth, seen>>

(* The bound of the model is reached: nothing more is written. *)
Full == \A s \in made : tail[s] = MaxPos

Next ==
  \/ \E s \in Sessions : (Say(s) \/ Note(s))
  \/ \E s \in Sessions, cut \in 1..MaxPos, keep \in SUBSET (1..MaxPos) : Compact(s, cut, keep)
  \/ \E p, c \in Sessions, n \in 1..MaxPos : Mark(p, c, n)
  \/ \E c \in Sessions : Create(c)
  \/ (Full /\ UNCHANGED vars)

Spec == Init /\ [][Next]_vars

Forked == {c \in made : base[c].src # None}

(* F-1: the prefix a forked session started from is what its first epoch still shows. *)
PrefixStable ==
  \A c \in Forked :
    /\ Len(View(c, 0)) >= Len(seen[c])
    /\ SubSeq(View(c, 0), 1, Len(seen[c])) = seen[c]

(* F-2: in the epoch a session was forked into, every row it wrote is its own. *)
InheritedByReference ==
  \A c \in Forked : \A i \in 1..Len(rows[c][0]) : rows[c][0][i].by = c

(* F-3, F-9: one action changes the rows, the tail and the segments of its actor only. *)
OneWriter == last.changed \subseteq {last.actor}

(* F-8: a segment names rows that are there. *)
SegmentsLive ==
  \A s \in Sessions, e \in Epochs : \A i \in 1..Len(segs[s][e]) :
    LET g == segs[s][e][i] IN g.from >= 1 /\ g.to <= Len(rows[g.src][g.ep])

(* A reference in a view names one entry: the positions of a view are distinct, and a position is
   at or below the position of the fork exactly when the entry is of an ancestor. *)
RefsNameOneEntry ==
  \A s \in made : \A e \in 0..ep[s] :
    LET v == View(s, e) IN
    /\ \A i, j \in 1..Len(v) : i # j => v[i].pos # v[j].pos
    /\ \A i \in 1..Len(v) : (v[i].pos <= base[s].at) <=> (v[i].by # s)

(* F-11: the segments of a forked session are as many as its depth at most. *)
ChainBounded == \A c \in Forked : Len(segs[c][0]) <= depth[c]

Fits == \A s \in Sessions : tail[s] <= MaxPos
=============================================================================

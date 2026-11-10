--------------------------- MODULE PublishedCount ---------------------------
(* The publication count of the Agent records of one session (RT-06). The storage
   applies a publication only when the count it names is the count the storage
   has, and the publication then moves the count by one. The keeper holds the
   count this process knows: the answer of the last root read, or of the last
   publication of this process that committed. A caller takes the count from the
   keeper without a read while the storage confirmed it at most MaxAge ticks
   ago. Other writers are publications of other processes. *)
EXTENDS Naturals

CONSTANTS MaxCount,      \* bound of the count
          MaxAge,        \* ticks a known count answers without a confirmation by the storage
          AssumeApplied, \* negative control: after an unknown outcome the keeper takes the next count
          NeverRead      \* negative control: the keeper never asks the storage again, whatever the age

VARIABLES store,    \* the count in the storage
          known,    \* the count the keeper knows; None when it knows nothing
          pending,  \* a publication of this process in flight: the count it names; None when none
          age,      \* ticks since the storage confirmed `known`
          taken,    \* the count the last caller took, and its age then
          applied,  \* the count the last committed publication of this process named, and the count the storage had
          clock

None == MaxCount + 1
vars == <<store, known, pending, age, taken, applied, clock>>

Init == /\ store = 0 /\ known = None /\ pending = None /\ age = 0
        /\ taken = <<None, 0>> /\ applied = <<0, 0>> /\ clock = 0

Tick == /\ clock < MaxAge + 2
        /\ clock' = clock + 1 /\ age' = age + 1
        /\ UNCHANGED <<store, known, pending, taken, applied>>

(* A publication of another process. *)
OtherPublish == /\ store < MaxCount /\ store' = store + 1
                /\ UNCHANGED <<known, pending, age, taken, applied, clock>>

(* A root read: when nothing is known, or the known count is past its age. *)
ReadRoot == /\ pending = None
            /\ known = None \/ (age > MaxAge /\ ~NeverRead)
            /\ known' = store /\ age' = 0
            /\ UNCHANGED <<store, pending, taken, applied, clock>>

(* A caller takes the known count without a read. *)
Take == /\ known # None /\ pending = None /\ (age <= MaxAge \/ NeverRead)
        /\ taken' = <<known, age>>
        /\ UNCHANGED <<store, known, pending, age, applied, clock>>

(* A publication of this process, decided on the known count. A refused one tells that the
   known count is stale; the keeper then knows nothing, so the next caller reads the root. *)
Send == /\ known # None /\ pending = None /\ known < MaxCount
        /\ pending' = known
        /\ UNCHANGED <<store, known, age, taken, applied, clock>>

Committed == /\ pending # None /\ pending = store
             /\ store' = store + 1 /\ known' = store + 1 /\ age' = 0
             /\ applied' = <<pending, store>> /\ pending' = None
             /\ UNCHANGED <<taken, clock>>

Refused == /\ pending # None /\ pending # store
           /\ known' = None
           /\ pending' = None
           /\ UNCHANGED <<store, age, taken, applied, clock>>

Unknown == /\ pending # None
           /\ \/ (pending = store /\ store' = store + 1)
              \/ store' = store
           /\ known' = IF AssumeApplied THEN pending + 1 ELSE None
           /\ pending' = None
           /\ UNCHANGED <<age, taken, applied, clock>>

Next == Tick \/ OtherPublish \/ ReadRoot \/ Take \/ Send \/ Committed \/ Refused \/ Unknown
Spec == Init /\ [][Next]_vars

(* The known count is a count the storage had: it never runs ahead of the storage. *)
KnownIsPast == known # None => known <= store

(* A count that a caller took was confirmed at most MaxAge ticks before. *)
TakenIsBoundedStale == taken[1] # None => taken[2] <= MaxAge

(* A publication of this process commits only on the count the storage has. *)
PublishedOnCurrent == applied[1] = applied[2]

=============================================================================

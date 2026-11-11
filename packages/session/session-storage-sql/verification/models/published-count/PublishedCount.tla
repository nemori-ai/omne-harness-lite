--------------------------- MODULE PublishedCount ---------------------------
(* The publication count of the Agent records of one session (RT-06). The storage
   applies a publication only when the count it names is the count the storage
   has, and the publication then moves the count by one. The keeper holds the
   count this process knows: the answer of the last root read, or of the last
   publication of this process that committed. A caller takes the count from the
   keeper without a read. One process writes a database, so no publication goes
   past the keeper; a publication of another process stays in the model as a
   fault of the environment, to show that a publication still commits only on
   the count the storage has. *)
EXTENDS Naturals

CONSTANTS MaxCount,      \* bound of the count
          AssumeApplied  \* negative control: after an unknown outcome the keeper takes the next count

VARIABLES store,    \* the count in the storage
          known,    \* the count the keeper knows; None when it knows nothing
          pending,  \* a publication of this process in flight: the count it names; None when none
          taken,    \* the count the last caller took
          applied   \* the count the last committed publication of this process named, and the count the storage had

None == MaxCount + 1
vars == <<store, known, pending, taken, applied>>

Init == /\ store = 0 /\ known = None /\ pending = None
        /\ taken = None /\ applied = <<0, 0>>

(* A publication of another process: a fault of the environment. *)
OtherPublish == /\ store < MaxCount /\ store' = store + 1
                /\ UNCHANGED <<known, pending, taken, applied>>

(* A root read: when nothing is known. *)
ReadRoot == /\ pending = None /\ known = None
            /\ known' = store
            /\ UNCHANGED <<store, pending, taken, applied>>

(* A caller takes the known count without a read. *)
Take == /\ known # None /\ pending = None
        /\ taken' = known
        /\ UNCHANGED <<store, known, pending, applied>>

(* A publication of this process, decided on the known count. A refused one tells that the
   known count is stale; the keeper then knows nothing, so the next caller reads the root. *)
Send == /\ known # None /\ pending = None /\ known < MaxCount
        /\ pending' = known
        /\ UNCHANGED <<store, known, taken, applied>>

Committed == /\ pending # None /\ pending = store
             /\ store' = store + 1 /\ known' = store + 1
             /\ applied' = <<pending, store>> /\ pending' = None
             /\ UNCHANGED taken

Refused == /\ pending # None /\ pending # store
           /\ known' = None
           /\ pending' = None
           /\ UNCHANGED <<store, taken, applied>>

Unknown == /\ pending # None
           /\ \/ (pending = store /\ store' = store + 1)
              \/ store' = store
           /\ known' = IF AssumeApplied THEN pending + 1 ELSE None
           /\ pending' = None
           /\ UNCHANGED <<taken, applied>>

Next == OtherPublish \/ ReadRoot \/ Take \/ Send \/ Committed \/ Refused \/ Unknown
Spec == Init /\ [][Next]_vars

(* The known count is a count the storage had: it never runs ahead of the storage. *)
KnownIsPast == known # None => known <= store

(* A count that a caller took is a count the storage had. *)
TakenIsPast == taken # None => taken <= store

(* A publication of this process commits only on the count the storage has. *)
PublishedOnCurrent == applied[1] = applied[2]

=============================================================================

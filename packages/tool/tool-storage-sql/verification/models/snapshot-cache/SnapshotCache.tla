---------------------------- MODULE SnapshotCache ----------------------------
(* One ledger domain in a store with conditional commits. The keeper is the
   entry of every commit of one process; other writers are other processes.
   The keeper holds the snapshot of its last read or commit. A write is decided
   on that snapshot without a read, and the store applies the write only at the
   revision the snapshot has. A read answers from the snapshot. So a read is an
   observation: it is a content the domain had. Every commit of the process goes
   through the keeper, and one process writes the database, so the snapshot is
   the content of the store; the model still lets another writer commit, to show
   that no deed depends on that. A deed that cannot be undone is done only after
   a conditional commit that was decided on the same snapshot. The answer that something is absent is not an observation:
   the store gives it.

   The store content is abstracted to the sequence of writes applied so far:
   the content at a revision is a function of that sequence. *)
EXTENDS Naturals, Sequences

CONSTANTS MaxRev,        \* bound of the domain revision
          AssumeApplied, \* negative control: after an unknown commit answer, advance the snapshot as if applied
          ActOnRead,     \* negative control: a deed is done on what a pure read answered, without a commit
          AbsentFromSnapshot \* negative control: the answer "absent" comes from the snapshot

VARIABLES store,      \* the writes applied, in order; Len(store) is the domain revision
          cache,      \* the snapshot of the caching writer: a sequence of writes, or <<"none">>
          pending,    \* a commit of the caching writer in flight: [exp, write] or <<>>
          answered,   \* the content the last pure read answered
          deed,       \* the content the last deed was decided on, and the store content it met
          absent      \* the content the last answer "absent" was read from, and the store content then

vars == <<store, cache, pending, answered, deed, absent>>
None == <<"none">>
Rev(s) == Len(s)

Init == /\ store = <<>> /\ cache = None /\ pending = <<>>
        /\ answered = None /\ deed = None /\ absent = None

(* A writer that does not go through the keeper commits. The storage rules this out; the
   model keeps it to show that the safety of a deed does not depend on it. *)
OtherCommit == /\ Rev(store) < MaxRev
               /\ store' = Append(store, "other")
               /\ UNCHANGED <<cache, pending, answered, deed, absent>>

(* The caching writer reads the whole domain: only when it has no snapshot. *)
FullRead == /\ cache = None /\ pending = <<>>
            /\ cache' = store
            /\ UNCHANGED <<store, pending, answered, deed, absent>>

(* It decides a write on its snapshot and sends the commit; no read. *)
Send == /\ cache # None /\ pending = <<>> /\ Rev(cache) < MaxRev
        /\ pending' = <<Rev(cache), "mine">>
        /\ UNCHANGED <<store, cache, answered, deed, absent>>

(* The store answers committed: the snapshot advances by the same write, and the
   deed the write was the fence of is done. It was decided on `cache`. *)
Committed == /\ pending # <<>> /\ pending[1] = Rev(store)
             /\ store' = Append(store, pending[2])
             /\ cache' = Append(cache, pending[2])
             /\ pending' = <<>>
             /\ deed' = <<cache, store>>
             /\ UNCHANGED <<answered, absent>>

(* The store answers conflict: the snapshot is stale and is dropped. *)
Conflict == /\ pending # <<>> /\ pending[1] # Rev(store)
            /\ cache' = None /\ pending' = <<>>
            /\ UNCHANGED <<store, answered, deed, absent>>

(* The answer is lost. The write may or may not have been applied. *)
Unknown == /\ pending # <<>>
           /\ \/ /\ pending[1] = Rev(store)
                 /\ store' = Append(store, pending[2])
              \/ store' = store
           /\ cache' = IF AssumeApplied THEN Append(cache, pending[2]) ELSE None
           /\ pending' = <<>>
           /\ UNCHANGED <<answered, deed, absent>>

(* A pure read answers the snapshot as it is. *)
PureRead == /\ cache # None /\ pending = <<>>
            /\ answered' = cache
            /\ UNCHANGED <<store, cache, pending, deed, absent>>

(* The answer that a record is absent, or that the domain holds nothing. The store gives it,
   and its revision confirms or replaces the snapshot. *)
AbsentRead == /\ cache # None /\ pending = <<>>
              /\ IF AbsentFromSnapshot
                   THEN /\ absent' = <<cache, store>> /\ UNCHANGED cache
                   ELSE /\ absent' = <<store, store>> /\ cache' = store
              /\ UNCHANGED <<store, pending, answered, deed>>

(* Negative control only: a deed done on what a pure read answered. *)
DeedOnRead == /\ ActOnRead /\ answered # None
              /\ deed' = <<answered, store>>
              /\ UNCHANGED <<store, cache, pending, answered, absent>>

Next == \/ OtherCommit \/ FullRead \/ Send \/ Committed \/ Conflict \/ Unknown
        \/ PureRead \/ AbsentRead \/ DeedOnRead
Spec == Init /\ [][Next]_vars

(* A snapshot at the revision of the store is the content of the store. *)
SnapshotIsStoreAtItsRevision ==
  (cache # None /\ Rev(cache) = Rev(store)) => cache = store

(* A snapshot is always a content the store had: a prefix of what it has now. *)
SnapshotIsAPastContent ==
  cache # None => (Rev(cache) <= Rev(store) /\ cache = SubSeq(store, 1, Rev(cache)))

(* A pure read answers a content the store had. *)
ReadIsAPastContent ==
  answered # None => (Rev(answered) <= Rev(store) /\ answered = SubSeq(store, 1, Rev(answered)))

(* A deed is done only on the content the store had when its commit was applied. *)
DeedOnCurrentContent == deed # None => deed[1] = deed[2]

(* The answer "absent" is read from the content the store has at that moment. *)
AbsenceIsCurrent == absent # None => absent[1] = absent[2]
=============================================================================

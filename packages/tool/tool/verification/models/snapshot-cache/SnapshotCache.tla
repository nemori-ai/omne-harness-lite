---------------------------- MODULE SnapshotCache ----------------------------
(* One ledger domain in a store with conditional commits, written by a caching
   writer and by any number of other writers. The caching writer keeps the
   snapshot of its last read or commit. It decides a write on that snapshot
   without reading, and the store applies the write only at the revision the
   snapshot has. A pure read first asks the store for the revision of the
   domain and answers from the snapshot only when it is that revision.

   The store content is abstracted to the sequence of writes applied so far:
   the content at a revision is a function of that sequence. *)
EXTENDS Naturals, Sequences

CONSTANTS MaxRev,        \* bound of the domain revision
          AssumeApplied, \* negative control: after an unknown commit answer, advance the snapshot as if applied
          SkipCheck      \* negative control: a pure read answers from the snapshot without the revision check

VARIABLES store,      \* the writes applied, in order; Len(store) is the domain revision
          cache,      \* the snapshot of the caching writer: a sequence of writes, or <<"none">>
          pending,    \* a commit of the caching writer in flight: [exp, write] or <<>>
          answered,   \* the content the last pure read answered
          asked       \* the store content when that pure read asked the store

vars == <<store, cache, pending, answered, asked>>
None == <<"none">>
Rev(s) == Len(s)

Init == /\ store = <<>> /\ cache = None /\ pending = <<>>
        /\ answered = None /\ asked = None

(* Another writer commits. It needs no snapshot of ours. *)
OtherCommit == /\ Rev(store) < MaxRev
               /\ store' = Append(store, "other")
               /\ UNCHANGED <<cache, pending, answered, asked>>

(* The caching writer reads the whole domain: only when it has no snapshot. *)
FullRead == /\ cache = None /\ pending = <<>>
            /\ cache' = store
            /\ UNCHANGED <<store, pending, answered, asked>>

(* It decides a write on its snapshot and sends the commit; no read. *)
Send == /\ cache # None /\ pending = <<>> /\ Rev(cache) < MaxRev
        /\ pending' = <<Rev(cache), "mine">>
        /\ UNCHANGED <<store, cache, answered, asked>>

(* The store answers committed: the snapshot advances by the same write. *)
Committed == /\ pending # <<>> /\ pending[1] = Rev(store)
             /\ store' = Append(store, pending[2])
             /\ cache' = Append(cache, pending[2])
             /\ pending' = <<>>
             /\ UNCHANGED <<answered, asked>>

(* The store answers conflict: the snapshot is stale and is dropped. *)
Conflict == /\ pending # <<>> /\ pending[1] # Rev(store)
            /\ cache' = None /\ pending' = <<>>
            /\ UNCHANGED <<store, answered, asked>>

(* The answer is lost. The write may or may not have been applied. *)
Unknown == /\ pending # <<>>
           /\ \/ /\ pending[1] = Rev(store)
                 /\ store' = Append(store, pending[2])
              \/ store' = store
           /\ cache' = IF AssumeApplied THEN Append(cache, pending[2]) ELSE None
           /\ pending' = <<>>
           /\ UNCHANGED <<answered, asked>>

(* A pure read: one question to the store for the revision, then the snapshot. *)
PureRead == /\ cache # None /\ pending = <<>>
            /\ asked' = store
            /\ IF SkipCheck \/ Rev(cache) = Rev(store)
                 THEN answered' = cache /\ cache' = cache
                 ELSE answered' = store /\ cache' = store
            /\ UNCHANGED <<store, pending>>

Next == OtherCommit \/ FullRead \/ Send \/ Committed \/ Conflict \/ Unknown \/ PureRead
Spec == Init /\ [][Next]_vars

(* A snapshot at the revision of the store is the content of the store. *)
SnapshotIsStoreAtItsRevision ==
  (cache # None /\ Rev(cache) = Rev(store)) => cache = store

(* A snapshot is always a content the store had: a prefix of what it has now. *)
SnapshotIsAPastContent ==
  cache # None => (Rev(cache) <= Rev(store) /\ cache = SubSeq(store, 1, Rev(cache)))

(* A pure read answers the content the store had when the read asked it. *)
PureReadIsFresh == answered # None => answered = asked
=============================================================================

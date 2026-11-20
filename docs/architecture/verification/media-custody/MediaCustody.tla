---------------------------- MODULE MediaCustody ----------------------------
(* Custody of media bytes across three parties: the byte store, the metadata store and one
   consumer that cites a reference in its own log (the session intake).

   An object is created by an upload. The metadata row exists before the first byte and after
   the last one, so bytes are never without a row. A reference is handed out only after the
   bytes are durable. A consumer holds an object first and writes its log afterwards. The
   sweeper removes only expired objects that nobody holds, and removes the bytes before the row.

   Bugs names one defect at a time; each bad-*.cfg must end in a violation. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Obj, Tenants, Digests, Slots, MaxCrashes, Bugs

Bug(b) == b \in Bugs
Inputs == Tenants \X Slots
TenantOf(i) == i[1]
None == "none"

VARIABLES
  state,     \* per object: free | uploading | staged | held | deleting | gone (metadata row)
  tenant,    \* per object: the tenant that began the upload
  digest,    \* per object: the digest of the bytes being uploaded
  bytes,     \* per object: none | partial | durable (byte store)
  due,       \* per object: the staging period has run out
  claims,    \* <<object, input>>: the consumer's holds
  handed,    \* <<tenant, object>>: references returned to a tenant
  log,       \* <<input, object>>: the consumer's committed log entries that cite an object
  pc,        \* per input: idle | held | committed | refused | late
  cited,     \* per input: the object it cites
  sweepPick, \* the object a defective sweeper read as expired and has not acted on yet
  crashes

vars == <<state, tenant, digest, bytes, due, claims, handed, log, pc, cited, sweepPick, crashes>>

States == {"free", "uploading", "staged", "held", "deleting", "gone"}
Live == {"staged", "held"}

TypeOK ==
  /\ state \in [Obj -> States]
  /\ tenant \in [Obj -> Tenants \cup {None}]
  /\ digest \in [Obj -> Digests \cup {None}]
  /\ bytes \in [Obj -> {"none", "partial", "durable"}]
  /\ due \in [Obj -> BOOLEAN]
  /\ claims \subseteq Obj \X Inputs
  /\ handed \subseteq Tenants \X Obj
  /\ log \subseteq Inputs \X Obj
  /\ pc \in [Inputs -> {"idle", "held", "committed", "refused", "late"}]
  /\ cited \in [Inputs -> Obj \cup {None}]
  /\ sweepPick \in Obj \cup {None}
  /\ crashes \in 0..MaxCrashes

Init ==
  /\ state = [o \in Obj |-> "free"]
  /\ tenant = [o \in Obj |-> None]
  /\ digest = [o \in Obj |-> None]
  /\ bytes = [o \in Obj |-> "none"]
  /\ due = [o \in Obj |-> FALSE]
  /\ claims = {} /\ handed = {} /\ log = {}
  /\ pc = [i \in Inputs |-> "idle"]
  /\ cited = [i \in Inputs |-> None]
  /\ sweepPick = None
  /\ crashes = 0

(* --- upload ----------------------------------------------------------------- *)

\* The row is written first: from here on the bytes of o are covered by a row.
Begin(t, o, d) ==
  /\ state[o] = "free"
  /\ state' = [state EXCEPT ![o] = "uploading"]
  /\ tenant' = [tenant EXCEPT ![o] = t]
  /\ digest' = [digest EXCEPT ![o] = d]
  /\ UNCHANGED <<bytes, due, claims, handed, log, pc, cited, sweepPick, crashes>>

WritePart(o) ==
  /\ state[o] = "uploading" /\ bytes[o] = "none"
  /\ bytes' = [bytes EXCEPT ![o] = "partial"]
  /\ UNCHANGED <<state, tenant, digest, due, claims, handed, log, pc, cited, sweepPick, crashes>>

\* The store confirms the whole object durable.
Seal(o) ==
  /\ state[o] = "uploading" /\ bytes[o] = "partial"
  /\ bytes' = [bytes EXCEPT ![o] = "durable"]
  /\ UNCHANGED <<state, tenant, digest, due, claims, handed, log, pc, cited, sweepPick, crashes>>

\* One metadata transaction: an object of the same tenant with the same digest answers for
\* this upload, otherwise this object becomes staged. Only then a reference leaves.
Commit(o) ==
  /\ state[o] = "uploading"
  /\ bytes[o] = "durable" \/ Bug("ref-before-durable")
  /\ LET t == tenant[o]
         twins == {p \in Obj \ {o} :
                     /\ digest[p] = digest[o] /\ state[p] \in Live
                     /\ tenant[p] = t \/ Bug("dedupe-across-tenants")}
     IN IF twins # {}
        THEN \E p \in twins :
               /\ state' = [state EXCEPT ![o] = "deleting"]
               /\ handed' = handed \cup {<<t, p>>}
               /\ due' = [due EXCEPT ![p] = FALSE]
        ELSE /\ state' = [state EXCEPT ![o] = "staged"]
             /\ handed' = handed \cup {<<t, o>>}
             /\ due' = due
  /\ UNCHANGED <<tenant, digest, bytes, claims, log, pc, cited, sweepPick, crashes>>

\* An upload that is given up or runs out of time.
Abandon(o) ==
  /\ state[o] = "uploading"
  /\ state' = [state EXCEPT ![o] = "deleting"]
  /\ UNCHANGED <<tenant, digest, bytes, due, claims, handed, log, pc, cited, sweepPick, crashes>>

(* --- staging period and sweep ----------------------------------------------- *)

Expire(o) ==
  /\ state[o] = "staged" /\ ~due[o]
  /\ due' = [due EXCEPT ![o] = TRUE]
  /\ UNCHANGED <<state, tenant, digest, bytes, claims, handed, log, pc, cited, sweepPick, crashes>>

\* One conditional metadata write: still staged and still due.
SweepMark(o) ==
  /\ ~Bug("sweep-check-then-act")
  /\ state[o] = "staged" /\ due[o]
  /\ state' = [state EXCEPT ![o] = "deleting"]
  /\ UNCHANGED <<tenant, digest, bytes, due, claims, handed, log, pc, cited, sweepPick, crashes>>

\* The defect: read, then act without looking again.
SweepPick(o) ==
  /\ Bug("sweep-check-then-act") /\ sweepPick = None
  /\ state[o] = "staged" /\ due[o]
  /\ sweepPick' = o
  /\ UNCHANGED <<state, tenant, digest, bytes, due, claims, handed, log, pc, cited, crashes>>

SweepAct ==
  /\ sweepPick # None
  /\ state' = [state EXCEPT ![sweepPick] = "deleting"]
  /\ sweepPick' = None
  /\ UNCHANGED <<tenant, digest, bytes, due, claims, handed, log, pc, cited, crashes>>

\* Bytes go first, the row last: a crash in between leaves a row that says "deleting".
PurgeBytes(o) ==
  /\ state[o] = "deleting" /\ bytes[o] # "none"
  /\ bytes' = [bytes EXCEPT ![o] = "none"]
  /\ UNCHANGED <<state, tenant, digest, due, claims, handed, log, pc, cited, sweepPick, crashes>>

PurgeRow(o) ==
  /\ state[o] = "deleting"
  /\ bytes[o] = "none" \/ Bug("row-delete-first")
  /\ state' = [state EXCEPT ![o] = "gone"]
  /\ UNCHANGED <<tenant, digest, bytes, due, claims, handed, log, pc, cited, sweepPick, crashes>>

(* --- the consumer: hold first, write the log afterwards ----------------------- *)

\* The consumer may cite any object, also one it was never handed. The hold is one conditional
\* metadata write that checks the tenant and the state.
Hold(i, o) ==
  /\ ~Bug("log-before-hold")
  /\ pc[i] = "idle"
  /\ cited[i] \in {None, o}
  /\ IF /\ state[o] \in Live
        /\ tenant[o] = TenantOf(i) \/ Bug("hold-skips-tenant")
     THEN /\ state' = [state EXCEPT ![o] = "held"]
          /\ claims' = claims \cup {<<o, i>>}
          /\ pc' = [pc EXCEPT ![i] = "held"]
          /\ cited' = [cited EXCEPT ![i] = o]
     ELSE /\ pc' = [pc EXCEPT ![i] = "refused"]
          /\ UNCHANGED <<state, claims, cited>>
  /\ UNCHANGED <<tenant, digest, bytes, due, handed, log, sweepPick, crashes>>

LogCommit(i) ==
  /\ pc[i] = "held"
  /\ log' = log \cup {<<i, cited[i]>>}
  /\ pc' = [pc EXCEPT ![i] = "committed"]
  /\ UNCHANGED <<state, tenant, digest, bytes, due, claims, handed, cited, sweepPick, crashes>>

\* The request is lost between the hold and the log write; the same input comes again.
Retry(i) ==
  /\ pc[i] = "held"
  /\ pc' = [pc EXCEPT ![i] = "idle"]
  /\ UNCHANGED <<state, tenant, digest, bytes, due, claims, handed, log, cited, sweepPick, crashes>>

\* The defect: the log is written on a mere look, the hold comes later.
LogEarly(i, o) ==
  /\ Bug("log-before-hold")
  /\ pc[i] = "idle"
  /\ state[o] = "staged" /\ tenant[o] = TenantOf(i)
  /\ log' = log \cup {<<i, o>>}
  /\ pc' = [pc EXCEPT ![i] = "late"]
  /\ cited' = [cited EXCEPT ![i] = o]
  /\ UNCHANGED <<state, tenant, digest, bytes, due, claims, handed, sweepPick, crashes>>

HoldLate(i) ==
  /\ pc[i] = "late" /\ state[cited[i]] = "staged"
  /\ state' = [state EXCEPT ![cited[i]] = "held"]
  /\ claims' = claims \cup {<<cited[i], i>>}
  /\ pc' = [pc EXCEPT ![i] = "committed"]
  /\ UNCHANGED <<tenant, digest, bytes, due, handed, log, cited, sweepPick, crashes>>

(* --- process crash ----------------------------------------------------------- *)

\* Rows, bytes, claims and the log are durable. Requests in flight and the sweeper's read are not.
Crash ==
  /\ crashes < MaxCrashes
  /\ crashes' = crashes + 1
  /\ sweepPick' = None
  /\ pc' = [i \in Inputs |-> IF pc[i] = "held" THEN "idle" ELSE pc[i]]
  /\ UNCHANGED <<state, tenant, digest, bytes, due, claims, handed, log, cited>>

Next ==
  \/ \E t \in Tenants, o \in Obj, d \in Digests : Begin(t, o, d)
  \/ \E o \in Obj : WritePart(o) \/ Seal(o) \/ Commit(o) \/ Abandon(o) \/ Expire(o)
  \/ \E o \in Obj : SweepMark(o) \/ SweepPick(o) \/ PurgeBytes(o) \/ PurgeRow(o)
  \/ SweepAct
  \/ \E i \in Inputs, o \in Obj : Hold(i, o) \/ LogEarly(i, o)
  \/ \E i \in Inputs : LogCommit(i) \/ Retry(i) \/ HoldLate(i)
  \/ Crash

Spec == Init /\ [][Next]_vars

Fairness == \A o \in Obj : WF_vars(PurgeBytes(o)) /\ WF_vars(PurgeRow(o))
LiveSpec == Spec /\ Fairness

(* --- properties -------------------------------------------------------------- *)

\* A cited object is held, its bytes are durable, and it belongs to the citing tenant.
LogRefsResolve ==
  \A e \in log : /\ state[e[2]] = "held"
                 /\ bytes[e[2]] = "durable"
                 /\ tenant[e[2]] = TenantOf(e[1])

\* A reference exists only for durable bytes.
LiveIsDurable == \A o \in Obj : state[o] \in Live => bytes[o] = "durable"

\* Bytes are never without a metadata row.
BytesHaveRow == \A o \in Obj : bytes[o] # "none" => state[o] \notin {"free", "gone"}

\* A tenant is handed only its own objects.
HandedOwn == \A h \in handed : tenant[h[2]] = h[1]

ClaimsOnHeld == \A c \in claims : state[c[1]] = "held"

\* One live object per tenant and digest.
OneLivePerDigest ==
  \A o, p \in Obj :
    (o # p /\ state[o] \in Live /\ state[p] \in Live /\ tenant[o] = tenant[p])
      => digest[o] # digest[p]

\* A held object stays held: this run never releases a hold.
HeldStays == [][\A o \in Obj : state[o] = "held" => state'[o] = "held"]_vars

\* An object marked for deletion is removed, also across crashes.
PurgeCompletes == \A o \in Obj : (state[o] = "deleting") ~> (state[o] = "gone")
=============================================================================

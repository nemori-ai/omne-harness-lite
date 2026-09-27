----------------------------- MODULE SessionLog -----------------------------
(***************************************************************************)
(* capability.session-log v1 -- dedupe keys and the attempt fence of one   *)
(* session log, under concurrent appenders and provider crashes.           *)
(*                                                                         *)
(* One session log, one run.  Each appender slot picks an entry (attempt   *)
(* ordinal, fenced or not, a dedupe key or none), then the provider        *)
(* JUDGES it (fence + dedupe) and later WRITES it.  The two steps are      *)
(* split on purpose: the contract (S-14) requires them to be one step, and *)
(* the model shows what that requirement buys.                            *)
(*                                                                         *)
(* Durable: the log itself.  Volatile (lost on a crash): the pending       *)
(* verdicts, the lock, and "mem", an in-process set of written keys that   *)
(* only the negative configuration VolatileDedupe consults.               *)
(*                                                                         *)
(* Two toggles; the positive configuration keeps both TRUE:               *)
(*   Serialized    -- S-14: judge and write are one step per session log   *)
(*                    (modelled as a lock held from judge to write)        *)
(*   DurableDedupe -- S-8 item 2: dedupe reads the committed entries,      *)
(*                    not an in-process set                                *)
(*                                                                         *)
(* Absorbed by construction, NOT evidence here: whole-batch atomicity,     *)
(* dense positions, read-your-writes, payload fidelity (one write step     *)
(* appends one entry; there is no payload).                               *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS NumAttempts, NumKeys, NumProcs, MaxLen, MaxCrashes,
          Serialized, DurableDedupe

Attempts == 1..NumAttempts
Keys     == 1..NumKeys
NoKey    == 0
Procs    == 1..NumProcs

\* The shell members the two judgements read (S-6): attempt ordinal of the
\* single run, whether the append carried a fence for that attempt, and the
\* dedupe key (NoKey = none).
Entry == [att : Attempts, fenced : BOOLEAN, key : Keys \cup {NoKey}]

Filler == [att |-> 1, fenced |-> FALSE, key |-> NoKey]
Idle   == [busy |-> FALSE, req |-> Filler, ok |-> FALSE]
Slot   == [busy : BOOLEAN, req : Entry, ok : BOOLEAN]

VARIABLES
  log,      \* durable: the committed entries, in commit order
  pending,  \* volatile: per appender slot, the judged-but-unwritten entry
  lock,     \* volatile: slot holding the session-log lock (0 = free)
  mem,      \* volatile: keys written since the last crash (negative config)
  crashes

vars == <<log, pending, lock, mem, crashes>>

\* S-10: no committed entry of the same run carries a larger attempt ordinal.
FenceOK(e) == ~e.fenced \/ \A i \in 1..Len(log) : log[i].att <= e.att

\* S-8: the key is not taken.  Positive: read the committed entries.
\* Negative (DurableDedupe = FALSE): read the in-process set.
KeyFree(e) ==
  \/ e.key = NoKey
  \/ IF DurableDedupe
       THEN \A i \in 1..Len(log) : log[i].key # e.key
       ELSE e.key \notin mem

-----------------------------------------------------------------------------

Init ==
  /\ log = << >>
  /\ pending = [p \in Procs |-> Idle]
  /\ lock = 0
  /\ mem = {}
  /\ crashes = 0

\* Judge an append at the provider.  Under Serialized the slot takes the
\* session-log lock here and keeps it until its write step.
Judge(p, e) ==
  /\ ~pending[p].busy
  /\ Len(log) < MaxLen
  /\ Serialized => lock = 0
  /\ lock' = IF Serialized THEN p ELSE lock
  /\ pending' = [pending EXCEPT ![p] =
                   [busy |-> TRUE, req |-> e, ok |-> (FenceOK(e) /\ KeyFree(e))]]
  /\ UNCHANGED <<log, mem, crashes>>

\* Write (or, if the verdict was a rejection, answer and write nothing).
Write(p) ==
  /\ pending[p].busy
  /\ log' = IF pending[p].ok THEN Append(log, pending[p].req) ELSE log
  /\ mem' = IF pending[p].ok /\ pending[p].req.key # NoKey
              THEN mem \cup {pending[p].req.key}
              ELSE mem
  /\ pending' = [pending EXCEPT ![p] = Idle]
  /\ lock' = IF Serialized THEN 0 ELSE lock
  /\ UNCHANGED crashes

\* The provider process dies and restarts: everything volatile is gone, the
\* log stays (S-13 item 2).  Callers retry by resubmitting (S-22).
Crash ==
  /\ crashes < MaxCrashes
  /\ pending' = [p \in Procs |-> Idle]
  /\ lock' = 0
  /\ mem' = {}
  /\ crashes' = crashes + 1
  /\ UNCHANGED log

\* Bounded model: once the log is full and nobody is mid-append, stutter.
Done ==
  /\ Len(log) >= MaxLen
  /\ \A p \in Procs : ~pending[p].busy
  /\ UNCHANGED vars

Next ==
  \/ \E p \in Procs, e \in Entry : Judge(p, e)
  \/ \E p \in Procs : Write(p)
  \/ Crash
  \/ Done

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Invariants checked by the positive configuration.                       *)

TypeOK ==
  /\ Len(log) <= MaxLen + NumProcs
  /\ log \in [1..Len(log) -> Entry]
  /\ pending \in [Procs -> Slot]
  /\ lock \in 0..NumProcs
  /\ mem \subseteq Keys
  /\ crashes \in 0..MaxCrashes

\* S-8: one dedupe key, at most one entry -- across crashes and retries.
UniqueDedupeKey ==
  \A i, j \in 1..Len(log) :
    (i # j /\ log[i].key # NoKey) => log[i].key # log[j].key

\* S-10: no fenced entry is committed after an entry of a larger attempt.
FenceHolds ==
  \A i, j \in 1..Len(log) :
    (i < j /\ log[j].fenced) => log[i].att <= log[j].att

-----------------------------------------------------------------------------
(* Reachability checks (expected to be violated; not formal tasks).        *)
(* They show that neither judgement is vacuous in the positive setting.    *)

\* A stale fenced append gets judged and rejected.
NeverStaleRejected ==
  \A p \in Procs :
    ~ ( /\ pending[p].busy
        /\ ~pending[p].ok
        /\ pending[p].req.fenced
        /\ \E i \in 1..Len(log) : log[i].att > pending[p].req.att )

\* An unfenced append gets rejected because its key is already there.
NeverDuplicateRejected ==
  \A p \in Procs :
    ~ ( /\ pending[p].busy
        /\ ~pending[p].ok
        /\ ~pending[p].req.fenced
        /\ pending[p].req.key # NoKey )

=============================================================================

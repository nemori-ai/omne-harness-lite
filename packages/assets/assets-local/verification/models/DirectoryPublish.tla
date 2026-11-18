---------------------------- MODULE DirectoryPublish ----------------------------
(* The order of a directory publish that records the version and the holding
   in one commit. Names follow packages/assets/assets-local/src/packages.ts:
   validate, settledBefore, stage, records.publish (here: publish and hold),
   swap, recovery.

   Order = "swap-first": stage, swap into the final directory, then one
   commit of version record and holding. This is the order to implement.
   Order = "record-first": stage, commit, swap. It is the negative control
   that shows why the swap must come first.

   The final directory is addressed by name and manifest digest, so equal
   contents share one final directory and a final directory never changes
   once in place. Readers reach content only through version records and the
   holding; staging directories are private to their operation. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Publishers, Contents, Order, MaxCrashes, AllowSweep, SweepOnRecover, None

ASSUME Order \in {"record-first", "swap-first"}
ASSUME AllowSweep \in BOOLEAN
ASSUME SweepOnRecover \in BOOLEAN
ASSUME None \notin Contents

VARIABLES
  pc,        \* step of each publisher's operation
  content,   \* the content each operation publishes, chosen at start
  readRev,   \* the asset revision read before staging
  staging,   \* operations whose staging directory exists
  final,     \* contents whose final directory is in place
  versions,  \* contents with a committed version record
  held,      \* the content the holding points to, or None
  revision,  \* the asset revision (expected-revision check)
  receipt,   \* operations whose commit is recorded under their operation id
  commits,   \* how many times each operation id committed
  up,        \* the store serves reads; FALSE from a crash to the end of recovery
  crashes

vars == <<pc, content, readRev, staging, final, versions, held, revision,
          receipt, commits, up, crashes>>

Steps == {"idle", "settle", "staged", "recorded", "swapped",
          "done", "rejected", "unknown", "lost", "error"}

TypeOK ==
  /\ pc \in [Publishers -> Steps]
  /\ content \in [Publishers -> Contents \cup {None}]
  /\ readRev \in [Publishers -> Nat]
  /\ staging \subseteq Publishers
  /\ final \subseteq Contents
  /\ versions \subseteq Contents
  /\ held \in Contents \cup {None}
  /\ revision \in Nat
  /\ receipt \subseteq Publishers
  /\ commits \in [Publishers -> Nat]
  /\ up \in BOOLEAN
  /\ crashes \in Nat

Init ==
  /\ pc = [p \in Publishers |-> "idle"]
  /\ content = [p \in Publishers |-> None]
  /\ readRev = [p \in Publishers |-> 0]
  /\ staging = {}
  /\ final = {}
  /\ versions = {}
  /\ held = None
  /\ revision = 0
  /\ receipt = {}
  /\ commits = [p \in Publishers |-> 0]
  /\ up = TRUE
  /\ crashes = 0

\* validate: the category, layout and judgment passed for a chosen content.
Start(p) ==
  /\ up /\ pc[p] = "idle"
  /\ \E c \in Contents : content' = [content EXCEPT ![p] = c]
  /\ pc' = [pc EXCEPT ![p] = "settle"]
  /\ UNCHANGED <<readRev, staging, final, versions, held, revision, receipt,
                 commits, up, crashes>>

\* completeSwap: put the final directory in place from this operation's staging.
SwapFrom(p) ==
  /\ final' = final \cup {content[p]}
  /\ staging' = staging \ {p}

\* settledBefore with a committed receipt: the operation already happened.
SettleCommitted(p) ==
  /\ up /\ pc[p] = "settle" /\ p \in receipt
  /\ IF content[p] \in final
       THEN /\ pc' = [pc EXCEPT ![p] = "done"]
            /\ UNCHANGED <<staging, final>>
       ELSE IF p \in staging
         THEN /\ SwapFrom(p)
              /\ pc' = [pc EXCEPT ![p] = "done"]
         ELSE /\ pc' = [pc EXCEPT ![p] = "error"]
              /\ UNCHANGED <<staging, final>>
  /\ UNCHANGED <<content, readRev, versions, held, revision, receipt, commits,
                 up, crashes>>

\* settledBefore found nothing: read the revision and stage the files.
Stage(p) ==
  /\ up /\ pc[p] = "settle" /\ p \notin receipt
  /\ readRev' = [readRev EXCEPT ![p] = revision]
  /\ staging' = staging \cup {p}
  /\ pc' = [pc EXCEPT ![p] = "staged"]
  /\ UNCHANGED <<content, final, versions, held, revision, receipt, commits,
                 up, crashes>>

\* One commit writes the version record and the holding (publish and hold).
\* The reply may be lost: then the caller sees "unknown" and retries the id.
Commit(p, next) ==
  /\ revision = readRev[p]
  /\ versions' = versions \cup {content[p]}
  /\ held' = content[p]
  /\ revision' = revision + 1
  /\ receipt' = receipt \cup {p}
  /\ commits' = [commits EXCEPT ![p] = @ + 1]
  /\ \E answer \in {next, "unknown"} : pc' = [pc EXCEPT ![p] = answer]

Reject(p) ==
  /\ revision # readRev[p]
  /\ pc' = [pc EXCEPT ![p] = "rejected"]
  /\ UNCHANGED <<versions, held, revision, receipt, commits>>

\* record-first: record right after staging; a rejection removes the staging.
RecordCurrent(p) ==
  /\ Order = "record-first" /\ up /\ pc[p] = "staged"
  /\ \/ /\ Commit(p, "recorded")
        /\ UNCHANGED staging
     \/ /\ Reject(p)
        /\ staging' = staging \ {p}
  /\ UNCHANGED <<content, readRev, final, up, crashes>>

\* record-first: swap after the record.
SwapCurrent(p) ==
  /\ Order = "record-first" /\ up /\ pc[p] = "recorded"
  /\ SwapFrom(p)
  /\ pc' = [pc EXCEPT ![p] = "done"]
  /\ UNCHANGED <<content, readRev, versions, held, revision, receipt, commits,
                 up, crashes>>

\* swap-first: swap before the record; an equal content already in place is reused.
SwapRevised(p) ==
  /\ Order = "swap-first" /\ up /\ pc[p] = "staged"
  /\ SwapFrom(p)
  /\ pc' = [pc EXCEPT ![p] = "swapped"]
  /\ UNCHANGED <<content, readRev, versions, held, revision, receipt, commits,
                 up, crashes>>

\* swap-first: record after the swap; a rejection leaves an unrecorded final
\* directory that no record names.
RecordRevised(p) ==
  /\ Order = "swap-first" /\ up /\ pc[p] = "swapped"
  /\ \/ Commit(p, "done")
     \/ Reject(p)
  /\ UNCHANGED <<content, readRev, staging, final, up, crashes>>

\* The process dies after any step; durable state stays, operations are lost.
Crash ==
  /\ up /\ crashes < MaxCrashes
  /\ up' = FALSE
  /\ crashes' = crashes + 1
  /\ pc' = [p \in Publishers |->
              IF pc[p] \in {"idle", "done", "rejected", "error"} THEN pc[p]
              ELSE "lost"]
  /\ UNCHANGED <<content, readRev, staging, final, versions, held, revision,
                 receipt, commits>>

\* Startup recovery runs before the store serves reads again.
\* record-first: a staging whose version is recorded but not in place is swapped in;
\* every other staging is discarded. swap-first: every staging is discarded, and
\* with SweepOnRecover the final directories that no record names are removed
\* (no operation is in flight while recovery runs).
Recover ==
  /\ ~up
  /\ final' = IF Order = "record-first"
                THEN final \cup {content[p] : p \in {q \in staging : content[q] \in versions}}
                ELSE IF SweepOnRecover THEN final \cap versions ELSE final
  /\ staging' = {}
  /\ up' = TRUE
  /\ UNCHANGED <<pc, content, readRev, versions, held, revision, receipt,
                 commits, crashes>>

\* The caller retries a lost or unknown operation with the same operation id.
Retry(p) ==
  /\ up /\ pc[p] \in {"lost", "unknown"}
  /\ pc' = [pc EXCEPT ![p] = "settle"]
  /\ UNCHANGED <<content, readRev, staging, final, versions, held, revision,
                 receipt, commits, up, crashes>>

\* Negative control only: remove a final directory that no version record
\* names, without coordinating with publishers.
Sweep ==
  /\ AllowSweep /\ up
  /\ \E c \in final \ versions : final' = final \ {c}
  /\ UNCHANGED <<pc, content, readRev, staging, versions, held, revision,
                 receipt, commits, up, crashes>>

Next ==
  \/ \E p \in Publishers :
       \/ Start(p) \/ SettleCommitted(p) \/ Stage(p)
       \/ RecordCurrent(p) \/ SwapCurrent(p)
       \/ SwapRevised(p) \/ RecordRevised(p)
       \/ Retry(p)
  \/ Crash \/ Recover \/ Sweep

Spec == Init /\ [][Next]_vars

(* I-7: a reader that follows the holding finds the whole content in place. *)
HeldInPlace == up /\ held # None => held \in final

(* I-7: every recorded version a reader can name has its content in place. *)
RecordedInPlace == up => versions \subseteq final

(* settledBefore never meets a committed operation with neither files nor staging. *)
NoLostFiles == \A p \in Publishers : pc[p] # "error"

(* I-8: an operation id commits at most once. *)
AtMostOnce == \A p \in Publishers : commits[p] <= 1

=============================================================================

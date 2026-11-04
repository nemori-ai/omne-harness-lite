---------------------------- MODULE SendBoundary ----------------------------
(***************************************************************************)
(* One dispatch through the product send boundary and the runtime driver. *)
(* The boundary resolves the credential once in the fence, starts or       *)
(* refuses, records the send, and for a final refusal (a missing or        *)
(* unreadable credential) writes a failed terminal into its receive window. *)
(* The driver hands a started send to the receiver, retries an unknown      *)
(* answer, and for a send that was not started reads the dispatch record:  *)
(* a failed terminal there settles the call. The environment can lose a   *)
(* write confirmation, fail a record read (both bounded by MaxFaults), take *)
(* the execution away (another instance or a competing write: every later *)
(* write is rejected), fail a resource release, and change the vault answer *)
(* once.                                                                    *)
(*                                                                          *)
(* The rules come from packages/model/model/SPEC.md「产品发送边界」 and this *)
(* package's SPEC「物化回执的提交与发送」. The mapping to the source, the    *)
(* abstractions and the bounds are in formal-mapping.md. A TLC result holds *)
(* only inside those bounds.                                                *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
  MaxFaults,    \* lost write confirmations plus failed record reads
  Resolutions,  \* the vault answers in play
  Bugs          \* the deliberate faults of a negative control; {} in every positive control

BugNames == {"rejection-unavailable", "release-overrides", "read-failure-drops",
             "retry-new-op", "no-window-guard", "re-resolve"}
ASSUME Bugs \subseteq BugNames
ASSUME Resolutions \subseteq {"value", "absent", "unreadable", "denied", "unavailable"}

VARIABLES
  cred,        \* the vault answer a resolution sees now
  flipped,     \* the vault answer changed once (unbind or bind)
  owned,       \* this instance may still write facts of the execution
  rec,         \* the dispatch record: send state, terminal, receive window
  applied,     \* the write operations that the store applied
  nextOp,      \* the next fresh operation id
  recOp,       \* the operation of the send record write
  termOp,      \* the operation of the terminal write
  termWrites,  \* how many terminal writes the store applied
  starts,      \* how many times the transport started
  bstage,      \* boundary: resolve, record, terminal, done
  decision,    \* boundary: the fence decision
  result,      \* boundary answer to the driver
  dstage,      \* driver stage
  faults,      \* faults used
  settled      \* the termination the call settled with

vars == <<cred, flipped, owned, rec, applied, nextOp, recOp, termOp, termWrites, starts,
          bstage, decision, result, dstage, faults, settled>>

Decide(c) ==
  CASE c = "value" -> "started"
    [] c \in {"absent", "unreadable"} -> "final"
    [] c = "denied" -> "refusal"
    [] OTHER -> "refusal-unavail"

\* The fence answer of a refusal: a definite kind, or the retryable unavailable.
RefusalAnswer(d) == IF d = "refusal-unavail" THEN "unavail" ELSE "definite"

TypeOK ==
  /\ cred \in Resolutions
  /\ flipped \in BOOLEAN /\ owned \in BOOLEAN
  /\ rec \in [send : {"prepared", "not-sent", "started"},
              term : {"none", "cred", "stream"},
              window : {"open", "closed"}]
  /\ applied \subseteq Nat /\ nextOp \in Nat /\ recOp \in Nat /\ termOp \in Nat
  /\ termWrites \in Nat /\ starts \in 0..1
  /\ bstage \in {"resolve", "record", "terminal", "done"}
  /\ decision \in {"none", "started", "final", "refusal", "refusal-unavail"}
  /\ result \in {"none", "started", "unknown", "final", "definite", "unavail"}
  /\ dstage \in {"send", "receive", "not-sent", "finish", "failed-def", "failed-unavail",
                 "settled"}
  /\ faults \in 0..MaxFaults
  /\ settled \in {"none", "cred", "stream"}

Init ==
  /\ cred \in Resolutions
  /\ flipped = FALSE /\ owned = TRUE
  /\ rec = [send |-> "prepared", term |-> "none", window |-> "open"]
  /\ applied = {} /\ nextOp = 1 /\ recOp = 0 /\ termOp = 0
  /\ termWrites = 0 /\ starts = 0
  /\ bstage = "resolve" /\ decision = "none" /\ result = "none"
  /\ dstage = "send" /\ faults = 0 /\ settled = "none"

(*************************** environment ***********************************)

Flip ==
  /\ ~flipped /\ flipped' = TRUE
  /\ cred' \in Resolutions \ {cred}
  /\ UNCHANGED <<owned, rec, applied, nextOp, recOp, termOp, termWrites, starts, bstage,
                 decision, result, dstage, faults, settled>>

\* Another instance claims the execution, or a competing write moves the call.
Steal ==
  /\ owned /\ owned' = FALSE
  /\ UNCHANGED <<cred, flipped, rec, applied, nextOp, recOp, termOp, termWrites, starts,
                 bstage, decision, result, dstage, faults, settled>>

(*************************** boundary **************************************)

\* The fence: one resolution, and an immediate start only for a value.
Resolve ==
  /\ dstage = "send" /\ bstage = "resolve" /\ result = "none"
  /\ decision' = Decide(cred)
  /\ starts' = IF Decide(cred) = "started" THEN 1 ELSE starts
  /\ recOp' = nextOp /\ nextOp' = nextOp + 1
  /\ bstage' = "record"
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, termOp, termWrites, result, dstage,
                 faults, settled>>

RecState == IF decision = "started" THEN "started" ELSE "not-sent"

\* What follows a confirmed send record.
AfterRecord ==
  IF decision = "final"
  THEN /\ bstage' = "terminal" /\ termOp' = nextOp /\ nextOp' = nextOp + 1
       /\ result' = "none"
  ELSE /\ bstage' = "done" /\ UNCHANGED <<termOp, nextOp>>
       /\ result' = CASE decision = "started" -> "started"
                      [] OTHER -> RefusalAnswer(decision)

\* The answer to a refusal whose own write was definitely rejected. A release failure keeps
\* the attempt held, but it does not turn the definite answer into a retryable one.
RejectedAnswer(released) ==
  IF decision = "final"
  THEN IF "rejection-unavailable" \in Bugs \/ ("release-overrides" \in Bugs /\ ~released)
       THEN "unavail" ELSE "definite"
  ELSE RefusalAnswer(decision)

RecordReplay ==
  /\ dstage = "send" /\ bstage = "record" /\ result = "none"
  /\ recOp \in applied
  /\ AfterRecord
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, recOp, termWrites, starts, decision,
                 dstage, faults, settled>>

RecordRejected ==
  /\ dstage = "send" /\ bstage = "record" /\ result = "none"
  /\ recOp \notin applied /\ (~owned \/ rec.send # "prepared")
  /\ \E released \in BOOLEAN :
       result' = IF decision = "started" THEN "unknown" ELSE RejectedAnswer(released)
  /\ bstage' = IF decision = "started" THEN "record" ELSE "done"
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, nextOp, recOp, termOp, termWrites,
                 starts, decision, dstage, faults, settled>>

RecordWrite ==
  /\ dstage = "send" /\ bstage = "record" /\ result = "none"
  /\ recOp \notin applied /\ owned /\ rec.send = "prepared"
  /\ \/ /\ applied' = applied \cup {recOp}
        /\ rec' = [rec EXCEPT !.send = RecState]
        /\ AfterRecord
        /\ UNCHANGED faults
     \/ /\ faults < MaxFaults /\ faults' = faults + 1
        /\ \E effect \in {"applied", "lost"} :
             /\ applied' = IF effect = "applied" THEN applied \cup {recOp} ELSE applied
             /\ rec' = IF effect = "applied" THEN [rec EXCEPT !.send = RecState] ELSE rec
        /\ result' = "unknown"
        /\ UNCHANGED <<bstage, termOp, nextOp>>
  /\ UNCHANGED <<cred, flipped, owned, recOp, termWrites, starts, decision, dstage, settled>>

ApplyTerminal ==
  /\ applied' = applied \cup {termOp}
  /\ rec' = [rec EXCEPT !.term = "cred", !.window = "closed"]
  /\ termWrites' = termWrites + 1

TerminalReplay ==
  /\ dstage = "send" /\ bstage = "terminal" /\ result = "none"
  /\ termOp \in applied
  /\ result' = "final" /\ bstage' = "done"
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, nextOp, recOp, termOp, termWrites,
                 starts, decision, dstage, faults, settled>>

WindowGuard == "no-window-guard" \notin Bugs

TerminalRejected ==
  /\ dstage = "send" /\ bstage = "terminal" /\ result = "none"
  /\ termOp \notin applied /\ (~owned \/ (WindowGuard /\ rec.window = "closed"))
  /\ \E released \in BOOLEAN : result' = RejectedAnswer(released)
  /\ bstage' = "done"
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, nextOp, recOp, termOp, termWrites,
                 starts, decision, dstage, faults, settled>>

TerminalWrite ==
  /\ dstage = "send" /\ bstage = "terminal" /\ result = "none"
  /\ termOp \notin applied /\ owned /\ (~WindowGuard \/ rec.window = "open")
  /\ \/ /\ ApplyTerminal
        /\ result' = "final" /\ bstage' = "done"
        /\ UNCHANGED faults
     \/ /\ faults < MaxFaults /\ faults' = faults + 1
        /\ \/ ApplyTerminal
           \/ UNCHANGED <<applied, rec, termWrites>>
        /\ result' = "unknown"
        /\ UNCHANGED bstage
  /\ UNCHANGED <<cred, flipped, owned, nextOp, recOp, termOp, starts, decision, dstage,
                 settled>>

Boundary == Resolve \/ RecordReplay \/ RecordRejected \/ RecordWrite
            \/ TerminalReplay \/ TerminalRejected \/ TerminalWrite

(*************************** driver ****************************************)

\* An unknown answer keeps the attempt; the next drive sends the same demand again. The
\* boundary keeps its stage and its fence decision, so it neither resolves nor starts again.
DriveAgain ==
  /\ dstage = "send" /\ result = "unknown"
  /\ result' = "none"
  /\ IF "re-resolve" \in Bugs /\ bstage = "record"
     THEN bstage' = "resolve"
     ELSE IF "retry-new-op" \in Bugs /\ bstage = "terminal"
          THEN bstage' = "terminal"
          ELSE UNCHANGED bstage
  /\ termOp' = IF "retry-new-op" \in Bugs /\ bstage = "terminal" THEN nextOp ELSE termOp
  /\ nextOp' = IF "retry-new-op" \in Bugs /\ bstage = "terminal" THEN nextOp + 1 ELSE nextOp
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, recOp, termWrites, starts, decision,
                 dstage, faults, settled>>

Started ==
  /\ dstage = "send" /\ result = "started"
  /\ dstage' = "receive"
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, nextOp, recOp, termOp, termWrites, starts,
                 bstage, decision, result, faults, settled>>

NotStarted ==
  /\ dstage = "send" /\ result \in {"final", "definite", "unavail"}
  /\ dstage' = "not-sent"
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, nextOp, recOp, termOp, termWrites, starts,
                 bstage, decision, result, faults, settled>>

\* The refusal itself: the boundary answers a final refusal as the credential's unavailable.
Refused == IF result = "definite" THEN "failed-def" ELSE "failed-unavail"

ReadRecord ==
  /\ dstage = "not-sent"
  /\ \/ /\ dstage' = IF rec.send = "not-sent" /\ rec.term = "cred" THEN "finish" ELSE Refused
        /\ UNCHANGED faults
     \/ /\ faults < MaxFaults /\ faults' = faults + 1
        /\ dstage' = IF "read-failure-drops" \in Bugs THEN Refused ELSE dstage
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, nextOp, recOp, termOp, termWrites, starts,
                 bstage, decision, result, settled>>

Receive ==
  /\ dstage = "receive"
  /\ dstage' = "finish"
  /\ rec' = [rec EXCEPT !.term = "stream", !.window = "closed"]
  /\ UNCHANGED <<cred, flipped, owned, applied, nextOp, recOp, termOp, termWrites, starts,
                 bstage, decision, result, faults, settled>>

\* The settlement write needs the execution: after a takeover it is a definite stale-instance.
Settle ==
  /\ dstage = "finish"
  /\ dstage' = IF owned THEN "settled" ELSE "failed-def"
  /\ settled' = IF owned THEN rec.term ELSE settled
  /\ UNCHANGED <<cred, flipped, owned, rec, applied, nextOp, recOp, termOp, termWrites, starts,
                 bstage, decision, result, faults>>

Driver == DriveAgain \/ Started \/ NotStarted \/ ReadRecord \/ Receive \/ Settle

Proc == Boundary \/ Driver
Next == Proc \/ Flip \/ Steal
Spec == Init /\ [][Next]_vars /\ WF_vars(Proc)

(*************************** properties ************************************)

\* A credential failure only on a call whose transport never started.
NoCredFailureAfterStart ==
  /\ (rec.term = "cred" => starts = 0)
  /\ (settled = "cred" => starts = 0)

\* A retried terminal write never lands a second terminal.
AtMostOneTerminal == termWrites <= 1

\* A final refusal never leaves the caller waiting: the call settles, or the driver ends with a
\* definite refusal whose cause another owner holds.
FinalDecided == (decision = "final") ~> (dstage \in {"settled", "failed-def"})

\* While this instance keeps the execution, a final refusal settles the call as a credential failure.
FinalSettlesUnlessStolen == (decision = "final") ~> (settled = "cred" \/ ~owned)

\* Every refusal is decided. It does not hold with "unavailable" in Resolutions: that row of the
\* exit table still waits (formal-mapping.md, known counterexample).
RefusalDecided ==
  (decision \in {"final", "refusal", "refusal-unavail"}) ~> (dstage \in {"settled", "failed-def"})
=============================================================================

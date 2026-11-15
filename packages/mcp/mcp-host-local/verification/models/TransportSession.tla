-------------------------- MODULE TransportSession --------------------------
(***************************************************************************)
(* The request lifecycle of one `Session` (src/session.ts) over one line,  *)
(* for the properties V1-V6 of ../../SPEC.md "性质与证据". The model keeps  *)
(* what those properties observe, as two things per request that the code  *)
(* keeps apart:                                                             *)
(*                                                                          *)
(*   - the entry in the in-flight table (`st`): its phase init -> auth ->   *)
(*     sent -> (disc ->) done, and its settled answer (`out`). The signal   *)
(*     and `close()` settle an entry at once, by its phase: authorizing ->  *)
(*     notSent, handed to the line -> abandoned, in authorization           *)
(*     discovery -> authReq. The caller's wait (`cw`) is released by the    *)
(*     settlement and by nothing else.                                      *)
(*   - the workflow the session owns in the background (`wf`): it waits    *)
(*     for the credential handle, then for the line, then (after a         *)
(*     refusal) for the discovery. A port may hang: the action that would   *)
(*     answer it is simply not taken. When a port answers after the entry   *)
(*     was settled, the workflow drops the answer: it does not send, does   *)
(*     not call the handle, does not settle again.                          *)
(*                                                                          *)
(* The line, the wire and the real protocol are abstracted to the answers   *)
(* the session draws a conclusion from (T8): a result, a refusal (401 or a  *)
(* scoped 403), a broken stream, or nothing. `close()` marks the session    *)
(* closed and settles every in-flight entry in the same step; it returns    *)
(* when the line's `close` answers (`LineClosed`).                          *)
(*                                                                          *)
(* The line can go away under the session (the session is then dead):      *)
(* `LineGone` is a broken stream, an exited process or the end of the      *)
(* shared stream of the old HTTP+SSE mode; `SessionEnded(r)` is the peer's  *)
(* 404 to a request that carries an old session (T8 S07). Both settle, by  *)
(* the phase rule of the signal and close(), only the entries whose fate    *)
(* depends on the line: authorizing -> notSent; handed to the line ->       *)
(* broken after `LineGone`, and left to its own answer after                *)
(* `SessionEnded` (only the request that got the 404 answers `ended`). An   *)
(* entry in authorization discovery is not touched: its answer is already   *)
(* authReq and the discovery does not use the line. A dead session hands    *)
(* nothing more to the line and asks the handle for nothing more.           *)
(*                                                                          *)
(* The properties are state assertions over snapshots the valid actions     *)
(* take: the phase an entry was cut at (`cutAt`), its first answer          *)
(* (`firstOut`), the credential counts at `close()` (`credAtClose`). The    *)
(* negative controls are of two kinds: `Bugs` injects a defect; run.py      *)
(* `--mutations` edits a valid action in a copy of this module. Both must   *)
(* turn the named invariant red; see ../README.md "两种证据能变红".          *)
(*                                                                          *)
(* The mapping to the real session and to the explorer (tests/model), the   *)
(* bounds and the TLC results are in ../README.md. The properties are the   *)
(* theorems of ../../SPEC.md; this model is one bounded piece of evidence.   *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Reqs,       \* the requests the caller makes on the transport
  Writes,     \* the write-class requests (tools/call, tasks/update, tasks/cancel): never re-sent
  HasHandle,  \* TRUE: a Streamable HTTP material with a credential handle
  MaxSends,   \* the most times a request may go out (a read re-sends once: 2)
  Bugs        \* the deliberate defects of a negative control; {} is the code

BugNames == {"resettle", "cred-after-close", "report-twice", "signal-dead",
             "close-settles-after-line", "resend-any", "close-not-sent",
             "caller-waits-workflow", "ended-leaves-authorizing"}

ASSUME Writes \subseteq Reqs
ASSUME HasHandle \in BOOLEAN
ASSUME MaxSends \in Nat /\ MaxSends >= 1
ASSUME Bugs \subseteq BugNames

VARIABLES
  st,          \* [Reqs -> phase]: init, auth(orizing), sent, disc(overy), done (settled)
  out,         \* [Reqs -> outcome]: none, result, abandoned, notSent, authReq, broken
  wf,          \* [Reqs -> stage]: where the background workflow waits: none, auth, line, disc, end
  cw,          \* [Reqs -> wait]: the caller's last wait on the request: none, waiting, answered
  sends,       \* [Reqs -> Nat]: how many times the request went out
  settles,     \* [Reqs -> Nat]: how many times the entry was settled
  firstOut,    \* [Reqs -> outcome]: the answer of the first settlement
  cutAt,       \* [Reqs -> cut]: the phase the signal or close() settled the entry at; init: refused at Begin
  signalled,   \* SUBSET Reqs: the caller's signal fired for these
  refusals,    \* Nat: refusals of an open request on a material with a handle
  cred,        \* [auth, report]: calls of the credential handle so far
  credAtClose, \* the value of `cred` when close() was called
  closed,      \* close() was called
  closeDone,   \* close() returned
  gone,        \* the line went away: broken stream, exited process, end of the SSE stream
  ended,       \* the peer ended the old session (T8 S07)
  deadAt,      \* [Reqs -> cut]: the phase the last disconnect found the entry in flight at
  deadBy,      \* [Reqs -> cause]: which disconnect that was: none, gone, ended
  deadOut,     \* [Reqs -> outcome]: the entry's answer right after that disconnect
  sendsAtDead, \* the value of `sends` when the session became dead
  authAtDead   \* the value of `cred.auth` when the session became dead

deadVars == <<gone, ended, deadAt, deadBy, deadOut, sendsAtDead, authAtDead>>

vars == <<st, out, wf, cw, sends, settles, firstOut, cutAt, signalled, refusals,
          cred, credAtClose, closed, closeDone, deadVars>>

Phases == {"init", "auth", "sent", "disc", "done"}
Outcomes == {"none", "result", "abandoned", "notSent", "authReq", "broken", "ended"}
Stages == {"none", "auth", "line", "disc", "end"}
Waits == {"none", "waiting", "answered"}
Cuts == {"none", "init", "auth", "sent", "disc"}
InFlightPhases == {"auth", "sent", "disc"}
Causes == {"none", "gone", "ended"}

NoCred == [auth |-> 0, report |-> 0]

SendLimit(r) == IF r \in Writes THEN 1 ELSE MaxSends
CanResend(r) == (r \notin Writes \/ "resend-any" \in Bugs) /\ sends[r] < MaxSends

\* The caller-waits-workflow bug: the caller's promise follows the workflow, so
\* the signal and close() settle the entry but do not release the caller; a late
\* port answer does.
CallerFollows == "caller-waits-workflow" \in Bugs

\* The session cannot be used any more: the line went away or the session ended.
Dead == gone \/ ended

Init ==
  /\ st = [r \in Reqs |-> "init"]
  /\ out = [r \in Reqs |-> "none"]
  /\ wf = [r \in Reqs |-> "none"]
  /\ cw = [r \in Reqs |-> "none"]
  /\ sends = [r \in Reqs |-> 0]
  /\ settles = [r \in Reqs |-> 0]
  /\ firstOut = [r \in Reqs |-> "none"]
  /\ cutAt = [r \in Reqs |-> "none"]
  /\ signalled = {}
  /\ refusals = 0
  /\ cred = NoCred
  /\ credAtClose = NoCred
  /\ closed = FALSE
  /\ closeDone = FALSE
  /\ gone = FALSE
  /\ ended = FALSE
  /\ deadAt = [r \in Reqs |-> "none"]
  /\ deadBy = [r \in Reqs |-> "none"]
  /\ deadOut = [r \in Reqs |-> "none"]
  /\ sendsAtDead = [r \in Reqs |-> 0]
  /\ authAtDead = 0

-----------------------------------------------------------------------------
(* One entry settles with answer `o`. The caller is released by the settlement. *)
Settle(r, o) ==
  /\ st' = [st EXCEPT ![r] = "done"]
  /\ out' = [out EXCEPT ![r] = o]
  /\ firstOut' = [firstOut EXCEPT ![r] = IF @ = "none" THEN o ELSE @]
  /\ settles' = [settles EXCEPT ![r] = @ + 1]

NoSettle == UNCHANGED <<st, out, firstOut, settles>>

Authorize == IF HasHandle THEN [cred EXCEPT !.auth = @ + 1] ELSE cred

-----------------------------------------------------------------------------
(* The caller begins a request. While the transport is open and the signal   *)
(* has not fired, the entry is registered and the workflow asks the handle.  *)
(* After close(), with the signal already fired, or once the session is      *)
(* dead, the request is refused at once (notSent) without a workflow. The    *)
(* cred-after-close bug still asks the handle after close() (V2).            *)
Begin(r) ==
  /\ st[r] = "init"
  /\ IF closed \/ r \in signalled \/ Dead
       THEN /\ Settle(r, "notSent")
            /\ cutAt' = [cutAt EXCEPT ![r] = "init"]
            /\ cw' = [cw EXCEPT ![r] = "answered"]
            /\ cred' = IF "cred-after-close" \in Bugs /\ closed THEN Authorize ELSE cred
            /\ UNCHANGED wf
       ELSE /\ st' = [st EXCEPT ![r] = "auth"]
            /\ wf' = [wf EXCEPT ![r] = "auth"]
            /\ cw' = [cw EXCEPT ![r] = "waiting"]
            /\ cred' = Authorize
            /\ UNCHANGED <<out, firstOut, settles, cutAt>>
  /\ UNCHANGED <<sends, signalled, refusals, credAtClose, closed, closeDone, deadVars>>

(* The handle answered. An open entry is handed to the line. A settled entry  *)
(* (the signal or close() came first) gets nothing: the answer is dropped.    *)
AuthDone(r) ==
  /\ wf[r] = "auth"
  /\ IF st[r] = "auth"
       THEN /\ st' = [st EXCEPT ![r] = "sent"]
            /\ sends' = [sends EXCEPT ![r] = @ + 1]
            /\ wf' = [wf EXCEPT ![r] = "line"]
            /\ UNCHANGED cw
       ELSE /\ wf' = [wf EXCEPT ![r] = "end"]
            /\ cw' = [cw EXCEPT ![r] = "answered"]
            /\ UNCHANGED <<st, sends>>
  /\ UNCHANGED <<out, firstOut, settles, cutAt, signalled, refusals, cred,
                 credAtClose, closed, closeDone, deadVars>>

(* The peer answered the request. A late answer to a settled entry is         *)
(* dropped; the resettle bug settles the entry again (V1).                    *)
Answer(r) ==
  /\ wf[r] = "line"
  /\ wf' = [wf EXCEPT ![r] = "end"]
  /\ cw' = [cw EXCEPT ![r] = "answered"]
  /\ IF st[r] = "sent" \/ "resettle" \in Bugs
       THEN Settle(r, "result")
       ELSE NoSettle
  /\ UNCHANGED <<sends, cutAt, signalled, refusals, cred, credAtClose, closed, closeDone,
                 deadVars>>

(* The peer refused the request (401, or a scoped 403). For an open entry the  *)
(* session reports the rejection once to the handle that authorized it, then  *)
(* runs discovery. A late refusal to a settled entry is dropped: no report,    *)
(* no discovery. The report-twice bug reports twice for one refusal (V3).     *)
Refuse(r) ==
  /\ wf[r] = "line"
  /\ IF st[r] = "sent"
       THEN /\ st' = [st EXCEPT ![r] = "disc"]
            /\ wf' = [wf EXCEPT ![r] = "disc"]
            /\ refusals' = IF HasHandle THEN refusals + 1 ELSE refusals
            /\ cred' = IF HasHandle
                         THEN [cred EXCEPT !.report = @ + (IF "report-twice" \in Bugs THEN 2 ELSE 1)]
                         ELSE cred
       ELSE /\ wf' = [wf EXCEPT ![r] = "end"]
            /\ UNCHANGED <<st, refusals, cred>>
  /\ UNCHANGED <<out, cw, sends, firstOut, settles, cutAt, signalled, credAtClose,
                 closed, closeDone, deadVars>>

(* The answer stream broke. A read goes out once more, re-authorized; a write  *)
(* does not and settles broken. A late break of a settled entry is dropped.    *)
(* The resend-any bug re-sends a write too (V5). On a dead session the second  *)
(* sending is refused like any new request: the read settles notSent, without  *)
(* the handle and without the line (a read left in flight by SessionEnded).    *)
Broken(r) ==
  /\ wf[r] = "line"
  /\ IF st[r] = "sent"
       THEN IF CanResend(r) /\ Dead
              THEN /\ Settle(r, "notSent")
                   /\ wf' = [wf EXCEPT ![r] = "end"]
                   /\ cw' = [cw EXCEPT ![r] = "answered"]
                   /\ UNCHANGED cred
            ELSE IF CanResend(r)
              THEN /\ st' = [st EXCEPT ![r] = "auth"]
                   /\ wf' = [wf EXCEPT ![r] = "auth"]
                   /\ cred' = Authorize
                   /\ UNCHANGED <<out, firstOut, settles, cw>>
              ELSE /\ Settle(r, "broken")
                   /\ wf' = [wf EXCEPT ![r] = "end"]
                   /\ cw' = [cw EXCEPT ![r] = "answered"]
                   /\ UNCHANGED cred
       ELSE /\ wf' = [wf EXCEPT ![r] = "end"]
            /\ cw' = [cw EXCEPT ![r] = "answered"]
            /\ NoSettle
            /\ UNCHANGED cred
  /\ UNCHANGED <<sends, cutAt, signalled, refusals, credAtClose, closed, closeDone, deadVars>>

(* Discovery finished (the metadata came back). An open entry settles           *)
(* authorization-required. A settled entry (cut while discovering) gets         *)
(* nothing: the content is dropped.                                            *)
DiscDone(r) ==
  /\ wf[r] = "disc"
  /\ wf' = [wf EXCEPT ![r] = "end"]
  /\ cw' = [cw EXCEPT ![r] = "answered"]
  /\ IF st[r] = "disc"
       THEN Settle(r, "authReq")
       ELSE NoSettle
  /\ UNCHANGED <<sends, cutAt, signalled, refusals, cred, credAtClose, closed, closeDone,
                 deadVars>>

(* The caller's signal fires. An in-flight entry settles at once by its phase: *)
(* authorizing -> notSent, handed to the line -> abandoned, discovering ->      *)
(* authReq. Before Begin the signal is only remembered (Begin refuses); after   *)
(* settlement it changes nothing. The signal-dead bug settles nothing (V4).     *)
Signal(r) ==
  /\ r \notin signalled
  /\ signalled' = signalled \cup {r}
  /\ IF st[r] \in InFlightPhases /\ "signal-dead" \notin Bugs
       THEN /\ Settle(r, CASE st[r] = "auth" -> "notSent"
                           [] st[r] = "sent" -> "abandoned"
                           [] st[r] = "disc" -> "authReq")
            /\ cutAt' = [cutAt EXCEPT ![r] = st[r]]
            /\ cw' = IF CallerFollows THEN cw ELSE [cw EXCEPT ![r] = "answered"]
       ELSE /\ NoSettle
            /\ UNCHANGED <<cutAt, cw>>
  /\ UNCHANGED <<wf, sends, refusals, cred, credAtClose, closed, closeDone, deadVars>>

(* The settlement close() applies to every in-flight entry, by its phase:       *)
(* authorizing -> notSent, handed to the line -> abandoned, discovering ->       *)
(* authReq. The close-not-sent bug answers a handed-over entry notSent (V6).    *)
CloseSettles ==
  LET InFlight == {r \in Reqs : st[r] \in InFlightPhases}
      answer == [r \in Reqs |->
                   CASE st[r] = "auth" -> "notSent"
                     [] st[r] = "sent" -> (IF "close-not-sent" \in Bugs THEN "notSent" ELSE "abandoned")
                     [] st[r] = "disc" -> "authReq"
                     [] OTHER -> out[r]]
  IN
  /\ st' = [r \in Reqs |-> IF r \in InFlight THEN "done" ELSE st[r]]
  /\ out' = answer
  /\ firstOut' = [r \in Reqs |-> IF r \in InFlight /\ firstOut[r] = "none" THEN answer[r] ELSE firstOut[r]]
  /\ settles' = [r \in Reqs |-> IF r \in InFlight THEN settles[r] + 1 ELSE settles[r]]
  /\ cutAt' = [r \in Reqs |-> IF r \in InFlight THEN st[r] ELSE cutAt[r]]
  /\ cw' = IF CallerFollows THEN cw
           ELSE [r \in Reqs |-> IF r \in InFlight THEN "answered" ELSE cw[r]]

(* close() marks the session closed, records the credential counts, and        *)
(* settles every in-flight entry in the same step. It does not wait for the    *)
(* handle, the line or the discovery. The close-settles-after-line bug settles  *)
(* only when the line's close answers (V4).                                     *)
Close ==
  /\ ~closed
  /\ closed' = TRUE
  /\ credAtClose' = cred
  /\ IF "close-settles-after-line" \in Bugs
       THEN UNCHANGED <<st, out, firstOut, settles, cutAt, cw>>
       ELSE CloseSettles
  /\ UNCHANGED <<wf, sends, signalled, refusals, cred, closeDone, deadVars>>

(* The line's close answered: close() returns. *)
LineClosed ==
  /\ closed /\ ~closeDone
  /\ closeDone' = TRUE
  /\ IF "close-settles-after-line" \in Bugs
       THEN CloseSettles
       ELSE UNCHANGED <<st, out, firstOut, settles, cutAt, cw>>
  /\ UNCHANGED <<wf, sends, signalled, refusals, cred, credAtClose, closed, deadVars>>

(* The settlement of a disconnect. The entries of `own` got the 404 of T8 S07   *)
(* and answer `ended`. The entries of `cut` settle by phase where the line      *)
(* decides their fate: authorizing -> notSent, as for the signal and close();   *)
(* handed to the line -> `sentAnswer`, or they stay in flight when it is        *)
(* "none". A discovering entry stays in flight: the discovery finishes it, or   *)
(* the signal or close() settles it. The snapshot records each entry of `cut`:  *)
(* its phase, the cause and its answer after this step. `sends` and            *)
(* `cred.auth` are recorded when the session becomes dead.                      *)
DeadSettles(own, cut, cause, sentAnswer) ==
  LET given == [r \in Reqs |->
                  IF r \in own THEN "ended"
                  ELSE IF r \notin cut THEN out[r]
                  ELSE IF st[r] = "auth" THEN "notSent"
                  ELSE IF st[r] = "disc" THEN "none"
                  ELSE sentAnswer]
      stops == {r \in cut : given[r] # "none"}
      settled == own \cup stops
  IN
  /\ st' = [r \in Reqs |-> IF r \in settled THEN "done" ELSE st[r]]
  /\ out' = given
  /\ firstOut' = [r \in Reqs |-> IF r \in settled /\ firstOut[r] = "none" THEN given[r] ELSE firstOut[r]]
  /\ settles' = [r \in Reqs |-> IF r \in settled THEN settles[r] + 1 ELSE settles[r]]
  /\ cw' = [r \in Reqs |-> IF r \in own \/ (r \in stops /\ ~CallerFollows) THEN "answered" ELSE cw[r]]
  /\ deadAt' = [r \in Reqs |-> IF r \in cut THEN st[r] ELSE deadAt[r]]
  /\ deadBy' = [r \in Reqs |-> IF r \in cut THEN cause ELSE deadBy[r]]
  /\ deadOut' = [r \in Reqs |-> IF r \in cut THEN given[r] ELSE deadOut[r]]
  /\ sendsAtDead' = IF Dead THEN sendsAtDead ELSE sends
  /\ authAtDead' = IF Dead THEN authAtDead ELSE cred.auth

(* The line went away: a broken stream, an exited process, or the end of the    *)
(* shared stream of the old HTTP+SSE mode (T8 S01-S04, the SSE mode). In the   *)
(* same step, authorizing -> notSent and handed to the line -> broken (no-answer *)
(* with the cause, never sent again). A discovering entry is not touched. The    *)
(* handle may hang on.                                                           *)
LineGone ==
  /\ ~gone
  /\ gone' = TRUE
  /\ DeadSettles({}, {q \in Reqs : st[q] \in InFlightPhases}, "gone", "broken")
  /\ UNCHANGED <<wf, sends, cutAt, signalled, refusals, cred, credAtClose, closed,
                 closeDone, ended>>

\* The phases SessionEnded settles the other entries at. The
\* ended-leaves-authorizing bug leaves the authorizing entries as they are.
EndedCuts == IF "ended-leaves-authorizing" \in Bugs THEN {"sent", "disc"} ELSE InFlightPhases

(* The peer answered the request with 404 for an old session (T8 S07). An open  *)
(* entry answers `ended` (not-sent, session-ended) and the session is dead: the *)
(* other authorizing entries settle notSent in the same step. The other        *)
(* entries handed to the line and the discovering entries stay in flight: their *)
(* own answers decide. A late 404 to a settled entry is dropped.                *)
SessionEnded(r) ==
  /\ wf[r] = "line"
  /\ wf' = [wf EXCEPT ![r] = "end"]
  /\ IF st[r] = "sent"
       THEN /\ ended' = TRUE
            /\ DeadSettles({r}, {q \in Reqs \ {r} : st[q] \in EndedCuts}, "ended", "none")
       ELSE /\ cw' = [cw EXCEPT ![r] = "answered"]
            /\ UNCHANGED <<st, out, firstOut, settles, ended, deadAt, deadBy, deadOut,
                           sendsAtDead, authAtDead>>
  /\ UNCHANGED <<sends, cutAt, signalled, refusals, cred, credAtClose, closed, closeDone, gone>>

Next ==
  \/ \E r \in Reqs :
       Begin(r) \/ AuthDone(r) \/ Answer(r) \/ Refuse(r) \/ Broken(r)
         \/ DiscDone(r) \/ Signal(r) \/ SessionEnded(r)
  \/ Close
  \/ LineClosed
  \/ LineGone

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* The six properties as safety invariants (V1-V6 of SPEC「性质与证据」). *)

TypeOK ==
  /\ st \in [Reqs -> Phases]
  /\ out \in [Reqs -> Outcomes]
  /\ wf \in [Reqs -> Stages]
  /\ cw \in [Reqs -> Waits]
  /\ sends \in [Reqs -> Nat]
  /\ settles \in [Reqs -> Nat]
  /\ firstOut \in [Reqs -> Outcomes]
  /\ cutAt \in [Reqs -> Cuts]
  /\ signalled \subseteq Reqs
  /\ refusals \in Nat
  /\ cred \in [auth : Nat, report : Nat]
  /\ credAtClose \in [auth : Nat, report : Nat]
  /\ closed \in BOOLEAN
  /\ closeDone \in BOOLEAN
  /\ gone \in BOOLEAN
  /\ ended \in BOOLEAN
  /\ deadAt \in [Reqs -> Cuts]
  /\ deadBy \in [Reqs -> Causes]
  /\ deadOut \in [Reqs -> Outcomes]
  /\ sendsAtDead \in [Reqs -> Nat]
  /\ authAtDead \in Nat

Settled(r) == st[r] = "done"

\* V1 恰好结算一次: an entry is settled once; its answer is the first answer and
\* is not rewritten by a later event; an unsettled entry has no answer.
V1_SettleOnce ==
  \A r \in Reqs :
    /\ settles[r] =< 1
    /\ Settled(r) <=> settles[r] = 1
    /\ Settled(r) => out[r] = firstOut[r]
    /\ ~Settled(r) => out[r] = "none"

\* V2 关闭、断开之后不碰凭据与线路 (close side): from close() on, the handle
\* is not called again.
V2_NoCredentialAfterClose == closed => cred = credAtClose

\* V2 (disconnect side): once the session is dead, no request goes out any more
\* and the handle's `authorize` is not called any more. `reportRejection` may
\* still answer the refusal of an entry SessionEnded left in flight.
V2_NoWireAfterDead == Dead => sends = sendsAtDead /\ cred.auth = authAtDead

\* V3 拒绝至多一次: reportRejection at most once per refusal of an open request
\* on a material with a handle.
V3_RejectAtMostOnce == cred.report =< refusals

\* V4 有界 (signal): once the signal fired, the entry is settled and the caller
\* is no longer waiting, whatever the ports do.
V4_SignalBounded ==
  \A r \in signalled : st[r] \in {"init", "done"} /\ cw[r] # "waiting"

\* V4 有界 (close): once close() was called, every entry is settled and no
\* caller is waiting, whatever the ports do.
V4_CloseBounded ==
  closed => \A r \in Reqs : st[r] \in {"init", "done"} /\ cw[r] # "waiting"

\* V4 有界 (disconnect): once the session is dead, no entry is authorizing, and
\* after LineGone none is handed to the line either; every entry a disconnect
\* settled no longer keeps its caller waiting, whatever the handle does. Only
\* the two phases whose fate depends on the line are covered: a discovering
\* entry is released by the discovery, the signal or close(), as before the
\* disconnect. Entries SessionEnded left on the line wait for their own answers.
V4_DeadBounded ==
  Dead => \A r \in Reqs :
            /\ st[r] # "auth"
            /\ gone => st[r] # "sent"
            /\ st[r] = "done" => cw[r] # "waiting"

\* V5 不代调用方重发: a write goes out once, a read at most twice.
V5_NoResendForCaller == \A r \in Reqs : sends[r] =< SendLimit(r)

\* V6 三相的去向: the signal and close() answer an entry by the phase they cut
\* it at; a request begun after close(), after its signal or on a dead session
\* is notSent. A disconnect answers an authorizing entry notSent; an entry
\* handed to the line is broken after LineGone and is not settled by
\* SessionEnded; a discovering entry is not settled by either, and its answer
\* stays authReq when something else settles it.
V6_ByPhase ==
  \A r \in Reqs :
    /\ cutAt[r] # "none" =>
         out[r] = CASE cutAt[r] = "init" -> "notSent"
                    [] cutAt[r] = "auth" -> "notSent"
                    [] cutAt[r] = "sent" -> "abandoned"
                    [] cutAt[r] = "disc" -> "authReq"
    /\ deadAt[r] # "none" =>
         CASE deadAt[r] = "auth" -> out[r] = "notSent"
           [] deadAt[r] = "disc" -> deadOut[r] = "none" /\ out[r] \in {"none", "authReq"}
           [] deadAt[r] = "sent" -> IF deadBy[r] = "gone" THEN out[r] = "broken"
                                    ELSE deadOut[r] = "none"

=============================================================================

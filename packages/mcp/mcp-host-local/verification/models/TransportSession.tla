-------------------------- MODULE TransportSession --------------------------
(***************************************************************************)
(* The request lifecycle of one `Session` (src/session.ts) over one line, *)
(* for the properties V1-V6 of ../../SPEC.md "性质与证据". The model keeps  *)
(* only what those properties observe: each request moves init -> auth ->  *)
(* sent -> (disc ->) done, the credential handle authorizes it and hears   *)
(* a refusal, the wire answers or breaks, the caller's signal abandons it,  *)
(* and `close()` abandons what is in flight and then the line closes.       *)
(*                                                                          *)
(* The line, the wire and the real protocol are abstracted to the answers   *)
(* the session draws a conclusion from (T8): a result, a refusal (401 or a  *)
(* scoped 403), a broken stream, or nothing. A port may hang: the action    *)
(* that would answer it is simply not taken. `close()` and the signal do    *)
(* not wait for a hanging wire; they settle the request themselves.         *)
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

BugNames == {"signal-dead", "cred-after-close", "report-twice", "resend-any",
             "close-not-sent", "close-after-line", "resettle"}

ASSUME Writes \subseteq Reqs
ASSUME HasHandle \in BOOLEAN
ASSUME MaxSends \in Nat /\ MaxSends >= 1
ASSUME Bugs \subseteq BugNames

VARIABLES
  st,              \* [Reqs -> phase]: init, auth(orizing), sent, disc(overy), done
  out,            \* [Reqs -> outcome]: none, result, abandoned, notSent, authReq, broken
  sends,          \* [Reqs -> Nat]: how many times the request went out
  authed,         \* [Reqs -> BOOLEAN]: the handle authorized this request
  refused,        \* [Reqs -> BOOLEAN]: the peer refused it (401/403-scope) while authorized
  signalled,      \* SUBSET Reqs: the caller's signal fired for these
  rr,             \* Nat: how many times reportRejection was called
  closed,         \* close() was called
  closeDone,      \* close() returned
  credAfterClose, \* a credential call was made after close() returned (V2 breach)
  resettled,      \* a request settled a second time (V1 breach)
  closeAnswerBad  \* close() answered an in-flight request with the wrong outcome (V6 breach)

vars == <<st, out, sends, authed, refused, signalled, rr, closed, closeDone,
          credAfterClose, resettled, closeAnswerBad>>

Phases == {"init", "auth", "sent", "disc", "done"}
Outcomes == {"none", "result", "abandoned", "notSent", "authReq", "broken"}

SendLimit(r) == IF r \in Writes THEN 1 ELSE MaxSends
CanResend(r) == (r \notin Writes \/ "resend-any" \in Bugs) /\ sends[r] < MaxSends

Init ==
  /\ st = [r \in Reqs |-> "init"]
  /\ out = [r \in Reqs |-> "none"]
  /\ sends = [r \in Reqs |-> 0]
  /\ authed = [r \in Reqs |-> FALSE]
  /\ refused = [r \in Reqs |-> FALSE]
  /\ signalled = {}
  /\ rr = 0
  /\ closed = FALSE
  /\ closeDone = FALSE
  /\ credAfterClose = FALSE
  /\ resettled = FALSE
  /\ closeAnswerBad = FALSE

-----------------------------------------------------------------------------
(* The caller begins a request. Normally only while the transport is open;  *)
(* the cred-after-close bug lets one begin afterwards, which authorizes with *)
(* the handle the holder may already have released (V2).                     *)
Begin(r) ==
  /\ st[r] = "init"
  /\ (~closed \/ "cred-after-close" \in Bugs)
  /\ IF closed
       THEN /\ st' = [st EXCEPT ![r] = "done"]
            /\ out' = [out EXCEPT ![r] = "notSent"]
            /\ credAfterClose' = (credAfterClose \/ (HasHandle /\ closeDone))
            /\ UNCHANGED <<authed>>
       ELSE /\ st' = [st EXCEPT ![r] = "auth"]
            /\ authed' = [authed EXCEPT ![r] = HasHandle]
            /\ UNCHANGED <<out, credAfterClose>>
  /\ UNCHANGED <<sends, refused, signalled, rr, closed, closeDone, resettled, closeAnswerBad>>

(* The handle authorized the request and it went out. *)
AuthDone(r) ==
  /\ st[r] = "auth"
  /\ st' = [st EXCEPT ![r] = "sent"]
  /\ sends' = [sends EXCEPT ![r] = @ + 1]
  /\ UNCHANGED <<out, authed, refused, signalled, rr, closed, closeDone,
                 credAfterClose, resettled, closeAnswerBad>>

(* The peer answered the request. The resettle bug settles a done request    *)
(* again, so a late answer changes a settled request (V1).                   *)
Answer(r) ==
  /\ (st[r] = "sent" \/ ("resettle" \in Bugs /\ st[r] = "done"))
  /\ IF st[r] = "done"
       THEN /\ resettled' = TRUE
            /\ UNCHANGED <<st, out>>
       ELSE /\ st' = [st EXCEPT ![r] = "done"]
            /\ out' = [out EXCEPT ![r] = "result"]
            /\ UNCHANGED <<resettled>>
  /\ UNCHANGED <<sends, authed, refused, signalled, rr, closed, closeDone,
                 credAfterClose, closeAnswerBad>>

(* The peer refused the request (401, or a scoped 403): reportRejection is    *)
(* called once for a request this handle authorized, then discovery runs.     *)
(* The report-twice bug calls it twice for one refusal (V3).                  *)
Refuse(r) ==
  /\ st[r] = "sent"
  /\ st' = [st EXCEPT ![r] = "disc"]
  /\ IF HasHandle /\ authed[r]
       THEN /\ refused' = [refused EXCEPT ![r] = TRUE]
            /\ rr' = rr + (IF "report-twice" \in Bugs THEN 2 ELSE 1)
       ELSE UNCHANGED <<refused, rr>>
  /\ UNCHANGED <<out, sends, authed, signalled, closed, closeDone,
                 credAfterClose, resettled, closeAnswerBad>>

(* The answer stream broke. A read goes out once more; a write does not. The  *)
(* resend-any bug re-sends a write too (V5).                                  *)
Broken(r) ==
  /\ st[r] = "sent"
  /\ IF CanResend(r)
       THEN /\ st' = [st EXCEPT ![r] = "auth"]
            /\ UNCHANGED <<out>>
       ELSE /\ st' = [st EXCEPT ![r] = "done"]
            /\ out' = [out EXCEPT ![r] = "broken"]
  /\ UNCHANGED <<sends, authed, refused, signalled, rr, closed, closeDone,
                 credAfterClose, resettled, closeAnswerBad>>

(* Discovery finished: the request settles authorization-required. *)
DiscDone(r) ==
  /\ st[r] = "disc"
  /\ st' = [st EXCEPT ![r] = "done"]
  /\ out' = [out EXCEPT ![r] = "authReq"]
  /\ UNCHANGED <<sends, authed, refused, signalled, rr, closed, closeDone,
                 credAfterClose, resettled, closeAnswerBad>>

(* The caller's signal fires: an authorizing request is not-sent, a sent one  *)
(* is abandoned at once (no wait for the wire), a discovering one keeps        *)
(* discovering. The signal-dead bug leaves a sent request waiting (V4).        *)
Signal(r) ==
  /\ r \notin signalled
  /\ st[r] \in {"auth", "sent", "disc"}
  /\ signalled' = signalled \cup {r}
  /\ IF "signal-dead" \in Bugs
       THEN UNCHANGED <<st, out>>
       ELSE /\ st' = [st EXCEPT ![r] = IF st[r] = "disc" THEN "disc" ELSE "done"]
            /\ out' = [out EXCEPT
                 ![r] = CASE st[r] = "auth" -> "notSent"
                          [] st[r] = "sent" -> "abandoned"
                          [] OTHER -> out[r]]
  /\ UNCHANGED <<sends, authed, refused, rr, closed, closeDone,
                 credAfterClose, resettled, closeAnswerBad>>

(* close() abandons what is in flight, then the line closes. An authorizing   *)
(* request is not-sent, a sent one abandoned, a discovering one keeps          *)
(* discovering (closeDone waits for it), an un-begun one stays init. The       *)
(* close-not-sent bug answers a sent request not-sent (V6); the                *)
(* close-after-line bug returns before settling the in-flight requests (V4).   *)
CloseBug == "close-after-line" \in Bugs

Close ==
  /\ ~closed
  /\ closed' = TRUE
  /\ IF CloseBug
       THEN /\ closeDone' = TRUE
            /\ UNCHANGED <<st, out, closeAnswerBad>>
       ELSE /\ st' = [r \in Reqs |->
               IF st[r] \in {"auth", "sent"} THEN "done" ELSE st[r]]
            /\ out' = [r \in Reqs |->
               CASE st[r] = "sent" ->
                      (IF "close-not-sent" \in Bugs THEN "notSent" ELSE "abandoned")
                 [] st[r] = "auth" -> "notSent"
                 [] OTHER -> out[r]]
            /\ closeAnswerBad' =
                 (closeAnswerBad \/ ("close-not-sent" \in Bugs /\ \E r \in Reqs : st[r] = "sent"))
            /\ closeDone' = (\A r \in Reqs : st[r] \notin {"auth", "sent", "disc"})
  /\ UNCHANGED <<sends, authed, refused, signalled, rr, credAfterClose, resettled>>

(* close() returns once the discovery it waited for has finished. *)
CloseFinish ==
  /\ closed /\ ~closeDone /\ ~CloseBug
  /\ \A r \in Reqs : st[r] # "disc"
  /\ closeDone' = TRUE
  /\ UNCHANGED <<st, out, sends, authed, refused, signalled, rr, closed,
                 credAfterClose, resettled, closeAnswerBad>>

Next ==
  \/ \E r \in Reqs :
       Begin(r) \/ AuthDone(r) \/ Answer(r) \/ Refuse(r) \/ Broken(r)
         \/ DiscDone(r) \/ Signal(r)
  \/ Close
  \/ CloseFinish

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* The six properties as safety invariants (V1-V6 of SPEC「性质与证据」). *)

TypeOK ==
  /\ st \in [Reqs -> Phases]
  /\ out \in [Reqs -> Outcomes]
  /\ signalled \subseteq Reqs

NumRefused == Cardinality({r \in Reqs : refused[r]})

\* V1 恰好结算一次: a settled request is not settled again by a late event.
V1_SettleOnce == ~resettled

\* V2 关闭之后不碰凭据: no credential call after close() returned.
V2_NoCredentialAfterClose == ~credAfterClose

\* V3 拒绝至多一次: reportRejection at most once per refusal, only for authorized requests.
V3_RejectAtMostOnce == rr =< NumRefused

\* V4 有界 (close): once close() returned, no request is still in flight.
V4_CloseBounded == closeDone => \A r \in Reqs : st[r] \in {"init", "done"}

\* V4 有界 (signal): a signalled request is not left authorizing or sent.
V4_SignalBounded == \A r \in signalled : st[r] \notin {"auth", "sent"}

\* V5 不代调用方重发: a write goes out once, a read at most twice.
V5_NoResendForCaller == \A r \in Reqs : sends[r] =< SendLimit(r)

\* V6 三相的去向: close() answers each in-flight request by its phase.
V6_CloseThreePhases == ~closeAnswerBad

=============================================================================

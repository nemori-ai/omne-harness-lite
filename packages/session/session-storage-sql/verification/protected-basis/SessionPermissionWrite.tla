------------------------ MODULE SessionPermissionWrite ------------------------
(* A Session permission assignment is written by one Session commit. Nothing outside that
   commit keeps a half-finished write.

   One original operation can arrive several times (a retry, or two deliveries in flight).
   Each attempt is admitted, resolves its basis outside the transaction, and then commits.

   auth   the Identity standing of the caller. Another domain. Read at admission.
   src    the organization-layer value. Another domain. Read while the basis is resolved.
   f      the tenant-domain facts of the basis (definition projection, adoption, tenant-layer
          target). Their writers and the Session commit share one transaction domain.
   receipt  the operation receipt of Session. It is the only durable trace of the write.   *)
EXTENDS Naturals
CONSTANT Bad

Ops == {"o1"}
Procs == {<<"o1", 1>>, <<"o1", 2>>}
Op(p) == p[1]

Unread == 9
Unavailable == 8
PermitF(v) == v < 2
PermitSrc(v) == v = 0

VARIABLES f, src, auth, receipt, effects, effAt, effSeen, held,
          pc, seenF, seenSrc, startSrc, answer, settledAtAnswer

vars == <<f, src, auth, receipt, effects, effAt, effSeen, held,
          pc, seenF, seenSrc, startSrc, answer, settledAtAnswer>>
durable == <<receipt, effects, effAt, effSeen>>
facts == <<f, src, auth>>

Init ==
  /\ f = 0 /\ src = 0 /\ auth = TRUE
  /\ receipt = [o \in Ops |-> "none"]
  /\ effects = [o \in Ops |-> 0]
  /\ effAt = [o \in Ops |-> Unread]
  /\ effSeen = [o \in Ops |-> Unread]
  /\ held = [o \in Ops |-> Unread]
  /\ pc = [p \in Procs |-> "idle"]
  /\ seenF = [p \in Procs |-> Unread]
  /\ seenSrc = [p \in Procs |-> Unread]
  /\ startSrc = [p \in Procs |-> 0]
  /\ answer = [p \in Procs |-> "none"]
  /\ settledAtAnswer = [p \in Procs |-> FALSE]

\* Writers of the facts. Each is bounded, so the facts become stable.
ChangeF == f < 2 /\ f' = f + 1 /\ UNCHANGED <<src, auth, durable, held, pc, seenF, seenSrc, startSrc, answer, settledAtAnswer>>
ChangeSrc == src = 0 /\ src' = 1 /\ UNCHANGED <<f, auth, durable, held, pc, seenF, seenSrc, startSrc, answer, settledAtAnswer>>
Revoke == auth /\ auth' = FALSE /\ UNCHANGED <<f, src, durable, held, pc, seenF, seenSrc, startSrc, answer, settledAtAnswer>>

\* An attempt answers. The history variable records whether the operation was already applied.
Finish(p, a) ==
  /\ answer' = [answer EXCEPT ![p] = a]
  /\ settledAtAnswer' = [settledAtAnswer EXCEPT ![p] = receipt[Op(p)] = "applied"]
  /\ pc' = [pc EXCEPT ![p] = "done"]

\* Admission reads the Identity standing. A caller without standing gets no answer about the operation.
Admit(p) ==
  /\ pc[p] = "idle"
  /\ IF auth
       THEN /\ pc' = [pc EXCEPT ![p] = IF Bad = "query" THEN "asking" ELSE "admitted"]
            /\ startSrc' = [startSrc EXCEPT ![p] = src]
            /\ UNCHANGED <<answer, settledAtAnswer>>
       ELSE /\ Finish(p, "denied-auth")
            /\ UNCHANGED startSrc
  /\ UNCHANGED <<facts, durable, held, seenF, seenSrc>>

\* Variant "query" only: the application asks Session for the receipt before it resolves.
Ask(p) ==
  /\ pc[p] = "asking"
  /\ IF receipt[Op(p)] = "applied"
       THEN Finish(p, "applied")
       ELSE pc' = [pc EXCEPT ![p] = "admitted"] /\ UNCHANGED <<answer, settledAtAnswer>>
  /\ UNCHANGED <<facts, durable, held, seenF, seenSrc, startSrc>>

\* The organization-layer value is read now. Variant "held" reuses the value of an earlier attempt.
ReadSrc(p) ==
  /\ pc[p] = "admitted"
  /\ \E v \in (IF Bad = "held" /\ held[Op(p)] # Unread THEN {held[Op(p)]} ELSE {src, Unavailable}):
       /\ seenSrc' = [seenSrc EXCEPT ![p] = v]
       /\ held' = [held EXCEPT ![Op(p)] = IF v = Unavailable THEN @ ELSE v]
  /\ pc' = [pc EXCEPT ![p] = "sourced"]
  /\ UNCHANGED <<facts, durable, seenF, startSrc, answer, settledAtAnswer>>

ReadF(p) ==
  /\ pc[p] = "sourced"
  /\ seenF' = [seenF EXCEPT ![p] = f]
  /\ pc' = [pc EXCEPT ![p] = "resolved"]
  /\ UNCHANGED <<facts, durable, held, seenSrc, startSrc, answer, settledAtAnswer>>

Resolved(p) == seenSrc[p] # Unavailable /\ PermitSrc(seenSrc[p]) /\ PermitF(seenF[p])
Failure(p) == IF seenSrc[p] = Unavailable THEN "unavailable" ELSE "denied"
AnswersEarly == Bad \in {"early", "query"}

\* Variants "early" and "query": a failed resolution answers without going to Session.
AnswerEarly(p) ==
  /\ AnswersEarly
  /\ pc[p] = "resolved"
  /\ ~Resolved(p)
  /\ Finish(p, Failure(p))
  /\ UNCHANGED <<facts, durable, held, seenF, seenSrc, startSrc>>

\* The Session commit. It is one transaction. It recognises the receipt first.
Recognised(o) == receipt[o] = "applied" /\ Bad # "blind"
Commit(p) ==
  LET o == Op(p) IN
  /\ pc[p] = "resolved"
  /\ Resolved(p) \/ ~AnswersEarly
  /\ IF Recognised(o) THEN
          Finish(p, "applied") /\ UNCHANGED <<durable, seenF, seenSrc>>
     ELSE IF receipt[o] = "rejected" THEN
          Finish(p, "denied") /\ UNCHANGED <<durable, seenF, seenSrc>>
     ELSE IF ~Resolved(p) THEN
          \* No basis. Session answers that it cannot decide. Variant "durable" records that answer.
          /\ Finish(p, Failure(p))
          /\ receipt' = IF Bad = "durable" THEN [receipt EXCEPT ![o] = "rejected"] ELSE receipt
          /\ UNCHANGED <<effects, effAt, effSeen, seenF, seenSrc>>
     ELSE IF seenF[p] # f /\ Bad # "unguarded" THEN
          \* A basis fact changed after it was read. The transaction rolls back. The caller comes again.
          /\ Finish(p, "unavailable")
          /\ UNCHANGED <<durable, seenF, seenSrc>>
     ELSE
          /\ Finish(p, "applied")
          /\ receipt' = [receipt EXCEPT ![o] = "applied"]
          /\ effects' = [effects EXCEPT ![o] = @ + 1]
          /\ effAt' = [effAt EXCEPT ![o] = f]
          /\ effSeen' = [effSeen EXCEPT ![o] = seenF[p]]
          /\ UNCHANGED <<seenF, seenSrc>>
  /\ UNCHANGED <<facts, held, startSrc>>

Step(p) == Admit(p) \/ Ask(p) \/ ReadSrc(p) \/ ReadF(p) \/ AnswerEarly(p) \/ Commit(p)
\* Every attempt has answered. The system stays as it is.
Settled == (\A p \in Procs: pc[p] = "done") /\ UNCHANGED vars
Next == ChangeF \/ ChangeSrc \/ Revoke \/ Settled \/ \E p \in Procs: Step(p)
Spec == Init /\ [][Next]_vars /\ \A p \in Procs: WF_vars(Step(p))

\* The effect of one original operation happens at most once.
AtMostOnce == \A o \in Ops: effects[o] <= 1
\* The tenant-domain facts the effect was decided on are the facts at the commit.
CommitUsesCurrentFact == \A o \in Ops: effAt[o] = effSeen[o]
\* The organization-layer value an attempt uses is not older than the start of that attempt.
SourceIsFresh == \A p \in Procs: seenSrc[p] \notin {Unread, Unavailable} => seenSrc[p] >= startSrc[p]
\* An attempt for an operation that is already applied gets the original result. A later change of a
\* basis fact does not turn it into a denial. Only a caller without standing gets a different answer.
ReplayIsRecognised ==
  \A p \in Procs: (pc[p] = "done" /\ settledAtAnswer[p]) => answer[p] \in {"applied", "denied-auth"}
\* A resolution that failed leaves no durable verdict. A later attempt decides on its own facts.
FailedResolutionIsNotDurable == \A o \in Ops: receipt[o] # "rejected"
\* Every attempt ends once the facts stop changing.
EveryAttemptEnds == \A p \in Procs: <>(pc[p] = "done")
=============================================================================

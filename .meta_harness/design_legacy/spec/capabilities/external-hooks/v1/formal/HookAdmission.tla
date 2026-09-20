--------------------------- MODULE HookAdmission ---------------------------
EXTENDS Naturals, FiniteSets, TLC

(***************************************************************************)
(* Finite abstraction of HK-02, HK-07 and HK-15.  A single accepted S1     *)
(* item is evaluated by two ordered handlers.  The preliminary tool gate,   *)
(* current authorization barrier, hook decision and generation fence remain *)
(* separate so their races are visible to TLC.                              *)
(***************************************************************************)

CONSTANT Workers, Handlers, AllowedEffects, Mutation
ASSUME /\ Cardinality(Workers) = 2
       /\ Handlers = {1, 2}
       /\ Mutation \in {"none", "close_take", "stale_allow", "retired_effect"}

Decisions == {"allow", "ask", "deny", "close", "failed", "async_deny"}
ControlDecisions == {"allow", "ask", "deny", "close"}

VARIABLES accepted, item, oldRunInterrupted,
          nextHandler, handlerResult, completions,
          preliminaryGate, mergedGate, authCurrent, admission,
          generation, effects, taker, attemptNo, runCompletions,
          queueRevision, guardRevision

vars == <<accepted, item, oldRunInterrupted,
          nextHandler, handlerResult, completions,
          preliminaryGate, mergedGate, authCurrent, admission,
          generation, effects, taker, attemptNo, runCompletions,
          queueRevision, guardRevision>>

Rank(d) == CASE d = "allow" -> 0 [] d = "ask" -> 1 [] OTHER -> 2
Stricter(a, b) == IF Rank(a) >= Rank(b) THEN a ELSE b
ExpectedMerged ==
  IF \E h \in Handlers : handlerResult[h] \in {"deny", "close"} THEN "deny"
  ELSE IF preliminaryGate = "ask" \/ \E h \in Handlers : handlerResult[h] = "ask"
    THEN "ask"
  ELSE "allow"

Init ==
  /\ accepted = TRUE
  /\ item = "open"
  /\ oldRunInterrupted = FALSE
  /\ nextHandler = 1
  /\ handlerResult = [h \in Handlers |-> "pending"]
  /\ completions = [h \in Handlers |-> 0]
  /\ preliminaryGate \in {"allow", "ask"}
  /\ mergedGate = preliminaryGate
  /\ authCurrent = TRUE
  /\ admission = "pending"
  /\ generation = "active"
  /\ effects = {}
  /\ taker = "none"
  /\ attemptNo = [h \in Handlers |-> 1]
  /\ runCompletions = {}
  /\ queueRevision = 0
  /\ guardRevision = 0

CompleteHandler(h, result) ==
  /\ h = nextHandler
  /\ handlerResult[h] = "pending"
  /\ result \in Decisions
  /\ handlerResult' = [handlerResult EXCEPT ![h] = result]
  /\ completions' = [completions EXCEPT ![h] = @ + 1]
  /\ runCompletions' = runCompletions \cup {<<h, attemptNo[h]>>}
  /\ guardRevision' = queueRevision
  /\ nextHandler' = IF h = 1 THEN 2 ELSE 3
  /\ mergedGate' =
       IF result \in {"deny", "close"} THEN "deny"
       ELSE IF result = "ask" THEN Stricter(mergedGate, "ask")
       ELSE mergedGate
  /\ UNCHANGED <<accepted, item, oldRunInterrupted, preliminaryGate,
                  authCurrent, admission, generation, effects, taker,
                  attemptNo, queueRevision>>

CrashAndRetry(h) ==
  /\ h = nextHandler
  /\ handlerResult[h] = "pending"
  /\ attemptNo[h] = 1
  /\ attemptNo' = [attemptNo EXCEPT ![h] = 2]
  /\ runCompletions' = runCompletions \cup {<<h, 1>>}
  /\ UNCHANGED <<accepted, item, oldRunInterrupted, nextHandler,
                  handlerResult, completions, preliminaryGate, mergedGate,
                  authCurrent, admission, generation, effects, taker,
                  queueRevision, guardRevision>>

EditQueue ==
  /\ nextHandler \in Handlers
  /\ handlerResult[nextHandler] = "pending"
  /\ queueRevision = 0
  /\ queueRevision' = 1
  /\ UNCHANGED <<accepted, item, oldRunInterrupted, nextHandler,
                  handlerResult, completions, preliminaryGate, mergedGate,
                  authCurrent, admission, generation, effects, taker,
                  attemptNo, runCompletions, guardRevision>>

CloseAfterGuard ==
  /\ nextHandler = 3
  /\ \E h \in Handlers : handlerResult[h] = "close"
  /\ item = "open"
  /\ item' = "closed"
  /\ UNCHANGED <<accepted, oldRunInterrupted, nextHandler, handlerResult,
                  completions, preliminaryGate, mergedGate, authCurrent,
                  admission, generation, effects, taker, attemptNo,
                  runCompletions, queueRevision, guardRevision>>

Take(w) ==
  /\ w \in Workers
  /\ item = "open"
  /\ IF Mutation = "close_take"
        THEN TRUE
        ELSE /\ nextHandler = 3
             /\ ~\E h \in Handlers : handlerResult[h] = "close"
             /\ guardRevision = queueRevision
  /\ item' = "taken"
  /\ taker' = w
  /\ oldRunInterrupted' = TRUE
  /\ UNCHANGED <<accepted, nextHandler, handlerResult,
                  completions, preliminaryGate, mergedGate, authCurrent,
                  admission, generation, effects, attemptNo, runCompletions,
                  queueRevision, guardRevision>>

RevokeAuthorization ==
  /\ authCurrent
  /\ authCurrent' = FALSE
  /\ admission' = IF admission = "admitted" THEN "revoked" ELSE admission
  /\ UNCHANGED <<accepted, item, oldRunInterrupted, nextHandler, handlerResult,
                  completions, preliminaryGate, mergedGate,
                  generation, effects, taker, attemptNo, runCompletions,
                  queueRevision, guardRevision>>

FinalAdmission ==
  /\ admission = "pending"
  /\ nextHandler = 3
  /\ admission' =
       IF mergedGate = "deny" THEN "denied"
       ELSE IF mergedGate = "ask" THEN "awaiting_approval"
       ELSE IF Mutation = "stale_allow" \/ authCurrent THEN "admitted"
       ELSE "denied"
  /\ UNCHANGED <<accepted, item, oldRunInterrupted, nextHandler, handlerResult,
                  completions, preliminaryGate, mergedGate, authCurrent,
                  generation, effects, taker, attemptNo, runCompletions,
                  queueRevision, guardRevision>>

RetireGeneration ==
  /\ generation = "active"
  /\ generation' = "retired"
  /\ UNCHANGED <<accepted, item, oldRunInterrupted, nextHandler, handlerResult,
                  completions, preliminaryGate, mergedGate, authCurrent,
                  admission, effects, taker, attemptNo, runCompletions,
                  queueRevision, guardRevision>>

SubmitEffect(e) ==
  /\ e \in AllowedEffects
  /\ admission = "admitted"
  /\ IF Mutation = "retired_effect" THEN TRUE ELSE generation = "active"
  /\ effects' = effects \cup {<<generation, e>>}
  /\ UNCHANGED <<accepted, item, oldRunInterrupted, nextHandler, handlerResult,
                  completions, preliminaryGate, mergedGate, authCurrent,
                  admission, generation, taker, attemptNo, runCompletions,
                  queueRevision, guardRevision>>

Next ==
  \/ \E h \in Handlers, r \in Decisions : CompleteHandler(h, r)
  \/ \E h \in Handlers : CrashAndRetry(h)
  \/ EditQueue
  \/ CloseAfterGuard
  \/ \E w \in Workers : Take(w)
  \/ RevokeAuthorization
  \/ FinalAdmission
  \/ RetireGeneration
  \/ \E e \in AllowedEffects : SubmitEffect(e)

Spec == Init /\ [][Next]_vars

CompleteAny == \E h \in Handlers, r \in Decisions : CompleteHandler(h, r)
FinishGuard == CloseAfterGuard \/ FinalAdmission
SpecFair == Spec /\ WF_vars(CompleteAny) /\ WF_vars(FinishGuard)
EventuallyGuardSettles == <>(item = "closed" \/ admission # "pending")

TypeOK ==
  /\ accepted \in BOOLEAN
  /\ item \in {"open", "closed", "taken"}
  /\ oldRunInterrupted \in BOOLEAN
  /\ nextHandler \in 1..3
  /\ handlerResult \in [Handlers -> Decisions \cup {"pending"}]
  /\ completions \in [Handlers -> 0..1]
  /\ preliminaryGate \in {"allow", "ask", "deny"}
  /\ mergedGate \in {"allow", "ask", "deny"}
  /\ authCurrent \in BOOLEAN
  /\ admission \in {"pending", "admitted", "awaiting_approval", "denied", "revoked"}
  /\ generation \in {"active", "retired"}
  /\ effects \subseteq ({"active", "retired"} \X AllowedEffects)
  /\ taker \in Workers \cup {"none"}
  /\ attemptNo \in [Handlers -> 1..2]
  /\ runCompletions \subseteq (Handlers \X (1..2))
  /\ queueRevision \in 0..1
  /\ guardRevision \in 0..1

GuardDoesNotUndoAcceptance == accepted
ClosedItemNeverTaken ==
  (\E h \in Handlers : handlerResult[h] = "close") => item # "taken"
ClosedInterruptThenRunDoesNotInterrupt ==
  (\E h \in Handlers : handlerResult[h] = "close") => ~oldRunInterrupted
DecisionNeverLessRestrictive == Rank(mergedGate) >= Rank(preliminaryGate)
AsyncNeverControls == mergedGate = ExpectedMerged
FailureNeverGrantsAuthority ==
  (\E h \in Handlers : handlerResult[h] = "failed") => Rank(mergedGate) >= Rank(preliminaryGate)
ExactlyOneCompletionPerInvocation ==
  /\ \A h \in Handlers :
       \A a \in 1..(attemptNo[h] - 1) : <<h, a>> \in runCompletions
  /\ \A h \in Handlers :
       (handlerResult[h] # "pending") => <<h, attemptNo[h]>> \in runCompletions
  /\ Cardinality(runCompletions) =
       Cardinality({<<h, a>> \in Handlers \X (1..2) :
         a < attemptNo[h] \/ (a = attemptNo[h] /\ handlerResult[h] # "pending")})
NoAdmissionAfterRevoke == admission = "admitted" => authCurrent
EffectsWithinHK02PowerSet == \A x \in effects : x[2] \in AllowedEffects
RetiredGenerationCannotCreateNewEffects == \A x \in effects : x[1] = "active"

GuardFinished == nextHandler = 3
CloseReachable == item = "closed"
TakeReachable == item = "taken"
RevokeReachable == ~authCurrent
AdmissionReachable == admission # "pending"
EffectReachable == effects # {}
=============================================================================

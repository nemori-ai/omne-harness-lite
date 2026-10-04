----------------------------- MODULE Runner -----------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS NumPieces, NumWorkers, MaxAttempts, MaxCrashes,
          UsesFence, DurableDedupe, CommitFirst, RestoreFromDurable,
          DedupeReminders, DedupeCards, EnforceFence, RespectStop,
          RespectRetryGuard, ResumeAnswered

Workers == 1..NumWorkers
Pieces == 1..NumPieces
Kinds == {"observed", "rewrite", "inject", "stop", "retry", "ask"}
FinalKinds == Kinds \ {"ask"}
Values == 0..1

VARIABLES log, pc, cursor, workerAttempt, pendingKind, pendingValue,
          pendingGuard, localSubject, attempt, crashes, cards, answered,
          reminders, reminderDone, results, replayed, allowRetry,
          badStart, badInput, badStale

vars == <<log, pc, cursor, workerAttempt, pendingKind, pendingValue,
          pendingGuard, localSubject, attempt, crashes, cards, answered,
          reminders, reminderDone, results, replayed, allowRetry,
          badStart, badInput, badStale>>

Finals(s) == SelectSeq(s, LAMBDA e: e.kind \in FinalKinds)
HasFinal(i) == \E k \in 1..Len(log): log[k].piece = i /\ log[k].kind \in FinalKinds
HasAsk(i) == \E k \in 1..Len(log): log[k].piece = i /\ log[k].kind = "ask"
Prefix(i) == SelectSeq(log, LAMBDA e: e.piece < i)
Rewrites(s) == SelectSeq(s, LAMBDA e: e.kind = "rewrite")
Subject(s) == IF Len(Rewrites(s)) = 0 THEN 0
              ELSE Rewrites(s)[Len(Rewrites(s))].value
Controls(s) == SelectSeq(s, LAMBDA e: e.kind \in {"stop", "retry"})
Stopped(s) == Len(Controls(s)) > 0
Result(s) == [effect |-> IF Stopped(s) THEN Controls(s)[1].kind ELSE "proceed",
              value |-> Subject(s)]
NextPiece == Len(Finals(log)) + 1
PassComplete == Stopped(log) \/ NextPiece > NumPieces
NeedsReminders == {i \in Pieces: \E k \in 1..Len(log):
                    log[k].piece = i /\ log[k].kind = "inject"}
FenceAllows(w) == ~UsesFence \/ ~EnforceFence \/ workerAttempt[w] = attempt

Init ==
  /\ log = <<>>
  /\ pc = [w \in Workers |-> "idle"]
  /\ cursor = [w \in Workers |-> 1]
  /\ workerAttempt = [w \in Workers |-> 1]
  /\ pendingKind = [w \in Workers |-> "observed"]
  /\ pendingValue = [w \in Workers |-> 0]
  /\ pendingGuard = [w \in Workers |-> FALSE]
  /\ localSubject = [w \in Workers |-> 0]
  /\ attempt = 1
  /\ crashes = 0
  /\ cards = [i \in Pieces |-> 0]
  /\ answered = {}
  /\ reminders = [i \in Pieces |-> 0]
  /\ reminderDone = {}
  /\ results = {}
  /\ replayed = [w \in Workers |-> FALSE]
  /\ allowRetry \in BOOLEAN
  /\ badStart = FALSE
  /\ badInput = FALSE
  /\ badStale = FALSE

Begin(w, i, kind, value) ==
  /\ pc[w] = "idle"
  /\ i \in Pieces /\ kind \in Kinds /\ value \in Values
  /\ ~HasFinal(i)
  /\ (~RespectStop \/ ~Stopped(log))
  /\ (IF CommitFirst THEN i = NextPiece ELSE TRUE)
  /\ (~HasAsk(i) \/ (i \in answered /\ ResumeAnswered))
  /\ (kind # "ask" \/ ~HasAsk(i))
  /\ LET input == IF RestoreFromDurable THEN Subject(Prefix(i)) ELSE localSubject[w]
         output == IF kind = "retry" /\ ~allowRetry /\ RespectRetryGuard
                   THEN "observed" ELSE kind
     IN /\ pc' = [pc EXCEPT ![w] = "ready"]
        /\ cursor' = [cursor EXCEPT ![w] = i]
        /\ workerAttempt' = [workerAttempt EXCEPT ![w] = attempt]
        /\ pendingKind' = [pendingKind EXCEPT ![w] = output]
        /\ pendingValue' = [pendingValue EXCEPT ![w] = IF output = "rewrite" THEN value ELSE input]
        /\ pendingGuard' = [pendingGuard EXCEPT ![w] = allowRetry]
        /\ localSubject' = [localSubject EXCEPT ![w] = input]
        /\ badStart' = (badStart \/ (\E j \in 1..(i-1): ~HasFinal(j)))
        /\ badInput' = (badInput \/ input # Subject(Prefix(i)))
  /\ UNCHANGED <<log, attempt, crashes, cards, answered, reminders,
                 reminderDone, results, replayed, allowRetry, badStale>>

Commit(w) ==
  /\ pc[w] = "ready" /\ FenceAllows(w)
  /\ (~DurableDedupe \/ ~HasFinal(cursor[w]))
  /\ (pendingKind[w] # "ask" \/ ~HasAsk(cursor[w]))
  /\ (~RespectStop \/ ~Stopped(Prefix(cursor[w])))
  /\ Len(log) < 2 * NumPieces + 1
  /\ log' = Append(log, [piece |-> cursor[w], kind |-> pendingKind[w],
                         value |-> pendingValue[w], epoch |-> workerAttempt[w],
                         guarded |-> pendingGuard[w]])
  /\ pc' = [pc EXCEPT ![w] = "idle"]
  /\ localSubject' = [localSubject EXCEPT ![w] = pendingValue[w]]
  /\ badStale' = (badStale \/ (UsesFence /\ workerAttempt[w] # attempt))
  /\ UNCHANGED <<cursor, workerAttempt, pendingKind, pendingValue, pendingGuard,
                 attempt, crashes, cards, answered, reminders, reminderDone,
                 results, replayed, allowRetry, badStart, badInput>>

DiscardPending(w) ==
  /\ pc[w] = "ready"
  /\ ((UsesFence /\ workerAttempt[w] # attempt) \/ HasFinal(cursor[w])
       \/ (pendingKind[w] = "ask" /\ HasAsk(cursor[w]))
       \/ (RespectStop /\ Stopped(Prefix(cursor[w]))))
  /\ pc' = [pc EXCEPT ![w] = "idle"]
  /\ UNCHANGED <<log, cursor, workerAttempt, pendingKind, pendingValue,
                 pendingGuard, localSubject, attempt, crashes, cards, answered,
                 reminders, reminderDone, results, replayed, allowRetry,
                 badStart, badInput, badStale>>

Refresh(w) ==
  /\ pc[w] = "idle" /\ workerAttempt[w] # attempt
  /\ workerAttempt' = [workerAttempt EXCEPT ![w] = attempt]
  /\ UNCHANGED <<log, pc, cursor, pendingKind, pendingValue, pendingGuard,
                 localSubject, attempt, crashes, cards, answered, reminders,
                 reminderDone, results, replayed, allowRetry, badStart,
                 badInput, badStale>>

PublishCard(i) ==
  /\ HasAsk(i) /\ cards[i] < 2
  /\ (~DedupeCards \/ cards[i] = 0)
  /\ cards' = [cards EXCEPT ![i] = @ + 1]
  /\ UNCHANGED <<log, pc, cursor, workerAttempt, pendingKind, pendingValue,
                 pendingGuard, localSubject, attempt, crashes, answered,
                 reminders, reminderDone, results, replayed, allowRetry,
                 badStart, badInput, badStale>>

Answer(i) ==
  /\ cards[i] > 0 /\ i \notin answered
  /\ answered' = answered \cup {i}
  /\ UNCHANGED <<log, pc, cursor, workerAttempt, pendingKind, pendingValue,
                 pendingGuard, localSubject, attempt, crashes, cards,
                 reminders, reminderDone, results, replayed, allowRetry,
                 badStart, badInput, badStale>>

PublishReminder(w, i) ==
  /\ PassComplete /\ i \in NeedsReminders /\ reminders[i] < 2
  /\ FenceAllows(w)
  /\ (~DedupeReminders \/ i \notin reminderDone)
  /\ reminders' = [reminders EXCEPT ![i] = @ + 1]
  /\ reminderDone' = reminderDone \cup {i}
  /\ badStale' = (badStale \/ (UsesFence /\ workerAttempt[w] # attempt))
  /\ UNCHANGED <<log, pc, cursor, workerAttempt, pendingKind, pendingValue,
                 pendingGuard, localSubject, attempt, crashes, cards, answered,
                 results, replayed, allowRetry, badStart, badInput>>

Return(w) ==
  /\ pc[w] = "idle" /\ PassComplete
  /\ NeedsReminders \subseteq reminderDone
  /\ results' = results \cup {IF RestoreFromDurable THEN Result(log)
                              ELSE [effect |-> Result(log).effect, value |-> localSubject[w]]}
  /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<log, cursor, workerAttempt, pendingKind, pendingValue,
                 pendingGuard, localSubject, attempt, crashes, cards, answered,
                 reminders, reminderDone, replayed, allowRetry,
                 badStart, badInput, badStale>>

Replay(w) ==
  /\ pc[w] = "done" /\ ~replayed[w]
  /\ pc' = [pc EXCEPT ![w] = "idle"]
  /\ replayed' = [replayed EXCEPT ![w] = TRUE]
  /\ localSubject' = [localSubject EXCEPT ![w] = 0]
  /\ UNCHANGED <<log, cursor, workerAttempt, pendingKind, pendingValue,
                 pendingGuard, attempt, crashes, cards, answered,
                 reminders, reminderDone, results, allowRetry,
                 badStart, badInput, badStale>>

Crash ==
  /\ crashes < MaxCrashes
  /\ crashes' = crashes + 1
  /\ pc' = [w \in Workers |-> "idle"]
  /\ cursor' = [w \in Workers |-> 1]
  /\ pendingKind' = [w \in Workers |-> "observed"]
  /\ pendingValue' = [w \in Workers |-> 0]
  /\ pendingGuard' = [w \in Workers |-> FALSE]
  /\ localSubject' = [w \in Workers |-> 0]
  /\ UNCHANGED <<log, workerAttempt, attempt, cards, answered, reminders,
                 reminderDone, results, replayed, allowRetry,
                 badStart, badInput, badStale>>

Supersede ==
  /\ UsesFence /\ attempt < MaxAttempts
  /\ attempt' = attempt + 1
  /\ UNCHANGED <<log, pc, cursor, workerAttempt, pendingKind, pendingValue,
                 pendingGuard, localSubject, crashes, cards, answered,
                 reminders, reminderDone, results, replayed, allowRetry,
                 badStart, badInput, badStale>>

LoseRetryPermission ==
  /\ allowRetry
  /\ allowRetry' = FALSE
  /\ UNCHANGED <<log, pc, cursor, workerAttempt, pendingKind, pendingValue,
                 pendingGuard, localSubject, attempt, crashes, cards, answered,
                 reminders, reminderDone, results, replayed,
                 badStart, badInput, badStale>>

BeginAny(w) == \E i \in Pieces, k \in Kinds, v \in Values: Begin(w,i,k,v)
Next == (\E w \in Workers: BeginAny(w) \/ Commit(w) \/ DiscardPending(w)
                            \/ Refresh(w) \/ Return(w) \/ Replay(w))
        \/ (\E i \in Pieces: PublishCard(i) \/ Answer(i))
        \/ (\E w \in Workers, i \in Pieces: PublishReminder(w,i))
        \/ Crash \/ Supersede \/ LoseRetryPermission
Spec == Init /\ [][Next]_vars
FairSpec == Spec
  /\ (\A w \in Workers: WF_vars(BeginAny(w)) /\ WF_vars(Commit(w))
                         /\ WF_vars(DiscardPending(w)) /\ WF_vars(Refresh(w))
                         /\ WF_vars(Return(w)))
  /\ (\A i \in Pieces: WF_vars(PublishCard(i)))
  /\ (\A w \in Workers, i \in Pieces: WF_vars(PublishReminder(w,i)))

TypeOK == /\ log \in Seq([piece: Pieces, kind: Kinds, value: Values,
                          epoch: 1..MaxAttempts, guarded: BOOLEAN])
          /\ pc \in [Workers -> {"idle", "ready", "done"}]
          /\ cards \in [Pieces -> 0..2] /\ reminders \in [Pieces -> 0..2]
          /\ answered \subseteq Pieces /\ reminderDone \subseteq Pieces
          /\ attempt \in 1..MaxAttempts /\ crashes \in 0..MaxCrashes
          /\ badStart \in BOOLEAN /\ badInput \in BOOLEAN /\ badStale \in BOOLEAN

OneFinalConclusionPerPiece == \A i \in Pieces:
  Cardinality({k \in 1..Len(log): log[k].piece = i /\ log[k].kind \in FinalKinds}) <= 1
CommitBeforeNext == ~badStart
ReplayReproducesEffect == /\ Cardinality(results) <= 1
                          /\ \A result \in results: result = Result(log)
RemindersExactlyOnce == /\ (\A i \in Pieces: reminders[i] <= 1)
                         /\ (\A i \in Pieces: reminders[i] > 0 => i \in NeedsReminders)
                         /\ (results # {} => (\A i \in NeedsReminders: reminders[i] = 1))
OneCardPerAsk == /\ (\A i \in Pieces: cards[i] <= 1)
                 /\ (\A i \in Pieces: cards[i] > 0 => HasAsk(i))
StaleAttemptCannotWrite == ~badStale
InputsFromDurablePrefix == ~badInput
ControlStopsChain == \A a,b \in 1..Len(log):
  (a < b /\ log[a].kind \in {"stop", "retry"}) => log[b].piece <= log[a].piece
RetryPassedGuard == \A k \in 1..Len(log): log[k].kind = "retry" => log[k].guarded
AskEventuallyHasCard == \A i \in Pieces: HasAsk(i) ~> cards[i] = 1
AnsweredPassCompletes == \A i \in Pieces: (i \in answered) ~> HasFinal(i)

=============================================================================

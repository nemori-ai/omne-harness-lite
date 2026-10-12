-------------------------- MODULE ProjectionRecovery --------------------------
EXTENDS Integers, Sequences, FiniteSets, TLC
CONSTANTS MaxEvents, GuardAtomic, GuardFresh, GuardEpoch, GuardRegistration, GuardWatch
Keys == {"a", "b"}
Kinds == {"register", "update", "remove", "unrelated"}
Empty == [present |-> {}, value |-> [k \in Keys |-> -1],
          contentRevision |-> [k \in Keys |-> 0], registrationRevision |-> 0]
Apply(prior, event, position) ==
  CASE event.kind = "register" ->
    [prior EXCEPT !.present = @ \cup {event.key}, !.registrationRevision = position]
  [] event.kind = "update" ->
    [prior EXCEPT !.value[event.key] = event.value, !.contentRevision[event.key] = position]
  [] event.kind = "remove" ->
    [prior EXCEPT !.present = @ \ {event.key}, !.value[event.key] = -1,
                 !.contentRevision[event.key] = 0, !.registrationRevision = position]
  [] OTHER -> prior
RECURSIVE Fold(_, _)
Fold(entries, n) == IF n = 0 THEN Empty
                   ELSE Apply(Fold(entries, n - 1), entries[n], n)
NoStage == [active |-> FALSE, target |-> 0, basis |-> 0, epoch |-> 0, state |-> Empty]
NoReader == [phase |-> "idle", state |-> Empty, tail |-> 0, watch |-> FALSE, dirty |-> FALSE]
VARIABLES history, appliedTail, projection, epoch, staged, reader,
          running, crashes, sqlFailures, violation
vars == <<history, appliedTail, projection, epoch, staged, reader,
          running, crashes, sqlFailures, violation>>
Init == /\ history = <<>> /\ appliedTail = 0 /\ projection = Empty /\ epoch = 0
        /\ staged = NoStage /\ reader = NoReader
        /\ running = TRUE /\ crashes = 0 /\ sqlFailures = 0 /\ violation = FALSE
AppendFact(kind, key, value) ==
  LET current == Fold(history, Len(history)) IN
  /\ running /\ Len(history) < MaxEvents
  /\ (kind = "register" => key \notin current.present)
  /\ (kind \in {"update", "remove"} => key \in current.present)
  /\ history' = Append(history, [kind |-> kind, key |-> key, value |-> value])
  /\ reader' = IF reader.watch /\ kind # "unrelated" THEN [reader EXCEPT !.dirty = TRUE] ELSE reader
  /\ UNCHANGED <<appliedTail, projection, epoch, staged,
                 running, crashes, sqlFailures, violation>>
Stage == /\ running /\ ~staged.active /\ appliedTail < Len(history)
         /\ staged' = [active |-> TRUE, target |-> Len(history), basis |-> appliedTail,
                       epoch |-> epoch, state |-> Fold(history, Len(history))]
         /\ UNCHANGED <<history, appliedTail, projection, epoch, reader,
                        running, crashes, sqlFailures, violation>>
Commit ==
  LET eligible == staged.basis = appliedTail /\ staged.epoch = epoch
      allowed == ~GuardEpoch \/ eligible
      removedLast == history[staged.target].kind = "remove"
      value == IF GuardRegistration \/ ~removedLast THEN staged.state
               ELSE [staged.state EXCEPT !.registrationRevision = projection.registrationRevision]
  IN /\ running /\ staged.active
     /\ staged' = NoStage
     /\ IF allowed
        THEN /\ appliedTail' = staged.target
             /\ projection' = IF GuardAtomic THEN value ELSE projection
             /\ violation' = (violation \/ (staged.target < appliedTail))
        ELSE UNCHANGED <<appliedTail, projection, violation>>
     /\ UNCHANGED <<history, epoch, reader, running, crashes, sqlFailures>>
SqlFailure == /\ running /\ staged.active /\ sqlFailures = 0
              /\ staged' = NoStage /\ sqlFailures' = 1
              /\ UNCHANGED <<history, appliedTail, projection, epoch, reader,
                             running, crashes, violation>>
Rebuild == /\ running /\ epoch < 2
           /\ appliedTail' = Len(history) /\ projection' = Fold(history, Len(history))
           /\ epoch' = epoch + 1
           /\ UNCHANGED <<history, staged, reader, running, crashes, sqlFailures, violation>>
Crash == /\ running /\ crashes = 0 /\ crashes' = 1 /\ running' = FALSE
         /\ staged' = NoStage /\ reader' = NoReader
         /\ UNCHANGED <<history, appliedTail, projection, epoch, sqlFailures, violation>>
Recover == /\ ~running
           /\ appliedTail' = Len(history) /\ projection' = Fold(history, Len(history))
           /\ running' = TRUE /\ epoch' = epoch + 1
           /\ UNCHANGED <<history, staged, reader, crashes, sqlFailures, violation>>
BeginRead == /\ running /\ reader.phase = "idle"
             /\ reader' = [NoReader EXCEPT !.phase = "sampling", !.watch = GuardWatch]
             /\ UNCHANGED <<history, appliedTail, projection, epoch, staged,
                            running, crashes, sqlFailures, violation>>
CaptureRead == /\ running /\ reader.phase = "sampling"
               /\ reader' = [reader EXCEPT !.phase = "captured", !.state = projection,
                                          !.tail = appliedTail]
               /\ UNCHANGED <<history, appliedTail, projection, epoch, staged,
                              running, crashes, sqlFailures, violation>>
InstallLateWatch == /\ running /\ reader.phase = "captured" /\ ~reader.watch
                    /\ reader' = [reader EXCEPT !.watch = TRUE]
                    /\ UNCHANGED <<history, appliedTail, projection, epoch, staged,
                                   running, crashes, sqlFailures, violation>>
VerifyRead ==
  LET prefixOK == reader.tail = appliedTail /\ appliedTail = Len(history)
      accepted == (~GuardFresh \/ prefixOK) /\ (~GuardWatch \/ ~reader.dirty)
  IN /\ running /\ reader.phase = "captured" /\ reader.watch
     /\ reader' = IF accepted THEN [reader EXCEPT !.phase = "verified"] ELSE NoReader
     /\ UNCHANGED <<history, appliedTail, projection, epoch, staged,
                    running, crashes, sqlFailures, violation>>
FinishRead ==
  LET delivered == ~GuardWatch \/ ~reader.dirty
  IN /\ running /\ reader.phase = "verified"
     /\ reader' = NoReader
     /\ violation' = (violation \/ (delivered /\ reader.state # Fold(history, Len(history))))
     /\ UNCHANGED <<history, appliedTail, projection, epoch, staged,
                    running, crashes, sqlFailures>>
Next == (\E kind \in Kinds, key \in Keys, value \in 0..1 : AppendFact(kind, key, value))
        \/ Stage \/ Commit \/ SqlFailure \/ Rebuild \/ Crash \/ Recover \/ BeginRead \/ CaptureRead \/ InstallLateWatch \/ VerifyRead \/ FinishRead
TypeOK == /\ Len(history) <= MaxEvents /\ appliedTail \in 0..Len(history)
          /\ epoch \in 0..3 /\ crashes \in 0..1 /\ sqlFailures \in 0..1
          /\ projection.present \subseteq Keys
          /\ projection.value \in [Keys -> {-1, 0, 1}]
          /\ projection.contentRevision \in [Keys -> 0..MaxEvents]
          /\ projection.registrationRevision \in 0..MaxEvents
ProjectionMatchesPrefix == projection = Fold(history, appliedTail)
NoInvalidDeliveryOrRegression == ~violation
EventuallyCaughtUp == (running /\ appliedTail < Len(history)) ~> (appliedTail = Len(history))
Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(Stage) /\ WF_vars(Commit) /\ WF_vars(Recover)
=============================================================================

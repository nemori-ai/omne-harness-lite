-------------------------- MODULE AckLifecycle --------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS Calls, Consumers, Focus, AckConsumer, Mutation
VARIABLES phase, body, ackLog, ackKnown, ackFlight, reader, used,
          oldWriter, final, finalValid, up, crashed, badAdmission,
          settlement, temp, newWriter, readView
vars == <<phase, body, ackLog, ackKnown, ackFlight, reader, used,
          oldWriter, final, finalValid, up, crashed, badAdmission,
          settlement, temp, newWriter, readView>>
Init == /\ phase = [c \in Calls |-> "retained"]
        /\ body = [c \in Calls |-> TRUE]
        /\ ackLog = FALSE /\ ackKnown = FALSE /\ ackFlight = FALSE
        /\ reader = {} /\ used = {} /\ oldWriter = TRUE
        /\ final = FALSE /\ finalValid = TRUE
        /\ up = TRUE /\ crashed = FALSE /\ badAdmission = FALSE
        /\ settlement = "none" /\ temp = FALSE /\ newWriter = FALSE
        /\ readView = "none"
Read(c) == /\ up /\ c \in Consumers \ used /\ body[Focus]
           /\ (phase[Focus] = "retained" \/ Mutation = "admission")
           /\ reader' = reader \cup {c} /\ used' = used \cup {c}
           /\ badAdmission' = badAdmission \/ phase[Focus] # "retained"
           /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,oldWriter,
                          final,finalValid,up,crashed,settlement,temp,newWriter,readView>>
EndRead(c) == /\ c \in reader /\ reader' = reader \ {c}
              /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,used,oldWriter,
                             final,finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
Prepare(c) == /\ up /\ c = AckConsumer /\ phase[Focus] = "retained"
              /\ phase' = [phase EXCEPT ![Focus] = "retiring"]
              /\ UNCHANGED <<body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                             final,finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
AppendAck == /\ up /\ phase[Focus] = "retiring" /\ ~ackLog /\ ~ackFlight
             /\ ackFlight' = TRUE /\ ackLog' \in BOOLEAN
             /\ UNCHANGED <<phase,body,ackKnown,reader,used,oldWriter,final,finalValid,
                            up,crashed,badAdmission,settlement,temp,newWriter,readView>>
StopAckWriter == /\ ackFlight /\ ackFlight' = FALSE
                 /\ UNCHANGED <<phase,body,ackLog,ackKnown,reader,used,oldWriter,final,
                                finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
ConfirmAck == /\ up /\ ackLog /\ ~ackFlight /\ ~ackKnown
              /\ ackKnown' = TRUE /\ phase' = [phase EXCEPT ![Focus] = "acknowledged"]
              /\ UNCHANGED <<body,ackLog,ackFlight,reader,used,oldWriter,final,finalValid,
                             up,crashed,badAdmission,settlement,temp,newWriter,readView>>
OldFinal == /\ oldWriter /\ body[Focus] /\ ~final
            /\ final' = TRUE
            /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                           finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
StopOld == /\ oldWriter /\ oldWriter' = FALSE
           /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,final,
                          finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
Delete == /\ up /\ body[Focus] /\ reader = {} /\ ~ackFlight
          /\ (~oldWriter \/ Mutation = "drain")
          /\ (ackKnown \/ (Mutation = "ackFirst" /\ phase[Focus] = "retiring"))
          /\ body' = [body EXCEPT ![Focus] = FALSE]
          /\ phase' = IF Mutation = "atomic" THEN phase
                      ELSE [phase EXCEPT ![Focus] = "released"]
          /\ UNCHANGED <<ackLog,ackKnown,ackFlight,reader,used,oldWriter,final,finalValid,
                         up,crashed,badAdmission,settlement,temp,newWriter,readView>>
StartSettlement(valid) ==
          /\ up /\ ackKnown /\ ~final /\ settlement = "none"
          /\ (valid \/ Mutation = "tamper")
          /\ settlement' = "writing" /\ newWriter' = TRUE
          /\ temp' = Mutation # "temporaryBatch"
          /\ finalValid' = valid
          /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,final,
                         up,crashed,badAdmission,readView>>
CommitFinal == /\ settlement = "writing" /\ newWriter /\ ~final
               /\ final' = TRUE
               /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                              finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
StopNew == /\ newWriter /\ newWriter' = FALSE
           /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,final,
                          finalValid,up,crashed,badAdmission,settlement,temp,readView>>
EndSettlement == /\ up /\ settlement = "writing" /\ ~newWriter
                 \* final known, or complete authoritative absence + explicit policy end
                 /\ settlement' = IF final THEN "confirmed" ELSE "ended_unavailable"
                 /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                                final,finalValid,up,crashed,badAdmission,temp,newWriter,readView>>
DropTemp == /\ up /\ temp /\ settlement \in {"confirmed","ended_unavailable"}
            /\ temp' = FALSE
            /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                           final,finalValid,up,crashed,badAdmission,settlement,newWriter,readView>>
View == /\ up /\ ackKnown
        /\ readView' = IF Mutation = "missing" /\ ~body[Focus]
                        THEN "notFound" ELSE "acknowledged"
        /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,final,
                       finalValid,up,crashed,badAdmission,settlement,temp,newWriter>>
Crash == /\ up /\ ~crashed /\ up' = FALSE /\ crashed' = TRUE
         /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                        final,finalValid,badAdmission,settlement,temp,newWriter,readView>>
Recover == /\ ~up /\ up' = TRUE
           /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                          final,finalValid,crashed,badAdmission,settlement,temp,newWriter,readView>>
Next == (\E c \in Consumers : Read(c) \/ EndRead(c) \/ Prepare(c))
        \/ AppendAck \/ StopAckWriter \/ ConfirmAck \/ OldFinal \/ StopOld \/ Delete
        \/ StartSettlement(TRUE) \/ StartSettlement(FALSE) \/ CommitFinal \/ StopNew
        \/ EndSettlement \/ DropTemp \/ View \/ Crash \/ Recover
Spec == Init /\ [][Next]_vars
AdmissionClosed == ~badAdmission
WriterDrained == ~body[Focus] => ~oldWriter
AckBeforeDelete == ~body[Focus] => ackLog /\ ackKnown
AtomicDeletion == (~body[Focus]) = (phase[Focus] = "released")
ReadProtected == reader # {} => body[Focus]
OtherCallUnchanged == \A c \in Calls \ {Focus}: body[c] /\ phase[c] = "retained"
RetainedIntegrity == final => finalValid
RecoverableBatch == settlement = "writing" => temp
OldRefVisible == readView # "notFound"
CostCount == IF Mutation = "sum" THEN
               (IF final THEN 1 ELSE 0) + (IF ackLog THEN 1 ELSE 0) + (IF body[Focus] THEN 1 ELSE 0)
             ELSE IF final THEN 1 ELSE IF ackLog THEN 1 ELSE IF body[Focus] THEN 1 ELSE 0
OneAccount == CostCount = 1
FairSpec == Spec /\ WF_vars(Recover) /\ WF_vars(StopOld)
                /\ WF_vars(StopAckWriter) /\ WF_vars(ConfirmAck) /\ WF_vars(Delete)
                /\ (\A c \in Consumers: WF_vars(EndRead(c)))
                /\ WF_vars(StopNew) /\ WF_vars(EndSettlement) /\ WF_vars(DropTemp)
EventuallyReleased == ackLog ~> (phase[Focus] = "released")
EventuallyDropTemp == (settlement # "none") ~> ~temp
=============================================================================

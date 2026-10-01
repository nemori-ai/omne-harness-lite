-------------------------- MODULE AckLifecycle --------------------------
\* v-next candidate. Extends the frozen v12 AckLifecycle (byte-identical
\* base) with the settlement temp row per seam revision 2 R1/R2:
\*   appendFlight  a new-final append is in flight, receipt unknown
\*   batchGen      generation of the unsubmitted batch (1 after a
\*                 tailChanged-confirmed late reconstruction)
\*   tempGen       generation held by the temp row
\*   finalGen      generation of the committed final (2 = old writer's)
\*   logReadable   the recovery owner can read temp row and log
\* v12 CommitFinal is split into BeginAppend / AppendLands / Receipt;
\* Reconstruct, UpdateTemp, RecoveryRead, LogUp are new; EndSettlement
\* now requires a readable authoritative read, no unknown receipt and all
\* writers stopped before ending as unavailable. New mutations:
\* "staleTemp" (validity A) and "absenceUnreadable" (validity B).
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS Calls, Consumers, Focus, AckConsumer, Mutation
VARIABLES phase, body, ackLog, ackKnown, ackFlight, reader, used,
          oldWriter, final, finalValid, up, crashed, badAdmission,
          settlement, temp, newWriter, readView,
          appendFlight, batchGen, tempGen, finalGen, logReadable
vars == <<phase, body, ackLog, ackKnown, ackFlight, reader, used,
          oldWriter, final, finalValid, up, crashed, badAdmission,
          settlement, temp, newWriter, readView,
          appendFlight, batchGen, tempGen, finalGen, logReadable>>
base == <<phase, body, ackLog, ackKnown, ackFlight, reader, used,
          oldWriter, final, finalValid, up, crashed, badAdmission,
          settlement, temp, newWriter, readView>>
ext == <<appendFlight, batchGen, tempGen, finalGen, logReadable>>
Init == /\ phase = [c \in Calls |-> "retained"]
        /\ body = [c \in Calls |-> TRUE]
        /\ ackLog = FALSE /\ ackKnown = FALSE /\ ackFlight = FALSE
        /\ reader = {} /\ used = {} /\ oldWriter = TRUE
        /\ final = FALSE /\ finalValid = TRUE
        /\ up = TRUE /\ crashed = FALSE /\ badAdmission = FALSE
        /\ settlement = "none" /\ temp = FALSE /\ newWriter = FALSE
        /\ readView = "none"
        /\ appendFlight = FALSE /\ batchGen = 0 /\ tempGen = 0
        /\ finalGen = 2 /\ logReadable = TRUE
Read(c) == /\ up /\ c \in Consumers \ used /\ body[Focus]
           /\ (phase[Focus] = "retained" \/ Mutation = "admission")
           /\ reader' = reader \cup {c} /\ used' = used \cup {c}
           /\ badAdmission' = (badAdmission \/ phase[Focus] # "retained")
           /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,oldWriter,
                          final,finalValid,up,crashed,settlement,temp,newWriter,readView>>
           /\ UNCHANGED ext
EndRead(c) == /\ c \in reader /\ reader' = reader \ {c}
              /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,used,oldWriter,
                             final,finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
              /\ UNCHANGED ext
Prepare(c) == /\ up /\ c = AckConsumer /\ phase[Focus] = "retained"
              /\ phase' = [phase EXCEPT ![Focus] = "retiring"]
              /\ UNCHANGED <<body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                             final,finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
              /\ UNCHANGED ext
AppendAck == /\ up /\ phase[Focus] = "retiring" /\ ~ackLog /\ ~ackFlight
             /\ ackFlight' = TRUE /\ ackLog' \in BOOLEAN
             /\ UNCHANGED <<phase,body,ackKnown,reader,used,oldWriter,final,finalValid,
                            up,crashed,badAdmission,settlement,temp,newWriter,readView>>
             /\ UNCHANGED ext
StopAckWriter == /\ ackFlight /\ ackFlight' = FALSE
                 /\ UNCHANGED <<phase,body,ackLog,ackKnown,reader,used,oldWriter,final,
                                finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
                 /\ UNCHANGED ext
ConfirmAck == /\ up /\ ackLog /\ ~ackFlight /\ ~ackKnown
              /\ ackKnown' = TRUE /\ phase' = [phase EXCEPT ![Focus] = "acknowledged"]
              /\ UNCHANGED <<body,ackLog,ackFlight,reader,used,oldWriter,final,finalValid,
                             up,crashed,badAdmission,settlement,temp,newWriter,readView>>
              /\ UNCHANGED ext
\* Original late writer (publish permission taken before ACK) lands its own final.
OldFinal == /\ oldWriter /\ body[Focus] /\ ~final
            /\ final' = TRUE /\ finalGen' = 2
            /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                           finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
            /\ UNCHANGED <<appendFlight,batchGen,tempGen,logReadable>>
StopOld == /\ oldWriter /\ oldWriter' = FALSE
           /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,final,
                          finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
           /\ UNCHANGED ext
Delete == /\ up /\ body[Focus] /\ reader = {} /\ ~ackFlight
          /\ (~oldWriter \/ Mutation = "drain")
          /\ (ackKnown \/ (Mutation = "ackFirst" /\ phase[Focus] = "retiring"))
          /\ body' = [body EXCEPT ![Focus] = FALSE]
          /\ phase' = IF Mutation = "atomic" THEN phase
                      ELSE [phase EXCEPT ![Focus] = "released"]
          /\ UNCHANGED <<ackLog,ackKnown,ackFlight,reader,used,oldWriter,final,finalValid,
                         up,crashed,badAdmission,settlement,temp,newWriter,readView>>
          /\ UNCHANGED ext
\* A real new disposition begins: the full batch is durably held in the temp row
\* before the first append can take effect (S-99⑧); generation 0.
StartSettlement(valid) ==
          /\ up /\ ackKnown /\ ~final /\ settlement = "none"
          /\ (valid \/ Mutation = "tamper")
          /\ settlement' = "writing" /\ newWriter' = TRUE
          /\ temp' = (Mutation # "temporaryBatch")
          /\ finalValid' = valid
          /\ batchGen' = 0 /\ tempGen' = 0
          /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,final,
                         up,crashed,badAdmission,readView>>
          /\ UNCHANGED <<appendFlight,finalGen,logReadable>>
\* R1: an append may only start once the temp row holds exactly the batch being
\* appended. Mutation "staleTemp" drops that guard (validity A).
BeginAppend == /\ up /\ settlement = "writing" /\ newWriter /\ ~final /\ ~appendFlight
               /\ (tempGen = batchGen \/ Mutation = "staleTemp")
               /\ appendFlight' = TRUE
               /\ UNCHANGED base
               /\ UNCHANGED <<batchGen,tempGen,finalGen,logReadable>>
\* The in-flight append takes effect in the log (receipt may still be unknown).
AppendLands == /\ appendFlight /\ ~final
               /\ final' = TRUE /\ finalGen' = batchGen
               /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                              finalValid,up,crashed,badAdmission,settlement,temp,newWriter,readView>>
               /\ UNCHANGED <<appendFlight,batchGen,tempGen,logReadable>>
\* The living writer gets its receipt: success if landed, else tailChanged
\* (this batch wrote zero; the window is closed).
Receipt == /\ appendFlight /\ newWriter /\ appendFlight' = FALSE
           /\ UNCHANGED base
           /\ UNCHANGED <<batchGen,tempGen,finalGen,logReadable>>
\* After a confirmed zero-write the writer may reconstruct late (S-70④/S-71);
\* never while a receipt is unknown (S-70⑤).
Reconstruct == /\ up /\ settlement = "writing" /\ newWriter /\ ~final /\ ~appendFlight
               /\ batchGen = 0 /\ batchGen' = 1
               /\ UNCHANGED base
               /\ UNCHANGED <<appendFlight,tempGen,finalGen,logReadable>>
\* R1: the temp row is updated to the reconstructed batch, only while no
\* receipt is unknown.
UpdateTemp == /\ up /\ temp /\ ~appendFlight /\ tempGen # batchGen
              /\ tempGen' = batchGen
              /\ UNCHANGED base
              /\ UNCHANGED <<appendFlight,batchGen,finalGen,logReadable>>
StopNew == /\ newWriter /\ newWriter' = FALSE
           /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,final,
                          finalValid,up,crashed,badAdmission,settlement,temp,readView>>
           /\ UNCHANGED ext
\* R4 default path: all writers stopped, authoritative read available, the
\* unknown receipt is resolved by reading (final present or absent).
RecoveryRead == /\ up /\ logReadable /\ ~newWriter /\ appendFlight
                /\ appendFlight' = FALSE
                /\ UNCHANGED base
                /\ UNCHANGED <<batchGen,tempGen,finalGen,logReadable>>
\* Settlement ends only from a readable authoritative read with no unknown
\* receipt; ending as unavailable additionally needs every possible writer
\* stopped (S-70⑤, S-99⑧).
EndSettlement == /\ up /\ logReadable /\ settlement = "writing"
                 /\ ~newWriter /\ ~appendFlight /\ (final \/ ~oldWriter)
                 /\ settlement' = IF final THEN "confirmed" ELSE "ended_unavailable"
                 /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                                final,finalValid,up,crashed,badAdmission,temp,newWriter,readView>>
                 /\ UNCHANGED ext
\* Validity B: the recovery owner treats an unreadable temp row/log as a
\* zero-write and ends the write responsibility (then DropTemp releases).
PresumeAbsent == /\ Mutation = "absenceUnreadable"
                 /\ up /\ ~logReadable /\ settlement = "writing" /\ ~newWriter
                 /\ settlement' = "ended_unavailable"
                 /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                                final,finalValid,up,crashed,badAdmission,temp,newWriter,readView>>
                 /\ UNCHANGED ext
DropTemp == /\ up /\ temp /\ settlement \in {"confirmed","ended_unavailable"}
            /\ temp' = FALSE
            /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                           final,finalValid,up,crashed,badAdmission,settlement,newWriter,readView>>
            /\ UNCHANGED ext
View == /\ up /\ ackKnown
        /\ readView' = IF Mutation = "missing" /\ ~body[Focus]
                        THEN "notFound" ELSE "acknowledged"
        /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,final,
                       finalValid,up,crashed,badAdmission,settlement,temp,newWriter>>
        /\ UNCHANGED ext
Crash == /\ up /\ ~crashed /\ up' = FALSE /\ crashed' = TRUE
         /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                        final,finalValid,badAdmission,settlement,temp,newWriter,readView>>
         /\ UNCHANGED ext
\* Recovery may come back with the temp row/log temporarily unreadable.
Recover == /\ ~up /\ up' = TRUE /\ logReadable' \in BOOLEAN
           /\ UNCHANGED <<phase,body,ackLog,ackKnown,ackFlight,reader,used,oldWriter,
                          final,finalValid,crashed,badAdmission,settlement,temp,newWriter,readView>>
           /\ UNCHANGED <<appendFlight,batchGen,tempGen,finalGen>>
LogUp == /\ ~logReadable /\ logReadable' = TRUE
         /\ UNCHANGED base
         /\ UNCHANGED <<appendFlight,batchGen,tempGen,finalGen>>
Next == (\E c \in Consumers : Read(c) \/ EndRead(c) \/ Prepare(c))
        \/ AppendAck \/ StopAckWriter \/ ConfirmAck \/ OldFinal \/ StopOld \/ Delete
        \/ StartSettlement(TRUE) \/ StartSettlement(FALSE)
        \/ BeginAppend \/ AppendLands \/ Receipt \/ Reconstruct \/ UpdateTemp
        \/ StopNew \/ RecoveryRead \/ EndSettlement \/ PresumeAbsent \/ DropTemp
        \/ View \/ Crash \/ Recover \/ LogUp
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
\* R1: whenever an append may take effect, the temp row durably holds that batch.
TempCoversInflight == appendFlight => (temp /\ tempGen = batchGen)
\* R1/A consequence: a final committed by the new writer while the temp row is
\* still held is exactly the batch the recovery owner would recognise/resend.
RecoveredMatchesFinal == (final /\ temp /\ finalGen \in {0, 1}) => tempGen = finalGen
\* R2/B: ending as unavailable is only ever a confirmed absence.
EndedMeansAbsent == settlement = "ended_unavailable" => (~final /\ ~appendFlight)
FairSpec == Spec /\ WF_vars(Recover) /\ WF_vars(LogUp) /\ WF_vars(StopOld)
                /\ WF_vars(StopAckWriter) /\ WF_vars(ConfirmAck) /\ WF_vars(Delete)
                /\ (\A c \in Consumers: WF_vars(EndRead(c)))
                /\ WF_vars(Receipt) /\ WF_vars(StopNew) /\ WF_vars(RecoveryRead)
                /\ WF_vars(EndSettlement) /\ WF_vars(DropTemp)
EventuallyReleased == ackLog ~> (phase[Focus] = "released")
EventuallyDropTemp == (settlement # "none") ~> ~temp
=============================================================================

---------------------------- MODULE Maintenance ----------------------------
EXTENDS Naturals
CONSTANT Fault
ASSUME Fault \in {"none", "releaseEarly", "unknownSuccess", "plaintextEarly", "removeProtection"}
VARIABLES owner, job, phase, handles, protected, plaintext, deleted,
          published, durable, result, connected, stopping, cancelRequested, crashed
vars == <<owner, job, phase, handles, protected, plaintext, deleted,
          published, durable, result, connected, stopping, cancelRequested, crashed>>
Init == /\ owner = TRUE /\ job = TRUE /\ phase = "accepted"
        /\ handles = TRUE /\ protected = FALSE /\ plaintext = FALSE
        /\ deleted = FALSE /\ published = FALSE /\ durable = FALSE
        /\ result = "pending" /\ connected = TRUE /\ stopping = FALSE
        /\ cancelRequested = FALSE /\ crashed = FALSE
Protect == /\ job /\ phase = "accepted"
           /\ protected' = TRUE /\ phase' = "protected"
           /\ UNCHANGED <<owner, job, handles, plaintext, deleted, published,
                          durable, result, connected, stopping, cancelRequested, crashed>>
Export == /\ job /\ (phase = "protected" \/ (Fault = "plaintextEarly" /\ phase = "accepted"))
          /\ plaintext' = TRUE /\ phase' = "exporting"
          /\ UNCHANGED <<owner, job, handles, protected, deleted, published,
                         durable, result, connected, stopping, cancelRequested, crashed>>
FinishExport == /\ job /\ phase = "exporting"
                /\ handles' = FALSE /\ phase' = "checked"
                /\ UNCHANGED <<owner, job, protected, plaintext, deleted,
                               published, durable, result, connected, stopping,
                               cancelRequested, crashed>>
Publish == /\ job /\ phase = "checked" /\ ~cancelRequested
           /\ published' = TRUE /\ phase' = "published"
           /\ UNCHANGED <<owner, job, handles, protected, plaintext, deleted,
                          durable, result, connected, stopping, cancelRequested, crashed>>
CancelBeforePublish == /\ job /\ phase = "checked" /\ cancelRequested
                       /\ phase' = "cancel-cleanup"
                       /\ UNCHANGED <<owner, job, handles, protected, plaintext,
                                      deleted, published, durable, result, connected,
                                      stopping, cancelRequested, crashed>>
Confirm == /\ job /\ phase = "published"
           /\ \E confirmed \in BOOLEAN:
                 /\ durable' = confirmed
                 /\ result' = IF confirmed \/ Fault = "unknownSuccess"
                               THEN "completed" ELSE "outcome-unknown"
           /\ phase' = "cleanup"
           /\ UNCHANGED <<owner, job, handles, protected, plaintext, deleted,
                          published, connected, stopping, cancelRequested, crashed>>
Cleanup == /\ job /\ phase \in {"cleanup", "cancel-cleanup"}
           /\ plaintext' = FALSE /\ deleted' = TRUE
           /\ protected' = IF Fault = "removeProtection" THEN FALSE ELSE protected
           /\ result' = IF phase = "cancel-cleanup" THEN "cancelled" ELSE result
           /\ phase' = "settled"
           /\ UNCHANGED <<owner, job, handles, published, durable,
                          connected, stopping, cancelRequested, crashed>>
KeepResidual == /\ job /\ phase \in {"cleanup", "cancel-cleanup"}
                /\ result' = IF published THEN result ELSE "unavailable"
                /\ phase' = "settled"
                /\ UNCHANGED <<owner, job, handles, protected, plaintext, deleted,
                               published, durable, connected, stopping, cancelRequested, crashed>>
FinishJob == /\ job /\ phase = "settled" /\ ~handles
             /\ job' = FALSE /\ phase' = "ended"
             /\ UNCHANGED <<owner, handles, protected, plaintext, deleted,
                            published, durable, result, connected, stopping, cancelRequested, crashed>>
ReleaseOwner == /\ owner /\ stopping
                /\ (~job \/ Fault = "releaseEarly")
                /\ owner' = FALSE
                /\ UNCHANGED <<job, phase, handles, protected, plaintext, deleted,
                               published, durable, result, connected, stopping, cancelRequested, crashed>>
Disconnect == /\ connected /\ connected' = FALSE
              /\ UNCHANGED <<owner, job, phase, handles, protected, plaintext, deleted,
                             published, durable, result, stopping, cancelRequested, crashed>>
Stop == /\ ~stopping /\ stopping' = TRUE /\ cancelRequested' = TRUE
        /\ UNCHANGED <<owner, job, phase, handles, protected, plaintext, deleted,
                       published, durable, result, connected, crashed>>
RequestCancel == /\ ~cancelRequested /\ cancelRequested' = TRUE
                 /\ UNCHANGED <<owner, job, phase, handles, protected, plaintext,
                                deleted, published, durable, result, connected, stopping, crashed>>
Crash == /\ ~crashed
         /\ crashed' = TRUE /\ owner' = FALSE /\ job' = FALSE /\ handles' = FALSE
         /\ plaintext' = plaintext \/ deleted
         /\ phase' = "crashed"
         /\ UNCHANGED <<protected, deleted, published, durable, result,
                        connected, stopping, cancelRequested>>
Advance == Protect \/ Export \/ FinishExport \/ Publish \/ CancelBeforePublish
           \/ Confirm \/ Cleanup \/ KeepResidual \/ FinishJob
Next == Advance \/ ReleaseOwner \/ Disconnect \/ Stop \/ RequestCancel \/ Crash
Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(Advance)
TypeOK == /\ owner \in BOOLEAN /\ job \in BOOLEAN /\ handles \in BOOLEAN
          /\ protected \in BOOLEAN /\ plaintext \in BOOLEAN /\ deleted \in BOOLEAN
          /\ published \in BOOLEAN /\ durable \in BOOLEAN /\ connected \in BOOLEAN
          /\ stopping \in BOOLEAN /\ cancelRequested \in BOOLEAN /\ crashed \in BOOLEAN
          /\ phase \in {"accepted", "protected", "exporting", "checked", "published",
                         "cleanup", "cancel-cleanup", "settled", "ended", "crashed"}
          /\ result \in {"pending", "completed", "outcome-unknown", "cancelled", "unavailable"}
OwnerUntilRealEnd == job => owner
ConfirmedSuccess == result = "completed" => published /\ durable
IsolatedPlaintext == plaintext => protected
CancelledUnpublished == result = "cancelled" => ~published /\ ~handles
EndedReleasedHandles == ~job => ~handles
EventuallySettled == <> (~job)
=============================================================================

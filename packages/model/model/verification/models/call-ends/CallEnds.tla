------------------------------ MODULE CallEnds ------------------------------
(* One logical model call, from its admission to the delivery of its result.
   The driver does the execution writes of the call: prepare, open the receive
   window, preserve each batch of output, the retry record, and the settlement. The store
   answers each write: taken, refused for good, or not confirmed (the answer
   is lost or the store cannot answer now; the write took effect or it did
   not). The rule under check:

     An execution write that the store refuses for good ends the call. The
     driver drops what the store did not take and settles the call as failed.
     That settlement is never refused for good. After an answer that is not
     confirmed the driver stops, and the host runs it again. A settled call
     wakes the push, and the push delivers the result to the consumer.

     A dispatch that fails before any content, with a cause that can be
     retried, brings the call to the policy point. There the driver takes a
     retry position and asks the policy. The policy stops, or sends again
     within the bound of the request, or cannot answer; when it cannot answer
     the call ends as failed. A decided dispatch goes out when its instant has
     come, and the host wakes the driver at that instant. Once the caller
     asked to stop, no further dispatch is prepared and the call ends with the
     terminal of the dispatch that failed, whatever the retry record says.

   So every call ends, whatever the store refuses and whatever the policy
   answers, and the consumer is told. *)
EXTENDS Naturals

CONSTANTS MaxBatches,   \* batches of output the supplier sends
          MaxUnknown,   \* how many answers may be lost
          DriveEndsOnRefusal,  \* negative control: a refused write only ends the drive (the defect)
          TerminalRefusable,   \* negative control: the terminal write can be refused for good too
          NoRewake,            \* negative control: after a lost answer nothing runs the driver again
          MaxDispatches,       \* real dispatches the fixed request allows
          PolicyFailStuck,     \* negative control: a policy that cannot answer only ends the drive (the defect)
          ControlBlocksSettle  \* negative control: a retry record refuses the settlement after a stop request

VARIABLES phase,     \* "accepted", "prepared", "receiving", "deciding", "ending", "settled"
          outcome,   \* "none", "completed", "failed", "interrupted": the terminal in the store
          batches,   \* batches the store took
          sent,      \* whether the supplier got the request
          driver,    \* "idle", "running", "stopped": a stopped driver runs again only when woken
          woken,     \* whether something asked the driver to run
          cancelled, \* whether the caller asked to stop
          delivered, \* whether the consumer got the result
          unknowns,
          dispatches, \* real dispatches prepared so far
          retry,      \* "none", "positioned", "stop", "again": the retry record of the call
          due         \* whether the instant of a decided dispatch has come

vars == <<phase, outcome, batches, sent, driver, woken, cancelled, delivered, unknowns,
          dispatches, retry, due>>

Init == /\ phase = "accepted" /\ outcome = "none" /\ batches = 0 /\ sent = FALSE
        /\ driver = "idle" /\ woken = TRUE /\ cancelled = FALSE /\ delivered = FALSE
        /\ unknowns = 0 /\ dispatches = 0 /\ retry = "none" /\ due = FALSE

(* The admission woke the driver; a cancel wakes it again. Nothing else does. *)
Start == /\ driver # "running" /\ woken /\ phase # "settled"
         /\ driver' = "running" /\ woken' = FALSE
         /\ UNCHANGED <<phase, outcome, batches, sent, cancelled, delivered, unknowns,
                         dispatches, retry, due>>

Cancel == /\ ~cancelled /\ phase # "settled"
          /\ cancelled' = TRUE /\ woken' = TRUE
          /\ UNCHANGED <<phase, outcome, batches, sent, driver, delivered, unknowns,
                          dispatches, retry, due>>

(* A write the store refuses for good. *)
Refused(next) ==
  IF DriveEndsOnRefusal
    THEN /\ driver' = "stopped" /\ UNCHANGED <<phase, outcome>>
    ELSE /\ phase' = "ending" /\ outcome' = next /\ UNCHANGED driver

(* The answer of a write is not confirmed: the driver stops, and the host runs it again. *)
Lost == /\ unknowns < MaxUnknown /\ unknowns' = unknowns + 1
        /\ driver' = "stopped" /\ woken' = ~NoRewake

Prepare == /\ driver = "running" /\ phase = "accepted"
           /\ \/ /\ phase' = "prepared" /\ dispatches' = dispatches + 1
                 /\ UNCHANGED <<outcome, driver, woken, unknowns>>
              \/ /\ Refused("failed") /\ UNCHANGED <<woken, unknowns, dispatches>>
              \/ /\ Lost /\ UNCHANGED <<phase, outcome, dispatches>>
           /\ UNCHANGED <<batches, sent, cancelled, delivered, retry, due>>

(* The request goes out, and the receive window opens. *)
Send == /\ driver = "running" /\ phase = "prepared"
        /\ IF cancelled
             THEN /\ phase' = "ending" /\ outcome' = "interrupted" /\ UNCHANGED <<sent, driver, woken, unknowns>>
             ELSE \/ /\ phase' = "receiving" /\ sent' = TRUE /\ UNCHANGED <<outcome, driver, woken, unknowns>>
                  \/ /\ sent' = TRUE /\ Refused("failed") /\ UNCHANGED <<woken, unknowns>>
        /\ UNCHANGED <<batches, cancelled, delivered, dispatches, retry, due>>

(* One batch of output is preserved, or the output ends, or the supplier fails. A failure
   before any content can be retried and brings the call to the policy point; a failure
   after content, or one that cannot be retried, ends the call. *)
Preserve == /\ driver = "running" /\ phase = "receiving"
            /\ \/ /\ batches < MaxBatches /\ batches' = batches + 1
                  /\ UNCHANGED <<phase, outcome, driver, woken, unknowns>>
               \/ /\ Refused("failed") /\ UNCHANGED <<batches, woken, unknowns>>
               \/ /\ Lost /\ UNCHANGED <<phase, outcome, batches>>
               \/ /\ (batches = MaxBatches \/ cancelled)
                  /\ phase' = "ending"
                  /\ outcome' = IF cancelled THEN "interrupted" ELSE "completed"
                  /\ UNCHANGED <<batches, driver, woken, unknowns>>
               \/ /\ ~cancelled /\ batches = 0 /\ phase' = "deciding"
                  /\ UNCHANGED <<outcome, batches, driver, woken, unknowns>>
               \/ /\ ~cancelled /\ phase' = "ending" /\ outcome' = "failed"
                  /\ UNCHANGED <<batches, driver, woken, unknowns>>
            /\ UNCHANGED <<sent, cancelled, delivered, dispatches, retry, due>>

(* The caller asked to stop while the call is at the policy point. No further dispatch is
   prepared; the call ends with the terminal of the dispatch that failed. With the negative
   control a retry record that is positioned or decided to send again refuses that
   settlement, and then no write of the driver is accepted. *)
Yield == /\ driver = "running" /\ phase = "deciding" /\ cancelled
         /\ IF ControlBlocksSettle /\ retry \in {"positioned", "again"}
              THEN /\ driver' = "stopped" /\ UNCHANGED <<phase, outcome>>
              ELSE /\ phase' = "ending" /\ outcome' = "failed" /\ UNCHANGED driver
         /\ UNCHANGED <<batches, sent, woken, cancelled, delivered, unknowns, dispatches, retry, due>>

(* The driver takes the retry position. *)
Position == /\ driver = "running" /\ phase = "deciding" /\ ~cancelled /\ retry = "none"
            /\ \/ /\ retry' = "positioned" /\ UNCHANGED <<phase, outcome, driver, woken, unknowns>>
               \/ /\ Refused("failed") /\ UNCHANGED <<woken, unknowns, retry>>
               \/ /\ Lost /\ UNCHANGED <<phase, outcome, retry>>
            /\ UNCHANGED <<batches, sent, cancelled, delivered, dispatches, due>>

(* The driver asks the policy and writes its decision. The policy stops, or sends again
   within the bound of the request, or cannot answer. A decision that does not pass the
   store counts as a policy that cannot answer. *)
Decide == /\ driver = "running" /\ phase = "deciding" /\ ~cancelled /\ retry = "positioned"
          /\ \/ /\ retry' = "stop" /\ UNCHANGED <<phase, outcome, driver, woken, unknowns, due>>
             \/ /\ dispatches < MaxDispatches /\ retry' = "again" /\ due' = FALSE
                /\ UNCHANGED <<phase, outcome, driver, woken, unknowns>>
             \/ /\ IF PolicyFailStuck
                     THEN /\ driver' = "stopped" /\ UNCHANGED <<phase, outcome>>
                     ELSE /\ phase' = "ending" /\ outcome' = "failed" /\ UNCHANGED driver
                /\ UNCHANGED <<retry, woken, unknowns, due>>
             \/ /\ Lost /\ UNCHANGED <<phase, outcome, retry, due>>
          /\ UNCHANGED <<batches, sent, cancelled, delivered, dispatches>>

(* The policy stopped: the call ends as failed. *)
Stop == /\ driver = "running" /\ phase = "deciding" /\ ~cancelled /\ retry = "stop"
        /\ phase' = "ending" /\ outcome' = "failed"
        /\ UNCHANGED <<batches, sent, driver, woken, cancelled, delivered, unknowns, dispatches, retry, due>>

(* The instant of the decided dispatch has not come: the drive ends. *)
Wait == /\ driver = "running" /\ phase = "deciding" /\ ~cancelled /\ retry = "again" /\ ~due
        /\ driver' = "stopped"
        /\ UNCHANGED <<phase, outcome, batches, sent, woken, cancelled, delivered, unknowns, dispatches, retry, due>>

(* The instant comes, and the host wakes the driver. *)
Timer == /\ phase = "deciding" /\ retry = "again" /\ ~due
         /\ due' = TRUE /\ woken' = TRUE
         /\ UNCHANGED <<phase, outcome, batches, sent, driver, cancelled, delivered, unknowns, dispatches, retry>>

(* The decided dispatch is prepared. The retry record is cleared with it. *)
Redispatch == /\ driver = "running" /\ phase = "deciding" /\ ~cancelled /\ retry = "again" /\ due
              /\ \/ /\ phase' = "prepared" /\ retry' = "none" /\ due' = FALSE
                    /\ dispatches' = dispatches + 1
                    /\ UNCHANGED <<outcome, driver, woken, unknowns>>
                 \/ /\ Refused("failed") /\ UNCHANGED <<woken, unknowns, retry, due, dispatches>>
                 \/ /\ Lost /\ UNCHANGED <<phase, outcome, retry, due, dispatches>>
              /\ UNCHANGED <<batches, sent, cancelled, delivered>>

(* The settlement. The store takes it for good or does not confirm it; with the negative
   control it can refuse it too, and then nothing is left to write. *)
Settle == /\ driver = "running" /\ phase = "ending"
          /\ \/ /\ phase' = "settled" /\ driver' = "idle" /\ UNCHANGED <<woken, unknowns>>
             \/ /\ Lost /\ UNCHANGED phase
             \/ /\ TerminalRefusable /\ driver' = "stopped" /\ UNCHANGED <<phase, woken, unknowns>>
          /\ UNCHANGED <<outcome, batches, sent, cancelled, delivered, dispatches, retry, due>>

(* The settlement wakes the push; the push delivers the result. *)
Push == /\ phase = "settled" /\ ~delivered /\ delivered' = TRUE
        /\ UNCHANGED <<phase, outcome, batches, sent, driver, woken, cancelled, unknowns,
                        dispatches, retry, due>>

Next == Start \/ Cancel \/ Prepare \/ Send \/ Preserve \/ Settle \/ Push
          \/ Yield \/ Position \/ Decide \/ Stop \/ Wait \/ Timer \/ Redispatch
Spec == Init /\ [][Next]_vars
          /\ WF_vars(Start) /\ WF_vars(Prepare) /\ WF_vars(Send) /\ WF_vars(Settle) /\ WF_vars(Push)
          /\ SF_vars(Preserve /\ phase' # phase) /\ SF_vars(Preserve /\ batches' # batches)
          /\ WF_vars(Yield) /\ WF_vars(Position) /\ WF_vars(Decide) /\ WF_vars(Stop)
          /\ WF_vars(Timer) /\ WF_vars(Redispatch)

(* Safety. *)
TerminalOnlyWhenEnding == (outcome # "none") => phase \in {"ending", "settled"}
DeliveredOnlySettled == delivered => phase = "settled"
NothingAfterSettle == phase = "settled" => outcome # "none"
(* A call that was not sent never ends as completed. *)
CompletedWasSent == outcome = "completed" => sent
(* The request bounds the real dispatches of a call. *)
DispatchesBounded == dispatches <= MaxDispatches
(* A retry record exists only from the policy point on. *)
RetryOnlyFromPolicyPoint == retry # "none" => phase \in {"deciding", "ending", "settled"}

(* Liveness: every call ends, and the consumer gets its result. *)
CallEnds == <>(phase = "settled")
ResultDelivered == <>delivered
=============================================================================

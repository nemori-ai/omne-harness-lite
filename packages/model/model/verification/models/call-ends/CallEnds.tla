------------------------------ MODULE CallEnds ------------------------------
(* One logical model call, from its admission to the delivery of its result.
   The driver does the execution writes of the call: prepare, open the receive
   window, preserve each batch of output, and the settlement. The store
   answers each write: taken, refused for good, or not confirmed (the answer
   is lost or the store cannot answer now; the write took effect or it did
   not). The rule under check:

     An execution write that the store refuses for good ends the call. The
     driver drops what the store did not take and settles the call as failed.
     That settlement is never refused for good. After an answer that is not
     confirmed the driver stops, and the host runs it again. A settled call
     wakes the push, and the push delivers the result to the consumer.

   So every call ends, whatever the store refuses, and the consumer is told. *)
EXTENDS Naturals

CONSTANTS MaxBatches,   \* batches of output the supplier sends
          MaxUnknown,   \* how many answers may be lost
          DriveEndsOnRefusal,  \* negative control: a refused write only ends the drive (the defect)
          TerminalRefusable,   \* negative control: the terminal write can be refused for good too
          NoRewake             \* negative control: after a lost answer nothing runs the driver again

VARIABLES phase,     \* "accepted", "prepared", "receiving", "ending", "settled"
          outcome,   \* "none", "completed", "failed", "interrupted": the terminal in the store
          batches,   \* batches the store took
          sent,      \* whether the supplier got the request
          driver,    \* "idle", "running", "stopped": a stopped driver runs again only when woken
          woken,     \* whether something asked the driver to run
          cancelled, \* whether the caller asked to stop
          delivered, \* whether the consumer got the result
          unknowns

vars == <<phase, outcome, batches, sent, driver, woken, cancelled, delivered, unknowns>>

Init == /\ phase = "accepted" /\ outcome = "none" /\ batches = 0 /\ sent = FALSE
        /\ driver = "idle" /\ woken = TRUE /\ cancelled = FALSE /\ delivered = FALSE
        /\ unknowns = 0

(* The admission woke the driver; a cancel wakes it again. Nothing else does. *)
Start == /\ driver # "running" /\ woken /\ phase # "settled"
         /\ driver' = "running" /\ woken' = FALSE
         /\ UNCHANGED <<phase, outcome, batches, sent, cancelled, delivered, unknowns>>

Cancel == /\ ~cancelled /\ phase # "settled"
          /\ cancelled' = TRUE /\ woken' = TRUE
          /\ UNCHANGED <<phase, outcome, batches, sent, driver, delivered, unknowns>>

(* A write the store refuses for good. *)
Refused(next) ==
  IF DriveEndsOnRefusal
    THEN /\ driver' = "stopped" /\ UNCHANGED <<phase, outcome>>
    ELSE /\ phase' = "ending" /\ outcome' = next /\ UNCHANGED driver

(* The answer of a write is not confirmed: the driver stops, and the host runs it again. *)
Lost == /\ unknowns < MaxUnknown /\ unknowns' = unknowns + 1
        /\ driver' = "stopped" /\ woken' = ~NoRewake

Prepare == /\ driver = "running" /\ phase = "accepted"
           /\ \/ /\ phase' = "prepared" /\ UNCHANGED <<outcome, driver, woken, unknowns>>
              \/ /\ Refused("failed") /\ UNCHANGED <<woken, unknowns>>
              \/ /\ Lost /\ UNCHANGED <<phase, outcome>>
           /\ UNCHANGED <<batches, sent, cancelled, delivered>>

(* The request goes out, and the receive window opens. *)
Send == /\ driver = "running" /\ phase = "prepared"
        /\ IF cancelled
             THEN /\ phase' = "ending" /\ outcome' = "interrupted" /\ UNCHANGED <<sent, driver, woken, unknowns>>
             ELSE \/ /\ phase' = "receiving" /\ sent' = TRUE /\ UNCHANGED <<outcome, driver, woken, unknowns>>
                  \/ /\ sent' = TRUE /\ Refused("failed") /\ UNCHANGED <<woken, unknowns>>
        /\ UNCHANGED <<batches, cancelled, delivered>>

(* One batch of output is preserved, or the output ends. *)
Preserve == /\ driver = "running" /\ phase = "receiving"
            /\ \/ /\ batches < MaxBatches /\ batches' = batches + 1
                  /\ UNCHANGED <<phase, outcome, driver, woken, unknowns>>
               \/ /\ Refused("failed") /\ UNCHANGED <<batches, woken, unknowns>>
               \/ /\ Lost /\ UNCHANGED <<phase, outcome, batches>>
               \/ /\ (batches = MaxBatches \/ cancelled)
                  /\ phase' = "ending"
                  /\ outcome' = IF cancelled THEN "interrupted" ELSE "completed"
                  /\ UNCHANGED <<batches, driver, woken, unknowns>>
            /\ UNCHANGED <<sent, cancelled, delivered>>

(* The settlement. The store takes it for good or does not confirm it; with the negative
   control it can refuse it too, and then nothing is left to write. *)
Settle == /\ driver = "running" /\ phase = "ending"
          /\ \/ /\ phase' = "settled" /\ driver' = "idle" /\ UNCHANGED <<woken, unknowns>>
             \/ /\ Lost /\ UNCHANGED phase
             \/ /\ TerminalRefusable /\ driver' = "stopped" /\ UNCHANGED <<phase, woken, unknowns>>
          /\ UNCHANGED <<outcome, batches, sent, cancelled, delivered>>

(* The settlement wakes the push; the push delivers the result. *)
Push == /\ phase = "settled" /\ ~delivered /\ delivered' = TRUE
        /\ UNCHANGED <<phase, outcome, batches, sent, driver, woken, cancelled, unknowns>>

Next == Start \/ Cancel \/ Prepare \/ Send \/ Preserve \/ Settle \/ Push
Spec == Init /\ [][Next]_vars
          /\ WF_vars(Start) /\ WF_vars(Prepare) /\ WF_vars(Send) /\ WF_vars(Settle) /\ WF_vars(Push)
          /\ SF_vars(Preserve /\ phase' # phase) /\ SF_vars(Preserve /\ batches' # batches)

(* Safety. *)
TerminalOnlyWhenEnding == (outcome # "none") => phase \in {"ending", "settled"}
DeliveredOnlySettled == delivered => phase = "settled"
NothingAfterSettle == phase = "settled" => outcome # "none"
(* A call that was not sent never ends as completed. *)
CompletedWasSent == outcome = "completed" => sent

(* Liveness: every call ends, and the consumer gets its result. *)
CallEnds == <>(phase = "settled")
ResultDelivered == <>delivered
=============================================================================

---------------------------- MODULE ToolCallMC ----------------------------
EXTENDS ToolCall, TLC

Symm == Permutations(Calls)

(* Deliberate negative variant: a recovery that re-dispatches an attempt whose
   dispatch intent is already durable ("the owner was lost, run it again").
   Expected to violate AttemptMonotone (T-5: never re-send a dispatched
   attempt; unknown is the only honest outcome). *)
OwnerRecoverRedispatch ==
  /\ owner = "lost"
  /\ owner' = "alive"
  /\ att' = [c \in Calls |-> IF prog[c] = "executing" /\ att[c] = "dispatch_intent"
                               THEN "accepted" ELSE att[c]]
  /\ rel' = [c \in Calls |-> IF rel[c] = "detach_in_flight" THEN "foreground" ELSE rel[c]]
  /\ UNCHANGED <<sess, run, crashes, kind, prog, fence, ctl, deliv, hd>>

NextRedispatch == OwnerRecoverRedispatch \/ Next

SpecRedispatch == Init /\ [][NextRedispatch]_vars
=============================================================================

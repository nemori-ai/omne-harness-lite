-------------------------- MODULE RecoveryRouting --------------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES waiting, replied, inbox, online, generation, route, delivered,
          staleAccepted, deliveryCount, storedDestination
vars == <<waiting, replied, inbox, online, generation, route, delivered,
          staleAccepted, deliveryCount, storedDestination>>
Init == /\ waiting = TRUE /\ replied = FALSE /\ inbox = FALSE
        /\ online = TRUE /\ generation = 0 /\ route = 0
        /\ delivered = FALSE /\ staleAccepted = FALSE /\ deliveryCount = 0
        /\ storedDestination = "original-wait"
Answer == /\ ~replied /\ replied' = TRUE /\ waiting' = FALSE /\ inbox' = TRUE
          /\ UNCHANGED <<online,generation,route,delivered,staleAccepted,deliveryCount,storedDestination>>
Crash == /\ online /\ generation = 0
         /\ online' = FALSE /\ generation' = 1 /\ route' = 2
         /\ waiting' = IF Bad = "forget" THEN FALSE ELSE waiting
         /\ inbox' = IF Bad = "inbox" THEN FALSE ELSE inbox
         /\ storedDestination' = IF Bad = "route" THEN "new-wait" ELSE storedDestination
         /\ UNCHANGED <<replied,delivered,staleAccepted,deliveryCount>>
Recover == /\ ~online /\ online' = TRUE
           /\ UNCHANGED <<waiting,replied,inbox,generation,route,delivered,staleAccepted,deliveryCount,storedDestination>>
Rebind == /\ online /\ route # generation /\ route' = generation
          /\ UNCHANGED <<waiting,replied,inbox,online,generation,delivered,staleAccepted,deliveryCount,storedDestination>>
Deliver(g) == /\ replied /\ inbox /\ online /\ route = generation
              /\ storedDestination = "original-wait"
              /\ (g = generation \/ Bad = "stale")
              /\ (~delivered \/ Bad = "duplicate") /\ deliveryCount < 2
              /\ delivered' = TRUE /\ deliveryCount' = deliveryCount + 1
              /\ staleAccepted' = (staleAccepted \/ g # generation)
              /\ UNCHANGED <<waiting,replied,inbox,online,generation,route,storedDestination>>
CurrentDeliver == Deliver(generation)
Next == Answer \/ Crash \/ Recover \/ Rebind \/ (\E g \in 0..1: Deliver(g)) \/ UNCHANGED vars
WaitingPreserved == ~replied => waiting
ReplyCustody == replied => inbox
StableDestination == storedDestination = "original-wait"
NoStaleReceiver == ~staleAccepted
OnceDelivery == deliveryCount <= 1
ReplyEventuallyDelivered == replied ~> delivered
Spec == Init /\ [][Next]_vars /\ WF_vars(Recover) /\ WF_vars(Rebind) /\ WF_vars(CurrentDeliver)
=============================================================================

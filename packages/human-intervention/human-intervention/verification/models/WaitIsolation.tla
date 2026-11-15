-------------------------- MODULE WaitIsolation --------------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES parked, done, waitSlot
vars == <<parked, done, waitSlot>>
Others == {"same-session-tool", "other-session"}
Init == /\ parked = FALSE /\ done = [x \in Others |-> FALSE] /\ waitSlot = FALSE
Park == /\ ~parked /\ parked' = TRUE /\ UNCHANGED done
        /\ waitSlot' = (Bad = "slot")
Enabled(x) == /\ ~done[x] /\ ~waitSlot
              /\ ~(parked /\ Bad = "global")
              /\ ~(parked /\ Bad = "tool" /\ x = "same-session-tool")
Advance(x) == /\ Enabled(x) /\ done' = [done EXCEPT ![x] = TRUE]
              /\ UNCHANGED <<parked, waitSlot>>
Next == Park \/ (\E x \in Others: Advance(x)) \/ UNCHANGED vars
NoWaitSlot == parked => ~waitSlot
ToolIndependence == parked /\ ~done["same-session-tool"] => Enabled("same-session-tool")
SessionIndependence == parked /\ ~done["other-session"] => Enabled("other-session")
IndependentProgress == <> (\A x \in Others: done[x])
Spec == Init /\ [][Next]_vars /\ (\A x \in Others: WF_vars(Advance(x)))
=============================================================================

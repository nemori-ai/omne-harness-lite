------------------------- MODULE ProviderBorrow -------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS Callers, BadEarlyReturn, BadFailureReturn
VARIABLES phase, acquired, returned, withdrawn, requested, stopped,
          sourceReleased, providerClosing
vars == <<phase, acquired, returned, withdrawn, requested, stopped,
          sourceReleased, providerClosing>>
Init == /\ phase = [c \in Callers |-> "idle"] /\ acquired = {}
        /\ returned = {} /\ withdrawn = {} /\ requested = {} /\ stopped = {}
        /\ sourceReleased = {} /\ providerClosing = FALSE
Acquire(c) == /\ phase[c] = "idle" /\ phase' = [phase EXCEPT ![c] = "acquiring"]
              /\ acquired' = acquired \cup {c}
              /\ UNCHANGED <<returned, withdrawn, requested, stopped, sourceReleased, providerClosing>>
Complete(c, kind) == /\ phase[c] = "acquiring" /\ kind \in {"consumer", "source"}
                    /\ phase' = [phase EXCEPT ![c] = kind]
                    /\ requested' = (IF c \in withdrawn \/ providerClosing THEN requested \cup {c} ELSE requested)
                    /\ UNCHANGED <<acquired, returned, withdrawn, stopped, sourceReleased, providerClosing>>
Withdraw(c) == /\ c \notin withdrawn /\ withdrawn' = withdrawn \cup {c}
               /\ requested' = (IF phase[c] \in {"consumer", "source"} THEN requested \cup {c} ELSE requested)
               /\ UNCHANGED <<phase, acquired, returned, stopped, sourceReleased, providerClosing>>
StopProvider == /\ ~providerClosing /\ providerClosing' = TRUE
                /\ requested' = requested \cup {c \in Callers : phase[c] \in {"consumer", "source"}}
                /\ UNCHANGED <<phase, acquired, returned, withdrawn, stopped, sourceReleased>>
ConsumerStops(c) == /\ phase[c] = "consumer" /\ c \in requested
                    /\ stopped' = stopped \cup {c}
                    /\ UNCHANGED <<phase, acquired, returned, withdrawn, requested, sourceReleased, providerClosing>>
SourceRelease(c) == /\ phase[c] = "source" /\ c \in requested
                    /\ sourceReleased' = sourceReleased \cup {c}
                    /\ UNCHANGED <<phase, acquired, returned, withdrawn, requested, stopped, providerClosing>>
FailedSourceRelease(c) == /\ phase[c] = "source" /\ c \in requested /\ BadFailureReturn
                          /\ returned' = returned \cup {c}
                          /\ UNCHANGED <<phase, acquired, withdrawn, requested, stopped, sourceReleased, providerClosing>>
Return(c) == /\ c \in acquired /\ c \notin returned
             /\ ((phase[c] = "consumer" /\ (c \in stopped \/ (BadEarlyReturn /\ c \in requested)))
                  \/ (phase[c] = "source" /\ c \in sourceReleased))
             /\ returned' = returned \cup {c}
             /\ UNCHANGED <<phase, acquired, withdrawn, requested, stopped, sourceReleased, providerClosing>>
Next == StopProvider \/ (\E c \in Callers : Acquire(c) \/ Withdraw(c) \/ ConsumerStops(c)
        \/ SourceRelease(c) \/ FailedSourceRelease(c) \/ Return(c)
        \/ (\E kind \in {"consumer", "source"} : Complete(c, kind)))
Spec == Init /\ [][Next]_vars
TypeOK == /\ phase \in [Callers -> {"idle", "acquiring", "consumer", "source"}]
          /\ acquired \subseteq Callers /\ returned \subseteq acquired
          /\ withdrawn \subseteq Callers /\ requested \subseteq Callers
          /\ stopped \subseteq Callers /\ sourceReleased \subseteq Callers
ConsumerCustody == \A c \in returned : phase[c] = "consumer" => c \in stopped
SourceCustody == \A c \in returned : phase[c] = "source" => c \in sourceReleased
OwnerCanStop == providerClosing => {c \in Callers : phase[c] \in {"consumer", "source"}} \subseteq requested
=============================================================================

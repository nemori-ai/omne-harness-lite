------------------------- MODULE ExecutionSource -------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS Generations, Frames, BadErase, BadPublish, BadSourceRelease
VARIABLES accepted, registered, stopped, copies, active, borrowed, ack,
          sealed, durableReleased, sourceReleased, publicFailed
vars == <<accepted, registered, stopped, copies, active, borrowed, ack,
          sealed, durableReleased, sourceReleased, publicFailed>>
Init == /\ accepted = {} /\ registered = {} /\ stopped = {} /\ copies = {}
        /\ active = {} /\ borrowed = [f \in Frames |-> {}]
        /\ ~ack /\ ~sealed /\ ~durableReleased /\ ~sourceReleased /\ ~publicFailed
Insert(g) == /\ ~sourceReleased /\ ~ack /\ g \notin accepted
             /\ accepted' = accepted \cup {g}
             /\ registered' = registered \cup {g}
             /\ copies' = copies \cup {g}
             /\ UNCHANGED <<stopped, active, borrowed, ack, sealed,
                             durableReleased, sourceReleased, publicFailed>>
PublicFailure == /\ accepted # {} /\ ~publicFailed /\ publicFailed' = TRUE
                 /\ UNCHANGED <<accepted, registered, stopped, copies, active,
                                 borrowed, ack, sealed, durableReleased, sourceReleased>>
Capture(f) == /\ ~sourceReleased /\ f \notin active
              /\ active' = active \cup {f}
              /\ borrowed' = [borrowed EXCEPT ![f] = IF sealed THEN {} ELSE copies]
              /\ UNCHANGED <<accepted, registered, stopped, copies, ack, sealed,
                              durableReleased, sourceReleased, publicFailed>>
Release(f) == /\ f \in active /\ active' = active \ {f}
              /\ borrowed' = [borrowed EXCEPT ![f] = {}]
              /\ UNCHANGED <<accepted, registered, stopped, copies, ack, sealed,
                              durableReleased, sourceReleased, publicFailed>>
Stop(g) == /\ g \in accepted /\ g \notin stopped
           /\ stopped' = stopped \cup {g} /\ registered' = registered \ {g}
           /\ UNCHANGED <<accepted, copies, active, borrowed, ack, sealed,
                           durableReleased, sourceReleased, publicFailed>>
ConfirmAck == /\ accepted # {} /\ ~ack /\ ack' = TRUE /\ sealed' = TRUE
              /\ UNCHANGED <<accepted, registered, stopped, copies, active, borrowed,
                              durableReleased, sourceReleased, publicFailed>>
Pins == UNION {borrowed[f] : f \in active}
Erase == /\ ack /\ accepted \subseteq stopped /\ copies # {}
         /\ (BadErase \/ Pins = {}) /\ copies' = {}
         /\ UNCHANGED <<accepted, registered, stopped, active, borrowed, ack, sealed,
                         durableReleased, sourceReleased, publicFailed>>
Publish == /\ ack /\ ~durableReleased /\ (BadPublish \/ copies = {})
           /\ durableReleased' = TRUE
           /\ UNCHANGED <<accepted, registered, stopped, copies, active, borrowed,
                           ack, sealed, sourceReleased, publicFailed>>
SourceRelease == /\ ~sourceReleased /\ accepted \subseteq stopped
                 /\ (BadSourceRelease \/ active = {}) /\ sourceReleased' = TRUE
                 /\ copies' = {}
                 /\ UNCHANGED <<accepted, registered, stopped, active, borrowed,
                                 ack, sealed, durableReleased, publicFailed>>
Next == (\E g \in Generations : Insert(g) \/ Stop(g))
        \/ (\E f \in Frames : Capture(f) \/ Release(f))
        \/ PublicFailure \/ ConfirmAck \/ Erase \/ Publish \/ SourceRelease
Spec == Init /\ [][Next]_vars
TypeOK == /\ accepted \subseteq Generations /\ registered \subseteq accepted
          /\ stopped \subseteq accepted /\ copies \subseteq accepted
          /\ active \subseteq Frames /\ borrowed \in [Frames -> SUBSET Generations]
AckErasure == durableReleased => (copies = {} /\ Pins = {})
BorrowCustody == ~sourceReleased => Pins \subseteq copies
SourceFence == sourceReleased => active = {}
FailureCustody == (~ack /\ ~sourceReleased) => copies = accepted
StopIsNotErase == (~ack /\ ~sourceReleased) => copies = accepted
=============================================================================

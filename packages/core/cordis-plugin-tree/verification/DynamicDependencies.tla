------------------------ MODULE DynamicDependencies ------------------------
EXTENDS TLC
CONSTANT NegativeDynamicStop
VARIABLES fixedOwner, dynamicOwner, rowCurrent, generationActive, authorLive
vars == <<fixedOwner, dynamicOwner, rowCurrent, generationActive, authorLive>>
Owners == {"original", "other", "absent"}

Init == /\ fixedOwner = "original"
        /\ dynamicOwner = "original"
        /\ rowCurrent = TRUE
        /\ generationActive = TRUE
        /\ authorLive = TRUE

DynamicChange ==
    /\ \E next \in Owners : /\ next # dynamicOwner
                             /\ dynamicOwner' = next
    /\ generationActive' = IF NegativeDynamicStop THEN FALSE ELSE generationActive
    /\ authorLive' = IF NegativeDynamicStop THEN FALSE ELSE authorLive
    /\ UNCHANGED <<fixedOwner, rowCurrent>>

FixedChange ==
    /\ \E next \in {"other", "absent"} : /\ next # fixedOwner
                                          /\ fixedOwner' = next
    /\ generationActive' = FALSE
    /\ authorLive' = FALSE
    /\ UNCHANGED <<dynamicOwner, rowCurrent>>

RowStops == /\ rowCurrent
            /\ rowCurrent' = FALSE
            /\ generationActive' = FALSE
            /\ authorLive' = FALSE
            /\ UNCHANGED <<fixedOwner, dynamicOwner>>

Next == DynamicChange \/ FixedChange \/ RowStops
Spec == Init /\ [][Next]_vars
TypeOK == /\ fixedOwner \in Owners
          /\ dynamicOwner \in Owners
          /\ rowCurrent \in BOOLEAN
          /\ generationActive \in BOOLEAN
          /\ authorLive \in BOOLEAN
NoDynamicStop == generationActive = (rowCurrent /\ fixedOwner = "original")
NoAuthorStopWithoutHostStop == authorLive = generationActive
NoStaticRebind == generationActive => fixedOwner = "original"
=============================================================================

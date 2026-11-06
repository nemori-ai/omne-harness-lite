----------------------- MODULE GovernancePublication -----------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES published, candidate, prepared, finished, declared, prohibited,
          prohibitedEver, deniedByBound, evaluated, acceptedConflict
vars == <<published,candidate,prepared,finished,declared,prohibited,
          prohibitedEver,deniedByBound,evaluated,acceptedConflict>>
Init == /\ published = [settings |-> 1, permissions |-> 1]
        /\ candidate = "none" /\ prepared = FALSE /\ finished = FALSE
        /\ declared = TRUE /\ prohibited = FALSE /\ prohibitedEver = FALSE
        /\ deniedByBound = FALSE /\ evaluated = FALSE /\ acceptedConflict = FALSE
Prepare(c) == /\ ~prepared /\ candidate' = c /\ prepared' = TRUE
              /\ UNCHANGED <<published,finished,declared,prohibited,
                  prohibitedEver,deniedByBound,evaluated,acceptedConflict>>
Publish == /\ prepared /\ ~finished
           /\ (candidate = "valid" \/ Bad = "conflict")
           /\ published' = [settings |-> 2,
                              permissions |-> IF Bad = "partial" THEN 1 ELSE 2]
           /\ finished' = TRUE
           /\ acceptedConflict' = (candidate = "conflicting")
           /\ UNCHANGED <<candidate,prepared,declared,prohibited,
                            prohibitedEver,deniedByBound,evaluated>>
Prohibit == /\ ~prohibitedEver /\ prohibited' = TRUE /\ prohibitedEver' = TRUE
            /\ UNCHANGED <<published,candidate,prepared,finished,declared,
                            deniedByBound,evaluated,acceptedConflict>>
RemoveDeclaration == /\ declared /\ declared' = FALSE
                     /\ prohibited' = IF Bad = "forget" THEN FALSE ELSE prohibited
                     /\ UNCHANGED <<published,candidate,prepared,finished,
                          prohibitedEver,deniedByBound,evaluated,acceptedConflict>>
Evaluate == /\ ~evaluated /\ prohibitedEver
            /\ deniedByBound' = (prohibited /\ (declared \/ Bad # "bypass"))
            /\ evaluated' = TRUE
            /\ UNCHANGED <<published,candidate,prepared,finished,declared,
                            prohibited,prohibitedEver,acceptedConflict>>
Next == (\E c \in {"valid","conflicting"}: Prepare(c))
        \/ Publish \/ Prohibit \/ RemoveDeclaration \/ Evaluate \/ UNCHANGED vars
AtomicPublication == published.settings = published.permissions
ConflictRejected == ~acceptedConflict
ProhibitionPreserved == prohibitedEver => prohibited
AbsentItemCannotBypass == evaluated => deniedByBound
Spec == Init /\ [][Next]_vars
=============================================================================

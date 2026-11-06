------------------------- MODULE GovernanceOperation -------------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES state, request, envelope, effect, result, sealed, frozenRequest, frozenEnvelope
vars == <<state, request, envelope, effect, result, sealed, frozenRequest, frozenEnvelope>>
Init == /\ state = "absent" /\ request = 0 /\ envelope = 0
        /\ effect = 0 /\ result = 0 /\ sealed = FALSE
        /\ frozenRequest = 0 /\ frozenEnvelope = 0
Accept(v) == /\ state = "absent"
             /\ state' = "accepted" /\ request' = v /\ frozenRequest' = v
             /\ UNCHANGED <<envelope,effect,result,sealed,frozenEnvelope>>
Retry(v) == /\ state # "absent"
            /\ request' = IF Bad = "rebind" THEN v ELSE request
            /\ UNCHANGED <<state,envelope,effect,result,sealed,frozenRequest,frozenEnvelope>>
Submit(v) == /\ state = "accepted"
             /\ state' = "submitted" /\ envelope' = v /\ frozenEnvelope' = v
             /\ UNCHANGED <<request,effect,result,sealed,frozenRequest>>
Resubmit(v) == /\ state = "submitted"
               /\ envelope' = IF Bad = "replace" THEN v ELSE envelope
               /\ UNCHANGED <<state,request,effect,result,sealed,frozenRequest,frozenEnvelope>>
Commit == /\ (state = "submitted" \/ (Bad = "revive" /\ state = "aborted"))
          /\ state' = "committed" /\ effect' = 1
          /\ result' = IF Bad = "partial" THEN 0 ELSE 1
          /\ UNCHANGED <<request,envelope,sealed,frozenRequest,frozenEnvelope>>
Seal == /\ state \in {"accepted","submitted"}
        /\ state' = "aborted" /\ sealed' = TRUE /\ result' = 2
        /\ UNCHANGED <<request,envelope,effect,frozenRequest,frozenEnvelope>>
Next == (\E v \in {1,2}: Accept(v) \/ Retry(v) \/ Submit(v) \/ Resubmit(v))
        \/ Commit \/ Seal \/ UNCHANGED vars
RequestImmutable == request = frozenRequest
EnvelopeImmutable == envelope = frozenEnvelope
NoRevival == sealed => effect = 0
EffectHasReceipt == effect = 1 => (state = "committed" /\ result = 1)
Spec == Init /\ [][Next]_vars
=============================================================================

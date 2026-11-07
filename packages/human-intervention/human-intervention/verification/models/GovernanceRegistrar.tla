---------------------- MODULE GovernanceRegistrar ----------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES phase, source, prepared, proven, lease, original, reply, observed
vars == <<phase,source,prepared,proven,lease,original,reply,observed>>
Init == /\ phase = "new" /\ source = TRUE /\ prepared = FALSE
        /\ proven = FALSE /\ lease = "absent" /\ original = "none"
        /\ reply = "none" /\ observed = "absent"
Accept == /\ phase = "new" /\ phase' = "accepted"
          /\ UNCHANGED <<source,prepared,proven,lease,original,reply,observed>>
Prepare == /\ phase = "accepted" /\ (source \/ Bad = "skip-source")
           /\ prepared' = TRUE /\ proven' = source /\ phase' = "prepared"
           /\ UNCHANGED <<source,lease,original,reply,observed>>
Apply == /\ phase = "prepared" /\ prepared
         /\ phase' = "committed" /\ lease' = "active" /\ original' = "active"
         /\ UNCHANGED <<source,prepared,proven,reply,observed>>
Seal == /\ phase \in {"accepted","prepared"} /\ phase' = "aborted"
        /\ UNCHANGED <<source,prepared,proven,lease,original,reply,observed>>
Offline == /\ ~prepared /\ source' = FALSE
           /\ UNCHANGED <<phase,prepared,proven,lease,original,reply,observed>>
OfflineAfterProof == /\ prepared /\ source' = FALSE
                    /\ UNCHANGED <<phase,prepared,proven,lease,original,reply,observed>>
Release == /\ phase = "committed" /\ lease = "active" /\ lease' = "released"
           /\ original' = IF Bad = "rewrite-original" THEN "released" ELSE original
           /\ UNCHANGED <<phase,source,prepared,proven,reply,observed>>
Retry == /\ phase = "committed"
         /\ reply' = IF Bad = "source-first" /\ ~source THEN "unavailable"
                     ELSE IF Bad = "old-state" THEN original ELSE lease
         /\ observed' = lease
         /\ UNCHANGED <<phase,source,prepared,proven,lease,original>>
Next == Accept \/ Prepare \/ Apply \/ Seal \/ Offline \/ OfflineAfterProof \/ Release \/ Retry
OriginalStable == original \in {"none","active"}
RecognizeOffline == phase = "committed" => reply # "unavailable"
PreparedProof == prepared => proven
NoStaleReply == reply # "none" => reply = observed
Spec == Init /\ [][Next]_vars
=============================================================================

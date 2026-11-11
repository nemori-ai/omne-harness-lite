----------------------- MODULE MeasurementSnapshot -----------------------
EXTENDS Naturals
CONSTANTS BadLiveDigest, BadLiveChecks
Inputs == [token : {0,1}, calibration : {0,1}, limits : {0,1}, metadata : {0,1}]
VARIABLE external, owned, phase, countSource, digestSource, checkSource
vars == <<external,owned,phase,countSource,digestSource,checkSource>>
Init == /\ external \in Inputs /\ owned = external /\ phase = "idle"
        /\ countSource = external /\ digestSource = external /\ checkSource = external
TypeOK == /\ external \in Inputs /\ owned \in Inputs
          /\ countSource \in Inputs /\ digestSource \in Inputs /\ checkSource \in Inputs
          /\ phase \in {"idle","awaiting","digest","checks","done"}
CountSnapshot == phase # "idle" => countSource = owned
DigestSnapshot == phase \in {"checks","done"} => digestSource = owned
CheckSnapshot == phase = "done" => checkSource = owned
Mutate == /\ external' \in Inputs /\ UNCHANGED <<owned,phase,countSource,digestSource,checkSource>>
Begin == /\ phase = "idle" /\ owned' = external /\ countSource' = external
         /\ phase' = "awaiting" /\ UNCHANGED <<external,digestSource,checkSource>>
CountFinished == /\ phase = "awaiting" /\ phase' = "digest"
                 /\ UNCHANGED <<external,owned,countSource,digestSource,checkSource>>
Digest == /\ phase = "digest" /\ digestSource' = IF BadLiveDigest THEN external ELSE owned
          /\ phase' = "checks" /\ UNCHANGED <<external,owned,countSource,checkSource>>
Checks == /\ phase = "checks" /\ checkSource' = IF BadLiveChecks THEN external ELSE owned
          /\ phase' = "done" /\ UNCHANGED <<external,owned,countSource,digestSource>>
Next == Mutate \/ Begin \/ CountFinished \/ Digest \/ Checks
Spec == Init /\ [][Next]_vars
=============================================================================

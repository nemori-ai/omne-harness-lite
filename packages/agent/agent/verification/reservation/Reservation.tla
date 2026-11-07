--------------------------- MODULE Reservation ---------------------------
EXTENDS Naturals, TLC

CONSTANTS HideReservation, SkipDrainCheck, MaxInvokes
VARIABLES slot, report, checking, draining, retired, invokes,
          reclaimedHeld, admittedDraining
vars == <<slot, report, checking, draining, retired, invokes,
          reclaimedHeld, admittedDraining>>

Init ==
  /\ slot = "free"
  /\ report = "idle"
  /\ checking = 0
  /\ draining = FALSE
  /\ retired = FALSE
  /\ invokes = 0
  /\ reclaimedHeld = FALSE
  /\ admittedDraining = FALSE

BeginInvoke ==
  /\ ~retired /\ invokes < MaxInvokes
  /\ checking' = checking + 1
  /\ invokes' = invokes + 1
  /\ UNCHANGED <<slot, report, draining, retired, reclaimedHeld, admittedDraining>>

PassAccess ==
  /\ checking > 0
  /\ checking' = checking - 1
  /\ IF slot = "free" /\ (~draining \/ SkipDrainCheck)
        THEN /\ slot' = "reserved"
             /\ report' = IF HideReservation THEN "idle" ELSE "reserved"
             /\ admittedDraining' = (admittedDraining \/ draining)
        ELSE /\ UNCHANGED <<slot, report, admittedDraining>>
  /\ UNCHANGED <<draining, retired, invokes, reclaimedHeld>>

Accept ==
  /\ slot = "reserved" /\ ~retired
  /\ slot' = "running" /\ report' = "occupied"
  /\ UNCHANGED <<checking, draining, retired, invokes, reclaimedHeld, admittedDraining>>

Release ==
  /\ slot \in {"reserved", "running"}
  /\ slot' = "free" /\ report' = "idle"
  /\ UNCHANGED <<checking, draining, retired, invokes, reclaimedHeld, admittedDraining>>

Expire ==
  /\ ~retired /\ ~draining /\ report = "idle"
  /\ draining' = TRUE
  /\ reclaimedHeld' = (reclaimedHeld \/ (slot # "free"))
  /\ UNCHANGED <<slot, report, checking, retired, invokes, admittedDraining>>

Retire ==
  /\ draining /\ slot = "free" /\ ~retired
  /\ retired' = TRUE
  /\ UNCHANGED <<slot, report, checking, draining, invokes, reclaimedHeld, admittedDraining>>

Next == BeginInvoke \/ PassAccess \/ Accept \/ Release \/ Expire \/ Retire
Spec == Init /\ [][Next]_vars
TypeOK ==
  /\ slot \in {"free", "reserved", "running"}
  /\ report \in {"idle", "reserved", "occupied"}
  /\ invokes \in 0..MaxInvokes
  /\ checking \in 0..MaxInvokes /\ draining \in BOOLEAN /\ retired \in BOOLEAN
  /\ reclaimedHeld \in BOOLEAN /\ admittedDraining \in BOOLEAN
NoReclaimHeld == ~reclaimedHeld
NoAdmissionWhileDraining == ~admittedDraining
NoRetiredWork == retired => slot = "free"
=============================================================================

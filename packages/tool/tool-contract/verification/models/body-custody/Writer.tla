------------------------------- MODULE Writer -------------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Bug
Fragments == {1, 2}
VARIABLES scope, begun, accepted, durable, failed, recovery, sealState,
          sealRecovery, sealReceipt, linked, published, closingReason, terminal,
          lastAdmissionScope, effects
vars == <<scope, begun, accepted, durable, failed, recovery, sealState,
          sealRecovery, sealReceipt, linked, published, closingReason, terminal,
          lastAdmissionScope, effects>>
Pending == accepted \ (durable \cup failed)
PendingSeal == sealState = "requested"
Owned == scope # "closed" \/ Pending \subseteq recovery
Init == /\ scope = "active" /\ begun = FALSE
        /\ accepted = {} /\ durable = {} /\ failed = {} /\ recovery = {}
        /\ sealState = "none" /\ sealRecovery = FALSE /\ sealReceipt = FALSE
        /\ linked = FALSE /\ published = FALSE
        /\ closingReason = "none" /\ terminal = "none"
        /\ lastAdmissionScope = "active" /\ effects = 1
Begin == /\ scope = "active" /\ ~begun /\ begun' = TRUE
         /\ UNCHANGED <<scope, accepted, durable, failed, recovery, sealState,
                        sealRecovery, sealReceipt, linked, published, closingReason,
                        terminal, lastAdmissionScope, effects>>
Accept(f) ==
  /\ begun /\ sealState = "none" /\ f \notin accepted
  /\ (f = 1 \/ 1 \in accepted)
  /\ (scope = "active" \/ Bug = "late-accept")
  /\ accepted' = accepted \cup {f} /\ lastAdmissionScope' = scope
  /\ UNCHANGED <<scope, begun, durable, failed, recovery, sealState,
                 sealRecovery, sealReceipt, linked, published, closingReason, terminal, effects>>
Flush(f) ==
  /\ f \in Pending /\ (scope # "closed" \/ f \in recovery)
  /\ durable' = durable \cup {f} /\ recovery' = recovery \ {f}
  /\ UNCHANGED <<scope, begun, accepted, failed, sealState, sealRecovery, sealReceipt,
                 linked, published, closingReason, terminal, lastAdmissionScope, effects>>
FailFragment(f) ==
  /\ f \in Pending /\ closingReason = "cancel"
  /\ (scope # "closed" \/ f \in recovery)
  /\ failed' = failed \cup {f} /\ recovery' = recovery \ {f}
  /\ UNCHANGED <<scope, begun, accepted, durable, sealState, sealRecovery, sealReceipt,
                 linked, published, closingReason, terminal, lastAdmissionScope, effects>>
RequestSeal ==
  /\ scope = "active" /\ begun /\ accepted = Fragments /\ sealState = "none"
  /\ sealState' = "requested"
  /\ UNCHANGED <<scope, begun, accepted, durable, failed, recovery, sealRecovery,
                 sealReceipt, linked, published, closingReason, terminal, lastAdmissionScope, effects>>
CommitSeal ==
  /\ PendingSeal /\ durable = Fragments
  /\ (scope # "closed" \/ sealRecovery)
  /\ sealState' = "sealed" /\ sealRecovery' = FALSE
  /\ UNCHANGED <<scope, begun, accepted, durable, failed, recovery, sealReceipt,
                 linked, published, closingReason, terminal, lastAdmissionScope, effects>>
FailSeal ==
  /\ PendingSeal /\ closingReason = "cancel"
  /\ (scope # "closed" \/ sealRecovery)
  /\ sealState' = "failed" /\ sealRecovery' = FALSE
  /\ UNCHANGED <<scope, begun, accepted, durable, failed, recovery, sealReceipt,
                 linked, published, closingReason, terminal, lastAdmissionScope, effects>>
InspectSeal ==
  /\ sealState = "sealed" /\ sealReceipt' = TRUE
  /\ UNCHANGED <<scope, begun, accepted, durable, failed, recovery, sealState,
                 sealRecovery, linked, published, closingReason, terminal, lastAdmissionScope, effects>>
LoseConfirmation ==
  /\ sealReceipt' = FALSE
  /\ UNCHANGED <<scope, begun, accepted, durable, failed, recovery, sealState,
                 sealRecovery, linked, published, closingReason, terminal, lastAdmissionScope, effects>>
Link ==
  /\ sealReceipt /\ sealState = "sealed" /\ linked' = TRUE
  /\ UNCHANGED <<scope, begun, accepted, durable, failed, recovery, sealState,
                 sealRecovery, sealReceipt, published, closingReason, terminal, lastAdmissionScope, effects>>
RequestClose(reason) ==
  /\ scope = "active" /\ scope' = "closing" /\ closingReason' = reason
  /\ terminal' = IF reason = "cancel" THEN "failed" ELSE terminal
  /\ UNCHANGED <<begun, accepted, durable, failed, recovery, sealState,
                 sealRecovery, sealReceipt, linked, published, lastAdmissionScope, effects>>
HandoffFragment(f) ==
  /\ scope = "closing" /\ f \in Pending /\ recovery' = recovery \cup {f}
  /\ UNCHANGED <<scope, begun, accepted, durable, failed, sealState, sealRecovery,
                 sealReceipt, linked, published, closingReason, terminal, lastAdmissionScope, effects>>
HandoffSeal ==
  /\ scope = "closing" /\ PendingSeal /\ sealRecovery' = TRUE
  /\ UNCHANGED <<scope, begun, accepted, durable, failed, recovery, sealState,
                 sealReceipt, linked, published, closingReason, terminal, lastAdmissionScope, effects>>
Close ==
  /\ scope = "closing"
  /\ ((Pending \subseteq recovery /\ (PendingSeal => sealRecovery)) \/ Bug = "drop-pending")
  /\ scope' = "closed"
  /\ UNCHANGED <<begun, accepted, durable, failed, recovery, sealState,
                 sealRecovery, sealReceipt, linked, published, closingReason, terminal, lastAdmissionScope, effects>>
Publish ==
  /\ ~published
  /\ ((scope = "closed" /\ closingReason = "return" /\ linked
         /\ sealState = "sealed" /\ durable = Fragments) \/ (Bug = "early-publish" /\ PendingSeal))
  /\ published' = TRUE /\ terminal' = "success"
  /\ UNCHANGED <<scope, begun, accepted, durable, failed, recovery, sealState,
                 sealRecovery, sealReceipt, linked, closingReason, lastAdmissionScope, effects>>
RetryUnknown == UNCHANGED vars
ResolveFragment(f) == Flush(f) \/ FailFragment(f)
ResolveSeal == CommitSeal \/ FailSeal
Next == \/ Begin \/ RequestSeal \/ CommitSeal \/ FailSeal \/ InspectSeal
        \/ LoseConfirmation \/ Link \/ HandoffSeal \/ Close \/ Publish \/ RetryUnknown
        \/ \E f \in Fragments: Accept(f) \/ ResolveFragment(f) \/ HandoffFragment(f)
        \/ \E reason \in {"return", "cancel"}: RequestClose(reason)
Spec == Init /\ [][Next]_vars
        /\ (\A f \in Fragments: WF_vars(ResolveFragment(f))) /\ WF_vars(ResolveSeal)
TypeOK == /\ scope \in {"active","closing","closed"}
          /\ accepted \subseteq Fragments /\ durable \subseteq accepted
          /\ failed \subseteq accepted /\ durable \cap failed = {}
          /\ recovery \subseteq Pending
          /\ sealState \in {"none","requested","sealed","failed"}
          /\ terminal \in {"none","failed","success"}
NoLateAdmission == lastAdmissionScope = "active"
NoPendingLost == /\ Owned /\ (scope = "closed" /\ PendingSeal => sealRecovery)
SealSound == sealState = "sealed" => durable = Fragments
ConfirmationSound == sealReceipt => sealState = "sealed"
LinkSound == linked => sealState = "sealed" /\ durable = Fragments
PublishSound == published => /\ scope = "closed" /\ closingReason = "return"
                             /\ linked /\ sealState = "sealed" /\ durable = Fragments
CancellationPreservesResponsibility == terminal = "failed" => NoPendingLost /\ ~published
EffectStable == effects = 1
EventuallySettled == (scope # "active") ~> (Pending = {} /\ ~PendingSeal)
=============================================================================

module RootSettings
open Evaluation

// capability.asset-evaluation/v4 S-7 C16, S-21, S-22, S-45.
// Shared layer/asset/assignment relations are the inherited Evaluation model.
// These atoms abstract already selected immutable versions, not version choice.
sig Version {}
one sig VersionSelection { selectedVersion: Asset -> one Version }
one sig RootInput {
  sourceAsset: one Asset,
  sourceVersion: one Version,
  declarations: set Item
}
fact RootSettingsOnly {
  no RootInput.declarations & (PermissionItem + PlacementItem + GovernanceItem)
}

// Shape checks and PRE-9 content authenticity are premises outside this model.
// A structurally valid missing-root input succeeds with unresolved root.
pred accepted {
  no effective[Root.rootCap]
  or (RootInput.sourceAsset = effective[Root.rootCap]
      and RootInput.sourceVersion = effective[Root.rootCap].(VersionSelection.selectedVersion))
}
fun resultComposition: set Cap { accepted => composition else none }
fun rootProjected: set Item {
  (accepted and some effective[Root.rootCap]) => RootInput.declarations else none
}
fun resultFrom[i: Item]: set Layer {
  i in rootProjected => settingFrom[Root.rootCap, i] else none
}
fun resultLock[i: Item]: set Layer {
  i in rootProjected => { l: settingLockLayers[Root.rootCap, i] |
    no outer: settingLockLayers[Root.rootCap, i] | outer -> l in settingLt } else none
}

assert RootNeverBecomesMember { Root.rootCap not in resultComposition }
assert VisibleRootIsProjected {
  accepted and some effective[Root.rootCap] implies rootProjected = RootInput.declarations
}
assert MissingRootContributesNoSetting { no effective[Root.rootCap] implies no rootProjected }
assert SourceMismatchRejects {
  some effective[Root.rootCap] and
    (RootInput.sourceAsset != effective[Root.rootCap] or
      RootInput.sourceVersion != effective[Root.rootCap].(VersionSelection.selectedVersion))
  implies not accepted
}
assert RootOuterLockWins {
  all i: rootProjected, x: settingParticipating[Root.rootCap, i] & LockedAssign |
    (x.at != Workspace and
      no outer: settingParticipating[Root.rootCap, i] & LockedAssign |
        outer.at != Workspace and outer.at -> x.at in settingLt)
    implies (resultFrom[i] = x.at and resultLock[i] = x.at)
}
assert NoLockTakesInnermost {
  all i: rootProjected |
    no settingLockLayers[Root.rootCap, i] and some settingParticipating[Root.rootCap, i]
    implies resultFrom[i] = { l: settingParticipating[Root.rootCap, i].at |
      no inner: settingParticipating[Root.rootCap, i].at | l -> inner in settingLt }
}

pred lockedRootWitness {
  accepted
  some i: rootProjected, org: settingParticipating[Root.rootCap, i] & LockedAssign,
    sess: settingParticipating[Root.rootCap, i] |
    org.at = Organization and sess.at = Session
  some resultComposition
}
pred mismatchWitness {
  some effective[Root.rootCap]
  RootInput.sourceAsset = effective[Root.rootCap]
  RootInput.sourceVersion != effective[Root.rootCap].(VersionSelection.selectedVersion)
}

run lockedRootWitness for 6 but 3 Cap, 5 Holding, 4 Assign, 3 Item, 3 Asset, 2 Owner, 2 Version
run mismatchWitness for 6 but 3 Cap, 5 Holding, 4 Assign, 3 Item, 3 Asset, 2 Owner, 2 Version
check RootNeverBecomesMember for 6 but 3 Cap, 5 Holding, 4 Assign, 3 Item, 3 Asset, 2 Owner, 2 Version
check VisibleRootIsProjected for 6 but 3 Cap, 5 Holding, 4 Assign, 3 Item, 3 Asset, 2 Owner, 2 Version
check MissingRootContributesNoSetting for 6 but 3 Cap, 5 Holding, 4 Assign, 3 Item, 3 Asset, 2 Owner, 2 Version
check SourceMismatchRejects for 6 but 3 Cap, 5 Holding, 4 Assign, 3 Item, 3 Asset, 2 Owner, 2 Version
check RootOuterLockWins for 6 but 3 Cap, 5 Holding, 4 Assign, 3 Item, 3 Asset, 2 Owner, 2 Version
check NoLockTakesInnermost for 6 but 3 Cap, 5 Holding, 4 Assign, 3 Item, 3 Asset, 2 Owner, 2 Version

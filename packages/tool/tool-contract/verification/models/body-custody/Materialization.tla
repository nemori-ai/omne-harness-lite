---------------------------- MODULE Materialization ----------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Bug
Permanent == {"data", "preview", "native-meta"}
FinalSlots == Permanent \cup {"body"}
VARIABLES now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
          commitRequested, committed, commitKnown, activatedAt, expires,
          finalUses, rawTask, expired, delivered, ack, effects
vars == <<now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
          commitRequested, committed, commitKnown, activatedAt, expires,
          finalUses, rawTask, expired, delivered, ack, effects>>
Init == /\ now = 0 /\ raw = TRUE /\ rawUse = TRUE
        /\ validated = FALSE /\ barrier = FALSE /\ bytes = {} /\ confirmed = {}
        /\ prepared = FALSE /\ commitRequested = FALSE /\ committed = FALSE /\ commitKnown = FALSE
        /\ activatedAt = 0 /\ expires = 0 /\ finalUses = {} /\ rawTask = "none"
        /\ expired = FALSE /\ delivered = FALSE /\ ack = FALSE /\ effects = 1
Validate == /\ raw /\ ~committed /\ validated' = TRUE
            /\ UNCHANGED <<now, raw, rawUse, barrier, bytes, confirmed, prepared,
                commitRequested, committed, commitKnown, activatedAt, expires,
                finalUses, rawTask, expired, delivered, ack, effects>>
FinishBarrier == /\ barrier' = TRUE
                 /\ UNCHANGED <<now, raw, rawUse, validated, bytes, confirmed, prepared,
                     commitRequested, committed, commitKnown, activatedAt, expires,
                     finalUses, rawTask, expired, delivered, ack, effects>>
WriteSlot(s) ==
  /\ raw /\ validated /\ ~committed /\ bytes' = bytes \cup {s}
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
InspectSlot(s) ==
  /\ s \in bytes /\ ~committed /\ confirmed' = confirmed \cup {s}
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
Prepare ==
  /\ validated /\ barrier /\ confirmed = FinalSlots /\ bytes = FinalSlots
  /\ ~committed /\ prepared' = TRUE
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, confirmed,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
RequestCommit ==
  /\ prepared /\ ~commitRequested /\ commitRequested' = TRUE
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
      committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
Commit ==
  /\ commitRequested /\ prepared /\ ~committed /\ bytes = FinalSlots
  /\ validated /\ barrier
  /\ committed' = TRUE /\ activatedAt' = now /\ expires' = now + 1
  /\ finalUses' = FinalSlots /\ rawUse' = FALSE /\ rawTask' = "pending"
  /\ UNCHANGED <<now, raw, validated, barrier, bytes, confirmed, prepared,
      commitRequested, commitKnown, expired, delivered, ack, effects>>
InspectCommit ==
  /\ committed /\ commitKnown' = TRUE
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
      commitRequested, committed, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
LoseCommitReply ==
  /\ commitKnown' = FALSE
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
      commitRequested, committed, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
DeleteRaw ==
  /\ raw /\ ((rawTask = "pending" /\ ~rawUse) \/ Bug = "early-raw")
  /\ raw' = FALSE
  /\ UNCHANGED <<now, rawUse, validated, barrier, bytes, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
ConfirmRaw ==
  /\ rawTask = "pending" /\ ~raw /\ rawTask' = "done"
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, expired, delivered, ack, effects>>
Tick ==
  /\ (now < 2 \/ (committed /\ now < 4)) /\ now' = now + 1
  /\ UNCHANGED <<raw, rawUse, validated, barrier, bytes, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
Expire ==
  /\ committed /\ now >= expires /\ ~expired
  /\ expired' = TRUE /\ finalUses' = finalUses \ {"body"}
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      rawTask, delivered, ack, effects>>
DeleteBody ==
  /\ expired /\ "body" \notin finalUses
  /\ bytes' = IF Bug = "delete-data" THEN bytes \ {"body","data"} ELSE bytes \ {"body"}
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
Deliver ==
  /\ commitKnown /\ delivered' = TRUE
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, ack, effects>>
Acknowledge ==
  /\ delivered /\ ack' = TRUE
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, delivered, effects>>
EarlyActivate ==
  /\ Bug = "early-activate" /\ "body" \in bytes /\ ~committed
  /\ expires' = now + 1
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, bytes, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt,
      finalUses, rawTask, expired, delivered, ack, effects>>
UnknownCleanup ==
  /\ Bug = "unknown-cleanup" /\ commitRequested /\ ~commitKnown
  /\ bytes' = {}
  /\ UNCHANGED <<now, raw, rawUse, validated, barrier, confirmed, prepared,
      commitRequested, committed, commitKnown, activatedAt, expires,
      finalUses, rawTask, expired, delivered, ack, effects>>
RetryOrCrash == UNCHANGED vars
Next == \/ Validate \/ FinishBarrier \/ Prepare \/ RequestCommit \/ Commit
        \/ InspectCommit \/ LoseCommitReply \/ DeleteRaw \/ ConfirmRaw \/ Tick
        \/ Expire \/ DeleteBody \/ Deliver \/ Acknowledge \/ EarlyActivate \/ UnknownCleanup \/ RetryOrCrash
        \/ \E s \in FinalSlots: WriteSlot(s) \/ InspectSlot(s)
Spec == Init /\ [][Next]_vars
        /\ WF_vars(Tick) /\ WF_vars(DeleteRaw) /\ WF_vars(ConfirmRaw)
        /\ WF_vars(Expire) /\ WF_vars(DeleteBody)
TypeOK == /\ now \in 0..4 /\ bytes \subseteq FinalSlots /\ confirmed \subseteq FinalSlots
          /\ finalUses \subseteq FinalSlots /\ expires \in 0..3
          /\ rawTask \in {"none","pending","done"}
RawUntilCommit == ~committed => raw /\ rawUse
FinalDataRecoverable == committed => Permanent \subseteq bytes /\ Permanent \subseteq finalUses
ReplacementBeforeRawRelease == ~raw => committed /\ Permanent \subseteq bytes /\ ("body" \in bytes \/ expired)
ActivationOnlyAtCommit == (expires # 0) <=> committed
FixedActivatedDeadline == committed => expires = activatedAt + 1
CommitPrepared == committed => prepared /\ validated /\ barrier /\ ~rawUse /\ rawTask # "none"
UnknownIsNotFailure == commitRequested /\ ~commitKnown /\ committed => Permanent \subseteq bytes
DeliveryAfterCommit == delivered => committed
ExpiryOnlyActivated == expired => committed /\ now >= expires
EffectStable == effects = 1
CleanupWithoutAck == committed ~> (~raw /\ rawTask = "done" /\ "body" \notin bytes)
=============================================================================

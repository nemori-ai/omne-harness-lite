---------------------------- MODULE Reception ----------------------------
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Tenants, Deliveries, Capacity, SplitPublish, PrecommitSend,
          ClearBlockedOnRebuild
Keys == Tenants \X Deliveries
NoIdentity == <<>>
Identity(k) == <<k[1], "execution", k[2]>>
Fresh == [commit |-> "absent", material |-> FALSE, entry |-> FALSE,
          operation |-> NoIdentity, original |-> NoIdentity,
          receipt |-> NoIdentity, saved |-> NoIdentity,
          known |-> "none", outlet |-> "none", handoff |-> NoIdentity,
          publications |-> 0, wasExcluded |-> FALSE, wasBlocked |-> FALSE]
VARIABLES records, attached, receiverGeneration,
          identityOK, isolationOK, detachOK, validationOK
vars == <<records, attached, receiverGeneration,
          identityOK, isolationOK, detachOK, validationOK>>

Init == /\ records = [k \in Keys |-> Fresh]
        /\ attached = [t \in Tenants |-> TRUE]
        /\ receiverGeneration = 0
        /\ identityOK = TRUE /\ isolationOK = TRUE
        /\ detachOK = TRUE /\ validationOK = TRUE

Held(t) == Cardinality({k \in Keys : k[1] = t /\
                          records[k].commit \in {"pending", "committed"}})

\* Monitor a local transition, including forbidden cross-tenant attempts.
\* These monitors inspect the actual next record values, not a claimed action result.
Local(k, authorized, returned, access, authority) ==
  /\ attached' = attached
  /\ receiverGeneration' = receiverGeneration
  /\ isolationOK' = (isolationOK /\
       (\A j \in Keys \ {k} : records'[j] = records[j]) /\
       (~authorized => records' = records))
  /\ identityOK' = (identityOK /\
       (records[k].original # NoIdentity =>
         records'[k].operation = records[k].original) /\
       (records[k].handoff # NoIdentity =>
         records'[k].handoff = records[k].handoff) /\
       (returned = "saved" =>
         records'[k].saved = records[k].receipt))
  /\ validationOK' = (validationOK /\
       (returned = "saved" => access = "allowed" /\ authority = "valid"))
  /\ detachOK' = detachOK

\* Inputs abstract current AccessCheck and Model inspect/dispatches results.
\* Every invocation executes this order, including all cached returns.
Push(k, actor, access, authority, sameContent) ==
 LET r == records[k]
     authorized == actor = k[1] /\ access = "allowed"
     result == IF ~authorized THEN "rejected-before-model"
               ELSE IF authority # "valid" THEN "unavailable-or-invalid"
               ELSE IF ~sameContent /\ r.commit # "absent" THEN "conflict"
               ELSE IF r.commit = "committed" THEN "saved"
               ELSE IF r.commit = "excluded" THEN "excluded"
               ELSE IF r.commit = "pending" THEN "unknown"
               ELSE IF Held(k[1]) >= Capacity THEN "backpressured"
               ELSE "begin"
 IN /\ CASE result = "begin" ->
               records' = [records EXCEPT ![k] =
                 [@ EXCEPT !.commit = "pending", !.known = "unknown",
                           !.operation = Identity(k), !.original = Identity(k)]]
         [] result = "saved" ->
               records' = [records EXCEPT ![k] =
                 [@ EXCEPT !.saved = r.receipt, !.known = "committed"]]
         [] result = "excluded" ->
               records' = [records EXCEPT ![k].known = "excluded"]
         [] OTHER -> records' = records
    /\ Local(k, authorized, result, access, authority)

\* Publication is one authoritative step. The bad switch exposes its first half.
Publish(k, responseKnown) ==
 /\ records[k].commit = "pending"
 /\ records' = [records EXCEPT ![k] =
      [@ EXCEPT !.commit = IF SplitPublish THEN "pending" ELSE "committed",
                !.material = TRUE, !.entry = ~SplitPublish,
                !.receipt = IF SplitPublish THEN NoIdentity ELSE Identity(k),
                !.publications = @ + 1,
                !.known = IF ~SplitPublish /\ responseKnown
                           THEN "committed" ELSE "unknown"]]
 /\ Local(k, TRUE, "none", "none", "none")

FinishSplit(k) ==
 /\ SplitPublish /\ records[k].material /\ ~records[k].entry
 /\ records' = [records EXCEPT ![k] =
      [@ EXCEPT !.commit = "committed", !.entry = TRUE,
                !.receipt = Identity(k)]]
 /\ Local(k, TRUE, "none", "none", "none")

\* A fence is the positive exclusion evidence; a query never creates it.
Exclude(k) ==
 /\ records[k].commit = "pending"
 /\ records' = [records EXCEPT ![k] =
      [@ EXCEPT !.commit = "excluded", !.wasExcluded = TRUE]]
 /\ Local(k, TRUE, "none", "none", "none")

Query(k, actor, access, readable) ==
 LET allowed == actor = k[1] /\ access = "allowed"
 IN /\ IF allowed /\ readable /\ records[k].commit \in {"committed", "excluded"}
          THEN records' = [records EXCEPT ![k].known = records[k].commit]
          ELSE records' = records
    /\ Local(k, allowed, "none", access, "none")

Enqueue(k) ==
 /\ records[k].commit = "committed" /\ records[k].known = "committed"
 /\ records[k].outlet = "none"
 /\ records' = [records EXCEPT ![k] =
      [@ EXCEPT !.outlet = "pending", !.handoff = Identity(k)]]
 /\ Local(k, TRUE, "none", "none", "none")

Send(k) ==
 /\ ((records[k].outlet = "pending" /\ records[k].commit = "committed")
       \/ (PrecommitSend /\ records[k].commit = "pending"))
 /\ records' = [records EXCEPT ![k] =
      [@ EXCEPT !.outlet = "inflight", !.handoff = Identity(k)]]
 /\ Local(k, TRUE, "none", "none", "none")

OutletReply(k, reply) ==
 /\ records[k].outlet = "inflight"
 /\ records' = [records EXCEPT ![k] =
      [@ EXCEPT !.outlet = CASE reply \in {"unknown", "unavailable"} -> "pending"
                                [] reply = "received" -> "received"
                                [] OTHER -> "blocked",
                !.wasBlocked = @ \/ reply \in {"denied", "conflict", "invalid"}]]
 /\ Local(k, TRUE, "none", "none", "none")

Detach(t) ==
 /\ attached[t]
 /\ attached' = [attached EXCEPT ![t] = FALSE]
 /\ records' = records
 /\ receiverGeneration' = receiverGeneration
 /\ detachOK' = (detachOK /\ records' = records)
 /\ UNCHANGED <<identityOK, isolationOK, validationOK>>

Attach(t) ==
 /\ ~attached[t]
 /\ attached' = [attached EXCEPT ![t] = TRUE]
 /\ UNCHANGED <<records, receiverGeneration, identityOK, isolationOK,
                 detachOK, validationOK>>

Rebuild ==
 /\ receiverGeneration' = 1 - receiverGeneration
 /\ records' = [k \in Keys |->
       IF ClearBlockedOnRebuild /\ records[k].outlet = "blocked"
       THEN [records[k] EXCEPT !.outlet = "pending"] ELSE records[k]]
 /\ UNCHANGED <<attached, identityOK, isolationOK, detachOK, validationOK>>

\* Enumerate response classes, omitting combinations that have the same
\* terminal rejection and unchanged state (for example cross-tenant+invalid).
Next == (\E k \in Keys :
          Push(k, k[1], "allowed", "valid", TRUE)
          \/ Push(k, k[1], "allowed", "valid", FALSE)
          \/ Push(k, k[1], "denied", "valid", TRUE)
          \/ Push(k, k[1], "unavailable", "valid", TRUE)
          \/ Push(k, k[1], "allowed", "invalid", TRUE)
          \/ Push(k, k[1], "allowed", "unavailable", TRUE)
          \/ (\E actor \in Tenants \ {k[1]} : Push(k, actor, "allowed", "valid", TRUE))
          \/ (\E responseKnown \in BOOLEAN : Publish(k, responseKnown))
          \/ FinishSplit(k) \/ Exclude(k)
          \/ Query(k, k[1], "allowed", TRUE)
          \/ Query(k, k[1], "allowed", FALSE)
          \/ Query(k, k[1], "denied", TRUE)
          \/ Query(k, k[1], "unavailable", TRUE)
          \/ (\E actor \in Tenants \ {k[1]} : Query(k, actor, "allowed", TRUE))
          \/ Enqueue(k) \/ Send(k)
          \/ (\E reply \in {"received", "unknown", "unavailable", "denied", "conflict", "invalid"} :
                 OutletReply(k, reply)))
        \/ (\E t \in Tenants : Detach(t) \/ Attach(t)) \/ Rebuild
Spec == Init /\ [][Next]_vars

TypeOK ==
 /\ attached \in [Tenants -> BOOLEAN] /\ receiverGeneration \in {0, 1}
 /\ \A k \in Keys :
      /\ records[k].commit \in {"absent", "pending", "committed", "excluded"}
      /\ records[k].known \in {"none", "unknown", "committed", "excluded"}
      /\ records[k].outlet \in {"none", "pending", "inflight", "received", "blocked"}
      /\ records[k].publications \in 0..2
AtomicVisibility == \A k \in Keys :
 /\ records[k].material = records[k].entry
 /\ (records[k].entry => records[k].commit = "committed" /\
        records[k].receipt = Identity(k) /\ records[k].publications = 1)
 /\ (records[k].commit = "committed" => records[k].entry)
NoPrecommitOutlet == \A k \in Keys :
 records[k].outlet # "none" => records[k].commit = "committed" /\ records[k].entry
ExcludedNeverRevives == \A k \in Keys : records[k].wasExcluded =>
 records[k].commit = "excluded" /\ ~records[k].material /\ ~records[k].entry
IdentityStable == identityOK /\ \A k \in Keys :
 /\ (records[k].operation # NoIdentity => records[k].operation = records[k].original)
 /\ (records[k].saved # NoIdentity => records[k].saved = records[k].receipt /\
       records[k].receipt = Identity(k))
TenantIsolation == isolationOK /\ \A k \in Keys :
 /\ (records[k].operation # NoIdentity => records[k].operation[1] = k[1])
 /\ (records[k].receipt # NoIdentity => records[k].receipt[1] = k[1])
BlockedSurvivesRebuild == \A k \in Keys : records[k].wasBlocked => records[k].outlet = "blocked"
DetachPreservesSaved == detachOK
FreshValidationBeforeSaved == validationOK
CapacityBound == \A t \in Tenants : Held(t) <= Capacity
=============================================================================

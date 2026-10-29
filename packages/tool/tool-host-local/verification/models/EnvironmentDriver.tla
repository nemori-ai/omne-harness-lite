--------------------------- MODULE EnvironmentDriver ---------------------------
EXTENDS Naturals, TLC
CONSTANTS LoopAllocated, CacheAllocated
Replies == {"allocated", "prepared", "pending", "unknown", "unavailable", "wrong"}
VARIABLE d
vars == <<d>>
Init == d = [step |-> 0, phase |-> "idle", extra |-> 0, cached |-> FALSE,
             cacheBasis |-> "none", response |-> "none", aborted |-> FALSE,
             original |-> TRUE, request |-> <<"A", "call-a1", "op-a1", "fixed-input">>,
             sent |-> {}, returnedE |-> FALSE, returnBasis |-> "none"]
Original == <<"A", "call-a1", "op-a1", "fixed-input">>
StartStep ==
  /\ d.phase \in {"idle", "done"} /\ d.step < 2
  /\ d' = [d EXCEPT !.step = @ + 1, !.phase = "first-await", !.extra = 0]
FirstReply(reply) ==
  /\ d.phase = "first-await" /\ reply \in Replies
  /\ d' = [d EXCEPT !.response = reply,
       !.phase = IF reply = "allocated" THEN "continue" ELSE "done",
       !.cached = @ \/ reply = "prepared",
       !.cacheBasis = IF reply = "prepared" THEN reply ELSE @]
Continue ==
  /\ d.phase = "continue" /\ ~d.aborted /\ d.original
  /\ d.extra < 2
  /\ d' = [d EXCEPT !.phase = "extra-await", !.extra = @ + 1,
                    !.sent = @ \cup {d.request}]
DeclineContinuation ==
  /\ d.phase = "continue" /\ (d.aborted \/ ~d.original)
  /\ d' = [d EXCEPT !.phase = "done"]
ExtraReply(reply) ==
  /\ d.phase = "extra-await" /\ reply \in Replies
  /\ d' = [d EXCEPT !.response = reply,
       !.phase = IF LoopAllocated /\ reply = "allocated" THEN "continue" ELSE "done",
       !.cached = @ \/ reply = "prepared" \/ (CacheAllocated /\ reply = "allocated"),
       !.cacheBasis = IF reply = "prepared" \/ (CacheAllocated /\ reply = "allocated")
                     THEN reply ELSE @]
Reconnect(reply) ==
  /\ d.phase \in {"idle", "done"} /\ reply \in Replies
  /\ d' = [d EXCEPT !.returnedE = d.cached \/ reply = "prepared",
       !.returnBasis = IF d.cached THEN d.cacheBasis ELSE reply]
Abort == /\ ~d.aborted /\ d' = [d EXCEPT !.aborted = TRUE]
AdapterChange == d' = [d EXCEPT !.original = ~@]
Next == StartStep \/ Continue \/ DeclineContinuation \/ Abort \/ AdapterChange
        \/ (\E reply \in Replies : FirstReply(reply) \/ ExtraReply(reply) \/ Reconnect(reply))
Spec == Init /\ [][Next]_vars
TypeOK == /\ d.step \in 0..2 /\ d.extra \in 0..2
          /\ d.phase \in {"idle", "done", "first-await", "continue", "extra-await"}
          /\ d.cached \in BOOLEAN /\ d.aborted \in BOOLEAN /\ d.original \in BOOLEAN
          /\ d.returnedE \in BOOLEAN
OneExtraPreparePerStep == d.extra <= 1
OnlyPreparedCached == d.cached => d.cacheBasis = "prepared"
OnlyPreparedExecutable == d.returnedE => d.returnBasis = "prepared"
OriginalContinuationInput == d.sent \subseteq {Original}
=============================================================================

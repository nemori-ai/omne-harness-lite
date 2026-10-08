---------------------------- MODULE Publication ----------------------------
EXTENDS Naturals, FiniteSets
CONSTANT RequireMarkerGate, ProtectPublished, RequireStoppedForAbsence
VARIABLES content, pins, writers, markers, receipts, published, key,
          payload, finalWinner, finalReceipt, attempts, phase
Names == {"created", "ready"}
vars == <<content,pins,writers,markers,receipts,published,key,payload,
          finalWinner,finalReceipt,attempts,phase>>
Init == /\ content = {} /\ pins = {} /\ writers = {}
        /\ markers = {} /\ published = {} /\ key = [n \in Names |-> 1]
        /\ payload = [n \in Names |-> 1]
        /\ receipts = [n \in Names |-> "none"]
        /\ finalWinner = 0 /\ finalReceipt = "none" /\ attempts = 0
        /\ phase = "unpublished"
Store(n) == /\ n \notin content /\ content' = content \cup {n}
            /\ UNCHANGED <<pins,writers,markers,receipts,published,key,payload,
                finalWinner,finalReceipt,attempts,phase>>
Begin(n) == /\ receipts[n] = "none"
            /\ (n = "created" \/ "created" \in published)
            /\ pins' = pins \cup {n} /\ writers' = writers \cup {n}
            /\ receipts' = [receipts EXCEPT ![n] = "unknown"]
            /\ UNCHANGED <<content,markers,published,key,payload,
                finalWinner,finalReceipt,attempts,phase>>
Commit(n) == /\ n \in writers /\ n \notin markers
             /\ (RequireMarkerGate => n \in content /\ n \in pins)
             /\ markers' = markers \cup {n}
             /\ UNCHANGED <<content,pins,writers,receipts,published,key,payload,
                 finalWinner,finalReceipt,attempts,phase>>
StopWriter(n) == /\ n \in writers /\ writers' = writers \ {n}
                 /\ UNCHANGED <<content,pins,markers,receipts,published,key,payload,
                     finalWinner,finalReceipt,attempts,phase>>
Confirm(n) == /\ n \in markers /\ n \notin published
              /\ receipts' = [receipts EXCEPT ![n] = "confirmed"]
              /\ published' = published \cup {n}
              /\ phase' = IF n = "ready" THEN "complete" ELSE "open"
              /\ UNCHANGED <<content,pins,writers,markers,key,payload,
                  finalWinner,finalReceipt,attempts>>
Absent(n) == /\ receipts[n] = "unknown" /\ n \notin markers
             /\ (RequireStoppedForAbsence => n \notin writers)
             /\ receipts' = [receipts EXCEPT ![n] = "none"]
             /\ pins' = pins \ {n}
             /\ UNCHANGED <<content,writers,markers,published,key,payload,
                 finalWinner,finalReceipt,attempts,phase>>
Cleanup(n) == /\ n \in content /\ n \notin pins /\ n \notin writers
              /\ (ProtectPublished => n \notin markers)
              /\ content' = content \ {n}
              /\ UNCHANGED <<pins,writers,markers,receipts,published,key,payload,
                  finalWinner,finalReceipt,attempts,phase>>
ReleasePin(n) == /\ n \in pins /\ n \notin writers
                 /\ (~ProtectPublished \/ n \notin markers)
                 /\ pins' = pins \ {n}
                 /\ UNCHANGED <<content,writers,markers,receipts,published,key,payload,
                     finalWinner,finalReceipt,attempts,phase>>
FinalCommit(c) == /\ "ready" \in published /\ finalWinner = 0
                  /\ finalWinner' = c /\ finalReceipt' = "unknown"
                  /\ attempts' = attempts + 1
                  /\ UNCHANGED <<content,pins,writers,markers,receipts,published,key,payload,phase>>
RecognizeFinal == /\ finalWinner # 0 /\ finalReceipt = "unknown"
                  /\ finalReceipt' = "confirmed"
                  /\ UNCHANGED <<content,pins,writers,markers,receipts,published,key,payload,
                      finalWinner,attempts,phase>>
Next == (\E n \in Names: Store(n) \/ Begin(n) \/ Commit(n) \/ StopWriter(n)
         \/ Confirm(n) \/ Absent(n) \/ Cleanup(n) \/ ReleasePin(n))
        \/ (\E c \in {1,2}: FinalCommit(c)) \/ RecognizeFinal
Spec == Init /\ [][Next]_vars
MarkerHasContent == markers \subseteq content
PublicationConfirmed == published \subseteq markers
PendingWriterPinned == writers \subseteq pins
OriginalKeyPayload == \A n \in Names: key[n] = 1 /\ payload[n] = 1
OneFinal == attempts <= 1
FinalRequiresReady == finalWinner # 0 => "ready" \in published
ReadyTerminal == "ready" \in published => phase = "complete"
=============================================================================

------------------------- MODULE AdaptationBinding -------------------------
EXTENDS Naturals, Sequences

CONSTANT PinBinding, RequireExact
VARIABLES phase, current, bound, original, available, sent, records, reconciled

Versions == {1, 2}
vars == <<phase, current, bound, original, available, sent, records, reconciled>>

Init == /\ phase = "idle" /\ current = 1 /\ bound = 0 /\ original = 0
        /\ available = Versions /\ sent = <<>> /\ records = <<>>
        /\ reconciled = FALSE

Open == /\ phase = "idle" /\ current \in available
        /\ phase' = "open" /\ bound' = current /\ original' = current
        /\ UNCHANGED <<current, available, sent, records, reconciled>>

Publish == /\ current = 1 /\ current' = 2
           /\ UNCHANGED <<phase, bound, original, available, sent, records, reconciled>>

Chosen == IF PinBinding THEN bound ELSE current
Actual == IF Chosen \in available THEN Chosen ELSE current

Send == /\ phase \in {"open", "resumable"} /\ Len(sent) < 2
        /\ (RequireExact => Chosen \in available)
        /\ Actual \in available
        /\ sent' = Append(sent, Actual)
        /\ records' = Append(records, bound)
        /\ phase' = "awaiting"
        /\ UNCHANGED <<current, bound, original, available, reconciled>>

Again == /\ phase = "awaiting" /\ Len(sent) < 2
         /\ phase' = "open"
         /\ UNCHANGED <<current, bound, original, available, sent, records, reconciled>>

Crash == /\ phase = "awaiting" /\ Len(sent) = 1 /\ ~reconciled
         /\ phase' = "down" /\ bound' = 0
         /\ UNCHANGED <<current, original, available, sent, records, reconciled>>

MissingOld == /\ phase = "down" /\ 1 \in available
              /\ available' = available \ {1}
              /\ UNCHANGED <<phase, current, bound, original, sent, records, reconciled>>

Reconcile == /\ phase = "down"
             /\ phase' = "resumable"
             /\ bound' = records[Len(records)]
             /\ reconciled' = TRUE
             /\ UNCHANGED <<current, original, available, sent, records>>

End == /\ phase \in {"open", "awaiting", "resumable"}
       /\ phase' = "ended"
       /\ UNCHANGED <<current, bound, original, available, sent, records, reconciled>>

Next == Open \/ Publish \/ Send \/ Again \/ Crash \/ MissingOld \/ Reconcile \/ End
Spec == Init /\ [][Next]_vars /\ WF_vars(Reconcile)

TypeOK == /\ phase \in {"idle", "open", "awaiting", "down", "resumable", "ended"}
          /\ current \in Versions /\ bound \in 0..2 /\ original \in 0..2
          /\ available \subseteq Versions /\ sent \in Seq(Versions)
          /\ records \in Seq(Versions) /\ Len(sent) <= 2
          /\ Len(records) = Len(sent) /\ reconciled \in BOOLEAN
SentUsesOriginal == \A i \in 1..Len(sent) : sent[i] = original
SentMatchesRecord == \A i \in 1..Len(sent) : sent[i] = records[i]
RecoveredOriginal == phase = "resumable" => bound = original
ReconcileNeverSends == [][phase = "down" /\ phase' = "resumable" => sent' = sent]_vars
LostEventuallyReconciled == (phase = "down") ~> reconciled

=============================================================================

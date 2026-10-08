------------------------- MODULE FailureHistory -------------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS CheckAssociation, KeepHistory, CommitFirst, ReuseFinal
VARIABLES calls, source, received, kind, stage, log, returned, evaluations,
          crashed, badAssociation, badHistory, badReturn
vars == <<calls, source, received, kind, stage, log, returned, evaluations,
          crashed, badAssociation, badHistory, badReturn>>

Calls == {"C1", "C2"}
Kinds == {"observed", "unavailable", "errored", "ask", "retry"}
HistoryItem == [call : Calls, extension : {"default", "custom"}, plan : {"A", "B"}, at : {0}]
Histories == UNION {[1..n -> HistoryItem] : n \in 0..2}
ValidCalls == Cardinality({calls[i] : i \in 1..Len(calls)}) = 1
SelectedCall == calls[1]
HistoryValid == \A i \in 1..Len(source): source[i].call = SelectedCall

Init ==
  /\ calls \in {<<"C1">>, <<"C2">>, <<"C1", "C1">>, <<"C1", "C2">>}
  /\ source \in Histories
  /\ received = <<>>
  /\ kind \in Kinds
  /\ stage = "validate"
  /\ log = <<>>
  /\ returned = FALSE
  /\ evaluations = 0
  /\ crashed = FALSE
  /\ badAssociation = FALSE
  /\ badHistory = FALSE
  /\ badReturn = FALSE

Validate ==
  /\ stage = "validate"
  /\ IF CheckAssociation /\ ~(ValidCalls /\ HistoryValid)
        THEN /\ stage' = "rejected"
             /\ received' = received
        ELSE /\ stage' = "evaluated"
             /\ received' = IF KeepHistory THEN source ELSE <<>>
  /\ evaluations' = IF stage' = "evaluated" THEN evaluations + 1 ELSE evaluations
  /\ badHistory' = (badHistory \/ (stage' = "evaluated" /\ received' # source))
  /\ UNCHANGED <<calls, source, kind, log, returned, crashed, badAssociation, badReturn>>

Commit ==
  /\ stage = "evaluated"
  /\ log' = Append(log, [modelCallId |-> SelectedCall, output |-> kind])
  /\ badAssociation' = (badAssociation \/ ~ValidCalls \/ ~HistoryValid)
  /\ stage' = "committed"
  /\ UNCHANGED <<calls, source, received, kind, returned, evaluations, crashed, badHistory, badReturn>>

Return ==
  /\ stage = "committed" \/ (~CommitFirst /\ stage = "evaluated")
  /\ badReturn' = (badReturn \/ Len(log) = 0)
  /\ returned' = TRUE
  /\ stage' = "done"
  /\ UNCHANGED <<calls, source, received, kind, log, evaluations, crashed, badAssociation, badHistory>>

Crash ==
  /\ stage = "committed"
  /\ kind # "ask"
  /\ ~crashed
  /\ crashed' = TRUE
  /\ received' = <<>>
  /\ stage' = "recover"
  /\ UNCHANGED <<calls, source, kind, log, returned, evaluations, badAssociation, badHistory, badReturn>>

Recover ==
  /\ stage = "recover"
  /\ stage' = IF ReuseFinal THEN "committed" ELSE "validate"
  /\ UNCHANGED <<calls, source, received, kind, log, returned, evaluations, crashed,
                  badAssociation, badHistory, badReturn>>

Next == Validate \/ Commit \/ Return \/ Crash \/ Recover
Spec == Init /\ [][Next]_vars
CallAssociation == ~badAssociation
LosslessHistory == ~badHistory
WriteBeforeReturn == ~badReturn
ReplayNoReevaluation == evaluations <= 1 /\ Len(log) <= 1
=============================================================================

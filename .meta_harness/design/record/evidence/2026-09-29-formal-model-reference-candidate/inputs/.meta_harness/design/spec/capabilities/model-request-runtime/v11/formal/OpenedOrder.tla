---------------------------- MODULE OpenedOrder ----------------------------
EXTENDS Naturals, Sequences
CONSTANTS CheckCancel, CheckTail, RetryAfterContent
VARIABLES log, currentAttempt, readTail, readPermit, openedReceipt,
          visible, lost, sends, writerStopped
vars == <<log,currentAttempt,readTail,readPermit,openedReceipt,visible,lost,sends,writerStopped>>
Has(x) == \E i \in 1..Len(log): log[i] = x
Index(x) == CHOOSE i \in 1..Len(log): log[i] = x
Init == /\ log = <<"dispatch-1">> /\ currentAttempt = 1
        /\ readTail = 0 /\ readPermit = FALSE /\ openedReceipt = "none"
        /\ visible = FALSE /\ lost = FALSE /\ sends = 1 /\ writerStopped = FALSE
NewAttempt == /\ currentAttempt = 1 /\ currentAttempt' = 2
              /\ log' = Append(log,"attempt-2")
              /\ UNCHANGED <<readTail,readPermit,openedReceipt,visible,lost,sends,writerStopped>>
Cancel == /\ ~Has("cancel") /\ log' = Append(log,"cancel")
          /\ UNCHANGED <<currentAttempt,readTail,readPermit,openedReceipt,visible,lost,sends,writerStopped>>
ReadPrefix == /\ ~Has("opened-1") /\ ~writerStopped
              /\ readTail' = Len(log)
              /\ readPermit' = ~Has("final") /\ (~CheckCancel \/ ~Has("cancel"))
              /\ UNCHANGED <<log,currentAttempt,openedReceipt,visible,lost,sends,writerStopped>>
CommitOpened == /\ readPermit /\ ~writerStopped /\ ~Has("opened-1")
                /\ (~CheckTail \/ readTail = Len(log))
                /\ log' = Append(log,"opened-1") /\ openedReceipt' = "unknown"
                /\ UNCHANGED <<currentAttempt,readTail,readPermit,visible,lost,sends,writerStopped>>
ConfirmOpened == /\ openedReceipt = "unknown"
                 /\ openedReceipt' = "confirmed"
                 /\ UNCHANGED <<log,currentAttempt,readTail,readPermit,visible,lost,sends,writerStopped>>
Deliver == /\ openedReceipt = "confirmed" /\ ~Has("cancel") /\ ~writerStopped
           /\ visible' = TRUE
           /\ UNCHANGED <<log,currentAttempt,readTail,readPermit,openedReceipt,lost,sends,writerStopped>>
Stop == /\ ~writerStopped /\ writerStopped' = TRUE
        /\ UNCHANGED <<log,currentAttempt,readTail,readPermit,openedReceipt,visible,lost,sends>>
Lose == /\ writerStopped /\ ~lost /\ lost' = TRUE
        /\ UNCHANGED <<log,currentAttempt,readTail,readPermit,openedReceipt,visible,sends,writerStopped>>
Recover == /\ lost /\ ~Has("final")
           /\ log' = Append(log,"final")
           /\ sends' = IF RetryAfterContent /\ Has("opened-1") THEN sends+1 ELSE sends
           /\ UNCHANGED <<currentAttempt,readTail,readPermit,openedReceipt,visible,lost,writerStopped>>
Next == NewAttempt \/ Cancel \/ ReadPrefix \/ CommitOpened \/ ConfirmOpened \/ Deliver \/ Stop \/ Lose \/ Recover
Spec == Init /\ [][Next]_vars
CancelCannotPrecedeOpened == (Has("cancel") /\ Has("opened-1")) => Index("opened-1") < Index("cancel")
ConfirmedBeforeVisible == visible => openedReceipt = "confirmed"
NoSendAfterOpenedLoss == Has("opened-1") => sends = 1
OriginalDispatch == Has("opened-1") => Has("dispatch-1")
=============================================================================

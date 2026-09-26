---------------------------- MODULE TuiDelivery ----------------------------
EXTENDS Naturals
CONSTANTS BadConfirm, BadOutputRestore, BadInputRestore, BadRelease, BadLateWrite
VARIABLES phase, revision, pending, flight, visible, actualWrite,
          inputDone, workDone, cgQuiet, restored, localClosed, targetCount,
          admittedInvisible, lateWrite
vars == <<phase, revision, pending, flight, visible, actualWrite, inputDone,
          workDone, cgQuiet, restored, localClosed, targetCount,
          admittedInvisible, lateWrite>>
None == 2
Init == /\ phase = "editing" /\ revision = 0
        /\ pending = None /\ flight = None /\ visible = None
        /\ actualWrite = FALSE /\ inputDone = TRUE /\ workDone = TRUE
        /\ cgQuiet = FALSE /\ restored = FALSE /\ localClosed = FALSE
        /\ targetCount = 0 /\ admittedInvisible = FALSE /\ lateWrite = FALSE
Preview == /\ phase = "editing" /\ phase' = "preview" /\ pending' = revision
           /\ UNCHANGED <<revision, flight, visible, actualWrite, inputDone,
                workDone, cgQuiet, restored, localClosed, targetCount,
                admittedInvisible, lateWrite>>
Resize == /\ phase = "preview" /\ revision = 0
          /\ revision' = 1 /\ pending' = 1
          /\ UNCHANGED <<phase, flight, visible, actualWrite, inputDone,
                workDone, cgQuiet, restored, localClosed, targetCount,
                admittedInvisible, lateWrite>>
Write == /\ phase # "closed" /\ pending # None /\ flight = None /\ ~restored
         /\ flight' = pending /\ pending' = None /\ actualWrite' = TRUE
         /\ UNCHANGED <<phase, revision, visible, inputDone, workDone,
               cgQuiet, restored, localClosed, targetCount, admittedInvisible, lateWrite>>
FinishWrite == /\ actualWrite /\ visible' = flight
               /\ flight' = None /\ actualWrite' = FALSE
               /\ UNCHANGED <<phase, revision, pending, inputDone, workDone,
                     cgQuiet, restored, localClosed, targetCount, admittedInvisible, lateWrite>>
StartPaste == /\ phase \in {"editing", "preview"} /\ inputDone
              /\ inputDone' = FALSE
              /\ UNCHANGED <<phase, revision, pending, flight, visible, actualWrite,
                    workDone, cgQuiet, restored, localClosed, targetCount,
                    admittedInvisible, lateWrite>>
EndPaste == /\ ~inputDone /\ inputDone' = TRUE
            /\ UNCHANGED <<phase, revision, pending, flight, visible, actualWrite,
                  workDone, cgQuiet, restored, localClosed, targetCount,
                  admittedInvisible, lateWrite>>
Confirm == /\ phase = "preview" /\ targetCount = 0 /\ inputDone
           /\ (BadConfirm \/ (visible = revision /\ flight = None /\ pending = None))
           /\ targetCount' = 1 /\ workDone' = FALSE
           /\ admittedInvisible' = (visible # revision \/ flight # None \/ pending # None)
           /\ UNCHANGED <<phase, revision, pending, flight, visible, actualWrite,
                 inputDone, cgQuiet, restored, localClosed, lateWrite>>
FinishWork == /\ ~workDone /\ workDone' = TRUE
              /\ UNCHANGED <<phase, revision, pending, flight, visible, actualWrite,
                    inputDone, cgQuiet, restored, localClosed, targetCount,
                    admittedInvisible, lateWrite>>
Stop == /\ phase \in {"editing", "preview"}
        /\ phase' = "closing" /\ pending' = None
        /\ UNCHANGED <<revision, flight, visible, actualWrite, inputDone, workDone,
              cgQuiet, restored, localClosed, targetCount, admittedInvisible, lateWrite>>
CloseCG == /\ phase = "closing" /\ workDone /\ ~cgQuiet /\ cgQuiet' = TRUE
           /\ UNCHANGED <<phase, revision, pending, flight, visible, actualWrite,
                 inputDone, workDone, restored, localClosed, targetCount,
                 admittedInvisible, lateWrite>>
Restore == /\ phase = "closing" /\ cgQuiet /\ ~restored
           /\ (inputDone \/ BadInputRestore)
           /\ (~actualWrite \/ BadOutputRestore)
           /\ restored' = TRUE
           /\ UNCHANGED <<phase, revision, pending, flight, visible, actualWrite,
                 inputDone, workDone, cgQuiet, localClosed, targetCount,
                 admittedInvisible, lateWrite>>
Release == /\ phase = "closing" /\ (restored \/ BadRelease)
           /\ localClosed' = TRUE /\ phase' = "closed"
           /\ UNCHANGED <<revision, pending, flight, visible, actualWrite,
                 inputDone, workDone, cgQuiet, restored, targetCount,
                 admittedInvisible, lateWrite>>
LateFrame == /\ BadLateWrite /\ restored /\ ~lateWrite
             /\ lateWrite' = TRUE
             /\ UNCHANGED <<phase, revision, pending, flight, visible, actualWrite,
                   inputDone, workDone, cgQuiet, restored, localClosed, targetCount,
                   admittedInvisible>>
Done == /\ phase = "closed" /\ UNCHANGED vars
Next == Preview \/ Resize \/ Write \/ FinishWrite \/ StartPaste \/ EndPaste \/
        Confirm \/ FinishWork \/ Stop \/ CloseCG \/ Restore \/ Release \/ LateFrame \/ Done
TypeOK == /\ phase \in {"editing", "preview", "closing", "closed"}
          /\ revision \in {0,1} /\ pending \in {None,0,1}
          /\ flight \in {None,0,1} /\ visible \in {None,0,1}
          /\ targetCount \in {0,1}
          /\ <<actualWrite,inputDone,workDone,cgQuiet,restored,localClosed,
               admittedInvisible,lateWrite>> \in BOOLEAN \X BOOLEAN \X BOOLEAN \X BOOLEAN
                    \X BOOLEAN \X BOOLEAN \X BOOLEAN \X BOOLEAN
VisibleBeforeConfirmation == ~admittedInvisible
RestoreAfterActualWork == restored => (inputDone /\ cgQuiet /\ ~actualWrite)
BorrowedStateReleasedLast == localClosed => (cgQuiet /\ restored /\ inputDone /\ ~actualWrite)
NoLateOutput == ~lateWrite
FinishAfterStop == (phase = "closing") ~> (phase = "closed")
Spec == Init /\ [][Next]_vars /\ WF_vars(EndPaste) /\ WF_vars(FinishWrite)
        /\ WF_vars(FinishWork) /\ WF_vars(CloseCG) /\ WF_vars(Restore) /\ WF_vars(Release)
=============================================================================

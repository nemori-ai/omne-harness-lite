-------------------------- MODULE TerminalExit --------------------------
EXTENDS Naturals
CONSTANT Mutation
VARIABLES phase, raw, stopping, localReleased, outputs, workDone, inputDone,
          pasteOpen, pasteStarted, cgClosed, rawAtInvoke
vars == <<phase, raw, stopping, localReleased, outputs, workDone, inputDone,
          pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
Init == /\ phase = "input" /\ raw = TRUE /\ stopping = FALSE
        /\ localReleased = FALSE /\ outputs = 0 /\ workDone = TRUE
        /\ inputDone = FALSE /\ pasteOpen = FALSE /\ pasteStarted = FALSE
        /\ cgClosed = FALSE /\ rawAtInvoke = FALSE
PasteStart == /\ phase = "input" /\ ~pasteStarted
              /\ pasteOpen' = TRUE /\ pasteStarted' = TRUE
              /\ UNCHANGED <<phase, raw, stopping, localReleased, outputs, workDone,
                              inputDone, cgClosed, rawAtInvoke>>
PasteEnd == /\ pasteOpen /\ pasteOpen' = FALSE
            /\ UNCHANGED <<phase, raw, stopping, localReleased, outputs, workDone,
                            inputDone, pasteStarted, cgClosed, rawAtInvoke>>
Input == /\ phase = "input" /\ ~stopping /\ ~pasteOpen
         /\ inputDone' = TRUE /\ phase' = "ready"
         /\ UNCHANGED <<raw, stopping, localReleased, outputs, workDone,
                         pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
Restore == /\ raw /\ ((inputDone /\ ~pasteOpen) \/ (Mutation = "early-echo" /\ pasteOpen /\ stopping))
           /\ raw' = FALSE
           /\ UNCHANGED <<phase, stopping, localReleased, outputs, workDone,
                           inputDone, pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
Invoke == /\ phase = "ready" /\ ~stopping
          /\ (~raw \/ Mutation = "raw-invoke")
          /\ phase' = "network" /\ workDone' = FALSE /\ rawAtInvoke' = raw
          /\ UNCHANGED <<raw, stopping, localReleased, outputs, inputDone,
                          pasteOpen, pasteStarted, cgClosed>>
Stop == /\ ~stopping /\ phase # "closed" /\ stopping' = TRUE
        /\ UNCHANGED <<phase, raw, localReleased, outputs, workDone,
                        inputDone, pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
CancelInput == /\ stopping /\ phase \in {"input", "ready"} /\ ~pasteOpen
               /\ phase' = "report" /\ inputDone' = TRUE
               /\ UNCHANGED <<raw, stopping, localReleased, outputs, workDone,
                               pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
NetworkDone == /\ phase = "network" /\ phase' = "settlement"
               /\ UNCHANGED <<raw, stopping, localReleased, outputs, workDone,
                               inputDone, pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
SettlementDone == /\ phase = "settlement" /\ ~localReleased
                  /\ phase' = "report" /\ workDone' = TRUE
                  /\ UNCHANGED <<raw, stopping, localReleased, outputs, inputDone,
                                  pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
CloseCG == /\ phase = "report" /\ ~cgClosed /\ workDone /\ inputDone /\ ~pasteOpen
           /\ (~raw \/ Mutation = "no-restore") /\ cgClosed' = TRUE
           /\ UNCHANGED <<phase, raw, stopping, localReleased, outputs, workDone,
                           inputDone, pasteOpen, pasteStarted, rawAtInvoke>>
CloseLocal == /\ ~localReleased
              /\ ((phase = "report" /\ cgClosed)
                  \/ (Mutation = "early-release" /\ phase = "settlement" /\ stopping)
                  \/ (Mutation = "tail-release" /\ pasteOpen /\ stopping))
              /\ localReleased' = TRUE
              /\ UNCHANGED <<phase, raw, stopping, outputs, workDone, inputDone,
                              pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
Output == /\ phase = "report" /\ cgClosed /\ localReleased /\ outputs = 0
          /\ outputs' = 1 /\ phase' = "written"
          /\ UNCHANGED <<raw, stopping, localReleased, workDone, inputDone,
                          pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
BadOutput == /\ Mutation = "double-output" /\ phase = "written" /\ outputs = 1
             /\ outputs' = 2
             /\ UNCHANGED <<phase, raw, stopping, localReleased, workDone, inputDone,
                             pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
Close == /\ phase = "written" /\ phase' = "closed"
         /\ UNCHANGED <<raw, stopping, localReleased, outputs, workDone, inputDone,
                         pasteOpen, pasteStarted, cgClosed, rawAtInvoke>>
Next == PasteStart \/ PasteEnd \/ Input \/ Restore \/ Invoke \/ Stop \/ CancelInput
        \/ NetworkDone \/ SettlementDone \/ CloseCG \/ CloseLocal \/ Output \/ BadOutput
        \/ Close \/ (phase = "closed" /\ UNCHANGED vars)
TypeOK == /\ phase \in {"input", "ready", "network", "settlement", "report", "written", "closed"}
          /\ raw \in BOOLEAN /\ stopping \in BOOLEAN /\ localReleased \in BOOLEAN
          /\ outputs \in 0..2 /\ workDone \in BOOLEAN /\ inputDone \in BOOLEAN
          /\ pasteOpen \in BOOLEAN /\ pasteStarted \in BOOLEAN
          /\ cgClosed \in BOOLEAN /\ rawAtInvoke \in BOOLEAN
TerminalRestored == localReleased => ~raw
RestoreBeforeInvoke == ~rawAtInvoke
NoEarlyEcho == ~raw => (inputDone /\ ~pasteOpen)
OneOutput == outputs <= 1
NoEarlyRelease == localReleased => (workDone /\ cgClosed)
NoTailRelease == localReleased => (inputDone /\ ~pasteOpen)
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)
EventuallyClosed == <>(phase = "closed")
=============================================================================

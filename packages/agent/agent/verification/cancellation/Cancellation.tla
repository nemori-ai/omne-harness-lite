--------------------------- MODULE Cancellation ---------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS ModelCalls, ToolCalls, Bugs
Calls == ModelCalls \cup ToolCalls
BugNames == {"no-fence", "spread-interrupt", "erase-content", "erase-cost",
             "omit-receive", "omit-finish"}
ASSUME /\ ModelCalls \cap ToolCalls = {}
       /\ Calls # {}
       /\ Bugs \subseteq BugNames

VARIABLES run, cancel, eligible, fenced, confirmed, agentEnd, handedOff,
          phase, outcome, interrupted, cancelStops, singleTarget,
          produced, content, costs, everContent, everCosts,
          dispatchSafe, isolationSafe, terminalWrites

vars == <<run, cancel, eligible, fenced, confirmed, agentEnd, handedOff,
          phase, outcome, interrupted, cancelStops, singleTarget,
          produced, content, costs, everContent, everCosts,
          dispatchSafe, isolationSafe, terminalWrites>>

Issued == {c \in Calls : phase[c] \in {"running", "finished"}}
Running == {c \in Calls : phase[c] = "running"}
Tokens == Calls \X {1, 2}
NoTarget == "none"

Init ==
  /\ run = "active"
  /\ cancel = "none"
  /\ eligible = TRUE
  /\ fenced = FALSE
  /\ confirmed = FALSE
  /\ agentEnd = "none"
  /\ handedOff = {}
  /\ phase = [c \in Calls |-> "idle"]
  /\ outcome = [c \in Calls |-> "none"]
  /\ interrupted = {}
  /\ cancelStops = {}
  /\ singleTarget = NoTarget
  /\ produced = {}
  /\ content = {}
  /\ costs = {}
  /\ everContent = {}
  /\ everCosts = {}
  /\ dispatchSafe = TRUE
  /\ isolationSafe = TRUE
  /\ terminalWrites = 0

Prepare(c) ==
  /\ eligible /\ agentEnd = "none" /\ phase[c] = "idle"
  /\ phase' = [phase EXCEPT ![c] = "prepared"]
  /\ UNCHANGED <<outcome, run, cancel, eligible, fenced, confirmed, agentEnd, handedOff,
       interrupted, cancelStops, singleTarget, produced, content, costs,
       everContent, everCosts, dispatchSafe, isolationSafe, terminalWrites>>

Dispatch(c) ==
  /\ phase[c] = "prepared"
  /\ ("no-fence" \in Bugs \/ (eligible /\ ~fenced))
  /\ phase' = [phase EXCEPT ![c] = "running"]
  /\ dispatchSafe' = (dispatchSafe /\ ~confirmed)
  /\ UNCHANGED <<outcome, run, cancel, eligible, fenced, confirmed, agentEnd, handedOff,
       interrupted, cancelStops, singleTarget, produced, content, costs,
       everContent, everCosts, isolationSafe, terminalWrites>>

RequestCancel ==
  /\ run = "active" /\ cancel = "none"
  /\ cancel' = "requested"
  /\ UNCHANGED <<outcome, run, eligible, fenced, confirmed, agentEnd, handedOff, phase,
       interrupted, cancelStops, singleTarget, produced, content, costs,
       everContent, everCosts, dispatchSafe, isolationSafe, terminalWrites>>

Revoke ==
  /\ cancel = "requested" /\ run = "active"
  /\ cancel' = "revoked"
  /\ eligible' = FALSE
  /\ run' = "cancelled"
  /\ terminalWrites' = terminalWrites + 1
  /\ UNCHANGED <<outcome, fenced, confirmed, agentEnd, handedOff, phase, interrupted,
       cancelStops, singleTarget, produced, content, costs, everContent,
       everCosts, dispatchSafe, isolationSafe>>

RejectCancel ==
  /\ cancel = "requested" /\ run = "completed"
  /\ cancel' = "rejected"
  /\ UNCHANGED <<outcome, run, eligible, fenced, confirmed, agentEnd, handedOff, phase,
       interrupted, cancelStops, singleTarget, produced, content, costs,
       everContent, everCosts, dispatchSafe, isolationSafe, terminalWrites>>

ApplyCancel ==
  /\ cancel = "revoked" /\ ~fenced
  /\ fenced' = TRUE
  /\ cancelStops' = Running
  /\ content' = IF "erase-content" \in Bugs THEN {} ELSE content
  /\ costs' = IF "erase-cost" \in Bugs THEN {} ELSE costs
  /\ UNCHANGED <<outcome, run, cancel, eligible, confirmed, agentEnd, handedOff, phase,
       interrupted, singleTarget, produced, everContent, everCosts,
       dispatchSafe, isolationSafe, terminalWrites>>

ConfirmCancel ==
  /\ fenced /\ ~confirmed
  /\ confirmed' = TRUE
  /\ UNCHANGED <<outcome, run, cancel, eligible, fenced, agentEnd, handedOff, phase,
       interrupted, cancelStops, singleTarget, produced, content, costs,
       everContent, everCosts, dispatchSafe, isolationSafe, terminalWrites>>

Interrupt(c) ==
  /\ c \in Running /\ singleTarget = NoTarget
  /\ run = "active" /\ agentEnd = "none"
  /\ singleTarget' = c
  /\ interrupted' = IF "spread-interrupt" \in Bugs THEN Running ELSE {c}
  /\ content' = IF "erase-content" \in Bugs THEN {} ELSE content
  /\ costs' = IF "erase-cost" \in Bugs THEN {} ELSE costs
  /\ UNCHANGED <<outcome, run, cancel, eligible, fenced, confirmed, agentEnd, handedOff,
       phase, cancelStops, produced, everContent, everCosts,
       dispatchSafe, terminalWrites>>
  /\ isolationSafe' = (isolationSafe /\ (interrupted' \ {c} = interrupted \ {c})
       /\ run' = run /\ eligible' = eligible /\ cancel' = cancel)

EmitPartial(c) ==
  /\ c \in Running /\ <<c, 1>> \notin produced
  /\ produced' = produced \cup {<<c, 1>>}
  /\ UNCHANGED <<outcome, run, cancel, eligible, fenced, confirmed, agentEnd, handedOff,
       phase, interrupted, cancelStops, singleTarget, content, costs,
       everContent, everCosts, dispatchSafe, isolationSafe, terminalWrites>>

Complete(c, result) ==
  /\ c \in Running
  /\ result = "complete" \/ (result = "interrupted" /\ c \in interrupted \cup cancelStops)
  /\ phase' = [phase EXCEPT ![c] = "finished"]
  /\ outcome' = [outcome EXCEPT ![c] = result]
  /\ produced' = produced \cup {<<c, 2>>}
  /\ UNCHANGED << run, cancel, eligible, fenced, confirmed, agentEnd, handedOff,
       interrupted, cancelStops, singleTarget, content, costs,
       everContent, everCosts, dispatchSafe, isolationSafe, terminalWrites>>

ReceiveContent(t) ==
  /\ "omit-receive" \notin Bugs /\ t \in produced \ content
  /\ content' = content \cup {t}
  /\ everContent' = everContent \cup {t}
  /\ UNCHANGED <<outcome, run, cancel, eligible, fenced, confirmed, agentEnd, handedOff,
       phase, interrupted, cancelStops, singleTarget, produced, costs,
       everCosts, dispatchSafe, isolationSafe, terminalWrites>>

ReceiveCost(t) ==
  /\ t \in produced \ costs
  /\ costs' = costs \cup {t}
  /\ everCosts' = everCosts \cup {t}
  /\ UNCHANGED <<outcome, run, cancel, eligible, fenced, confirmed, agentEnd, handedOff,
       phase, interrupted, cancelStops, singleTarget, produced, content,
       everContent, dispatchSafe, isolationSafe, terminalWrites>>

Handoff ==
  /\ confirmed /\ handedOff # Issued
  /\ handedOff' = Issued
  /\ UNCHANGED <<outcome, run, cancel, eligible, fenced, confirmed, agentEnd, phase,
       interrupted, cancelStops, singleTarget, produced, content, costs,
       everContent, everCosts, dispatchSafe, isolationSafe, terminalWrites>>

FinishAgent ==
  /\ "omit-finish" \notin Bugs /\ agentEnd = "none"
  /\ \/ /\ confirmed /\ handedOff = Issued
        /\ agentEnd' = "cancelled"
     \/ /\ ~fenced /\ eligible
        /\ \A c \in Calls : phase[c] = "finished"
        /\ content = produced /\ costs = produced
        /\ agentEnd' = "complete"
  /\ UNCHANGED <<outcome, run, cancel, eligible, fenced, confirmed, handedOff, phase,
       interrupted, cancelStops, singleTarget, produced, content, costs,
       everContent, everCosts, dispatchSafe, isolationSafe, terminalWrites>>

InterpretComplete ==
  /\ agentEnd = "complete" /\ run = "active"
  /\ run' = "completed"
  /\ eligible' = FALSE
  /\ terminalWrites' = terminalWrites + 1
  /\ UNCHANGED <<outcome, cancel, fenced, confirmed, agentEnd, handedOff, phase,
       interrupted, cancelStops, singleTarget, produced, content, costs,
       everContent, everCosts, dispatchSafe, isolationSafe>>

Internal == RequestCancel \/ Revoke \/ RejectCancel \/ ApplyCancel
            \/ ConfirmCancel \/ Handoff \/ FinishAgent \/ InterpretComplete
            \/ (\E c \in Calls : Prepare(c) \/ Dispatch(c) \/ Interrupt(c))
            \/ (\E t \in Tokens : ReceiveContent(t) \/ ReceiveCost(t))
FinishCall(c) == \E result \in {"complete", "interrupted"} : Complete(c, result)
Next == Internal \/ (\E c \in Calls : EmitPartial(c) \/ FinishCall(c))

InternalFairness ==
  /\ WF_vars(Revoke) /\ WF_vars(RejectCancel) /\ WF_vars(ApplyCancel)
  /\ WF_vars(ConfirmCancel) /\ WF_vars(Handoff) /\ WF_vars(FinishAgent)
  /\ WF_vars(InterpretComplete)
  /\ \A c \in Calls : WF_vars(Prepare(c)) /\ WF_vars(Dispatch(c))
  /\ \A t \in Tokens : WF_vars(ReceiveContent(t)) /\ WF_vars(ReceiveCost(t))
ExternalFairness == \A c \in Calls : WF_vars(FinishCall(c))
Spec == Init /\ [][Next]_vars /\ InternalFairness /\ ExternalFairness
CancelWithoutResponse == Init /\ [][Next]_vars /\ InternalFairness /\ WF_vars(RequestCancel)

TypeOK ==
  /\ run \in {"active", "completed", "cancelled"}
  /\ cancel \in {"none", "requested", "revoked", "rejected"}
  /\ eligible \in BOOLEAN /\ fenced \in BOOLEAN /\ confirmed \in BOOLEAN
  /\ agentEnd \in {"none", "complete", "cancelled"}
  /\ handedOff \subseteq Issued
  /\ phase \in [Calls -> {"idle", "prepared", "running", "finished"}]
  /\ outcome \in [Calls -> {"none", "complete", "interrupted"}]
  /\ interrupted \subseteq Calls /\ cancelStops \subseteq Calls
  /\ singleTarget \in Calls \cup {NoTarget}
  /\ produced \subseteq Tokens
  /\ content \subseteq produced /\ costs \subseteq produced
  /\ everContent \subseteq produced /\ everCosts \subseteq produced
  /\ dispatchSafe \in BOOLEAN /\ isolationSafe \in BOOLEAN
  /\ terminalWrites \in 0..1
NoDispatchAfterConfirmation == dispatchSafe
RetainContent == everContent \subseteq content
RetainCosts == everCosts \subseteq costs
SingleCallIsolation == isolationSafe /\ (singleTarget = NoTarget \/ interrupted \subseteq {singleTarget})
TerminalUnique == terminalWrites = (IF run = "active" THEN 0 ELSE 1)
ConfirmationFenced == confirmed => (fenced /\ ~eligible /\ run = "cancelled")
Quiescent == /\ run # "active" /\ agentEnd # "none"
             /\ cancel # "requested" /\ (cancel = "revoked" => confirmed)
             /\ \A c \in Issued : phase[c] = "finished"
             /\ content = produced /\ costs = produced
NoInternalDeadlock == Quiescent \/ ENABLED Next
EventualTermination == <> (run # "active" /\ agentEnd # "none")
EventualReception == \A t \in Tokens : (t \in produced) ~> (t \in content /\ t \in costs)
CancelProgress == (cancel = "revoked") ~> (confirmed /\ agentEnd # "none")
OtherCallsProgress == \A c \in Calls :
  (singleTarget # NoTarget /\ c # singleTarget /\ c \in Issued) ~> (phase[c] = "finished")
=============================================================================

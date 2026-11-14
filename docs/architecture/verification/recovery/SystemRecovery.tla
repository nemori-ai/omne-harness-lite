---------------------------- MODULE SystemRecovery ----------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS Budget, MaxCrashes, MaxInputs, MaxRuns, MaxModelCalls, MaxToolCalls, CrashKinds,
          AskOnTakeover, NoticeCalleeGone, FailureCompletes, DropTakenOnFail,
          BudgetInMemory, RerunStarted

ASSUME CrashKinds \subseteq {"all", "agent", "session", "model", "tool"}

MIds == 1..MaxModelCalls
TIds == 1..MaxToolCalls
Inputs == 1..MaxInputs
Terminal == {"done", "failed", "cancelled"}
ModelOutcomes == {"ok", "toolreq", "temp", "perm"}

VARIABLES
  runStatus, runCount, mcall, tcall, next, stepTries, stepIssued, lastMain, inputs, nudge,
  started, effects,
  crashes,
  agentLive, waitM, waitT, modelLive, modelHeld, toolLive, toolHeld, toolRan, memTries

sessionLog == <<runStatus, runCount, mcall, tcall, next, stepTries, stepIssued, lastMain, inputs, nudge>>
world == <<started, effects>>
callerLive == <<agentLive, waitM, waitT, memTries>>
modelRuntime == <<modelLive, modelHeld>>
toolRuntime == <<toolLive, toolHeld, toolRan>>
vars == <<sessionLog, world, crashes, callerLive, modelRuntime, toolRuntime>>

OpenM == {c \in MIds : mcall[c] = "open"}
OpenT == {t \in TIds : tcall[t] = "open"}
NoOpenCall == OpenM = {} /\ OpenT = {}
HoldsM(c) == c \in modelLive \/ modelHeld[c] # "none"
HoldsT(t) == t \in toolLive \/ t \in toolHeld

TypeOK ==
  /\ runStatus \in {"none", "open"} \cup Terminal
  /\ runCount \in 0..MaxRuns
  /\ mcall \in [MIds -> {"absent", "open", "ok", "toolreq", "temp", "perm", "lost", "void"}]
  /\ tcall \in [TIds -> {"absent", "open", "ok", "interrupted", "void"}]
  /\ next \in {"model", "tool", "finish", "fail", "wait"}
  /\ stepTries \in 0..MaxModelCalls
  /\ stepIssued \in 0..MaxModelCalls
  /\ lastMain \in {"none", "ok", "toolreq", "fail"}
  /\ inputs \in [Inputs -> {"absent", "pending", "taken", "answered", "unprocessed", "settled"}]
  /\ nudge \in BOOLEAN
  /\ started \subseteq TIds
  /\ effects \in [TIds -> 0..2]
  /\ crashes \in 0..MaxCrashes
  /\ agentLive \in BOOLEAN
  /\ waitM \subseteq MIds /\ waitT \subseteq TIds
  /\ modelLive \subseteq MIds
  /\ modelHeld \in [MIds -> {"none"} \cup ModelOutcomes]
  /\ toolLive \subseteq TIds /\ toolHeld \subseteq TIds /\ toolRan \subseteq TIds
  /\ memTries \in 0..MaxModelCalls

Init ==
  /\ runStatus = "none" /\ runCount = 0
  /\ mcall = [c \in MIds |-> "absent"] /\ tcall = [t \in TIds |-> "absent"]
  /\ next = "model" /\ stepTries = 0 /\ stepIssued = 0 /\ lastMain = "none"
  /\ inputs = [i \in Inputs |-> "absent"] /\ nudge = FALSE
  /\ started = {} /\ effects = [t \in TIds |-> 0]
  /\ crashes = 0
  /\ agentLive = FALSE /\ waitM = {} /\ waitT = {} /\ memTries = 0
  /\ modelLive = {} /\ modelHeld = [c \in MIds |-> "none"]
  /\ toolLive = {} /\ toolHeld = {} /\ toolRan = {}

CountFailure(inMemoryBase) ==
  /\ stepTries' = stepTries + 1
  /\ memTries' = inMemoryBase + 1
  /\ lastMain' = "fail"
  /\ next' = IF (IF BudgetInMemory THEN inMemoryBase ELSE stepTries) + 1 <= Budget
               THEN "model" ELSE "fail"

AcceptInput(i) ==
  /\ inputs[i] = "absent"
  /\ inputs' = [inputs EXCEPT ![i] = "pending"]
  /\ nudge' = (nudge \/ runStatus = "failed")
  /\ UNCHANGED <<runStatus, runCount, mcall, tcall, next, stepTries, stepIssued, lastMain>>
  /\ UNCHANGED <<world, crashes, callerLive, modelRuntime, toolRuntime>>

Retry ==
  /\ runStatus = "failed" /\ ~nudge
  /\ \E i \in Inputs : inputs[i] \in {"pending", "unprocessed"}
  /\ nudge' = TRUE
  /\ UNCHANGED <<runStatus, runCount, mcall, tcall, next, stepTries, stepIssued, lastMain, inputs>>
  /\ UNCHANGED <<world, crashes, callerLive, modelRuntime, toolRuntime>>

Cancel ==
  /\ runStatus = "open"
  /\ runStatus' = "cancelled"
  /\ mcall' = [c \in MIds |-> IF mcall[c] = "open" THEN "void" ELSE mcall[c]]
  /\ tcall' = [t \in TIds |-> IF tcall[t] = "open" THEN "void" ELSE tcall[t]]
  /\ inputs' = [i \in Inputs |-> IF inputs[i] = "taken" THEN "settled" ELSE inputs[i]]
  /\ agentLive' = FALSE /\ waitM' = {} /\ waitT' = {} /\ memTries' = 0
  /\ UNCHANGED <<runCount, next, stepTries, stepIssued, lastMain, nudge>>
  /\ UNCHANGED <<world, crashes, modelRuntime, toolRuntime>>

OpenRun ==
  /\ runStatus \in {"none", "done", "cancelled"} \/ (runStatus = "failed" /\ nudge)
  /\ \E i \in Inputs : inputs[i] \in {"pending", "unprocessed"}
  /\ runCount < MaxRuns
  /\ runStatus' = "open" /\ runCount' = runCount + 1
  /\ mcall' = [c \in MIds |-> "absent"] /\ tcall' = [t \in TIds |-> "absent"]
  /\ next' = "model" /\ stepTries' = 0 /\ stepIssued' = 0 /\ lastMain' = "none"
  /\ inputs' = [i \in Inputs |-> IF inputs[i] = "unprocessed" THEN "pending" ELSE inputs[i]]
  /\ nudge' = FALSE
  /\ started' = {} /\ effects' = [t \in TIds |-> 0]
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {} /\ memTries' = 0
  /\ modelLive' = {} /\ modelHeld' = [c \in MIds |-> "none"]
  /\ toolLive' = {} /\ toolHeld' = {} /\ toolRan' = {}
  /\ UNCHANGED crashes

TakeoverBlind ==
  /\ ~AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive
  /\ agentLive' = TRUE /\ waitM' = OpenM /\ waitT' = OpenT /\ memTries' = 0
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolRuntime>>

TakeoverIdle ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ NoOpenCall
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {} /\ memTries' = 0
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolRuntime>>

TakeoverModelStillHeld(c) ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ c \in OpenM /\ HoldsM(c)
  /\ agentLive' = TRUE /\ waitM' = {c} /\ waitT' = {} /\ memTries' = 0
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolRuntime>>

TakeoverModelLost(c) ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ c \in OpenM /\ ~HoldsM(c)
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {}
  /\ mcall' = [mcall EXCEPT ![c] = "lost"]
  /\ CountFailure(0)
  /\ UNCHANGED <<runStatus, runCount, tcall, stepIssued, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, modelRuntime, toolRuntime>>

TakeoverToolStillHeld(t) ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ t \in OpenT /\ HoldsT(t)
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {t} /\ memTries' = 0
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolRuntime>>

TakeoverToolResubmit(t) ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ t \in OpenT /\ ~HoldsT(t)
  /\ t \notin started \/ RerunStarted
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {t} /\ memTries' = 0
  /\ toolLive' = toolLive \cup {t} /\ toolRan' = toolRan \ {t}
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolHeld>>

TakeoverToolInterrupted(t) ==
  /\ AskOnTakeover /\ ~RerunStarted
  /\ runStatus = "open" /\ ~agentLive /\ t \in OpenT /\ ~HoldsT(t) /\ t \in started
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {} /\ memTries' = 0
  /\ tcall' = [tcall EXCEPT ![t] = "interrupted"]
  /\ next' = "model" /\ stepTries' = 0 /\ stepIssued' = 0
  /\ UNCHANGED <<runStatus, runCount, mcall, lastMain, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, modelRuntime, toolRuntime>>

Takeover ==
  \/ TakeoverBlind
  \/ TakeoverIdle
  \/ \E c \in MIds : TakeoverModelStillHeld(c) \/ TakeoverModelLost(c)
  \/ \E t \in TIds : TakeoverToolStillHeld(t) \/ TakeoverToolResubmit(t) \/ TakeoverToolInterrupted(t)

ModelGone(c) ==
  /\ NoticeCalleeGone
  /\ agentLive /\ c \in waitM /\ mcall[c] = "open" /\ ~HoldsM(c)
  /\ waitM' = {}
  /\ mcall' = [mcall EXCEPT ![c] = "lost"]
  /\ CountFailure(memTries)
  /\ UNCHANGED <<runStatus, runCount, tcall, stepIssued, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, modelRuntime, toolRuntime>>

ToolGoneResubmit(t) ==
  /\ NoticeCalleeGone
  /\ agentLive /\ t \in waitT /\ tcall[t] = "open" /\ ~HoldsT(t)
  /\ t \notin started \/ RerunStarted
  /\ toolLive' = toolLive \cup {t} /\ toolRan' = toolRan \ {t}
  /\ UNCHANGED <<sessionLog, world, crashes, callerLive, modelRuntime, toolHeld>>

ToolGoneInterrupted(t) ==
  /\ NoticeCalleeGone /\ ~RerunStarted
  /\ agentLive /\ t \in waitT /\ tcall[t] = "open" /\ ~HoldsT(t) /\ t \in started
  /\ waitT' = {}
  /\ tcall' = [tcall EXCEPT ![t] = "interrupted"]
  /\ next' = "model" /\ stepTries' = 0 /\ stepIssued' = 0
  /\ UNCHANGED <<runStatus, runCount, mcall, lastMain, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitM, memTries, modelRuntime, toolRuntime>>

CalleeGone ==
  \/ \E c \in MIds : ModelGone(c)
  \/ \E t \in TIds : ToolGoneResubmit(t) \/ ToolGoneInterrupted(t)

IssueModel(c) ==
  /\ agentLive /\ runStatus = "open" /\ next = "model" /\ NoOpenCall
  /\ mcall[c] = "absent"
  /\ \A d \in MIds : d < c => mcall[d] # "absent"
  /\ mcall' = [mcall EXCEPT ![c] = "open"]
  /\ next' = "wait" /\ stepIssued' = stepIssued + 1
  /\ inputs' = [i \in Inputs |-> IF inputs[i] = "pending" THEN "taken" ELSE inputs[i]]
  /\ modelLive' = modelLive \cup {c} /\ waitM' = {c}
  /\ UNCHANGED <<runStatus, runCount, tcall, stepTries, lastMain, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, memTries, modelHeld, toolRuntime>>

ModelFinish(c, outcome) ==
  /\ c \in modelLive
  /\ outcome = "toolreq" => \E t \in TIds : tcall[t] = "absent"
  /\ modelLive' = modelLive \ {c}
  /\ modelHeld' = [modelHeld EXCEPT ![c] = outcome]
  /\ UNCHANGED <<sessionLog, world, crashes, callerLive, toolRuntime>>

AnswerTaken == [i \in Inputs |-> IF inputs[i] = "taken" THEN "answered" ELSE inputs[i]]

CollectModelOk(c) ==
  /\ agentLive /\ c \in waitM /\ mcall[c] = "open" /\ modelHeld[c] = "ok"
  /\ mcall' = [mcall EXCEPT ![c] = "ok"]
  /\ lastMain' = "ok" /\ next' = "finish" /\ stepTries' = 0
  /\ inputs' = AnswerTaken
  /\ modelHeld' = [modelHeld EXCEPT ![c] = "none"] /\ waitM' = {}
  /\ UNCHANGED <<runStatus, runCount, tcall, stepIssued, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, memTries, modelLive, toolRuntime>>

CollectModelToolRequest(c) ==
  /\ agentLive /\ c \in waitM /\ mcall[c] = "open" /\ modelHeld[c] = "toolreq"
  /\ mcall' = [mcall EXCEPT ![c] = "toolreq"]
  /\ lastMain' = "toolreq" /\ next' = "tool" /\ stepTries' = 0
  /\ inputs' = AnswerTaken
  /\ modelHeld' = [modelHeld EXCEPT ![c] = "none"] /\ waitM' = {}
  /\ UNCHANGED <<runStatus, runCount, tcall, stepIssued, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, memTries, modelLive, toolRuntime>>

CollectModelTransient(c) ==
  /\ agentLive /\ c \in waitM /\ mcall[c] = "open" /\ modelHeld[c] = "temp"
  /\ mcall' = [mcall EXCEPT ![c] = "temp"]
  /\ modelHeld' = [modelHeld EXCEPT ![c] = "none"] /\ waitM' = {}
  /\ IF FailureCompletes
       THEN /\ lastMain' = "fail" /\ next' = "finish"
            /\ UNCHANGED <<stepTries, memTries>>
       ELSE CountFailure(memTries)
  /\ UNCHANGED <<runStatus, runCount, tcall, stepIssued, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, modelLive, toolRuntime>>

CollectModelPermanent(c) ==
  /\ agentLive /\ c \in waitM /\ mcall[c] = "open" /\ modelHeld[c] = "perm"
  /\ mcall' = [mcall EXCEPT ![c] = "perm"]
  /\ lastMain' = "fail" /\ next' = "fail"
  /\ modelHeld' = [modelHeld EXCEPT ![c] = "none"] /\ waitM' = {}
  /\ UNCHANGED <<runStatus, runCount, tcall, stepTries, stepIssued, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, memTries, modelLive, toolRuntime>>

CollectModel ==
  \E c \in MIds :
    \/ CollectModelOk(c) \/ CollectModelToolRequest(c)
    \/ CollectModelTransient(c) \/ CollectModelPermanent(c)

IssueTool(t) ==
  /\ agentLive /\ runStatus = "open" /\ next = "tool" /\ NoOpenCall
  /\ tcall[t] = "absent"
  /\ \A u \in TIds : u < t => tcall[u] # "absent"
  /\ tcall' = [tcall EXCEPT ![t] = "open"]
  /\ next' = "wait"
  /\ toolLive' = toolLive \cup {t} /\ waitT' = {t}
  /\ UNCHANGED <<runStatus, runCount, mcall, stepTries, stepIssued, lastMain, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitM, memTries, modelRuntime, toolHeld, toolRan>>

ToolStart(t) ==
  /\ t \in toolLive /\ t \notin started
  /\ started' = started \cup {t}
  /\ UNCHANGED <<sessionLog, effects, crashes, callerLive, modelRuntime, toolRuntime>>

ToolEffect(t) ==
  /\ t \in toolLive /\ t \in started /\ t \notin toolRan
  /\ effects[t] < 2
  /\ effects' = [effects EXCEPT ![t] = effects[t] + 1]
  /\ toolRan' = toolRan \cup {t}
  /\ UNCHANGED <<sessionLog, started, crashes, callerLive, modelRuntime, toolLive, toolHeld>>

ToolFinish(t) ==
  /\ t \in toolLive /\ t \in toolRan
  /\ toolLive' = toolLive \ {t} /\ toolHeld' = toolHeld \cup {t}
  /\ UNCHANGED <<sessionLog, world, crashes, callerLive, modelRuntime, toolRan>>

CollectTool(t) ==
  /\ agentLive /\ t \in waitT /\ tcall[t] = "open" /\ t \in toolHeld
  /\ tcall' = [tcall EXCEPT ![t] = "ok"]
  /\ next' = "model" /\ stepTries' = 0 /\ stepIssued' = 0
  /\ toolHeld' = toolHeld \ {t} /\ waitT' = {}
  /\ UNCHANGED <<runStatus, runCount, mcall, lastMain, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitM, memTries, modelRuntime, toolLive, toolRan>>

Finish ==
  /\ agentLive /\ runStatus = "open" /\ next = "finish" /\ NoOpenCall
  /\ runStatus' = "done"
  /\ agentLive' = FALSE /\ waitM' = {} /\ waitT' = {} /\ memTries' = 0
  /\ UNCHANGED <<runCount, mcall, tcall, next, stepTries, stepIssued, lastMain, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, modelRuntime, toolRuntime>>

FailRun ==
  /\ agentLive /\ runStatus = "open" /\ next = "fail" /\ NoOpenCall
  /\ runStatus' = "failed"
  /\ inputs' = IF DropTakenOnFail THEN inputs
               ELSE [i \in Inputs |-> IF inputs[i] = "taken" THEN "unprocessed" ELSE inputs[i]]
  /\ agentLive' = FALSE /\ waitM' = {} /\ waitT' = {} /\ memTries' = 0
  /\ UNCHANGED <<runCount, mcall, tcall, next, stepTries, stepIssued, lastMain, nudge>>
  /\ UNCHANGED <<world, crashes, modelRuntime, toolRuntime>>

LoseCaller ==
  /\ agentLive' = FALSE /\ waitM' = {} /\ waitT' = {} /\ memTries' = 0

LoseModel ==
  /\ modelLive' = {} /\ modelHeld' = [c \in MIds |-> "none"]

LoseTool ==
  /\ toolLive' = {} /\ toolHeld' = {} /\ toolRan' = {}

CrashAll ==
  /\ "all" \in CrashKinds
  /\ crashes < MaxCrashes /\ crashes' = crashes + 1
  /\ LoseCaller /\ LoseModel /\ LoseTool
  /\ UNCHANGED <<sessionLog, world>>

CrashAgent ==
  /\ "agent" \in CrashKinds
  /\ crashes < MaxCrashes /\ crashes' = crashes + 1
  /\ LoseCaller
  /\ UNCHANGED <<sessionLog, world, modelRuntime, toolRuntime>>

CrashSession ==
  /\ "session" \in CrashKinds
  /\ crashes < MaxCrashes /\ crashes' = crashes + 1
  /\ LoseCaller
  /\ UNCHANGED <<sessionLog, world, modelRuntime, toolRuntime>>

CrashModel ==
  /\ "model" \in CrashKinds
  /\ crashes < MaxCrashes /\ crashes' = crashes + 1
  /\ LoseModel
  /\ UNCHANGED <<sessionLog, world, callerLive, toolRuntime>>

CrashTool ==
  /\ "tool" \in CrashKinds
  /\ crashes < MaxCrashes /\ crashes' = crashes + 1
  /\ LoseTool
  /\ UNCHANGED <<sessionLog, world, callerLive, modelRuntime>>

Crash == CrashAll \/ CrashAgent \/ CrashSession \/ CrashModel \/ CrashTool

Human == (\E i \in Inputs : AcceptInput(i)) \/ Retry \/ Cancel

System ==
  \/ OpenRun \/ Takeover \/ CalleeGone
  \/ (\E c \in MIds : IssueModel(c))
  \/ (\E c \in MIds, o \in ModelOutcomes : ModelFinish(c, o))
  \/ CollectModel
  \/ (\E t \in TIds : IssueTool(t) \/ ToolStart(t) \/ ToolEffect(t) \/ ToolFinish(t) \/ CollectTool(t))
  \/ Finish \/ FailRun

Next == Human \/ System \/ Crash

Spec == Init /\ [][Next]_vars /\ WF_vars(System)

AttemptOnlyOnOpenRun == agentLive => runStatus = "open"
ToolEffectAtMostOnce == \A t \in TIds : effects[t] <= 1
LostMeansNobodyHolds ==
  /\ \A c \in MIds : mcall[c] = "lost" => ~HoldsM(c)
  /\ \A t \in TIds : tcall[t] = "interrupted" => ~HoldsT(t)
DoneIsHonest == runStatus = "done" => lastMain = "ok"
RetryBudgetHolds == stepIssued <= Budget + 1
TerminalClosesCalls == runStatus \in Terminal => NoOpenCall
TerminalSettlesInputs == runStatus \in Terminal => \A i \in Inputs : inputs[i] # "taken"

NoAutoReopenAfterFailure == [][(runStatus = "failed" /\ runStatus' = "open") => nudge]_vars

RunEnds == (runStatus = "open") ~> (runStatus \in Terminal)
TakenInputResolves ==
  \A i \in Inputs : (inputs[i] = "taken") ~> (inputs[i] \in {"answered", "unprocessed", "settled"})

=============================================================================

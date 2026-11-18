---------------------------- MODULE SystemRecovery ----------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS StepCap, MaxCrashes, MaxInputs, MaxRuns, MaxModelCalls, MaxToolCalls, CrashKinds,
          AskOnTakeover, NoticeCalleeGone, FailureCompletes, DropTakenOnFail,
          CapInMemory, RerunStarted

ASSUME CrashKinds \subseteq {"all", "agent", "session", "model", "tool"}

MIds == 1..MaxModelCalls
TIds == 1..MaxToolCalls
Inputs == 1..MaxInputs
Terminal == {"done", "failed", "cancelled"}
ModelOutcomes == {"ok", "toolreq", "temp", "perm"}

VARIABLES
  runStatus, runCount, mcall, tcall, next, issued, lastMain, inputs, nudge,
  started, effects,
  crashes,
  agentLive, waitM, waitT, modelLive, modelHeld, toolLive, toolHeld, toolRan, memIssued

sessionLog == <<runStatus, runCount, mcall, tcall, next, issued, lastMain, inputs, nudge>>
world == <<started, effects>>
callerLive == <<agentLive, waitM, waitT, memIssued>>
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
  /\ issued \in 0..MaxModelCalls
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
  /\ memIssued \in 0..MaxModelCalls

Init ==
  /\ runStatus = "none" /\ runCount = 0
  /\ mcall = [c \in MIds |-> "absent"] /\ tcall = [t \in TIds |-> "absent"]
  /\ next = "model" /\ issued = 0 /\ lastMain = "none"
  /\ inputs = [i \in Inputs |-> "absent"] /\ nudge = FALSE
  /\ started = {} /\ effects = [t \in TIds |-> 0]
  /\ crashes = 0
  /\ agentLive = FALSE /\ waitM = {} /\ waitT = {} /\ memIssued = 0
  /\ modelLive = {} /\ modelHeld = [c \in MIds |-> "none"]
  /\ toolLive = {} /\ toolHeld = {} /\ toolRan = {}

(* The caller counts the main model requests of a Run in its log. A Run issues at most
   StepCap of them. The callee bounds the dispatches of one call itself; the caller does not
   retry a call that ended. A call that nobody holds is void, and the caller issues the
   request of that step again under a new identity: that is takeover, and it counts. *)
Count == IF CapInMemory THEN memIssued ELSE issued

AcceptInput(i) ==
  /\ inputs[i] = "absent"
  /\ inputs' = [inputs EXCEPT ![i] = "pending"]
  /\ nudge' = (nudge \/ runStatus = "failed")
  /\ UNCHANGED <<runStatus, runCount, mcall, tcall, next, issued, lastMain>>
  /\ UNCHANGED <<world, crashes, callerLive, modelRuntime, toolRuntime>>

Retry ==
  /\ runStatus = "failed" /\ ~nudge
  /\ \E i \in Inputs : inputs[i] \in {"pending", "unprocessed"}
  /\ nudge' = TRUE
  /\ UNCHANGED <<runStatus, runCount, mcall, tcall, next, issued, lastMain, inputs>>
  /\ UNCHANGED <<world, crashes, callerLive, modelRuntime, toolRuntime>>

Cancel ==
  /\ runStatus = "open"
  /\ runStatus' = "cancelled"
  /\ mcall' = [c \in MIds |-> IF mcall[c] = "open" THEN "void" ELSE mcall[c]]
  /\ tcall' = [t \in TIds |-> IF tcall[t] = "open" THEN "void" ELSE tcall[t]]
  /\ inputs' = [i \in Inputs |-> IF inputs[i] = "taken" THEN "settled" ELSE inputs[i]]
  /\ agentLive' = FALSE /\ waitM' = {} /\ waitT' = {} /\ memIssued' = 0
  /\ UNCHANGED <<runCount, next, issued, lastMain, nudge>>
  /\ UNCHANGED <<world, crashes, modelRuntime, toolRuntime>>

OpenRun ==
  /\ runStatus \in {"none", "done", "cancelled"} \/ (runStatus = "failed" /\ nudge)
  /\ \E i \in Inputs : inputs[i] \in {"pending", "unprocessed"}
  /\ runCount < MaxRuns
  /\ runStatus' = "open" /\ runCount' = runCount + 1
  /\ mcall' = [c \in MIds |-> "absent"] /\ tcall' = [t \in TIds |-> "absent"]
  /\ next' = "model" /\ issued' = 0 /\ lastMain' = "none"
  /\ inputs' = [i \in Inputs |-> IF inputs[i] = "unprocessed" THEN "pending" ELSE inputs[i]]
  /\ nudge' = FALSE
  /\ started' = {} /\ effects' = [t \in TIds |-> 0]
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {} /\ memIssued' = 0
  /\ modelLive' = {} /\ modelHeld' = [c \in MIds |-> "none"]
  /\ toolLive' = {} /\ toolHeld' = {} /\ toolRan' = {}
  /\ UNCHANGED crashes

TakeoverBlind ==
  /\ ~AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive
  /\ agentLive' = TRUE /\ waitM' = OpenM /\ waitT' = OpenT /\ memIssued' = 0
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolRuntime>>

TakeoverIdle ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ NoOpenCall
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {} /\ memIssued' = 0
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolRuntime>>

TakeoverModelStillHeld(c) ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ c \in OpenM /\ HoldsM(c)
  /\ agentLive' = TRUE /\ waitM' = {c} /\ waitT' = {} /\ memIssued' = 0
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolRuntime>>

TakeoverModelLost(c) ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ c \in OpenM /\ ~HoldsM(c)
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {} /\ memIssued' = 0
  /\ mcall' = [mcall EXCEPT ![c] = "lost"]
  /\ lastMain' = "fail" /\ next' = "model"
  /\ UNCHANGED <<runStatus, runCount, tcall, issued, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, modelRuntime, toolRuntime>>

TakeoverToolStillHeld(t) ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ t \in OpenT /\ HoldsT(t)
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {t} /\ memIssued' = 0
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolRuntime>>

TakeoverToolResubmit(t) ==
  /\ AskOnTakeover
  /\ runStatus = "open" /\ ~agentLive /\ t \in OpenT /\ ~HoldsT(t)
  /\ t \notin started \/ RerunStarted
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {t} /\ memIssued' = 0
  /\ toolLive' = toolLive \cup {t} /\ toolRan' = toolRan \ {t}
  /\ UNCHANGED <<sessionLog, world, crashes, modelRuntime, toolHeld>>

TakeoverToolInterrupted(t) ==
  /\ AskOnTakeover /\ ~RerunStarted
  /\ runStatus = "open" /\ ~agentLive /\ t \in OpenT /\ ~HoldsT(t) /\ t \in started
  /\ agentLive' = TRUE /\ waitM' = {} /\ waitT' = {} /\ memIssued' = 0
  /\ tcall' = [tcall EXCEPT ![t] = "interrupted"]
  /\ next' = "model"
  /\ UNCHANGED <<runStatus, runCount, mcall, issued, lastMain, inputs, nudge>>
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
  /\ lastMain' = "fail" /\ next' = "model"
  /\ UNCHANGED <<runStatus, runCount, tcall, issued, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, memIssued, modelRuntime, toolRuntime>>

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
  /\ next' = "model"
  /\ UNCHANGED <<runStatus, runCount, mcall, issued, lastMain, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitM, memIssued, modelRuntime, toolRuntime>>

CalleeGone ==
  \/ \E c \in MIds : ModelGone(c)
  \/ \E t \in TIds : ToolGoneResubmit(t) \/ ToolGoneInterrupted(t)

IssueModel(c) ==
  /\ agentLive /\ runStatus = "open" /\ next = "model" /\ NoOpenCall
  /\ Count < StepCap
  /\ mcall[c] = "absent"
  /\ \A d \in MIds : d < c => mcall[d] # "absent"
  /\ mcall' = [mcall EXCEPT ![c] = "open"]
  /\ next' = "wait" /\ issued' = issued + 1 /\ memIssued' = memIssued + 1
  /\ inputs' = [i \in Inputs |-> IF inputs[i] = "pending" THEN "taken" ELSE inputs[i]]
  /\ modelLive' = modelLive \cup {c} /\ waitM' = {c}
  /\ UNCHANGED <<runStatus, runCount, tcall, lastMain, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, modelHeld, toolRuntime>>

(* The step cap is reached: the Run fails. *)
StepLimit ==
  /\ agentLive /\ runStatus = "open" /\ next = "model" /\ NoOpenCall
  /\ Count >= StepCap
  /\ next' = "fail" /\ lastMain' = "fail"
  /\ UNCHANGED <<runStatus, runCount, mcall, tcall, issued, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, callerLive, modelRuntime, toolRuntime>>

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
  /\ lastMain' = "ok" /\ next' = "finish"
  /\ inputs' = AnswerTaken
  /\ modelHeld' = [modelHeld EXCEPT ![c] = "none"] /\ waitM' = {}
  /\ UNCHANGED <<runStatus, runCount, tcall, issued, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, memIssued, modelLive, toolRuntime>>

CollectModelToolRequest(c) ==
  /\ agentLive /\ c \in waitM /\ mcall[c] = "open" /\ modelHeld[c] = "toolreq"
  /\ mcall' = [mcall EXCEPT ![c] = "toolreq"]
  /\ lastMain' = "toolreq" /\ next' = "tool"
  /\ inputs' = AnswerTaken
  /\ modelHeld' = [modelHeld EXCEPT ![c] = "none"] /\ waitM' = {}
  /\ UNCHANGED <<runStatus, runCount, tcall, issued, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, memIssued, modelLive, toolRuntime>>

CollectModelTransient(c) ==
  /\ agentLive /\ c \in waitM /\ mcall[c] = "open" /\ modelHeld[c] = "temp"
  /\ mcall' = [mcall EXCEPT ![c] = "temp"]
  /\ modelHeld' = [modelHeld EXCEPT ![c] = "none"] /\ waitM' = {}
  /\ lastMain' = "fail" /\ next' = IF FailureCompletes THEN "finish" ELSE "fail"
  /\ UNCHANGED <<runStatus, runCount, tcall, issued, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, memIssued, modelLive, toolRuntime>>

CollectModelPermanent(c) ==
  /\ agentLive /\ c \in waitM /\ mcall[c] = "open" /\ modelHeld[c] = "perm"
  /\ mcall' = [mcall EXCEPT ![c] = "perm"]
  /\ lastMain' = "fail" /\ next' = "fail"
  /\ modelHeld' = [modelHeld EXCEPT ![c] = "none"] /\ waitM' = {}
  /\ UNCHANGED <<runStatus, runCount, tcall, issued, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitT, memIssued, modelLive, toolRuntime>>

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
  /\ UNCHANGED <<runStatus, runCount, mcall, issued, lastMain, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitM, memIssued, modelRuntime, toolHeld, toolRan>>

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
  /\ next' = "model"
  /\ toolHeld' = toolHeld \ {t} /\ waitT' = {}
  /\ UNCHANGED <<runStatus, runCount, mcall, issued, lastMain, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, agentLive, waitM, memIssued, modelRuntime, toolLive, toolRan>>

Finish ==
  /\ agentLive /\ runStatus = "open" /\ next = "finish" /\ NoOpenCall
  /\ runStatus' = "done"
  /\ agentLive' = FALSE /\ waitM' = {} /\ waitT' = {} /\ memIssued' = 0
  /\ UNCHANGED <<runCount, mcall, tcall, next, issued, lastMain, inputs, nudge>>
  /\ UNCHANGED <<world, crashes, modelRuntime, toolRuntime>>

FailRun ==
  /\ agentLive /\ runStatus = "open" /\ next = "fail" /\ NoOpenCall
  /\ runStatus' = "failed"
  /\ inputs' = IF DropTakenOnFail THEN inputs
               ELSE [i \in Inputs |-> IF inputs[i] = "taken" THEN "unprocessed" ELSE inputs[i]]
  /\ agentLive' = FALSE /\ waitM' = {} /\ waitT' = {} /\ memIssued' = 0
  /\ UNCHANGED <<runCount, mcall, tcall, next, issued, lastMain, nudge>>
  /\ UNCHANGED <<world, crashes, modelRuntime, toolRuntime>>

LoseCaller ==
  /\ agentLive' = FALSE /\ waitM' = {} /\ waitT' = {} /\ memIssued' = 0

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
  \/ (\E c \in MIds : IssueModel(c)) \/ StepLimit
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
IssuesBounded == issued <= StepCap
TerminalClosesCalls == runStatus \in Terminal => NoOpenCall
TerminalSettlesInputs == runStatus \in Terminal => \A i \in Inputs : inputs[i] # "taken"

NoAutoReopenAfterFailure == [][(runStatus = "failed" /\ runStatus' = "open") => nudge]_vars

RunEnds == (runStatus = "open") ~> (runStatus \in Terminal)
TakenInputResolves ==
  \A i \in Inputs : (inputs[i] = "taken") ~> (inputs[i] \in {"answered", "unprocessed", "settled"})

=============================================================================

------------------------ MODULE JointHooksRunControl ------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS Case, Mutation
VARIABLE s
vars == <<s>>
Handlers == {1, 2}
Init == s = [queue |-> {}, done |-> {}, started |-> {}, closed |-> {},
  count |-> 0, cap |-> 1, currentCap |-> 1, configValid |-> TRUE,
  run |-> IF Case = "gate" THEN "running" ELSE "completed",
  isolation |-> "unknown", terminalSafe |-> TRUE,
  startSafe |-> TRUE, completion |-> [h \in Handlers |-> 0],
  calls |-> 0, phase |-> "new", gate |-> "allow", currentAuth |-> TRUE,
  approval |-> FALSE, mode |-> "standard", admitted |-> FALSE,
  admissionSafe |-> TRUE, decisionSafe |-> TRUE,
  decision |-> "unset", taken |-> FALSE, audit |-> FALSE,
  arrivalClosed |-> FALSE, stepContext |-> FALSE]

Observe(h) ==
  /\ h \notin s.done
  /\ s' = [s EXCEPT !.done = @ \cup {h}, !.completion[h] = 1,
       !.queue = IF s.count < s.cap THEN @ \cup {h} ELSE @]
Take(h) ==
  /\ h \in s.queue
  /\ (s.run \notin {"running", "stopping"} \/
       (Mutation = "barrier" /\ s.run = "stopping"))
  /\ LET valid == s.configValid /\
          (Mutation = "cap" \/ s.count <
            (IF Mutation = "revision" THEN s.currentCap ELSE s.cap))
     IN s' = [s EXCEPT !.queue = @ \ {h},
       !.started = IF valid THEN @ \cup {h} ELSE @,
       !.closed = IF valid THEN @ ELSE @ \cup {h},
       !.count = IF valid THEN @ + 1 ELSE @,
       !.run = IF valid THEN "running" ELSE @,
       !.startSafe = @ /\ s.run # "stopping"]
Finish == /\ s.run = "running"
          /\ s' = [s EXCEPT !.run = "completed"]
Cancel == /\ s.run = "running"
          /\ s' = [s EXCEPT !.run = "cancelled"]
Force == /\ s.run = "running"
         /\ s' = [s EXCEPT !.run = "stopping"]
Evidence == /\ s.run = "stopping" /\ s.isolation = "unknown"
            /\ s' = [s EXCEPT !.isolation = "verified"]
ForceFinish == /\ s.run = "stopping"
  /\ (s.isolation = "verified" \/ Mutation = "force")
  /\ s' = [s EXCEPT !.run = "cancelled",
        !.terminalSafe = s.isolation = "verified"]
Drift == /\ s.currentCap = 1
         /\ s' = [s EXCEPT !.currentCap = 2]
Invalidate == /\ s.configValid
              /\ s' = [s EXCEPT !.configValid = FALSE]
StopNext == (\E h \in Handlers : Observe(h) \/ Take(h)) \/ Finish \/
            Cancel \/ Force \/ Evidence \/ ForceFinish \/ Drift \/ Invalidate

Prepare(g) == /\ s.phase = "new"
  /\ s' = [s EXCEPT !.gate = g, !.calls = IF g = "deny" THEN 0 ELSE 1,
       !.phase = IF g = "deny" THEN "ready" ELSE "hook"]
Timeout == /\ s.phase = "hook"
           /\ s' = [s EXCEPT !.phase = "ready",
                !.gate = IF Mutation = "loosen" THEN "allow" ELSE @,
                !.admissionSafe = @ /\ (Mutation # "loosen" \/ s.gate # "ask")]
Rerun == /\ Mutation = "rerun" /\ s.phase = "ready" /\ s.calls = 1
         /\ s' = [s EXCEPT !.calls = 2]
Revoke == /\ s.currentAuth
          /\ s' = [s EXCEPT !.currentAuth = FALSE]
Confirm == /\ s.mode = "standard"
           /\ s' = [s EXCEPT !.mode = "confirm"]
Approve == /\ s.phase = "ready" /\ s.gate = "ask" /\ ~s.approval
  /\ (Mutation = "answer" \/ (s.currentAuth /\ s.mode = "standard"))
  /\ s' = [s EXCEPT !.approval = TRUE,
       !.decisionSafe = s.currentAuth /\ s.mode = "standard"]
HumanApprove == /\ s.phase = "ready" /\ s.gate = "ask" /\ ~s.approval
  /\ s.currentAuth
  /\ s' = [s EXCEPT !.approval = TRUE]
Admit == /\ s.phase = "ready"
  /\ (s.gate # "ask" \/ s.approval \/ ~s.currentAuth \/ s.run # "running")
  /\ LET valid == (s.currentAuth \/ Mutation = "revoke") /\
           (s.run = "running" \/ Mutation = "cancel") /\
           (s.mode = "standard" \/ s.approval) /\
           (s.gate = "allow" \/ (s.gate = "ask" /\ s.approval))
     IN s' = [s EXCEPT !.phase = "settled", !.admitted = valid,
       !.admissionSafe = ~valid \/
          (s.currentAuth /\ s.run = "running" /\ s.gate # "deny" /\
           (s.gate # "ask" \/ s.approval))]
GateNext == (\E g \in {"allow", "ask", "deny"} : Prepare(g)) \/
            Timeout \/ Rerun \/ Revoke \/ Confirm \/ Approve \/ HumanApprove \/ Admit \/
            Cancel \/ Force \/ Evidence \/ ForceFinish

Evaluate(d) == /\ s.decision = "unset"
              /\ s' = [s EXCEPT !.decision = d]
CommitInput == /\ s.decision # "unset" /\ ~s.audit
  /\ s' = [s EXCEPT !.audit = TRUE,
       !.arrivalClosed = s.decision = "close",
       !.taken = s.decision = "pass",
       !.stepContext = s.decision = "pass" \/ Mutation = "context"]
CloseNext == (\E d \in {"pass", "close"} : Evaluate(d)) \/ CommitInput
Next == CASE Case = "stop" -> StopNext
          [] Case = "gate" -> GateNext
          [] Case = "close" -> CloseNext
Spec == Init /\ [][Next]_vars
Safety == /\ s.count <= 1 /\ s.count = Cardinality(s.started)
  /\ \A h \in Handlers : s.completion[h] <= 1
  /\ s.terminalSafe /\ s.startSafe /\ s.calls <= 1
  /\ s.admissionSafe /\ s.decisionSafe
  /\ (s.arrivalClosed => s.audit /\ ~s.stepContext /\ ~s.taken)
  /\ (s.stepContext => s.taken /\ s.audit)
ProgressSpec == Spec /\ WF_vars(Next) /\ WF_vars(Evidence)
  /\ WF_vars(ForceFinish) /\ (\A h \in Handlers : WF_vars(Take(h)))
Progress == <>(CASE Case = "stop" -> s.queue = {} /\ s.done = Handlers
              [] Case = "gate" -> s.phase = "settled"
              [] Case = "close" -> s.audit)
=============================================================================

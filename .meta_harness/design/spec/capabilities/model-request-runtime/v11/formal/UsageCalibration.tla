-------------------------- MODULE UsageCalibration --------------------------
EXTENDS Integers, Sequences, FiniteSets, TLC
CONSTANTS MaxCalls, Mode, Bug, ObservationKinds, Window, Reserved, Margin, StableSuccessor
VARIABLE s
vars == <<s>>
RECURSIVE Sum(_)
Sum(xs) == IF Len(xs)=0 THEN 0 ELSE Head(xs)+Sum(Tail(xs))
\* Deliberately non-additive: a terminal boundary alternates with sequence parity.
Count(xs,e,b) == Sum(xs)*b+e+(Len(xs)%2)
Empty == [id |-> 0, branch |-> 0, body |-> <<>>, env |-> 0, basis |-> 0,
          kind |-> "missing", input |-> 0, output |-> <<>>, partial |-> FALSE]
Prefix(xs,ys) == Len(xs)<=Len(ys) /\ xs=SubSeq(ys,1,Len(xs))
Receipt(r) == r.id \in s.receipts
Trust(r) == r.kind="accurate"
Eligible(r) == Receipt(r) /\ Trust(r) /\ r.id \in s.ancestors
  /\ Prefix(r.body,s.body) /\ r.env=s.env /\ r.basis=s.basis
SelectOK(r) == Receipt(r)
  /\ (Trust(r) \/ (Bug="MissingZero" /\ r.kind="missing")
                     \/ (Bug="CacheZero" /\ r.kind="cache"))
  /\ (r.id \in s.ancestors \/ Bug="LatestBranch")
  /\ ((Prefix(r.body,s.body) /\ r.env=s.env) \/ Bug="IgnorePrefix" \/ Bug="LatestBranch")
  /\ (r.basis=s.basis \/ Bug="IgnoreBasis")
Candidates == {s.log[i]: i \in {j \in 1..Len(s.log): SelectOK(s.log[j])}}
Anchor == IF Candidates={} THEN Empty ELSE
  CHOOSE r \in Candidates: \A q \in Candidates:
    IF Bug="KeepOldAnchor" THEN r.id<=q.id ELSE r.id>=q.id
CorrectCandidates == {s.log[i]: i \in {j \in 1..Len(s.log): Eligible(s.log[j])}}
ExactReplay(r) == Count(r.body\o r.output,r.env,r.basis)-r.input
ExactNew(r) == Count(s.body,s.env,s.basis)-Count(r.body\o r.output,r.env,r.basis)
Estimate(x) == IF Mode="Estimated" THEN x-1 ELSE IF Mode="UpperBound" THEN x+1 ELSE x
CurrentActual == Count(s.body,s.env,s.basis)
MakePlan(r) ==
 LET marginal == r.id#0
     replay == IF marginal THEN Estimate(ExactReplay(r)) ELSE 0
     fresh == IF marginal THEN Estimate(ExactNew(r)) ELSE Estimate(CurrentActual)
     predicted == (IF marginal THEN r.input ELSE 0)+replay+fresh+
                  (IF marginal /\ Bug="DoubleOutput" THEN Sum(r.output) ELSE 0)
     admission == predicted+(IF Mode="Estimated" THEN Margin ELSE 0)
 IN [body |-> s.body, env |-> s.env, basis |-> s.basis, branch |-> s.branch,
     anchor |-> r, marginal |-> marginal, replay |-> replay, fresh |-> fresh,
     predicted |-> predicted, admission |-> admission,
     precision |-> IF Bug="EstimateExact" THEN "ExactOrBound" ELSE Mode,
     admitted |-> admission+Reserved<=Window, installed |-> s.installed]
MakeInitialPlan == [body |-> <<>>,env |-> 0,basis |-> 0,branch |-> 0,
 anchor |-> Empty,marginal |-> FALSE,replay |-> 0,fresh |-> 0,predicted |-> 0,
 admission |-> 0,precision |-> Mode,admitted |-> FALSE,installed |-> 1]
Init == s=[phase |-> "edit", call |-> 1, body |-> <<1>>, env |-> 3, basis |-> 1,
 branch |-> 1, ancestors |-> {}, log |-> <<>>, beforeLog |-> <<>>, receipts |-> {},
 replyLog |-> <<>>, beforeReplyLog |-> <<>>,
 original |-> [i \in 1..MaxCalls |-> Empty], pending |-> Empty, received |-> Empty,
 published |-> {}, plan |-> MakeInitialPlan, sent |-> Empty, sends |-> 0,
 changed |-> FALSE, appended |-> FALSE, forked |-> FALSE, late |-> FALSE,
 installed |-> 1, leased |-> TRUE, released |-> FALSE, lost |-> FALSE]
AppendNewInput == /\ s.phase="edit" /\ ~s.appended
 /\ \E n \in {1,2}: s'=[s EXCEPT !.body=Append(@,n),!.appended=TRUE]
ChangeOldPrefix == /\ ~StableSuccessor /\ s.phase="edit" /\ ~s.changed /\ s.call>1
 /\ (s'=[s EXCEPT !.env=4,!.changed=TRUE]
      \/ s'=[s EXCEPT !.body=IF Len(@)>0 THEN Tail(@) ELSE @,!.changed=TRUE])
ChangeBasis == /\ ~StableSuccessor /\ s.phase="edit" /\ ~s.changed /\ s.call>1
 /\ s'=[s EXCEPT !.basis=2,!.installed=2,!.changed=TRUE]
ForkBranch == /\ s.phase="edit" /\ s.call>1 /\ ~s.forked
 /\ s'=[s EXCEPT !.branch=2,!.forked=TRUE]
\* A concurrent, already completed request on a sibling branch arrives late.
\* Its commit is genuine; it is not in this selected branch's ancestor set.
LateResponse == /\ s.phase="edit" /\ s.call>1 /\ ~s.late
 /\ LET r==[Empty EXCEPT !.id=MaxCalls+1,!.branch=3-s.branch,
               !.body= <<2,2>>,!.env=3,!.basis=1,!.kind="accurate",
               !.input=Count(<<2,2>>,3,1),!.output= <<1>>]
    IN s'=[s EXCEPT !.beforeLog=s.log,!.log=Append(@,r),
          !.beforeReplyLog=s.replyLog,!.replyLog=Append(@,[id |-> r.id,output |-> r.output]),
          !.receipts=@\cup{r.id},!.late=TRUE]
PlanFull == /\ s.phase="edit" /\ (Candidates={} \/ Bug="NeverUseAnchor")
 /\ s'=[s EXCEPT !.plan=MakePlan(Empty),!.phase="planned"]
PlanMarginal == /\ s.phase="edit" /\ Candidates#{} /\ Bug#"NeverUseAnchor"
 /\ s'=[s EXCEPT !.plan=MakePlan(Anchor),!.phase="planned"]
UnloadOrReplaceBinding == /\ s.phase="planned" /\ s.installed=s.plan.installed
 /\ s'=[s EXCEPT !.installed=3,!.released=IF Bug="ReleaseLease" THEN TRUE ELSE @]
ChangeAfterPlan == /\ Bug="StalePlan" /\ s.phase="planned" /\ ~s.changed
 /\ s'=[s EXCEPT !.body=Append(@,2),!.changed=TRUE]
Dispatch == /\ s.phase="planned" /\ s.plan.admitted /\ ~s.released
 /\ s'=[s EXCEPT !.phase="sent",!.sends=@+1,
      !.sent=[Empty EXCEPT !.id=s.call,!.branch=s.branch,!.body=s.body,
              !.env=s.env,!.basis=s.basis]]
Reject == /\ s.phase="planned" /\ ~s.plan.admitted
 /\ s'=[s EXCEPT !.phase="done",!.released=TRUE,!.leased=FALSE]
Receive(k,partial) == /\ s.phase="sent" /\ k \in ObservationKinds
 /\ s'=[s EXCEPT !.phase="received",
     !.received=[s.sent EXCEPT !.kind=k,
       !.input=IF k="accurate" THEN Count(s.sent.body,s.sent.env,s.sent.basis) ELSE 0,
       !.output=IF partial THEN <<>> ELSE <<1>>,!.partial=partial]]
ReceiveAccurateUsage == Receive("accurate",FALSE)
ReceiveMissingOrPartialUsage == Receive("missing",FALSE)
ReceiveResponseCache == Receive("cache",FALSE)
ReceiveOutputPartial == Receive("accurate",TRUE)
StageOriginalBatch == /\ s.phase="received"
 /\ s'=[s EXCEPT !.pending=s.received,!.original[s.call]=s.received,
      !.phase="staged",!.published=IF Bug="PublishEarly" THEN @\cup{s.call} ELSE @]
CommitOriginalBatch == /\ s.phase="staged"
 /\ s'=[s EXCEPT !.beforeLog=s.log,!.log=Append(@,s.pending),
      !.beforeReplyLog=s.replyLog,
      !.replyLog=IF Bug="PartialBatch" THEN @ ELSE Append(@,[id |-> s.call,output |-> s.pending.output]),
      !.receipts=@\cup{s.call},!.published=@\cup{s.call},!.phase="committed"]
LoseReceipt == /\ s.phase="staged"
 /\ \E committed \in BOOLEAN:
       s'=[s EXCEPT !.beforeLog=s.log,
          !.log=IF committed THEN Append(@,s.pending) ELSE @,
          !.beforeReplyLog=s.replyLog,
          !.replyLog=IF committed THEN Append(@,[id |-> s.call,output |-> s.pending.output]) ELSE @,
          !.phase="unknown",!.lost=TRUE]
RecoverSameBatch == /\ s.phase="unknown"
 /\ LET replacement==IF Bug="RecomputeRecovery"
          THEN [s.pending EXCEPT !.input=@+1] ELSE s.pending
        present==\E i \in 1..Len(s.log): s.log[i].id=s.call
    IN s'=[s EXCEPT !.beforeLog=s.log,
        !.log=IF present THEN (IF Bug="RewriteHistory" THEN [@ EXCEPT ![1].input=@+1] ELSE @) ELSE Append(@,replacement),
        !.beforeReplyLog=s.replyLog,
        !.replyLog=IF present THEN @ ELSE Append(@,[id |-> s.call,output |-> replacement.output]),
        !.pending=replacement,!.receipts=@\cup{s.call},
        !.published=@\cup{s.call},!.phase="committed"]
NextAttempt == /\ s.phase="committed" /\ s.call<MaxCalls
 /\ s'=[s EXCEPT !.phase="edit",!.call=@+1,
       !.body=@\o s.received.output,!.ancestors=@\cup{s.call},
       !.changed=FALSE,!.appended=FALSE,!.pending=Empty,!.received=Empty,
       !.sent=Empty,!.plan=MakeInitialPlan,!.leased=TRUE,!.released=FALSE,
       !.installed=s.basis,!.lost=FALSE]
\* Retry is a new dispatch identity; a missing observation never resets its input to zero.
RetryAsNewAttempt == NextAttempt /\ s.received.kind#"accurate"
Finish == /\ s.phase="committed" /\ s.call=MaxCalls
 /\ s'=[s EXCEPT !.phase="done",!.leased=FALSE,!.released=TRUE]
Next == AppendNewInput \/ ChangeOldPrefix \/ ChangeBasis \/ ForkBranch \/ LateResponse
 \/ PlanFull \/ PlanMarginal \/ UnloadOrReplaceBinding \/ ChangeAfterPlan
 \/ Dispatch \/ Reject \/ ReceiveAccurateUsage \/ ReceiveMissingOrPartialUsage
 \/ ReceiveResponseCache \/ ReceiveOutputPartial \/ StageOriginalBatch
 \/ CommitOriginalBatch \/ LoseReceipt \/ RecoverSameBatch \/ NextAttempt \/ Finish
Spec == Init /\ [][Next]_vars
TypeOK == s.phase \in {"edit","planned","sent","received","staged","unknown","committed","done"}
 /\ s.call \in 1..MaxCalls /\ s.basis \in {1,2} /\ s.branch \in {1,2}
 /\ s.sends<=s.call /\ s.receipts \subseteq 1..(MaxCalls+1)
PlanActive == s.phase \in {"planned","sent","received","staged","unknown","committed"}
AnchorSource == PlanActive /\ s.plan.marginal =>
 s.plan.anchor.kind="accurate" /\ s.plan.anchor.id \in s.ancestors
 /\ s.plan.anchor.id \in s.receipts
PrefixGuard == PlanActive /\ s.plan.marginal =>
 Prefix(s.plan.anchor.body,s.plan.body) /\ s.plan.anchor.env=s.plan.env
BasisGuard == PlanActive /\ s.plan.marginal => s.plan.anchor.basis=s.plan.basis
NoDoubleOutput == PlanActive =>
 s.plan.predicted=(IF s.plan.marginal THEN s.plan.anchor.input ELSE 0)+s.plan.replay+s.plan.fresh
ErrorReset == PlanActive =>
 s.plan.predicted-Count(s.plan.body,s.plan.env,s.plan.basis)=
   (IF Mode="Estimated" THEN (IF s.plan.marginal THEN -2 ELSE -1) ELSE IF Mode="UpperBound" THEN (IF s.plan.marginal THEN 2 ELSE 1) ELSE 0)
PrecisionHonest == PlanActive => s.plan.precision=Mode
Nonnegative == PlanActive => s.plan.predicted>=0
AppendOnly == Prefix(s.beforeLog,s.log) /\ Prefix(s.beforeReplyLog,s.replyLog)
SameBatch == Len(s.replyLog)=Len(s.log) /\
 \A i \in 1..Len(s.log): s.replyLog[i]=[id |-> s.log[i].id,output |-> s.log[i].output]
OriginalBatch == \A i \in 1..Len(s.log):
 s.log[i].id<=MaxCalls => s.log[i]=s.original[s.log[i].id]
NoEarlyPublish == s.published \subseteq s.receipts
PlanSendSame == s.sent.id#0 => s.sent.body=s.plan.body /\ s.sent.env=s.plan.env /\ s.sent.basis=s.plan.basis
LeaseHeld == s.phase \in {"planned","sent","received","staged","unknown"} => s.leased /\ ~s.released
WindowSafe == s.sent.id#0 => Count(s.sent.body,s.sent.env,s.sent.basis)+Reserved<=Window
\* Progress checks require explicit eventual scheduling of protocol work.
ProgressSpec == Spec /\ WF_vars(PlanFull \/ PlanMarginal)
 /\ WF_vars(Dispatch \/ Reject) /\ WF_vars(ReceiveAccurateUsage)
 /\ WF_vars(StageOriginalBatch) /\ WF_vars(CommitOriginalBatch \/ LoseReceipt)
 /\ WF_vars(RecoverSameBatch) /\ WF_vars(NextAttempt \/ Finish)
EventuallyDone == <>(s.phase="done")
\* Scope: stable-prefix/basis configuration, accurate observations, finite next calls.
\* The id here is the finite causal dispatch index, not a lexicographic real-world id.
UsesAnchor(i) == s.call=i+1 /\ PlanActive /\ s.plan.marginal /\ s.plan.anchor.id=i
AccurateCommitted(i) == s.call=i /\ s.phase="committed"
 /\ s.received.kind="accurate" /\ i \in s.receipts
ReanchorProgress == \A i \in 1..(MaxCalls-1): AccurateCommitted(i) ~> UsesAnchor(i)
\* Ensures the first reanchor path actually occurs; rejection cannot satisfy it.
EventuallyReanchored == <>UsesAnchor(1)
=============================================================================

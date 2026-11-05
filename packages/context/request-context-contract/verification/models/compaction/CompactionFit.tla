--------------------------- MODULE CompactionFit ---------------------------
(***************************************************************************)
(* One request preparation over one history (RQ-05, RQ-06, RQ-07, H4).      *)
(* Entries 1..N are the model-visible history; entry N is the new input of  *)
(* this request.  The preparation assembles, judges the budget, enters at   *)
(* most one compaction plan, runs bounded summary steps, commits one        *)
(* compaction record by appending it, and resumes.  Token counts are        *)
(* abstract weights.  SysW stands for every part of the request that is not *)
(* history: system prompt, tools, layer 4 and layer 6.                      *)
(*                                                                          *)
(* The model checks that compaction never rewrites history, keeps retained  *)
(* and open entries, never splits a call from its result, keeps the        *)
(* request bounded, that the outcome is closed and visible (no silent      *)
(* truncation), that the work ends, and that every built Model input uses  *)
(* the representation the profile fixes.                                    *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  N,            \* history entries; entry N is the new input
  L,            \* hard input-tokens limit of the profile
  T,            \* compaction trigger (judgeBudget: min of percent line and room)
  SysW,         \* weight of the non-history layers
  R,            \* retention budget
  S,            \* largest summary weight a step can produce
  B,            \* step bound of the plan
  \* negative controls
  PostCheckPartial,   \* deriveStep checks retained+summary+after against L only (the check
                      \* before R2-D316); FALSE: the whole request against the trigger line
  TruncateToFit, Replan, RewriteOnCompact, IgnoreOpen, SplitPairs,
  IgnoreRetainBudget, UseStrategyRep, SkipResumeCheck, RetryVetoed,
  \* known limitation
  MixedFallback       \* the fallback profile has a supplier of another family

Idx == 1..N
ProfileRep == "profile"
StrategyRep == "strategy"
Outcomes == {"fixable", "cannot-fit", "unavailable"}

VARIABLES
  w, open, callOf,  \* entry weight, open-work floor flag, call of a result (0 = none)
  log,              \* the history log: entries then compaction records
  phase,            \* assemble | step | commit | fixable | cannot-fit | unavailable
  plans, steps, draft, summary, transition, req, built, reason,
  vbit              \* toggled by a retried veto, so that the retry loop is not stuttering

vars == <<w, open, callOf, log, phase, plans, steps, draft, summary, transition, req,
          built, reason, vbit>>

Sum(f, X) ==
  LET RECURSIVE S1(_)
      S1(Y) == IF Y = {} THEN 0 ELSE LET y == CHOOSE y \in Y : TRUE IN f[y] + S1(Y \ {y})
  IN S1(X)

IsC(x) == x.kind = "C"
Base == [i \in Idx |-> [kind |-> "E", id |-> i]]
Comps == {j \in 1..Len(log) : IsC(log[j])}
LastC == log[CHOOSE j \in Comps : \A m \in Comps : m <= j]

(* The CM view: without a compaction, every entry; with one, the retained   *)
(* entries, the record, and every entry after its range.                     *)
ViewSet == IF Comps = {} THEN {log[j].id : j \in {m \in 1..Len(log) : ~IsC(log[m])}}
           ELSE LET c == LastC IN
                c.ret \cup {i \in Idx : i > c.to /\ \E j \in 1..Len(log) :
                                              ~IsC(log[j]) /\ log[j].id = i}
ViewW == Sum(w, ViewSet) + (IF Comps = {} THEN 0 ELSE LastC.s)
ReqW(X) == SysW + Sum(w, X) + (IF Comps = {} THEN 0 ELSE LastC.s)
Fits(x) == x <= T /\ x <= L

(* A legal draft over a cut: new input never covered, open entries kept,    *)
(* pairs not split unless the call is retained, retention within budget.    *)
Legal(k, Ret) ==
  /\ k \in 1..(N - 1)
  /\ Ret \subseteq 1..k
  /\ IgnoreOpen \/ \A i \in 1..k : open[i] => i \in Ret
  /\ SplitPairs \/ \A i \in Idx : callOf[i] # 0 =>
       \/ callOf[i] > k                                  \* both after the range
       \/ i <= k /\ (callOf[i] \in Ret <=> i \in Ret)    \* both inside: kept or summarized
       \/ i > k /\ callOf[i] \in Ret                     \* split, call retained
  /\ IgnoreRetainBudget \/ Sum(w, Ret) <= R
Floor == {i \in 1..(N - 1) : open[i]}

TypeOK ==
  /\ phase \in {"assemble", "step", "commit"} \cup Outcomes
  /\ plans \in 0..2 /\ steps \in 0..B /\ transition \in BOOLEAN
  /\ built \subseteq {ProfileRep, StrategyRep}

Init ==
  /\ w \in [Idx -> {1, 2}]
  /\ open \in [Idx -> BOOLEAN]
  /\ callOf \in {f \in [Idx -> 0..N] : \A i \in Idx : f[i] = 0 \/ (i > 1 /\ f[i] = i - 1)}
  /\ \A i \in Idx : callOf[i] # 0 => callOf[callOf[i]] = 0   \* a call is not a result
  /\ log = Base
  /\ phase = "assemble"
  /\ plans = 0 /\ steps = 0 /\ draft = [k |-> 0, ret |-> {}] /\ summary = 0
  /\ transition = FALSE /\ req = {} /\ built = {} /\ reason = "none" /\ vbit = 0

Rep == IF UseStrategyRep THEN StrategyRep ELSE ProfileRep
Build == built' = built \cup {Rep}

Done(o, why) == phase' = o /\ reason' = why

(* assemble or resume: build the whole candidate and its fixed part, judge.  *)
Judge ==
  /\ phase = "assemble"
  /\ Build
  /\ IF MixedFallback
       THEN /\ Done("unavailable", "plan-refused-representation")
            /\ UNCHANGED <<plans, steps, draft, req>>
     ELSE IF SysW + w[N] > L
       THEN /\ Done("cannot-fit", "fixed-part-over-limit") /\ UNCHANGED <<plans, steps, draft, req>>
     ELSE IF Fits(ReqW(ViewSet))
       THEN /\ Done("fixable", "fits") /\ req' = ViewSet /\ UNCHANGED <<plans, steps, draft>>
     ELSE IF TruncateToFit /\ \E X \in SUBSET ViewSet : N \in X /\ Fits(ReqW(X))
       THEN /\ \E X \in SUBSET ViewSet : N \in X /\ Fits(ReqW(X)) /\ req' = X
            /\ Done("fixable", "truncated") /\ UNCHANGED <<plans, steps, draft>>
     ELSE IF (plans > 0 \/ transition) /\ ~Replan
       THEN /\ Done("cannot-fit", "after-compaction") /\ UNCHANGED <<plans, steps, draft, req>>
     ELSE IF plans >= 2
       THEN /\ Done("cannot-fit", "after-compaction") /\ UNCHANGED <<plans, steps, draft, req>>
     ELSE IF Sum(w, Floor) > R /\ ~IgnoreOpen
       THEN /\ Done("cannot-fit", "floor-exceeds-budget")
            /\ plans' = plans + 1 /\ UNCHANGED <<steps, draft, req>>
     ELSE IF \E k \in Idx, Ret \in SUBSET Idx : Legal(k, Ret)
       THEN /\ \E k \in Idx, Ret \in SUBSET Idx :
                 Legal(k, Ret) /\ draft' = [k |-> k, ret |-> Ret]
            /\ plans' = plans + 1 /\ steps' = 0 /\ phase' = "step"
            /\ UNCHANGED <<req, reason>>
     ELSE /\ Done("unavailable", "no-legal-draft") /\ UNCHANGED <<plans, steps, draft, req>>
  /\ UNCHANGED <<w, open, callOf, log, summary, transition, vbit>>

PostW(s) == IF PostCheckPartial
              THEN Sum(w, draft.ret) + s + Sum(w, {i \in Idx : i > draft.k})
              ELSE SysW + Sum(w, draft.ret) + s + Sum(w, {i \in Idx : i > draft.k})
PostFits(s) == IF PostCheckPartial THEN PostW(s) <= L ELSE Fits(PostW(s))

(* One summary step: a summary of weight s, or a veto.  Progress adds one.   *)
Step ==
  /\ phase = "step" /\ steps < B
  /\ Build
  /\ \/ /\ IF RetryVetoed
             THEN /\ vbit' = 1 - vbit                 \* a veto starts the same step again
                  /\ UNCHANGED <<phase, reason, steps>>
             ELSE /\ steps' = steps + 1 /\ Done("cannot-fit", "step-vetoed") /\ UNCHANGED vbit
        /\ UNCHANGED summary
     \/ \E s \in 1..S :
          /\ summary' = s /\ steps' = steps + 1 /\ UNCHANGED vbit
          /\ IF PostFits(s) THEN phase' = "commit" /\ UNCHANGED reason
             ELSE IF steps + 1 >= B THEN Done("cannot-fit", "bound-exhausted")
             ELSE UNCHANGED <<phase, reason>>
  /\ UNCHANGED <<w, open, callOf, log, plans, draft, transition, req>>

(* The holder appends one compaction record; resume re-judges the request.   *)
Commit ==
  /\ phase = "commit"
  /\ LET c == [kind |-> "C", to |-> draft.k, ret |-> draft.ret, s |-> summary] IN
       \* the rewrite deletes the covered entries that are not retained
       log' = IF RewriteOnCompact
                THEN SelectSeq(Base, LAMBDA x : x.id \in draft.ret \/ x.id > draft.k) \o <<c>>
                ELSE Append(log, c)
  /\ transition' = TRUE
  /\ IF SkipResumeCheck
       THEN Done("fixable", "unchecked") /\ req' = ViewSet'
       ELSE phase' = "assemble" /\ UNCHANGED <<reason, req>>
  /\ UNCHANGED <<w, open, callOf, plans, steps, draft, summary, built, vbit>>

Next == Judge \/ Step \/ Commit
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

----------------------------------------------------------------------------
AppendOnly == [][Len(log') >= Len(log) /\ SubSeq(log', 1, Len(log)) = log]_vars
RetainedVisible == transition => draft.ret \subseteq ViewSet
OpenVisible == transition => \A i \in Idx : open[i] => i \in ViewSet
NoOrphanResult == transition => \A i \in ViewSet : callOf[i] # 0 => callOf[i] \in ViewSet
RetainBounded == transition => Sum(w, draft.ret) <= R
(* The compacted view depends on the retention budget, one summary and the   *)
(* entries after the range; not on the covered prefix.                       *)
ViewBounded == transition => ViewW <= R + S + Sum(w, {i \in Idx : i > draft.k})
NoSilentTruncation == phase = "fixable" => req = ViewSet
FixableFits == phase = "fixable" => Fits(ReqW(req))
AtMostOnePlan == plans <= 1
RepresentationAdopted == built \subseteq {ProfileRep}
NoRepRefusal == phase # "unavailable" \/ reason # "plan-refused-representation"
Terminates == <>(phase \in Outcomes)
(* A committed compaction is followed by a fixable request (R2-D316).        *)
CompactionKeepsWork == (transition /\ phase \in Outcomes) => phase = "fixable"
=============================================================================

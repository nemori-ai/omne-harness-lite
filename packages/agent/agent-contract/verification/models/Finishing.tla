------------------------------ MODULE Finishing ------------------------------
(***************************************************************************)
(* The finishing protocol of one Agent execution as its Journal decides it: *)
(* the candidate and its route, the obligations list, the cancellation      *)
(* judgment, commit F1 and F2, prepareFinish, tryFinish, the six settlement *)
(* variants of commitSettlement, the handoff records P, Ja (resolve and     *)
(* retire) and Rh with the provider's exclude and the currentHandoff        *)
(* pointer, the effective cancel and the Session participant, crashes with  *)
(* a takeover, lost replies and the retry of the same operation.            *)
(*                                                                          *)
(* The owner of every rule is packages/agent/agent-contract/SPEC.md; the    *)
(* state and event mapping, the abstractions and the bounds are in          *)
(* ../formal-mapping.md. A TLC result holds only inside those bounds.       *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS
  Bugs,          \* the deliberate faults of a negative control; {} in every positive control
  Scope,         \* the optional responsibilities and paths in play, a subset of ScopeNames
  Coordinated,   \* TRUE: a Session participant joins the conditional end (coordinated binding)
  Handoffs,      \* internal H of the execution: 0, 1, or 2 (the second one follows a retire)
  MaxInputs,     \* accepted inputs, the initial one included
  MaxF1,         \* ordinary candidates the coordinator writes
  MaxCrashes,    \* coordinator crashes, each one followed by a takeover
  MaxLost,       \* writes whose reply is lost (commit-unknown), and held writes
  SupersedeStaleCancelled, \* TRUE: establish-cancellation replaces a cancelled candidate an input overtook
  Observe        \* TRUE: act and reply record each step; FALSE keeps them constant (liveness runs)

ScopeNames == {"call", "tool", "card", "legacy", "newrun", "held"}
BugNames == {"skip-pending", "unknown-as-pending", "ignore-cancel", "stale-intent",
             "stale-judgment", "rh-moves-pointer", "release-before-custody",
             "recheck-before-recognize", "new-run-blocks-cancel"}
ASSUME Bugs \subseteq BugNames /\ Scope \subseteq ScopeNames
ASSUME Coordinated \in BOOLEAN /\ SupersedeStaleCancelled \in BOOLEAN /\ Observe \in BOOLEAN
ASSUME Handoffs \in 0..2 /\ MaxInputs \in 1..3 /\ MaxF1 \in 1..3
ASSUME MaxCrashes \in 0..2 /\ MaxLost \in 0..2

Hs == IF Handoffs = 0 THEN {} ELSE IF Handoffs = 1 THEN {"h1"} ELSE {"h1", "h2"}
NoH == "none"
Categories == <<"inputs", "controls", "operations", "passages", "custody">>
Rank(c) == CHOOSE i \in 1..5 : Categories[i] = c
First(cs) == CHOOSE c \in cs : \A d \in cs : Rank(c) <= Rank(d)
Blocked(c) == "blocked-" \o c
BlockedReplies == {Blocked(Categories[i]) : i \in 1..5}

NoCandidate == [concl |-> "none", route |-> "none", proof |-> FALSE, wm |-> 0, legacy |-> FALSE]
NoList == [issued |-> FALSE, keys |-> {}, outOk |-> FALSE]
NoJudgment == [dec |-> "none", cat |-> "none", basis |-> {}]
NoPend == [m |-> "none", r |-> "none"]

VARIABLES
  status,     \* "advancing" | "settling" | "ended"
  cand,       \* the current candidate and its route; a new candidate resets list and judg
  nf1,        \* ordinary candidates written so far
  list,       \* the issued obligations: their keys, and whether no event extended the output since
  judg,       \* the current judgment of the current cancellation candidate
  ctl,        \* the cancel control: "none" | "accepted" | "unresolved" | "effective"
  acc,        \* accepted inputs
  tk,         \* inputs an I0 batch took
  part,       \* the Session participant: "none" | "input" | "terminal"
  call,       \* the Model call: "none" | "issued" | "recorded" | "settled"
  pcopy,      \* the producer still holds its durable copy of the result
  tool,       \* the Tool invoke whose return was commit-unknown: "none" | "unknown" | "held"
  card,       \* a card round whose presentation is unknown: "none" | "unknown" | "held"
  legacyRet,  \* the before-terminal call of a legacy candidate: "none" | "inflight" | "held"
  hist,       \* per H, the history: "none" | "pending" | "committed" | "na" | "retained"
  pv,         \* per H, the provider's resolution: "none" | "prepared" | "rejected" | "excluded"
  rh,         \* per H, whether an Rh saved the provider's resolution
  ptr,        \* checkpoint.currentHandoff
  fresh,      \* the coordinator's view is the current revision
  zombie,     \* an attachment superseded by a takeover still tries to write
  held,       \* a write of the execution is held undecided: an unknown operation item
  pend,       \* the lost write that the coordinator must retry, and its original reply
  crashes, lost,
  slot,       \* who holds the Session's run slot: "old" | "new"
  endc,       \* the conclusion of the end
  final,      \* the dispositions of the closure at the end
  act, reply, \* the last step and its answer: read by PointerByJa and exported in traces
  okStale, okUnknown, okJudgment, okReplay  \* step monitors, FALSE from the first violation on

fin == <<status, cand, nf1, list, judg>>
inp == <<acc, tk, part>>
res == <<call, pcopy, tool, card, legacyRet>>
hand == <<hist, pv, rh, ptr>>
run == <<zombie, held, crashes, lost, slot>>
ends == <<endc, final>>
mon == <<okStale, okUnknown, okJudgment>>
vars == <<fin, ctl, inp, res, hand, fresh, pend, run, ends, act, reply, mon, okReplay>>
\* The model-checking view leaves out the trace variables: no action reads act or reply of the
\* state before it, and every monitor and PointerByJa reads them only in the step that sets them.
View == <<fin, ctl, inp, res, hand, fresh, pend, run, ends, mon, okReplay>>

(***************************************************************************)
(* The responsibility closure (SPEC "终结责任清单"): the present items, the *)
(* category of each and its disposition for a candidate of conclusion c.    *)
(***************************************************************************)
Present ==
  {<<"input", i>> : i \in 1..acc}
  \cup (IF ctl # "none" THEN {<<"control", 0>>} ELSE {})
  \cup (IF call # "none" THEN {<<"call", 0>>} ELSE {})
  \cup (IF call \in {"recorded", "settled"} THEN {<<"result", 0>>} ELSE {})
  \cup (IF tool # "none" THEN {<<"tool", 0>>} ELSE {})
  \cup (IF card # "none" THEN {<<"card", 0>>} ELSE {})
  \cup (IF legacyRet # "none" THEN {<<"legacy", 0>>} ELSE {})
  \cup {<<h, 0>> : h \in {x \in Hs : hist[x] = "pending"}}
  \cup (IF held THEN {<<"operation", 0>>} ELSE {})

Category(k) ==
  CASE k[1] = "input" -> "inputs"
    [] k[1] = "control" -> "controls"
    [] k[1] \in {"call", "tool", "operation", "h1", "h2"} -> "operations"
    [] k[1] \in {"card", "legacy"} -> "passages"
    [] k[1] = "result" -> "custody"

Disp(k, c) ==
  CASE k[1] = "input" -> IF tk >= k[2] THEN "settled"
                         ELSE IF c = "cancelled" THEN "held" ELSE "pending"
    [] k[1] = "control" -> IF ctl = "unresolved" THEN "pending" ELSE "settled"
    [] k[1] = "call" -> IF call = "issued" THEN "unknown" ELSE "settled"
    [] k[1] = "result" -> IF call = "recorded" THEN "pending" ELSE "settled"
    [] k[1] = "tool" -> IF tool = "unknown" THEN "unknown" ELSE "held"
    [] k[1] = "card" -> IF card = "unknown" THEN "unknown" ELSE "held"
    [] k[1] = "legacy" -> IF legacyRet = "inflight" THEN "unknown" ELSE "held"
    [] k[1] \in {"h1", "h2"} -> IF c = "complete" THEN "pending" ELSE "held"
    [] k[1] = "operation" -> "unknown"

Closure(c) == {<<k, Disp(k, c)>> : k \in Present}
PendingCats(c) == {Category(k) : k \in {x \in Present : Disp(x, c) = "pending"}}
UnknownCats(c) == {Category(k) : k \in {x \in Present : Disp(x, c) = "unknown"}}
HasUnknown(c) == UnknownCats(c) # {}
\* What a judgment reads and tryFinish compares (SPEC "取消路线上的 tryFinish").
Basis(c) == Closure(c) \cup {<<<<"participant", 0>>, part>>}

(***************************************************************************)
(* The answers of prepareFinish, tryFinish and judge-cancellation, in the   *)
(* judgment order (SPEC "条件终结" result table, "判定次序与失败映射").     *)
(***************************************************************************)
Auth == IF cand.concl = "cancelled" THEN "cancel" ELSE "advancement"
HasCandidate == cand.concl # "none"
CancelHonoured == "ignore-cancel" \notin Bugs
SettlingChecked == "stale-intent" \notin Bugs
ParticipantInput == IF Coordinated /\ part = "input" THEN {"inputs"} ELSE {}

\* The categories the author route blocks on: the pending items and a missing before-terminal
\* proof. "skip-pending" drops the pending items, "unknown-as-pending" adds the unknown ones.
AuthorCats ==
  (IF "skip-pending" \in Bugs THEN {} ELSE PendingCats(cand.concl))
  \cup (IF "unknown-as-pending" \in Bugs THEN UnknownCats(cand.concl) ELSE {})
  \cup (IF cand.proof THEN {} ELSE {"passages"})

JudgmentCurrent == judg.dec # "none"
JudgmentFits == "stale-judgment" \in Bugs \/ judg.basis = Basis(cand.concl)

FinishCheck ==
  IF cand.route = "author"
  THEN IF cand.concl = "cancelled" THEN Blocked("passages")
       ELSE IF AuthorCats # {} THEN Blocked(First(AuthorCats))
       ELSE IF HasUnknown(cand.concl) THEN "unavailable"
       ELSE "clear"
  ELSE IF ~JudgmentCurrent THEN Blocked("passages")
       ELSE IF ~JudgmentFits THEN "changed"
       ELSE IF judg.dec = "unknown" THEN "unavailable"
       ELSE IF judg.dec = "blocked" THEN Blocked(judg.cat)
       ELSE "clear"

ParticipantRefuses ==
  Coordinated /\ (part = "input" \/ (part = "terminal" /\ Auth = "advancement"))

TryFinishReply ==
  IF status = "ended" THEN "terminal"
  ELSE IF Auth = "cancel" /\ ctl # "effective" THEN "denied"
  ELSE IF Auth = "advancement" /\ ctl = "effective" /\ CancelHonoured THEN "changed"
  ELSE IF status # "settling" /\ SettlingChecked THEN "changed"
  ELSE IF ~fresh THEN "changed"
  ELSE IF ~list.issued THEN "invalid"
  ELSE IF list.keys # Present \/ ~list.outOk THEN "changed"
  ELSE IF cand.wm < acc THEN "changed"
  ELSE IF FinishCheck # "clear" THEN FinishCheck
  ELSE IF ParticipantRefuses THEN "changed"
  ELSE "ended"

PrepareReply ==
  IF status = "ended" THEN "terminal"
  ELSE IF Auth = "cancel" /\ ctl # "effective" THEN "denied"
  ELSE IF Auth = "advancement" /\ ctl = "effective" /\ CancelHonoured THEN "failure-changed"
  ELSE IF status # "settling" /\ SettlingChecked THEN "failure-changed"
  ELSE IF ~fresh THEN "failure-changed"
  ELSE "ok"

\* The decision of the installed cancellation policy (SPEC "判断输入、判据与记录" 1-4): an unknown
\* first, then a determined pending item, else allowed. "unknown-as-pending" blocks on an unknown.
JudgedCats(c) ==
  PendingCats(c) \cup ParticipantInput
  \cup (IF "unknown-as-pending" \in Bugs THEN UnknownCats(c) ELSE {})
Decision(c) ==
  IF HasUnknown(c) /\ "unknown-as-pending" \notin Bugs THEN "unknown"
  ELSE IF JudgedCats(c) # {} THEN "blocked" ELSE "allowed"
DecisionCat(c) == IF JudgedCats(c) = {} THEN "none" ELSE First(JudgedCats(c))

(***************************************************************************)
(* Step monitors. `f` is the outcome of the conditional end the step        *)
(* decided ("none" for any other step); they read it against the state     *)
(* before the step.                                                         *)
(***************************************************************************)
Monitors(a, r, f) ==
  /\ act' = IF Observe THEN a ELSE "none"
  /\ reply' = IF Observe THEN r ELSE "none"
  /\ okStale' = (okStale /\ (f = "ended" => status = "settling"))
  /\ okUnknown' = (okUnknown /\
       (f = "ended" => ~HasUnknown(cand.concl)) /\
       (f \in BlockedReplies =>
          \/ cand.route = "author" /\ cand.concl # "cancelled" /\
             f \in {Blocked(c) : c \in PendingCats(cand.concl) \cup
                                        (IF cand.proof THEN {} ELSE {"passages"})}
          \/ cand.route = "author" /\ cand.concl = "cancelled" /\ f = Blocked("passages")
          \/ cand.route = "cancellation" /\ (~JudgmentCurrent \/ judg.dec = "blocked")) /\
       (a \in {"Judge", "Lose-Judge"} /\ r # "failure-changed" /\ HasUnknown(cand.concl) =>
          Decision(cand.concl) = "unknown"))
  /\ okJudgment' = (okJudgment /\
       (cand.route = "cancellation" /\ JudgmentCurrent /\
        f \in {"ended", "unavailable"} \cup BlockedReplies => judg.basis = Basis(cand.concl)))

Step(a, r) == Monitors(a, r, "none")

\* A step that changes no fact of the execution: it only answers.
Answer(a, r) ==
  /\ Monitors(a, r, IF a = "TryFinish" THEN r ELSE "none")
  /\ UNCHANGED <<fin, ctl, inp, res, hand, fresh, pend, run, ends, okReplay>>

\* A write that emits an event extends the output interval: an issued list goes stale.
Emitted == [list EXCEPT !.outOk = FALSE]

Coordinator == pend.m = "none"           \* no lost write waits for its retry
SlotFree == "new-run-blocks-cancel" \notin Bugs \/ slot = "old"

(***************************************************************************)
(* Initial states: a fresh execution, or a legacy cancelled candidate on an *)
(* author route that a writer of the old protocol left, under an effective  *)
(* cancel, with its before-terminal call still in flight.                   *)
(***************************************************************************)
InitCommon ==
  /\ nf1 = 0 /\ list = NoList /\ judg = NoJudgment
  /\ acc = 1 /\ tk = 0 /\ part = "none"
  /\ call = "none" /\ pcopy = FALSE /\ tool = "none" /\ card = "none"
  /\ hist = [h \in Hs |-> "none"] /\ pv = [h \in Hs |-> "none"] /\ rh = [h \in Hs |-> FALSE]
  /\ ptr = NoH /\ fresh = TRUE /\ pend = NoPend
  /\ zombie = FALSE /\ held = FALSE /\ crashes = 0 /\ lost = 0 /\ slot = "old"
  /\ endc = "none" /\ final = {} /\ reply = "none"
  /\ act = IF Observe THEN "Init" ELSE "none"
  /\ okStale = TRUE /\ okUnknown = TRUE /\ okJudgment = TRUE /\ okReplay = TRUE

Init ==
  \/ /\ InitCommon
     /\ status = "advancing" /\ cand = NoCandidate /\ ctl = "none" /\ legacyRet = "none"
  \/ /\ "legacy" \in Scope /\ InitCommon
     /\ status = "settling" /\ ctl = "effective" /\ legacyRet = "inflight"
     /\ cand = [concl |-> "cancelled", route |-> "author", proof |-> TRUE, wm |-> 1,
                legacy |-> TRUE]

(***************************************************************************)
(* Coordinator writes (commit, prepareFinish, tryFinish, load).             *)
(***************************************************************************)
\* I0: the batch of every accepted input. It leaves settling. After an effective cancel the
\* coordinator takes no new step of the business (SPEC "取消、退出与结构变更").
TakeInputs ==
  /\ Coordinator /\ status # "ended" /\ ctl # "effective" /\ tk < acc
  /\ IF ~fresh THEN Answer("TakeInputs", "failure-changed")
     ELSE /\ tk' = acc /\ status' = "advancing" /\ list' = Emitted
          /\ Step("TakeInputs", "ok")
          /\ UNCHANGED <<cand, nf1, judg, ctl, acc, part, res, hand, fresh, pend, run, ends,
                         okReplay>>

\* F1: a settling commit that carries an ordinary candidate (a new candidate, its author route).
F1(c) ==
  /\ Coordinator /\ status = "advancing" /\ nf1 < MaxF1
  /\ IF ~fresh \/ (ctl = "effective" /\ CancelHonoured)
     THEN Answer("F1-" \o c, "failure-changed")
     ELSE /\ nf1' = nf1 + 1
          /\ cand' = [concl |-> c, route |-> "author", proof |-> FALSE, wm |-> acc,
                      legacy |-> FALSE]
          /\ status' = "settling" /\ list' = NoList /\ judg' = NoJudgment
          /\ Step("F1-" \o c, "ok")
          /\ UNCHANGED <<ctl, inp, res, hand, fresh, pend, run, ends, okReplay>>

\* F2: the plain settling commit of the current candidate. On an author route without the
\* before-terminal proof it completes the before-terminal passage and sets the proof; after a
\* takeover left settling it brings the execution back to settling.
F2 ==
  /\ Coordinator /\ status # "ended" /\ HasCandidate
  /\ \/ status # "settling"
     \/ cand.route = "author" /\ ~cand.proof /\ cand.concl \in {"complete", "failed"}
  /\ IF ~fresh THEN Answer("F2", "failure-changed")
     ELSE /\ status' = "settling"
          /\ cand' = IF cand.route = "author" THEN [cand EXCEPT !.proof = TRUE] ELSE cand
          /\ Step("F2", "ok")
          /\ UNCHANGED <<nf1, list, judg, ctl, inp, res, hand, fresh, pend, run, ends, okReplay>>

PrepareEffect ==
  /\ list' = [issued |-> TRUE, keys |-> Present, outOk |-> TRUE]
  /\ UNCHANGED <<status, cand, nf1, judg, ctl, inp, res, hand, fresh, ends>>

Prepare ==
  /\ Coordinator /\ status # "ended" /\ HasCandidate /\ SlotFree
  /\ IF PrepareReply = "ok"
     THEN /\ PrepareEffect /\ Step("Prepare", "ok") /\ UNCHANGED <<pend, run, okReplay>>
     ELSE Answer("Prepare", PrepareReply)

\* The end: the terminal, the last event, the final list and its dispositions in one commit. A
\* prepared H that no Ja published is retained by the terminal disposition.
EndEffect ==
  /\ status' = "ended" /\ endc' = cand.concl
  /\ final' = {d[2] : d \in Closure(cand.concl)}
  /\ hist' = [h \in Hs |-> IF hist[h] = "pending" THEN "retained" ELSE hist[h]]
  /\ list' = Emitted
  /\ UNCHANGED <<cand, nf1, judg, ctl, inp, res, pv, rh, ptr, fresh>>

TryFinish ==
  /\ Coordinator /\ status # "ended" /\ HasCandidate /\ SlotFree
  /\ IF TryFinishReply = "ended"
     THEN /\ EndEffect /\ Monitors("TryFinish", "ended", "ended")
          /\ UNCHANGED <<pend, run, okReplay>>
     ELSE Answer("TryFinish", TryFinishReply)

\* load: the coordinator reads the current revision.
Load ==
  /\ Coordinator /\ ~fresh
  /\ fresh' = TRUE /\ Step("Load", "ok")
  /\ UNCHANGED <<fin, ctl, inp, res, hand, pend, run, ends, okReplay>>

(***************************************************************************)
(* The candidate, migration and judgment variants of commitSettlement.      *)
(***************************************************************************)
\* establish-cancellation replaces no candidate, an ordinary one, or, with
\* SupersedeStaleCancelled, a cancelled candidate whose input boundary an accepted input passed.
\* The coordinator tries it in these cases only; a current cancelled candidate is otherwise judged.
CanEstablish ==
  \/ cand.concl \in {"none", "complete", "failed"}
  \/ SupersedeStaleCancelled /\ cand.concl = "cancelled" /\ cand.wm < acc

\* A legacy candidate on its author route only migrates; after the migration it is judged or,
\* when an input passed its boundary, replaced like any cancelled candidate.
Establish ==
  /\ Coordinator /\ status # "ended" /\ ctl = "effective" /\ SlotFree
  /\ ~(cand.legacy /\ cand.route = "author")
  /\ \/ cand.concl # "cancelled"
     \/ cand.route = "cancellation" /\ cand.wm < acc
  /\ IF ~fresh THEN Answer("Establish", "failure-changed")
     ELSE IF ~CanEstablish THEN Answer("Establish", "invalid")
     ELSE /\ cand' = [concl |-> "cancelled", route |-> "cancellation", proof |-> FALSE,
                      wm |-> acc, legacy |-> FALSE]
          /\ status' = "settling" /\ list' = NoList /\ judg' = NoJudgment
          /\ Step("Establish", "ok")
          /\ UNCHANGED <<nf1, ctl, inp, res, hand, fresh, pend, run, ends, okReplay>>

\* migrate-cancellation: the legacy cancelled candidate moves to a cancellation route; the
\* current proof pointer is cleared (SPEC "旧取消记录的迁移").
Migrate ==
  /\ Coordinator /\ status # "ended" /\ cand.legacy /\ cand.route = "author" /\ SlotFree
  /\ IF ~fresh THEN Answer("Migrate", "failure-changed")
     ELSE /\ cand' = [cand EXCEPT !.route = "cancellation", !.proof = FALSE]
          /\ list' = NoList /\ judg' = NoJudgment
          /\ Step("Migrate", "ok")
          /\ UNCHANGED <<status, nf1, ctl, inp, res, hand, fresh, pend, run, ends, okReplay>>

JudgeEffect ==
  /\ judg' = [dec |-> Decision(cand.concl), cat |-> DecisionCat(cand.concl),
              basis |-> Basis(cand.concl)]
  /\ UNCHANGED <<status, cand, nf1, list, ctl, inp, res, hand, fresh, ends>>

Judge ==
  /\ Coordinator /\ status # "ended" /\ cand.route = "cancellation" /\ SlotFree
  /\ IF ~fresh THEN Answer("Judge", "failure-changed")
     ELSE /\ JudgeEffect /\ Step("Judge", "ok") /\ UNCHANGED <<pend, run, okReplay>>

(***************************************************************************)
(* Lost replies: the write is applied, the coordinator sees commit-unknown  *)
(* and retries the same operation with the same input.                      *)
(***************************************************************************)
Lose(m) == pend' = [m |-> m, r |-> IF m = "TryFinish" THEN "ended" ELSE "ok"] /\ lost' = lost + 1

LoseTryFinish ==
  /\ Coordinator /\ lost < MaxLost /\ status # "ended" /\ HasCandidate /\ SlotFree
  /\ TryFinishReply = "ended"
  /\ EndEffect /\ Lose("TryFinish")
  /\ Monitors("Lose-TryFinish", "commit-unknown", "ended")
  /\ UNCHANGED <<zombie, held, crashes, slot, okReplay>>

LosePrepare ==
  /\ Coordinator /\ lost < MaxLost /\ status # "ended" /\ HasCandidate /\ SlotFree
  /\ PrepareReply = "ok"
  /\ PrepareEffect /\ Lose("Prepare")
  /\ Step("Lose-Prepare", "commit-unknown")
  /\ UNCHANGED <<zombie, held, crashes, slot, okReplay>>

LoseJudge ==
  /\ Coordinator /\ lost < MaxLost /\ status # "ended" /\ cand.route = "cancellation"
  /\ fresh /\ SlotFree
  /\ JudgeEffect /\ Lose("Judge")
  /\ Step("Lose-Judge", "commit-unknown")
  /\ UNCHANGED <<zombie, held, crashes, slot, okReplay>>

\* What a provider answers when it checks the lifecycle and the expected revision before it
\* recognizes the original operation ("recheck-before-recognize").
Recheck(m) ==
  CASE m = "TryFinish" -> IF status = "ended" THEN "terminal" ELSE "changed"
    [] m \in {"Prepare", "Judge"} -> IF status = "ended" THEN "terminal" ELSE "failure-changed"

\* The retry of the lost write: the same operation with the same input answers the original
\* result before any lifecycle or expected check (SPEC "判定次序与失败映射" 2).
Retry ==
  /\ pend.m \in {"TryFinish", "Prepare", "Judge"}
  /\ LET r == IF "recheck-before-recognize" \in Bugs THEN Recheck(pend.m) ELSE pend.r IN
     /\ okReplay' = (okReplay /\ r = pend.r)
     /\ act' = IF Observe THEN "Retry-" \o pend.m ELSE "none"
     /\ reply' = IF Observe THEN r ELSE "none"
  /\ pend' = NoPend /\ fresh' = FALSE
  /\ UNCHANGED <<fin, ctl, inp, res, hand, run, ends, mon>>

(***************************************************************************)
(* The cancel control (SPEC "六个阶段"): accepted, then the intent stage,   *)
(* each with its control event.                                            *)
(***************************************************************************)
Cancel ==
  /\ status # "ended" /\ ctl = "none"
  /\ ctl' = "accepted" /\ list' = Emitted /\ fresh' = FALSE
  /\ Step("Cancel", "ok")
  /\ UNCHANGED <<status, cand, nf1, judg, inp, res, hand, pend, run, ends, okReplay>>

Intent(state) ==
  /\ status # "ended"
  /\ IF state = "unresolved" THEN ctl = "accepted" ELSE ctl \in {"accepted", "unresolved"}
  /\ ctl' = IF state = "reached" THEN "effective" ELSE "unresolved"
  /\ list' = Emitted /\ fresh' = FALSE
  /\ Step("Intent-" \o state, "ok")
  /\ UNCHANGED <<status, cand, nf1, judg, inp, res, hand, pend, run, ends, okReplay>>

\* After the end the intent of a cancel that was only accepted is not established any more.
IntentAfterEnd ==
  /\ status = "ended" /\ ctl = "accepted"
  /\ Answer("Intent-late", "terminal")

(***************************************************************************)
(* Inputs: the standalone submit, or the Session participant's acceptance   *)
(* and handover, and its terminal under the saved cancel.                   *)
(***************************************************************************)
Submit ==
  /\ ~Coordinated /\ acc < MaxInputs
  /\ IF status = "ended"
     THEN Answer("Submit", "terminal")
     ELSE /\ acc' = acc + 1 /\ fresh' = FALSE /\ Step("Submit", "ok")
          /\ UNCHANGED <<fin, ctl, tk, part, res, hand, pend, run, ends, okReplay>>

ParticipantAccept ==
  /\ Coordinated /\ status # "ended" /\ part = "none" /\ acc < MaxInputs
  /\ part' = "input" /\ Step("ParticipantAccept", "ok")
  /\ UNCHANGED <<fin, ctl, acc, tk, res, hand, fresh, pend, run, ends, okReplay>>

Deliver ==
  /\ Coordinated /\ status # "ended" /\ part = "input"
  /\ part' = "none" /\ acc' = acc + 1 /\ fresh' = FALSE /\ Step("Deliver", "ok")
  /\ UNCHANGED <<fin, ctl, tk, res, hand, pend, run, ends, okReplay>>

ParticipantTerminal ==
  /\ Coordinated /\ status # "ended" /\ ctl = "effective" /\ part = "none"
  /\ part' = "terminal" /\ fresh' = FALSE /\ Step("ParticipantTerminal", "ok")
  /\ UNCHANGED <<fin, ctl, acc, tk, res, hand, pend, run, ends, okReplay>>

(***************************************************************************)
(* The Model call and its result (SPEC "持久性与交付责任"): the producer is *)
(* the durable custodian until the Journal holds custody or completion; it *)
(* releases its copy only after it knows the saved receipt.                 *)
(***************************************************************************)
Effect ==
  /\ "call" \in Scope /\ Coordinator /\ status = "advancing" /\ ctl # "effective"
  /\ call = "none" /\ fresh
  /\ call' = "issued" /\ Step("Effect", "ok")
  /\ UNCHANGED <<fin, ctl, inp, pcopy, tool, card, legacyRet, hand, fresh, pend, run, ends,
                 okReplay>>

Produce ==
  /\ call = "issued" /\ ~pcopy
  /\ pcopy' = TRUE /\ Step("Produce", "ok")
  /\ UNCHANGED <<fin, ctl, inp, call, tool, card, legacyRet, hand, fresh, pend, run, ends,
                 okReplay>>

\* recordResult with transfer none: the result is known, its custody still owed.
RecordNone ==
  /\ call = "issued" /\ pcopy
  /\ call' = "recorded" /\ fresh' = FALSE /\ Step("RecordNone", "ok")
  /\ UNCHANGED <<fin, ctl, inp, pcopy, tool, card, legacyRet, hand, pend, run, ends, okReplay>>

\* recordResult with transfer custody: the Journal takes custody in one commit.
Custody ==
  /\ call \in {"issued", "recorded"} /\ pcopy /\ pend.m = "none"
  /\ call' = "settled" /\ fresh' = FALSE /\ Step("Custody", "ok")
  /\ UNCHANGED <<fin, ctl, inp, pcopy, tool, card, legacyRet, hand, pend, run, ends, okReplay>>

\* The same custody write with its reply lost; the write is applied or not.
LoseCustody(applied) ==
  /\ call \in {"issued", "recorded"} /\ pcopy /\ pend.m = "none" /\ lost < MaxLost
  /\ call' = IF applied THEN "settled" ELSE call
  /\ pend' = [m |-> "Custody", r |-> "ok"] /\ lost' = lost + 1 /\ fresh' = FALSE
  /\ Step("Lose-Custody", "commit-unknown")
  /\ UNCHANGED <<fin, ctl, inp, pcopy, tool, card, legacyRet, hand, zombie, held, crashes, slot,
                 ends, okReplay>>

\* The retry of the custody write recognizes it or writes it.
RetryCustody ==
  /\ pend.m = "Custody"
  /\ call' = "settled" /\ pend' = NoPend /\ fresh' = FALSE
  /\ Step("Retry-Custody", "ok")
  /\ UNCHANGED <<fin, ctl, inp, pcopy, tool, card, legacyRet, hand, run, ends, okReplay>>

\* "release-before-custody" releases while the custody write is still unknown.
Release ==
  /\ pcopy
  /\ \/ call = "settled" /\ pend.m # "Custody"
     \/ "release-before-custody" \in Bugs /\ pend.m = "Custody"
  /\ pcopy' = FALSE /\ Step("Release", "ok")
  /\ UNCHANGED <<fin, ctl, inp, call, tool, card, legacyRet, hand, fresh, pend, run, ends,
                 okReplay>>

Custodians ==
  (IF pcopy /\ call # "settled" THEN {"producer"} ELSE {})
  \cup (IF call = "settled" THEN {"journal"} ELSE {})
ResultExists == pcopy \/ call \in {"recorded", "settled"}

(***************************************************************************)
(* The custody variants of commitSettlement (reconcile qualification, also  *)
(* after the end; they merge original facts only).                          *)
(***************************************************************************)
ToolIntent ==
  /\ "tool" \in Scope /\ Coordinator /\ status = "advancing" /\ ctl # "effective"
  /\ tool = "none" /\ fresh
  /\ tool' = "unknown" /\ Step("ToolIntent", "ok")
  /\ UNCHANGED <<fin, ctl, inp, call, pcopy, card, legacyRet, hand, fresh, pend, run, ends,
                 okReplay>>

RecordToolAssociation ==
  /\ tool = "unknown"
  /\ tool' = "held" /\ fresh' = FALSE /\ Step("RecordToolAssociation", "ok")
  /\ UNCHANGED <<fin, ctl, inp, call, pcopy, card, legacyRet, hand, pend, run, ends, okReplay>>

CardAsk ==
  /\ "card" \in Scope /\ Coordinator /\ status = "advancing" /\ ctl # "effective"
  /\ card = "none" /\ fresh
  /\ card' = "unknown" /\ Step("CardAsk", "ok")
  /\ UNCHANGED <<fin, ctl, inp, call, pcopy, tool, legacyRet, hand, fresh, pend, run, ends,
                 okReplay>>

RecordCardReconciliation ==
  /\ card = "unknown"
  /\ card' = "held" /\ fresh' = FALSE /\ Step("RecordCardReconciliation", "ok")
  /\ UNCHANGED <<fin, ctl, inp, call, pcopy, tool, legacyRet, hand, pend, run, ends, okReplay>>

RecordLegacyReturn ==
  /\ legacyRet = "inflight"
  /\ legacyRet' = "held" /\ fresh' = FALSE /\ Step("RecordLegacyReturn", "ok")
  /\ UNCHANGED <<fin, ctl, inp, call, pcopy, tool, card, hand, pend, run, ends, okReplay>>

(***************************************************************************)
(* Message admission (SPEC "消息准入", "准入结果保管"): P saves the request *)
(* and sets currentHandoff; the provider prepares, rejects or excludes; Ja  *)
(* resolves or retires and clears the pointer; Rh only records the outcome. *)
(***************************************************************************)
P(h) ==
  /\ Coordinator /\ status = "advancing" /\ ctl # "effective" /\ ptr = NoH
  /\ hist[h] = "none"
  /\ h = "h2" => hist["h1"] = "na" /\ pv["h1"] = "excluded"
  /\ IF ~fresh THEN Answer("P-" \o h, "failure-changed")
     ELSE /\ ptr' = h /\ hist' = [hist EXCEPT ![h] = "pending"] /\ Step("P-" \o h, "ok")
          /\ UNCHANGED <<fin, ctl, inp, res, pv, rh, fresh, pend, run, ends, okReplay>>

ProviderPrepare(h, d) ==
  /\ hist[h] = "pending" /\ pv[h] = "none"
  /\ pv' = [pv EXCEPT ![h] = d] /\ Step("Provider-" \o d \o "-" \o h, "ok")
  /\ UNCHANGED <<fin, ctl, inp, res, hist, rh, ptr, fresh, pend, run, ends, okReplay>>

\* MessageHandoff.exclude of an H without an outcome: the provider closes it.
Exclude(h) ==
  /\ h = "h1" /\ hist[h] = "pending" /\ pv[h] = "none"
  /\ pv' = [pv EXCEPT ![h] = "excluded"] /\ Step("Exclude-" \o h, "ok")
  /\ UNCHANGED <<fin, ctl, inp, res, hist, rh, ptr, fresh, pend, run, ends, okReplay>>

\* Ja resolve publishes the history or the rejection with the pointer cleared; a commit at the
\* advancing position, so it leaves settling.
JaResolve(h) ==
  /\ Coordinator /\ status # "ended" /\ ctl # "effective" /\ ptr = h
  /\ pv[h] \in {"prepared", "rejected"} /\ hist[h] = "pending"
  /\ IF ~fresh THEN Answer("Ja-" \o h, "failure-changed")
     ELSE /\ ptr' = NoH /\ status' = "advancing"
          /\ hist' = [hist EXCEPT ![h] = IF pv[h] = "prepared" THEN "committed" ELSE "na"]
          /\ list' = IF pv[h] = "prepared" THEN Emitted ELSE list
          /\ Step("Ja-" \o h, "ok")
          /\ UNCHANGED <<cand, nf1, judg, ctl, inp, res, pv, rh, fresh, pend, run, ends,
                         okReplay>>

\* Ja retire: an excluded internal H leaves the pointer; a successor P may follow.
JaRetire(h) ==
  /\ Coordinator /\ status # "ended" /\ ctl # "effective" /\ ptr = h
  /\ pv[h] = "excluded" /\ hist[h] = "pending"
  /\ IF ~fresh THEN Answer("Retire-" \o h, "failure-changed")
     ELSE /\ ptr' = NoH /\ status' = "advancing" /\ hist' = [hist EXCEPT ![h] = "na"]
          /\ Step("Retire-" \o h, "ok")
          /\ UNCHANGED <<cand, nf1, list, judg, ctl, inp, res, pv, rh, fresh, pend, run, ends,
                         okReplay>>

\* Rh merges the outcome or the exclusion into the execution, before or after the end; the
\* history stays unpublished. "rh-moves-pointer" also clears currentHandoff.
Rh(h) ==
  /\ pv[h] # "none" /\ ~rh[h] /\ hist[h] \in {"pending", "retained"}
  /\ rh' = [rh EXCEPT ![h] = TRUE]
  /\ hist' = [hist EXCEPT ![h] = IF pv[h] = "prepared" THEN hist[h] ELSE "na"]
  /\ ptr' = IF "rh-moves-pointer" \in Bugs /\ ptr = h THEN NoH ELSE ptr
  /\ fresh' = FALSE /\ Step("Rh-" \o h, "ok")
  /\ UNCHANGED <<fin, ctl, inp, res, pv, pend, run, ends, okReplay>>

(***************************************************************************)
(* Crashes, takeover, stale writers, held writes and a new Run.             *)
(***************************************************************************)
\* The coordinator crashes and a new attachment takes over: the attach fences every held write
\* of the execution, supersedes the old attachment and returns the execution to reconciling
\* (SPEC "四种控制", "恢复与接管"); the model does not tell reconciling from advancing.
Takeover ==
  /\ status # "ended" /\ crashes < MaxCrashes
  /\ crashes' = crashes + 1 /\ zombie' = TRUE /\ held' = FALSE /\ fresh' = FALSE
  /\ status' = "advancing"
  /\ Step("Takeover", "ok")
  /\ UNCHANGED <<cand, nf1, list, judg, ctl, inp, res, hand, pend, lost, slot, ends, okReplay>>

\* The superseded attachment tries a new advancing write.
StaleWrite == zombie /\ Answer("StaleWrite", "stale-advance")

\* A write of the execution held undecided, then decided by its provider.
Hold ==
  /\ "held" \in Scope /\ status # "ended" /\ ~held /\ lost < MaxLost
  /\ held' = TRUE /\ lost' = lost + 1 /\ fresh' = FALSE /\ Step("Hold", "commit-unknown")
  /\ UNCHANGED <<fin, ctl, inp, res, hand, pend, zombie, crashes, slot, ends, okReplay>>

Decide ==
  /\ held
  /\ held' = FALSE /\ fresh' = FALSE /\ Step("Decide", "ok")
  /\ UNCHANGED <<fin, ctl, inp, res, hand, pend, zombie, crashes, lost, slot, ends, okReplay>>

\* After the cancel the Session opens a new Run of the session; it takes the run slot.
NewRun ==
  /\ "newrun" \in Scope /\ ctl = "effective" /\ slot = "old"
  /\ slot' = "new" /\ Step("NewRun", "ok")
  /\ UNCHANGED <<fin, ctl, inp, res, hand, fresh, pend, zombie, held, crashes, lost, ends,
                 okReplay>>

(***************************************************************************)
(* The specifications.                                                      *)
(***************************************************************************)
Next ==
  \/ TakeInputs \/ F1("complete") \/ F1("failed") \/ F2 \/ Prepare \/ TryFinish \/ Load
  \/ Establish \/ Migrate \/ Judge \/ LoseTryFinish \/ LosePrepare \/ LoseJudge \/ Retry
  \/ Cancel \/ Intent("unresolved") \/ Intent("reached") \/ IntentAfterEnd
  \/ Submit \/ ParticipantAccept \/ Deliver \/ ParticipantTerminal
  \/ Effect \/ Produce \/ RecordNone \/ Custody \/ LoseCustody(TRUE) \/ LoseCustody(FALSE)
  \/ RetryCustody \/ Release
  \/ ToolIntent \/ RecordToolAssociation \/ CardAsk \/ RecordCardReconciliation
  \/ RecordLegacyReturn
  \/ \E h \in Hs : \/ P(h) \/ JaResolve(h) \/ JaRetire(h) \/ Rh(h) \/ Exclude(h)
                   \/ ProviderPrepare(h, "prepared") \/ ProviderPrepare(h, "rejected")
  \/ Takeover \/ StaleWrite \/ Hold \/ Decide \/ NewRun

\* The steps the replay driver maps onto Journal calls (../formal-mapping.md, "回放映射").
ReplayNext ==
  \/ TakeInputs \/ F1("complete") \/ F1("failed") \/ F2 \/ Prepare \/ TryFinish \/ Load
  \/ Establish \/ Judge \/ LoseTryFinish \/ LosePrepare \/ LoseJudge \/ Retry
  \/ Cancel \/ Intent("unresolved") \/ Intent("reached") \/ IntentAfterEnd \/ Submit
  \/ Effect \/ Produce \/ RecordNone \/ Custody
  \/ \E h \in Hs : h = "h1" /\ (P(h) \/ JaResolve(h) \/ ProviderPrepare(h, "prepared"))
  \/ Takeover \/ StaleWrite

\* Weak fairness on every recovery and settlement step, and on what the environment owes.
Fairness ==
  /\ WF_vars(Load) /\ WF_vars(Establish) /\ WF_vars(Migrate) /\ WF_vars(Judge)
  /\ WF_vars(F2) /\ WF_vars(Prepare) /\ WF_vars(TryFinish) /\ WF_vars(Retry)
  /\ WF_vars(RetryCustody)
  /\ WF_vars(Intent("reached")) /\ WF_vars(Deliver)
  /\ WF_vars(Produce) /\ WF_vars(Custody) /\ WF_vars(RecordToolAssociation)
  /\ WF_vars(RecordCardReconciliation) /\ WF_vars(RecordLegacyReturn) /\ WF_vars(Decide)
  /\ \A h \in Hs : WF_vars(ProviderPrepare(h, "prepared")) /\ WF_vars(Rh(h))

Spec == Init /\ [][Next]_vars
LiveSpec == Spec /\ Fairness
TraceSpec == Init /\ [][ReplayNext]_vars

(***************************************************************************)
(* Properties: the eight safety properties of the ruling, a type invariant  *)
(* and one liveness property.                                               *)
(***************************************************************************)
TypeOK ==
  /\ status \in {"advancing", "settling", "ended"}
  /\ ctl \in {"none", "accepted", "unresolved", "effective"}
  /\ acc \in 1..MaxInputs /\ tk \in 0..acc /\ nf1 \in 0..MaxF1
  /\ cand.concl \in {"none", "complete", "failed", "cancelled"}
  /\ cand.route \in {"none", "author", "cancellation"}
  /\ call \in {"none", "issued", "recorded", "settled"}
  /\ ptr \in Hs \cup {NoH}
  /\ endc \in {"none", "complete", "failed", "cancelled"}

\* S1: an execution with a pending responsibility does not end.
NoEndWithPending == status = "ended" => "pending" \notin final

\* S2: an unknown is neither an end nor a block: tryFinish does not end over an unknown, a block
\* names a determined pending responsibility, and a judgment over an unknown is unknown.
UnknownNotBlockedOrEnded == okUnknown /\ (status = "ended" => "unknown" \notin final)

\* S3: an effective cancel takes precedence over an ordinary completion or failure.
CancelFirst == status = "ended" /\ ctl = "effective" => endc = "cancelled"

\* S4: a candidate of an execution that is not settling does not end the execution.
NoEndOutsideSettling == okStale

\* S5: tryFinish uses a cancellation judgment only while its input equals the current closure.
NoStaleJudgment == okJudgment

\* S6: currentHandoff is set only by P and cleared or moved only by Ja (resolve or retire).
\* It reads act', so it is checked only in configurations with Observe = TRUE.
PointerByJa ==
  [][ptr' # ptr =>
       \/ ptr = NoH /\ act' \in {"P-" \o h : h \in Hs}
       \/ ptr # NoH /\ act' \in {"Ja-" \o h : h \in Hs} \cup {"Retire-" \o h : h \in Hs}]_vars

\* S7: a result has exactly one durable custodian at any time.
OneCustodian == ResultExists => Cardinality(Custodians) = 1

\* S8: the retry of the same operation with the same input answers the original result.
ReplayOriginal == okReplay

\* L1: under the fairness of LiveSpec an effective cancel settles: the execution ends.
CancelSettles == (ctl = "effective") ~> (status = "ended")

\* The goals of the simulation runs that export replay traces: each is violated in the state
\* the trace should reach.
NotEndedOrdinary == ~(status = "ended" /\ endc \in {"complete", "failed"})
NotEndedComplete == ~(status = "ended" /\ endc = "complete")
NotEndedCancelled == ~(status = "ended" /\ endc = "cancelled")
=============================================================================

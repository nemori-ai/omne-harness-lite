----------------------- MODULE ContinuationComposition -----------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Bad
Rounds == 0..1
Cards == {"a","b"}
Positions == Rounds \X Cards
VARIABLES round, outcomes, judged, answers, inbox, received, evalCount, advances,
          terminal, authority, online, generation, bound, illegalAdvance
vars == <<round,outcomes,judged,answers,inbox,received,evalCount,advances,
          terminal,authority,online,generation,bound,illegalAdvance>>
Init == /\ round = 0 /\ outcomes = [p \in Positions |-> "undecided"] /\ judged = {} /\ answers = {} /\ inbox = {} /\ received = {}
        /\ evalCount = [p \in Positions |-> 0] /\ advances = [r \in Rounds |-> 0]
        /\ terminal = FALSE /\ authority = TRUE /\ online = TRUE
        /\ generation = 0 /\ bound = 0 /\ illegalAdvance = FALSE
Judge(c,k) == LET p == <<round,c>> IN
  /\ round \in Rounds /\ online /\ ~terminal /\ p \notin judged /\ evalCount[p] < 2
  /\ (round # 0 \/ k = "ask")
  /\ outcomes' = [outcomes EXCEPT ![p] = k]
  /\ judged' = judged \cup {p} /\ evalCount' = [evalCount EXCEPT ![p] = @ + 1]
  /\ UNCHANGED <<round,answers,inbox,received,advances,terminal,authority,online,generation,bound,illegalAdvance>>
Answer(c) == LET p == <<round,c>> IN
  /\ round \in Rounds /\ ~terminal /\ authority /\ p \in judged /\ outcomes[p] = "ask" /\ p \notin answers
  /\ answers' = answers \cup {p} /\ inbox' = inbox \cup {p}
  /\ UNCHANGED <<round,outcomes,judged,received,evalCount,advances,terminal,authority,online,generation,bound,illegalAdvance>>
Receive(c,g) == LET p == <<round,c>> IN
  /\ round \in Rounds /\ online /\ bound = generation /\ g = generation
  /\ p \in inbox /\ p \notin received
  /\ received' = received \cup {p}
  /\ UNCHANGED <<round,outcomes,judged,answers,inbox,evalCount,advances,terminal,authority,online,generation,bound,illegalAdvance>>
ReadyAt(r) == \A c \in Cards: <<r,c>> \in judged /\ (outcomes[<<r,c>>] # "ask" \/ <<r,c>> \in received)
Ready == ReadyAt(round)
AdmittedReady == \A c \in Cards: (<<round,c>> \in judged \/ Bad = "judgments") /\ (outcomes[<<round,c>>] # "ask" \/ <<round,c>> \in received \/ Bad = "answers")
Advance(g) ==
  /\ round \in Rounds /\ online /\ bound = generation
  /\ Bad # "stall" /\ AdmittedReady /\ (~terminal \/ Bad = "terminal")
  /\ (authority \/ Bad = "authority") /\ (g = generation \/ Bad = "stale")
  /\ advances[round] < 2
  /\ advances' = [advances EXCEPT ![round] = @ + 1]
  /\ illegalAdvance' = (illegalAdvance \/ ~Ready \/ terminal \/ ~authority \/ g # generation)
  /\ round' = IF Bad = "duplicate" THEN round ELSE round + 1
  /\ UNCHANGED <<outcomes,judged,answers,inbox,received,evalCount,terminal,authority,online,generation,bound>>
End == /\ ~terminal /\ terminal' = TRUE
       /\ UNCHANGED <<round,outcomes,judged,answers,inbox,received,evalCount,advances,authority,online,generation,bound,illegalAdvance>>
Withdraw == /\ authority /\ authority' = FALSE
            /\ UNCHANGED <<round,outcomes,judged,answers,inbox,received,evalCount,advances,terminal,online,generation,bound,illegalAdvance>>
Crash == /\ online /\ generation = 0 /\ online' = FALSE /\ generation' = 1 /\ bound' = 2
         /\ judged' = IF Bad = "replay" THEN {} ELSE judged
         /\ UNCHANGED <<round,outcomes,answers,inbox,received,evalCount,advances,terminal,authority,illegalAdvance>>
Recover == /\ ~online /\ online' = TRUE
           /\ UNCHANGED <<round,outcomes,judged,answers,inbox,received,evalCount,advances,terminal,authority,generation,bound,illegalAdvance>>
Bind == /\ online /\ bound # generation /\ bound' = generation
        /\ UNCHANGED <<round,outcomes,judged,answers,inbox,received,evalCount,advances,terminal,authority,online,generation,illegalAdvance>>
Next == (\E c \in Cards,k \in {"allow","ask","deny"}: Judge(c,k))
        \/ (\E c \in Cards: Answer(c))
        \/ (\E c \in Cards,g \in 0..1: Receive(c,g))
        \/ (\E g \in 0..1: Advance(g)) \/ End \/ Withdraw \/ Crash \/ Recover \/ Bind \/ UNCHANGED vars
SafeAdvance == ~illegalAdvance
OnceAdvance == \A r \in Rounds: advances[r] <= 1
RecordedJudgmentNotRepeated == \A p \in Positions: evalCount[p] <= 1
AnswerCustody == answers \subseteq inbox /\ received \subseteq inbox
CurrentAdvance == Advance(generation)
ReadyProgress == \A r \in Rounds: (round = r /\ ReadyAt(r) /\ ~terminal /\ authority) ~> (round > r \/ terminal \/ ~authority)
Spec == Init /\ [][Next]_vars /\ WF_vars(Recover) /\ WF_vars(Bind) /\ WF_vars(CurrentAdvance)
=============================================================================

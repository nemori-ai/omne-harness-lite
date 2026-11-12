-------------------------- MODULE HumanDecision --------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Bad
Cards == {"a", "b"}
Answers == {"yes", "text"}
VARIABLES live, held, qualified, decisions, inbox, consumed,
          qualifiedAtCommit, terminalAtCommit, foreignCommit, online
vars == <<live, held, qualified, decisions, inbox, consumed,
          qualifiedAtCommit, terminalAtCommit, foreignCommit, online>>
Init == /\ live = [c \in Cards |-> TRUE]
        /\ held = {}
        /\ qualified = TRUE
        /\ decisions = [c \in Cards |-> {}]
        /\ inbox = {}
        /\ consumed = [c \in Cards |-> 0]
        /\ qualifiedAtCommit = TRUE
        /\ terminalAtCommit = FALSE
        /\ foreignCommit = FALSE
        /\ online = TRUE
Reserve(c) == /\ online /\ qualified /\ live[c] /\ decisions[c] = {}
              /\ c \notin held /\ held' = held \cup {c}
              /\ UNCHANGED <<live, qualified, decisions, inbox, consumed,
                   qualifiedAtCommit, terminalAtCommit, foreignCommit, online>>
Commit(c,d,t) ==
  /\ online
  /\ (c \in held \/ Bad = "qualification")
  /\ (live[c] \/ Bad = "revival")
  /\ (decisions[c] = {} \/ Bad = "unique")
  /\ (t = "own" \/ Bad = "tenant")
  /\ d \notin decisions[c]
  /\ decisions' = [decisions EXCEPT ![c] = @ \cup {d}]
  /\ inbox' = IF Bad = "custody" THEN inbox ELSE inbox \cup {c}
  /\ qualifiedAtCommit' = (qualifiedAtCommit /\ qualified)
  /\ terminalAtCommit' = (terminalAtCommit \/ ~live[c])
  /\ foreignCommit' = (foreignCommit \/ t # "own")
  /\ UNCHANGED <<live, held, qualified, consumed, online>>
Seal(c) == /\ c \in held /\ held' = held \ {c}
           /\ UNCHANGED <<live, qualified, decisions, inbox, consumed,
                qualifiedAtCommit, terminalAtCommit, foreignCommit, online>>
Revoke == /\ qualified /\ held = {} /\ qualified' = FALSE
          /\ UNCHANGED <<live, held, decisions, inbox, consumed,
               qualifiedAtCommit, terminalAtCommit, foreignCommit, online>>
Invalidate(c) == /\ live[c] /\ live' = [live EXCEPT ![c] = FALSE]
                 /\ UNCHANGED <<held, qualified, decisions, inbox, consumed,
                      qualifiedAtCommit, terminalAtCommit, foreignCommit, online>>
Consume(c) == /\ online /\ live[c] /\ c \in inbox
              /\ (consumed[c] = 0 \/ Bad = "consume") /\ consumed[c] < 2
              /\ consumed' = [consumed EXCEPT ![c] = @ + 1]
              /\ UNCHANGED <<live, held, qualified, decisions, inbox,
                   qualifiedAtCommit, terminalAtCommit, foreignCommit, online>>
Crash == /\ online /\ online' = FALSE
         /\ UNCHANGED <<live, held, qualified, decisions, inbox, consumed,
              qualifiedAtCommit, terminalAtCommit, foreignCommit>>
Recover == /\ ~online /\ online' = TRUE
           /\ UNCHANGED <<live, held, qualified, decisions, inbox, consumed,
                qualifiedAtCommit, terminalAtCommit, foreignCommit>>
Next == (\E c \in Cards: Reserve(c) \/ Seal(c) \/ Invalidate(c) \/ Consume(c))
        \/ (\E c \in Cards,d \in Answers,t \in {"own","foreign"}: Commit(c,d,t))
        \/ Revoke \/ Crash \/ Recover \/ UNCHANGED vars
TypeOK == /\ live \in [Cards -> BOOLEAN] /\ held \subseteq Cards
          /\ decisions \in [Cards -> SUBSET Answers] /\ inbox \subseteq Cards
          /\ consumed \in [Cards -> 0..2]
UniqueDecision == \A c \in Cards: Cardinality(decisions[c]) <= 1
Custody == \A c \in Cards: decisions[c] # {} => c \in inbox
NoRevival == ~terminalAtCommit
QualifiedDecision == qualifiedAtCommit
TenantIsolation == ~foreignCommit
OnceConsumption == \A c \in Cards: consumed[c] <= 1
Spec == Init /\ [][Next]_vars
=============================================================================

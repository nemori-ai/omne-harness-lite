--------------------------- MODULE RecallAtCommit ---------------------------
(* Calls of one operation commit it without a query first. The operation has
   generations: a caller sends generation g, and goes to g + 1 only when g has a
   rollback receipt of an earlier call. The storage is the authority: before it
   executes a commit it recognises a receipt of the same identity and answers
   it, marked as recalled. An answer without the mark is the receipt of the
   execution of this call. A caller whose answer is lost knows nothing, and
   asks the storage before it sends again. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Calls,        \* the calls of the operation: retries, also of another process
          Gens,         \* 1..G
          NoMark,       \* negative control: the answer does not say "recalled"; a caller takes every receipt for its own
          BlindRetry    \* negative control: after a lost answer the caller sends the next generation without a query

VARIABLES receipt,   \* [Gens -> {"none", "committed", "rolled_back"}]: the receipts in the storage
          effects,   \* how many times the write of the operation took effect
          gen,       \* [Calls -> Gens]: the generation a call is at
          phase,     \* [Calls -> {"idle", "sent", "lost", "done"}]
          belief,    \* [Calls -> {"none", "own", "recalled", "rolled_back"}]: what the call takes its outcome for
          ran        \* [Calls -> BOOLEAN]: whether the execution of this call wrote the committed receipt

vars == <<receipt, effects, gen, phase, belief, ran>>
Last == CHOOSE g \in Gens : \A h \in Gens : h <= g

Init == /\ receipt = [g \in Gens |-> "none"] /\ effects = 0
        /\ gen = [c \in Calls |-> 1] /\ phase = [c \in Calls |-> "idle"]
        /\ belief = [c \in Calls |-> "none"] /\ ran = [c \in Calls |-> FALSE]

Send(c) == /\ phase[c] = "idle"
           /\ phase' = [phase EXCEPT ![c] = "sent"]
           /\ UNCHANGED <<receipt, effects, gen, belief, ran>>

(* What the caller does with an answer that reached it. `mark` is TRUE for a recalled receipt. *)
Take(c, kind, mark) ==
  LET recalled == mark /\ ~NoMark IN
  IF kind = "committed"
    THEN /\ belief' = [belief EXCEPT ![c] = IF recalled THEN "recalled" ELSE "own"]
         /\ phase' = [phase EXCEPT ![c] = "done"] /\ UNCHANGED gen
    ELSE IF recalled /\ gen[c] # Last
      THEN \* a rollback of an earlier call: this generation is spent
           /\ gen' = [gen EXCEPT ![c] = @ + 1]
           /\ phase' = [phase EXCEPT ![c] = "idle"] /\ UNCHANGED belief
      ELSE /\ belief' = [belief EXCEPT ![c] = "rolled_back"]
           /\ phase' = [phase EXCEPT ![c] = "done"] /\ UNCHANGED gen

(* The storage takes the commit of `c`. `answered` is FALSE when the answer is lost. *)
Commit(c, answered) ==
  /\ phase[c] = "sent"
  /\ LET g == gen[c] IN
     IF receipt[g] # "none"
       THEN \* recognised before execution: nothing runs
            /\ UNCHANGED <<receipt, effects, ran>>
            /\ IF answered THEN Take(c, receipt[g], TRUE)
                           ELSE /\ phase' = [phase EXCEPT ![c] = "lost"] /\ UNCHANGED <<gen, belief>>
       ELSE \E outcome \in {"committed", "rolled_back"} :
            /\ receipt' = [receipt EXCEPT ![g] = outcome]
            /\ effects' = IF outcome = "committed" THEN effects + 1 ELSE effects
            /\ ran' = [ran EXCEPT ![c] = outcome = "committed"]
            /\ IF answered THEN Take(c, outcome, FALSE)
                           ELSE /\ phase' = [phase EXCEPT ![c] = "lost"] /\ UNCHANGED <<gen, belief>>

(* The commit never reached the storage, and the caller cannot tell. *)
Drop(c) == /\ phase[c] = "sent"
           /\ phase' = [phase EXCEPT ![c] = "lost"]
           /\ UNCHANGED <<receipt, effects, gen, belief, ran>>

(* After a lost answer: the caller asks the storage about its generation. *)
Query(c) ==
  /\ phase[c] = "lost" /\ ~BlindRetry
  /\ LET g == gen[c] IN
     IF receipt[g] = "none"
       THEN /\ phase' = [phase EXCEPT ![c] = "idle"] /\ UNCHANGED <<gen, belief>>
       ELSE Take(c, receipt[g], TRUE)
  /\ UNCHANGED <<receipt, effects, ran>>

BlindNext(c) == /\ phase[c] = "lost" /\ BlindRetry /\ gen[c] # Last
                /\ gen' = [gen EXCEPT ![c] = @ + 1]
                /\ phase' = [phase EXCEPT ![c] = "idle"]
                /\ UNCHANGED <<receipt, effects, belief, ran>>

Next == \E c \in Calls : \/ Send(c) \/ Commit(c, TRUE) \/ Commit(c, FALSE) \/ Drop(c)
                         \/ Query(c) \/ BlindNext(c)
Spec == Init /\ [][Next]_vars

(* The write of the operation takes effect at most once, over all generations and calls. *)
AtMostOnce == effects <= 1

(* A call that takes the committed receipt for its own did the write. *)
OwnIsOwn == \A c \in Calls : belief[c] = "own" => ran[c]

(* A call that takes the receipt for recalled did not do the write in the call that got it. At
   most one call does the write. *)
OneWriter == Cardinality({c \in Calls : ran[c]}) <= 1
=============================================================================

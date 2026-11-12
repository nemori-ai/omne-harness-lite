----------------------------- MODULE InputSubmitOnce -----------------------------
(* One pending input, two triggers of Session's continuation at once.                   *)
(*                                                                                       *)
(* The accept trigger (the local wake after SE11) and the recovery scan both run the     *)
(* continuation step for the same input: read the snapshot, submit when the input is    *)
(* still pending without SE35, then write SE35. The execution record recognizes a       *)
(* submit by the input identity (I-R3): the same identity with the same content is the  *)
(* original acceptance, not a second one. The SE35 write is conditional: the reducer    *)
(* takes it only while the input is pending and has no SE35. The Agent takes the        *)
(* accepted inputs once, at a step boundary.                                            *)
(*                                                                                       *)
(* `Bug` drops one design rule; "none" is the design.                                   *)
(*   "fresh-identity": a trigger submits under an identity of its own (a new operation  *)
(*                     and input id per trigger), so the record cannot recognize it.    *)
(*   "blind-receipt":  the SE35 write is not conditional on the snapshot.               *)
EXTENDS Naturals, FiniteSets

CONSTANTS Triggers, Bug

ASSUME Bug \in {"none", "fresh-identity", "blind-receipt"}

VARIABLES
  pc,        \* per trigger: "read", "submit", "receipt", "done"
  accepted,  \* identities the execution record accepted
  receipts,  \* how many SE35 entries were written
  taken,     \* identities the Agent took
  pending    \* the input is still pending (no SE14 yet)

vars == <<pc, accepted, receipts, taken, pending>>

(* The identity a trigger submits under: the input's own, unless "fresh-identity".     *)
Identity(t) == IF Bug = "fresh-identity" THEN t ELSE "input"

Identities == Triggers \cup {"input"}

TypeOK ==
  /\ pc \in [Triggers -> {"read", "submit", "receipt", "done"}]
  /\ accepted \subseteq Identities /\ taken \subseteq Identities
  /\ receipts \in 0..2 /\ pending \in BOOLEAN

Init ==
  /\ pc = [t \in Triggers |-> "read"]
  /\ accepted = {} /\ receipts = 0 /\ taken = {} /\ pending = TRUE

(* The snapshot: pending without SE35. The trigger goes on only if so.                  *)
Read(t) ==
  /\ pc[t] = "read"
  /\ pc' = [pc EXCEPT ![t] = IF pending /\ receipts = 0 THEN "submit" ELSE "done"]
  /\ UNCHANGED <<accepted, receipts, taken, pending>>

(* The record accepts a new identity once and recognizes a known one.                  *)
Submit(t) ==
  /\ pc[t] = "submit"
  /\ accepted' = accepted \cup {Identity(t)}
  /\ pc' = [pc EXCEPT ![t] = "receipt"]
  /\ UNCHANGED <<receipts, taken, pending>>

(* SE35: the reducer takes it only while pending without SE35, unless "blind-receipt". *)
Receipt(t) ==
  /\ pc[t] = "receipt"
  /\ receipts' = IF Bug = "blind-receipt" \/ (pending /\ receipts = 0)
                   THEN receipts + 1 ELSE receipts
  /\ pc' = [pc EXCEPT ![t] = "done"]
  /\ UNCHANGED <<accepted, taken, pending>>

(* I0 takes every accepted identity not yet taken; Session's SE14 ends pending.        *)
Take ==
  /\ accepted \ taken # {}
  /\ taken' = taken \cup accepted
  /\ pending' = FALSE
  /\ UNCHANGED <<pc, accepted, receipts>>

Next == (\E t \in Triggers : Read(t) \/ Submit(t) \/ Receipt(t)) \/ Take

Spec == Init /\ [][Next]_vars

(* I-R3: the input is accepted once and taken once, and has at most one SE35.          *)
AcceptOnce == Cardinality(accepted) <= 1
TakeOnce == Cardinality(taken) <= 1
OneReceipt == receipts <= 1
=====================================================================================

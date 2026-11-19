----------------------------- MODULE CallItems -----------------------------
(* The call records of one session. The log is the truth: the record of a call is
   the reduction of the entries that name it. The work snapshot holds the open
   calls only. A call leaves the snapshot when the open rule stops holding, and it
   never comes back: a late legal fact is written to the log and indexed under the
   call, and the snapshot does not change. A question by key about a call that is
   not in the snapshot is answered by reducing its indexed entries again.

   `ref` is the reference: every call kept in the snapshot for ever, as the code
   did before. The model checks that a question by key gets the same record from
   the open view or the entries as from the reference, so every decision that reads
   one call decides the same. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Calls, Versions,
          Forget,       \* negative control: a fact about a call that is not in the snapshot is taken as a new call
          DropLate      \* negative control: a late fact about a closed call is not indexed

VARIABLES alive,     \* the Run that started the calls has no terminal yet
          ref,       \* reference: call -> record, never dropped
          open,      \* the snapshot: the set of open calls and their records
          records,
          idx,       \* storage: call -> the entries that name it
          waits, background, controlled,   \* snapshot lists that keep a call open
          closed     \* the calls that left the snapshot

vars == <<alive, ref, open, records, idx, waits, background, controlled, closed>>

Blank == [reg |-> "none", res |-> [v \in Versions |-> "none"], rel |-> {}]

(* The record of a call from its entries: the same reduction, on this call alone. *)
FromEntries(es) ==
  [reg |-> IF \E e \in es : e.k = "assoc" THEN "assoc"
           ELSE IF \E e \in es : e.k = "intent" THEN "intent" ELSE "none",
   res |-> [v \in Versions |->
             IF [k |-> "process", v |-> v] \in es THEN "processed"
             ELSE IF [k |-> "result", v |-> v] \in es THEN "seen" ELSE "none"],
   rel |-> {v \in Versions : [k |-> "release", v |-> v] \in es}]

(* What a question by key gets. *)
View(c) == IF c \in open THEN records[c] ELSE FromEntries(idx[c])

Init == /\ alive = TRUE
        /\ ref = [c \in Calls |-> Blank]
        /\ open = {} /\ records = [c \in Calls |-> Blank]
        /\ idx = [c \in Calls |-> {}]
        /\ waits = {} /\ background = {} /\ controlled = {} /\ closed = {}

(* The open rule: a pure function of the open view. *)
Open(c, rec, runAlive, ws, bg, ctl) ==
  \/ rec.reg = "intent" /\ runAlive
  \/ c \in ws
  \/ rec.reg = "assoc" /\ \A v \in Versions : rec.res[v] = "none"
  \/ /\ rec.reg = "assoc" /\ runAlive
     /\ \E v \in Versions : rec.res[v] = "seen"
     /\ \A v \in Versions : rec.res[v] # "processed"
  \/ c \in bg
  \/ c \in ctl

(* After every entry the snapshot keeps the calls the rule still holds for. *)
Settle(o, rs, runAlive, ws, bg, ctl) == {c \in o : Open(c, rs[c], runAlive, ws, bg, ctl)}

(* One fact that names one call. `e` is the entry, `next` the record after it. The reference
   takes the entry always; the snapshot takes it while the call is open (or opens with it);
   the index takes it always. *)
Write(c, e, next, ws, bg, ctl) ==
  LET wasClosed == c \in closed
      opening == ~wasClosed /\ c \notin open
      held == (c \in open \/ opening) \/ (Forget /\ wasClosed)
      o1 == IF held THEN open \cup {c} ELSE open
      rs1 == IF Forget /\ wasClosed THEN [records EXCEPT ![c] = FromEntries({e})]
             ELSE IF held THEN [records EXCEPT ![c] = next] ELSE records
      o2 == Settle(o1, rs1, alive, ws, bg, ctl)
  IN /\ ref' = [ref EXCEPT ![c] = next]
     /\ idx' = IF DropLate /\ wasClosed THEN idx ELSE [idx EXCEPT ![c] = idx[c] \cup {e}]
     /\ open' = o2 /\ records' = rs1
     /\ closed' = closed \cup (o1 \ o2)
     /\ waits' = ws /\ background' = bg /\ controlled' = ctl
     /\ UNCHANGED alive

Entry(k) == [k |-> k, v |-> 0]

Intent(c) == LET r == View(c) IN
  /\ r.reg = "none" /\ alive
  /\ Write(c, Entry("intent"), [r EXCEPT !.reg = "intent"], waits, background, controlled)

(* A registration with a producer: new, or the association of an intent of the live Run. *)
Associate(c) == LET r == View(c) IN
  /\ r.reg = "none" \/ (r.reg = "intent" /\ alive /\ c \in open)
  /\ Write(c, Entry("assoc"), [r EXCEPT !.reg = "assoc"], waits, background, controlled)

(* The same registration again, under another operation: it is the original one, and nothing changes. *)
Rebind(c) == LET r == View(c) IN
  /\ r.reg = "assoc"
  /\ Write(c, Entry("assoc"), r, waits, background, controlled)

Wait(c) == LET r == View(c) IN
  /\ r.reg # "none" /\ alive /\ c \notin waits
  /\ \A v \in Versions : r.res[v] # "processed"
  /\ Write(c, Entry("wait"), r, waits \cup {c}, background, controlled)

(* A result version: at any time, also long after the call left the snapshot. *)
Result(c, v) == LET r == View(c) IN
  /\ r.reg = "assoc" /\ r.res[v] = "none"
  /\ Write(c, [k |-> "result", v |-> v], [r EXCEPT !.res[v] = "seen"], waits, background, controlled)

Process(c, v) == LET r == View(c) IN
  /\ r.reg = "assoc" /\ r.res[v] = "seen" /\ alive
  /\ Write(c, [k |-> "process", v |-> v], [r EXCEPT !.res[v] = "processed"],
           waits \ {c}, background, controlled)

Release(c, v) == LET r == View(c) IN
  /\ r.res[v] = "processed" /\ v \notin r.rel
  /\ Write(c, [k |-> "release", v |-> v], [r EXCEPT !.rel = r.rel \cup {v}],
           waits, background, controlled)

ToBackground(c) == LET r == View(c) IN
  /\ r.reg = "assoc" /\ c \in open /\ c \in waits /\ c \notin background
  /\ Write(c, Entry("background"), r, waits, background \cup {c}, controlled)

BackgroundSettled(c) == LET r == View(c) IN
  /\ c \in background
  /\ Write(c, Entry("settled"), r, waits, background \ {c}, controlled)

(* A control names an open call; a control on a call that ended is answered "ended" and writes nothing. *)
Control(c) == LET r == View(c) IN
  /\ c \in open /\ c \notin controlled
  /\ Write(c, Entry("control"), r, waits, background, controlled \cup {c})

Reconciled(c) == LET r == View(c) IN
  /\ c \in controlled
  /\ Write(c, Entry("reconciled"), r, waits, background, controlled \ {c})

(* The terminal of the Run names no call: it clears the waits, and the rule is asked again. *)
Terminal ==
  /\ alive /\ alive' = FALSE /\ waits' = {}
  /\ open' = Settle(open, records, FALSE, {}, background, controlled)
  /\ closed' = closed \cup (open \ open')
  /\ UNCHANGED <<ref, records, idx, background, controlled>>

Next == \/ \E c \in Calls : \/ Intent(c) \/ Associate(c) \/ Rebind(c) \/ Wait(c) \/ ToBackground(c)
                            \/ BackgroundSettled(c) \/ Control(c) \/ Reconciled(c)
                            \/ \E v \in Versions : Result(c, v) \/ Process(c, v) \/ Release(c, v)
        \/ Terminal

Spec == Init /\ [][Next]_vars

(* A question by key gets the record the reference has. *)
Agree == \A c \in Calls : View(c) = ref[c]

(* A call opens once. *)
OpenOnce == open \cap closed = {}

(* The snapshot holds exactly the calls the rule holds for, and a closed call is none of them:
   no fact that was taken after it closed would have kept it open. *)
OnlyOpen ==
  /\ \A c \in open : Open(c, records[c], alive, waits, background, controlled)
  /\ \A c \in closed : ~Open(c, View(c), alive, waits, background, controlled)

(* The lists that keep a call open name open calls only. *)
ListsNameOpen == (waits \cup background \cup controlled) \subseteq open

=============================================================================
